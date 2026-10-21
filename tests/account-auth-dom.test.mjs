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
let server,root,AuthContext,ProductContext,CartContext,Layout,AccountPage,NotificationProvider,useCart,useAuth,createSignOutController;

before(async()=>{
  server=await createServer({root:process.cwd(),configFile:false,envDir:false,server:{middlewareMode:true,hmr:false},plugins:[{name:'account-auth-fixture',enforce:'pre',load(id){
    if(id.replaceAll('\\','/').endsWith('/src/lib/supabase/client.ts'))return 'export function getSupabaseClient(){return globalThis.__accountAuthClient;}';
  }}]});
  ({AuthContext,useAuth}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({createSignOutController}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({ProductContext}=await server.ssrLoadModule('/src/features/products/ProductContext.ts'));
  ({CartContext}=await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
  ({useCart}=await server.ssrLoadModule('/src/features/cart/CartContext.ts'));
  ({Layout}=await server.ssrLoadModule('/src/components/Layout.tsx'));
  ({AccountPage}=await server.ssrLoadModule('/src/features/account/AccountPage.tsx'));
  ({NotificationProvider}=await server.ssrLoadModule('/src/components/NotificationProvider.tsx'));
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
async function mount(path,value,element){root=createRoot(host);await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(NotificationProvider,null,React.createElement(AuthContext.Provider,{value},element)))));}
// The context carries the shared single-in-flight sign-out controller. Harnesses
// override `signOut` with a stub; deriving the controller from the effective
// stub keeps them exercising the same guarantee the real AuthProvider provides.
const auth=overrides=>{const state={loading:false,session:null,error:null,signIn:async()=>{},signOut:async()=>({ok:true}),...overrides};state.signOutController=createSignOutController(state.signOut);return state;};

test('sign-out swaps the signed-in account trigger for the guest Account link without navigating',async()=>{
  const session={access_token:'synthetic-jwt',user:{id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid',user_metadata:{full_name:'Fixture Customer'}}};
  let updateSession;
  function Harness(){
    const [sessionValue,setSessionValue]=React.useState(session);
    updateSession=setSessionValue;
    return React.createElement(AuthContext.Provider,{value:auth({session:sessionValue,signOut:async()=>({ok:true})})},
      React.createElement(ProductContext.Provider,{value:{state:{status:'loading'},refresh(){}}},
        React.createElement(CartContext.Provider,{value:{items:[],dispatch(){},status:'ready',retry(){},beginCheckout:()=>1,finishCheckout(){}}},
          React.createElement(MemoryRouter,{initialEntries:['/']},React.createElement(Routes,null,
            React.createElement(Route,{element:React.createElement(Layout)},
              React.createElement(Route,{path:'*',element:React.createElement('h1',null,'Page')})))))));
  }
  root=createRoot(host);
  await act(async()=>root.render(React.createElement(Harness)));
  const trigger=host.querySelector('header button[aria-haspopup="menu"]');
  assert.ok(trigger,'the signed-in header must expose a menu trigger button');
  assert.equal(trigger.getAttribute('aria-label'),'Account, signed in');
  assert.equal(trigger.getAttribute('aria-expanded'),'false');
  assert.equal(trigger.querySelector('.account-badge')?.textContent,'FC');
  assert.doesNotMatch(host.querySelector('header').textContent,/fixture@example\.invalid|Fixture Customer/);
  await act(async()=>updateSession(null));
  const guestLink=host.querySelector('a[href="/account"]');
  assert.ok(guestLink);
  assert.equal(guestLink.textContent,'Account');
  assert.equal(guestLink.getAttribute('aria-label'),null);
  assert.equal(guestLink.querySelector('.account-badge'),null);
  assert.equal(host.querySelector('header button[aria-haspopup="menu"]'),null,'guest state must not expose the account menu trigger');
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
      React.createElement(Route,{path:'/account',element:React.createElement(NotificationProvider,null,React.createElement(AccountPage))})));
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

// --- Batch 1H: accessible signed-in account menu -----------------------------

const signedInSession={access_token:'synthetic-jwt',user:{id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid',user_metadata:{full_name:'Fixture Customer'}}};

// Renders the real Layout with a signed-in session so the header menu is exercised
// through its actual consumers rather than in isolation.
//
// The sign-out outcome is injected through the auth context, because that is the
// boundary `useCustomerSignOut` actually calls. When the provider resolves with
// success the harness clears the session, mirroring what AuthProvider does after a
// confirmed Supabase sign-out.
async function mountMenu({path='/',signOut=async()=>({ok:true})}={}){
  function Harness(){
    const [sessionValue,setSessionValue]=React.useState(signedInSession);
    const providerSignOut=React.useCallback(async()=>{
      const result=await signOut();
      if(result.ok)setSessionValue(null);
      return result;
    },[signOut]);
    return React.createElement(AuthContext.Provider,{value:auth({session:sessionValue,signOut:providerSignOut})},
      React.createElement(ProductContext.Provider,{value:{state:{status:'loading'},refresh(){}}},
        React.createElement(CartContext.Provider,{value:{items:[],dispatch(){},status:'ready',retry(){},beginCheckout:()=>1,finishCheckout(){}}},
          React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(Routes,null,
            React.createElement(Route,{element:React.createElement(Layout)},
              React.createElement(Route,{path:'*',element:React.createElement('h1',null,'Page')})))))));
  }
  root=createRoot(host);
  await act(async()=>root.render(React.createElement(Harness)));
  return host.querySelector('header button[aria-haspopup="menu"]');
}

const menuItems=()=>Array.from(host.querySelectorAll('[role="menu"] [role="menuitem"]'));
async function openWithClick(trigger){await act(async()=>trigger.click());}
async function press(element,key){await act(async()=>element.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})));}

test('the signed-in account menu exposes the profile, orders and sign-out destinations',async()=>{
  const trigger=await mountMenu();
  assert.equal(trigger.getAttribute('aria-expanded'),'false');
  assert.equal(host.querySelector('[role="menu"]'),null,'the menu must stay closed until invoked');
  await openWithClick(trigger);
  assert.equal(trigger.getAttribute('aria-expanded'),'true');
  const menu=host.querySelector('[role="menu"]');
  assert.ok(menu,'the trigger must open a menu');
  assert.equal(menu.getAttribute('aria-label'),'Account');
  assert.equal(menu.getAttribute('id'),trigger.getAttribute('aria-controls'));
  const items=menuItems();
  assert.deepEqual(items.map(node=>node.textContent),['My profile','My orders','Sign out']);
  assert.deepEqual(items.slice(0,2).map(node=>node.getAttribute('href')),['/account','/account/orders']);
  assert.equal(items[2].tagName,'BUTTON');
  assert.doesNotMatch(menu.textContent,/fixture@example\.invalid|Fixture Customer/,'the header menu must not expose identity details');
});

test('the account menu opens from the keyboard and moves focus between its items',async()=>{
  const trigger=await mountMenu();
  await press(trigger,'ArrowDown');
  assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.equal(dom.window.document.activeElement,menuItems()[0],'opening must focus the first item');
  await press(menuItems()[0],'ArrowDown');
  assert.equal(dom.window.document.activeElement,menuItems()[1]);
  await press(menuItems()[1],'ArrowDown');
  assert.equal(dom.window.document.activeElement,menuItems()[2],'ArrowDown must wrap to the last item');
  await press(menuItems()[2],'ArrowDown');
  assert.equal(dom.window.document.activeElement,menuItems()[0],'ArrowDown must wrap to the first item');
  await press(menuItems()[0],'ArrowUp');
  assert.equal(dom.window.document.activeElement,menuItems()[2],'ArrowUp must wrap from the first item');
  await press(menuItems()[0],'End');
  assert.equal(dom.window.document.activeElement,menuItems()[2]);
  await press(menuItems()[2],'Home');
  assert.equal(dom.window.document.activeElement,menuItems()[0]);
});

test('Escape closes the account menu and returns focus to the trigger',async()=>{
  const trigger=await mountMenu();
  await openWithClick(trigger);
  await press(menuItems()[0],'Escape');
  assert.equal(trigger.getAttribute('aria-expanded'),'false');
  assert.equal(host.querySelector('[role="menu"]'),null);
  assert.equal(dom.window.document.activeElement,trigger,'Escape must restore focus to the trigger');
});

test('an outside pointer press closes the account menu',async()=>{
  const trigger=await mountMenu();
  await openWithClick(trigger);
  assert.ok(host.querySelector('[role="menu"]'));
  // jsdom 26 does not construct PointerEvent, so dispatch a MouseEvent with the
  // pointerdown type the component listens for. The listener only reads target.
  await act(async()=>dom.window.document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,cancelable:true})));
  assert.equal(trigger.getAttribute('aria-expanded'),'false');
  assert.equal(host.querySelector('[role="menu"]'),null);
});

