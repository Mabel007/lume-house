import assert from 'node:assert/strict';
import {test,before,after,afterEach} from 'node:test';
import {readFileSync} from 'node:fs';
import React,{act,useRef} from 'react';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {createMemoryRouter,RouterProvider,Link,Outlet,MemoryRouter} from 'react-router-dom';

// DOM/component evidence only. Supabase is replaced at the module boundary;
// no environment credential or endpoint is read, and no network call is permitted.
const dom=new JSDOM('<!doctype html><html><body><div id="test-root"></div></body></html>',{url:'http://localhost/'});
const {window}=dom;const {document,HTMLElement,HTMLTextAreaElement,HTMLInputElement}=window;
for(const name of ['window','document','Element','HTMLElement','HTMLAnchorElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','MutationObserver','FormData','sessionStorage','location'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);
globalThis.cancelAnimationFrame=clearTimeout;
window.scrollTo=()=>{};HTMLElement.prototype.scrollIntoView=()=>{};
const {createRoot}=await import('react-dom/client');
let server,root,router;const host=document.getElementById('test-root');
const clients=[];
before(async()=>{server=await createServer({configFile:false,envDir:false,server:{middlewareMode:true,hmr:false},plugins:[{name:'isolated-test-client',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/main.tsx'))return readFileSync(id,'utf8').split('ReactDOM.createRoot')[0].replace('const router =','export const testRouter =');if(id.replaceAll('\\','/').endsWith('/src/lib/supabase/client.ts'))return 'export function getSupabaseClient(){return globalThis.__lumeFormTestClient;}';}}]});});
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=undefined;router?.dispose();router=undefined;host.replaceChildren();delete globalThis.__lumeFormTestClient;window.confirm=()=>{throw new Error('Unexpected confirmation');};window.alert=()=>{throw new Error('Unexpected alert');};});
after(async()=>{await server.close();dom.window.close();});
async function module(path){return server.ssrLoadModule(`/src/${path}`);}
async function mount(element){root=createRoot(host);await act(async()=>root.render(element));}
async function render(element){await act(async()=>root.render(element));}
async function click(node){assert.ok(node);await act(async()=>node.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true})));}
async function submit(form){await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));}
function fakeClient(handler){const client={rpc(name,args){return {setHeader(key,value){clients.push({name,args,key,value});return Promise.resolve(handler(name,args,value)).then(result => name.endsWith('_page_v1') && Array.isArray(result.data) ? {...result,data:{items:result.data,total_count:result.data.length,page:args.p_page,page_size:args.p_page_size}} : result);}};}};globalThis.__lumeFormTestClient=client;return client;}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function inputValue(node,value){const prototype=node instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new window.Event('input',{bubbles:true}));}

function dashboardFixture(){return {active_products:2,total_variants:3,tracked_variants:2,out_of_stock:1,unconfigured_stock:0,total_orders:2,orders_placed:1,awaiting_payment:2,by_status:{placed:1,confirmed:0,processing:0,ready_for_pickup:0,out_for_delivery:0,completed:1,cancelled:0},recent_orders:[{id:'40000000-aaaa-4000-8000-000000000001',order_reference:'LH-0000000000000001',created_at:'2026-10-10T00:00:00Z',status:'placed',payment_status:'awaiting_payment',customer_email:'private@example.invalid'}],stock_attention:[{variant_id:'local-stock',product_name:'Local stock piece',sku:'LOCAL-STOCK',available_quantity:0}]};}

test('dashboard parser validates aggregate/status parity, exact bounded previews and projects no customer contacts',async()=>{
 const {parseDashboard}=await module('features/admin/dashboardContract.ts');const data=dashboardFixture();const parsed=parseDashboard(data);assert.equal(parsed.total_orders,2);assert.equal(parsed.recent_orders[0].customer_email,undefined);
 for(const invalid of [{...data,total_orders:3},{...data,orders_placed:0},{...data,awaiting_payment:3},{...data,tracked_variants:0},{...data,out_of_stock:-1},{...data,by_status:{placed:2}},{...data,recent_orders:[{...data.recent_orders[0],status:'completed'}]},{...data,stock_attention:[{...data.stock_attention[0],available_quantity:1}]},{...data,recent_orders:[]}])assert.throws(()=>parseDashboard(invalid));
});

test('dashboard reads are server aggregates; loading/error/retry, identity changes and revocation hide stale/private information',async()=>{
 const {AdminDashboard}=await module('features/admin/AdminDashboard.tsx');let pending=deferred();const calls=[];
 fakeClient((name,args,authorization)=>{assert.equal(name,'admin_dashboard_v1');calls.push({name,args,authorization});return pending.promise;});
 await mount(React.createElement(MemoryRouter,null,React.createElement(AdminDashboard,{token:'a'})));assert.match(host.textContent,/Loading overview metrics/);await act(async()=>pending.resolve({data:dashboardFixture(),error:null}));assert.match(host.textContent,/Local stock piece/);assert.doesNotMatch(host.textContent,/private@example.invalid/);assert.ok(host.querySelector('a[href="/admin/orders?status=placed"]'));assert.ok(host.querySelector('a[href="/admin/orders/40000000-aaaa-4000-8000-000000000001"]'));
 pending=deferred();await click(host.querySelector('button'));assert.doesNotMatch(host.textContent,/Local stock piece/);const previous=pending;pending=deferred();await render(React.createElement(MemoryRouter,null,React.createElement(AdminDashboard,{token:'b'})));await act(async()=>previous.resolve({data:dashboardFixture(),error:null}));assert.doesNotMatch(host.textContent,/Local stock piece/);assert.equal(calls.at(-1).authorization,'Bearer b');
 await act(async()=>pending.resolve({data:null,error:{code:'42501',message:'private provider detail'}}));assert.match(host.textContent,/access was denied/);assert.doesNotMatch(host.textContent,/Local stock piece|private provider/);
 pending=deferred();await click(host.querySelector('button'));await act(async()=>pending.resolve({data:{private:'malformed'},error:null}));assert.match(host.textContent,/could not be loaded or validated/);
 pending=deferred();await click(host.querySelector('button'));const empty={active_products:0,total_variants:0,tracked_variants:0,out_of_stock:0,unconfigured_stock:0,total_orders:0,orders_placed:0,awaiting_payment:0,by_status:{placed:0,confirmed:0,processing:0,ready_for_pickup:0,out_for_delivery:0,completed:0,cancelled:0},recent_orders:[],stock_attention:[]};await act(async()=>pending.resolve({data:empty,error:null}));assert.match(host.textContent,/No orders have been placed/);assert.match(host.textContent,/No active tracked variants have known zero/);assert.match(host.textContent,/Low-stock reporting is deferred/);assert.doesNotMatch(host.textContent,/recognized revenue/);
});

test('Admin Profile uses current authenticated identity, hides stale access reads and reuses trusted sign-out without permission/password controls',async()=>{
 const {AdminProfile}=await module('features/admin/AdminProfile.tsx');const {AuthContext}=await module('features/auth/AuthContext.ts');let read=deferred(),signOuts=0;
 fakeClient(name=>{assert.equal(name,'is_business_admin');return read.promise;});
 const view=(id,provider='google')=>React.createElement(MemoryRouter,null,React.createElement(AuthContext.Provider,{value:{session:id?{access_token:`token-${id}`,user:{id,email:`${id}@example.invalid`,user_metadata:{full_name:`Current ${id}`},app_metadata:{provider}}}:null,loading:false,error:null,signOut:async()=>{signOuts++;},signIn:async()=>{}}},React.createElement(AdminProfile,{token:`token-${id}`})));
 await mount(view('a'));assert.match(host.textContent,/Checking your administration access/);assert.doesNotMatch(host.textContent,/Current a/);const old=read;read=deferred();await render(view('b'));await act(async()=>old.resolve({data:true,error:null}));assert.doesNotMatch(host.textContent,/Current a|a@example.invalid/);
 await act(async()=>read.resolve({data:true,error:null}));assert.match(host.textContent,/Current b|b@example.invalid/);assert.match(host.textContent,/Active business-admin membership/);assert.match(host.textContent,/Sign-in provider: Google/);assert.doesNotMatch(host.textContent,/token-b|Change Password|Owner|Manager/);assert.equal(host.querySelector('input'),null);
 await click(host.querySelector('button'));assert.equal(signOuts,1);
 read=deferred();await render(view('c','unknown'));await act(async()=>read.resolve({data:false,error:null}));assert.match(host.textContent,/access was denied/);assert.doesNotMatch(host.textContent,/Current b|Current c/);
 read=deferred();await click(host.querySelector('button'));await act(async()=>read.resolve({data:true,error:null}));assert.match(host.textContent,/provider information unavailable/);assert.doesNotMatch(host.textContent,/Google manages/);
 await render(view(null));assert.doesNotMatch(host.textContent,/Current c|Active business-admin/);assert.match(host.textContent,/Sign in to view/);
});

