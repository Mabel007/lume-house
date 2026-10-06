import { test } from "node:test";
import assert from "node:assert/strict";
import { cartReducer, getCartLines, MAX_QUANTITY } from "./cart.ts";
import {readGuestCart,resolveGuestCart,serializeGuestCart,stampGuestIntent} from './guestCart.ts';
import {parseVariantCart,loadVariantCart,changeVariantCart,VariantCartError} from './variantCartRepository.ts';
import type {Product} from '../products/products.ts';
import type {SupabaseClient} from '@supabase/supabase-js';

test("adds, combines, updates and removes lines without mutating state", () => {
  const first = cartReducer([], { type: "add", productId: "a" });
  const second = cartReducer(first, { type: "add", productId: "a" });
  assert.equal(first[0].quantity, 1);
  assert.deepEqual(second, [{ productId: "a", quantity: 2 }]);
  const updated = cartReducer(second, {
    type: "quantity",
    productId: "a",
    quantity: 4,
  });
  assert.equal(updated[0].quantity, 4);
  assert.deepEqual(
    cartReducer(updated, { type: "remove", productId: "a" }),
    [],
  );
});

const product:Product={id:'a',name:'Fixture',description:'Fixture',category:'Test',image:'/test.svg',color:'#fff',price:1000,variants:[
  {id:'default:a',productId:'a',options:{},isDefault:true,price:1200,currency:'NLE',inventoryPolicy:'untracked'},
  {id:'blue',productId:'a',options:{Color:'Blue'},isDefault:false,price:1800,currency:'NLE',inventoryPolicy:'untracked'},
  {id:'red',productId:'a',options:{Color:'Red'},isDefault:false,price:2100,currency:'NLE',inventoryPolicy:'untracked'},
]};
test('variants of one parent remain distinct through add, quantity, removal and current pricing',()=>{
  let items=cartReducer([],{type:'add',productId:'a',variantId:'blue',quantity:2});
  items=cartReducer(items,{type:'add',productId:'a',variantId:'red'});
  items=cartReducer(items,{type:'add',productId:'a',variantId:'blue'});
  assert.deepEqual(items.map(item=>[item.variantId,item.quantity]),[['blue',3],['red',1]]);
  assert.deepEqual(getCartLines(items,[product]).map(line=>line.lineTotal),[5400,2100]);
  assert.equal(getCartLines(items,[{...product,variants:product.variants!.filter(variant=>variant.id!=='blue')}]).length,1);
  items=cartReducer(items,{type:'quantity',productId:'a',variantId:'red',quantity:4});
  assert.equal(items[0].quantity,3);assert.equal(items[1].quantity,4);
  assert.deepEqual(cartReducer(items,{type:'remove',productId:'a',variantId:'blue'}).map(item=>item.variantId),['red']);
});
test('untracked intent stays usable while unavailable tracked lines are retained but excluded from estimates',()=>{
 const cart=[{productId:'a',variantId:'blue',quantity:3}];
 const tracked={...product,variants:product.variants!.map(variant=>({...variant,inventoryPolicy:'tracked' as const,available:false}))};
 assert.equal(getCartLines(cart,[product]).length,1);
 assert.equal(getCartLines(cart,[tracked]).length,0);assert.equal(cart[0].quantity,3);
 assert.equal(getCartLines(cart,[{...tracked,variants:tracked.variants.map(variant=>({...variant,available:true}))}])[0].lineTotal,5400);
});
test('legacy guest storage resolves only the deterministic default and retains unresolved intent',()=>{
  const legacy=readGuestCart('[{"productId":"a","quantity":2},{"productId":"missing","quantity":1}]');
  const resolved=resolveGuestCart(legacy,[product]);
  assert.equal(resolved[0].variantId,'default:a');assert.equal(resolved[1].variantId,undefined);
  assert.equal(resolveGuestCart(legacy,[{...product,variants:product.variants!.filter(variant=>!variant.isDefault)}])[0].variantId,undefined);
  assert.deepEqual(readGuestCart(serializeGuestCart(resolved)),resolved);
  assert.deepEqual(resolveGuestCart([...legacy,{productId:'a',variantId:'default:a',quantity:3}],[product]).map(item=>[item.productId,item.quantity]),[['a',5],['missing',1]]);
  assert.deepEqual(readGuestCart('{"version":3,"items":[]}'),[]);
  assert.deepEqual(readGuestCart('bad json'),[]);
  assert.deepEqual(readGuestCart('[{"productId":"a","quantity":100}]'),[]);
});
test('guest retry receipts are stable across reloads and change only for changed quantity intent',()=>{
  const receipt='11111111-1111-4111-8111-111111111111';
  const next='22222222-2222-4222-8222-222222222222';
  const first=stampGuestIntent([{productId:'a',variantId:'blue',quantity:2}],[],()=>receipt);
  const restored=readGuestCart(serializeGuestCart(first));
  assert.equal(stampGuestIntent(restored,restored,()=>next)[0].mergeId,receipt);
  assert.equal(stampGuestIntent([{...restored[0],quantity:3}],restored,()=>next)[0].mergeId,next);
});
test('authenticated Bag uses JWT-bound trusted RPCs and rejects duplicate or corrupt persisted lines',async()=>{
  const payload={id:'cart',items:[{product_id:'a',variant_id:'blue',quantity:2},{product_id:'a',variant_id:'red',quantity:1}]};
  assert.equal(parseVariantCart(payload).items.length,2);
  assert.throws(()=>parseVariantCart({...payload,items:[payload.items[0],payload.items[0]]}));
  assert.throws(()=>parseVariantCart({...payload,items:[{...payload.items[0],quantity:0}]}));
  const calls:unknown[][]=[];
  const client={rpc(name:string,args?:unknown){calls.push([name,args]);return {setHeader(name:string,value:string){calls.push([name,value]);return Promise.resolve({data:payload,error:null});}}}} as unknown as SupabaseClient;
  await loadVariantCart(client,'synthetic-test-jwt');
  await changeVariantCart(client,'synthetic-test-jwt','blue','merge',2,null,'11111111-1111-4111-8111-111111111111');
  assert.deepEqual(calls[0],['load_variant_cart',undefined]);
  assert.deepEqual(calls[1],['Authorization','Bearer synthetic-test-jwt']);
  assert.deepEqual(calls[2],['change_variant_cart',{p_variant_id:'blue',p_mode:'merge',p_quantity:2,p_expected_quantity:null,p_operation_id:'11111111-1111-4111-8111-111111111111'}]);
  assert.equal(JSON.stringify(calls).includes('user_id'),false);
});
test('missing variant RPC is a schema deployment error, never a successful restore or legacy table mutation',async()=>{
  const guest=stampGuestIntent([{productId:'a',variantId:'default:a',quantity:2}],[],()=> '11111111-1111-4111-8111-111111111111');
  const original=serializeGuestCart(guest);
  const calls:string[]=[];
  const client={rpc(name:string){calls.push(name);return {setHeader(){return Promise.resolve({data:null,error:{code:'PGRST202',message:'Could not find function in schema cache'}});}}},from(){throw new Error('Must not fall back to untrusted table writes');}} as unknown as SupabaseClient;
  await assert.rejects(loadVariantCart(client,'synthetic-test-jwt'),error=>error instanceof VariantCartError&&error.code==='SCHEMA_NOT_READY'&&error.message.includes('Guest items are retained'));
  await assert.rejects(changeVariantCart(client,'synthetic-test-jwt','default:a','merge',2,null,guest[0].mergeId!),error=>error instanceof VariantCartError&&error.code==='SCHEMA_NOT_READY');
  assert.equal(serializeGuestCart(guest),original);
  assert.deepEqual(calls,['load_variant_cart','change_variant_cart']);
});
test("rejects invalid quantities and caps repeated additions", () => {
  const state = [{ productId: "a", quantity: MAX_QUANTITY }];
  for (const quantity of [0, -1, 1.5, NaN, Infinity, 100]) {
    assert.equal(
      cartReducer(state, { type: "quantity", productId: "a", quantity }),
      state,
    );
  }
  assert.equal(
    cartReducer(state, { type: "add", productId: "a" })[0].quantity,
    MAX_QUANTITY,
  );
});
test("resolves current catalog prices and omits unavailable products", () => {
  const cart = [
    { productId: "a", quantity: 3 },
    { productId: "missing", quantity: 1 },
  ];
  assert.equal(
    getCartLines(cart, [{ id: "a", price: 1800 }])[0].lineTotal,
    5400,
  );
  const repriced = getCartLines(cart, [{ id: "a", price: 2000 }]);
  assert.equal(repriced.length, 1);
  assert.equal(repriced[0].lineTotal, 6000);
  assert.deepEqual(getCartLines([], []), []);
});