test('choosing My profile navigates to /account and closes the menu',async()=>{
  const trigger=await mountMenu();
  await openWithClick(trigger);
  const profile=menuItems()[0];
  assert.equal(profile.getAttribute('href'),'/account');
  await act(async()=>profile.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true})));
  assert.equal(host.querySelector('[role="menu"]'),null,'activating a destination must close the menu');
  assert.equal(trigger.getAttribute('aria-expanded'),'false');
});

test('choosing My orders navigates to /account/orders and closes the menu',async()=>{
  const trigger=await mountMenu();
  await openWithClick(trigger);
  const orders=menuItems()[1];
  assert.equal(orders.getAttribute('href'),'/account/orders');
  await act(async()=>orders.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true})));
  assert.equal(host.querySelector('[role="menu"]'),null,'activating a destination must close the menu');
});

test('a route change closes an open account menu',async()=>{
  const trigger=await mountMenu();
  await openWithClick(trigger);
  assert.ok(host.querySelector('[role="menu"]'));
  await act(async()=>host.querySelector('[role="menu"] a[href="/account/orders"]').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true})));
  assert.equal(host.querySelector('[role="menu"]'),null);
  assert.match(host.textContent,/Page/,'navigation must remain within the router');
});

// --- Batch 1I: sign-out outcome contract -------------------------------------

test('a successful sign-out clears the session and returns the guest Account link',async()=>{
  const trigger=await mountMenu();
  await openWithClick(trigger);
  const signOutItem=menuItems().find(node=>node.textContent==='Sign out');
  await act(async()=>signOutItem.click());
  assert.equal(host.querySelector('header button[aria-haspopup="menu"]'),null,'success must clear the authenticated UI');
  const guestLink=host.querySelector('header a[href="/account"]');
  assert.equal(guestLink?.textContent,'Account');
});

