let CurrencyProvider;
import assert from 'node:assert/strict';
import {test,before,after,afterEach} from 'node:test';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {MemoryRouter} from 'react-router-dom';
import {checkoutMessages} from '../src/features/checkout/validation.ts';

// Isolated checkout DOM evidence. Supabase is replaced at the module boundary;
// no credential, endpoint or network call is used. Delivery fees are display
// only here — trusted SQL remains authoritative.
const dom=new JSDOM('<!doctype html><html><body><div id="checkout-root"></div></body></html>',{url:'http://localhost/'});
for(const name of ['window','document','Element','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','MutationObserver','FormData','sessionStorage','localStorage','location'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
let server,root;
const host=dom.window.document.getElementById('checkout-root');
let CheckoutPage, ProductContext, CartContext, AuthContext;

// QA-FX-01 R2 locale isolation (Codex Finding 3): every checkout mount
// establishes the display currency deterministically. A stored NLE selection
// outranks host-locale detection (the localeCurrency contract), the navigator
// hands are replaced only inside the focused detection scenario, and global
// fetch is a counted deterministic FX stub so no live Frankfurter request can
// ever begin on any host.
const CURRENCY_STORAGE_KEY='lume:currency';
const nativeFetch=globalThis.fetch;
const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
before(async()=>{
  server=await createServer({configFile:false,envDir:false,server:{middlewareMode:true,hmr:false},plugins:[{name:'isolated-checkout-delivery-client',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/lib/supabase/client.ts'))return 'export function getSupabaseClient(){return globalThis.__checkoutDeliveryClient;}';}}]});
  ({ CurrencyProvider } = await server.ssrLoadModule('/src/features/currency/CurrencyProvider.tsx'));
  ({CheckoutPage}=await server.ssrLoadModule('/src/features/checkout/CheckoutPage.tsx'));
  ({ProductContext}=await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
  ({CartContext}=await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
  ({AuthContext}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
});
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=undefined;host.replaceChildren();delete globalThis.__checkoutDeliveryClient;dom.window.sessionStorage.clear();dom.window.localStorage.clear();globalThis.fetch=nativeFetch;if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;});
after(async()=>{await server.close();dom.window.close();});

const session={access_token:'synthetic-jwt',user:{id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid'}};
const fixture={id:'fixture-product',name:'Fixture mug',description:'Fixture description',category:'Fixture category',price:1800,image:'/images/mug.svg',color:'#e9e3d8'};
const noop=()=>{};

function fakeClient(invoke){return {
  auth:{getSession:async()=>({data:{session}})},
  from(){return {select(){return this;},eq(){return this;},setHeader(){return this;},maybeSingle:async()=>({data:null,error:null})};},
  functions:{invoke:invoke??(async()=>({data:null,error:null}))},
};}

async function mount({authSession=null,cartStatus='ready',items=[{productId:fixture.id,quantity:2}],products=[fixture],client,refreshProducts=noop,retryCart=noop,beginCheckout=()=>1,finishCheckout=noop,currencyPreference='NLE'}={}){
  globalThis.__checkoutDeliveryClient=client??fakeClient();
  if(root){await act(async()=>root.unmount());root=undefined;host.replaceChildren();}
  // Deterministic display currency for every scenario except the focused
  // host-locale regression: the host locale can never decide this suite.
  if(currencyPreference===null)dom.window.localStorage.removeItem(CURRENCY_STORAGE_KEY);
  else dom.window.localStorage.setItem(CURRENCY_STORAGE_KEY,currencyPreference);
  root=createRoot(host);
  await act(async()=>renderCurrency(
    React.createElement(MemoryRouter,null,
      React.createElement(AuthContext.Provider,{value:{loading:false,session:authSession,error:null,signIn:async()=>{},signOut:async()=>{}}},
        React.createElement(ProductContext.Provider,{value:{state:{status:'ready',products},refresh:refreshProducts}},
          React.createElement(CartContext.Provider,{value:{items,dispatch:noop,status:cartStatus,retry:retryCart,beginCheckout,finishCheckout}},
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
async function fillRequired(){
  await setValue(host.querySelector('[name="full-name"]'),'Fixture Customer');
  await setValue(host.querySelector('[name="email"]'),'fixture@example.invalid');
  await setValue(host.querySelector('[name="address"]'),'12 Test Street');
  await setValue(host.querySelector('[name="area"]'),'Lumley');
  await setValue(cityField(),'Freetown');
  await selectZone('zone-3');
}
const countryInput=()=>host.querySelector('#delivery-country');
const countryList=()=>host.querySelector('#delivery-country-listbox');
const countryOptions=()=>Array.from(host.querySelectorAll('#delivery-country-listbox [role="option"]'));
const optionNames=()=>countryOptions().map(node=>node.textContent);
const activeOption=()=>{const id=countryInput()?.getAttribute('aria-activedescendant');return id?dom.window.document.getElementById(id):null;};
async function focusCountry(){const input=countryInput();assert.ok(input);await act(async()=>input.focus());}
async function focusOutside(){const node=host.querySelector('[name="full-name"]');assert.ok(node);await act(async()=>node.focus());}
async function pointer(node,type,init={}){assert.ok(node);await act(async()=>{const event=new dom.window.Event(type,{bubbles:true,cancelable:true});for(const [key,value] of Object.entries(init))Object.defineProperty(event,key,{value});node.dispatchEvent(event);});}
async function pressKey(node,key){assert.ok(node);await act(async()=>node.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})));}
async function chooseCountry(name){
  const input=countryInput();assert.ok(input);
  await setValue(input,name);
  const option=countryOptions().find(node=>node.textContent===name);
  assert.ok(option,`${name} option is visible`);
  await pointer(option,'pointerdown');
  await pointer(option,'pointerup');
  await act(async()=>option.click());
}

test('delivery eligibility explains the Freetown limitation, lists active zones and shows NLE fee and totals', async()=>{
  await mount({authSession:session});
  assert.match(host.textContent,/We currently deliver within Freetown only\./);
  assert.match(host.textContent,/Delivery in Freetown, Sierra Leone\. Choose the zone that best matches your address\./);
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
  assert.equal(cityField().getAttribute('aria-invalid'),'true','an unsupported city warns before blur');
  assert.match(cityField().getAttribute('aria-describedby'),/city-error/);
  assert.equal(host.querySelector('#city-error').textContent,checkoutMessages.unsupportedCity);
  const note=host.querySelector('#delivery-unavailable-note');
  assert.ok(note,'the unsupported-city explanation appears promptly');
  assert.match(note.textContent,/Place Order stays unavailable while the delivery city is outside our delivered areas in Freetown\./);
  assert.match(button().getAttribute('aria-describedby'),/delivery-unavailable-note/);
  assert.equal(button().disabled,true);
  await blur(cityField());
  assert.equal(host.querySelector('#city-error').textContent,checkoutMessages.unsupportedCity);
  assert.equal(button().disabled,true);
  await setValue(cityField(),' Freetown ');
  await blur(cityField());
  await selectZone('zone-2');
  assert.equal(cityField().getAttribute('aria-invalid'),null);
  assert.equal(host.querySelector('#delivery-unavailable-note'),null,'the explanation disappears for a supported delivery city');
  assert.doesNotMatch(host.textContent,/Delivery to this location isn't available yet/);
  assert.match(host.textContent,/Lumley to Congo Cross, including Aberdeen\. Delivery: NLE 50\./);
  assert.deepEqual(totals(),['NLE 36','NLE 50','NLE 86']);
  assert.equal(button().disabled,false);
  assert.match(button().textContent,/Place order/);
});

test('country selector defaults to Sierra Leone and exposes the complete standardized country list', async()=>{
  await mount({authSession:session});
  const input=countryInput();
  assert.ok(input,'the delivery country combobox is shown for delivery');
  assert.equal(input.value,'Sierra Leone');
  assert.equal(input.getAttribute('role'),'combobox');
  assert.equal(input.getAttribute('aria-expanded'),'false');
  assert.equal(input.getAttribute('aria-autocomplete'),'list');
  assert.equal(input.getAttribute('aria-haspopup'),'listbox');
  assert.equal(input.getAttribute('aria-controls'),'delivery-country-listbox');
  assert.equal(input.getAttribute('aria-required'),'true');
  assert.equal(input.getAttribute('autocomplete'),'country-name');
  assert.equal(host.querySelector('label[for="delivery-country"]').textContent,'Delivery country *');
  assert.equal(input.getAttribute('aria-describedby'),'delivery-country-help');
  assert.equal(host.querySelector('#delivery-country-help').textContent,'We currently deliver within Freetown, Sierra Leone only.');
  const list=countryList();
  assert.ok(list);
  assert.equal(list.getAttribute('role'),'listbox');
  assert.equal(list.getAttribute('aria-label'),'Delivery country options');
  assert.equal(list.hidden,true);
  const live=host.querySelector('#delivery-country-status');
  assert.equal(live.getAttribute('role'),'status');
  assert.equal(live.getAttribute('aria-live'),'polite');
  await focusCountry();
  assert.equal(input.getAttribute('aria-expanded'),'true');
  assert.equal(list.hidden,false);
  assert.equal(countryOptions().length,249,'the complete ISO 3166-1 list is available');
  for(const name of ['Ghana','Nigeria','Guinea','Liberia'])
    assert.ok(optionNames().includes(name),`${name} is listed`);
  assert.equal(activeOption()?.textContent,'Sierra Leone','the committed country starts active');
  assert.match(live.textContent,/249 countries available\./);
});

test('typing filters country names and never commits arbitrary text', async()=>{
  await mount({authSession:session});
  const input=countryInput();
  await focusCountry();
  await setValue(input,'ghana');
  assert.equal(input.value,'ghana');
  assert.equal(input.getAttribute('aria-expanded'),'true');
  assert.deepEqual(optionNames(),['Ghana']);
  assert.equal(activeOption()?.textContent,'Ghana');
  assert.equal(host.querySelector('#delivery-country-status').textContent,'1 country available.');
  assert.equal(invalidAttr('delivery-country'),null,'uncommitted text is not yet an invalid selection');
  assert.equal(errorText('delivery-country-error')||null,null);
  assert.equal(button().disabled,true,'an uncommitted country leaves delivery unpriced');
  await setValue(input,'cote');
  assert.deepEqual(optionNames(),["Côte d'Ivoire"],'diacritics are ignored while searching');
  await setValue(input,'ni');
  assert.deepEqual(optionNames().slice(0,4),['Nicaragua','Niger','Nigeria','Niue'],'prefix matches are offered before other name matches');
  await setValue(input,'zzzz');
  assert.deepEqual(optionNames(),[]);
  assert.ok(host.querySelector('.country-empty'),'an empty result is explained visibly');
  assert.match(host.querySelector('#delivery-country-status').textContent,/No countries match your search\./);
  await focusOutside();
  assert.equal(input.value,'Sierra Leone','focus departure restores the last valid selection');
  assert.equal(input.getAttribute('aria-expanded'),'false');
  assert.equal(countryList().hidden,true);
  assert.equal(errorText('delivery-country-error')||null,null);
});

test('country aliases search canonical labels and commit the canonical country', async()=>{
  await mount({authSession:session});
  const input=countryInput();
  await focusCountry();
  const aliases=[
    ['UK','United Kingdom of Great Britain and Northern Ireland'],
    ['USA','United States of America'],
    ['Turkey','Türkiye'],
    ['South Korea','Korea, Republic of'],
    ['North Korea',"Korea, Democratic People's Republic of"],
    ['Vietnam','Viet Nam'],
    ['Ivory Coast',"Côte d'Ivoire"],
  ];
  for(const [query,name] of aliases){
    await setValue(input,query);
    assert.equal(optionNames()[0],name,`${query} finds ${name}`);
  }
  await setValue(input,'UK');
  assert.deepEqual(optionNames().slice(0,2),['United Kingdom of Great Britain and Northern Ireland','Ukraine'],'the UK alias outranks Ukraine');
  await pressKey(input,'Enter');
  assert.equal(input.value,'United Kingdom of Great Britain and Northern Ireland');
  assert.equal(errorText('delivery-country-error'),checkoutMessages.unsupportedCountry,'the canonical country reaches delivery validation');
  await setValue(input,'Sierra Leone');
  await pressKey(input,'Enter');
  assert.equal(input.value,'Sierra Leone');
  assert.equal(errorText('delivery-country-error')||null,null);
});

test('mouse and touch selection commit listed countries and explain unsupported delivery immediately', async()=>{
  await mount({authSession:session});
  const input=countryInput();
  await chooseCountry('Ghana');
  assert.equal(input.value,'Ghana');
  assert.equal(input.getAttribute('aria-expanded'),'false');
  assert.equal(invalidAttr('delivery-country'),'true');
  assert.equal(errorText('delivery-country-error'),checkoutMessages.unsupportedCountry);
  assert.match(describedBy('delivery-country'),/delivery-country-help/);
  assert.match(describedBy('delivery-country'),/delivery-country-error/);
  assert.deepEqual(totals(),['NLE 36','Unavailable','Delivery unavailable']);
  assert.equal(button().disabled,true);
  assert.match(button().getAttribute('aria-describedby'),/delivery-country-error/);
  assert.match(button().getAttribute('aria-describedby'),/checkout-payment/);
  await chooseCountry('Liberia');
  assert.equal(input.value,'Liberia','pointer/touch-generated clicks select only listed countries');
  assert.equal(errorText('delivery-country-error'),checkoutMessages.unsupportedCountry);
});

test('keyboard navigation selects listed countries and Escape restores the committed selection', async()=>{
  await mount({authSession:session});
  const input=countryInput();
  await act(async()=>input.focus());
  await setValue(input,'guinea');
  assert.deepEqual(optionNames(),['Guinea','Guinea-Bissau','Equatorial Guinea','Papua New Guinea']);
  assert.equal(activeOption()?.textContent,'Guinea');
  await pressKey(input,'ArrowDown');
  assert.equal(activeOption()?.textContent,'Guinea-Bissau');
  assert.equal(input.getAttribute('aria-activedescendant'),'delivery-country-listbox-option-1');
  await pressKey(input,'ArrowUp');
  assert.equal(activeOption()?.textContent,'Guinea');
  await pressKey(input,'Enter');
  assert.equal(input.value,'Guinea');
  assert.equal(input.getAttribute('aria-expanded'),'false');
  assert.equal(countryList().hidden,true);
  assert.equal(errorText('delivery-country-error'),checkoutMessages.unsupportedCountry);
  await setValue(input,'Ghana');
  assert.deepEqual(optionNames(),['Ghana']);
  await pressKey(input,'Escape');
  assert.equal(input.value,'Guinea','Escape restores the last valid country rather than typed text');
  assert.equal(input.getAttribute('aria-expanded'),'false');
  assert.equal(countryList().hidden,true);
  assert.equal(errorText('delivery-country-error'),checkoutMessages.unsupportedCountry);
});

test('a cancelled option pointer gesture cannot keep the list open after focus leaves', async()=>{
  await mount({authSession:session});
  const input=countryInput();
  await focusCountry();
  await setValue(input,'Ghana');
  const option=countryOptions().find(node=>node.textContent==='Ghana');
  assert.ok(option);
  await pointer(option,'pointerdown');
  await pointer(option,'pointercancel');
  assert.equal(input.getAttribute('aria-expanded'),'true','cancellation alone does not close a focused list');
  await act(async()=>option.click());
  assert.equal(input.value,'Ghana','a click after cancellation does not commit the option');
  assert.equal(errorText('delivery-country-error')||null,null);
  await focusOutside();
  assert.equal(input.getAttribute('aria-expanded'),'false','focus departure dismisses the list');
  assert.equal(countryList().hidden,true);
  assert.equal(input.value,'Sierra Leone','the committed selection is restored');
  assert.equal(errorText('delivery-country-error')||null,null);
  await focusCountry();
  assert.equal(input.getAttribute('aria-expanded'),'true','the list reopens after cancellation');
  await chooseCountry('Ghana');
  assert.equal(input.value,'Ghana');
  assert.equal(input.getAttribute('aria-expanded'),'false');
  assert.equal(errorText('delivery-country-error'),checkoutMessages.unsupportedCountry);
});

test('a cancelled option gesture that follows focus departure leaves the popup closed and the country unchanged', async()=>{
  await mount({authSession:session});
  const input=countryInput();
  await focusCountry();
  await setValue(input,'Ghana');
  const option=countryOptions().find(node=>node.textContent==='Ghana');
  assert.ok(option);
  await pointer(option,'pointerdown');
  await act(async()=>{
    host.querySelector('[name="full-name"]').focus();
    option.dispatchEvent(new dom.window.Event('pointercancel',{bubbles:true,cancelable:true}));
  });
  assert.equal(input.getAttribute('aria-expanded'),'false','cancellation completes the dismissal');
  assert.equal(countryList().hidden,true);
  assert.equal(input.value,'Sierra Leone','the cancellation does not commit Ghana');
  assert.equal(errorText('delivery-country-error')||null,null);
});

test('a released option commits even when blur arrives before the click', async()=>{
  await mount({authSession:session});
  const input=countryInput();
  await focusCountry();
  await setValue(input,'Ghana');
  let option=countryOptions().find(node=>node.textContent==='Ghana');
  assert.ok(option);
  await pointer(option,'pointerdown');
  await pointer(option,'pointerup');
  await act(async()=>{
    host.querySelector('[name="full-name"]').focus();
    option.click();
  });
  assert.equal(input.value,'Ghana','the released option is not discarded by blur');
  assert.equal(input.getAttribute('aria-expanded'),'false');
  assert.equal(countryList().hidden,true);
  assert.equal(errorText('delivery-country-error'),checkoutMessages.unsupportedCountry);
  await focusCountry();
  await setValue(input,'Liberia');
  option=countryOptions().find(node=>node.textContent==='Liberia');
  assert.ok(option);
  await pointer(option,'pointerdown');
  await pointer(option,'pointerup');
  await focusOutside();
  assert.equal(input.value,'Liberia','blur settles the released option before a later click');
  assert.equal(input.getAttribute('aria-expanded'),'false');
  await act(async()=>option.click());
  assert.equal(input.value,'Liberia');
  assert.equal(input.getAttribute('aria-expanded'),'false');
  assert.equal(errorText('delivery-country-error'),checkoutMessages.unsupportedCountry);
});

test('ordinary mouse and touch-emulated gestures commit only the released country', async()=>{
  await mount({authSession:session});
  const input=countryInput();
  await focusCountry();
  await setValue(input,'Ghana');
  let option=countryOptions().find(node=>node.textContent==='Ghana');
  assert.ok(option);
  await pointer(option,'pointerdown',{pointerType:'mouse',pointerId:1});
  await pointer(option,'pointerup',{pointerType:'mouse',pointerId:1});
  await act(async()=>option.click());
  assert.equal(input.value,'Ghana');
  assert.equal(input.getAttribute('aria-expanded'),'false');
  assert.equal(countryList().hidden,true);
  await focusCountry();
  await setValue(input,'Liberia');
  option=countryOptions().find(node=>node.textContent==='Liberia');
  assert.ok(option);
  await pointer(option,'pointerdown',{pointerType:'touch',pointerId:2});
  await pointer(option,'pointerup',{pointerType:'touch',pointerId:2});
  await act(async()=>option.click());
  assert.equal(input.value,'Liberia','the touch-emulated release commits its option');
  assert.equal(input.getAttribute('aria-expanded'),'false');
  assert.equal(countryList().hidden,true);
  assert.equal(errorText('delivery-country-error'),checkoutMessages.unsupportedCountry);
});

test('scrolling the list cancels a pending option gesture without committing', async()=>{
  await mount({authSession:session});
  const input=countryInput();
  await focusCountry();
  await setValue(input,'Ghana');
  const option=countryOptions().find(node=>node.textContent==='Ghana');
  assert.ok(option);
  await pointer(option,'pointerdown',{pointerType:'touch',pointerId:3});
  await act(async()=>countryList().dispatchEvent(new dom.window.Event('scroll',{bubbles:false})));
  await pointer(option,'pointerup',{pointerType:'touch',pointerId:3});
  await act(async()=>option.click());
  assert.equal(input.value,'Ghana','scrolling does not silently commit the touched option');
  assert.equal(input.getAttribute('aria-expanded'),'true','the list remains open after scrolling');
  assert.equal(countryList().hidden,false);
  assert.equal(errorText('delivery-country-error')||null,null);
  await focusOutside();
  assert.equal(input.value,'Sierra Leone');
  assert.equal(input.getAttribute('aria-expanded'),'false');
});

test('unsupported delivery country blocks placement before any order call, keeps the form and Cart, and restores on correction', async()=>{
  const calls=[];
  let begun=0,finished=0;
  const client=fakeClient(async(name,options)=>{calls.push({name,options});return {data:null,error:{context:new Response(JSON.stringify({error:'INVALID_DELIVERY_ZONE'}),{status:400,headers:{'Content-Type':'application/json'}})}};});
  await mount({authSession:session,client,beginCheckout:()=>{begun+=1;return 1;},finishCheckout:()=>{finished+=1;}});
  await fillRequired();
  await fillValidPhones();
  await chooseCountry('Ghana');
  assert.equal(button().disabled,true);
  await submit();
  assert.equal(calls.length,0,'no order-service call begins');
  assert.equal(begun,0,'the saved Cart is not converted');
  assert.equal(finished,0);
  assert.equal(dom.window.document.activeElement.id,'delivery-country','the first country problem receives focus');
  assert.equal(errorText('delivery-country-error'),checkoutMessages.unsupportedCountry);
  assert.equal(invalidAttr('delivery-country'),'true');
  assert.match(describedBy('delivery-country'),/delivery-country-help/);
  assert.match(describedBy('delivery-country'),/delivery-country-error/);
  assert.equal(host.querySelector('[name="full-name"]').value,'Fixture Customer','the checkout form is preserved');
  assert.equal(host.querySelector('[name="address"]').value,'12 Test Street');
  assert.equal(cityField().value,'Freetown');
  assert.equal(host.querySelector('#delivery-zone').value,'zone-3');
  assert.match(host.textContent,/Qty 2/,'the Cart contents remain visible');
  assert.match(button().getAttribute('aria-describedby'),/delivery-country-error/,'the blocked action points to the country explanation');
  await pressKey(countryInput(),'Escape');
  assert.equal(countryInput().value,'Ghana','Escape dismisses the list without discarding a committed country');
  await setValue(countryInput(),'Sierra Leone');
  await pressKey(countryInput(),'Enter');
  assert.equal(countryInput().value,'Sierra Leone');
  assert.equal(errorText('delivery-country-error')||null,null);
  assert.deepEqual(totals(),['NLE 36','NLE 60','NLE 96']);
  assert.equal(button().disabled,false);
  await submit();
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'place-order');
  assert.equal(calls[0].options.body.checkout.city,'Freetown');
  assert.equal(calls[0].options.body.checkout.zone_id,'zone-3');
  assert.equal(calls[0].options.body.checkout.country_code,'SL','delivery submits the canonical country');
  assert.equal('country' in calls[0].options.body.checkout,false,'no competing country alias is submitted');
  assert.equal('country_code' in calls[0].options.body,false,'the country stays inside the checkout object');
  assert.equal('protocol' in calls[0].options.body,false,'the Cart request envelope is unchanged');
  assert.ok(calls[0].options.body.request_id,'the Cart request keeps its owner-scoped idempotency id');
  assert.equal(begun,1,'the Cart ticket is only begun after country eligibility passes');
});

test('pickup removes delivery requirements with a zero fee and switching back restores them', async()=>{
  await mount({authSession:session});
  assert.equal(countryInput().value,'Sierra Leone');
  await chooseRadio('fulfilment','pickup');
  assert.match(host.textContent,/Pickup in Lumley, Freetown\. No delivery fee\./);
  assert.deepEqual(totals(),['NLE 36','NLE 0','NLE 36']);
  assert.equal(host.querySelector('[name="city"]'),null);
  assert.equal(host.querySelector('#delivery-zone'),null);
  assert.equal(host.querySelector('#delivery-country'),null,'pickup does not require a delivery country');
  assert.equal(button().disabled,false);
  await chooseRadio('fulfilment','delivery');
  assert.match(host.textContent,/We currently deliver within Freetown only\./);
  assert.equal(countryInput().value,'Sierra Leone','the previous country selection is preserved');
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

test('Place order stays disabled while Cart changes are saving', async()=>{
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
  await fillRequired();
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

test('a definite country rejection gives actionable guidance without an automatic retry', async()=>{
  const calls=[];
  const client=fakeClient(async(name,options)=>{calls.push({name,options});return {data:null,error:{context:new Response(JSON.stringify({error:'INVALID_DELIVERY_COUNTRY',outcome:'rejected'}),{status:400,headers:{'Content-Type':'application/json'}})}};});
  await mount({authSession:session,client});
  await fillRequired();
  await fillValidPhones();
  await submit();
  assert.equal(calls.length,1,'one explicit placement attempt');
  assert.ok(alertTexts().includes(checkoutMessages.unsupportedCountry),'the country rejection is explained with actionable guidance');
  assert.doesNotMatch(alertTexts().join(' '),/could not confirm|try again|same request/i,'a definite rejection is not presented as a transient outage');
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(calls.length,1,'a definite rejection never retries automatically');
  assert.ok(host.querySelector('form#checkout-form'),'the form remains available for an explicit correction');
  assert.equal(button().disabled,false,'the customer can correct the country and submit again');
  const attemptKey=`lume-checkout-attempt-${session.user.id}`;
  const retained=JSON.parse(dom.window.localStorage.getItem(attemptKey));
  assert.equal(retained.requestId,calls[0].options.body.request_id,'the pending request ID is retained after a definite rejection');
  assert.equal(calls[0].options.body.checkout.country_code,'SL','the Cart country contract is unchanged');
  assert.equal('country_code' in calls[0].options.body,false,'the country remains inside the checkout object');
  const checkPrevious=Array.from(host.querySelectorAll('button')).find(node=>node.textContent==='Check previous order');
  assert.ok(checkPrevious,'the retained request exposes recovery controls');
  await toggle(checkPrevious);
  assert.match(host.textContent,/No completed result is visible yet/);
  assert.equal(calls.length,1,'checking recovery does not place another order');
  assert.equal(JSON.parse(dom.window.localStorage.getItem(attemptKey)).requestId,retained.requestId,'the same request remains recoverable');
});

test('a changed-price rejection refreshes the Cart and requires an explicit second submit with the same request id', async()=>{
  const calls=[]; let refreshes=0, retries=0;
  const client=fakeClient(async(name,options)=>{calls.push({name,options});return {data:null,error:{context:new Response(JSON.stringify({error:'CART_CHANGED'}),{status:409,headers:{'Content-Type':'application/json'}})}};});
  await mount({authSession:session,client,refreshProducts:()=>{refreshes+=1;},retryCart:()=>{retries+=1;}});
  await fillRequired();
  await setValue(host.querySelector('[name="contact-phone"]'),'76521208');
  await toggle(host.querySelector('#reuse-phone'));
  await submit();
  assert.equal(calls.length,1,'one placement attempt');
  assert.match(alertTexts().join(' '),/Your Cart or current prices changed\. Review the refreshed Cart before placing your order\./);
  assert.equal(refreshes,1,'current catalogue prices are re-read');
  assert.equal(retries,1,'the saved Cart is re-read');
  assert.equal(button().disabled,false,'the customer can review and submit again');
  assert.equal(calls[0].options.body.expected_cart[0].unit_price,1800,'the displayed unit price is still submitted for server comparison');
  const requestId=calls[0].options.body.request_id;
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(calls.length,1,'a rejected price change never resubmits automatically');
  await submit();
  assert.equal(calls.length,2,'a second explicit submit is required and allowed');
  assert.equal(calls[1].options.body.request_id,requestId,'the retry keeps the owner-scoped idempotency key');
  assert.doesNotMatch(host.textContent,/payment successful|order confirmed/i);
});

test('contact phone exposes network-neutral help, a telephone keypad and field-associated validation', async()=>{
  await mount({authSession:session});
  const contact=host.querySelector('[name="contact-phone"]');
  assert.equal(contact.getAttribute('type'),'tel');
  assert.equal(contact.getAttribute('inputmode'),'tel');
  assert.equal(contact.getAttribute('autocomplete'),'tel');
  assert.equal(contact.getAttribute('aria-describedby'),'contact-phone-help');
  assert.match(host.textContent,/Enter an 8-digit Sierra Leone phone number\./);
  const formatTrigger=Array.from(host.querySelectorAll('.help-disclosure-trigger')).find(node=>/Number format help/.test(node.textContent));
  assert.ok(formatTrigger,'the concise phone hint links to a fuller format disclosure');
  assert.equal(formatTrigger.getAttribute('aria-expanded'),'false');
  assert.equal(formatTrigger.getAttribute('aria-controls'),'phone-format-panel','the collapsed disclosure references its stable panel');
  const collapsedFormatPanel=host.querySelector('#phone-format-panel');
  assert.ok(collapsedFormatPanel,'the panel stays mounted while collapsed');
  assert.equal(collapsedFormatPanel.hidden,true,'the collapsed panel is hidden');
  await toggle(formatTrigger);
  assert.equal(formatTrigger.getAttribute('aria-expanded'),'true');
  assert.equal(formatTrigger.getAttribute('aria-controls'),'phone-format-panel','the open disclosure keeps the same reference');
  const formatPanel=host.querySelector('#phone-format-panel');
  assert.ok(formatPanel);
  assert.equal(formatPanel.hidden,false,'the open panel is exposed');
  assert.match(formatPanel.textContent,/leading 0 or \+232/);
  assert.match(formatPanel.textContent,/Example: 0XX XXX XXX\./);
  assert.match(formatPanel.textContent,/spaces and dashes are removed automatically/);
  await toggle(formatTrigger);
  assert.equal(formatTrigger.getAttribute('aria-expanded'),'false');
  assert.equal(host.querySelector('#phone-format-panel').hidden,true,'closing hides the same panel');
  assert.equal(formatTrigger.getAttribute('aria-controls'),'phone-format-panel','closing keeps the stable reference');
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

test('payment guidance stays concise and network-neutral with telephone keypads on contact and payment', async()=>{
  const calls=[];
  await mount({authSession:session,client:fakeClient(async(name,options)=>{calls.push({name,options});return {data:null,error:{context:new Response(JSON.stringify({error:'INVALID_DELIVERY_ZONE'}),{status:400,headers:{'Content-Type':'application/json'}})}};})});
  assert.equal(host.querySelector('#payment-phone').getAttribute('type'),'tel');
  assert.equal(host.querySelector('#payment-phone').getAttribute('inputmode'),'tel');
  assert.match(host.textContent,/8-digit Sierra Leone mobile-money number\./);
  assert.doesNotMatch(host.textContent,/Any Sierra Leone mobile network is accepted/);
  const detailsTrigger=Array.from(host.querySelectorAll('.help-disclosure-trigger')).find(node=>/Payment number details/.test(node.textContent));
  assert.ok(detailsTrigger);
  assert.equal(detailsTrigger.getAttribute('aria-controls'),'payment-details-panel','the collapsed disclosure references its stable panel');
  const collapsedDetails=host.querySelector('#payment-details-panel');
  assert.ok(collapsedDetails,'the payment panel stays mounted while collapsed');
  assert.equal(collapsedDetails.hidden,true);
  await toggle(detailsTrigger);
  assert.equal(detailsTrigger.getAttribute('aria-controls'),'payment-details-panel','the open disclosure keeps the same reference');
  const details=host.querySelector('#payment-details-panel');
  assert.ok(details);
  assert.equal(details.hidden,false);
  assert.match(details.textContent,/does not verify registration with the selected provider/);
  assert.match(details.textContent,/follows your contact number/);
  assert.match(details.textContent,/restores your separately entered payment number/);
  const providers=[...host.querySelectorAll('input[name="payment-provider"]')];
  assert.deepEqual(providers.map(input=>input.value),['orange','afri'],'payment radios expose explicit provider values');
  assert.deepEqual(providers.map(input=>input.checked),[true,false],'Orange Money remains the default provider');
  await fillRequired();
  await setValue(host.querySelector('[name="contact-phone"]'),'088 790011');
  await toggle(host.querySelector('#reuse-phone'));
  await submit();
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'place-order');
  assert.equal(calls[0].options.body.checkout.contact_phone,'+23288790011');
  assert.equal(calls[0].options.body.checkout.payment_phone,'+23288790011');
  assert.match(alertTexts().join(' '),/Please check your contact, payment and Freetown delivery details\./);
});

test('labelled "Use my contact number": reuse syncs read-only and untoggling restores the separate payer number', async()=>{
  const {calls,client}=recordingClient();
  await mount({authSession:session,client});
  const reuseLabel=host.querySelector('label[for="reuse-phone"]');
  assert.match(reuseLabel.textContent,/Use my contact number/);
  assert.doesNotMatch(reuseLabel.textContent,/Use my contact phone number/);
  const payment=host.querySelector('#payment-phone');
  await setValue(host.querySelector('[name="contact-phone"]'),'088 790011');
  await setValue(payment,'077 123 456');
  await toggle(host.querySelector('#reuse-phone'));
  assert.ok(payment.hasAttribute('readonly'),'the payer number is read-only while it follows the contact number');
  assert.equal(payment.value,'088 790011','the payer number syncs to the contact number');
  await toggle(host.querySelector('#reuse-phone'));
  assert.equal(payment.hasAttribute('readonly'),false);
  assert.equal(payment.value,'077 123 456','the separately entered payer number is restored rather than overwritten');
  assert.equal(calls.length,0,'the checkbox transition alone places no order');
});

test('an invalid contact number with reuse selected is announced on the payer field and blocks placement', async()=>{
  const {calls,client}=recordingClient();
  await mount({authSession:session,client});
  await fillRequired();
  await setValue(host.querySelector('[name="contact-phone"]'),'not a phone');
  await toggle(host.querySelector('#reuse-phone'));
  assert.equal(errorText('payment-error'),'Enter a valid 8-digit Sierra Leone phone number.');
  assert.match(host.querySelector('#payment-phone').getAttribute('aria-describedby'),/payment-error/);
  await submit();
  assert.equal(calls.length,0);
  assert.match(alertTexts().join(' '),/Enter valid 8-digit Sierra Leone contact and payment numbers\./);
  assert.equal(dom.window.document.activeElement.getAttribute('name'),'contact-phone');
});

const errorText=id=>host.querySelector(`#${id}`)?.textContent??null;
const describedBy=name=>host.querySelector(`[name="${name}"]`)?.getAttribute('aria-describedby');
const invalidAttr=name=>host.querySelector(`[name="${name}"]`)?.getAttribute('aria-invalid');
const fieldErrorId=name=>name==='delivery-zone'?'delivery-zone-error':`${name}-error`;

function recordingClient(result){
  const calls=[];
  return {calls,client:fakeClient(async(name,options)=>{calls.push({name,options});
    return result?result():{data:null,error:{context:new Response(JSON.stringify({error:'INVALID_DELIVERY_DETAILS'}),{status:400,headers:{'Content-Type':'application/json'}})}};})};
}
async function fillValidPhones(){
  await setValue(host.querySelector('[name="contact-phone"]'),'076521208');
  await toggle(host.querySelector('#reuse-phone'));
}

test('a blank checkout submit is blocked with field-associated errors and focuses the first field', async()=>{
  const {calls,client}=recordingClient();
  await mount({authSession:session,client});
  assert.equal(host.querySelector('form#checkout-form').noValidate,true);
  await setValue(host.querySelector('[name="email"]'),'');
  await submit();
  assert.equal(calls.length,0);
  assert.equal(errorText('full-name-error'),'Enter your full name.');
  assert.equal(errorText('email-error'),'Enter your email address.');
  assert.equal(errorText('address-error'),'Enter your street address or landmark.');
  assert.equal(errorText('area-error'),'Enter your area or community.');
  assert.equal(errorText('city-error'),'Enter your city or town.');
  assert.equal(errorText('delivery-zone-error'),'Choose your delivery zone.');
  assert.equal(errorText('contact-phone-error'),'Enter your phone number.');
  assert.equal(errorText('payment-error'),'Enter your mobile-money number.');
  for(const name of ['full-name','email','address','area','city','contact-phone','payment-phone','delivery-zone'])
    assert.equal(invalidAttr(name),'true',`${name} is flagged invalid`);
  assert.match(describedBy('full-name'),/full-name-error/);
  assert.match(describedBy('city'),/city-error/);
  assert.match(describedBy('delivery-zone'),/delivery-zone-error/);
  assert.match(alertTexts().join(' '),/Please check your contact and delivery details before placing your order\./);
  assert.equal(dom.window.document.activeElement.getAttribute('name'),'full-name');
});

test('each required field omitted on its own blocks placement and names the field', async()=>{
  const cases=[
    ['full-name','Enter your full name.'],
    ['contact-phone','Enter your phone number.'],
    ['email','Enter your email address.'],
    ['address','Enter your street address or landmark.'],
    ['area','Enter your area or community.'],
    ['city','Enter your city or town.'],
    ['delivery-zone','Choose your delivery zone.'],
  ];
  for(const [name,message] of cases){
    const {calls,client}=recordingClient();
    await mount({authSession:session,client});
    await fillRequired();
    await fillValidPhones();
    if(name==='delivery-zone')await selectZone('');
    else await setValue(host.querySelector(`[name="${name}"]`),'');
    await submit();
    assert.equal(calls.length,0,`${name} must block placement`);
    assert.equal(errorText(fieldErrorId(name)),message,`${name} message`);
    assert.equal(dom.window.document.activeElement.getAttribute('name'),name,`${name} receives focus`);
  }
});

test('pristine fields stay quiet until blur, then show Lumé copy and clear on correction', async()=>{
  await mount({authSession:session});
  for(const id of ['full-name-error','email-error','address-error','area-error','city-error','delivery-zone-error','contact-phone-error'])
    assert.equal(errorText(id),null,`${id} starts quiet`);
  assert.equal(errorText('payment-error') || null,null,'payment-error starts quiet');
  assert.equal(host.querySelector('#delivery-unavailable-note'),null,'an empty untouched city shows no unsupported-city explanation');
  const name=host.querySelector('[name="full-name"]');
  await blur(name);
  assert.equal(errorText('full-name-error'),'Enter your full name.');
  assert.equal(name.getAttribute('aria-invalid'),'true');
  await setValue(name,'Fixture Customer');
  assert.equal(errorText('full-name-error'),null);
  assert.equal(name.getAttribute('aria-invalid'),null);
  const email=host.querySelector('[name="email"]');
  await setValue(email,'');
  await blur(email);
  assert.equal(errorText('email-error'),'Enter your email address.');
  await setValue(email,'not-an-email');
  assert.equal(errorText('email-error'),'Enter a valid email address.');
  await setValue(email,'fixture@example.invalid');
  assert.equal(errorText('email-error'),null);
  const address=host.querySelector('[name="address"]');
  await blur(address);
  assert.equal(errorText('address-error'),'Enter your street address or landmark.');
  const area=host.querySelector('[name="area"]');
  await blur(area);
  assert.equal(errorText('area-error'),'Enter your area or community.');
  await blur(host.querySelector('[name="contact-phone"]'));
  assert.equal(errorText('contact-phone-error'),'Enter your phone number.');
  await blur(host.querySelector('[name="payment-phone"]'));
  assert.equal(errorText('payment-error'),'Enter your mobile-money number.');
  await blur(host.querySelector('#delivery-zone'));
  assert.equal(errorText('delivery-zone-error'),'Choose your delivery zone.');
});

test('contact and mobile-money phones normalize on blur before submission', async()=>{
  await mount({authSession:session});
  const contact=host.querySelector('[name="contact-phone"]');
  await setValue(contact,'088 790011');
  await blur(contact);
  assert.equal(contact.value,'+23288790011');
  const payment=host.querySelector('#payment-phone');
  await setValue(payment,'077 123 456');
  await blur(payment);
  assert.equal(payment.value,'+23277123456');
  assert.equal(errorText('contact-phone-error'),null);
  assert.equal(errorText('payment-error') || null,null);
});

test('whitespace-only name, address, area and city are rejected before placement and clear on correction', async()=>{
  const {calls,client}=recordingClient();
  await mount({authSession:session,client});
  await fillRequired();
  await fillValidPhones();
  await setValue(host.querySelector('[name="full-name"]'),'   ');
  await setValue(host.querySelector('[name="address"]'),'   ');
  await setValue(host.querySelector('[name="area"]'),'   ');
  await setValue(cityField(),'   ');
  await submit();
  assert.equal(calls.length,0);
  assert.equal(errorText('full-name-error'),'Enter your full name.');
  assert.equal(errorText('address-error'),'Enter your street address or landmark.');
  assert.equal(errorText('area-error'),'Enter your area or community.');
  assert.equal(errorText('city-error'),'Enter your city or town.');
  assert.equal(dom.window.document.activeElement.getAttribute('name'),'full-name');
  await setValue(host.querySelector('[name="full-name"]'),'Fixture Customer');
  assert.equal(errorText('full-name-error'),null);
});

test('an invalid email format is rejected with a field-associated message', async()=>{
  const {calls,client}=recordingClient();
  await mount({authSession:session,client});
  await fillRequired();
  await fillValidPhones();
  await setValue(host.querySelector('[name="email"]'),'not-an-email');
  await submit();
  assert.equal(calls.length,0);
  assert.equal(errorText('email-error'),'Enter a valid email address.');
  assert.equal(invalidAttr('email'),'true');
  assert.match(describedBy('email'),/email-error/);
  assert.equal(dom.window.document.activeElement.getAttribute('name'),'email');
});

test('unsupported city and missing zone get accurate field-associated messages', async()=>{
  const city=recordingClient();
  await mount({authSession:session,client:city.client});
  await fillRequired();
  await fillValidPhones();
  await setValue(cityField(),'Bo');
  await submit();
  assert.equal(city.calls.length,0);
  assert.equal(errorText('city-error'),checkoutMessages.unsupportedCity);
  assert.equal(invalidAttr('city'),'true');
  assert.equal(errorText('delivery-zone-error'),null);

  const zone=recordingClient();
  await mount({authSession:session,client:zone.client});
  await fillRequired();
  await fillValidPhones();
  await selectZone('');
  await submit();
  assert.equal(zone.calls.length,0);
  assert.equal(errorText('delivery-zone-error'),'Choose your delivery zone.');
  assert.equal(invalidAttr('delivery-zone'),'true');
  assert.equal(describedBy('delivery-zone'),'zone-help delivery-zone-error');
  assert.equal(errorText('city-error'),null);
});

test('pickup does not require delivery-only fields and still places the order', async()=>{
  const {calls,client}=recordingClient();
  await mount({authSession:session,client});
  await chooseCountry('Ghana');
  assert.equal(button().disabled,true,'unsupported delivery blocks while delivery is selected');
  await setValue(host.querySelector('[name="full-name"]'),'Fixture Customer');
  await setValue(host.querySelector('[name="email"]'),'fixture@example.invalid');
  await fillValidPhones();
  await chooseRadio('fulfilment','pickup');
  assert.equal(host.querySelector('[name="city"]'),null);
  assert.equal(host.querySelector('#delivery-zone'),null);
  assert.equal(host.querySelector('#delivery-country'),null);
  assert.equal(button().disabled,false,'pickup remains available after an unsupported delivery country');
  await chooseRadio('fulfilment','delivery');
  assert.equal(countryInput().value,'Ghana','pickup does not overwrite the saved delivery-country preference');
  assert.equal(button().disabled,true,'the unsupported delivery country still blocks delivery');
  await chooseRadio('fulfilment','pickup');
  await submit();
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'place-order');
  assert.equal(calls[0].options.body.checkout.fulfilment,'pickup');
  assert.equal(calls[0].options.body.checkout.zone_id,'');
  assert.equal(calls[0].options.body.checkout.country_code,'SL','pickup submits the canonical Lumley country');
  assert.equal('country' in calls[0].options.body.checkout,false);
});

test('a pasted formatted phone number places once, and a corrected form resubmits cleanly', async()=>{
  const {calls,client}=recordingClient();
  await mount({authSession:session,client});
  await setValue(host.querySelector('[name="email"]'),'');
  await submit();
  assert.equal(calls.length,0);
  assert.equal(errorText('full-name-error'),'Enter your full name.');
  await fillRequired();
  await setValue(host.querySelector('[name="contact-phone"]'),'(+232) 76-521208');
  await toggle(host.querySelector('#reuse-phone'));
  assert.equal(errorText('full-name-error'),null);
  await submit();
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'place-order');
  assert.equal(calls[0].options.body.checkout.contact_phone,'+23276521208');
  assert.equal(calls[0].options.body.checkout.payment_phone,'+23276521208');
});

test('a repeated submit while placement is in flight does not place a second order', async()=>{
  let resolveInvoke;
  const calls=[];
  const client=fakeClient((name,options)=>{calls.push({name,options});return new Promise(resolve=>{resolveInvoke=resolve;});});
  await mount({authSession:session,client});
  await fillRequired();
  await fillValidPhones();
  await submit();
  assert.equal(calls.length,1);
  await submit();
  assert.equal(calls.length,1);
  await act(async()=>resolveInvoke({data:null,error:null}));
});

function renderCurrency(element) { root.render(React.createElement(CurrencyProvider, null, element)); }
