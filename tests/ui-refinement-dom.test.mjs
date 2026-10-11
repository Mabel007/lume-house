import assert from 'node:assert/strict';
import {test,before,after,afterEach} from 'node:test';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
const dom=new JSDOM('<!doctype html><button id="opener">Open</button><div id="root"></div>',{url:'http://localhost/'});
const document=dom.window.document;
for(const name of ['window','document','HTMLElement'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
let server,root;const host=document.getElementById('root');
before(async()=>{server=await createServer({root:process.cwd(),configFile:false,envDir:false,server:{middlewareMode:true,hmr:false}});});
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=undefined;host.replaceChildren();});
after(async()=>{await server.close();dom.window.close();});
async function mount(node){root=createRoot(host);await act(async()=>root.render(node));}
test('read states expose live loading, errors with retry, and useful empty feedback',async()=>{
 const {AdminReadState}=await server.ssrLoadModule('/src/features/admin/AdminReadState.tsx');let retried=0;
 await mount(React.createElement(AdminReadState,{loading:true,message:'Loading orders…'}));assert.equal(host.querySelector('[role=status]').textContent,'Loading orders…');assert.ok(host.querySelector('[aria-hidden=true]'));
 await act(async()=>root.render(React.createElement(AdminReadState,{message:'Access denied',retry:()=>retried++})));
 assert.match(host.querySelector('[role=alert]').textContent,/Access denied/);await act(async()=>host.querySelector('button').click());assert.equal(retried,1);
 await act(async()=>root.render(React.createElement(AdminReadState,{empty:'No matching orders'})));assert.match(host.textContent,/No matching orders/);assert.equal(host.querySelector('button'),null);
});
test('confirmation labels its dialog, starts on cancel and restores invoking control focus',async()=>{
 const {ConfirmDialog}=await server.ssrLoadModule('/src/components/ConfirmDialog.tsx');let confirmed=0,cancelled=0;
 const opener=document.getElementById('opener');opener.focus();
 await mount(React.createElement(ConfirmDialog,{title:'Sign out?',description:'End this session.',confirmLabel:'Sign out',onConfirm:()=>confirmed++,onCancel:()=>cancelled++}));
 const dialog=host.querySelector('dialog');assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent,'Sign out?');assert.equal(document.activeElement.textContent,'Cancel');
 await act(async()=>host.querySelector('button').click());assert.equal(cancelled,1);assert.equal(confirmed,0);
 await act(async()=>host.querySelectorAll('button')[1].click());assert.equal(confirmed,1);
 await act(async()=>root.unmount());root=undefined;assert.equal(document.activeElement,opener);
});
test('record table has labelled scroll region, real column/row headers and an actionable detail control',async()=>{
 const {AdminTable}=await server.ssrLoadModule('/src/features/admin/AdminTable.tsx');let selected='';
 await mount(React.createElement(AdminTable,{caption:'Inventory',rows:[{id:'fixture',name:'Reviewed piece'}],rowKey:r=>r.id,columns:[{key:'name',heading:'Product',rowHeader:true,render:r=>r.name},{key:'action',heading:'Details',render:r=>React.createElement('button',{type:'button',onClick:()=>selected=r.id},'View details')}]}));
 const region=host.querySelector('[role=region]');assert.equal(region.tabIndex,0);assert.equal(region.getAttribute('aria-label'),'Inventory table');assert.equal(host.querySelector('caption').textContent,'Inventory');assert.equal(host.querySelector('[scope=col]').textContent,'Product');assert.equal(host.querySelector('[scope=row]').textContent,'Reviewed piece');await act(async()=>host.querySelector('button').click());assert.equal(selected,'fixture');assert.equal(host.querySelector('[aria-sort]'),null);
});
test('audit timestamps show explicit UTC across offset day boundaries without changing the stored instant',async()=>{
 const {RecordTime}=await server.ssrLoadModule('/src/components/RecordTime.tsx');const {formatRecordTime}=await server.ssrLoadModule('/src/config/dateTime.ts');const value='2026-10-11T00:30:00+02:00';assert.match(formatRecordTime(value),/10\/10\/2026, 22:30:00 UTC/);assert.equal(formatRecordTime('invalid'),'Date unavailable');await mount(React.createElement(RecordTime,{value}));assert.equal(host.querySelector('time').getAttribute('datetime'),value);assert.match(host.textContent,/UTC/);
});
