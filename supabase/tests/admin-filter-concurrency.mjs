// Only clones the network-disabled disposable test database; never reads environment credentials.
import assert from 'node:assert/strict';import {execFileSync,spawn} from 'node:child_process';
const container=process.argv[2];assert.equal(container,'lume-foundation-sql-check');const info=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(info.HostConfig.AutoRemove,true);assert.equal(info.Config.Image,'postgres:14.1-alpine');
const db='lume_filter_read_race',a='91000000-0000-4000-8000-000000000001',b='91000000-0000-4000-8000-000000000002';
const sql=statement=>execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],{input:statement,encoding:'utf8',stdio:['pipe','pipe','pipe']});
let created=false,reader;
try{
 execFileSync('docker',['exec',container,'createdb','-U','postgres','--maintenance-db=template1','-T','postgres',db],{stdio:'pipe'});created=true;
 sql(`insert into auth.users(id) values('${a}'),('${b}');select public.set_business_admin('${a}',true,'Disposable read race');select public.set_business_admin('${b}',true,'Disposable read race');`);
 for(const call of ["public.admin_records_page_v2('orders')","public.admin_export_v2('orders')","public.admin_order_analytics_v1(now()-interval '1 day',now())"]){
  reader=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At']);let buffer='';const ready=new Promise((resolve,reject)=>{reader.on('error',reject);reader.stdout.on('data',data=>{buffer+=data;if(buffer.includes('READY'))resolve();});});
  reader.stdin.write(`begin;set local statement_timeout='10s';set local role authenticated;select set_config('request.jwt.claim.sub','${a}',true);select ${call};select 'READY';\n`);
  await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Read barrier timeout')),10000).unref())]);
  const writer=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At']);let error='';writer.stderr.on('data',data=>error+=data);const done=new Promise((resolve,reject)=>{writer.on('error',reject);writer.on('close',code=>resolve(code));});writer.stdin.end(`begin;set local statement_timeout='10s';set local role service_role;select public.set_business_admin('${a}',false,'Concurrent fixture revocation');commit;`);
  let waited=false;for(let n=0;n<100;n++){if(Number(sql(`select count(*) from pg_stat_activity where datname='${db}' and wait_event_type='Lock' and query not like '%pg_stat_activity%';`).trim())>0){waited=true;break;}await new Promise(resolve=>setTimeout(resolve,50));}
  reader.stdin.end('commit;\n');assert.equal(await done,0,error);assert.equal(waited,true,'Revocation must wait for the authorized read transaction');
  assert.throws(()=>sql(`set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);select ${call};`),/BUSINESS_ACCESS_REQUIRED/);
  sql(`select public.set_business_admin('${a}',true,'Restore disposable race fixture');`);
  console.log('PASS: v2 read holds access lock; revocation waits and subsequent read is denied');
 }
}finally{reader?.stdin.end();if(created)execFileSync('docker',['exec',container,'dropdb','U','postgres','--maintenance-db=template1',db].map(value=>value==='U'?'-U':value),{stdio:'pipe'});}
