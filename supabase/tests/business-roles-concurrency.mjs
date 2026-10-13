// Network-disabled disposable harness only. No project environment/credentials.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
const container=process.argv[2];assert.equal(container,'lume-foundation-sql-check');
const info=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(info.HostConfig.AutoRemove,true);assert.equal(info.Config.Image,'postgres:14.1-alpine');
const db='lume_roles_race';
const sql=statement=>execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],{input:statement,encoding:'utf8',stdio:['pipe','pipe','pipe']});
function session(statement){return new Promise((resolve,reject)=>{const proc=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At']);let output='',error='';proc.on('error',reject);proc.stdout.on('data',v=>output+=v);proc.stderr.on('data',v=>error+=v);proc.on('close',code=>resolve({code,output,error}));proc.stdin.end(statement);});}
let created=false;
try{
 execFileSync('docker',['exec',container,'createdb','-U','postgres','--maintenance-db=template1','-T','postgres',db],{stdio:'pipe'});created=true;
 const a='81000000-0000-4000-8000-000000000001',b='81000000-0000-4000-8000-000000000002';
 sql(`insert into auth.users(id) values('${a}'),('${b}');select public.set_business_admin('${a}',true,'Race fixture');select public.set_business_admin('${b}',true,'Race fixture');select public.recovery_set_business_role_v1('${a}','owner',0,'Race fixture','81000000-1111-4000-8000-000000000001','Fixture');select public.recovery_set_business_role_v1('${b}','owner',0,'Race fixture','81000000-1111-4000-8000-000000000002','Fixture');select public.activate_business_roles_v1('Fixture','Isolated race test');`);
 async function race(statements){
  const barrier=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At']);
  let buffer='';const ready=new Promise((resolve,reject)=>{barrier.on('error',reject);barrier.stdout.on('data',v=>{buffer+=v;if(buffer.includes('READY'))resolve();});});
  barrier.stdin.write("begin;select pg_advisory_xact_lock(hashtextextended('business-admin-memberships',0));select 'READY';\n");
  await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Barrier timeout')),10000).unref())]);
  const pending=statements.map(statement=>session(`begin;set local statement_timeout='10s';set local role service_role;${statement}commit;`));
  let waiting=false;
  for(let i=0;i<100;i++){if(Number(sql(`select count(*) from pg_stat_activity where datname='${db}' and wait_event_type='Lock' and query not like '%pg_stat_activity%';`).trim())===2){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,50));}
  barrier.stdin.end('commit;\n');const results=await Promise.all(pending);assert.equal(waiting,true,'Both role mutations actually waited on the barrier');return results;
 }
 const demote=(id,op)=>`select public.recovery_set_business_role_v1('${id}','staff',1,'Race demotion','${op}','Fixture');`;
 const calls=[demote(a,'81000000-2222-4000-8000-000000000001'),demote(b,'81000000-2222-4000-8000-000000000002')];
 const changes=await race(calls);assert.equal(changes.filter(r=>r.code===0).length,1);assert.match(changes.find(r=>r.code!==0).error,/LAST_OWNER_PROTECTED/);
 console.log('PASS: concurrent demotions preserve last active owner');
 const winner=changes[0].code===0?0:1;const replay=await Promise.all([session('set role service_role;'+calls[winner]),session('set role service_role;'+calls[winner])]);assert.ok(replay.every(r=>r.code===0));assert.equal(replay[0].output,replay[1].output);assert.equal(sql('select count(*) from public.business_role_history;').trim(),'3');
 console.log('PASS: simultaneous role retries preserve one immutable receipt');
 const subject=winner===0?a:b;sql(`select public.recovery_set_business_role_v1('${subject}','owner',2,'Restore race fixture','81000000-3333-4000-8000-000000000001','Fixture');`);
 const revoke=await race([`select public.set_business_admin('${a}',false,'Concurrent revocation');`,`select public.set_business_admin('${b}',false,'Concurrent revocation');`]);assert.equal(revoke.filter(r=>r.code===0).length,1);assert.match(revoke.find(r=>r.code!==0).error,/LAST_ADMIN_PROTECTED|LAST_OWNER_PROTECTED/);
 assert.equal(sql("select count(*) from public.business_roles r join public.business_admins a using(user_id) where a.active and r.role='owner';").trim(),'1');
 console.log('PASS: concurrent trusted membership revocations preserve last admin and owner');
}finally{if(created)execFileSync('docker',['exec',container,'dropdb','-U','postgres','--maintenance-db=template1',db],{stdio:'pipe'});}
