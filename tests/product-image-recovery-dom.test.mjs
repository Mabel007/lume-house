import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {createServer} from './helpers/vite.mjs';

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
after(async()=>{await server?.close();dom.window.close();});

const base={id:'fixture',name:'Test piece',category:'Home',price:100,image:'/images/mug.svg',color:'#ffffff',description:'Test description'};
const gallery=['/images/mug.svg','/images/arch-vase.webp'];
const two=['/images/mug.svg','/images/arch-vase.webp'];
const three=['/images/mug.svg','/images/arch-vase.webp','/images/lamp.svg'];
const eight=['/images/mug.svg','/images/arch-vase.webp','/images/lamp.svg','/images/one.svg','/images/two.svg','/images/three.svg','/images/four.svg','/images/five.svg'];
function product(images){return images?{...base,gallery:images}:base;}
async function mount(images){root=createRoot(host);await act(async()=>root.render(React.createElement(ProductGallery,{product:product(images)})));}
const figure=()=>host.querySelector('figure');
// Main-image queries are scoped to the figure so decorative thumbnails cannot
// satisfy an assertion intended for the active image or its fallback.
const image=()=>figure()?.querySelector('img')??null;
const fallback=()=>figure()?.querySelector('[role="img"]')??null;
const loadingCue=()=>host.querySelector('.product-gallery-loading');
const statuses=()=>[...host.querySelectorAll('[role="status"]')];
const status=()=>statuses()[0];
const statusText=()=>status()?.textContent??'';
function watch(target){
 const changes=[];
 const observer=new dom.window.MutationObserver(records=>changes.push(...records));
 observer.observe(target,{childList:true,characterData:true,subtree:true});
 return {
  drain(){changes.push(...observer.takeRecords());return changes.splice(0);},
  stop(){changes.push(...observer.takeRecords());observer.disconnect();return changes.splice(0);}
 };
}
function statusChanges(records){
 const node=status();
 return records.filter(record=>record.target===node||node?.contains(record.target));
}
function assertStatusMutation(watcher,message){
 assert.ok(statusChanges(watcher.drain()).length>0,`expected a status mutation: ${message}`);
}
function assertNoStatusMutation(watcher,message){
 assert.equal(statusChanges(watcher.drain()).length,0,`unexpected status mutation: ${message}`);
}
function reactCallbacks(element){
 assert.ok(element,'expected a mounted image before capturing callbacks');
 const key=Object.keys(element).find(name=>name.startsWith('__reactProps$'));
 assert.ok(key,'expected React props on the mounted image');
 const props=element[key];
 assert.equal(typeof props.onLoad,'function');
 assert.equal(typeof props.onError,'function');
 return {onLoad:props.onLoad,onError:props.onError};
}
async function invoke(callback){await act(async()=>{callback();});}
const thumbnails=()=>[...host.querySelectorAll('.product-gallery-thumb')];
const thumbnailImage=index=>thumbnails()[index]?.querySelector('img')??null;
const retry=()=>[...host.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')?.startsWith('Reload'));
const viewButton=(index,total=2)=>[...host.querySelectorAll('button')].find(button=>button.getAttribute('aria-label')===`View image ${index} of ${total} for Test piece`);
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function dispatch(target,type){await act(async()=>target.dispatchEvent(new dom.window.Event(type)));}
async function click(target){await act(async()=>target.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));}

test('gallery exposes exactly one persistent hidden polite status region that starts silent',async()=>{
 const watcher=watch(host);
 await mount(gallery);
 assert.equal(statusChanges(watcher.drain()).length,0,'mounting the gallery must not announce');
 watcher.stop();
 const node=status();
 assert.equal(statuses().length,1);
 assert.equal(status().getAttribute('aria-live'),'polite');
 assert.equal(status().getAttribute('aria-atomic'),'true');
 assert.match(status().className,/visually-hidden/);
 assert.equal(statusText(),'');
 assert.equal(status(),node);
 const caption=figure().querySelector('figcaption');
 assert.ok(caption);
 assert.equal(caption.getAttribute('aria-live'),null);
 assert.equal(caption.getAttribute('role'),null);
});

