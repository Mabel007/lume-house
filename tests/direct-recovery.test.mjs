import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {startDirectIntent,directSnapshot,parseDirectState,bindDirectIntent,finishDirectIntent,resumeNormalBag} from '../src/features/checkout/directIntent.ts';
import {prepareCustomerAuthReturn,consumeCustomerAuthReturn} from '../src/features/auth/customerAuthIntent.ts';
import {readAttempt,rememberAttempt,completeAttempt,withCheckoutLock,parseAttempt} from '../src/features/orders/checkoutAttempt.ts';
import {recoverCheckout,placeDirectOrder} from '../src/features/orders/orderRepository.ts';
const dom=new JSDOM('',{url:'https://local.example.invalid'});
Object.defineProperty(globalThis,'window',{configurable:true,value:dom.window});
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const request='33333333-3333-4333-8333-333333333333';
const bag={version:1,source:'bag',ownerId:owner,requestId:request};
const direct={...bag,source:'direct',intentId:request,productId:'p',variantId:'v',quantity:2};
beforeEach(()=>{dom.window.sessionStorage.clear();dom.window.localStorage.clear();});
after(()=>dom.window.close());
test('minimal direct intent survives re-read and OAuth; does not enter guest Bag',()=>{
 const intent=startDirectIntent('p','v',2,null);assert.equal(startDirectIntent('other','other',1,null).id,intent.id);
 assert.equal(dom.window.sessionStorage.getItem('lume-guest-cart'),null);
 prepareCustomerAuthReturn();assert.equal(consumeCustomerAuthReturn(),'/checkout/buy-now');assert.equal(consumeCustomerAuthReturn(),null);
 assert.equal(bindDirectIntent(owner).ownerId,owner);assert.equal(bindDirectIntent(other),null);
 assert.equal(parseDirectState(directSnapshot()).intent.ownerId,owner);
 finishDirectIntent(intent.id);assert.deepEqual(parseDirectState(directSnapshot()),{hold:true,intent:null,invalid:false});
 resumeNormalBag();assert.equal(parseDirectState(directSnapshot()).hold,false);
});
test('malformed intent fails closed and unsafe auth returns cannot be consumed',()=>{
 assert.deepEqual(parseDirectState('{broken'),{hold:true,intent:null,invalid:true});
 const intent=startDirectIntent('p','v',1,null);prepareCustomerAuthReturn();finishDirectIntent(intent.id);
 assert.equal(consumeCustomerAuthReturn(),null);
 assert.throws(()=>startDirectIntent('p','v',1.5,null));
});
test('resuming, binding an existing owner and preparing OAuth each re-arm a released direct hold',()=>{
 const intent=startDirectIntent('p','v',2,owner);
 resumeNormalBag();assert.equal(parseDirectState(directSnapshot()).hold,false);
 assert.deepEqual(startDirectIntent('different','different',3,other),intent);
 assert.equal(parseDirectState(directSnapshot()).hold,true);
 resumeNormalBag();assert.deepEqual(bindDirectIntent(owner),intent);
 assert.equal(parseDirectState(directSnapshot()).hold,true);
 resumeNormalBag();prepareCustomerAuthReturn();
 assert.equal(parseDirectState(directSnapshot()).hold,true);
 assert.equal(consumeCustomerAuthReturn(),'/checkout/buy-now');
});
test('a failed hold write refuses re-entry and OAuth continuation without replacing the intent',()=>{
 const intent=startDirectIntent('p','v',2,owner);resumeNormalBag();
 const prototype=dom.window.Storage.prototype,original=prototype.setItem;
 prototype.setItem=function(key,value){if(this===dom.window.sessionStorage)throw Error('blocked');return original.call(this,key,value);};
 try{
  assert.throws(()=>startDirectIntent('p','v',2,owner),/blocked/);
  assert.throws(()=>prepareCustomerAuthReturn(),/blocked/);
  assert.equal(dom.window.sessionStorage.getItem('lume-customer-auth-return'),null);
  assert.deepEqual(parseDirectState(directSnapshot()).intent,intent);
 }finally{prototype.setItem=original;}
});
function denyLocalStorage(operation){
 const prototype=dom.window.Storage.prototype,originalGet=prototype.getItem,originalSet=prototype.setItem;
 prototype.getItem=function(key){if(this===dom.window.localStorage)throw Error('localStorage denied');return originalGet.call(this,key);};
 prototype.setItem=function(key,value){if(this===dom.window.localStorage)throw Error('localStorage denied');return originalSet.call(this,key,value);};
 try{return operation();}finally{prototype.getItem=originalGet;prototype.setItem=originalSet;}
}
test('session-only Bag storage preserves a pending request across reload/retry and completes without localStorage',()=>{
 denyLocalStorage(()=>{
  assert.equal(readAttempt(owner,'bag'),null);
  assert.deepEqual(rememberAttempt(bag),bag);
  assert.deepEqual(readAttempt(owner,'bag'),bag);
  assert.equal(rememberAttempt({...bag,requestId:crypto.randomUUID()}).requestId,request);
  completeAttempt(owner,'44444444-4444-4444-8444-444444444444');assert.deepEqual(readAttempt(owner,'bag'),bag);
  completeAttempt(owner,request);assert.equal(readAttempt(owner,'bag'),null);
  assert.throws(()=>readAttempt(owner,'direct'));
  assert.throws(()=>rememberAttempt(direct));
 });
});
test('a known shared attempt cannot silently become an empty session-only Bag when localStorage later fails',()=>{
 rememberAttempt(direct);
 denyLocalStorage(()=>{
  assert.throws(()=>readAttempt(owner,'bag'),/CHECKOUT_STORAGE_UNAVAILABLE/);
  assert.throws(()=>rememberAttempt(bag));
  assert.throws(()=>completeAttempt(owner,request));
 });
 assert.deepEqual(readAttempt(owner),direct);
});
test('a shared Bag attempt without its legacy ID still blocks fallback when shared storage becomes unreadable',()=>{
 rememberAttempt(bag);dom.window.sessionStorage.removeItem(`lume-checkout-${owner}`);
 denyLocalStorage(()=>assert.throws(()=>readAttempt(owner,'bag'),/CHECKOUT_STORAGE_UNAVAILABLE/));
 assert.deepEqual(readAttempt(owner),bag);
});
test('Bag can use verified session persistence after a denied shared write that provably stored nothing',()=>{
 const prototype=dom.window.Storage.prototype,original=prototype.setItem;
 prototype.setItem=function(key,value){if(this===dom.window.localStorage)throw Error('write denied');return original.call(this,key,value);};
 try{assert.deepEqual(rememberAttempt(bag),bag);assert.deepEqual(readAttempt(owner,'bag'),bag);}
 finally{prototype.setItem=original;}
});
test('observed shared recovery is witnessed before a later read failure, including a record from another tab',()=>{
 dom.window.localStorage.setItem(`lume-checkout-attempt-${owner}`,JSON.stringify(direct));
 assert.deepEqual(readAttempt(owner,'bag'),direct);
 denyLocalStorage(()=>assert.throws(()=>readAttempt(owner,'bag'),/CHECKOUT_STORAGE_UNAVAILABLE/));
});
test('a partially persisted shared write is not downgraded or erased',()=>{
 const prototype=dom.window.Storage.prototype,original=prototype.setItem;
 prototype.setItem=function(key,value){original.call(this,key,value);if(this===dom.window.localStorage)throw Error('response lost');};
 try{assert.throws(()=>rememberAttempt(bag),/CHECKOUT_STORAGE_UNAVAILABLE/);}
 finally{prototype.setItem=original;}
 denyLocalStorage(()=>assert.throws(()=>readAttempt(owner,'bag'),/CHECKOUT_STORAGE_UNAVAILABLE/));
 assert.deepEqual(readAttempt(owner),bag);
});
test('malformed recovery and failed session persistence cannot start a fallback purchase',()=>{
 dom.window.localStorage.setItem(`lume-checkout-attempt-${owner}`,'{broken');
 assert.throws(()=>readAttempt(owner,'bag'));assert.throws(()=>rememberAttempt(bag));dom.window.localStorage.clear();
 const prototype=dom.window.Storage.prototype,original=prototype.setItem;
 prototype.setItem=function(key,value){if(this===dom.window.sessionStorage)throw Error('session denied');return original.call(this,key,value);};
 try{denyLocalStorage(()=>assert.throws(()=>rememberAttempt(bag),/session denied/));assert.throws(()=>rememberAttempt(direct),/session denied/);}
 finally{prototype.setItem=original;}
 assert.equal(dom.window.localStorage.getItem(`lume-checkout-attempt-${owner}`),null);
});
test('legacy Bag pending IDs retain compatibility and migrate into same request',()=>{
 dom.window.sessionStorage.setItem(`lume-checkout-${owner}`,request);
 assert.deepEqual(readAttempt(owner),bag);
 assert.equal(rememberAttempt({...bag,requestId:crypto.randomUUID()}).requestId,request);
 completeAttempt(owner,'44444444-4444-4444-8444-444444444444');assert.ok(readAttempt(owner));
 completeAttempt(owner,request);assert.equal(readAttempt(owner),null);
});
test('owner/source/selection guards prevent cross-mode recovery and shared records survive a tab reload',()=>{
 rememberAttempt(direct);assert.deepEqual(readAttempt(owner),direct);assert.equal(readAttempt(other),null);
 assert.throws(()=>rememberAttempt(bag),/OTHER_CHECKOUT_PENDING/);
 assert.throws(()=>rememberAttempt({...direct,quantity:3}),/OTHER_CHECKOUT_PENDING/);
 assert.throws(()=>parseAttempt(JSON.stringify(direct),other),/CHECKOUT_RECOVERY_INVALID/);
 dom.window.sessionStorage.clear();assert.deepEqual(readAttempt(owner),direct);
});
test('unavailable storage prevents starting a recoverable purchase',()=>{
 const prototype=dom.window.Storage.prototype;const original=prototype.setItem;
 prototype.setItem=()=>{throw new Error('blocked');};
 try{assert.throws(()=>startDirectIntent('p','v',1,null),/blocked/);assert.throws(()=>rememberAttempt(direct),/blocked/);}finally{prototype.setItem=original;}
});
test('cross-tab lock contention rejects a simultaneous checkout without replacing its request',async()=>{
 let held=false,release;const old=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:async(_name,_options,callback)=>{if(held)return callback(null);held=true;try{return await callback({});}finally{held=false;}}}}});
 try{
  const first=withCheckoutLock(owner,true,async()=>{rememberAttempt(direct);await new Promise(resolve=>{release=resolve;});});
  await assert.rejects(withCheckoutLock(owner,true,async()=>rememberAttempt(bag)),/CHECKOUT_BUSY/);release();await first;
  assert.deepEqual(readAttempt(owner),direct);
 }finally{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;}
});
test('unsupported cross-tab locking fails closed for direct placement',async()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'navigator');let ran=false;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
 try{await assert.rejects(withCheckoutLock(owner,true,async()=>{ran=true;}),/CHECKOUT_LOCK_UNAVAILABLE/);assert.equal(ran,false);assert.equal(readAttempt(owner),null);}
 finally{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;}
});
function client(result,sessionOwner=owner){return {auth:{getSession:async()=>({data:{session:{user:{id:sessionOwner},access_token:'local-test'}}})},from(){return {select(){return this;},eq(){return this;},setHeader(){return this;},maybeSingle:async()=>({data:result,error:null})};}};}
test('missing recovery row remains pending; mismatched source or item cannot be accepted',async()=>{
 rememberAttempt(direct);assert.equal(await recoverCheckout(client(null),direct),null);assert.deepEqual(readAttempt(owner),direct);
 await assert.rejects(recoverCheckout(client({id:request,checkout_source:'bag'}),direct),/CHECKOUT_SOURCE_CONFLICT/);
 await assert.rejects(recoverCheckout(client({id:request,checkout_source:'direct',order_items:[{variant_id:'other',quantity:2}]}),direct),/CHECKOUT_SELECTION_CONFLICT/);
 await assert.rejects(recoverCheckout(client(null,other),direct),/AUTH_REQUIRED/);
 assert.equal(await recoverCheckout(client({id:request,checkout_source:'direct',order_items:[{variant_id:'v',quantity:2}]}),direct),request);
});
test('browser calls only dedicated endpoint and rejects an unsupported success envelope',async()=>{
 const calls=[];const c=client(null);c.functions={invoke:async(name,options)=>{calls.push({name,options});return {data:{order:{id:request}},error:null};}};
 await assert.rejects(placeDirectOrder(c,direct,{},{}),/DIRECT_UNAVAILABLE/);
 assert.equal(calls[0].name,'place-direct-order');assert.equal(calls[0].options.body.request_id,request);
 c.functions.invoke=async()=>({data:{protocol:1,checkout_source:'direct',request_id:request,order:{id:request}},error:null});
 assert.equal((await placeDirectOrder(c,direct,{},{})).id,request);
});
