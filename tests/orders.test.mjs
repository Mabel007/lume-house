import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {createServer} from 'vite';
import {readFileSync} from 'node:fs';
import {renderConfirmation,sendResend} from '../supabase/functions/_shared/email.ts';
import {parseOrder} from '../src/features/orders/orders.ts';
import {placeOrder,loadOrders,loadOrder} from '../src/features/orders/orderRepository.ts';
import {commerceHandler} from '../supabase/functions/_shared/handler.ts';
import {deliverConfirmation} from '../supabase/functions/_shared/confirmation.ts';

export const orderFixture={id:'11111111-1111-4111-8111-111111111111',order_reference:'LH-1234567890ABCDEF',created_at:'2026-10-03T10:00:00Z',total_cents:55000,currency:'NLE',fulfilment_method:'delivery',status:'placed',payment_status:'awaiting_payment',full_name:'Customer <example>',customer_email:'customer@example.invalid',customer_phone:'+23276521208',delivery_street_address:'A landmark',delivery_area:'Lumley',delivery_city:'Freetown',delivery_zone_label:'Lumley to Congo Cross, including Aberdeen',delivery_instructions:null,pickup_location:null,payment_provider:'orange',payment_phone_last4:'1208',subtotal_cents:50000,delivery_fee_cents:5000,order_items:[{product_name:'Historical candle',quantity:2,unit_price_cents:25000}]};
let server, components;
before(async()=>{server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});components=await server.ssrLoadModule('/src/features/orders/OrderPages.tsx');});
after(async()=>{await server?.close()});
const render=(Component,props={})=>renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(Component,props)));
test('historical order boundary preserves prices and rejects inconsistent money',()=>{
 const order=parseOrder(orderFixture);assert.equal(order.order_items[0].unit_price_cents,25000);
 assert.throws(()=>parseOrder({...orderFixture,total_cents:1}));
 assert.throws(()=>parseOrder({...orderFixture,currency:'USD'}));
 assert.throws(()=>parseOrder({...orderFixture,payment_status:'pretend_paid'}));
});
test('My Orders list and detail render durable reference, historical prices and masked payer',()=>{
 const list=render(components.OrderHistory,{orders:[orderFixture]});
 assert.match(list,/LH-1234567890ABCDEF/);assert.match(list,/NLe 550/);assert.match(list,/Awaiting confirmation/);assert.match(list,/account\/orders\//);
 const detail=render(components.OrderSnapshot,{order:parseOrder(orderFixture)});
 assert.match(detail,/Historical candle/);assert.match(detail,/2 × NLe 250/);assert.match(detail,/number ending 1208/);assert.match(detail,/Lumley to Congo Cross/);
 assert.match(render(components.MyOrdersPage),/Sign in to view your orders/);
});
test('success explicitly separates order placement from payment',()=>{
 const html=render(components.OrderSuccessMessage);
 assert.match(html,/Your order has been placed/);assert.match(html,/Payment is awaiting confirmation/);
 assert.doesNotMatch(html,/Payment successful|payment captured|payment verified/i);
});
test('confirmation email includes immutable summary, escapes content and uses no invented sender claim',()=>{
 const email=renderConfirmation(orderFixture);
 for(const text of ['Lumé House','LH-1234567890ABCDEF','Historical candle','NLe 250','NLe 500','NLe 50','NLe 550','Orange Money','awaiting confirmation','A landmark'])assert.ok(email.html.includes(text));
 assert.match(email.html,/Customer &lt;example&gt;/);assert.doesNotMatch(email.html,/Customer <example>/);
 assert.doesNotMatch(email.html,/payment successful|USSD|hello@lumehouse.sl/i);
 assert.match(email.text,/Subtotal: NLe 500/);
});
test('Resend recipient comes from persisted snapshot, stable dedup key and honest failure',async()=>{
 let captured;
 const request=async(url,init)=>{captured={url,init};return new Response(JSON.stringify({id:'mock-message'}),{status:200})};
 assert.equal(await sendResend('unit-test-only','Lumé House <onboarding@resend.dev>',orderFixture,request),'mock-message');
 const payload=JSON.parse(captured.init.body);assert.deepEqual(payload.to,[orderFixture.customer_email]);
 assert.equal(captured.init.headers['Idempotency-Key'],`lume-order-confirmation-v1-${orderFixture.id}`);
 await assert.rejects(sendResend('unit-test-only','sender',orderFixture,async()=>new Response('{}',{status:403})),/resend_http_403/);
});
test('browser order placement calls Edge with JWT and reuses request ID, never table writes',async()=>{
 const calls=[];const client={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-test-jwt'}}})},functions:{invoke:async(name,options)=>{calls.push({name,options});return{data:{order:{id:orderFixture.id},email_status:'queued'},error:null}}}};
 await placeOrder(client,orderFixture.id,{},[]);await placeOrder(client,orderFixture.id,{},[]);
 assert.equal(calls[0].name,'place-order');assert.equal(calls[0].options.body.request_id,calls[1].options.body.request_id);
 assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-test-jwt');
 assert.equal('user_id' in calls[0].options.body,false);
 await assert.rejects(placeOrder({auth:{getSession:async()=>({data:{session:null}})}},orderFixture.id,{},[]),/AUTH_REQUIRED/);
});
test('owner history repository reads through RLS newest-first, with no browser writes',async()=>{
 const calls=[];let detail=false;
 const query={select(...args){calls.push(['select',...args]);return this},order(...args){calls.push(['order',...args]);return this},range(...args){calls.push(['range',...args]);return this},eq(...args){calls.push(['eq',...args]);return this},maybeSingle(){detail=true;return this},then(resolve){resolve({data:detail?orderFixture:[orderFixture],error:null})}};
 const client={from(table){calls.push(['from',table]);return query}};
 assert.equal((await loadOrders(client))[0].order_reference,orderFixture.order_reference);
 assert.deepEqual(calls.find(call=>call[0]==='order'),['order','created_at',{ascending:false}]);
 assert.equal((await loadOrder(client,orderFixture.id)).id,orderFixture.id);
});
test('private mail configuration never enters browser source or env example',()=>{
 const checkout=readFileSync('src/features/checkout/CheckoutPage.tsx','utf8');
 assert.doesNotMatch(checkout,/from\(['"]orders['"]\)\.insert|RESEND_API_KEY|SERVICE_ROLE/);
 assert.doesNotMatch(readFileSync('.env.example','utf8'),/VITE_.*(?:RESEND|SECRET|SERVICE_ROLE)/);
 const handler=readFileSync('supabase/functions/_shared/handler.ts','utf8');
 assert.match(handler,/auth\.getUser/);assert.match(handler,/client\.rpc\('place_order'/);
 assert.doesNotMatch(handler,/console\.log|body\.user_id/);
});
test('trusted handler authenticates JWT, rejects invalid auth, and strips ownership/totals before RPC',async()=>{
 const previousFetch=globalThis.fetch;const previousDeno=globalThis.Deno;
 const calls=[];
 globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://unit.example.invalid',SUPABASE_ANON_KEY:'synthetic-public-config',SUPABASE_SERVICE_ROLE_KEY:'synthetic-server-config'})[name]}};
 globalThis.fetch=async(url,options)=>{
  const path=String(url);calls.push({path,options});
  if(path.includes('/auth/v1/user'))return new Response(JSON.stringify({id:orderFixture.id,email:'fixture@example.invalid'}),{status:200,headers:{'Content-Type':'application/json'}});
  if(path.includes('/rest/v1/rpc/place_order'))return new Response(JSON.stringify({id:orderFixture.id,reference:orderFixture.order_reference,status:'placed',payment_status:'awaiting_payment'}),{status:200,headers:{'Content-Type':'application/json'}});
  throw new Error('Unexpected external request in isolated test');
 };
 try {
  const handler=commerceHandler('place');
  assert.equal((await handler(new Request('https://edge.example.invalid',{method:'POST'}))).status,401);
  const payload={request_id:orderFixture.id,expected_cart:[],checkout:{full_name:'Customer',email:'fixture@example.invalid',contact_phone:'76 521208',payment_phone:'30 521208',fulfilment:'pickup',provider:'orange',user_id:'another-user',total:1,payment_status:'paid'}};
  const response=await handler(new Request('https://edge.example.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic-test-jwt','Content-Type':'application/json'},body:JSON.stringify(payload)}));
  assert.equal(response.status,200);assert.equal((await response.json()).email_status,'queued');
  const rpc=calls.find(call=>call.path.includes('/rpc/place_order'));const body=JSON.parse(rpc.options.body);
  assert.equal(body.p_checkout.contact_phone,'+23276521208');assert.equal(body.p_checkout.payment_phone,'+23230521208');
  assert.equal('user_id' in body.p_checkout,false);assert.equal('total' in body.p_checkout,false);assert.equal('payment_status' in body.p_checkout,false);
  globalThis.fetch=async()=>new Response(JSON.stringify({msg:'invalid JWT'}),{status:401});
  assert.equal((await handler(new Request('https://edge.example.invalid',{method:'POST',headers:{Authorization:'Bearer invalid-test-jwt'},body:'{}'}))).status,401);
 }finally{globalThis.fetch=previousFetch;if(previousDeno===undefined)delete globalThis.Deno;else globalThis.Deno=previousDeno;}
});
test('email failure is durably recorded without deleting or undoing committed orders',async()=>{
 const previousFetch=globalThis.fetch;const previousDeno=globalThis.Deno;
 const calls=[];
 globalThis.Deno={env:{get:name=>name==='RESEND_API_KEY'?'unit-test-only':undefined}};
 globalThis.fetch=async()=>new Response('{}',{status:403});
 const admin={rpc:async(name,args)=>{calls.push({name,args});return name==='claim_order_confirmation'?{data:{claim_token:orderFixture.id,sender:'Lumé House <onboarding@resend.dev>'},error:null}:{data:true,error:null}},from:table=>{assert.equal(table,'orders');const query={select(){return this},eq(){return this},single:async()=>({data:structuredClone(orderFixture),error:null})};return query}};
 try{assert.equal(await deliverConfirmation(admin,orderFixture.id),'queued');assert.equal(calls[1].name,'finish_order_confirmation');assert.equal(calls[1].args.p_provider_id,null);assert.equal(calls[1].args.p_error_code,'resend_http_403');}
 finally{globalThis.fetch=previousFetch;if(previousDeno===undefined)delete globalThis.Deno;else globalThis.Deno=previousDeno;}
});