test('selecting another image announces its ordinal once and leaves the caption non-live',async()=>{
 await mount(gallery);
 const node=status();
 const watcher=watch(node);
 const second=viewButton(2);
 second.focus();
 await click(second);
 assertStatusMutation(watcher,'different image selection');
 assert.equal(statusText(),'Image 2 of 2 for Test piece');
 assert.equal(status(),node);
 assert.equal(statuses().length,1);
 assert.equal(second.getAttribute('aria-pressed'),'true');
 assert.equal(viewButton(1).getAttribute('aria-pressed'),'false');
 assert.equal(document.activeElement?.getAttribute('aria-label'),'View image 2 of 2 for Test piece');
 await click(viewButton(2));
 assertNoStatusMutation(watcher,'reselecting the active image');
 await dispatch(image(),'load');
 assertNoStatusMutation(watcher,'ordinary image load');
 assert.equal(statusText(),'Image 2 of 2 for Test piece');
 assert.equal(status(),node);
 assert.equal(statuses().length,1);
 watcher.stop();
});

test('failure, retry and successful reload produce distinct announcements without stealing focus',async()=>{
 await mount(gallery);
 const node=status();
 const watcher=watch(node);
 await dispatch(image(),'error');
 assertStatusMutation(watcher,'initial failure');
 assert.equal(statusText(),'Image unavailable for Test piece. Reload image is available.');
 assert.equal(status(),node);
 assert.equal(statuses().length,1);
 const control=retry();
 control.focus();
 await click(control);
 assertStatusMutation(watcher,'retry start');
 assert.equal(statusText(),'Reloading image for Test piece.');
 assert.equal(control.getAttribute('aria-busy'),'true');
 assert.equal(figure().getAttribute('aria-busy'),'true');
 const pendingImage=image();
 await dispatch(pendingImage,'load');
 assertStatusMutation(watcher,'successful reload');
 assert.equal(statusText(),'Image reloaded for Test piece.');
 assert.equal(document.activeElement?.tagName,'FIGURE');
 assert.equal(document.activeElement?.getAttribute('aria-label'),'Test piece image');
 assert.equal(figure().getAttribute('aria-busy'),'false');
 assert.equal(status(),node);
 assert.equal(statuses().length,1);
 watcher.stop();
});

test('each failed retry produces a fresh loading-to-failure status update',async()=>{
 await mount(gallery);
 const node=status();
 const watcher=watch(node);
 await dispatch(image(),'error');
 assertStatusMutation(watcher,'initial failure');
 for(let attempt=1;attempt<=2;attempt+=1){
  const control=retry();
  control.focus();
  await click(control);
  assertStatusMutation(watcher,`retry ${attempt} start`);
  assert.equal(statusText(),'Reloading image for Test piece.');
  assert.equal(control.getAttribute('aria-busy'),'true');
  assert.equal(figure().getAttribute('aria-busy'),'true');
  await dispatch(image(),'error');
  assertStatusMutation(watcher,`retry ${attempt} failure`);
  assert.equal(statusText(),'Image unavailable for Test piece. Reload image is available.');
  assert.equal(retry().getAttribute('aria-busy'),'false');
  assert.equal(figure().getAttribute('aria-busy'),'false');
 }
 assert.equal(status(),node);
 assert.equal(statuses().length,1);
 watcher.stop();
});

test('retained load and error callbacks cannot mutate the announcement after A → B → A',async()=>{
 await mount(gallery);
 const initial=reactCallbacks(image());
 await dispatch(image(),'error');
 await click(retry());
 const retried=reactCallbacks(image());
 await click(viewButton(2));
 const second=reactCallbacks(image());
 await click(viewButton(1));
 const current=reactCallbacks(image());
 assert.equal(statusText(),'Image 1 of 2 for Test piece');
 const node=status();
 const watcher=watch(node);
 for(const [label,callbacks] of [['initial',initial],['retried',retried],['second',second]]){
  await invoke(callbacks.onError);
  assertNoStatusMutation(watcher,`stale ${label} error callback`);
  await invoke(callbacks.onLoad);
  assertNoStatusMutation(watcher,`stale ${label} load callback`);
 }
 assert.equal(statusText(),'Image 1 of 2 for Test piece');
 assert.equal(viewButton(1).getAttribute('aria-pressed'),'true');
 assert.equal(viewButton(2).getAttribute('aria-pressed'),'false');
 await invoke(current.onError);
 assertStatusMutation(watcher,'current generation error callback');
 assert.equal(statusText(),'Image unavailable for Test piece. Reload image is available.');
 assert.equal(status(),node);
 assert.equal(statuses().length,1);
 watcher.stop();
});

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

