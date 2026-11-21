import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {createServer} from './helpers/vite.mjs';
import {MemoryRouter,Routes,Route} from 'react-router-dom';

const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/',pretendToBeVisual:true});
const {document}=dom.window;
for(const name of ['window','document','Element','HTMLElement','HTMLInputElement','HTMLButtonElement','Event','MouseEvent','navigator','sessionStorage'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const originalFocus=dom.window.HTMLElement.prototype.focus;
dom.window.HTMLElement.prototype.focus=function(){
  if(this.id==='product-details-heading')recoveries++;
  return originalFocus.call(this);
};

const {createRoot}=await import('react-dom/client');
const host=dom.window.document.getElementById('root');
let server,root,ProductProvider,ProductDetailsPage,useProducts,AuthContext,CartContext,CurrencyProvider,NotificationProvider;
let loads=[],recoveries=0;

const fixture={id:'fixture',name:'Fixture piece',description:'Local fixture',category:'Home',price:1800,image:'/images/mug.svg',color:'#eee',variants:[{id:'v',productId:'fixture',options:{},isDefault:true,price:1800,currency:'NLE',inventoryPolicy:'untracked'}]};
const other={...fixture,id:'other',name:'Other piece',variants:[{...fixture.variants[0],id:'w',productId:'other'}]};

function deferred(){let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});return {promise,resolve,reject};}

