import assert from 'node:assert/strict';
import {test,before,after,afterEach} from 'node:test';
import React,{act,useLayoutEffect} from 'react';
import {JSDOM} from 'jsdom';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from './helpers/vite.mjs';
const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
for(const n of ['window','document','Element','HTMLElement','MutationObserver','location'])Object.defineProperty(globalThis,n,{configurable:true,value:dom.window[n]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const host=dom.window.document.getElementById('root');let root,server,AuthContext,NotificationBell,NotificationInbox;
let counts=[],lists=[],rpc,reads=0,commits=[];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const notification=owner=>({id:'notification-'+owner,order_id:'order-'+owner,event_type:'order_placed',title:'PRIVATE '+owner,message:'Owned order',is_read:false,created_at:new Date().toISOString(),read_at:null});
before(async()=>{
  server=await createServer({configFile:false,envDir:false,server:{middlewareMode:true},plugins:[{name:'notification-test-client',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/lib/supabase/client.ts'))return 'export function getSupabaseClient(){return globalThis.__notificationClient;}';}}]});
  ({AuthContext}=await server.ssrLoadModule('/src/features/auth/AuthContext.ts'));
  ({NotificationBell}=await server.ssrLoadModule('/src/features/notifications/NotificationBell.tsx'));
  ({NotificationInbox}=await server.ssrLoadModule('/src/features/notifications/NotificationInbox.tsx'));
});
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=undefined;host.replaceChildren();counts=[];lists=[];reads=0;commits=[];rpc=undefined;delete globalThis.__notificationClient;});
after(async()=>{await server?.close();dom.window.close();});
function Observer({identity,children}){useLayoutEffect(()=>{commits.push({identity,text:host.textContent,label:host.querySelector('.notification-bell')?.getAttribute('aria-label')});},[identity]);return children;}
async function render(Component,user='A',generation=1){
  globalThis.__notificationClient={rpc:()=>rpc?.promise??Promise.resolve({data:null,error:null}),from(){return{select(_columns,options){if(options?.head)return{eq(){return counts.shift()??Promise.resolve({count:0,error:null});}};return{order(){return{limit(){reads++;return lists.shift()??Promise.resolve({data:[],error:null});}};}};}};}};
  root??=createRoot(host);
  const identity=user+':'+generation;
  await act(async()=>{root.render(React.createElement(MemoryRouter,null,React.createElement(AuthContext.Provider,{value:{session:user?{user:{id:user}}:null,loading:false,sessionGeneration:generation}},React.createElement(Observer,{identity},React.createElement(Component)))));await new Promise(r=>setImmediate(r));});
}
async function settle(deferred,value){await act(async()=>{deferred.resolve(value);await new Promise(r=>setImmediate(r));});}
test('bell never exposes A count in B commit or after B read fails',async()=>{
  const b=deferred();counts=[Promise.resolve({count:7,error:null}),b.promise];
  await render(NotificationBell);assert.match(host.textContent,/7/);
  await render(NotificationBell,'B');assert.doesNotMatch(commits.at(-1).label,/7/);assert.doesNotMatch(host.textContent,/7/);
  await act(async()=>{b.reject(Error('offline'));await new Promise(r=>setImmediate(r));});
  assert.match(host.querySelector('a').getAttribute('aria-label'),/unavailable/);assert.doesNotMatch(host.textContent,/7/);
});
test('stale bell responses and same-user reauthentication cannot restore an earlier lifetime',async()=>{
  const a=deferred(),b=deferred();counts=[a.promise,b.promise];await render(NotificationBell);await render(NotificationBell,'A',2);
  await settle(b,{count:2,error:null});await settle(a,{count:9,error:null});assert.match(host.querySelector('a').getAttribute('aria-label'),/2 unread/);assert.doesNotMatch(host.textContent,/9/);
});
test('inbox clears private data before B commit and rejects prior requests',async()=>{
  const b=deferred();lists=[Promise.resolve({data:[notification('A')],error:null}),b.promise];
  await render(NotificationInbox);assert.match(host.textContent,/PRIVATE A/);await render(NotificationInbox,'B');
  assert.doesNotMatch(commits.at(-1).text,/PRIVATE A/);assert.doesNotMatch(host.textContent,/PRIVATE A/);
  await settle(b,{data:[notification('B')],error:null});assert.match(host.textContent,/PRIVATE B/);
});
test('late inbox load cannot cross logout, login or unmount',async()=>{
  const a=deferred(),b=deferred();lists=[a.promise,b.promise];await render(NotificationInbox);await render(NotificationInbox,null);await render(NotificationInbox,'B',2);
  await settle(a,{data:[notification('A')],error:null});assert.doesNotMatch(host.textContent,/PRIVATE A/);
  await settle(b,{data:[notification('B')],error:null});assert.match(host.textContent,/PRIVATE B/);
});
test('A mutation completing in B lifetime neither reloads nor alters B state',async()=>{
  lists=[Promise.resolve({data:[notification('A')],error:null})];await render(NotificationInbox);rpc=deferred();
  await act(async()=>host.querySelector('button[aria-label="Mark as read"]').click());
  lists=[Promise.resolve({data:[notification('B')],error:null})];await render(NotificationInbox,'B');const before=reads;
  await settle(rpc,{data:null,error:null});assert.equal(reads,before);assert.match(host.textContent,/PRIVATE B/);assert.doesNotMatch(host.textContent,/PRIVATE A/);
});
