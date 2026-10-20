import assert from 'node:assert/strict';
import {test,before,after,afterEach} from 'node:test';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import {MemoryRouter,Routes,Route} from 'react-router-dom';

// Isolated customer-authentication DOM evidence. Supabase Auth is replaced at
// the module boundary with an injected synthetic session; no credential,
// endpoint, Google or hosted Supabase call is made.
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost/'});
for(const name of ['window','document','HTMLElement'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const host=dom.window.document.getElementById('root');
let server,root,AuthContext,ProductContext,CartContext,Layout;

before(async()=>{
  server=await createServer({root:process.cwd(),configFile:false,envDir:false,server:{middlewareMode:true,hmr:false},plugins:[{name:'account-auth-fixture',enforce:'pre',load(id){
    if(id.replaceAll('\\','/').endsWith('/src/lib/supabase/client.ts'))return 'export function getSupabaseClient(){return globalThis.__accountAuthClient;}';
  }}]});
  ({AuthContext}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({ProductContext}=await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
  ({CartContext}=await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
  ({Layout}=await server.ssrLoadModule('/src/components/Layout.tsx'));
});
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=undefined;host.replaceChildren();dom.window.sessionStorage.clear();delete globalThis.__accountAuthClient;});
after(async()=>{await server.close();dom.window.close();});

function fakeClient(){
  const calls=[];
  const client={
    from(table){calls.push({table});return {select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:null})};},
    auth:{signOut:async()=>({error:null})},
    rpc(name){calls.push({rpc:name});return Promise.reject(new Error('No privileged read may occur in the customer auth flow'));},
  };
  return {client,calls};
}
const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});};
async function mount(path,value,element){root=createRoot(host);await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(AuthContext.Provider,{value},element))));}
const auth=overrides=>({loading:false,session:null,error:null,signIn:async()=>{},signOut:async()=>{},...overrides});