test('single-image gallery keeps a stable loading frame without an ordinal or thumbnails',async()=>{
 await mount();
 const box=figure();
 assert.equal(host.querySelector('[role="group"]'),null);
 assert.equal(thumbnails().length,0);
 assert.equal(box.querySelector('figcaption'),null);
 assert.equal(box.getAttribute('aria-describedby'),null);
 assert.equal(box.getAttribute('aria-busy'),'true');
 assert.ok(loadingCue());
 await dispatch(image(),'load');
 assert.equal(figure(),box,'the frame is not remounted when loading settles');
 assert.equal(figure().getAttribute('aria-busy'),'false');
 assert.equal(loadingCue(),null);
});

test('eight-image gallery preserves order, pressed state, primary label and ordinal context',async()=>{
 await mount(eight);
 const controls=[...host.querySelectorAll('[role="group"] button')];
 assert.equal(controls.length,8);
 assert.deepEqual(controls.map(button=>button.getAttribute('aria-label')),eight.map((_,index)=>`View image ${index+1} of 8 for Test piece`));
 assert.deepEqual(controls.map(button=>button.querySelector('.product-gallery-choice > span:last-child').textContent),['Image 1 · Primary',...Array.from({length:7},(_,index)=>`Image ${index+2}`)]);
 assert.deepEqual(controls.map(button=>button.getAttribute('aria-pressed')),['true',...Array(7).fill('false')]);
 assert.deepEqual(thumbnails().map(thumb=>thumb.querySelector('img')?.getAttribute('src')),eight);
 assert.equal(controls[0].querySelector('.product-gallery-selected-marker').textContent,'✓');
 assert.equal(controls[1].querySelector('.product-gallery-selected-marker').textContent,'');
 const caption=figure().querySelector('figcaption');
 assert.ok(caption);
 assert.equal(caption.textContent,'Image 1 of 8');
 assert.equal(figure().getAttribute('aria-describedby'),caption.id);
});

test('two-image gallery keeps count-specific names, ordinals, pressed state and focus',async()=>{
 await mount(two);
 const controls=[...host.querySelectorAll('[role="group"] button')];
 assert.equal(controls.length,2);
 assert.deepEqual(controls.map(button=>button.getAttribute('aria-label')),two.map((_,index)=>`View image ${index+1} of 2 for Test piece`));
 assert.deepEqual(controls.map(button=>button.querySelector('.product-gallery-choice > span:last-child').textContent),['Image 1 · Primary','Image 2']);
 assert.deepEqual(controls.map(button=>button.getAttribute('aria-pressed')),['true','false']);
 assert.deepEqual(controls.map(button=>button.querySelector('.product-gallery-selected-marker').textContent),['✓','']);
 assert.equal(figure().querySelector('figcaption').textContent,'Image 1 of 2');
 const second=viewButton(2,2);
 second.focus();
 assert.equal(document.activeElement,second);
 await click(second);
 assert.equal(image().getAttribute('src'),two[1]);
 assert.equal(viewButton(2,2).getAttribute('aria-pressed'),'true');
 assert.equal(viewButton(1,2).getAttribute('aria-pressed'),'false');
 assert.deepEqual(controls.map(button=>button.querySelector('.product-gallery-selected-marker').textContent),['','✓']);
 assert.equal(figure().querySelector('figcaption').textContent,'Image 2 of 2');
 assert.equal(document.activeElement,second,'native button activation does not move focus');
});

