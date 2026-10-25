import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {commerceHandler} from '../supabase/functions/_shared/handler.ts';
const id='11111111-1111-4111-8111-111111111111';
const payload={protocol:1,request_id:id,variant_id:'default:amber-candle',quantity:2,expected_quote:{product_id:'amber-candle',variant_id:'default:amber-candle',quantity:2,unit_price:25000},checkout:{full_name:'Customer',email:'fixture@example.invalid',contact_phone:'76 521208',payment_phone:'30 521208',provider:'orange',fulfilment:'pickup',user_id:'forged',total:0,payment_status:'paid'}};
let server,previousDeno,base,refuse=null,invalidAuth=false;const calls=[];
before(async()=>{
 previousDeno=globalThis.Deno;
 server=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  calls.push({path:req.url,authorization:req.headers.authorization,body:raw?JSON.parse(raw):null});
  res.setHeader('Content-Type','application/json');
  if(req.url==='/auth/v1/user'){res.statusCode=invalidAuth?401:200;res.end(JSON.stringify(invalidAuth?{message:'invalid JWT'}:{id}));return;}
  if(req.url==='/rest/v1/rpc/place_direct_variant_order'){
   res.statusCode=refuse?400:200;res.end(JSON.stringify(refuse||{id,status:'placed',payment_status:'awaiting_payment'}));return;
  }
  res.statusCode=501;res.end(JSON.stringify({message:'Dependency not modeled'}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
 globalThis.Deno={env:{get:name=>({SUPABASE_URL:base,SUPABASE_ANON_KEY:'local-public-test',SUPABASE_SERVICE_ROLE_KEY:'local-email-test',ALLOWED_ORIGINS:'http://127.0.0.1:5188'})[name]}};
});
after(async()=>{globalThis.Deno=previousDeno;await new Promise(resolve=>server.close(resolve));});
const send=(value=payload,headers={Authorization:'Bearer local-customer-test'})=>commerceHandler('direct')(new Request('http://127.0.0.1/edge',{method:'POST',headers,body:JSON.stringify(value)}));
test('dedicated handler uses actual HTTP Auth and only direct RPC with customer JWT',async()=>{
 const response=await send();assert.equal(response.status,200);const body=await response.json();
 assert.equal(body.protocol,1);assert.equal(body.checkout_source,'direct');assert.equal(body.request_id,id);assert.equal(body.order.id,id);assert.equal(body.email_status,'queued');
 const rpc=calls.find(c=>c.path==='/rest/v1/rpc/place_direct_variant_order');
 assert.equal(rpc.authorization,'Bearer local-customer-test');assert.equal(rpc.body.p_checkout.contact_phone,'+23276521208');
 for(const field of ['user_id','total','payment_status'])assert.equal(field in rpc.body.p_checkout,false);
 assert.deepEqual(rpc.body.p_expected_quote,payload.expected_quote);
 assert.equal(calls.some(c=>/rpc\/(?:place_order|place_variant_order)$/.test(c.path)),false);
});
test('JWT rejection and CORS/method checks do not reach order RPC',async()=>{
 let count=calls.filter(c=>c.path.includes('/rpc/')).length;
 assert.equal((await send(payload,{})).status,401);
 invalidAuth=true;assert.equal((await send()).status,401);invalidAuth=false;
 assert.equal((await send(payload,{Authorization:'Bearer local-customer-test',Origin:'https://unapproved.invalid'})).status,403);
 assert.equal((await commerceHandler('direct')(new Request('http://127.0.0.1/edge'))).status,405);
 assert.equal(calls.filter(c=>c.path.includes('/rpc/')).length,count);
});
test('strict version, quantity and quote shapes reject without fallback',async()=>{
 const count=calls.filter(c=>c.path.includes('/rpc/')).length;
 for(const patch of [{protocol:0},{quantity:1.5},{quantity:0},{quantity:100},{variant_id:''},{checkout:[]},{expected_quote:[]},{expected_cart:[]},{cart_version:2},{expected_quote:{...payload.expected_quote,quantity:1}},{expected_quote:{...payload.expected_quote,unit_price:-1}}])assert.equal((await send({...payload,...patch})).status,400);
 assert.equal(calls.filter(c=>c.path.includes('/rpc/')).length,count);
});
test('source, selection, quote and stock refusals map to permanent 409',async()=>{
 for(const message of ['CHECKOUT_SOURCE_CONFLICT','CHECKOUT_SELECTION_CONFLICT','QUOTE_CHANGED','OUT_OF_STOCK','PRODUCT_UNAVAILABLE']){
  refuse={code:'PT409',message};const response=await send();assert.equal(response.status,409);assert.equal((await response.json()).error,message);
 }refuse=null;
});
test('validation and auth map correctly; missing schema fails closed; unknown outcome stays unavailable',async()=>{
 for(const [message,code,status,expected] of [['AUTH_REQUIRED','P0001',401,'AUTH_REQUIRED'],['INVALID_DELIVERY_DETAILS','P0001',400,'INVALID_DELIVERY_DETAILS'],['ORDER_TOTAL_LIMIT','P0001',400,'ORDER_TOTAL_LIMIT'],['missing function','PGRST202',503,'DIRECT_UNAVAILABLE'],['untrusted database internals','XX000',503,'ORDER_UNAVAILABLE']]){
  refuse={message,code};const response=await send();assert.equal(response.status,status);assert.equal((await response.json()).error,expected);
 }refuse=null;
 assert.equal(calls.some(c=>/rpc\/(?:place_order|place_variant_order)$/.test(c.path)),false);
});
test('same request is forwarded unchanged on retries and excessive bodies are rejected',async()=>{
 await send();await send();const recent=calls.filter(c=>c.path==='/rest/v1/rpc/place_direct_variant_order').slice(-2);
 assert.deepEqual(recent.map(c=>c.body.p_request_id),[id,id]);
 assert.equal((await send({...payload,extra:'x'.repeat(20001)})).status,400);
});