test('a failed sign-out preserves the session and shows a retryable error',async()=>{
  const trigger=await mountMenu({signOut:async()=>({ok:false,message:'Sign-out failed. Please try again.'})});
  await openWithClick(trigger);
  const signOutItem=menuItems().find(node=>node.textContent==='Sign out');
  await act(async()=>signOutItem.click());
  assert.ok(host.querySelector('header button[aria-haspopup="menu"]'),'failure must preserve the signed-in header');
  const alert=host.querySelector('.account-menu-error[role="alert"]');
  assert.ok(alert,'a failed sign-out must announce an error');
  assert.match(alert.textContent,/Sign-out failed\. Please try again\./);
});

test('the sign-out control disables while pending and rejects a duplicate attempt',async()=>{
  let resolveSignOut;
  let calls=0;
  const pending=new Promise(resolve=>{resolveSignOut=resolve;});
  const trigger=await mountMenu({signOut:async()=>{calls+=1;return pending;}});
  // The context guard rejects duplicates before the provider is reached, so count provider calls.
  await openWithClick(trigger);
  const signOutItem=menuItems().find(node=>node.textContent==='Sign out');
  assert.ok(signOutItem,'the menu must expose a Sign out control');
  await act(async()=>{signOutItem.click();});
  await act(async()=>{});
  assert.match(host.textContent,/Signing out…/,'a pending sign-out must be labelled');
  // Assert the specific Sign out control, not merely "some button is disabled".
  const control=host.querySelector('.account-menu-signout');
  assert.ok(control,'the Sign out control must remain mounted while pending');
  assert.equal(control.disabled,true,'the Sign out control itself must be disabled while pending');
  assert.equal(control.getAttribute('aria-busy'),'true');
  // A second activation of the same control must not reach the provider.
  await act(async()=>{control.click();});
  await act(async()=>{});
  assert.equal(calls,1,'a duplicate attempt must not issue another provider sign-out');
  await act(async()=>{resolveSignOut({ok:true});});
  assert.equal(calls,1,'only one provider sign-out may be issued');
});

test('sign-out reports success only after the provider confirms it',async()=>{
  let resolveSignOut;
  const trigger=await mountMenu({signOut:async()=>new Promise(resolve=>{resolveSignOut=resolve;})});
  await openWithClick(trigger);
  const signOutItem=menuItems().find(node=>node.textContent==='Sign out');
  await act(async()=>{signOutItem.click();});
  await act(async()=>{});
  assert.ok(host.querySelector('header button[aria-haspopup="menu"]'),'the session must survive until the provider confirms');
  await act(async()=>{resolveSignOut({ok:true});});
  assert.equal(host.querySelector('header button[aria-haspopup="menu"]'),null,'the session may only clear after confirmation');
});

// --- Batch 1I: account-page sign-out fallback ---------------------------------

// Renders the real AccountPage with a signed-in session so the page-level fallback
// action exercises the same hook and provider contract as the header menu.
async function mountAccountPage({signOut=async()=>({ok:true})}={}){
  function Harness(){
    const [sessionValue,setSessionValue]=React.useState(signedInSession);
    const providerSignOut=React.useCallback(async()=>{
      const result=await signOut();
      if(result.ok)setSessionValue(null);
      return result;
    },[signOut]);
    return React.createElement(AuthContext.Provider,{value:auth({session:sessionValue,signOut:providerSignOut,error:null})},
      React.createElement(ProductContext.Provider,{value:{state:{status:'loading'},refresh(){}}},
        React.createElement(CartContext.Provider,{value:{items:[],dispatch(){},status:'ready',retry(){},beginCheckout:()=>1,finishCheckout(){}}},
          React.createElement(MemoryRouter,{initialEntries:['/account']},React.createElement(Routes,null,
            React.createElement(Route,{path:'/account',element:React.createElement(NotificationProvider,null,React.createElement(AccountPage))}))))));
  }
  globalThis.__accountAuthClient=fakeClient().client;
  root=createRoot(host);
  await act(async()=>root.render(React.createElement(Harness)));
  return host.querySelector('.account-session button.text-link');
}

test('the account page keeps a fallback Sign Out control that shows a pending state',async()=>{
  let resolveSignOut;
  const control=await mountAccountPage({signOut:async()=>new Promise(resolve=>{resolveSignOut=resolve;})});
  assert.ok(control,'the account page must keep a fallback sign-out action');
  assert.equal(control.textContent,'Sign Out');
  await act(async()=>control.click());
  await act(async()=>{});
  const control2=host.querySelector('.account-session button.text-link');
  assert.equal(control2.textContent,'Signing out…','a pending sign-out must be labelled');
  assert.equal(control2.disabled,true,'duplicate attempts must be blocked while pending');
  await act(async()=>{resolveSignOut({ok:true});});
});

test('an account-page sign-out failure preserves the session and shows a retryable error',async()=>{
  const control=await mountAccountPage({signOut:async()=>({ok:false,message:'Sign-out failed. Please try again.'})});
  await act(async()=>control.click());
  const alert=host.querySelector('.account-session .feedback[role="alert"]');
  assert.ok(alert,'a failed page sign-out must announce an error');
  assert.match(alert.textContent,/Sign-out failed\. Please try again\./);
  const retry=host.querySelector('.account-session button.text-link');
  assert.equal(retry.textContent,'Sign Out','a failed sign-out must remain retryable');
  assert.equal(retry.disabled,false);
});

