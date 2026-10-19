import assert from 'node:assert/strict';
import {test,before,after,afterEach} from 'node:test';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {MemoryRouter} from 'react-router-dom';

// Isolated checkout DOM evidence. Supabase is replaced at the module boundary;
// no credential, endpoint or network call is used. Delivery fees are display
// only here — trusted SQL remains authoritative.
const dom=new JSDOM('<!doctype html><html><body><div id="checkout-root"></div></body></html>',{url:'http://localhost/'});
for(const name of ['window','document','Element','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','MutationObserver','FormData','sessionStorage','location'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
let server,root;
const host=dom.window.document.getElementById('checkout-root');
let CheckoutPage, ProductContext, CartContext, AuthContext;

before(async()=>{
  server=await createServer({configFile:false,envDir:false,server:{middlewareMode:true,hmr:false},plugins:[{name:'isolated-checkout-delivery-client',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/lib/supabase/client.ts'))return 'export function getSupabaseClient(){return globalThis.__checkoutDeliveryClient;}';}}]});
  ({CheckoutPage}=await server.ssrLoadModule('/src/features/checkout/CheckoutPage.tsx'));
  ({ProductContext}=await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
  ({CartContext}=await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
  ({AuthContext}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
});
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=undefined;host.replaceChildren();delete globalThis.__checkoutDeliveryClient;dom.window.sessionStorage.clear();});
after(async()=>{await server.close();dom.window.close();});

const session={access_token:'synthetic-jwt',user:{id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid'}};
const fixture={id:'fixture-product',name:'Fixture mug',description:'Fixture description',category:'Fixture category',price:1800,image:'/images/mug.svg',color:'#e9e3d8'};
const noop=()=>{};

function fakeClient(invoke){return {
  auth:{getSession:async()=>({data:{session}})},
  from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null})};},
  functions:{invoke:invoke??(async()=>({data:null,error:null}))},
};}

async function mount({authSession=null,cartStatus='ready',items=[{productId:fixture.id,quantity:2}],products=[fixture],client}={}){
  globalThis.__checkoutDeliveryClient=client??fakeClient();
  if(root){await act(async()=>root.unmount());root=undefined;host.replaceChildren();}
  root=createRoot(host);
  await act(async()=>root.render(
    React.createElement(MemoryRouter,null,
      React.createElement(AuthContext.Provider,{value:{loading:false,session:authSession,error:null,signIn:async()=>{},signOut:async()=>{}}},
        React.createElement(ProductContext.Provider,{value:{state:{status:'ready',products},refresh(){}}},
          React.createElement(CartContext.Provider,{value:{items,dispatch:noop,status:cartStatus,retry:noop,beginCheckout:()=>1,finishCheckout:noop}},
            React.createElement(CheckoutPage)))))));
}

const cityField=()=>host.querySelector('[name="city"]');
const button=()=>host.querySelector('button[type="submit"]');
const totals=()=>Array.from(host.querySelectorAll('.totals dd')).map(node=>node.textContent);
const alertTexts=()=>Array.from(host.querySelectorAll('[role="alert"]')).map(node=>node.textContent);

async function setValue(node,value){assert.ok(node);await act(async()=>{const prototype=node instanceof dom.window.HTMLTextAreaElement?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});}
async function selectZone(value){const node=host.querySelector('#delivery-zone');assert.ok(node);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});}
async function chooseRadio(name,value){const node=host.querySelector(`input[name="${name}"][value="${value}"]`);assert.ok(node);await act(async()=>node.click());}
async function toggle(node){assert.ok(node);await act(async()=>node.click());}
async function blur(node){assert.ok(node);await act(async()=>node.dispatchEvent(new dom.window.FocusEvent('focusout',{bubbles:true})));}
async function submit(){const form=host.querySelector('form');assert.ok(form);await act(async()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));}

test('delivery eligibility explains the Freetown limitation, lists active zones and shows NLE fee and totals', async()=>{
  await mount({authSession:session});
  assert.match(host.textContent,/We currently deliver within Freetown only\./);
  assert.match(host.textContent,/Delivery in Freetown\. Choose the zone that best matches your address\./);
  assert.equal(cityField().getAttribute('aria-describedby'),'delivery-city-help');
  assert.equal(cityField().getAttribute('list'),'delivery-city-options');
  assert.ok(host.querySelector('datalist#delivery-city-options option[value="Freetown"]'));
  const options=Array.from(host.querySelectorAll('#delivery-zone option')).map(option=>option.textContent);
  assert.equal(options[0],'Choose your delivery zone');
  assert.ok(options.includes('Goderich to Lumley — NLE 40'));
  assert.ok(options.includes('Lumley to Congo Cross, including Aberdeen — NLE 50'));
  assert.ok(options.includes('Congo Cross to Central Freetown — NLE 60'));
  assert.equal(options.length,4);
  assert.deepEqual(totals(),['NLE 36','Choose at checkout','Delivery details needed']);
  assert.equal(button().disabled,true);
  await setValue(cityField(),'Bo');
  await blur(cityField());
  assert.equal(cityField().getAttribute('aria-invalid'),'true');
  assert.ok(alertTexts().includes('Delivery is currently limited to Freetown.'));
  assert.equal(button().disabled,true);
  await setValue(cityField(),' Freetown ');
  await blur(cityField());
  await selectZone('zone-2');
  assert.equal(cityField().getAttribute('aria-invalid'),null);
  assert.doesNotMatch(host.textContent,/Delivery is currently limited to Freetown/);
  assert.match(host.textContent,/Lumley to Congo Cross, including Aberdeen\. Delivery: NLE 50\./);
  assert.deepEqual(totals(),['NLE 36','NLE 50','NLE 86']);
  assert.equal(button().disabled,false);
  assert.match(button().textContent,/Place order/);
});

test('pickup removes delivery requirements with a zero fee and switching back restores them', async()=>{
  await mount({authSession:session});
  await chooseRadio('fulfilment','pickup');
  assert.match(host.textContent,/Pickup in Lumley, Freetown\. No delivery fee\./);
  assert.deepEqual(totals(),['NLE 36','NLE 0','NLE 36']);
  assert.equal(host.querySelector('[name="city"]'),null);
  assert.equal(host.querySelector('#delivery-zone'),null);
  assert.equal(button().disabled,false);
  await chooseRadio('fulfilment','delivery');
  assert.match(host.textContent,/We currently deliver within Freetown only\./);
  assert.deepEqual(totals(),['NLE 36','Choose at checkout','Delivery details needed']);
  assert.equal(button().disabled,true);
});

test('a guest is offered an actionable Account sign-in link instead of an inert Place order button', async()=>{
  await mount({authSession:null});
  assert.equal(button(),null);
  const link=host.querySelector('a[href="/account"]');
  assert.ok(link);
  assert.match(link.textContent,/Sign in to place your order/);
  assert.match(host.textContent,/An account is required before you can place your order\./);
});

test('Place order stays disabled while Bag changes are saving', async()=>{
  await mount({authSession:session,cartStatus:'saving'});
  assert.match(button().textContent,/Place order/);
  await setValue(cityField(),'Freetown');
  await selectZone('zone-1');
  assert.deepEqual(totals(),['NLE 36','NLE 40','NLE 76']);
  assert.equal(button().disabled,true);
});

test('invalid trusted delivery responses surface safe guidance and never claim payment success', async()=>{
  const calls=[];
  await mount({authSession:session,client:fakeClient(async(name,options)=>{calls.push({name,options});return {data:null,error:{context:new Response(JSON.stringify({error:'INVALID_DELIVERY_ZONE'}),{status:400,headers:{'Content-Type':'application/json'}})}};})});
  await setValue(cityField(),'Freetown');
  await selectZone('zone-3');
  await setValue(host.querySelector('[name="contact-phone"]'),'76521208');
  await toggle(host.querySelector('#reuse-phone'));
  await submit();
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'place-order');
  assert.match(alertTexts().join(' '),/Please check your contact, payment and Freetown delivery details\./);
  assert.doesNotMatch(host.textContent,/payment successful|order confirmed/i);
  assert.ok(host.querySelector('form#checkout-form'));
  assert.equal(button().disabled,false);
});

test('contact phone exposes network-neutral help, a telephone keypad and field-associated validation', async()=>{
  await mount({authSession:session});
  const contact=host.querySelector('[name="contact-phone"]');
  assert.equal(contact.getAttribute('type'),'tel');
  assert.equal(contact.getAttribute('inputmode'),'tel');
  assert.equal(contact.getAttribute('autocomplete'),'tel');
  assert.equal(contact.getAttribute('aria-describedby'),'contact-phone-help');
  assert.match(host.textContent,/Enter an 8-digit Sierra Leone phone number, with or without 0 or \+232\. Example: 0XX XXX XXX\./);
  await setValue(contact,'not a phone');
  assert.equal(host.querySelector('#contact-phone-error'),null);
  await blur(contact);
  assert.equal(contact.getAttribute('aria-invalid'),'true');
  const described=contact.getAttribute('aria-describedby');
  assert.match(described,/contact-phone-help/);
  assert.match(described,/contact-phone-error/);
  const error=host.querySelector('#contact-phone-error');
  assert.ok(error);
  assert.equal(error.textContent,'Enter a valid 8-digit Sierra Leone phone number.');
  assert.doesNotMatch(error.textContent,/Orange|\+232\d/i);
  await setValue(contact,'088 790011');
  await blur(contact);
  assert.equal(host.querySelector('#contact-phone-error'),null);
  assert.equal(contact.getAttribute('aria-invalid'),null);
});

test('any Sierra Leone network is accepted at placement with telephone keypads on contact and payment', async()=>{
  const calls=[];
  await mount({authSession:session,client:fakeClient(async(name,options)=>{calls.push({name,options});return {data:null,error:{context:new Response(JSON.stringify({error:'INVALID_DELIVERY_ZONE'}),{status:400,headers:{'Content-Type':'application/json'}})}};})});
  assert.equal(host.querySelector('#payment-phone').getAttribute('type'),'tel');
  assert.equal(host.querySelector('#payment-phone').getAttribute('inputmode'),'tel');
  assert.match(host.textContent,/Any Sierra Leone mobile network is accepted\./);
  await setValue(cityField(),'Freetown');
  await selectZone('zone-3');
  await setValue(host.querySelector('[name="contact-phone"]'),'088 790011');
  await toggle(host.querySelector('#reuse-phone'));
  await submit();
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'place-order');
  assert.equal(calls[0].options.body.checkout.contact_phone,'+23288790011');
  assert.equal(calls[0].options.body.checkout.payment_phone,'+23288790011');
  assert.match(alertTexts().join(' '),/Please check your contact, payment and Freetown delivery details\./);
});
