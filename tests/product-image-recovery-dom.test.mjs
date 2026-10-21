import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';

const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
const {document}=dom.window;
for(const name of ['window','document','HTMLElement','Element','Event','MouseEvent'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

const {createRoot}=await import('react-dom/client');
const host=document.getElementById('root');
let server,root,ProductGallery;

before(async()=>{
 server=await createServer({configFile:false,envDir:false,server:{middlewareMode:true,hmr:false}});
 ({ProductGallery}=await server.ssrLoadModule('/src/features/products/ProductGallery.tsx'));
});
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=null;host.replaceChildren();});
after(async()=>{await server.close();dom.window.close();});

const base={id:'fixture',name:'Test piece',category:'Home',price:100,image:'/images/mug.svg',color:'#ffffff',description:'Test description'};
const gallery=['/images/mug.svg','/images/arch-vase.webp'];
function product(images){return images?{...base,gallery:images}:base;}
async function mount(images){root=createRoot(host);await act(async()=>root.render(React.createElement(ProductGallery,{product:product(images)})));}
const image=()=>host.querySelector('img');
const fallback=()=>host.querySelector('[role="img"]');
const reload=()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Reload image');
async function dispatch(target,type){await act(async()=>target.dispatchEvent(new dom.window.Event(type)));}
async function click(target){await act(async()=>target.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));}

test('successful load keeps the reload control hidden',async()=>{
 await mount(gallery);
 assert.ok(image());
 assert.equal(reload(),undefined);
 await dispatch(image(),'load');
 assert.equal(reload(),undefined);
 assert.equal(fallback(),null);
});

test('failed load exposes an accessible fallback and reload control',async()=>{
 await mount(gallery);
 await dispatch(image(),'error');
 const control=reload();
 assert.ok(control);
 assert.equal(control.tagName,'BUTTON');
 assert.equal(control.type,'button');
 assert.equal(control.getAttribute('aria-label'),'Reload image for Test piece');
 assert.match(control.textContent,/Reload image/);
 assert.ok(fallback());
 assert.equal(fallback().getAttribute('aria-label'),'Image unavailable for Test piece');
 assert.equal(image(),null);
 control.focus();
 assert.equal(document.activeElement,control);
});

test('reload retries the failed image and hides only after success',async()=>{
 await mount(gallery);
 const first=image();
 await dispatch(first,'error');
 const control=reload();
 await click(control);
 const retried=image();
 assert.ok(retried);
 assert.notEqual(retried,first);
 assert.equal(retried.getAttribute('src'),'/images/mug.svg');
 assert.ok(reload(),'reload stays available while the retry is unresolved');
 await dispatch(retried,'load');
 assert.equal(reload(),undefined);
 assert.equal(fallback(),null);
 assert.equal(image(),retried);
});

test('switching images clears stale failure and preserves alternate navigation',async()=>{
 await mount(gallery);
 await dispatch(image(),'error');
 assert.ok(reload());
 const group=host.querySelector('[role="group"]');
 assert.ok(group);
 assert.equal(group.getAttribute('aria-label'),'Images of Test piece');
 const second=[...host.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')?.includes('View image 2 of 2'));
 const first=[...host.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')?.includes('View image 1 of 2'));
 assert.ok(second);assert.ok(first);
 await click(second);
 assert.equal(image().getAttribute('src'),'/images/arch-vase.webp');
 assert.equal(reload(),undefined);
 assert.equal(fallback(),null);
 assert.equal(second.getAttribute('aria-pressed'),'true');
 assert.equal(first.getAttribute('aria-pressed'),'false');
 await click(first);
 assert.equal(image().getAttribute('src'),'/images/mug.svg');
 assert.equal(reload(),undefined);
 assert.equal(fallback(),null);
});

test('legacy single-image fallback remains usable and retryable',async()=>{
 await mount();
 await dispatch(image(),'error');
 assert.ok(fallback());
 assert.ok(reload());
 assert.equal(host.querySelector('[role="group"]'),null);
 await click(reload());
 assert.ok(image());
 await dispatch(image(),'load');
 assert.equal(reload(),undefined);
 assert.equal(fallback(),null);
});