test('a confirmed account-page sign-out clears the authenticated view',async()=>{
  const control=await mountAccountPage();
  await act(async()=>control.click());
  assert.match(host.textContent,/Sign in with Google/,'a confirmed sign-out must return the guest sign-in view');
  assert.equal(host.querySelector('.account-session'),null);
});

// --- Batch 1I: shared in-flight guard across the header and the account page ---

// On /account the header menu and the account-page fallback are mounted together.
// Both read the same context sign-out controller, which owns a single-in-flight
// guard and the shared pending state, so a second activation while one request is
// pending must join it rather than issue another provider request. The harness
// builds its provider value with `auth()`, whose controller derivation mirrors
// the real AuthProvider.
async function mountHeaderAndPage(signOut){
  function Harness(){
    const [sessionValue,setSessionValue]=React.useState(signedInSession);
    const providerSignOut=React.useCallback(async()=>{const result=await signOut();if(result.ok)setSessionValue(null);return result;},[signOut]);
    return React.createElement(AuthContext.Provider,{value:auth({session:sessionValue,signOut:providerSignOut})},
      React.createElement(ProductContext.Provider,{value:{state:{status:'loading'},refresh(){}}},
        React.createElement(CartContext.Provider,{value:{items:[],dispatch(){},status:'ready',retry(){},beginCheckout:()=>1,finishCheckout(){}}},
          React.createElement(MemoryRouter,{initialEntries:['/account']},React.createElement(Routes,null,
            React.createElement(Route,{element:React.createElement(Layout)},
              React.createElement(Route,{path:'/account',element:React.createElement(NotificationProvider,null,React.createElement(AccountPage))})))))));
  }
  globalThis.__accountAuthClient=fakeClient().client;
  root=createRoot(host);
  await act(async()=>root.render(React.createElement(Harness)));
  return {
    trigger:host.querySelector('header button[aria-haspopup="menu"]'),
    page:host.querySelector('.account-session button.text-link'),
  };
}

test('both sign-out controls are mounted together on /account and share one in-flight request',async()=>{
  let resolveSignOut;
  let calls=0;
  const pending=new Promise(resolve=>{resolveSignOut=resolve;});
  const {trigger,page}=await mountHeaderAndPage(async()=>{calls+=1;return pending;});
  assert.ok(trigger,'the header menu trigger must be present on /account');
  assert.ok(page,'the account-page fallback control must be present on /account');

  // Start the header sign-out; it stays pending.
  await openWithClick(trigger);
  const signOutItem=menuItems().find(node=>node.textContent==='Sign out');
  await act(async()=>{signOutItem.click();});
  await act(async()=>{});
  assert.equal(calls,1,'the header must issue one provider request');

  // The account-page control is still mounted. Activating it while the header
  // request is pending must not issue a second provider call.
  const pageControl=host.querySelector('.account-session button.text-link');
  assert.ok(pageControl,'the account-page control must remain mounted while the header sign-out is pending');
  assert.equal(pageControl.disabled,true,'the account-page control must reflect the shared pending state');
  await act(async()=>{pageControl.click();});
  await act(async()=>{});
  assert.equal(calls,1,'an overlapping account-page attempt must not issue another provider request');

  // The reverse order: a fresh pair, page sign-out first, then the header menu.
  await act(async()=>{resolveSignOut({ok:true});});
  assert.equal(host.querySelector('header button[aria-haspopup="menu"]'),null,'confirmation must clear the authenticated UI');
});

test('an overlapping account-page attempt joins the pending header sign-out instead of racing it',async()=>{
  let resolveSignOut;
  let calls=0;
  const pending=new Promise(resolve=>{resolveSignOut=resolve;});
  await mountHeaderAndPage(async()=>{calls+=1;return pending;});
  const pageControl=host.querySelector('.account-session button.text-link');

  // Start from the account page this time.
  await act(async()=>pageControl.click());
  await act(async()=>{});
  assert.equal(calls,1,'the account page must issue one provider request');
  const triggerWhilePending=host.querySelector('header button[aria-haspopup="menu"]');
  assert.ok(triggerWhilePending,'the header must stay mounted while the page sign-out is pending');
  await act(async()=>triggerWhilePending.click());
  const signOutItem=menuItems().find(node=>node.textContent==='Sign out'||node.textContent==='Signing out…');
  assert.ok(signOutItem,'the header menu must still expose its sign-out control');
  await act(async()=>{signOutItem.click();});
  await act(async()=>{});
  assert.equal(calls,1,'the header attempt must join the pending page request, not issue another');

  // Only a confirmed provider result clears the session for both surfaces.
  await act(async()=>{resolveSignOut({ok:true});});
  assert.equal(host.querySelector('header button[aria-haspopup="menu"]'),null,'confirmation must clear the authenticated header');
  assert.equal(host.querySelector('.account-session'),null,'confirmation must clear the account-page session view');
});

