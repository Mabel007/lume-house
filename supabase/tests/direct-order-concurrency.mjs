// Only a disposable clone inside the existing network-isolated SQL harness.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
const container=process.argv[2];
assert.equal(container,'lume-foundation-sql-check');
const inspected=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(inspected.HostConfig.NetworkMode,'none');
assert.equal(inspected.HostConfig.AutoRemove,true);
assert.equal(inspected.Config.Image,'postgres:14.1-alpine');
const db='lume_direct_order_race';
const args=['exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'];
const sql=s=>execFileSync('docker',args,{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:20000});
const children=new Set();
function connection(){const p=spawn('docker',args);children.add(p);let output='',error='';p.stdout.on('data',v=>output+=v);p.stderr.on('data',v=>error+=v);const done=new Promise(resolve=>p.on('close',code=>{children.delete(p);resolve({code,output,error});}));return {p,done,get output(){return output;}};}
function session(s){const c=connection();c.p.stdin.end(s);return c.done;}
const a='91000000-0000-4000-8000-000000000001',b='91000000-0000-4000-8000-000000000002';
const checkout=`'{"full_name":"Local race","email":"race@example.invalid","contact_phone":"+23276521208","payment_phone":"+23276521209","provider":"orange","fulfilment":"pickup"}'::jsonb`;
const quote=`'{"product_id":"amber-candle","variant_id":"default:amber-candle","quantity":1,"unit_price":100}'::jsonb`;
const start=owner=>`begin;set local statement_timeout='12s';select set_config('request.jwt.claim.sub','${owner}',true);set local role authenticated;`;
const direct=r=>`select public.place_direct_variant_order('${r}','default:amber-candle',1,${quote},${checkout});`;
const bag=r=>`select public.place_variant_order('${r}',${checkout},jsonb_build_array(${quote}));`;
let created=false;
async function until(predicate,label){for(let n=0;n<150;n++){if(predicate())return;await new Promise(r=>setTimeout(r,30));}throw Error(label);}
async function race(lock,calls){
 const barrier=connection();
 try{
  barrier.p.stdin.write(`begin;set local statement_timeout='12s';${lock};select 'BARRIER_READY';\n`);
  await until(()=>barrier.output.includes('BARRIER_READY'),'barrier not ready');
  const runs=calls.map(s=>session(s));
  await until(()=>Number(sql(`select count(*) from pg_stat_activity where datname='${db}' and wait_event_type='Lock' and (query like '%select public.place_direct_variant_order(%' or query like '%select public.place_variant_order(%');`).trim())===2,'both calls did not reach lock wait');
  barrier.p.stdin.end('commit;\n');assert.equal((await barrier.done).code,0);
  return await Promise.all(runs);
 }finally{if(!barrier.p.stdin.destroyed)barrier.p.stdin.end('rollback;\n');}
}
try{
 execFileSync('docker',['exec',container,'createdb','-U','postgres','--maintenance-db=template1','-T','postgres',db],{stdio:'pipe'});created=true;
 sql(`insert into auth.users(id) values('${a}'),('${b}');
 update public.product_variants set price_cents=100 where id='default:amber-candle';
 select public.adjust_variant_inventory('default:amber-candle',1,'Disposable race stock','92000000-0000-4000-8000-000000000001');
 update public.product_variants set inventory_policy='tracked' where id='default:amber-candle';
 insert into public.carts(id,user_id,cart_version) values('${a}','${a}',2),('${b}','${b}',2);
 insert into public.variant_cart_items(cart_id,variant_id,quantity) values('${a}','default:amber-candle',1),('${b}','default:amber-candle',1);`);
 const stockLock=`select variant_id from public.variant_inventory where variant_id='default:amber-candle' for update`;
 let results=await race(stockLock,[start(a)+direct('93000000-0000-4000-8000-000000000001')+'commit;',start(b)+direct('93000000-0000-4000-8000-000000000002')+'commit;']);
 assert.equal(results.filter(r=>r.code===0).length,1);assert.match(results.find(r=>r.code!==0).error,/OUT_OF_STOCK/);
 assert.equal(sql('select count(*) from public.orders;').trim(),'1');assert.equal(sql('select allocated from public.variant_inventory;').trim(),'1');
 assert.equal(sql('select sum(quantity) from public.variant_cart_items;').trim(),'2');
 console.log('PASS: two-owner direct race allocates final stock once and preserves both Bags');
 const winner=results[0].code===0?[a,'93000000-0000-4000-8000-000000000001']:[b,'93000000-0000-4000-8000-000000000002'];
 // Accepted result can be recovered after the caller discards its first response.
 assert.equal((await session(start(winner[0])+direct(winner[1])+'commit;')).code,0);
 assert.equal(sql('select count(*) from public.order_confirmation_jobs;').trim(),'1');
 console.log('PASS: discarded-response recovery replays accepted exhausted-stock order without another job');
 sql(`select public.adjust_variant_inventory('default:amber-candle',1,'Retry race stock','92000000-0000-4000-8000-000000000002');`);
 const ownerLock=`select pg_advisory_xact_lock(hashtextextended('${a}',0))`;
 const request='93000000-0000-4000-8000-000000000003';
 results=await race(ownerLock,[start(a)+direct(request)+'commit;',start(a)+direct(request)+'commit;']);
 assert.ok(results.every(r=>r.code===0));assert.equal(sql(`select count(*) from public.orders where user_id='${a}' and checkout_request_id='${request}';`).trim(),'1');
 assert.equal(sql(`select count(*) from public.inventory_ledger where event='order_allocation';`).trim(),'2');
 console.log('PASS: two-session identical request replay creates one order and allocation');
 sql(`select public.adjust_variant_inventory('default:amber-candle',1,'Cross mode stock','92000000-0000-4000-8000-000000000003');`);
 const mixed='93000000-0000-4000-8000-000000000004';
 results=await race(ownerLock,[start(a)+direct(mixed)+'commit;',start(a)+bag(mixed)+'commit;']);
 assert.equal(results.filter(r=>r.code===0).length,1);assert.match(results.find(r=>r.code!==0).error,/CHECKOUT_SOURCE_CONFLICT/);
 const source=sql(`select checkout_source from public.orders where checkout_request_id='${mixed}';`).trim();
 assert.equal(sql(`select count(*) from public.variant_cart_items where cart_id='${a}';`).trim(),source==='direct'?'1':'0');
 console.log('PASS: simultaneous Bag/direct same-key race commits one source and rejects the other');
 sql(`select public.adjust_variant_inventory('default:amber-candle',1,'Mixed owner stock','92000000-0000-4000-8000-000000000004');`);
 results=await race(stockLock,[start(a)+direct('93000000-0000-4000-8000-000000000005')+'commit;',start(b)+bag('93000000-0000-4000-8000-000000000006')+'commit;']);
 assert.equal(results.filter(r=>r.code===0).length,1);assert.match(results.find(r=>r.code!==0).error,/OUT_OF_STOCK/);
 assert.equal(sql('select allocated=on_hand from public.variant_inventory;').trim(),'t');
 console.log('PASS: different-owner Bag/direct final-stock race cannot oversell');
 // A query reporting no row while the original transaction is uncommitted is
 // not definitive failure. Retrying the same key waits and returns that order.
 sql(`select public.adjust_variant_inventory('default:amber-candle',1,'Uncertain response stock','92000000-0000-4000-8000-000000000005');`);
 const pending=connection(),uncertain='93000000-0000-4000-8000-000000000007';
 pending.p.stdin.write(start(a)+direct(uncertain)+"select 'PLACED_UNCOMMITTED';\n");
 await until(()=>pending.output.includes('PLACED_UNCOMMITTED'),'uncommitted placement not ready');
 assert.equal(sql(`select count(*) from public.orders where checkout_request_id='${uncertain}';`).trim(),'0');
 const replay=session(start(a)+direct(uncertain)+'commit;');
 await until(()=>Number(sql(`select count(*) from pg_stat_activity where datname='${db}' and wait_event_type='Lock' and query like '%${uncertain}%';`).trim())===1,'replay did not wait for original');
 pending.p.stdin.end('commit;\n');assert.equal((await pending.done).code,0);assert.equal((await replay).code,0);
 assert.equal(sql(`select count(*) from public.orders where checkout_request_id='${uncertain}';`).trim(),'1');
 console.log('PASS: no-row lookup during in-flight placement remains uncertain; same-key replay resolves once');
}finally{
 for(const child of children)child.kill();
 if(created)execFileSync('docker',['exec',container,'dropdb','-U','postgres','--maintenance-db=template1','--force',db],{stdio:'pipe'});
}
