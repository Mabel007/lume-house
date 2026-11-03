// Only a disposable clone inside the existing network-isolated SQL harness.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const container=process.argv[2];
assert.equal(container,'lume-foundation-sql-check');
const inspected=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(inspected.HostConfig.NetworkMode,'none');
assert.equal(inspected.HostConfig.AutoRemove,true);
assert.equal(inspected.Config.Image,'postgres:14.1-alpine');
const db='lume_country_order_race';
const psql=['-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'];
const args=['exec',...psql];
const sql=s=>execFileSync('docker',args,{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:20000});
const children=new Set();
function connection(){const p=spawn('docker',args);children.add(p);let output='',error='';p.stdout.on('data',v=>output+=v);p.stderr.on('data',v=>error+=v);const done=new Promise(resolve=>p.on('close',code=>{children.delete(p);resolve({code,output,error});}));return {p,done,get output(){return output;}};}
function session(s){const c=connection();c.p.stdin.end(s);return c.done;}
function ready(c,marker,ms=10000){return new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{cleanup();reject(new Error('Race barrier readiness timeout'));},ms);
 const check=()=>{if(c.output.includes(marker)){cleanup();resolve();}};
 const closed=()=>{if(c.output.includes(marker)){cleanup();resolve();}else{cleanup();reject(new Error('Race barrier session closed before acquiring the gate'));}};
 function cleanup(){clearTimeout(timer);c.p.stdout.off('data',check);c.p.off('close',closed);}
 c.p.stdout.on('data',check);c.p.on('close',closed);check();
});}
// Each worker commits its own backend PID and backend_start before attempting
// the gate, so the driver can require exactly those two original sessions
// rather than anonymous waiters or a later session that reused a PID.
// objsubid=2 keeps the two-key test gate distinct from the bigint-form owner
// locks taken by the production RPCs.
// PostgreSQL 14 caches the pg_stat_activity backend-status snapshot for the
// whole transaction, so the gate first waits on live pg_locks (which are not
// snapshot-cached) and only then touches pg_stat_activity; that first access
// happens after both workers are already connected and waiting, so no worker
// can be missing from the frozen snapshot.
function gateDriver(token){return `begin;set local statement_timeout='15s';select pg_advisory_xact_lock(931,0);
\\! echo GATE-HELD
do $$declare both_waiting boolean;begin
 for attempt in 1..500 loop
  with registered as (
   select slot,pid from public.lume_race_workers
   where token='${token}' and datname=current_database()),
  waiters as (
   select distinct l.pid from pg_locks l
   where l.locktype='advisory' and l.classid='931'::oid and l.objid='0'::oid and l.objsubid=2
    and not l.granted
    and l.database=(select oid from pg_database where datname=current_database()))
  select count(*)=2 and count(distinct slot)=2
   and bool_and(exists(select 1 from waiters w where w.pid=registered.pid))
   into both_waiting from registered;
  if both_waiting then exit;end if;
  perform pg_sleep(0.02);
 end loop;
 if not both_waiting then
  raise exception 'Race barrier timed out waiting for both registered worker PIDs; registered=%, waiters=%',
   (select coalesce(string_agg(slot||':'||pid||'@'||extract(epoch from backend_start),',' order by slot),'-')
    from public.lume_race_workers where token='${token}'),
   (select coalesce(string_agg(l.pid||'@'||coalesce(l.database::text,'?')||'/granted='||l.granted,',' order by l.pid),'-')
    from pg_locks l
    where l.locktype='advisory' and l.classid='931'::oid and l.objid='0'::oid and l.objsubid=2 and not l.granted);
 end if;
 with registered as (
  select slot,pid,backend_start from public.lume_race_workers
  where token='${token}' and datname=current_database()),
 waiters as (
  select distinct l.pid from pg_locks l
  where l.locktype='advisory' and l.classid='931'::oid and l.objid='0'::oid and l.objsubid=2
   and not l.granted
   and l.database=(select oid from pg_database where datname=current_database())),
 active as (
  select pid,backend_start from pg_stat_activity
  where datname=current_database())
 select count(*)=2 and count(distinct slot)=2 and bool_and(
   exists(select 1 from waiters w where w.pid=registered.pid)
   and exists(select 1 from active a where a.pid=registered.pid and a.backend_start=registered.backend_start))
  into both_waiting from registered;
 if not both_waiting then
  raise exception 'Race barrier could not confirm both registered backend incarnations; registered=%, active=%',
   (select coalesce(string_agg(slot||':'||pid||'@'||extract(epoch from backend_start),',' order by slot),'-')
    from public.lume_race_workers where token='${token}'),
   (select coalesce(string_agg(a.pid||'@'||extract(epoch from a.backend_start),',' order by a.pid),'-')
    from pg_stat_activity a where a.datname=current_database());
 end if;
end;$$;
select 'BARRIER-WAITING ${token} '||string_agg(w.slot||'='||w.pid,',' order by w.slot)
 from public.lume_race_workers w
 join pg_stat_activity a on a.pid=w.pid and a.datname=current_database() and a.backend_start=w.backend_start
 where w.token='${token}' and w.datname=current_database();
commit;`;}
const gated=(token,slot,owner)=>`begin;insert into public.lume_race_workers(token,slot,pid,backend_start,datname)
 select '${token}','${slot}',a.pid,a.backend_start,current_database() from pg_stat_activity a where a.pid=pg_backend_pid();
commit;begin;set local statement_timeout='20s';select pg_advisory_xact_lock_shared(931,0);select set_config('request.jwt.claim.sub','${owner}',true);set local role authenticated;`;
async function race(ownerA,tailA,ownerB,tailB){
 const token=randomUUID();
 const gate=connection();
 gate.p.stdin.end(gateDriver(token));
 await ready(gate,'GATE-HELD');
 const results=await Promise.all([session(gated(token,'a',ownerA)+tailA),session(gated(token,'b',ownerB)+tailB)]);
 const gateResult=await gate.done;
 assert.equal(gateResult.code,0,`${gateResult.error||'overlap barrier failed'}; workerErrors=${results.map(r=>r.error.trim()).join(' | ')}`);
 const seen=gateResult.output.match(/BARRIER-WAITING (?<token>\S+) (?<workers>\S+)/);
 assert.ok(seen,'barrier did not report both exact workers');
 assert.equal(seen.groups.token,token,'barrier reported a different race token');
 assert.match(seen.groups.workers,/^a=\d+,b=\d+$/,'barrier must report both exact worker slots and backend PIDs');
 const pids=seen.groups.workers.split(',').map(pair=>pair.split('=')[1]);
 assert.equal(new Set(pids).size,2,'barrier workers must have distinct backend PIDs');
 console.log(`PASS: barrier held both exact workers (${token} ${seen.groups.workers})`);
 return results;
}
const a='91000000-0000-4000-8000-000000000001',b='91000000-0000-4000-8000-000000000002';
const checkout=country=>`'{"full_name":"Local race","email":"race@example.invalid","contact_phone":"+23276521208","payment_phone":"+23276521209","provider":"orange","fulfilment":"pickup"${country?',"country_code":"SL"':''}}'::jsonb`;
const quote=`'{"product_id":"amber-candle","variant_id":"default:amber-candle","quantity":1,"unit_price":100}'::jsonb`;
const direct=(r,country)=>`select public.place_direct_variant_order('${r}','default:amber-candle',1,${quote},${checkout(country)});`;
let created=false;
try{
 execFileSync('docker',['exec',container,'createdb','-U','postgres','--maintenance-db=template1','-T','postgres',db],{stdio:'pipe'});created=true;
 sql(`create table public.lume_race_workers(token text not null,slot text not null check(slot in ('a','b')),pid integer not null,backend_start timestamptz not null,datname text not null,primary key(token,slot));
 insert into auth.users(id) values('${a}'),('${b}');
 update public.product_variants set price_cents=100 where id='default:amber-candle';
 select public.adjust_variant_inventory('default:amber-candle',2,'Disposable country race stock','92000000-0000-4000-8000-000000000001');
 update public.product_variants set inventory_policy='tracked' where id='default:amber-candle';`);
 const first='93000000-0000-4000-8000-000000000001';
 let results=await race(a,direct(first,true)+'commit;',a,direct(first,false)+'commit;');
 assert.equal(results.filter(r=>r.code===0).length,1);
 assert.match(results.find(r=>r.code!==0).error,/INVALID_DELIVERY_COUNTRY/);
 assert.equal(sql('select count(*) from public.orders;').trim(),'1');
 assert.equal(sql('select allocated from public.variant_inventory;').trim(),'1');
 assert.equal(sql('select count(*) from public.order_confirmation_jobs;').trim(),'1');
 console.log('PASS: a country-free request cannot race a valid request into a second order or allocation');
 sql(`select public.adjust_variant_inventory('default:amber-candle',1,'Disposable replay stock','92000000-0000-4000-8000-000000000002');`);
 const replay='93000000-0000-4000-8000-000000000002';
 results=await race(a,direct(replay,true)+'commit;',a,direct(replay,true)+'commit;');
 assert.ok(results.every(r=>r.code===0));
 assert.equal(sql(`select count(*) from public.orders where checkout_request_id='${replay}';`).trim(),'1');
 assert.equal(sql('select allocated from public.variant_inventory;').trim(),'2');
 assert.equal(sql('select count(*) from public.order_confirmation_jobs;').trim(),'2');
 console.log('PASS: two valid SL retries create one order, one allocation and one job');
 results=await race(a,direct('93000000-0000-4000-8000-000000000003',true)+'commit;',b,direct('93000000-0000-4000-8000-000000000004',true)+'commit;');
 assert.equal(results.filter(r=>r.code===0).length,1);
 assert.match(results.find(r=>r.code!==0).error,/OUT_OF_STOCK/);
 assert.equal(sql('select allocated=on_hand from public.variant_inventory;').trim(),'t');
 assert.equal(sql('select count(*) from public.orders;').trim(),'3');
 console.log('PASS: two owners racing the final tracked unit cannot oversell under the country contract');
}finally{
 for(const child of children)child.kill();
 if(created)execFileSync('docker',['exec',container,'dropdb','-U','postgres','--maintenance-db=template1','--force',db],{stdio:'pipe'});
}