test('a shared sign-out failure preserves the session on both surfaces and stays retryable',async()=>{
  let attempts=0;
  const {page}=await mountHeaderAndPage(async()=>{attempts+=1;return {ok:false,message:'Sign-out failed. Please try again.'};});
  await act(async()=>page.click());
  assert.ok(host.querySelector('.account-session'),'a failed sign-out must preserve the account-page session view');
  const alert=host.querySelector('.account-session .feedback[role="alert"]');
  assert.match(alert?.textContent||'',/Sign-out failed\. Please try again\./,'the failure must be announced');
  const retry=host.querySelector('.account-session button.text-link');
  assert.equal(retry.disabled,false,'a failed sign-out must remain retryable');
  // Retry reaches the provider again, proving the guard cleared after the failure.
  await act(async()=>retry.click());
  assert.equal(attempts,2,'a retry after failure must issue a fresh provider request');
});

// --- Batch 1I: Cart privacy across sign-out ------------------------------------

test('the Cart privacy rule never exposes a saved Cart to a guest or guest items to a signed-in user',async()=>{
  const {visibleCart}=await server.ssrLoadModule('/src/features/cart/cartRepository.ts');
  const saved={userId:'user-1',items:[{productId:'lamp',quantity:2,variantId:'lamp-oak',unitMinor:12500}]};
  const guest=[{productId:'vase',quantity:1,variantId:'vase-sand',unitMinor:8000}];
  // Guests only ever see guest items; a signed-in user only ever sees their own saved Cart.
  assert.deepEqual(visibleCart(false,null,saved,guest),guest,'a guest must only see guest items');
  assert.deepEqual(visibleCart(false,'user-1',saved,guest),saved.items,'a signed-in user must only see their saved Cart');
  // A different account's saved Cart is never shown.
  assert.deepEqual(visibleCart(false,'user-2',saved,guest),[],'another account\'s saved Cart must never be shown');
  // While the session is still restoring nothing is shown, so no Cart flashes.
  assert.deepEqual(visibleCart(true,'user-1',saved,guest),[],'no Cart is exposed while the session is unresolved');
});

test('signing out leaves the guest Cart untouched and clears no cart data',async()=>{
  const seen=[];
  function Probe(){const {items}=useCart();seen.push(items.length);return React.createElement('p',{className:'bag-count'},`Cart ${items.length}`);}
  function Harness(){
    const [session,setSession]=React.useState(signedInSession);
    return React.createElement(AuthContext.Provider,{value:auth({session,signOut:async()=>{setSession(null);return {ok:true};}})},
      React.createElement(ProductContext.Provider,{value:{state:{status:'loading'},refresh(){}}},
        React.createElement(CartContext.Provider,{value:{items:[],dispatch(){},status:'ready',retry(){},beginCheckout:()=>1,finishCheckout(){}}},
          React.createElement(MemoryRouter,{initialEntries:['/']},React.createElement(Routes,null,
            React.createElement(Route,{element:React.createElement(Layout)},
              React.createElement(Route,{path:'*',element:React.createElement(Probe)})))))));
  }
  root=createRoot(host);
  await act(async()=>root.render(React.createElement(Harness)));
  // The Cart surface stays present and unchanged after sign-out; nothing clears it.
  assert.match(host.textContent,/Cart 0/);
  const trigger=host.querySelector('header button[aria-haspopup="menu"]');
  await openWithClick(trigger);
  const signOutItem=menuItems().find(node=>node.textContent==='Sign out');
  await act(async()=>signOutItem.click());
  assert.equal(host.querySelector('header button[aria-haspopup="menu"]'),null);
  assert.match(host.textContent,/Cart 0/,'the Cart must remain after sign-out');
  assert.deepEqual(seen,[0,0],'the Cart contents must not change across sign-out');
});

// --- Batch 1I: provider failure contract (real AuthProvider) ------------------

// Drives the real AuthProvider against a Supabase client whose signOut rejects, so
// the "session preserved on provider failure" claim is proven at the actual
// provider boundary rather than through a stub of the context.
test('the real AuthProvider preserves the session and reports failure when Supabase sign-out errors',async()=>{
  const {AuthProvider}=await server.ssrLoadModule('/src/features/auth/AuthProvider.tsx');
  let restoreSession;
  let signOutCalls=0;
  globalThis.__accountAuthClient={
    auth:{
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
      getSession:()=>new Promise(resolve=>{restoreSession=resolve;}),
      signInWithOAuth:async()=>({error:null}),
      signOut:async()=>{signOutCalls+=1;return {error:new Error('network down')};},
    },
  };
  let observed;
  function Probe(){observed=useAuth();return React.createElement('p',null,observed.session?'signed-in':'signed-out');}
  root=createRoot(host);
  await act(async()=>root.render(React.createElement(AuthProvider,null,React.createElement(Probe))));
  await act(async()=>{restoreSession({data:{session:signedInSession},error:null});});
  assert.equal(observed.session?.user.id,signedInSession.user.id,'the session must be restored before sign-out');
  let result;
  await act(async()=>{result=await observed.signOut();});
  assert.deepEqual(result,{ok:false,message:'Sign-out failed. Please try again.'},'a provider failure must resolve with an explicit failure outcome');
  assert.equal(signOutCalls,1);
  assert.equal(observed.session?.user.id,signedInSession.user.id,'a failed sign-out must preserve the session');
  assert.equal(observed.error,'Sign-out failed. Please try again.');
});

