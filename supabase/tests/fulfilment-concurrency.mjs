// Creates fixtures only in a disposable database cloned INSIDE the SQL harness's
// --rm, --network none container. Never reads project credentials/URLs.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
const container=process.argv[2];
assert.equal(container,'lume-foundation-sql-check');
const inspected=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(inspected.HostConfig.NetworkMode,'none');assert.equal(inspected.HostConfig.AutoRemove,true);assert.equal(inspected.Config.Image,'postgres:14.1-alpine');
const db='lume_fulfilment_race';
function sql(statement){return execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],{input:statement,encoding:'utf8',stdio:['pipe','pipe','pipe']});}
function session(statement){return new Promise(resolve=>{const proc=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At']);let output='',error='';proc.stdout.on('data',value=>output+=value);proc.stderr.on('data',value=>error+=value);proc.on('close',code=>resolve({code,output,error}));proc.stdin.end(statement);});}
let created=false;
try{
 execFileSync('docker',['exec',container,'createdb','-U','postgres','--maintenance-db=template1','-T','postgres',db],{stdio:'pipe'});created=true;
 const admin='71000000-0000-4000-8000-000000000001',order='71000000-0000-4000-8000-000000000002';
 sql(`begin; insert into auth.users(id) values('${admin}'); select public.set_business_admin('${admin}',true,'Disposable race fixture'); set constraints all deferred;
 insert into public.orders(id,user_id,full_name,customer_email,customer_phone,fulfilment_method,delivery_street_address,delivery_area,delivery_city,delivery_zone_id,delivery_zone_label,payment_provider,payment_status,currency,subtotal_cents,delivery_fee_cents,total_cents)
 values('${order}','${admin}','Disposable fixture','fixture@example.invalid','+23276521208','delivery','Fixture street','Lumley','Freetown','zone-1','Zone 1','orange','awaiting_payment','NLE',100,4000,4100);
 insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents) values('${order}','table-lamp','Fixture',1,100); commit;`);
 const start=`begin;set local statement_timeout='10s';select set_config('request.jwt.claim.sub','${admin}',true);set local role authenticated;`;
 const call=(id,carrier)=>`select public.admin_save_fulfilment_v1('${order}',0,'${carrier}','REF-1','Concurrent fixture','${id}');`;
 const op1='71000000-3333-4000-8000-000000000001',op2='71000000-3333-4000-8000-000000000002';
 // Hold the order lock before both requests start; observe both live requests
 // waiting on a lock before releasing the barrier, rather than relying on timing.
 const barrier=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At']);
 let buffer='';const ready=new Promise(resolve=>{barrier.stdout.on('data',value=>{buffer+=value;if(buffer.includes('BARRIER_READY'))resolve();});});
 barrier.stdin.write(`begin;select id from public.orders where id='${order}' for update;select 'BARRIER_READY';\n`);
 await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Barrier timeout')),10000).unref())]);
 const one=session(start+call(op1,'Carrier A')+'commit;'),two=session(start+call(op2,'Carrier B')+'commit;');
 let waiting=false;
 for(let attempt=0;attempt<100;attempt++){
  if(Number(sql(`select count(*) from pg_stat_activity where datname='${db}' and wait_event_type='Lock' and query like '%admin_save_fulfilment_v1%';`).trim())===2){waiting=true;break;}
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 barrier.stdin.end('commit;\n');const results=await Promise.all([one,two]);assert.equal(waiting,true,'Both concurrent writes waited on the order lock');
 assert.equal(results.filter(r=>r.code===0).length,1);assert.match(results.find(r=>r.code!==0).error,/FULFILMENT_CHANGED/);
 assert.equal(sql(`select count(*) from public.business_fulfilment_operations;`).trim(),'1');
 console.log('PASS: genuine two-session same-version race commits once and rejects stale writer');
 const winner=results[0].code===0?[op1,'Carrier A']:[op2,'Carrier B'];
 const replays=await Promise.all([session(start+call(...winner)+'commit;'),session(start+call(...winner)+'commit;')]);
 assert.ok(replays.every(r=>r.code===0));assert.equal(sql('select count(*) from public.business_fulfilment_operations;').trim(),'1');
 console.log('PASS: concurrent identical retries replay one immutable receipt');
 assert.equal(sql(`select status||':'||payment_status from public.orders where id='${order}';`).trim(),'placed:awaiting_payment');
 console.log('PASS: concurrency leaves operational and payment states unchanged');
}finally{
 if(created)execFileSync('docker',['exec',container,'dropdb','-U','postgres','--maintenance-db=template1',db],{stdio:'pipe'});
}