test('three-image gallery keeps count-specific names, ordinals, pressed state and focus',async()=>{
 await mount(three);
 const controls=[...host.querySelectorAll('[role="group"] button')];
 assert.equal(controls.length,3);
 assert.deepEqual(controls.map(button=>button.getAttribute('aria-label')),three.map((_,index)=>`View image ${index+1} of 3 for Test piece`));
 assert.deepEqual(controls.map(button=>button.querySelector('.product-gallery-choice > span:last-child').textContent),['Image 1 · Primary','Image 2','Image 3']);
 assert.deepEqual(controls.map(button=>button.getAttribute('aria-pressed')),['true','false','false']);
 assert.equal(figure().querySelector('figcaption').textContent,'Image 1 of 3');
 const third=viewButton(3,3);
 third.focus();
 assert.equal(document.activeElement,third);
 await click(third);
 assert.equal(image().getAttribute('src'),three[2]);
 assert.equal(viewButton(3,3).getAttribute('aria-pressed'),'true');
 assert.equal(viewButton(1,3).getAttribute('aria-pressed'),'false');
 assert.equal(figure().querySelector('figcaption').textContent,'Image 3 of 3');
 assert.equal(document.activeElement,third,'native button activation does not move focus');
});

test('thumbnail selection changes only the main image and keeps focus on the activated button',async()=>{
 await mount(eight);
 const third=viewButton(3,8);
 third.focus();
 assert.equal(document.activeElement,third);
 await click(third);
 assert.equal(image().getAttribute('src'),eight[2]);
 assert.equal(viewButton(3,8).getAttribute('aria-pressed'),'true');
 assert.equal(viewButton(1,8).getAttribute('aria-pressed'),'false');
 assert.equal(figure().querySelector('figcaption').textContent,'Image 3 of 8');
 assert.equal(figure().getAttribute('aria-busy'),'true');
 assert.ok(loadingCue());
 assert.equal(document.activeElement,third,'native button activation does not move focus');
 const currentImage=image();
 await click(viewButton(3,8));
 assert.equal(image(),currentImage,'selecting the active thumbnail does not restart loading');
 assert.equal(figure().getAttribute('aria-busy'),'true');
 await dispatch(image(),'load');
 assert.equal(figure().getAttribute('aria-busy'),'false');
});

test('a failed thumbnail preview stays a named usable selector without touching the main image',async()=>{
 await mount(gallery);
 await dispatch(image(),'load');
 const currentImage=image();
 const preview=thumbnailImage(1);
 assert.ok(preview);
 await dispatch(preview,'error');
 const second=viewButton(2);
 assert.ok(second);
 assert.equal(second.getAttribute('aria-label'),'View image 2 of 2 for Test piece');
 assert.equal(second.getAttribute('aria-pressed'),'false');
 assert.ok(thumbnails()[1].querySelector('.product-gallery-thumb-unavailable'));
 assert.equal(image(),currentImage);
 assert.equal(retry(),undefined);
 assert.equal(fallback(),null);
 assert.equal(figure().getAttribute('aria-busy'),'false');
 await click(second);
 assert.equal(image().getAttribute('src'),gallery[1]);
 assert.equal(retry(),undefined,'preview failure must not create a main-image retry');
});

test('an immediately delivered load leaves no static loading treatment',async()=>{
 await mount(gallery);
 assert.equal(figure().getAttribute('aria-busy'),'true');
 await dispatch(image(),'load');
 assert.equal(figure().getAttribute('aria-busy'),'false');
 assert.equal(loadingCue(),null);
});

test('a delayed load settles only when the in-flight response arrives',async()=>{
 await mount(gallery);
 const gate=deferred();
 const delivery=(async()=>{await gate.promise;await dispatch(image(),'load');})();
 assert.equal(figure().getAttribute('aria-busy'),'true','the frame stays busy while the response is in flight');
 assert.ok(loadingCue());
 gate.resolve();await delivery;
 assert.equal(figure().getAttribute('aria-busy'),'false');
 assert.equal(loadingCue(),null);
});

test('a delayed error settles loading and exposes the retry control',async()=>{
 await mount(gallery);
 const gate=deferred();
 const delivery=(async()=>{await gate.promise;await dispatch(image(),'error');})();
 assert.equal(figure().getAttribute('aria-busy'),'true');
 gate.resolve();await delivery;
 assert.equal(figure().getAttribute('aria-busy'),'false');
 assert.equal(loadingCue(),null);
 assert.ok(fallback());
 assert.ok(retry());
});