test('the real AuthProvider clears the session only when Supabase confirms sign-out',async()=>{
  const {AuthProvider}=await server.ssrLoadModule('/src/features/auth/AuthProvider.tsx');
  let restoreSession;
  globalThis.__accountAuthClient={
    auth:{
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
      getSession:()=>new Promise(resolve=>{restoreSession=resolve;}),
      signInWithOAuth:async()=>({error:null}),
      signOut:async()=>({error:null}),
    },
  };
  let observed;
  function Probe(){observed=useAuth();return React.createElement('p',null,observed.session?'signed-in':'signed-out');}
  root=createRoot(host);
  await act(async()=>root.render(React.createElement(AuthProvider,null,React.createElement(Probe))));
  await act(async()=>{restoreSession({data:{session:signedInSession},error:null});});
  let result;
  await act(async()=>{result=await observed.signOut();});
  assert.deepEqual(result,{ok:true});
  assert.equal(observed.session,null,'a confirmed sign-out must clear the session');
  assert.equal(observed.error,null);
});

// --- Batch 1G Slice 2: profile save notifications --------------------------------

// The profile form confirms a save through the shared notification, while a
// failed save stays inline and assertive. Both are exercised with the real
// AccountPage and a synthetic profiles table.
function profileClient({fail=false}={}){
  const calls=[];
  return {calls,client:{
    from(table){
      calls.push({table});
      return {
        select(){return this},eq(){return this},
        maybeSingle:async()=>({data:null,error:null}),
        insert:async(values)=>{calls.push({insert:values});return fail?{error:{code:'42501',message:'denied'}}:{error:null};},
        update:async(values)=>{calls.push({update:values});return fail?{error:{code:'42501',message:'denied'}}:{error:null};},
      };
    },
    auth:{signOut:async()=>({error:null})},
  }};
}
async function mountProfilePage(fixture){
  globalThis.__accountAuthClient=fixture.client;
  await mount('/account',auth({session:{user:{id:'11111111-1111-4111-8111-111111111111',email:'customer@example.invalid'}}}),React.createElement(AccountPage));
  await flush();
  const save=Array.from(host.querySelectorAll('button')).find(node=>/Save profile/.test(node.textContent));
  assert.ok(save,'the profile form must expose a save action');
  return save;
}

test('a confirmed profile save is announced once by the shared notification',async()=>{
  const fixture=profileClient();
  const save=await mountProfilePage(fixture);
  await act(async()=>{save.click();});
  await flush();
  const notice=host.querySelector('.bag-notice');
  assert.ok(notice,'a confirmed save is announced by the shared notification');
  assert.match(notice.textContent,/Your profile has been saved\./);
  assert.equal(host.querySelectorAll('.bag-notice').length,1,'the announcement is shown once');
  assert.equal(host.querySelector('.profile-actions [role="status"]').textContent,'','the inline status does not repeat the announcement');
  assert.equal(host.querySelector('.profile-actions [role="alert"]'),null,'a confirmed save raises no inline error');
  assert.ok(fixture.calls.some(call=>call.insert||call.update),'the profile was written');
});

test('a failed profile save stays inline and assertive and is not announced twice',async()=>{
  const fixture=profileClient({fail:true});
  const save=await mountProfilePage(fixture);
  await act(async()=>{save.click();});
  await flush();
  const alert=host.querySelector('.profile-actions [role="alert"]');
  assert.ok(alert,'a failed save is announced inline with alert semantics');
  assert.match(alert.textContent,/Your profile could not be saved\./);
  assert.equal(host.querySelector('.bag-notice'),null,'a failed save is not also announced as a notification');
});
// --- Batch 1G: profile identity guard ----------------------------------------

// A profile operation belongs to the customer that started it. The fixtures
// answer per customer and can delay a load or a write, so a completion that
// arrives after the session switched can be observed.
function deferred(){let resolve,reject;const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});return {promise,resolve,reject};}
function inputValue(node,value){Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event('input',{bubbles:true}));}
function profileFixture({pending=null,loads={}}={}){
  const profiles={
    'customer-a':{full_name:'Customer A',phone:'',default_street_address:'Address A',default_area:'Lumley',default_city:'Freetown'},
    'customer-b':{full_name:'Customer B',phone:'',default_street_address:'Address B',default_area:'Congo',default_city:'Freetown'},
  };
  const writes=[];
  const client={
    from(table){
      assert.equal(table,'profiles');
      let owner=null;
      const query={
        select(){return query;},
        eq(key,id){assert.equal(key,'id');owner=id;return query;},
        maybeSingle:async()=>loads[owner]?loads[owner].promise:{data:profiles[owner]??null,error:null},
        insert:async(values)=>{writes.push(values);return pending?pending.promise:{error:null};},
        update:(values)=>{writes.push(values);return {eq:async()=>pending?pending.promise:{error:null}};},
      };
      return query;
    },
    auth:{signOut:async()=>({error:null})},
  };
  return {client,writes,profiles};
}
const sessionA={user:{id:'customer-a',email:'a@example.invalid'},access_token:'jwt-a'};
const sessionB={user:{id:'customer-b',email:'b@example.invalid'},access_token:'jwt-b'};
async function renderAccount(value,element){await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:['/account']},React.createElement(NotificationProvider,null,React.createElement(AuthContext.Provider,{value},element))))); }
const saveControl=()=>host.querySelector('.profile-actions button.button');
const cancelControl=()=>[...host.querySelectorAll('button')].find(node=>node.textContent==='Cancel');
const nameField=()=>host.querySelector('[name="full_name"]');
const addressField=()=>host.querySelector('[name="default_street_address"]');
const notices=()=>host.querySelectorAll('.bag-notice');