test('authorized pagination validates envelopes and presents accurate accessible first/middle/last/empty controls',async()=>{
 const {parseAdminPage,lastPage}=await module('features/admin/adminPagination.ts');const {AdminPagination}=await module('features/admin/PaginationControls.tsx');
 const parse=row=>{assert.equal(typeof row.id,'string');return {id:row.id};};const key=row=>row.id;
 assert.equal(parseAdminPage({items:[{id:'a'}],total_count:21,page:2,page_size:10},parse,key,2,10).total_count,21);
 for(const value of [{items:[],total_count:21,page:0,page_size:10},{items:[],total_count:-1,page:0,page_size:10},{items:[],total_count:0,page:1,page_size:10}])assert.throws(()=>parseAdminPage(value,parse,key,0,10));
 assert.equal(lastPage(0,10),0);assert.equal(lastPage(101,50),2);
 const view=(page,total,loading=false,error='')=>React.createElement(AdminPagination,{page,size:10,total,loading,error,changePage(){},changeSize(){}});
 await mount(view(0,21));assert.match(host.textContent,/21 records · Page 1 of 3/);assert.equal(host.querySelectorAll('option').length,3);assert.equal(host.querySelector('button').disabled,true);assert.equal(host.querySelectorAll('button')[1].disabled,false);
 await render(view(1,21));assert.ok(Array.from(host.querySelectorAll('button')).every(button=>!button.disabled));
 await render(view(2,21));assert.equal(host.querySelectorAll('button')[1].disabled,true);
 await render(view(0,0));assert.match(host.textContent,/Page 0 of 0/);assert.ok(Array.from(host.querySelectorAll('button')).every(button=>button.disabled));
 await render(view(0,0,true));assert.equal(host.querySelector('nav').getAttribute('aria-busy'),'true');
});

test('page requests reset filters/sizes, clamp removed last pages, refresh mutations and discard stale identities/revocation',async()=>{
 const {useAdminPage}=await module('features/admin/useAdminPage.ts');const {AdminPagination}=await module('features/admin/PaginationControls.tsx');
 const calls=[];const parse=row=>({id:row.id});const key=row=>row.id;let control;
 fakeClient((name,args,authorization)=>{const response=deferred();calls.push({name,args,authorization,response});return response.promise;});
 function Harness({token,query=''}){control=useAdminPage(token,'admin_products_page_v1',{p_query:query},parse,key);return React.createElement('section',null,React.createElement(AdminPagination,control),React.createElement('div',null,control.rows.map(row=>React.createElement('p',{key:row.id},row.id))),React.createElement('p',null,control.error));}
 const view=(token='a',query='')=>React.createElement(Harness,{token,query});
 const resolve=async(call,total,prefix)=>act(async()=>call.response.resolve({data:{items:Array.from({length:Math.min(call.args.p_page_size,Math.max(0,total-call.args.p_page*call.args.p_page_size))},(_,i)=>({id:`${prefix}-${i}`})),total_count:total,page:call.args.p_page,page_size:call.args.p_page_size},error:null}));
 await mount(view());await resolve(calls.at(-1),21,'initial');assert.match(host.textContent,/21 records/);
 await act(async()=>control.changePage(2));assert.doesNotMatch(host.textContent,/initial-0/);await resolve(calls.at(-1),11,'removed');assert.equal(calls.at(-1).args.p_page,1);await resolve(calls.at(-1),11,'clamped');assert.match(host.textContent,/Page 2 of 2/);
 await act(async()=>control.changeSize(50));assert.equal(calls.at(-1).args.p_page,0);assert.equal(calls.at(-1).args.p_page_size,50);const old=calls.at(-1);
 await render(view('b','new'));assert.equal(calls.at(-1).args.p_query,'new');assert.equal(calls.at(-1).args.p_page,0);assert.equal(calls.at(-1).authorization,'Bearer b');await resolve(old,1,'private-a');assert.doesNotMatch(host.textContent,/private-a/);
 await resolve(calls.at(-1),1,'private-b');assert.match(host.textContent,/private-b/);
 await act(async()=>control.refresh());assert.doesNotMatch(host.textContent,/private-b/);await act(async()=>calls.at(-1).response.resolve({data:null,error:{code:'42501'}}));assert.match(host.textContent,/access was denied/);assert.doesNotMatch(host.textContent,/private-b/);
 await act(async()=>control.refresh());await resolve(calls.at(-1),0,'empty');assert.match(host.textContent,/0 records/);
});

test('Product manager sends server search and page sizes while category suggestions identify current-page scope',async()=>{
 const {ProductManager}=await module('features/admin/ProductManager.tsx');const calls=[];
 fakeClient((name,args)=>{assert.equal(name,'admin_products_page_v1');calls.push(args);return Promise.resolve({data:{items:[],total_count:0,page:args.p_page,page_size:args.p_page_size},error:null});});
 await mount(React.createElement(ProductManager,{token:'local'}));assert.match(host.textContent,/0 records · Page 0 of 0/);
 await act(async()=>inputValue(host.querySelector('input[type="search"]'),'Archived ceramics'));assert.equal(calls.at(-1).p_query,'Archived ceramics');assert.equal(calls.at(-1).p_page,0);
 await act(async()=>{host.querySelector('.admin-pagination select').value='100';host.querySelector('.admin-pagination select').dispatchEvent(new window.Event('change',{bubbles:true}));});assert.equal(calls.at(-1).p_page_size,100);
});

test('Inventory manager passes all-term and tracking filters to server rather than filtering a capped array',async()=>{
 const {InventoryManager}=await module('features/admin/InventoryManager.tsx');const calls=[];
 fakeClient((name,args)=>{assert.equal(name,'admin_inventory_page_v1');calls.push(args);return Promise.resolve({data:{items:[],total_count:0,page:args.p_page,page_size:args.p_page_size},error:null});});
 await mount(React.createElement(InventoryManager,{token:'local'}));await act(async()=>inputValue(host.querySelector('input[type="search"]'),'warm SKU Large'));
 await act(async()=>{host.querySelector('.admin-inventory-filters select').value='tracked';host.querySelector('.admin-inventory-filters select').dispatchEvent(new window.Event('change',{bubbles:true}));});
 assert.equal(calls.at(-1).p_query,'warm SKU Large');assert.equal(calls.at(-1).p_policy,'tracked');assert.match(host.textContent,/0 records/);
});

test('Orders pagination retains URL search/status behavior and forwards the complete filter to authorized RPC',async()=>{
 const {OrderManager}=await module('features/admin/OrderManager.tsx');const calls=[];
 fakeClient((name,args)=>{assert.equal(name,'admin_orders_page_v1');calls.push(args);return Promise.resolve({data:{items:[],total_count:0,page:args.p_page,page_size:args.p_page_size},error:null});});
 await mount(React.createElement(MemoryRouter,{initialEntries:['/admin/orders?query=LH-&status=placed']},React.createElement(OrderManager,{token:'local'})));
 assert.equal(calls.at(-1).p_query,'LH-');assert.equal(calls.at(-1).p_status,'placed');assert.match(host.textContent,/0 records/);
 await act(async()=>inputValue(host.querySelector('[name="query"]'),'customer'));await submit(host.querySelector('form'));assert.equal(calls.at(-1).p_query,'customer');assert.equal(calls.at(-1).p_page,0);
});