before(async()=>{
  server=await createServer({configFile:false,envDir:false,server:{middlewareMode:true,hmr:false},plugins:[{name:'pdp-lifecycle-fixtures',enforce:'pre',load(id){
    if(id.replaceAll('\\','/').endsWith('/src/lib/supabase/client.ts'))return 'export function getSupabaseClient(){return globalThis.__pdpClient;}';
    if(id.replaceAll('\\','/').endsWith('/src/features/products/productRepository.ts'))return 'export async function loadProducts(){return globalThis.__pdpLoad();}';
  }}]});
  ({ProductProvider}=await server.ssrLoadModule('/src/features/products/ProductProvider.tsx'));
  ({ProductDetailsPage}=await server.ssrLoadModule('/src/features/products/ProductDetailsPage.tsx'));
  ({useProducts}=await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
  ({AuthContext}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({CartContext}=await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
  ({CurrencyProvider}=await server.ssrLoadModule('/src/features/currency/CurrencyProvider.tsx'));
  ({NotificationProvider}=await server.ssrLoadModule('/src/components/NotificationProvider.tsx'));
});

function RefreshProbe(){const {refresh}=useProducts();globalThis.__refresh=refresh;return null;}
function Dynamic({render}){const [,setN]=React.useState(0);globalThis.__bump=()=>setN(value=>value+1);return render();}
function tree(strict){
  const element=React.createElement(MemoryRouter,{initialEntries:['/products/fixture']},
    React.createElement(ProductProvider,null,
      React.createElement(AuthContext.Provider,{value:{loading:false,session:null,error:null}},
        React.createElement(CartContext.Provider,{value:{items:[],status:'idle',dispatch:async()=>({kind:'confirmed',items:[]})}},
          React.createElement(CurrencyProvider,null,
            React.createElement(NotificationProvider,null,
              React.createElement(RefreshProbe),
              React.createElement(Dynamic,{render:()=>React.createElement(Routes,null,
                React.createElement(Route,{path:'/products/:productId',element:React.createElement(ProductDetailsPage)}))})))))));
  return strict?React.createElement(React.StrictMode,null,element):element;
}

async function mount({strict=false}={}){
  if(root)await act(async()=>root.unmount());
  host.replaceChildren();recoveries=0;loads=[];
  globalThis.__pdpClient={};
  globalThis.__pdpLoad=()=>{const entry=deferred();loads.push(entry);return entry.promise;};
  root=createRoot(host);
  await act(async()=>root.render(tree(strict)));
}
async function settle(products){const entry=loads.at(-1);assert.ok(entry,'a catalogue load is in flight');await act(async()=>entry.resolve(products));}
async function refuse(){const entry=loads.at(-1);assert.ok(entry,'a catalogue load is in flight');await act(async()=>entry.reject(new Error('offline')));}
async function click(node){assert.ok(node);await act(async()=>node.click());}
const flush=()=>act(async()=>{});
const button=text=>[...host.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const heading=()=>host.querySelector('#product-details-heading');
const breadcrumbLinks=()=>[...host.querySelectorAll('nav[aria-label="Breadcrumb"] a')].map(link=>[link.textContent,link.getAttribute('href')]);

test('a successful initial load never steals focus or announces recovery',async()=>{
  await mount();await settle([fixture]);
  assert.equal(recoveries,0);
  assert.equal(host.querySelectorAll('h1').length,1);
  assert.match(heading().textContent,/Fixture piece/);
  assert.notEqual(document.activeElement,heading(),'initial render must not move focus to the heading');
});

test('Try again recovers focus to the product heading exactly once after the requested reload',async()=>{
  await mount();await refuse();
  assert.match(host.textContent,/The collection is unavailable/);
  const retry=button('Try again');retry.focus();await click(retry);
  assert.match(host.textContent,/Loading the collection/);
  assert.equal(recoveries,0,'no recovery while the reload is in flight');
  assert.notEqual(document.activeElement,heading());
  await settle([fixture]);
  assert.equal(recoveries,1);
  assert.equal(document.activeElement,heading());
  assert.match(heading().textContent,/Fixture piece/);
  await flush();
  assert.equal(recoveries,1,'no duplicate recovery after settling');
});

test('StrictMode double-invocation still recovers exactly once',async()=>{
  await mount({strict:true});await refuse();
  await click(button('Try again'));
  await settle([fixture]);
  assert.equal(recoveries,1);
  assert.equal(document.activeElement,heading());
});

test('a failed reload clears the intent without focus theft',async()=>{
  await mount();await refuse();
  await click(button('Try again'));
  await refuse();
  assert.match(host.textContent,/The collection is unavailable/);
  assert.equal(recoveries,0);
  assert.notEqual(document.activeElement,heading(),'a failed reload must not move focus');
});

test('a superseding reload cannot consume the earlier recovery intent',async()=>{
  await mount();await refuse();
  await click(button('Try again'));
  assert.match(host.textContent,/Loading the collection/);
  await act(async()=>{globalThis.__refresh();});
  await settle([fixture]);
  assert.equal(recoveries,0,'an unrelated later reload must not recover');
  assert.notEqual(document.activeElement,heading());
  assert.match(heading().textContent,/Fixture piece/);
});

test('re-renders during loading cannot trigger premature recovery',async()=>{
  await mount();await refuse();
  await click(button('Try again'));
  await act(async()=>{globalThis.__bump();});
  assert.equal(recoveries,0,'callback churn during loading must stay silent');
  await settle([fixture]);
  assert.equal(recoveries,1);
});

test('an empty catalogue shows the unavailable panel plus a refresh path that recovers focus',async()=>{
  await mount();await settle([]);
  assert.match(heading().textContent,/This piece is unavailable/);
  assert.match(host.textContent,/A new collection is on its way/);
  const refresh=button('Refresh collection');
  assert.ok(refresh,'an empty catalogue keeps a reload affordance on the Product Details route');
  refresh.focus();await click(refresh);
  assert.match(host.textContent,/Loading the collection/);
  assert.equal(recoveries,0);
  await settle([fixture]);
  assert.equal(recoveries,1);
  assert.equal(document.activeElement,heading());
  assert.match(heading().textContent,/Fixture piece/);
});

test('a reload that resolves without the product focuses the unavailable heading once',async()=>{
  await mount();await refuse();
  await click(button('Try again'));
  await settle([other]);
  assert.match(heading().textContent,/This piece is unavailable/);
  assert.equal(recoveries,1);
  assert.equal(document.activeElement,heading());
});

test('every Product Details state keeps one heading, the stable destination and its breadcrumbs',async()=>{
  const cases=[
    {name:'loading',assertContent:/Product details\./},
    {name:'error',assertContent:/Product details\./},
    {name:'missing',assertContent:/This piece is unavailable\./},
  ];
  for(const scenario of cases){
    await mount();
    if(scenario.name==='loading'){
      assert.equal(host.querySelectorAll('h1').length,1);
      assert.ok(heading(),'the loading heading exposes the destination');
      assert.equal(heading().getAttribute('tabindex'),'-1');
    }else if(scenario.name==='error'){await refuse();}
    else{await settle([other]);}
    assert.equal(host.querySelectorAll('h1').length,1,`${scenario.name}: exactly one heading`);
    assert.match(heading().textContent,scenario.assertContent,`${scenario.name}: expected heading copy`);
    assert.equal(heading().getAttribute('tabindex'),'-1',`${scenario.name}: destination stays programmatically focusable`);
    assert.deepEqual(breadcrumbLinks(),[['Home','/'],['Shop','/']],`${scenario.name}: breadcrumbs preserved`);
  }
  await mount();await settle([fixture]);
  assert.equal(host.querySelectorAll('h1').length,1);
  assert.equal(heading().getAttribute('tabindex'),'-1');
  assert.deepEqual(breadcrumbLinks(),[['Home','/'],['Shop','/']]);
  assert.match(host.querySelector('.product-details').querySelector('h1').textContent,/Fixture piece/);
});

afterEach(async()=>{if(root)await act(async()=>root.unmount());root=null;host.replaceChildren();loads=[];recoveries=0;delete globalThis.__pdpClient;delete globalThis.__pdpLoad;delete globalThis.__refresh;delete globalThis.__bump;});
after(async()=>{await server?.close();dom.window.close();});