test('sign-out swaps the header initials badge for the guest Account link without navigating',async()=>{
  const session={access_token:'synthetic-jwt',user:{id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid',user_metadata:{full_name:'Fixture Customer'}}};
  let updateSession;
  function Harness(){
    const [sessionValue,setSessionValue]=React.useState(session);
    updateSession=setSessionValue;
    return React.createElement(AuthContext.Provider,{value:auth({session:sessionValue,signOut:async()=>setSessionValue(null)})},
      React.createElement(ProductContext.Provider,{value:{state:{status:'loading'},refresh(){}}},
        React.createElement(CartContext.Provider,{value:{items:[],dispatch(){},status:'ready',retry(){},beginCheckout:()=>1,finishCheckout(){}}},
          React.createElement(MemoryRouter,{initialEntries:['/']},React.createElement(Routes,null,
            React.createElement(Route,{element:React.createElement(Layout)},
              React.createElement(Route,{path:'*',element:React.createElement('h1',null,'Page')})))))));
  }
  root=createRoot(host);
  await act(async()=>root.render(React.createElement(Harness)));
  const link=host.querySelector('a[href="/account"]');
  assert.ok(link);
  assert.equal(link.getAttribute('aria-label'),'Account, signed in');
  assert.equal(link.querySelector('.account-badge')?.textContent,'FC');
  assert.doesNotMatch(host.querySelector('header').textContent,/fixture@example\.invalid|Fixture Customer/);
  await act(async()=>updateSession(null));
  const guestLink=host.querySelector('a[href="/account"]');
  assert.ok(guestLink);
  assert.equal(guestLink.textContent,'Account');
  assert.equal(guestLink.getAttribute('aria-label'),null);
  assert.equal(guestLink.querySelector('.account-badge'),null);
  assert.match(host.textContent,/Page/,'sign-out must not navigate away');
});

test('guest account renders the Google sign-in control and one click invokes the existing signIn once',async()=>{
  const {AccountPage}=await server.ssrLoadModule('/src/features/account/AccountPage.tsx');
  let invoked=0;
  await mount('/account',auth({signIn:async()=>{invoked++;}}),React.createElement(AccountPage));
  assert.match(host.textContent,/Welcome to/);
  const button=Array.from(host.querySelectorAll('button')).find(node=>/Sign in with Google/.test(node.textContent));
  assert.ok(button,'guest account must expose the Google sign-in control');
  await act(async()=>button.click());
  assert.equal(invoked,1);
});

test('restoring an unresolved session shows a status and no actionable sign-in control',async()=>{
  const {AccountPage}=await server.ssrLoadModule('/src/features/account/AccountPage.tsx');
  await mount('/account',auth({loading:true,signIn:async()=>assert.fail('must not start sign-in while restoring')}),React.createElement(AccountPage));
  assert.match(host.textContent,/Restoring your session/);
  assert.equal(host.querySelector('button.google-sign-in'),null);
});

test('a sign-in error is announced with accessible alert semantics',async()=>{
  const {AccountPage}=await server.ssrLoadModule('/src/features/account/AccountPage.tsx');
  await mount('/account',auth({error:'Google sign-in could not start. Please try again.'}),React.createElement(AccountPage));
  const alert=host.querySelector('[role="alert"]');
  assert.ok(alert,'auth errors must use alert semantics');
  assert.match(alert.textContent,/Google sign-in could not start\. Please try again\./);
});

test('a restored customer session at /auth/callback continues into the customer account flow',async()=>{
  const {AuthCallback}=await server.ssrLoadModule('/src/features/auth/CustomerRoutes.tsx');
  const {AccountPage}=await server.ssrLoadModule('/src/features/account/AccountPage.tsx');
  globalThis.__accountAuthClient=fakeClient().client;
  await mount('/auth/callback',auth({session:{user:{id:'customer-fixture',email:'customer@example.invalid'}}}),
    React.createElement(Routes,null,
      React.createElement(Route,{path:'/auth/callback',element:React.createElement(AuthCallback)}),
      React.createElement(Route,{path:'/account',element:React.createElement(AccountPage)})));
  await flush();
  assert.match(host.textContent,/Signed in with Google/);
  assert.match(host.textContent,/Sign Out/);
});

test('/auth/callback without a completed session renders a safe sign-in fallback',async()=>{
  const {AuthCallback}=await server.ssrLoadModule('/src/features/auth/CustomerRoutes.tsx');
  await mount('/auth/callback',auth(),React.createElement(AuthCallback));
  assert.match(host.textContent,/Sign-in was not completed\. Please try again\./);
  assert.match(host.textContent,/Sign in with Google/);
  assert.doesNotMatch(host.textContent,/Signed in with Google/);
});

test('a customer callback performs no privileged read and leaves admin intent untouched while restoring',async()=>{
  const {AuthCallback}=await server.ssrLoadModule('/src/features/auth/CustomerRoutes.tsx');
  const {setAdminAuthIntent}=await server.ssrLoadModule('/src/features/auth/adminAuthIntent.ts');
  const {client,calls}=fakeClient();globalThis.__accountAuthClient=client;
  setAdminAuthIntent(dom.window.sessionStorage,'/admin/orders?status=placed');
  await mount('/auth/callback',auth({loading:true}),React.createElement(AuthCallback));
  assert.equal(dom.window.sessionStorage.length,1,'admin intent must not be consumed before the session resolves');
  assert.equal(calls.some(call=>'rpc' in call),false,'the customer auth flow may not perform privileged reads');
  assert.match(host.textContent,/Restoring your session/);
});

test('customer order routes stay protected for guests and expose no order data',async()=>{
  const {CustomerOrders}=await server.ssrLoadModule('/src/features/auth/CustomerRoutes.tsx');
  await mount('/account/orders',auth(),React.createElement(CustomerOrders));
  assert.match(host.textContent,/Sign in to view your orders/);
  assert.doesNotMatch(host.textContent,/LH-/);
});