test('CSV serialization preserves typed numbers, quotes UTF-8 text and neutralizes spreadsheet formulas; incomplete/private responses fail',async()=>{
 const {csvCell,exportCsv}=await module('features/admin/adminCsv.ts');
 for(const value of ['=SUM(1,2)','+cmd','-cmd','@cmd','  =1','\t=1','\r\n+cmd','\u0001=1'])assert.ok(csvCell(value).startsWith('"\''));
 assert.equal(csvCell(-3),'-3');assert.equal(csvCell(null),'');assert.equal(csvCell('Lumé, "House"\nText'),'"Lumé, ""House""\nText"');
 const row={id:'local',name:'=Danger',category:'Ceramics',active:false,display_order:2};const result=exportCsv({items:[row],total_count:1},'products');assert.equal(result.count,1);assert.match(result.csv,/^\uFEFFid,name,category,visible,display_order\r\n/);assert.match(result.csv,/"'=Danger"/);
 for(const value of [{items:[row],total_count:2},{items:[{...row,customer_email:'private'}],total_count:1},{items:[row,row],total_count:2},{items:[],total_count:10001}])assert.throws(()=>exportCsv(value,'products'));
 const order={order_reference:'LH-0000000000000001',created_at:'2026-10-10T00:00:00Z',status:'placed',payment_status:'awaiting_payment',currency:'NLE',total_cents:12550};assert.match(exportCsv({items:[order],total_count:1},'orders').csv,/total_minor_units/);assert.match(exportCsv({items:[order],total_count:1},'orders').csv,/,12550\r\n/);
});

test('complete CSV downloads once; cancellation, switched identity, revoked access and partial failures download nothing',async()=>{
 const {AdminCsvExport}=await module('features/admin/AdminCsvExport.tsx');let pending=deferred(),allowed=true;const calls=[];let downloads=0;const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL,originalClick=window.HTMLAnchorElement.prototype.click;
 URL.createObjectURL=()=> 'blob:local-test';URL.revokeObjectURL=()=>{};window.HTMLAnchorElement.prototype.click=function(){assert.equal(this.download,'lume-house-products.csv');downloads++;};
 const payload={items:[{id:'local',name:'Lumé piece',category:'Ceramics',active:true,display_order:0}],total_count:1};
 fakeClient((name,args)=>{calls.push({name,args});if(name==='is_business_admin')return Promise.resolve({data:allowed,error:null});assert.equal(name,'admin_export_v1');return pending.promise;});
 const view=(token='a',query='')=>React.createElement(AdminCsvExport,{token,kind:'products',query});
 try{
  await mount(view());await click(host.querySelector('button'));assert.equal(host.querySelector('button').disabled,true);assert.equal(calls[0].args.p_query,'');await act(async()=>pending.resolve({data:payload,error:null}));assert.equal(downloads,1);assert.match(host.textContent,/Complete export downloaded: 1 records/);
  pending=deferred();await click(host.querySelector('button'));await click(Array.from(host.querySelectorAll('button')).find(node=>node.textContent==='Cancel export'));await act(async()=>pending.resolve({data:payload,error:null}));assert.equal(downloads,1);assert.match(host.textContent,/Export cancelled/);
  pending=deferred();await click(host.querySelector('button'));await render(view('b','filtered'));await act(async()=>pending.resolve({data:payload,error:null}));assert.equal(downloads,1);assert.doesNotMatch(host.textContent,/Complete export downloaded/);
  allowed=false;pending=deferred();await click(host.querySelector('button'));await act(async()=>pending.resolve({data:payload,error:null}));assert.equal(downloads,1);assert.match(host.textContent,/Export failed/);assert.equal(calls.at(-2).args.p_query,'filtered');
  allowed=true;pending=deferred();await click(host.querySelector('button'));await act(async()=>pending.resolve({data:{...payload,total_count:2},error:null}));assert.equal(downloads,1);assert.match(host.textContent,/No partial file/);
  pending=deferred();await click(host.querySelector('button'));await act(async()=>pending.resolve({data:null,error:{code:'54000'}}));assert.equal(downloads,1);assert.match(host.textContent,/10,000 records or 8 MiB/);
  pending=deferred();await click(host.querySelector('button'));await render(null);await act(async()=>pending.resolve({data:payload,error:null}));assert.equal(downloads,1);
 }finally{URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;window.HTMLAnchorElement.prototype.click=originalClick;}
});

test('mounted error descriptions follow added/removed controls and preserve help on cleanup without duplicate alerts',async()=>{
 const {AdminForm}=await module('features/admin/AdminForm.tsx');
 const view=(error,extra=false)=>React.createElement(AdminForm,{error,errorKind:'validation'},React.createElement('p',{id:'help'},'Existing help'),React.createElement('input',{name:'name','aria-describedby':'help',defaultValue:'retained'}),extra&&React.createElement('textarea',{name:'extra','aria-describedby':''}));
 await mount(view('Check these inputs.'));const field=host.querySelector('input'),summary=host.querySelector('.admin-form-error'),id=summary.id;
 assert.equal(document.activeElement,summary);assert.equal(field.getAttribute('aria-describedby'),`help ${id}`);assert.equal(host.querySelectorAll('[role="alert"]').length,0);assert.equal(host.querySelector('form').dataset.adminUncertain,'false');
 await render(view('Check these inputs.',true));const added=host.querySelector('textarea');assert.equal(added.getAttribute('aria-describedby'),id);
 await render(view('Check these inputs.'));assert.equal(added.getAttribute('aria-describedby'),'');
 await render(view(''));assert.equal(field.getAttribute('aria-describedby'),'help');assert.equal(field.value,'retained');
});

test('native-invalid marking restores original attributes after editing and unmount',async()=>{
 const {AdminForm}=await module('features/admin/AdminForm.tsx');await mount(React.createElement(AdminForm,null,React.createElement('input',{required:true,'aria-invalid':'false'})));
 const field=host.querySelector('input');await act(async()=>field.dispatchEvent(new window.Event('invalid',{bubbles:false,cancelable:true})));assert.equal(field.getAttribute('aria-invalid'),'true');
 await act(async()=>inputValue(field,'valid'));assert.equal(field.getAttribute('aria-invalid'),'false');assert.equal(host.querySelector('form').dataset.adminDirty,'true');
 await act(async()=>field.dispatchEvent(new window.Event('invalid',{bubbles:false,cancelable:true})));await act(async()=>root.unmount());root=undefined;assert.equal(field.getAttribute('aria-invalid'),'false');
});

test('structural option Add and Remove mark drafts without a text edit and retain native controls',async()=>{
 const {VariantEditor}=await module('features/admin/VariantManager.tsx');await mount(React.createElement(VariantEditor,{variant:null,productId:'synthetic-product',token:'synthetic-token',saved(){},cancel(){}}));
 const buttons=()=>Array.from(host.querySelectorAll('button'));await click(buttons().find(button=>button.textContent==='Add option'));assert.equal(host.querySelector('form').dataset.adminDirty,'true');assert.equal(host.querySelectorAll('.admin-option-row').length,1);
 host.querySelector('form').dataset.adminDirty='false';await click(buttons().find(button=>button.textContent==='Remove option 1'));assert.equal(host.querySelector('form').dataset.adminDirty,'true');assert.equal(host.querySelectorAll('.admin-option-row').length,0);
});

