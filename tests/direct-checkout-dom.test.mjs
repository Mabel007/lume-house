import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {MemoryRouter,Routes,Route,useNavigate} from 'react-router-dom';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
for(const name of ['window','document','Element','HTMLElement','HTMLInputElement','HTMLSelectElement','sessionStorage','navigator'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
Object.defineProperty(dom.window.navigator,'locks',{configurable:true,value:{request:async(_name,_options,callback)=>callback({})}});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');const host=dom.window.document.getElementById('root');
let server,root,DirectCheckoutPage,CheckoutPage,CartProvider,useCart,ProductDetails,AuthCallback,AuthContext,CartContext,ProductContext,CurrencyProvider,NotificationProvider,intents,authReturn;
const owner='11111111-1111-4111-8111-111111111111',order='22222222-2222-4222-8222-222222222222';
const fixture={id:'fixture',name:'Fixture piece',description:'Local fixture',category:'Home',price:1800,image:'/images/mug.svg',color:'#eee',variants:[{id:'v',productId:'fixture',options:{},isDefault:true,price:1800,currency:'NLE',inventoryPolicy:'untracked'}]};
const session={access_token:'local-jwt',user:{id:owner,email:'fixture@example.invalid'}};
let authSession=session,generation=0,invocations=[],finishCalls=0,dispatchCalls=0,refreshes=0,recovery=null,behavior=null,signIns=0;
let savedBag=[{product_id:'fixture',variant_id:'v',quantity:5}],rpcCalls=[],cartSnapshot=null,lookupFailure=false,navigate;
before(async()=>{
 server=await createServer({configFile:false,envDir:false,server:{middlewareMode:true,hmr:false},plugins:[{name:'direct-dom-fixtures',enforce:'pre',load(id){
  if(id.replaceAll('\\','/').endsWith('/src/lib/supabase/client.ts'))return 'export function getSupabaseClient(){return globalThis.__directClient;}';
  if(id.replaceAll('\\','/').endsWith('/src/features/products/productRepository.ts'))return 'export async function loadProducts(){return globalThis.__freshProducts;}';
 }}]});
 ({DirectCheckoutPage}=await server.ssrLoadModule('/src/features/checkout/DirectCheckoutPage.tsx'));
 ({CheckoutPage}=await server.ssrLoadModule('/src/features/checkout/CheckoutPage.tsx'));
 ({CartProvider}=await server.ssrLoadModule('/src/features/cart/CartProvider.tsx'));
 ({useCart}=await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
 ({ProductDetails}=await server.ssrLoadModule('/src/features/products/ProductDetailsPage.tsx'));
 ({AuthCallback}=await server.ssrLoadModule('/src/features/auth/CustomerRoutes.tsx'));
 ({AuthContext}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
 ({CartContext}=await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
 ({ProductContext}=await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
 ({CurrencyProvider}=await server.ssrLoadModule('/src/features/currency/CurrencyProvider.tsx'));
 ({NotificationProvider}=await server.ssrLoadModule('/src/components/NotificationProvider.tsx'));
 intents=await server.ssrLoadModule('/src/features/checkout/directIntent.ts');
 authReturn=await server.ssrLoadModule('/src/features/auth/customerAuthIntent.ts');
});
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=null;host.replaceChildren();sessionStorage.clear();dom.window.localStorage.clear();delete globalThis.__directClient;delete globalThis.__freshProducts;authSession=session;generation=0;invocations=[];finishCalls=0;dispatchCalls=0;refreshes=0;recovery=null;behavior=null;signIns=0;savedBag=[{product_id:'fixture',variant_id:'v',quantity:5}];rpcCalls=[];cartSnapshot=null;lookupFailure=false;navigate=null;});
after(async()=>{await server.close();dom.window.close();});
function Probe(){cartSnapshot=useCart();navigate=useNavigate();return null;}
function tree(path,products=[fixture],bagStatus='error',realBag=false){
 return React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(AuthContext.Provider,{value:{loading:false,session:authSession,sessionGeneration:generation,error:null,signIn:async()=>{signIns++;},signOut:async()=>({ok:true})}},
 React.createElement(ProductContext.Provider,{value:{state:{status:'ready',products},refresh:()=>{refreshes++;}}},
 React.createElement(realBag?CartProvider:CartContext.Provider,realBag?null:{value:{items:[{productId:'fixture',variantId:'v',quantity:99}],status:bagStatus,dispatch:async()=>{dispatchCalls++;},beginCheckout:()=>{throw Error('Direct must not begin Bag checkout');},finishCheckout:()=>{finishCalls++;}}},
 React.createElement(CurrencyProvider,null,React.createElement(NotificationProvider,null,React.createElement(Probe),React.createElement(Routes,null,
 React.createElement(Route,{path:'/products/fixture',element:React.createElement(ProductDetails,{product:fixture})}),
 React.createElement(Route,{path:'/checkout/buy-now',element:React.createElement(DirectCheckoutPage)}),
 React.createElement(Route,{path:'/checkout',element:React.createElement(CheckoutPage)}),
 React.createElement(Route,{path:'/cart',element:React.createElement('p',null,'Normal Cart')}),
 React.createElement(Route,{path:'/auth/callback',element:React.createElement(AuthCallback)}),
 React.createElement(Route,{path:'/orders/:id/success',element:React.createElement('p',null,'Order placed locally')}),
 React.createElement(Route,{path:'*',element:React.createElement('p',null,'Other page')}))))))));
}
async function mount({path='/checkout/buy-now',products=[fixture],createIntent=true,realBag=false}={}){
 if(root)await act(async()=>root.unmount());
 globalThis.__freshProducts=products;
 globalThis.__directClient={auth:{getSession:async()=>({data:{session:authSession}})},rpc(name,args){rpcCalls.push({name,args});return {setHeader:async()=>({data:{id:'local-cart',items:savedBag},error:null})};},from(table){return {select(){return this;},eq(){return this;},setHeader(){return this;},maybeSingle:async()=>({data:table==='orders'?recovery:null,error:table==='orders'&&lookupFailure?{message:'temporary lookup failure'}:null})};},functions:{invoke:async(name,options)=>{invocations.push({name,options});return behavior?behavior(name,options):{data:{protocol:1,checkout_source:'direct',request_id:options.body.request_id,order:{id:order}},error:null};}}};
 if(createIntent&&!intents.parseDirectState(intents.directSnapshot()).intent)intents.startDirectIntent('fixture','v',2,authSession?.user.id??null);
 root=createRoot(host);await act(async()=>root.render(tree(path,products,'error',realBag)));
}
async function set(name,value){const node=host.querySelector(`[name="${name}"]`);assert.ok(node,name);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});}
async function select(name,value){const node=host.querySelector(`[name="${name}"]`);assert.ok(node,name);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});}
async function click(node){assert.ok(node);await act(async()=>node.click());}
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent===text);
async function fill(){await set('full-name','Local customer');await set('email','fixture@example.invalid');await set('contact-phone','76521208');await set('payment-phone','30521208');await click(host.querySelector('input[name="fulfilment"][value="pickup"]'));}
async function fillDelivery(){await set('full-name','Local customer');await set('email','fixture@example.invalid');await set('contact-phone','76521208');await set('payment-phone','30521208');await set('address','12 Test Street');await set('area','Lumley');await set('city','Freetown');await select('delivery-zone','zone-1');}
async function submit(){await act(async()=>host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));}
test('PDP Buy Now uses selected quantity despite saved Bag error and quantity 99',async()=>{
 await mount({path:'/products/fixture',createIntent:false});
 const quantity=host.querySelector('#product-quantity');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(quantity,'3');quantity.dispatchEvent(new dom.window.Event('input',{bubbles:true}));});
 assert.equal(button('Buy Now').disabled,false);await click(button('Buy Now'));
 assert.match(host.textContent,/Buy Now — only this selected piece/);assert.match(host.textContent,/Qty 3/);assert.equal(dispatchCalls,0);assert.equal(invocations.length,0);
});
test('direct shared form orders one item and never clears or mutates saved Bag',async()=>{
 await mount();await fill();await submit();
 assert.match(host.textContent,/Order placed locally/);assert.equal(invocations.length,1);assert.equal(invocations[0].name,'place-direct-order');
 assert.equal(invocations[0].options.body.quantity,2);assert.equal(invocations[0].options.body.expected_quote.unit_price,1800);
 assert.equal(finishCalls,0);assert.equal(dispatchCalls,0);assert.equal(intents.parseDirectState(intents.directSnapshot()).hold,true);
});
test('unsupported delivery country blocks Buy Now with zero calls and preserves its intent',async()=>{
 await mount();await fillDelivery();
 const input=host.querySelector('#delivery-country');
 assert.equal(input.value,'Sierra Leone');
 await set('delivery-country','Ghana');
 const ghana=[...host.querySelectorAll('#delivery-country-listbox [role="option"]')].find(node=>node.textContent==='Ghana');
 assert.ok(ghana,'Ghana is selectable');await click(ghana);
 assert.equal(input.value,'Ghana');
 assert.equal(host.querySelector('button[type="submit"]').disabled,true);
 await submit();
 assert.equal(invocations.length,0,'no direct order call begins');
 assert.equal(dispatchCalls,0,'the saved Cart is not touched');
 assert.equal(finishCalls,0);
 assert.ok(intents.parseDirectState(intents.directSnapshot()).intent,'the Buy Now intent is retained');
 assert.equal(host.querySelector('[name="full-name"]').value,'Local customer','the form draft is preserved');
 assert.ok(host.querySelector('form#checkout-form'));
 assert.match(host.textContent,/Buy Now — only this selected piece/);
 await set('delivery-country','Sierra Leone');
 const sierra=[...host.querySelectorAll('#delivery-country-listbox [role="option"]')].find(node=>node.textContent==='Sierra Leone');
 assert.ok(sierra,'Sierra Leone can be reselected');await click(sierra);
 assert.equal(host.querySelector('button[type="submit"]').disabled,false);
 await submit();
 assert.equal(invocations.length,1);
 assert.equal(invocations[0].name,'place-direct-order');
 assert.equal('country' in invocations[0].options.body.checkout,false,'the payload contract is unchanged');
 assert.equal(finishCalls,0);
});
test('uncertain response and missing lookup retain the same request across reload and retry',async()=>{
 await mount();await fill();behavior=async()=>({data:null,error:{}});await submit();
 const requestId=invocations[0].options.body.request_id;assert.match(host.textContent,/same request/);
 await click(button('Check previous order'));assert.match(host.textContent,/No completed result is visible yet/);
 await mount({createIntent:false});await fill();behavior=null;await submit();
 assert.equal(invocations[1].options.body.request_id,requestId);assert.match(host.textContent,/Order placed locally/);assert.equal(finishCalls,0);
});
test('fresh price mismatch blocks placement and asks for review',async()=>{
 await mount();await fill();globalThis.__freshProducts=[{...fixture,price:1900,variants:[{...fixture.variants[0],price:1900}]}];await submit();
 assert.equal(invocations.length,0);assert.match(host.textContent,/price or availability changed/);assert.ok(refreshes>0);
});
test('wrong account cannot render or replay another owner selection',async()=>{
 await mount();authSession={...session,user:{...session.user,id:order}};await mount({createIntent:false});
 assert.match(host.textContent,/Use the original account/);assert.equal(host.querySelector('form'),null);assert.equal(invocations.length,0);
});
test('a late response from an earlier same-owner session lifetime cannot clear recovery or navigate',async()=>{
 let resolve;
 await mount();await fill();behavior=()=>new Promise(done=>{resolve=done;});await submit();
 const request=invocations[0].options.body.request_id;
 generation++;await act(async()=>root.render(tree('/checkout/buy-now')));
 assert.equal(host.querySelector('[name="full-name"]').value,'','new lifetime clears personal form draft');
 await act(async()=>resolve({data:{protocol:1,checkout_source:'direct',request_id:request,order:{id:order}},error:null}));
 assert.doesNotMatch(host.textContent,/Order placed locally/);
 assert.ok(dom.window.localStorage.getItem(`lume-checkout-attempt-${owner}`));assert.equal(finishCalls,0);
 recovery={id:order,checkout_source:'direct',order_items:[{variant_id:'v',quantity:2}]};
 await click(button('Check previous order'));assert.match(host.textContent,/Order placed locally/);assert.equal(invocations.length,1);
});
test('guest Google sign-in prepares continuation and never places automatically',async()=>{
 authSession=null;await mount();await click(button('Sign in with Google to continue'));
 assert.equal(signIns,1);assert.equal(authReturn.consumeCustomerAuthReturn(),'/checkout/buy-now');assert.equal(invocations.length,0);
});
test('OAuth callback returns to direct review rather than Account or automatic placement',async()=>{
 intents.startDirectIntent('fixture','v',2,null);authReturn.prepareCustomerAuthReturn();
 await mount({path:'/auth/callback',createIntent:false});assert.match(host.textContent,/Buy Now — only this selected piece/);assert.equal(invocations.length,0);
});
test('canceled Google callback offers explicit review instead of an indefinite loading state',async()=>{
 authSession=null;intents.startDirectIntent('fixture','v',2,null);authReturn.prepareCustomerAuthReturn();
 await mount({path:'/auth/callback',createIntent:false});assert.match(host.textContent,/Sign-in was not completed/);
 assert.ok(host.querySelector('a[href="/checkout/buy-now"]'));assert.equal(invocations.length,0);
});
test('missing intent is explicit and unavailable selections never become Bag checkout',async()=>{
 await mount({createIntent:false});assert.match(host.textContent,/selection is unavailable/);assert.equal(host.querySelector('form'),null);
 await mount({products:[]});assert.match(host.textContent,/selected piece is unavailable/);assert.equal(invocations.length,0);assert.equal(finishCalls,0);
});
test('Cart, PDP re-entry and actual OAuth callback keep guest intent separate through refresh and success',async()=>{
 authSession=null;
 sessionStorage.setItem('lume-guest-cart',JSON.stringify([{productId:'fixture',variantId:'v',quantity:2}]));
 const original=intents.startDirectIntent('fixture','v',2,null);
 await mount({path:'/cart',createIntent:false,realBag:true});
 assert.equal(intents.parseDirectState(intents.directSnapshot()).hold,false);
 await act(async()=>navigate('/products/fixture'));await click(button('Buy Now'));
 const guest=sessionStorage.getItem('lume-guest-cart');
 assert.equal(intents.parseDirectState(intents.directSnapshot()).intent.id,original.id);
 assert.equal(intents.parseDirectState(intents.directSnapshot()).hold,true);
 await click(button('Sign in with Google to continue'));
 authSession=session;await mount({path:'/auth/callback',createIntent:false,realBag:true});
 assert.match(host.textContent,/Buy Now/);assert.equal(rpcCalls.length,0);assert.equal(invocations.length,0);
 authSession={...session,access_token:'refreshed-local-token'};
 await act(async()=>root.render(tree('/auth/callback',[{...fixture}],'error',true)));
 assert.equal(rpcCalls.length,0);assert.equal(sessionStorage.getItem('lume-guest-cart'),guest);
 await fill();await submit();assert.match(host.textContent,/Order placed locally/);
 assert.equal(rpcCalls.length,0);assert.equal(sessionStorage.getItem('lume-guest-cart'),guest);
 await act(async()=>navigate('/cart'));
 assert.ok(rpcCalls.some(call=>call.name==='load_variant_cart'));
 assert.ok(rpcCalls.some(call=>call.name==='change_variant_cart'&&call.args.p_mode==='merge'));
});
test('direct entry, trailing slashes, browser back and reload re-arm an already-bound intent',async()=>{
 for(const path of ['/checkout/buy-now/','/CHECKOUT/BUY-NOW/']){
  if(root){await act(async()=>root.unmount());root=null;}
  const intent=intents.startDirectIntent('fixture','v',2,owner);intents.resumeNormalBag();
  const beforeEntry=rpcCalls.length;
  await mount({path,createIntent:false,realBag:true});
  assert.equal(rpcCalls.length,beforeEntry);assert.equal(intents.parseDirectState(intents.directSnapshot()).hold,true);
  assert.equal(intents.parseDirectState(intents.directSnapshot()).intent.id,intent.id);
  await act(async()=>navigate('/cart'));
  assert.equal(intents.parseDirectState(intents.directSnapshot()).hold,false);
  const afterCart=rpcCalls.length;
  await act(async()=>navigate(-1));
  assert.equal(rpcCalls.length,afterCart);assert.equal(intents.parseDirectState(intents.directSnapshot()).hold,true);
  await mount({path,createIntent:false,realBag:true});
  assert.equal(rpcCalls.length,afterCart);
 }
});
test('a matching OAuth continuation guards callback restoration even if the stored hold was released',async()=>{
 sessionStorage.setItem('lume-guest-cart',JSON.stringify([{productId:'fixture',variantId:'v',quantity:2}]));
 intents.startDirectIntent('fixture','v',2,owner);authReturn.prepareCustomerAuthReturn();intents.resumeNormalBag();
 const guest=sessionStorage.getItem('lume-guest-cart');
 await mount({path:'/auth/callback/',createIntent:false,realBag:true});
 assert.match(host.textContent,/Buy Now/);assert.equal(rpcCalls.length,0);assert.equal(invocations.length,0);
 assert.equal(intents.parseDirectState(intents.directSnapshot()).hold,true);
 assert.equal(sessionStorage.getItem('lume-guest-cart'),guest);
});
test('ordinary Bag checkout can submit and recover the same request with localStorage denied',async()=>{
 const prototype=dom.window.Storage.prototype,original=prototype.getItem;
 prototype.getItem=function(key){if(this===dom.window.localStorage)throw Error('localStorage denied');return original.call(this,key);};
 try{
  await mount({path:'/checkout',createIntent:false,realBag:true});
  assert.ok(host.querySelector('form'),'normal Bag checkout remains available');
  await fill();behavior=async()=>({data:null,error:{}});await submit();
  assert.equal(invocations.length,1);assert.equal(invocations[0].name,'place-order');
  const request=invocations[0].options.body.request_id;
  await mount({path:'/checkout',createIntent:false,realBag:true});
  await fill();await submit();assert.equal(invocations[1].options.body.request_id,request);
  recovery={id:order,checkout_source:'bag',order_items:[]};
  await click(button('Check previous order'));
  assert.match(host.textContent,/Order placed locally/);assert.equal(invocations.length,2);
  assert.equal(cartSnapshot.items[0].quantity,5);
 }finally{prototype.getItem=original;}
});
test('accepted old Bag recovery releases its ticket and preserves newer visible saved items',async()=>{
 const request='33333333-3333-4333-8333-333333333333';
 dom.window.localStorage.setItem(`lume-checkout-attempt-${owner}`,JSON.stringify({version:1,source:'bag',ownerId:owner,requestId:request}));
 sessionStorage.setItem(`lume-checkout-${owner}`,request);lookupFailure=true;
 await mount({path:'/checkout',createIntent:false,realBag:true});
 assert.equal(cartSnapshot.items[0].quantity,5);await fill();
 lookupFailure=false;recovery={id:order,checkout_source:'bag',order_items:[]};await submit();
 assert.match(host.textContent,/Order placed locally/);assert.equal(invocations.length,0);
 assert.equal(cartSnapshot.items[0].quantity,5);assert.equal(cartSnapshot.status,'ready');
 assert.equal(rpcCalls.filter(call=>call.name==='load_variant_cart').length,2,'accepted recovery reconciles the saved Bag');
});
test('an accepted Bag RPC replay after an invisible recovery row never clears newer items',async()=>{
 sessionStorage.setItem(`lume-checkout-${owner}`,'33333333-3333-4333-8333-333333333333');
 await mount({path:'/checkout',createIntent:false,realBag:true});await fill();await submit();
 assert.match(host.textContent,/Order placed locally/);assert.equal(invocations.length,1);
 assert.equal(cartSnapshot.items[0].quantity,5,'accepted ID is not proof that the currently visible Bag converted');
});
test('a new Bag order reconciles the server-converted empty Bag without changing direct cleanup',async()=>{
 await mount({path:'/checkout',createIntent:false,realBag:true});await fill();
 behavior=async()=>{savedBag=[];return {data:{order:{id:order}},error:null};};await submit();
 assert.match(host.textContent,/Order placed locally/);assert.equal(invocations.length,1);
 assert.deepEqual(cartSnapshot.items,[]);assert.equal(cartSnapshot.status,'ready');
 assert.equal(rpcCalls.filter(call=>call.name==='load_variant_cart').length,2);
});
