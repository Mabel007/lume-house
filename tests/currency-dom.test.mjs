import assert from 'node:assert/strict';
import { test, before, after, afterEach } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Synthetic local sessions/read client only; no hosted writes or credentials.
const dom = new JSDOM('<!doctype html><div id="root"></div>', {url:'http://localhost/'});
for (const name of ['window','document','HTMLElement','Element','HTMLInputElement','HTMLSelectElement','FormData','localStorage','sessionStorage']) Object.defineProperty(globalThis, name, {configurable:true, value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const host = dom.window.document.getElementById('root');
const nativeFetch = globalThis.fetch;
let server, root, CurrencyProvider, CurrencySelector, CurrencyDisclosure, ProductContext, CartContext, AuthContext, NotificationProvider, ShopPage, ProductDetailsPage, CartPage, CheckoutPage, OrderSummary, currency;
const product = {id:'fixture-mug',name:'Fixture mug',description:'Local test',category:'Ceramics',price:1800,image:'/images/mug.svg',color:'#e9e3d8',variants:[{id:'v-mug',productId:'fixture-mug',options:{},isDefault:true,price:1800,currency:'NLE',inventoryPolicy:'untracked'}]};
const second = {...product,id:'fixture-vase',name:'Fixture vase',price:2500,variants:[{...product.variants[0],id:'v-vase',productId:'fixture-vase',price:2500}]};
const session = {access_token:'synthetic',user:{id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid'}};
const rows = (patch = {}) => ['GNF','GHS','NGN','USD'].map((quote,i) => ({base:'SLE',date:new Date().toISOString().slice(0,10),quote,rate:[552.74,.73113,83.54,.06266][i],...patch}));
let calls = 0;
before(async () => {
  server = await createServer({configFile:false,envDir:false,server:{middlewareMode:true,hmr:false},plugins:[{name:'currency-local-client',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/lib/supabase/client.ts')) return 'export function getSupabaseClient(){return globalThis.__currencyClient;}';}}]});
  ({CurrencyProvider} = await server.ssrLoadModule('/src/features/currency/CurrencyProvider.tsx'));
  ({CurrencySelector,CurrencyDisclosure} = await server.ssrLoadModule('/src/features/currency/CurrencySelector.tsx'));
  currency = await server.ssrLoadModule('/src/features/currency/currency.ts');
  ({ProductContext} = await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
  ({CartContext} = await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
  ({AuthContext} = await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({NotificationProvider} = await server.ssrLoadModule('/src/components/NotificationProvider.tsx'));
  ({ShopPage} = await server.ssrLoadModule('/src/features/products/ShopPage.tsx'));
  ({ProductDetailsPage} = await server.ssrLoadModule('/src/features/products/ProductDetailsPage.tsx'));
  ({CartPage} = await server.ssrLoadModule('/src/features/cart/CartPage.tsx'));
  ({CheckoutPage} = await server.ssrLoadModule('/src/features/checkout/CheckoutPage.tsx'));
  ({OrderSummary} = await server.ssrLoadModule('/src/features/checkout/OrderSummary.tsx'));
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = undefined; host.replaceChildren(); currency.clearRatesCache(); localStorage.clear();
  globalThis.fetch = nativeFetch; delete globalThis.__currencyClient; calls = 0;
});
after(async () => {await server.close(); dom.window.close();});
const flush = async () => { await act(async () => {await new Promise(resolve => setImmediate(resolve));}); };
function serve(body = rows(), status = 200) { globalThis.fetch = async () => {calls++; return new Response(JSON.stringify(body),{status});}; }
async function mount(path = '/', extra, strict = false) {
  globalThis.__currencyClient = {from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{full_name:'Fixture Customer',phone:'+23276521208',default_street_address:'12 Fixture Street',default_area:'Lumley',default_city:'Freetown'},error:null})};},functions:{invoke(){throw Error('Currency tests forbid hosted writes');}}};
  const element = React.createElement(MemoryRouter,{initialEntries:[path]},
    React.createElement(AuthContext.Provider,{value:{session,loading:false,error:null}},
      React.createElement(ProductContext.Provider,{value:{state:{status:'ready',products:[product,second]},refresh(){}}},
        React.createElement(CartContext.Provider,{value:{items:[{productId:product.id,variantId:'v-mug',quantity:2}],status:'ready',dispatch(){},beginCheckout:()=>1,finishCheckout(){}}},
          React.createElement(CurrencyProvider,null,
            React.createElement(NotificationProvider,null,
              React.createElement(CurrencySelector), React.createElement(CurrencyDisclosure),
              extra || React.createElement(Routes,null,
                React.createElement(Route,{path:'/',element:React.createElement(ShopPage)}),
                React.createElement(Route,{path:'/products/:productId',element:React.createElement(ProductDetailsPage)}),
                React.createElement(Route,{path:'/cart',element:React.createElement(CartPage)}),
                React.createElement(Route,{path:'/checkout',element:React.createElement(CheckoutPage)}))))))));
  root = createRoot(host);
  await act(async () => root.render(strict ? React.createElement(React.StrictMode,null,element) : element));
  await flush();
}
async function select(code) {
  await act(async () => {const control=host.querySelector('select[aria-label="Display currency"]');control.value=code;control.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  await flush();
}
const estimates = () => [...host.querySelectorAll('.currency-estimate')].map(e=>e.textContent);

test('entrypoint retains ordered providers around Layout and every routed consumer', () => {
  const source = ts.createSourceFile('main.tsx',readFileSync('src/main.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const layouts = [];
  function visit(node, ancestors = []) {
    if (ts.isJsxElement(node)) { const tag=node.openingElement.tagName.getText(source); ts.forEachChild(node.openingElement,child=>visit(child,ancestors)); for (const child of node.children) visit(child,[...ancestors,tag]); return; }
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source)==='Layout') layouts.push(ancestors);
    ts.forEachChild(node,child=>visit(child,ancestors));
  }
  visit(source);
  assert.equal(layouts.length,1);
  assert.deepEqual(layouts[0].slice(-5),['AuthProvider','ProductProvider','CartProvider','CurrencyProvider','NotificationProvider']);
});

test('Shop shares live selection across multiple prices and returns immediately to NLE', async () => {
  serve(); await mount(); assert.equal(calls,0); assert.deepEqual(estimates(),[]);
  for (const code of ['GNF','GHS','NGN','USD']) {
    await select(code); assert.equal(estimates().length,2); assert.ok(estimates().every(value=>value.includes(code)));
    assert.match(host.textContent,/NLE 18/); assert.match(host.textContent,/NLE 25/);
  }
  assert.equal(calls,1); await select('NLE'); assert.deepEqual(estimates(),[]);
});

for (const path of ['/products/fixture-mug','/cart','/checkout']) test(`${path} displays secondary estimates without changing NLE prices`,async()=>{
  serve();await mount(path);await select('USD');assert.ok(estimates().length>0);assert.ok(estimates().every(value=>value.includes('USD')));assert.match(host.textContent,/NLE (18|36)/);await select('NLE');assert.deepEqual(estimates(),[]);
});

test('preference survives provider remount; cached rate timestamp is preserved',async()=>{
  serve();await mount();await select('USD');const stored=localStorage.getItem(currency.RATES_STORAGE_KEY);await act(async()=>root.unmount());await mount();assert.equal(host.querySelector('select').value,'USD');assert.equal(estimates().length,2);assert.equal(calls,1);assert.equal(localStorage.getItem(currency.RATES_STORAGE_KEY),stored);
});

test('one concise disclosure identifies provider, reference date, informational estimates and NLE settlement',async()=>{
  serve();await mount();await select('USD');const notice=host.querySelector('#currency-disclosure');assert.match(notice.textContent,/Informational estimates from Frankfurter/);assert.match(notice.textContent,/Checkout and payment amounts remain in NLE/);assert.equal(notice.querySelector('time').dateTime,rows()[0].date);assert.equal(host.querySelectorAll('#currency-disclosure').length,1);assert.equal(host.querySelector('select').getAttribute('aria-describedby'),'currency-disclosure');
});

for (const kind of ['wrong-base','stale','future','missing','error']) test(`${kind} rates settle into NLE-only fallback without request loops`,async()=>{
  const body=kind==='wrong-base'?rows({base:'USD'}):kind==='stale'?rows({date:'2000-01-01'}):kind==='future'?rows({date:'2999-01-01'}):kind==='missing'?rows().slice(1):rows();
  serve(body,kind==='error'?503:200);localStorage.setItem(currency.CURRENCY_STORAGE_KEY,'USD');await mount();for(let i=0;i<6;i++)await flush();assert.equal(calls,1);assert.deepEqual(estimates(),[]);assert.match(host.textContent,/NLE 18/);assert.match(host.textContent,/unavailable/);await select('NLE');await select('USD');assert.equal(calls,1);
});

test('StrictMode joins a pending initial request and renders estimates once it resolves',async()=>{
  let finish;globalThis.fetch=()=>{calls++;return new Promise(resolve=>finish=resolve);};localStorage.setItem(currency.CURRENCY_STORAGE_KEY,'USD');await mount('/',undefined,true);assert.equal(calls,1);await act(async()=>finish(new Response(JSON.stringify(rows()))));assert.equal(estimates().length,2);
});

test('open tab expires at original cache TTL, hides estimates, and revalidates at most every fifteen minutes',async t=>{
  const now=Date.now();t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now});
  localStorage.setItem(currency.CURRENCY_STORAGE_KEY,'USD');localStorage.setItem(currency.RATES_STORAGE_KEY,JSON.stringify({storedAt:now-currency.RATES_TTL_MS+1000,payload:{base:'SLE',date:rows()[0].date,rates:{GNF:1,GHS:1,NGN:1,USD:1}}}));serve([],503);await mount();assert.equal(calls,0);assert.equal(estimates().length,2);
  await act(async()=>t.mock.timers.tick(1000));assert.deepEqual(estimates(),[]);assert.equal(calls,0);
  await act(async()=>t.mock.timers.tick(15*60*1000));await flush();assert.equal(calls,1);assert.deepEqual(estimates(),[]);t.mock.timers.reset();
});

test('conversion overflow omits estimates without crashing the customer page',async()=>{
  serve(rows({rate:Number.MAX_VALUE}));await mount();await select('USD');assert.deepEqual(estimates(),[]);assert.match(host.textContent,/NLE 18/);assert.equal(host.querySelectorAll('h1').length,1);
});

test('slow FX never blocks shopping or switching back to NLE',async()=>{
  let finish;globalThis.fetch=()=>{calls++;return new Promise(resolve=>finish=resolve);};await mount();await select('USD');assert.match(host.textContent,/NLE 18/);assert.ok(host.querySelector('button[aria-label="Add Fixture mug to Cart"]'));await select('NLE');assert.deepEqual(estimates(),[]);await act(async()=>finish(new Response(JSON.stringify(rows()))));assert.deepEqual(estimates(),[]);await select('USD');assert.equal(estimates().length,2);assert.equal(calls,1);
});

test('checkout estimates follow zone/pickup totals while payment remains awaiting confirmation',async()=>{
  serve();await mount('/checkout');await select('USD');await act(async()=>{const zone=host.querySelector('#delivery-zone');zone.value='zone-2';zone.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});assert.match(host.querySelector('.totals .total dd').textContent,/^NLE 86/);assert.match(host.textContent,/does not charge or verify/);assert.ok(host.querySelector('.totals .total .currency-estimate'));
  await act(async()=>host.querySelector('input[name="fulfilment"][value="pickup"]').click());assert.match(host.querySelector('.totals .total dd').textContent,/^NLE 36/);assert.match(host.textContent,/Lumley, Freetown/);
});

test('historical OrderSummary remains NLE-only even with USD selected',async()=>{
  serve();await mount('/',React.createElement(OrderSummary,{subtotal:3600,deliveryFee:5000}));await select('USD');assert.deepEqual(estimates(),[]);assert.match(host.querySelector('.totals .total dd').textContent,/^NLE 86$/);
});