test('mounted data router blocks sidebar/storefront and POP Back/Forward, preserves cancelled drafts and proceeds once',async()=>{
 const {AdminForm,AdminRouteDraftBlocker}=await module('features/admin/AdminForm.tsx');const {useAdminDraftNavigation}=await module('features/admin/adminFormBehavior.ts');let confirmations=0,logout=0,mounts=0;
 function Workspace(){const node=useRef(null);useAdminDraftNavigation(node,true);return React.createElement('div',{ref:node},React.createElement(AdminRouteDraftBlocker,{root:node}),React.createElement(Link,{to:'/admin/orders'},'Orders'),React.createElement(Link,{to:'/'},'Storefront'),React.createElement('button',{'data-admin-leave':true,onClick:()=>logout++},'Sign Out'),React.createElement(Outlet));}
 function Stable(){const marker=useRef(null);if(!marker.current){marker.current={};mounts++;}return React.createElement(Workspace);}
 const form=React.createElement(AdminForm,null,React.createElement('input',{defaultValue:'draft'}),React.createElement('button',{type:'button','data-admin-draft-change':true},'Structural edit'));
 router=createMemoryRouter([{element:React.createElement(Stable),children:[{path:'/',element:React.createElement('h1',null,'Store')},{path:'/admin/products',element:form},{path:'/admin/orders',element:React.createElement('h1',null,'Orders')}]}],{initialEntries:['/','/admin/products','/admin/orders'],initialIndex:1});
 window.confirm=()=>{confirmations++;return false;};await mount(React.createElement(RouterProvider,{router}));await click(host.querySelector('[data-admin-draft-change]'));
 for(const label of ['Orders','Storefront']){await click(Array.from(host.querySelectorAll('a')).find(a=>a.textContent===label));assert.equal(router.state.location.pathname,'/admin/products');}
 await act(async()=>router.navigate(-1));assert.equal(router.state.location.pathname,'/admin/products');await act(async()=>router.navigate(1));assert.equal(router.state.location.pathname,'/admin/products');
 await click(host.querySelector('[data-admin-leave]'));assert.equal(logout,0);assert.equal(host.querySelector('input').value,'draft');assert.equal(confirmations,5);
 window.confirm=()=>true;await click(Array.from(host.querySelectorAll('a')).find(a=>a.textContent==='Storefront'));assert.equal(router.state.location.pathname,'/');assert.equal(mounts,1);
 await act(async()=>router.navigate('/admin/orders'));await act(async()=>router.navigate(-1));assert.equal(router.state.location.pathname,'/');await act(async()=>router.navigate(1));assert.equal(router.state.location.pathname,'/admin/orders');assert.equal(mounts,1);
});

test('busy forms block Sign Out and unload without relying on animation',async()=>{
 const {AdminForm}=await module('features/admin/AdminForm.tsx');const {useAdminDraftNavigation}=await module('features/admin/adminFormBehavior.ts');let logout=0,alerts=0;
 function View(){const node=useRef(null);useAdminDraftNavigation(node);return React.createElement('div',{ref:node},React.createElement(AdminForm,{busy:true},React.createElement('input')),React.createElement('button',{'data-admin-leave':true,onClick:()=>logout++},'Sign Out'));}
 window.alert=()=>alerts++;await mount(React.createElement(View));await click(host.querySelector('[data-admin-leave]'));assert.equal(logout,0);assert.equal(alerts,1);const event=new window.Event('beforeunload',{cancelable:true});window.dispatchEvent(event);assert.equal(event.defaultPrevented,true);assert.equal(host.querySelector('fieldset').disabled,true);assert.match(host.textContent,/Saving changes.*Please wait/);
});

test('confirmed notice event identity focuses repeated successes but unrelated renders do not refocus stale notices',async()=>{
 const {useAdminReturnFocus}=await module('features/admin/adminFormBehavior.ts');function View({message,sequence}){const target=useRef(null);useAdminReturnFocus(message,target,sequence);return React.createElement('div',null,React.createElement('button',null,'Other action'),message&&React.createElement('p',{ref:target,tabIndex:-1},message));}
 const view=sequence=>React.createElement(View,{message:'Change confirmed.',sequence});await mount(view(1));assert.equal(document.activeElement,host.querySelector('p'));host.querySelector('button').focus();await render(view(1));assert.equal(document.activeElement,host.querySelector('button'));await render(view(2));assert.equal(document.activeElement,host.querySelector('p'));
});

test('order confirmation cancellation makes no RPC; duplicate submits lock synchronously and uncertain retry keeps receipt and input',async()=>{
 const {OrderOperations}=await module('features/admin/OrderManager.tsx');const calls=[];let pending=deferred();fakeClient((name,args,value)=>{calls.push({name,args,value});return pending.promise;});
 await mount(React.createElement(OrderOperations,{order:{id:'synthetic-order',status:'placed',fulfilment_method:'pickup'},token:'synthetic-token',saved(){throw new Error('Unexpected success');}}));const form=host.querySelector('form'),reason=host.querySelector('textarea');reason.value='LOCAL TEST reason';
 window.confirm=()=>false;await submit(form);assert.equal(calls.length,0);window.confirm=()=>true;
 await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});assert.equal(calls.length,1);assert.equal(host.querySelector('fieldset').disabled,true);assert.equal(calls[0].value,'Bearer synthetic-token');const id=calls[0].args.p_operation_id;
 await act(async()=>pending.resolve({data:null,error:{code:'transport'}}));assert.equal(reason.value,'LOCAL TEST reason');assert.equal(form.dataset.adminUncertain,'true');assert.equal(document.activeElement,host.querySelector('.admin-form-error'));assert.equal(host.querySelector('fieldset').disabled,false);
 reason.value='changed reason';await submit(form);assert.equal(calls.length,1);assert.match(host.textContent,/Retry the same operation/);
 reason.value='LOCAL TEST reason';pending=deferred();await submit(form);assert.equal(calls.length,2);assert.equal(calls[1].args.p_operation_id,id);await act(async()=>pending.resolve({data:null,error:{code:'40001'}}));assert.equal(form.dataset.adminUncertain,'false');assert.equal(host.querySelector('.admin-form-error').dataset.errorKind,'stale');assert.match(host.textContent,/This record changed/);
});

test('known RPC codes remain safe classifications and arbitrary errors stay uncertain',async()=>{
 const {adminRpc,adminErrorKind}=await module('features/admin/adminRepository.ts');for(const [code,kind] of [['42501','denied'],['40001','stale'],['unknown','uncertain']]){const client={rpc:()=>({setHeader:async()=>({data:null,error:{code}})})};await assert.rejects(adminRpc(client,'synthetic-token','admin_test'),error=>adminErrorKind(error,true)===kind);}assert.equal(adminErrorKind(new Error('local validation'),false),'validation');assert.equal(adminErrorKind(new Error('transport'),true),'uncertain');
});

test('actual application router keeps Auth/Product/Bag providers across customer routes and denies nonadmin deep link; account switch clears private Bag',async()=>{
 const product={id:'synthetic-product',name:'LOCAL TEST product',description:'Synthetic description',category:'LOCAL TEST',image_path:'/images/mug.svg',background_color:'#e9e3d8',price_cents:100,currency:'NLE',active:true};
 const variant={id:'synthetic-variant',product_id:product.id,options:{},is_default:true,price_cents:100,currency:'NLE',active:true,inventory_policy:'untracked'};
 const session=id=>({user:{id,email:`${id}@example.invalid`},access_token:`synthetic-${id}`});let current=session('customer-a'),receive,restores=0,unsubscribes=0,reads=0;
 const client=fakeClient((name,args,token)=>{
  if(name==='load_variant_cart')return Promise.resolve({data:{id:'synthetic-cart',items:token==='Bearer synthetic-customer-a'?[{product_id:product.id,variant_id:variant.id,quantity:3}]:[]},error:null});
  if(name==='business_access_v1')return Promise.resolve({data:null,error:{code:'42501'}});if(name==='is_business_admin')return Promise.resolve({data:false,error:null});
  throw new Error(`Unexpected mocked RPC: ${name}`);
 });
 client.auth={onAuthStateChange(callback){receive=callback;return {data:{subscription:{unsubscribe(){unsubscribes++;}}}};},async getSession(){restores++;return {data:{session:current},error:null};},async signOut(){current=null;receive('SIGNED_OUT',null);return {error:null};}};
 client.from=table=>{reads++;const query={select(){return query;},eq(){return query;},order(){return query;},abortSignal(){return Promise.resolve({data:table==='products'?[product]:[variant],error:null});}};return query;};
 window.history.replaceState(null,'','/cart');const {testRouter}=await module('main.tsx');router=testRouter;await mount(React.createElement(RouterProvider,{router}));assert.match(host.textContent,/LOCAL TEST product/);assert.ok(host.querySelector('[aria-label="Bag (3)"]'));
 const initial={restores,reads,unsubscribes};for(const path of ['/about','/help','/products/synthetic-product','/cart']){await act(async()=>router.navigate(path));assert.equal(router.state.location.pathname,path);}assert.deepEqual({restores,reads,unsubscribes},initial);assert.ok(host.querySelector('[aria-label="Bag (3)"]'));
 await act(async()=>router.navigate('/admin/orders/synthetic-order'));assert.match(host.textContent,/does not have business administration access/);assert.equal(host.querySelector('.admin-workspace'),null);assert.deepEqual({restores,reads,unsubscribes},initial);
 await act(async()=>client.auth.signOut());await act(async()=>router.navigate('/cart'));assert.equal(host.querySelector('[aria-label="Bag (3)"]'),null);assert.ok(host.querySelector('[aria-label="Bag (0)"]'));
 current=session('customer-b');await act(async()=>receive('SIGNED_IN',current));assert.ok(host.querySelector('[aria-label="Bag (0)"]'));assert.doesNotMatch(host.textContent,/customer-a@example.invalid/);assert.deepEqual({restores,reads,unsubscribes},{...initial,reads:initial.reads+2});
});