async function startDelayedSave(fixture,session){
  globalThis.__accountAuthClient=fixture.client;
  await mount('/account',auth({session}),React.createElement(AccountPage));
  await flush();
  await act(async()=>{inputValue(nameField(),'Customer A edited');});
  await act(async()=>{saveControl().click();});
  await flush();
}
test('a delayed save from one customer never updates another customer saved baseline',async()=>{
  const pending=deferred();
  const fixture=profileFixture({pending});
  await startDelayedSave(fixture,sessionA);
  // The session switches to customer B while the save is still in flight.
  await renderAccount(auth({session:sessionB}),React.createElement(AccountPage));
  await flush();await flush();
  assert.equal(nameField().value,'Customer B','the new customer sees only their own profile');
  // The earlier save now completes.
  await act(async()=>{pending.resolve({error:null});await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
  await act(async()=>{cancelControl().click();});
  await flush();
  assert.equal(nameField().value,'Customer B','the new customer baseline is not replaced by the earlier save');
  assert.equal(addressField().value,'Address B');
});

test('the new customer Cancel restores their own saved profile and never the previous customer',async()=>{
  const pending=deferred();
  const fixture=profileFixture({pending});
  await startDelayedSave(fixture,sessionA);
  await renderAccount(auth({session:sessionB}),React.createElement(AccountPage));
  await flush();await flush();
  await act(async()=>{pending.resolve({error:null});await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
  await act(async()=>{inputValue(nameField(),'Customer B draft');});
  await act(async()=>{cancelControl().click();});
  await flush();
  assert.equal(nameField().value,'Customer B','Cancel restores the customer own saved profile');
  assert.equal(addressField().value,'Address B');
});

test('a delayed save produces no success notification in the new customer session',async()=>{
  const pending=deferred();
  const fixture=profileFixture({pending});
  await startDelayedSave(fixture,sessionA);
  await renderAccount(auth({session:sessionB}),React.createElement(AccountPage));
  await flush();await flush();
  await act(async()=>{pending.resolve({error:null});await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
  assert.equal(notices().length,0,'the earlier customer save is not announced in the new session');
  assert.doesNotMatch(host.textContent,/Your profile has been saved/);
});

test('a delayed rejected save produces no error in the new customer session',async()=>{
  const pending=deferred();
  const fixture=profileFixture({pending});
  await startDelayedSave(fixture,sessionA);
  await renderAccount(auth({session:sessionB}),React.createElement(AccountPage));
  await flush();await flush();
  await act(async()=>{pending.resolve({error:{code:'42501',message:'denied'}});await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
  assert.equal(notices().length,0,'a failure of the earlier customer is not announced as a notification');
  assert.equal(host.querySelectorAll('.profile-actions [role="alert"]').length,0,'a failure of the earlier customer raises no inline error');
});

test('a delayed profile load cannot overwrite the new identity',async()=>{
  const loadA=deferred();
  const fixture=profileFixture({loads:{'customer-a':loadA}});
  globalThis.__accountAuthClient=fixture.client;
  await mount('/account',auth({session:sessionA}),React.createElement(AccountPage));
  await flush();
  await renderAccount(auth({session:sessionB}),React.createElement(AccountPage));
  await flush();await flush();
  assert.equal(nameField().value,'Customer B');
  await act(async()=>{loadA.resolve({data:{full_name:'Previous customer',phone:'',default_street_address:'Address A',default_area:'Lumley',default_city:'Freetown'},error:null});await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
  assert.equal(nameField().value,'Customer B','a late load never overwrites the new identity');
  assert.equal(addressField().value,'Address B');
});

test('rapid account switches never resurrect stale profile data',async()=>{
  const loadA=deferred();
  const loadB=deferred();
  const fixture=profileFixture({loads:{'customer-a':loadA,'customer-b':loadB}});
  globalThis.__accountAuthClient=fixture.client;
  await mount('/account',auth({session:sessionA}),React.createElement(AccountPage));
  await flush();
  await renderAccount(auth({session:sessionB}),React.createElement(AccountPage));
  await flush();
  await renderAccount(auth({session:sessionA}),React.createElement(AccountPage));
  await flush();
  await act(async()=>{loadB.resolve({data:{full_name:'Customer B',phone:'',default_street_address:'Address B',default_area:'Congo',default_city:'Freetown'},error:null});await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
  assert.doesNotMatch(host.textContent,/Customer B/,'a load from the customer that left never reaches the current session');
  await act(async()=>{loadA.resolve({data:{full_name:'Customer A',phone:'',default_street_address:'Address A',default_area:'Lumley',default_city:'Freetown'},error:null});await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
  assert.doesNotMatch(host.textContent,/Address B/);
});

test('a save in the same session still confirms and updates the saved baseline',async()=>{
  const fixture=profileFixture();
  globalThis.__accountAuthClient=fixture.client;
  await mount('/account',auth({session:sessionA}),React.createElement(AccountPage));
  await flush();
  await act(async()=>{inputValue(nameField(),'Customer A saved');});
  await act(async()=>{saveControl().click();});
  await flush();
  assert.equal(notices().length,1,'a confirmed save is announced once');
  assert.match(notices()[0].textContent,/Your profile has been saved\./);
  await act(async()=>{inputValue(nameField(),'Unsaved draft');});
  await act(async()=>{cancelControl().click();});
  await flush();
  assert.equal(nameField().value,'Customer A saved','Cancel restores the profile that was just saved');
});

test('the duplicate submission guard still blocks a second save',async()=>{
  const pending=deferred();
  const fixture=profileFixture({pending});
  globalThis.__accountAuthClient=fixture.client;
  await mount('/account',auth({session:sessionA}),React.createElement(AccountPage));
  await flush();
  await act(async()=>{saveControl().click();});
  await flush();
  assert.equal(saveControl().disabled,true,'the save control is disabled while the save is pending');
  await act(async()=>{saveControl().click();});
  await flush();
  assert.equal(fixture.writes.length,1,'a second activation never sends another write');
  await act(async()=>{pending.resolve({error:null});await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
});
// --- Batch 1G: profile save after unmount ---------------------------------------

test('a keyed account wrapper that replaces the customer never shows the previous customer save',async()=>{
  const {CustomerAccount}=await server.ssrLoadModule('/src/features/auth/CustomerRoutes.tsx');
  const pending=deferred();
  const fixture=profileFixture({pending});
  globalThis.__accountAuthClient=fixture.client;
  await mount('/account',auth({session:sessionA}),React.createElement(CustomerAccount));
  await flush();
  await act(async()=>{inputValue(nameField(),'Customer A edited');});
  await act(async()=>{saveControl().click();});
  await flush();
  // The session switches while the route stays /account, so the keyed account
  // page is replaced by a new instance.
  await renderAccount(auth({session:sessionB}),React.createElement(CustomerAccount));
  await flush();await flush();
  assert.equal(nameField().value,'Customer B','the new customer has their own profile');
  await act(async()=>{pending.resolve({error:null});await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
  assert.equal(notices().length,0,'the previous customer save is not announced in the new session');
  assert.doesNotMatch(host.textContent,/Your profile has been saved/);
});

test('a profile save that resolves after the account page unmounted announces nothing',async()=>{
  const pending=deferred();
  const fixture=profileFixture({pending});
  globalThis.__accountAuthClient=fixture.client;
  await mount('/account',auth({session:sessionA}),React.createElement(AccountPage));
  await flush();
  await act(async()=>{inputValue(nameField(),'Customer A edited');});
  await act(async()=>{saveControl().click();});
  await flush();
  // The page leaves while the notification provider and the route stay.
  await renderAccount(auth({session:sessionA}),React.createElement('p',null,'Account closed'));
  await flush();
  await act(async()=>{pending.resolve({error:null});await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
  assert.equal(notices().length,0,'an unmounted account page never announces its save');
});

test('a rejected profile save that resolves after the account page unmounted announces nothing',async()=>{
  const pending=deferred();
  const fixture=profileFixture({pending});
  globalThis.__accountAuthClient=fixture.client;
  await mount('/account',auth({session:sessionA}),React.createElement(AccountPage));
  await flush();
  await act(async()=>{inputValue(nameField(),'Customer A edited');});
  await act(async()=>{saveControl().click();});
  await flush();
  await renderAccount(auth({session:sessionA}),React.createElement('p',null,'Account closed'));
  await flush();
  await act(async()=>{pending.resolve({error:{code:'42501',message:'denied'}});await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
  assert.equal(notices().length,0,'an unmounted account page never announces a failure');
  assert.equal(host.querySelectorAll('[role="alert"]').length,0,'an unmounted account page raises no inline failure');
});

test('a save that resolves after the customer returned to the same account does not resurrect',async()=>{
  const pending=deferred();
  const fixture=profileFixture({pending});
  globalThis.__accountAuthClient=fixture.client;
  await mount('/account',auth({session:sessionA}),React.createElement(AccountPage));
  await flush();
  await act(async()=>{inputValue(nameField(),'Customer A edited');});
  await act(async()=>{saveControl().click();});
  await flush();
  await renderAccount(auth({session:sessionB}),React.createElement(AccountPage));
  await flush();await flush();
  await renderAccount(auth({session:sessionA}),React.createElement(AccountPage));
  await flush();await flush();
  await act(async()=>{pending.resolve({error:null});await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
  assert.equal(notices().length,0,'an obsolete save result is not resurrected');
});

test('a valid save still announces exactly once under StrictMode',async()=>{
  const fixture=profileFixture();
  globalThis.__accountAuthClient=fixture.client;
  root=createRoot(host);
  await act(async()=>{root.render(React.createElement(React.StrictMode,null,React.createElement(MemoryRouter,{initialEntries:['/account']},React.createElement(NotificationProvider,null,React.createElement(AuthContext.Provider,{value:auth({session:sessionA})},React.createElement(AccountPage))))));await new Promise(resolve=>setTimeout(resolve,0));});
  await flush();
  await act(async()=>{inputValue(nameField(),'Customer A saved');});
  await act(async()=>{saveControl().click();});
  await flush();
  assert.equal(notices().length,1,'the StrictMode effect cycle does not suppress a valid save');
  assert.match(notices()[0].textContent,/Your profile has been saved\./);
});