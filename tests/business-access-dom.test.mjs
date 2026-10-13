import assert from 'node:assert/strict';
import {test,before,after,afterEach} from 'node:test';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost/'});
for(const name of ['window','document','Element','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','MutationObserver','FormData'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
let server,root;const host=dom.window.document.getElementById('root');
before(async()=>{server=await createServer({root:process.cwd(),configFile:false,envDir:false,server:{middlewareMode:true,hmr:false},plugins:[{name:'isolated-business-access',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/lib/supabase/client.ts'))return 'export function getSupabaseClient(){return globalThis.__roleClient;}';}}]});});
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=undefined;host.replaceChildren();delete globalThis.__roleClient;});
after(async()=>{await server.close();dom.window.close();});
const module=path=>server.ssrLoadModule('/src/features/'+path);
function client(handler){const calls=[];const value={rpc(name,args){return {setHeader(key,token){assert.equal(key,'Authorization');calls.push({name,args,token});return Promise.resolve(handler(name,args,token));}};}};globalThis.__roleClient=value;return {value,calls};}
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}
async function mount(node){root=createRoot(host);await act(async()=>root.render(node));}
async function click(label){const button=Array.from(host.querySelectorAll('button')).find(node=>node.textContent===label);assert.ok(button);await act(async()=>button.click());}
const order={order_reference:'LH-FIXTURE',created_at:'2026-10-11T00:00:00Z',status:'placed',total_cents:100};

test('trusted own-role check fails closed, freezes bearer and only missing migration permits compatibility fallback',async()=>{
 const {checkBusinessAccess}=await module('admin/businessAccess.ts');
 for(const role of ['owner','staff','legacy']){const {value,calls}=client(()=>({data:role,error:null}));assert.equal(await checkBusinessAccess(value,'synthetic'),role);assert.equal(calls[0].token,'Bearer synthetic');}
 for(const code of ['42501','transport']){const {value,calls}=client(()=>({data:null,error:{code}}));if(code==='42501')assert.equal(await checkBusinessAccess(value,'x'),null);else await assert.rejects(checkBusinessAccess(value,'x'));assert.equal(calls.length,1);}
 for(const code of ['PGRST202','42883']){const {value,calls}=client(name=>({data:name==='is_business_admin'?true:null,error:name==='business_access_v1'?{code}:null}));assert.equal(await checkBusinessAccess(value,'x'),'legacy');assert.deepEqual(calls.map(c=>c.name),['business_access_v1','is_business_admin']);}
 const {value}=client(()=>({data:{role:'owner',user_id:'spoof'},error:null}));await assert.rejects(checkBusinessAccess(value,'x'));
});
test('staff parsers project only approved fields and reject malformed counts, pages and statuses',async()=>{
 const {parseStaffOrders,parseStaffDashboard}=await module('admin/businessAccess.ts');
 const result=parseStaffOrders({items:[{...order,customer_email:'private@example.invalid',payment_status:'paid',id:'private'}],has_more:false});assert.deepEqual(result,{items:[order],has_more:false});assert.deepEqual(parseStaffDashboard({open_orders:1,completed_orders:0,cancelled_orders:0,awaiting_payment:1}),{open_orders:1,completed_orders:0,cancelled_orders:0});
 for(const value of [null,{items:[],has_more:'true'},{items:[{...order,status:'paid'}],has_more:false},{items:[{...order,total_cents:-1}],has_more:false},{items:[order,order],has_more:false}])assert.throws(()=>parseStaffOrders(value));assert.throws(()=>parseStaffDashboard({open_orders:-1,completed_orders:0,cancelled_orders:0}));
});
test('staff gate exposes only read-only summaries and no owner links or mutation calls',async()=>{
 const {AdminPage}=await module('admin/AdminPage.tsx');const {AuthContext}=await module('auth/AuthContext.ts');
 const {calls}=client(name=>{if(name==='business_access_v1')return {data:'staff',error:null};assert.equal(name,'staff_orders_page_v1');return {data:{items:[{...order,customer_email:'private@example.invalid',payment_phone_last4:'1208'}],has_more:false},error:null};});
 await mount(React.createElement(MemoryRouter,{initialEntries:['/admin/orders']},React.createElement(AuthContext.Provider,{value:{session:{user:{id:'fixture'},access_token:'synthetic'},loading:false}},React.createElement(Routes,null,React.createElement(Route,{path:'/admin/*',element:React.createElement(AdminPage)})))));
 for(const expected of [/Staff workspace/,/LH-FIXTURE/,/NLe 1/])assert.match(host.textContent,expected);assert.doesNotMatch(host.textContent,/private@example.invalid|1208|Products|Inventory|Export|Payment/);assert.equal(host.querySelector('a[href^="/admin/orders/"]'),null);assert.equal(host.querySelector('form'),null);assert.deepEqual(calls.map(c=>c.name),['business_access_v1','staff_orders_page_v1']);
});
test('staff deep links to products, membership, inventory and order details never mount privileged components',async()=>{
 const {StaffWorkspace}=await module('admin/StaffWorkspace.tsx');const {calls}=client(()=>{throw new Error('Forbidden RPC');});
 for(const path of ['/admin/products','/admin/inventory','/admin/memberships','/admin/orders/private']){
  const node=React.createElement(MemoryRouter,{key:path,initialEntries:[path]},React.createElement(Routes,null,React.createElement(Route,{path:'/admin/*',element:React.createElement(StaffWorkspace,{token:'x'})})));if(!root)await mount(node);else await act(async()=>root.render(node));assert.match(host.textContent,/Access unavailable/);assert.equal(host.querySelector('form'),null);
 }assert.equal(calls.length,0);
});
test('staff orders hide prior page on reload/denial, retain pagination and ignore old account responses',async()=>{
 const {StaffOrders}=await module('admin/StaffWorkspace.tsx');let pending=deferred();const {calls}=client(()=>pending.promise);
 await mount(React.createElement(StaffOrders,{token:'a'}));await act(async()=>pending.resolve({data:{items:[order],has_more:true},error:null}));assert.match(host.textContent,/LH-FIXTURE/);
 pending=deferred();await click('Next page');assert.doesNotMatch(host.textContent,/LH-FIXTURE/);assert.equal(calls.at(-1).args.p_page,1);await act(async()=>pending.resolve({data:{items:[],has_more:false},error:null}));assert.match(host.textContent,/No orders/);
 pending=deferred();await click('Reload orders');const old=pending;pending=deferred();await act(async()=>root.render(React.createElement(StaffOrders,{token:'b'})));await act(async()=>old.resolve({data:{items:[order],has_more:false},error:null}));assert.doesNotMatch(host.textContent,/LH-FIXTURE/);await act(async()=>pending.resolve({data:null,error:{code:'42501',message:'private-backend'}}));assert.match(host.textContent,/access was denied/);assert.doesNotMatch(host.textContent,/LH-FIXTURE|private-backend/);
});
test('staff dashboard only renders counts and own profile has sign-out without global access links',async()=>{
 const {StaffOverview}=await module('admin/StaffWorkspace.tsx');const {AdminProfile}=await module('admin/AdminProfile.tsx');const {AuthContext}=await module('auth/AuthContext.ts');
 let signedOut=0;client(name=>({data:name==='staff_dashboard_v1'?{open_orders:2,completed_orders:1,cancelled_orders:0,customer_email:'private'}:'staff',error:null}));
 await mount(React.createElement(StaffOverview,{token:'x'}));assert.match(host.textContent,/Open orders/);assert.doesNotMatch(host.textContent,/private/);
 await act(async()=>root.render(React.createElement(AuthContext.Provider,{value:{session:{user:{id:'fixture',email:'own@example.invalid',user_metadata:{name:'Own profile'},app_metadata:{provider:'google'}}},signOut:async()=>{signedOut++;}}},React.createElement(AdminProfile,{token:'x',role:'staff'}))));assert.match(host.textContent,/own@example.invalid|Staff: read-only/);assert.equal(host.querySelector('a[href="/admin/memberships"]'),null);await click('Sign Out');assert.equal(signedOut,0);await click('Cancel');assert.equal(signedOut,0);await click('Sign Out');await click('Sign out');assert.equal(signedOut,1);
});