test('customer Account hub hides previous-user drafts and stale profile responses when identity switches or signs out',async()=>{
 const {AuthContext}=await module('features/auth/AuthContext.ts');const {CustomerAccount}=await module('features/auth/CustomerRoutes.tsx');
 const pendingA=deferred(),pendingB=deferred();let identity;
 globalThis.__lumeFormTestClient={from(table){assert.equal(table,'profiles');const query={select(){return query;},eq(key,id){assert.equal(key,'id');identity=id;return query;},maybeSingle(){return identity==='a'?pendingA.promise:pendingB.promise;}};return query;}};
 const session=id=>({user:{id,email:`${id}@example.invalid`,user_metadata:{full_name:`Current ${id}`}}});
 const view=id=>React.createElement(MemoryRouter,{initialEntries:['/account']},React.createElement(AuthContext.Provider,{value:{session:id?session(id):null,loading:false,error:null,signIn:async()=>{},signOut:async()=>{}}},React.createElement(CustomerAccount)));
 await mount(view('a'));assert.match(host.textContent,/Current a/);assert.equal(host.querySelector('[name="full_name"]').disabled,true);
 await render(view('b'));assert.match(host.textContent,/Current b/);assert.doesNotMatch(host.textContent,/Current a|a@example.invalid/);
 await act(async()=>pendingA.resolve({data:{full_name:'Previous customer',phone:'+23276521208'},error:null}));assert.doesNotMatch(host.textContent,/Previous customer/);assert.equal(host.querySelector('[name="full_name"]').value,'');
 await act(async()=>pendingB.resolve({data:{full_name:'New customer',phone:'+23276521209'},error:null}));assert.equal(host.querySelector('[name="full_name"]').value,'New customer');assert.match(host.textContent,/New customer/);
 await act(async()=>inputValue(host.querySelector('[name="full_name"]'),'Unsaved private draft'));
 await render(view(null));assert.equal(host.querySelector('.account-navigation'),null);assert.equal(host.querySelector('.profile-surface'),null);assert.doesNotMatch(host.textContent,/New customer|Unsaved private draft|b@example.invalid/);assert.match(host.textContent,/Sign in with Google/);
});

test('Account section navigation retains drafts and focus; Cancel restores loaded and successful saves while failures retain input',async()=>{
 const {AuthContext}=await module('features/auth/AuthContext.ts');const {CustomerAccount}=await module('features/auth/CustomerRoutes.tsx');
 const loaded={full_name:'Loaded customer',phone:'+23276521208',default_street_address:'Loaded address',default_area:'Lumley',default_city:'Freetown'};let pending=deferred();const writes=[];
 globalThis.__lumeFormTestClient={from(table){assert.equal(table,'profiles');let update;const query={select(){return query;},update(values){update=values;return query;},eq(key,id){assert.equal(key,'id');assert.equal(id,'customer');if(update){writes.push(update);return pending.promise;}return query;},maybeSingle(){return Promise.resolve({data:loaded,error:null});}};return query;}};
 let signOuts=0;const value={session:{user:{id:'customer',email:'owner@example.invalid',user_metadata:{full_name:'Google customer'}}},loading:false,error:null,signIn:async()=>{},signOut:async()=>{signOuts++;}};
 router=createMemoryRouter([{path:'/account',element:React.createElement(AuthContext.Provider,{value},React.createElement(CustomerAccount))}],{initialEntries:['/account']});await mount(React.createElement(RouterProvider,{router}));
 const form=host.querySelector('form');const field=name=>host.querySelector(`[name="${name}"]`);const cancel=()=>Array.from(host.querySelectorAll('button')).find(node=>node.textContent==='Cancel');const signOut=()=>Array.from(host.querySelectorAll('button')).find(node=>node.textContent==='Sign Out');
 const email=host.querySelector('#account-auth-email');assert.equal(email.readOnly,true);assert.equal(email.value,'owner@example.invalid');assert.equal(email.hasAttribute('name'),false);
 await act(async()=>{inputValue(field('full_name'),'Draft customer');inputValue(field('default_street_address'),'Draft address');});
 await click(host.querySelector('a[href="/account#delivery-details"]'));await act(async()=>new Promise(resolve=>setTimeout(resolve,10)));
 assert.equal(host.querySelector('form'),form);assert.equal(field('full_name').value,'Draft customer');assert.equal(field('default_street_address').value,'Draft address');assert.equal(document.activeElement.id,'delivery-details');
 await click(cancel());for(const [name,expected] of Object.entries(loaded))assert.equal(field(name).value,expected);assert.equal(writes.length,0);
 await act(async()=>inputValue(field('phone'),'invalid phone'));await submit(form);assert.equal(writes.length,0);assert.match(host.textContent,/Enter a Sierra Leone phone number/);assert.equal(field('phone').value,'invalid phone');await click(cancel());
 await act(async()=>inputValue(field('full_name'),'Failed draft'));await submit(form);assert.equal(writes.length,1);assert.equal(cancel().disabled,true);assert.equal(signOut().disabled,true);
 await act(async()=>pending.resolve({error:{code:'transport'}}));assert.equal(field('full_name').value,'Failed draft');assert.match(host.textContent,/Your profile could not be saved/);assert.equal(host.querySelector('.account-name').textContent,'Loaded customer');await click(cancel());assert.equal(field('full_name').value,'Loaded customer');
 pending=deferred();await act(async()=>{inputValue(field('full_name'),'Saved customer');inputValue(field('default_street_address'),'Saved address');});await submit(form);await act(async()=>pending.resolve({error:null}));assert.equal(writes.length,2);assert.equal(writes[1].full_name,'Saved customer');assert.equal(writes[1].default_street_address,'Saved address');assert.equal(Object.hasOwn(writes[1],'email'),false);assert.equal(host.querySelector('.account-name').textContent,'Saved customer');
 await act(async()=>{inputValue(field('full_name'),'Discarded customer');inputValue(field('default_street_address'),'Discarded address');});await click(cancel());assert.equal(field('full_name').value,'Saved customer');assert.equal(field('default_street_address').value,'Saved address');assert.equal(writes.length,2);
 await click(signOut());assert.equal(signOuts,1);
});

test('customer cancellation form locks duplicates and retains original reason after recoverable failure and read retry',async()=>{
 const {CancellationRequest}=await module('features/orders/CancellationRequest.tsx');let pending=deferred();const calls=[];
 fakeClient((name,args)=>{if(name==='customer_get_cancellation_request')return Promise.resolve({data:null,error:null});calls.push({name,args});return pending.promise;});
 await mount(React.createElement(CancellationRequest,{orderId:'synthetic-order',status:'placed',token:'synthetic-token'}));let form=host.querySelector('form');await act(async()=>inputValue(host.querySelector('textarea'),'LOCAL TEST cancellation'));
 await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});assert.equal(calls.length,1);assert.equal(host.querySelector('button').disabled,true);
 await act(async()=>pending.resolve({data:null,error:{code:'transport'}}));assert.equal(host.querySelector('form'),null);await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Reload request'));assert.equal(host.querySelector('textarea').value,'LOCAL TEST cancellation');
 await act(async()=>inputValue(host.querySelector('textarea'),'different reason'));form=host.querySelector('form');await submit(form);assert.equal(calls.length,1);assert.match(host.textContent,/original reason/);
});

