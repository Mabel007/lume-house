// HTTP contract coverage for the actual retry/delivery code. Lease concurrency
// is verified against PostgreSQL by supabase/tests/s02-concurrency.mjs.
import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {retryHandler} from '../supabase/functions/_shared/retry.ts';
const key='sb_secret_synthetic_scheduler_key_01';
const oid='11111111-1111-4111-8111-111111111111';
const token='22222222-2222-4222-8222-222222222222';
const nativeFetch=globalThis.fetch,previousDeno=globalThis.Deno;
let server,base,handler;let requests=[],providerFailure=false,busy=false,finishAccepted=true;
before(async()=>{
 server=createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;const body=text?JSON.parse(text):null;const pathname=new URL(req.url,'http://local').pathname;requests.push({path:pathname,method:req.method,body,headers:req.headers});res.setHeader('Content-Type','application/json');
  if(pathname==='/rest/v1/rpc/claim_retry_jobs')return res.end(JSON.stringify([{order_id:oid,status:'pending',attempts:0,next_attempt_at:new Date().toISOString()}]));
  if(pathname==='/rest/v1/rpc/claim_order_confirmation')return res.end(JSON.stringify(busy?null:{order_id:oid,claim_token:token,sender:'Fixture <sender@example.invalid>'}));
  if(pathname==='/rest/v1/order_confirmation_jobs'&&req.method==='GET')return res.end(JSON.stringify({status:'processing',last_error_code:null}));
  if(pathname==='/rest/v1/orders')return res.end(JSON.stringify({id:oid,order_reference:'LH-0123456789ABCDEF',full_name:'Fixture',customer_email:'fixture@example.invalid',fulfilment_method:'pickup',pickup_location:'Lumley',subtotal_cents:1800,delivery_fee_cents:0,total_cents:1800,payment_provider:'orange',order_items:[{product_name:'Mug',quantity:1,unit_price_cents:1800}]}));
  if(pathname==='/provider/emails'){res.statusCode=providerFailure?503:200;return res.end(JSON.stringify(providerFailure?{message:'fixture outage'}:{id:'fixture-provider-id'}));}
  if(pathname==='/rest/v1/rpc/finish_order_confirmation')return res.end(JSON.stringify(finishAccepted));
  res.statusCode=501;res.end(JSON.stringify({message:'Dependency interaction not modeled'}));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 const env=n=>({SUPABASE_URL:base,RETRY_SCHEDULER_KEY_NAME:'scheduler',SUPABASE_SECRET_KEYS:JSON.stringify({scheduler:key}),RESEND_API_KEY:'synthetic-provider-only'})[n];globalThis.Deno={env:{get:env}};
 globalThis.fetch=(input,options)=>{const url=String(input);if(url==='https://api.resend.com/emails')return nativeFetch(base+'/provider/emails',options);if(!url.startsWith(base+'/'))throw Error('External network forbidden');return nativeFetch(input,options);};handler=retryHandler({env});
});
beforeEach(()=>{requests=[];providerFailure=false;busy=false;finishAccepted=true;});
after(async()=>{globalThis.fetch=nativeFetch;globalThis.Deno=previousDeno;await new Promise(resolve=>server?.close(resolve));});
const invoke=()=>handler(new Request(base+'/retry',{method:'POST',headers:{apikey:key}}));
test('real SDK/delivery flow finishes with its claim token and stable provider idempotency key',async()=>{const response=await invoke();assert.equal(response.status,200);assert.equal((await response.json()).sent,1);const send=requests.find(r=>r.path==='/provider/emails');assert.equal(send.headers['idempotency-key'],'lume-order-confirmation-v1-'+oid);const finish=requests.find(r=>r.path.endsWith('/finish_order_confirmation'));assert.equal(finish.body.p_claim_token,token);assert.equal(finish.body.p_provider_id,'fixture-provider-id');assert.equal(requests.some(r=>r.method==='PATCH'),false);});
test('provider failure is finished by token; Edge never overwrites SQL backoff',async()=>{providerFailure=true;const response=await invoke();assert.equal((await response.json()).queued,1);const finish=requests.find(r=>r.path.endsWith('/finish_order_confirmation'));assert.equal(finish.body.p_claim_token,token);assert.equal(finish.body.p_error_code,'resend_http_503');assert.equal(requests.some(r=>r.method==='PATCH'),false);});
test('busy lease does not send, finish, or alter scheduling',async()=>{busy=true;assert.equal((await (await invoke()).json()).queued,1);assert.equal(requests.some(r=>r.path==='/provider/emails'||r.path.endsWith('/finish_order_confirmation')||r.method==='PATCH'),false);});
test('uncertain finish does not issue a compensating scheduling write',async()=>{finishAccepted=false;assert.equal((await (await invoke()).json()).queued,1);assert.equal(requests.filter(r=>r.path.endsWith('/finish_order_confirmation')).length,1);assert.equal(requests.some(r=>r.method==='PATCH'),false);});
