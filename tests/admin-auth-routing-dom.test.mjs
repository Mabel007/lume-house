import assert from 'node:assert/strict';
import {test,before,after,afterEach} from 'node:test';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/'});
for(const name of ['window','document','HTMLElement'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');const host=dom.window.document.getElementById('root');let server,root;
before(async()=>{server=await createServer({root:process.cwd(),configFile:false,envDir:false,server:{middlewareMode:true,hmr:false},plugins:[{name:'auth-route-fixtures',enforce:'pre',load(id){const path=id.replaceAll('\\','/');if(path.endsWith('/src/lib/supabase/client.ts'))return 'export function getSupabaseClient(){return globalThis.__authRouteClient;}';if(path.endsWith('/src/features/account/AccountPage.tsx'))return 'export function AccountPage(){return "Customer Account";}';if(path.endsWith('/src/features/admin/AdminWorkspace.tsx'))return 'export function AdminWorkspace(){return "Authorized Owner workspace";}';}}]});});
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=undefined;host.replaceChildren();dom.window.sessionStorage.clear();delete globalThis.__authRouteClient;});
after(async()=>{await server.close();dom.window.close();});
async function mount(path,value,element){const {AuthContext}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts');root=createRoot(host);await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(AuthContext.Provider,{value},element))));}
test('administration return paths are same-origin admin-only and single use; customer login clears old intent',async()=>{
 const {adminReturnPath,setAdminAuthIntent,consumeAdminAuthIntent}=await server.ssrLoadModule('/src/features/auth/adminAuthIntent.ts');
 for(const value of ['https://evil.invalid/admin','//evil.invalid/admin','/account','/administrator','/\\evil.invalid/admin'])assert.equal(adminReturnPath(value),null);
 const path='/admin/orders/fixture?status=placed#history';setAdminAuthIntent(dom.window.sessionStorage,path);assert.equal(consumeAdminAuthIntent(dom.window.sessionStorage),path);assert.equal(consumeAdminAuthIntent(dom.window.sessionStorage),null);
 setAdminAuthIntent(dom.window.sessionStorage,'/admin');setAdminAuthIntent(dom.window.sessionStorage);assert.equal(consumeAdminAuthIntent(dom.window.sessionStorage),null);
});
test('dedicated admin sign-in preserves deep link and performs no privileged reads before authentication',async()=>{
 const {AdminPage}=await server.ssrLoadModule('/src/features/admin/AdminPage.tsx');let target;globalThis.__authRouteClient={rpc(){assert.fail('Guest must not call privileged RPC');}};
 await mount('/admin/orders/fixture?status=placed',{session:null,loading:false,error:null,signIn:async path=>{target=path;}},React.createElement(AdminPage));
 assert.match(host.textContent,/Sign in to administration/);const button=Array.from(host.querySelectorAll('button')).find(x=>x.textContent==='Sign in to administration');await act(async()=>button.click());assert.equal(target,'/admin/orders/fixture?status=placed');assert.equal(host.querySelector('a[href="/account"]').textContent,'your Account');
});
test('OAuth callback consumes admin intent after session restoration and customer callback stays in Account',async()=>{
 const {AuthCallback}=await server.ssrLoadModule('/src/features/auth/CustomerRoutes.tsx');const {setAdminAuthIntent}=await server.ssrLoadModule('/src/features/auth/adminAuthIntent.ts');setAdminAuthIntent(dom.window.sessionStorage,'/admin/orders?status=placed');
 await mount('/auth/callback',{session:{user:{id:'fixture'}},loading:false},React.createElement(Routes,null,React.createElement(Route,{path:'/auth/callback',element:React.createElement(AuthCallback)}),React.createElement(Route,{path:'/admin/orders',element:'Preserved admin destination'})));
 assert.match(host.textContent,/Preserved admin destination/);assert.equal(dom.window.sessionStorage.length,0);
 await act(async()=>root.unmount());root=undefined;
 await mount('/auth/callback',{session:{user:{id:'customer'}},loading:false},React.createElement(AuthCallback));assert.equal(host.textContent,'Customer Account');
});
test('restoring session does not consume intent and a customer arriving at admin is denied by the trusted gate',async()=>{
 const {AuthCallback}=await server.ssrLoadModule('/src/features/auth/CustomerRoutes.tsx');const {setAdminAuthIntent}=await server.ssrLoadModule('/src/features/auth/adminAuthIntent.ts');setAdminAuthIntent(dom.window.sessionStorage,'/admin');
 await mount('/auth/callback',{session:null,loading:true},React.createElement(AuthCallback));assert.equal(dom.window.sessionStorage.length,1);await act(async()=>root.unmount());root=undefined;
 const {AdminPage}=await server.ssrLoadModule('/src/features/admin/AdminPage.tsx');globalThis.__authRouteClient={rpc(name){assert.equal(name,'business_access_v1');return {setHeader(){return Promise.resolve({data:null,error:{code:'42501'}});}};}};
 await mount('/admin',{session:{user:{id:'customer',user_metadata:{role:'owner'}},access_token:'synthetic'},loading:false,signOut:async()=>{}},React.createElement(AdminPage));assert.match(host.textContent,/does not have business administration access/);assert.doesNotMatch(host.textContent,/Authorized Owner workspace/);assert.match(host.textContent,/Use another account/);
});