test('inventory adjustment uses one original receipt through uncertain retries while keeping input and policy stale guard',async()=>{
 const {InventoryEditor}=await module('features/admin/InventoryManager.tsx');const calls=[];let pending=deferred();fakeClient((name,args)=>{if(name==='admin_inventory_history')return Promise.resolve({data:[],error:null});calls.push({name,args});return pending.promise;});
 const row={variant_id:'synthetic-variant',product_name:'LOCAL TEST',sku:'LOCAL-TEST',options:{},inventory_policy:'tracked',on_hand:10,allocated:0,updated_at:'2026-10-08T00:00:00Z'};
 await mount(React.createElement(InventoryEditor,{row,token:'synthetic-token',saved(){throw new Error('Unexpected success');}}));const form=host.querySelector('form');await act(async()=>inputValue(host.querySelector('[name="delta"]'),'2'));await act(async()=>inputValue(host.querySelector('textarea'),'LOCAL TEST adjustment'));
 await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});assert.equal(calls.length,1);const id=calls[0].args.p_operation_id;
 await act(async()=>pending.resolve({data:null,error:{code:'transport'}}));assert.equal(host.querySelector('[name="delta"]').value,'2');assert.equal(host.querySelector('textarea').value,'LOCAL TEST adjustment');pending=deferred();await submit(form);assert.equal(calls[1].args.p_operation_id,id);await act(async()=>pending.resolve({data:null,error:{code:'40001'}}));
});

test('product create Cancel has no mutation; duplicate submit and uncertain replay retain original operation UUID and signature',async()=>{
 const {ProductEditor}=await module('features/admin/ProductManager.tsx');const calls=[];let pending=deferred(),cancelled=0;
 fakeClient((name,args)=>{if(name==='admin_media_assets')return Promise.resolve({data:['/images/mug.svg'],error:null});calls.push({name,args});return pending.promise;});
 await mount(React.createElement(ProductEditor,{product:null,token:'synthetic-token',saved(){throw new Error('Unexpected success');},cancel(){cancelled++;}}));
 await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Cancel'));assert.equal(cancelled,1);assert.equal(calls.length,0);
 await act(async()=>host.querySelector('.admin-media-preview').dispatchEvent(new window.Event('load')));
 for(const [name,value] of [['name','LOCAL TEST product'],['description','LOCAL TEST description'],['initial_price','12.50']])host.querySelector(`[name="${name}"]`).value=value;
 await act(async()=>inputValue(host.querySelector('[name="category"]'),'LOCAL TEST category'));const form=host.querySelector('form');
 await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});assert.equal(calls.length,1);const args=calls[0].args;assert.equal(args.p_initial_price,1250);
 await act(async()=>pending.resolve({data:null,error:{code:'transport'}}));assert.equal(host.querySelector('[name="name"]').value,'LOCAL TEST product');assert.doesNotMatch(host.textContent,/Product saved successfully/);
 window.confirm=()=>false;await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Start a new creation'));pending=deferred();await submit(form);assert.equal(calls.length,2);assert.deepEqual(calls[1].args,args);await act(async()=>pending.resolve({data:null,error:{code:'transport'}}));
 host.querySelector('[name="name"]').value='changed product';await submit(form);assert.equal(calls.length,2);assert.match(host.textContent,/original creation unchanged/);
});

test('actual protected order deep link mounts on fresh router and preserves provider continuity through return and POP',async()=>{
 const {testRouter}=await module('main.tsx');let subscriptions=0,restores=0;
 const client=fakeClient(name=>{if(name==='business_access_v1')return Promise.resolve({data:'legacy',error:null});if(name==='is_business_admin')return Promise.resolve({data:true,error:null});if(name==='load_variant_cart')return Promise.resolve({data:{id:'synthetic-cart',items:[]},error:null});if(name==='admin_get_order')return Promise.resolve({data:null,error:null});if(name==='admin_orders_page_v1')return Promise.resolve({data:[],error:null});throw new Error(`Unexpected RPC ${name}`);});
 client.auth={onAuthStateChange(){subscriptions++;return {data:{subscription:{unsubscribe(){}}}};},async getSession(){restores++;return {data:{session:{user:{id:'synthetic-admin',email:'admin@example.invalid'},access_token:'synthetic-admin-token'}},error:null};}};
 client.from=()=>{const query={select(){return query;},eq(){return query;},order(){return query;},abortSignal(){return Promise.resolve({data:[],error:null});}};return query;};
 router=createMemoryRouter(testRouter.routes,{initialEntries:['/admin/orders/missing?status=placed']});await mount(React.createElement(RouterProvider,{router}));assert.ok(host.querySelector('.admin-workspace'));assert.match(host.textContent,/Order not found/);assert.equal(host.querySelector('footer'),null);
 await click(Array.from(host.querySelectorAll('a')).find(a=>a.textContent==='Back to orders'));assert.equal(router.state.location.pathname,'/admin/orders');assert.equal(router.state.location.search,'?status=placed');await act(async()=>router.navigate(-1));assert.equal(router.state.location.pathname,'/admin/orders/missing');assert.match(host.textContent,/Order not found/);await act(async()=>router.navigate(1));assert.equal(router.state.location.pathname,'/admin/orders');assert.equal(subscriptions,1);assert.equal(restores,1);
});

test('explicit unconfirmed state survives cleared error presentation without creating another mutation',async()=>{
 const {AdminForm}=await module('features/admin/AdminForm.tsx');const view=error=>React.createElement(AdminForm,{error,uncertain:true},React.createElement('input',{defaultValue:'retained'}));await mount(view('Unconfirmed transport.'));await render(view(''));assert.equal(host.querySelector('form').dataset.adminUncertain,'true');assert.match(host.textContent,/earlier save was not confirmed/);assert.equal(host.querySelector('input').value,'retained');
});

test('StrictMode listener setup and cleanup confirms Sign Out once and releases listeners on unmount',async()=>{
 const {AdminForm}=await module('features/admin/AdminForm.tsx');const {useAdminDraftNavigation}=await module('features/admin/adminFormBehavior.ts');let prompts=0,logout=0;
 function View(){const node=useRef(null);useAdminDraftNavigation(node,true);return React.createElement('div',{ref:node},React.createElement(AdminForm,null,React.createElement('button',{type:'button','data-admin-draft-change':true},'Edit')),React.createElement('button',{'data-admin-leave':true,onClick:()=>logout++},'Sign Out'));}
 window.confirm=()=>{prompts++;return false;};await mount(React.createElement(React.StrictMode,null,React.createElement(View)));await click(host.querySelector('[data-admin-draft-change]'));await click(host.querySelector('[data-admin-leave]'));assert.equal(prompts,1);assert.equal(logout,0);
 await act(async()=>root.unmount());root=undefined;const event=new window.Event('beforeunload',{cancelable:true});window.dispatchEvent(event);assert.equal(event.defaultPrevented,false);
});

test('membership cancellation makes no mutation; failed revoke retains reason after reload and hides stale actions',async()=>{
 const {MembershipManager}=await module('features/admin/MembershipManager.tsx');const {AuthContext}=await module('features/auth/AuthContext.ts');const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';let pending=deferred();const calls=[];
 fakeClient((name,args)=>{if(name==='admin_list_memberships')return Promise.resolve({data:[{user_id:id,active:true,created_at:null,updated_at:'2026-10-08T00:00:00Z'}],error:null});if(name==='admin_membership_history')return Promise.resolve({data:[],error:null});calls.push({name,args});return pending.promise;});
 await mount(React.createElement(AuthContext.Provider,{value:{session:{user:{id:other}},loading:false,error:null}},React.createElement(MembershipManager,{token:'synthetic-token'})));
 await act(async()=>inputValue(host.querySelector('textarea'),'LOCAL TEST revocation'));window.confirm=()=>false;await submit(host.querySelector('form'));assert.equal(calls.length,0);assert.equal(host.querySelector('textarea').value,'LOCAL TEST revocation');window.confirm=()=>true;await submit(host.querySelector('form'));assert.equal(calls.length,1);await act(async()=>pending.resolve({data:null,error:{code:'transport'}}));assert.equal(host.querySelector('textarea'),null);await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Reload memberships'));assert.equal(host.querySelector('textarea').value,'LOCAL TEST revocation');assert.ok(host.querySelector('[data-admin-uncertain="true"]'));assert.match(host.textContent,/previous revocation was not confirmed/);
});