test('stale URL and generation callbacks cannot settle the frame across A → B → A',async()=>{
 await mount(gallery);
 await dispatch(image(),'error');
 await click(retry());
 const retryImage=image();
 assert.equal(figure().getAttribute('aria-busy'),'true');
 await click(viewButton(2));
 const secondImage=image();
 for(const type of ['load','error']){
  await dispatch(retryImage,type);
  assert.equal(image(),secondImage);
  assert.equal(figure().getAttribute('aria-busy'),'true',`stale retry ${type} must not settle the current generation`);
 }
 await dispatch(secondImage,'load');
 assert.equal(figure().getAttribute('aria-busy'),'false');
 await click(viewButton(1));
 const currentAgain=image();
 assert.equal(figure().getAttribute('aria-busy'),'true');
 for(const type of ['load','error']){
  await dispatch(retryImage,type);
  await dispatch(secondImage,type);
  assert.equal(image(),currentAgain);
  assert.equal(figure().getAttribute('aria-busy'),'true',`old URL events must not settle the restored image (${type})`);
 }
 await dispatch(currentAgain,'load');
 assert.equal(figure().getAttribute('aria-busy'),'false');
 assert.equal(loadingCue(),null);
});

test('retry keeps its pending label and returns focus to the figure only while it owns focus',async()=>{
 await mount(gallery);
 await dispatch(image(),'error');
 const control=retry();
 control.focus();
 await click(control);
 const pendingImage=image();
 assert.equal(figure().getAttribute('aria-busy'),'true');
 assert.ok(loadingCue());
 const gate=deferred();
 const delivery=(async()=>{await gate.promise;await dispatch(pendingImage,'load');})();
 gate.resolve();await delivery;
 assert.equal(document.activeElement,figure());
 assert.equal(figure().getAttribute('aria-busy'),'false');
 assert.equal(retry(),undefined);
});

test('a delayed retry success does not steal focus after focus moves to a thumbnail',async()=>{
 await mount(gallery);
 await dispatch(image(),'error');
 const control=retry();
 control.focus();
 await click(control);
 const pendingImage=image();
 const second=viewButton(2);
 second.focus();
 assert.equal(document.activeElement,second);
 const gate=deferred();
 const delivery=(async()=>{await gate.promise;await dispatch(pendingImage,'load');})();
 gate.resolve();await delivery;
 assert.equal(document.activeElement,second);
 assert.equal(figure().getAttribute('aria-busy'),'false');
 assert.equal(retry(),undefined);
});

test('gallery CSS keeps 64px previews, touch floors, a selected marker and a separate focus ring',async()=>{
 const css=await readFile(new URL('../src/features/products/productGallery.css',import.meta.url),'utf8');
 assert.match(css,/\.product-gallery-thumb\s*{[^}]*position:\s*relative[^}]*width:\s*64px[^}]*height:\s*64px/);
 assert.match(css,/\.product-gallery-thumb img\s*{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*height:\s*100%[^}]*object-fit:\s*contain/);
 assert.match(css,/\.product-gallery-controls button\s*{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/);
 assert.match(css,/\.product-gallery-controls button\s*{[^}]*align-items:\s*center[^}]*text-align:\s*left/);
 assert.doesNotMatch(css,/\.product-gallery-controls button\s*{[^}]*flex-direction:\s*column/);
 assert.match(css,/\.product-gallery-controls\[role="group"\] button\s*{[^}]*position:\s*relative[^}]*flex:\s*0 1 104px[^}]*flex-direction:\s*column[^}]*align-items:\s*center[^}]*justify-content:\s*flex-start[^}]*text-align:\s*center/);
 assert.match(css,/\.product-gallery-controls\[role="group"\] \.product-gallery-choice\s*{[^}]*width:\s*100%[^}]*justify-content:\s*center[^}]*overflow-wrap:\s*normal[^}]*word-break:\s*normal/);
 assert.match(css,/\.product-gallery-controls\[role="group"\] \.product-gallery-selected-marker\s*{[^}]*position:\s*absolute[^}]*top:\s*\.35rem[^}]*right:\s*\.35rem[^}]*flex-basis:\s*auto[^}]*width:\s*auto[^}]*line-height:\s*1/);
 assert.match(css,/button\[aria-pressed="true"\]/);
 assert.match(css,/button:focus-visible\s*{[^}]*--focus-accent/);
 assert.doesNotMatch(css,/animation|transition|@keyframes|scroll-behavior/);
});
