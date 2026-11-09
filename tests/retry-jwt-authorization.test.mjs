import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retryHandler} from '../supabase/functions/_shared/retry.ts';
const key='sb_secret_synthetic_scheduler_key_01';
const other='sb_secret_synthetic_other_server_key_02';
const values={SUPABASE_URL:'http://127.0.0.1:9999',RETRY_SCHEDULER_KEY_NAME:'scheduler',SUPABASE_SECRET_KEYS:JSON.stringify({scheduler:key,other}),RESEND_API_KEY:'synthetic-provider-test-only'};
function fixture(overrides={}){let calls=0;const handler=retryHandler({env:n=>({...values,...overrides})[n],client:()=>({rpc:async()=>{calls++;return{data:[],error:null};}})});return{handler,calls:()=>calls};}
for(const [name,headers] of [['missing',{}],['publishable',{apikey:'sb_publishable_synthetic'}],['wrong secret',{apikey:other}],['forged JWT',{Authorization:'Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.forged'}],['legacy bearer',{Authorization:'Bearer synthetic-legacy-service-jwt'}]])test('scheduler rejects '+name+' before any database call',async()=>{
 const f=fixture();const response=await f.handler(new Request('http://127.0.0.1/retry',{method:'POST',headers}));assert.equal(response.status,401);assert.equal(f.calls(),0);assert.doesNotMatch(await response.text(),/synthetic_scheduler_key/);
});
test('only the explicitly selected named secret authenticates service calls',async()=>{const f=fixture();const response=await f.handler(new Request('http://127.0.0.1/retry',{method:'POST',headers:{apikey:key}}));assert.equal(response.status,200);assert.equal(f.calls(),1);assert.deepEqual(await response.json(),{candidates:0,sent:0,queued:0,review:0});});
for(const [label,overrides] of [['no owner selection',{RETRY_SCHEDULER_KEY_NAME:undefined}],['malformed dictionary',{SUPABASE_SECRET_KEYS:'invalid'}],['missing selected key',{RETRY_SCHEDULER_KEY_NAME:'absent'}],['public credential',{SUPABASE_SECRET_KEYS:JSON.stringify({scheduler:'sb_publishable_synthetic'})}]])test('scheduler fails closed with '+label,async()=>{const f=fixture(overrides);assert.equal((await f.handler(new Request('http://127.0.0.1/retry',{method:'POST',headers:{apikey:key}}))).status,503);assert.equal(f.calls(),0);});
test('GET cannot trigger retries',async()=>{const f=fixture();const response=await f.handler(new Request('http://127.0.0.1/retry',{headers:{apikey:key}}));assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'POST');assert.equal(f.calls(),0);});
test('missing provider configuration never selects or consumes a job',async()=>{const f=fixture({RESEND_API_KEY:undefined});assert.equal((await f.handler(new Request('http://127.0.0.1/retry',{method:'POST',headers:{apikey:key}}))).status,503);assert.equal(f.calls(),0);});