test('reviewed media selection after an uncertain save keeps the review warning and canonical draft without auto-saving',async()=>{
 const {ProductMedia}=await module('features/admin/ProductMedia.tsx');let pending=deferred();const calls=[];fakeClient((name,args)=>{if(name==='admin_media_assets')return Promise.resolve({data:['/images/mug.svg','/images/arch-vase.webp'],error:null});if(name==='admin_product_gallery_v1')return Promise.resolve({data:{items:[],updated_at:'2026-10-08T00:00:00Z'},error:null});assert.equal(name,'admin_set_product_media');calls.push({name,args});return pending.promise;});
 const product={id:'synthetic-product',name:'LOCAL TEST',image_path:'/images/mug.svg',updated_at:'2026-10-08T00:00:00Z'};await mount(React.createElement(ProductMedia,{product,token:'synthetic-token',saved(){throw new Error('Unexpected success');}}));await act(async()=>host.querySelector('.admin-media-preview').dispatchEvent(new window.Event('load')));await submit(host.querySelector('form'));assert.equal(calls.length,1);assert.equal(calls[0].args.p_path,'/images/mug.svg');await act(async()=>pending.resolve({data:null,error:{code:'transport'}}));
 await click(host.querySelector('[value="/images/arch-vase.webp"]'));assert.equal(host.querySelector('form').dataset.adminUncertain,'true');assert.match(host.textContent,/earlier save was not confirmed/);assert.equal(calls.length,1);assert.equal(product.image_path,'/images/mug.svg');
});

test('real product-workspace Cancel confirmation retains edited draft on decline and returns focus to catalogue notice on acceptance',async()=>{
 const {ProductManager}=await module('features/admin/ProductManager.tsx');const mutations=[];fakeClient((name,args)=>{if(name==='admin_products_page_v1')return Promise.resolve({data:[],error:null});if(name==='admin_media_assets')return Promise.resolve({data:['/images/mug.svg'],error:null});mutations.push({name,args});throw new Error('Unexpected mutation');});
 await mount(React.createElement(ProductManager,{token:'synthetic-token'}));await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Create product'));await act(async()=>inputValue(host.querySelector('[name="name"]'),'LOCAL TEST retained draft'));
 window.confirm=()=>false;await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Cancel'));assert.equal(host.querySelector('[name="name"]').value,'LOCAL TEST retained draft');assert.equal(mutations.length,0);
 window.confirm=()=>true;await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Cancel'));assert.equal(host.querySelector('[name="name"]'),null);assert.equal(document.activeElement,host.querySelector('.admin-save-notice'));assert.match(host.textContent,/Returned to catalogue/);assert.equal(mutations.length,0);
});

test('products initial loading has one announcement; malformed/private response fails closed and read retry reaches empty without mutation',async()=>{
 const {ProductManager}=await module('features/admin/ProductManager.tsx');let read=deferred();const calls=[];fakeClient((name,args)=>{calls.push({name,args});assert.equal(name,'admin_products_page_v1');return read.promise;});await mount(React.createElement(ProductManager,{token:'synthetic-token'}));assert.equal(host.querySelectorAll('[role="status"]').length,1);assert.match(host.textContent,/Loading products/);assert.equal(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Create product').disabled,true);
 await act(async()=>read.resolve({data:[{name:'synthetic-private-malformed'}],error:null}));assert.doesNotMatch(host.textContent,/synthetic-private-malformed/);assert.match(host.textContent,/could not be loaded or validated/);read=deferred();await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Retry loading products'));assert.equal(calls.length,2);await act(async()=>read.resolve({data:[],error:null}));assert.match(host.textContent,/No products match/);assert.equal(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Create product').disabled,false);
});

test('variants malformed reads offer safe retry; valid canonical projection restores options and malformed save cannot announce success',async()=>{
 const {VariantManager}=await module('features/admin/VariantManager.tsx');const row={id:'default:local',product_id:'local',sku:'DEFAULT-local',options:{},is_default:true,price_cents:100,currency:'NLE',active:false,inventory_policy:'untracked',updated_at:'2026-10-08T00:00:00Z'};let reads=0,writes=0,pending=deferred();
 fakeClient(name=>{if(name==='admin_list_variants'){reads++;return Promise.resolve({data:reads===1?[{sku:'private-malformed'}]:[row],error:null});}assert.equal(name,'admin_save_variant');writes++;return pending.promise;});await mount(React.createElement(VariantManager,{productId:'local',token:'synthetic-token'}));assert.doesNotMatch(host.textContent,/private-malformed/);await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Retry loading variants'));assert.match(host.textContent,/SKU: DEFAULT-local/);await click(host.querySelector('.admin-variant-prices button'));await act(async()=>inputValue(host.querySelector('[name="price"]'),'2.50'));await submit(host.querySelector('form'));await act(async()=>pending.resolve({data:{},error:null}));assert.equal(writes,1);assert.doesNotMatch(host.textContent,/Variant save confirmed/);assert.equal(host.querySelector('[name="price"]').value,'2.50');assert.equal(host.querySelector('form').dataset.adminUncertain,'true');
 pending=deferred();await submit(host.querySelector('form'));await act(async()=>pending.resolve({data:{...row,price_cents:250},error:null}));assert.match(host.textContent,/Variant save confirmed/);assert.equal(writes,2);assert.equal(reads,3);
});

test('independent inventory history retry retains draft and original uncertain receipt; denial hides balances/actions until validated read succeeds',async()=>{
 const {InventoryEditor}=await module('features/admin/InventoryManager.tsx');const calls=[];let historyReads=0,read=deferred(),write=deferred(),saved=0;
 fakeClient((name,args)=>{calls.push({name,args});if(name==='admin_inventory_history'){historyReads++;return historyReads===1?Promise.resolve({data:null,error:{code:'transport',message:'private-backend'}}):read.promise;}assert.equal(name,'admin_adjust_inventory');return write.promise;});
 const row={variant_id:'local',product_name:'LOCAL TEST sensitive product',sku:'LOCAL',options:{},inventory_policy:'tracked',on_hand:10,allocated:0,updated_at:'2026-10-08T00:00:00Z'};await mount(React.createElement(InventoryEditor,{row,token:'synthetic-token',saved(){saved++;}}));assert.doesNotMatch(host.textContent,/private-backend/);await act(async()=>{inputValue(host.querySelector('[name="delta"]'),'2');inputValue(host.querySelector('textarea'),'LOCAL TEST reason');});await submit(host.querySelector('form'));const id=calls.find(call=>call.name==='admin_adjust_inventory').args.p_operation_id;await act(async()=>write.resolve({data:null,error:{code:'transport'}}));
 await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Retry inventory history'));await act(async()=>read.resolve({data:null,error:{code:'42501',message:'private-denial'}}));assert.doesNotMatch(host.textContent,/sensitive product|private-denial/);assert.equal(host.querySelector('form'),null);read=deferred();await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Retry inventory history'));assert.equal(host.querySelector('form'),null);await act(async()=>read.resolve({data:[],error:null}));assert.equal(host.querySelector('textarea').value,'LOCAL TEST reason');assert.equal(host.querySelector('[name="delta"]').value,'2');assert.equal(calls.filter(call=>call.name==='admin_adjust_inventory').length,1);
 write=deferred();await submit(host.querySelector('form'));const writes=calls.filter(call=>call.name==='admin_adjust_inventory');assert.equal(writes[1].args.p_operation_id,id);await act(async()=>write.resolve({data:{on_hand:12,allocated:0},error:null}));assert.equal(saved,1);
});

