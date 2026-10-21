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
const retry=()=>[...host.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')?.startsWith('Reload'));
const viewButton=index=>[...host.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')?.includes(`View image ${index} of 2`));
async function dispatch(target,type){await act(async()=>target.dispatchEvent(new dom.window.Event(type)));}
async function click(target){await act(async()=>target.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));}

test('successful load keeps the reload control hidden',async()=>{
 await mount(gallery);
 assert.ok(image());
 assert.equal(retry(),undefined);
 await dispatch(image(),'load');
 assert.equal(retry(),undefined);
 assert.equal(fallback(),null);
});

test('failed load exposes an accessible fallback and enabled reload control',async()=>{
 await mount(gallery);
 await dispatch(image(),'error');
 const control=retry();
 assert.ok(control);
 assert.equal(control.tagName,'BUTTON');
 assert.equal(control.type,'button');
 assert.equal(control.disabled,false);
 assert.equal(control.getAttribute('aria-disabled'),'false');
 assert.equal(control.getAttribute('aria-busy'),'false');
 assert.equal(control.getAttribute('aria-label'),'Reload image for Test piece');
 assert.match(control.textContent,/Reload image/);
 assert.ok(fallback());
 assert.equal(fallback().getAttribute('aria-label'),'Image unavailable for Test piece');
 assert.equal(image(),null);
 const figure=host.querySelector('figure');
 assert.equal(figure.getAttribute('tabindex'),'-1');
 assert.equal(figure.getAttribute('aria-label'),'Test piece image');
 control.focus();
 assert.equal(document.activeElement,control);
});

test('retry is single-in-flight and becomes available again after failure',async()=>{
 await mount(gallery);
 const initial=image();
 await dispatch(initial,'error');
 const control=retry();
 assert.equal(control.getAttribute('aria-disabled'),'false');
 await click(control);
 const pendingButton=retry();
 assert.ok(pendingButton);
 assert.equal(pendingButton,control);
 assert.equal(pendingButton.getAttribute('aria-disabled'),'true');
 assert.equal(pendingButton.getAttribute('aria-busy'),'true');
 assert.match(pendingButton.textContent,/Reloading image/);
 const firstRetry=image();
 assert.ok(firstRetry);
 assert.notEqual(firstRetry,initial);
 assert.equal(firstRetry.getAttribute('src'),'/images/mug.svg');
 await click(pendingButton);
 assert.equal(image(),firstRetry,'a second activation does not remount or restart the pending attempt');
 assert.equal(retry().getAttribute('aria-disabled'),'true');
 await dispatch(firstRetry,'error');
 const available=retry();
 assert.ok(available);
 assert.equal(available.getAttribute('aria-disabled'),'false');
 assert.equal(available.getAttribute('aria-busy'),'false');
 assert.equal(available.textContent,'Reload image');
 assert.ok(fallback());
 assert.equal(image(),null);
 await click(available);
 const secondRetry=image();
 assert.ok(secondRetry);
 assert.notEqual(secondRetry,firstRetry);
 await dispatch(secondRetry,'load');
 assert.equal(retry(),undefined);
 assert.equal(fallback(),null);
});

test('successful retry hands focus to the persistent gallery figure',async()=>{
 await mount(gallery);
 await dispatch(image(),'error');
 const control=retry();
 control.focus();
 assert.equal(document.activeElement,control);
 await click(control);
 assert.equal(document.activeElement,control,'the pending button retains focus');
 const pendingImage=image();
 await dispatch(pendingImage,'load');
 const figure=host.querySelector('figure');
 assert.equal(document.activeElement,figure);
 assert.equal(figure.getAttribute('tabindex'),'-1');
 assert.equal(figure.getAttribute('aria-label'),'Test piece image');
 assert.equal(retry(),undefined);
});

test('successful retry does not steal focus after the user moves elsewhere',async()=>{
 await mount(gallery);
 await dispatch(image(),'error');
 const control=retry();
 control.focus();
 await click(control);
 const pendingImage=image();
 const second=viewButton(2);
 second.focus();
 assert.equal(document.activeElement,second);
 await dispatch(pendingImage,'load');
 assert.equal(document.activeElement,second);
 assert.equal(retry(),undefined);
});

test('switching images clears stale failure and preserves alternate navigation',async()=>{
 await mount(gallery);
 await dispatch(image(),'error');
 assert.ok(retry());
 const group=host.querySelector('[role="group"]');
 assert.ok(group);
 assert.equal(group.getAttribute('aria-label'),'Images of Test piece');
 const second=viewButton(2);
 const first=viewButton(1);
 assert.ok(second);assert.ok(first);
 await click(second);
 assert.equal(image().getAttribute('src'),'/images/arch-vase.webp');
 assert.equal(retry(),undefined);
 assert.equal(fallback(),null);
 assert.equal(second.getAttribute('aria-pressed'),'true');
 assert.equal(first.getAttribute('aria-pressed'),'false');
 await click(first);
 assert.equal(image().getAttribute('src'),'/images/mug.svg');
 assert.equal(retry(),undefined);
 assert.equal(fallback(),null);
});

test('stale events from a previous image cannot change the current image state',async()=>{
 await mount(gallery);
 const first=image();
 await dispatch(first,'error');
 const control=retry();
 await click(control);
 const pendingFirst=image();
 assert.ok(pendingFirst);
 const second=viewButton(2);
 await click(second);
 const current=image();
 assert.equal(current.getAttribute('src'),'/images/arch-vase.webp');
 await dispatch(first,'error');
 await dispatch(pendingFirst,'error');
 assert.equal(image(),current);
 assert.equal(fallback(),null);
 assert.equal(retry(),undefined);
 await dispatch(first,'load');
 await dispatch(pendingFirst,'load');
 assert.equal(image(),current);
 assert.equal(retry(),undefined);
 await click(viewButton(1));
 const currentAgain=image();
 assert.equal(currentAgain.getAttribute('src'),'/images/mug.svg');
 await dispatch(first,'error');
 await dispatch(pendingFirst,'error');
 assert.equal(image(),currentAgain,'an old token reused after switching back cannot fail the current image');
 assert.equal(fallback(),null);
 assert.equal(retry(),undefined);
 await dispatch(first,'load');
 await dispatch(pendingFirst,'load');
 assert.equal(image(),currentAgain);
 assert.equal(retry(),undefined);
});

test('legacy single-image fallback remains usable and retryable',async()=>{
 await mount();
 await dispatch(image(),'error');
 assert.ok(fallback());
 assert.ok(retry());
 assert.equal(host.querySelector('[role="group"]'),null);
 const control=retry();
 control.focus();
 await click(control);
 assert.ok(image());
 assert.equal(retry().getAttribute('aria-disabled'),'true');
 await dispatch(image(),'load');
 assert.equal(retry(),undefined);
 assert.equal(fallback(),null);
 assert.equal(document.activeElement,host.querySelector('figure'));
});
