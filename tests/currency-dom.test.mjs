import assert from 'node:assert/strict';
import { test, before, after, afterEach, mock } from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from './helpers/vite.mjs';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Revised D1: Manual currency selection removed; locale detection drives automatic estimates.
// Synthetic local sessions/read client only; no hosted writes or credentials.
const dom = new JSDOM('<!doctype html><div id="root"></div>', {url:'http://localhost/'});
for (const name of ['window','document','HTMLElement','Element','HTMLInputElement','HTMLSelectElement','FormData','localStorage','sessionStorage']) Object.defineProperty(globalThis, name, {configurable:true, value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const host = dom.window.document.getElementById('root');
const nativeFetch = globalThis.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
let server, root, CurrencyProvider, ProductContext, CartContext, AuthContext, NotificationProvider, ShopPage, ProductDetailsPage, CartPage, CheckoutPage, OrderSummary, currency;
const product = {id:'fixture-mug',name:'Fixture mug',description:'Local test',category:'Ceramics',price:1800,image:'/images/mug.svg',color:'#e9e3d8',variants:[{id:'v-mug',productId:'fixture-mug',options:{},isDefault:true,price:1800,currency:'NLE',inventoryPolicy:'untracked'}]};
const second = {...product,id:'fixture-vase',name:'Fixture vase',price:2500,variants:[{...product.variants[0],id:'v-vase',productId:'fixture-vase',price:2500}]};
const session = {access_token:'synthetic',user:{id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid'}};
const rows = (patch = {}) => ['GNF','GHS','NGN','USD'].map((quote,i) => ({base:'SLE',date:new Date().toISOString().slice(0,10),quote,rate:[552.74,.73113,83.54,.06266][i],...patch}));
let calls = 0;
before(async () => {
  server = await createServer({configFile:false,envDir:false,server:{middlewareMode:true,hmr:false},plugins:[{name:'currency-local-client',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/lib/supabase/client.ts')) return 'export function getSupabaseClient(){return globalThis.__currencyClient;}';}}]});
  ({CurrencyProvider} = await server.ssrLoadModule('/src/features/currency/CurrencyProvider.tsx'));
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
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
});
after(async () => {await server?.close(); dom.window.close();});
const flush = async () => { await act(async () => {await new Promise(resolve => setImmediate(resolve));}); };
function serve(body = rows(), status = 200) { globalThis.fetch = async () => {calls++; return new Response(JSON.stringify(body),{status});}; }
async function mount(path = '/', locale = 'en-US', extra, strict = false) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: [locale] } });
  globalThis.__currencyClient = {from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{full_name:'Fixture Customer',phone:'+23276521208',default_street_address:'12 Fixture Street',default_area:'Lumley',default_city:'Freetown'},error:null})};},functions:{invoke(){throw Error('Currency tests forbid hosted writes');}}};
  const element = React.createElement(MemoryRouter,{initialEntries:[path]},
    React.createElement(AuthContext.Provider,{value:{session,loading:false,error:null}},
      React.createElement(ProductContext.Provider,{value:{state:{status:'ready',products:[product,second]},refresh(){}}},
        React.createElement(CartContext.Provider,{value:{items:[{productId:product.id,variantId:'v-mug',quantity:2}],status:'ready',dispatch(){},beginCheckout:()=>1,finishCheckout(){}}},
          React.createElement(CurrencyProvider,null,
            React.createElement(NotificationProvider,null,
              extra || React.createElement(Routes,null,
                React.createElement(Route,{path:'/',element:React.createElement(ShopPage)}),
                React.createElement(Route,{path:'/products/:productId',element:React.createElement(ProductDetailsPage)}),
                React.createElement(Route,{path:'/cart',element:React.createElement(CartPage)}),
                React.createElement(Route,{path:'/checkout',element:React.createElement(CheckoutPage)}))))))));
  root = createRoot(host);
  await act(async () => root.render(strict ? React.createElement(React.StrictMode,null,element) : element));
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

test('Shop displays estimates for foreign locale and NLE for home locale', async () => {
  serve();
  await mount('/', 'en-US');
  assert.equal(calls, 1, 'USD locale requests rates');
  assert.equal(estimates().length, 2, 'estimates shown for both products');
  assert.ok(estimates().every(value => value.includes('USD')), 'all estimates in USD');
  assert.match(host.textContent, /NLE 18/, 'NLE prices still displayed');
  assert.match(host.textContent, /NLE 25/, 'NLE prices for second product');
  assert.equal(host.querySelectorAll('select[aria-label="Display currency"]').length, 0, 'no manual selector');
});

for (const path of ['/products/fixture-mug','/cart','/checkout']) test(`${path} displays secondary estimates without changing NLE prices`,async()=>{
  serve();
  await mount(path, 'en-US');
  assert.ok(estimates().length>0);
  assert.ok(estimates().every(value=>value.includes('USD')));
  assert.match(host.textContent,/NLE (18|36)/);
  assert.equal(host.querySelectorAll('select[aria-label="Display currency"]').length, 0, 'no manual currency selector');
});

for (const kind of ['wrong-base','stale','future','missing']) test(`${kind} rates settle into NLE-only fallback without request loops`,async()=>{
  const body=kind==='wrong-base'?rows({base:'USD'}):kind==='stale'?rows({date:'2000-01-01'}):kind==='future'?rows({date:'2999-01-01'}):rows().slice(1);
  serve(body,200);
  await mount('/', 'en-US');
  for(let i=0;i<6;i++)await flush();
  assert.equal(calls,1);
  assert.deepEqual(estimates(),[], 'no estimates for invalid rates');
  assert.match(host.textContent,/NLE 18/);
});

test('error rates settle into NLE-only fallback without request loops',async()=>{
  serve(rows(),503);
  await mount('/', 'en-US');
  for(let i=0;i<6;i++)await flush();
  assert.equal(calls,1);
  assert.deepEqual(estimates(),[]);
  assert.match(host.textContent,/NLE 18/);
});

test('StrictMode joins a pending initial request and renders estimates once it resolves',async()=>{
  let finish;
  globalThis.fetch=()=>{calls++;return new Promise(resolve=>finish=resolve);};
  await mount('/', 'en-US', undefined, true);
  assert.equal(calls,1);
  await act(async()=>finish(new Response(JSON.stringify(rows()))));
  assert.equal(estimates().length,2);
});

test('conversion overflow omits estimates without crashing the customer page',async()=>{
  serve(rows({rate:Number.MAX_VALUE}));
  await mount('/', 'en-US');
  assert.deepEqual(estimates(),[]);
  assert.match(host.textContent,/NLE 18/);
  assert.equal(host.querySelectorAll('h1').length,1);
});

test('checkout estimates follow zone/pickup totals while payment remains awaiting confirmation',async()=>{
  serve();
  await mount('/checkout', 'en-US');
  await act(async()=>{const zone=host.querySelector('#delivery-zone');zone.value='zone-2';zone.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  assert.match(host.querySelector('.totals .total dd').textContent,/^NLE 86/);
  assert.match(host.textContent,/does not charge or verify/);
  assert.ok(host.querySelector('.totals .total .currency-estimate'));
  await act(async()=>host.querySelector('input[name="fulfilment"][value="pickup"]').click());
  assert.match(host.querySelector('.totals .total dd').textContent,/^NLE 36/);
  assert.match(host.textContent,/Lumley, Freetown/);
});

test('historical OrderSummary remains NLE-only regardless of locale',async()=>{
  serve();
  await mount('/', 'en-US', React.createElement(OrderSummary,{subtotal:3600,deliveryFee:5000}));
  assert.deepEqual(estimates(),[]);
  assert.match(host.querySelector('.totals .total dd').textContent,/^NLE 86$/);
});

test('a fresh provider remount hydrates the FX cache without changing its original timestamp',async()=>{
  mock.timers.enable({apis:['Date'],now:new Date('2026-11-04T12:00:00Z')});
  try {
    serve();await mount('/');for(let i=0;i<4;i++)await flush();assert.ok(estimates().length);
    const cached=localStorage.getItem(currency.RATES_STORAGE_KEY);assert.ok(cached);assert.equal(calls,1);
    await act(async()=>root.unmount());root=undefined;host.replaceChildren();mock.timers.tick(5000);
    await mount('/');for(let i=0;i<4;i++)await flush();assert.equal(calls,1);assert.equal(localStorage.getItem(currency.RATES_STORAGE_KEY),cached);assert.ok(estimates().every(v=>v.includes('USD')));
  }finally{mock.timers.reset();}
});

test('an open tab hides expired cached estimates and revalidates without a request loop',async()=>{
  const now=Date.parse('2026-11-04T12:00:00Z');mock.timers.enable({apis:['Date','setTimeout','setInterval'],now});
  try {
    const payload=currency.parseFrankfurterResponse(rows(),now);
    localStorage.setItem(currency.RATES_STORAGE_KEY,JSON.stringify({storedAt:now-currency.RATES_TTL_MS+1000,payload}));
    let finish;globalThis.fetch=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
    await mount('/');for(let i=0;i<4;i++)await flush();assert.ok(estimates().length);assert.equal(calls,0);
    await act(async()=>mock.timers.tick(1001));assert.deepEqual(estimates(),[],'expired estimates disappear without navigation');
    await act(async()=>mock.timers.tick(15*60*1000));await flush();assert.equal(calls,1);
    await act(async()=>{dom.window.dispatchEvent(new dom.window.Event('focus'));dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));});assert.equal(calls,1,'pending requests are joined');
    await act(async()=>finish(new Response(JSON.stringify(rows()),{status:200})));for(let i=0;i<4;i++)await flush();assert.ok(estimates().length);
  }finally{mock.timers.reset();}
});

test('slow FX does not block fulfilment edits or authoritative checkout totals',async()=>{
  let finish;globalThis.fetch=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
  await mount('/checkout');assert.equal(calls,1);assert.deepEqual(estimates(),[]);assert.match(host.textContent,/NLE/);
  await act(async()=>host.querySelector('input[name="fulfilment"][value="pickup"]').click());assert.match(host.querySelector('.totals .total dd').textContent,/^NLE 36/);
  await act(async()=>finish(new Response(JSON.stringify(rows()),{status:200})));for(let i=0;i<4;i++)await flush();assert.ok(estimates().length);assert.match(host.querySelector('.totals .total dd').textContent,/^NLE 36/);
});