test('membership history read failure/retry remains independent from membership rows and retained reason; denied history hides actions',async()=>{
 const {MembershipManager}=await module('features/admin/MembershipManager.tsx');const {AuthContext}=await module('features/auth/AuthContext.ts');const uid='11111111-1111-4111-8111-111111111111';let memberReads=0,historyReads=0,read=deferred();const calls=[];
 fakeClient(name=>{calls.push(name);if(name==='admin_list_memberships'){memberReads++;return Promise.resolve({data:[{user_id:uid,active:true,created_at:null,updated_at:'2026-10-08T00:00:00Z'}],error:null});}assert.equal(name,'admin_membership_history');historyReads++;return read.promise;});await mount(React.createElement(AuthContext.Provider,{value:{session:{user:{id:'22222222-2222-4222-8222-222222222222'}}}},React.createElement(MembershipManager,{token:'synthetic-token'})));
 await act(async()=>inputValue(host.querySelector('textarea'),'LOCAL TEST retained'));await act(async()=>read.resolve({data:null,error:{code:'transport',message:'private-detail'}}));assert.ok(host.querySelector('textarea'));assert.doesNotMatch(host.textContent,/private-detail/);read=deferred();await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Retry membership history'));assert.equal(memberReads,1);assert.equal(host.querySelector('textarea').value,'LOCAL TEST retained');await act(async()=>read.resolve({data:null,error:{code:'42501'}}));assert.equal(host.querySelector('textarea'),null);assert.doesNotMatch(host.textContent,new RegExp(uid));assert.equal(historyReads,2);assert.ok(calls.every(name=>name.startsWith('admin_list')||name==='admin_membership_history'));
});

test('order-history denial hides snapshot and disables retained operation draft; history retry never repeats the original mutation',async()=>{
 const {AdminOrderDetailState}=await module('features/admin/OrderManager.tsx');const calls=[];let read=deferred(),write=deferred(),saved=0;
 const order={id:'11111111-1111-4111-8111-111111111111',order_reference:'LH-AAAAAAAAAAAAAAAA',created_at:'2026-10-08T00:00:00Z',total_cents:100,currency:'NLE',fulfilment_method:'pickup',status:'placed',payment_status:'awaiting_payment',full_name:'LOCAL TEST private name',customer_email:'customer@example.invalid',customer_phone:'+23276521208',delivery_street_address:null,delivery_area:null,delivery_city:null,delivery_zone_label:null,delivery_instructions:null,pickup_location:'LOCAL TEST pickup',payment_provider:'orange',payment_phone_last4:'1208',subtotal_cents:100,delivery_fee_cents:0,order_items:[{product_name:'LOCAL TEST item',quantity:1,unit_price_cents:100}]};
 fakeClient((name,args)=>{calls.push({name,args});if(name==='admin_get_cancellation_request')return Promise.resolve({data:null,error:null});if(name==='admin_order_history')return read.promise;assert.equal(name,'admin_transition_order');return write.promise;});await mount(React.createElement(AdminOrderDetailState,{state:{status:'ready',order},token:'synthetic-token',saved(){saved++;},retry(){throw new Error('Detail retry was not requested');}}));host.querySelector('textarea').value='LOCAL TEST reason';window.confirm=()=>true;await submit(host.querySelector('form'));const id=calls.find(call=>call.name==='admin_transition_order').args.p_operation_id;await act(async()=>write.resolve({data:null,error:{code:'transport'}}));await act(async()=>read.resolve({data:null,error:{code:'42501',message:'private-denial'}}));assert.doesNotMatch(host.textContent,/LOCAL TEST private name|private-denial/);assert.equal(host.querySelector('form').closest('[hidden]').hidden,true);assert.equal(host.querySelector('form fieldset').disabled,true);await submit(host.querySelector('form'));assert.equal(calls.filter(call=>call.name==='admin_transition_order').length,1);
 read=deferred();await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Retry history'));await act(async()=>read.resolve({data:[],error:null}));assert.equal(host.querySelector('textarea').value,'LOCAL TEST reason');write=deferred();await submit(host.querySelector('form'));assert.equal(calls.filter(call=>call.name==='admin_transition_order')[1].args.p_operation_id,id);await act(async()=>write.resolve({data:{id:order.id,status:'confirmed',payment_status:'paid'},error:null}));assert.equal(saved,0);assert.match(host.textContent,/not confirmed/);assert.equal(host.querySelector('form').dataset.adminUncertain,'true');
});

test('null cancellation mutation result is uncertain rather than fabricated success; read retry preserves original reason',async()=>{
 const {CancellationRequest}=await module('features/orders/CancellationRequest.tsx');let writes=0;fakeClient(name=>{if(name==='customer_get_cancellation_request')return Promise.resolve({data:null,error:null});assert.equal(name,'customer_cancellation_request');writes++;return Promise.resolve({data:null,error:null});});await mount(React.createElement(CancellationRequest,{orderId:'synthetic-order',status:'placed',token:'synthetic-token'}));await act(async()=>inputValue(host.querySelector('textarea'),'LOCAL TEST reason'));await submit(host.querySelector('form'));assert.match(host.textContent,/could not be confirmed/);assert.doesNotMatch(host.textContent,/Cancellation request: pending/);await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Reload request'));assert.equal(host.querySelector('textarea').value,'LOCAL TEST reason');assert.equal(writes,1);
});

test('catalogue registry denial hides and disables the retained product form; validated read recovery preserves original creation receipt',async()=>{
 const {ProductManager}=await module('features/admin/ProductManager.tsx');let read=deferred(),write=deferred(),mediaReads=0;const writes=[];
 fakeClient((name,args)=>{if(name==='admin_products_page_v1')return Promise.resolve({data:[],error:null});if(name==='admin_media_assets'){mediaReads++;return mediaReads===1?Promise.resolve({data:['/images/mug.svg'],error:null}):read.promise;}assert.equal(name,'admin_create_product');writes.push(args);return write.promise;});
 await mount(React.createElement(ProductManager,{token:'synthetic-token'}));await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Create product'));await act(async()=>host.querySelector('.admin-media-preview').dispatchEvent(new window.Event('load')));
 for(const [name,value] of [['name','LOCAL TEST retained'],['description','LOCAL TEST description'],['initial_price','12.50']])host.querySelector(`[name="${name}"]`).value=value;await act(async()=>inputValue(host.querySelector('[name="category"]'),'LOCAL TEST'));
 const form=host.querySelector('form');await submit(form);const id=writes[0].p_operation_id;await act(async()=>write.resolve({data:null,error:{code:'transport'}}));await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Reload reviewed images'));await act(async()=>read.resolve({data:null,error:{code:'42501',message:'private-provider'}}));assert.equal(form.hidden,true);assert.equal(form.querySelector('fieldset').disabled,true);await submit(form);assert.equal(writes.length,1);assert.doesNotMatch(host.textContent,/private-provider/);
 read=deferred();await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Reload media'));assert.equal(form.hidden,true);await act(async()=>read.resolve({data:['/images/mug.svg'],error:null}));assert.equal(form.hidden,false);assert.equal(host.querySelector('[name="name"]').value,'LOCAL TEST retained');await act(async()=>host.querySelector('.admin-media-preview').dispatchEvent(new window.Event('load')));write=deferred();await submit(form);assert.equal(writes[1].p_operation_id,id);await act(async()=>write.resolve({data:{},error:null}));assert.doesNotMatch(host.textContent,/Product saved successfully/);
});

test('administration gate read retry rechecks authority without navigation or a mutation',async()=>{
 const {AdminPage}=await module('features/admin/AdminPage.tsx');const {AuthContext}=await module('features/auth/AuthContext.ts');let reads=0;fakeClient(name=>{assert.equal(name,'business_access_v1');reads++;return Promise.resolve({data:reads>1?'legacy':null,error:reads>1?null:{code:'42501'}});});router=createMemoryRouter([{path:'/admin/*',element:React.createElement(AuthContext.Provider,{value:{session:{user:{id:'synthetic-admin',email:'admin@example.invalid'},access_token:'synthetic-token'},loading:false}},React.createElement(AdminPage))}],{initialEntries:['/admin']});await mount(React.createElement(RouterProvider,{router}));assert.equal(host.querySelector('.admin-workspace'),null);await click(Array.from(host.querySelectorAll('button')).find(button=>button.textContent==='Retry access check'));assert.ok(host.querySelector('.admin-workspace'));assert.equal(reads,2);assert.equal(router.state.location.pathname,'/admin');
});
