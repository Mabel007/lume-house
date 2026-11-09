// Real PostgreSQL sessions, only inside an inspected disposable container.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
const container=process.argv[2];
assert.match(container,/^lume-(?:foundation-sql-check|s02-slice-tests)-[a-f0-9]{12}$/);
const info=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(info.HostConfig.AutoRemove,true);assert.equal(info.Config.Image,'postgres:14.1-alpine');
const db='lume_s02_races';
const args=['exec','-i',container,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'];
const sql=s=>execFileSync('docker',args,{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000}).trim();
const uid='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const children=new Set();
function worker(body,app,role='authenticated') {
  const p=spawn('docker',args);children.add(p);let out='',err='';
  let signal;const ready=new Promise(resolve=>{signal=resolve;});
  p.stdout.on('data',d=>{out+=d;if(out.includes('BARRIER_READY'))signal();});p.stderr.on('data',d=>{err+=d;});
  const done=new Promise(resolve=>p.on('close',code=>{children.delete(p);signal();resolve({code,out,err});}));
  p.stdin.end(`begin;set statement_timeout='10s';set application_name='${app}';set local request.jwt.claim.sub='${uid}';set local role ${role};${body};commit;`);
  return {ready,done};
}
async function blocked(app) {
  for(let i=0;i<20;i++){
    if(Number(sql(`select count(*) from pg_stat_activity where application_name='${app}' and wait_event_type='Lock';`))>0)return;
    await new Promise(r=>setTimeout(r,50));
  }throw Error('Contender was not observed waiting on the database lock');
}
let created=false;
try {
  execFileSync('docker',['exec',container,'createdb','-U','postgres','--maintenance-db=template1','-T','postgres',db],{stdio:'pipe'});created=true;
  sql(`insert into auth.users(id) values('${uid}');set request.jwt.claim.sub='${uid}';set role authenticated;
    insert into customer_addresses(customer_id,label,street_address,area,city,zone_id) select '${uid}','A'||i,'Street','Lumley','Freetown','zone-1' from generate_series(1,4)i;
    select public.place_direct_variant_order('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','default:table-lamp',1,
      (select jsonb_build_object('product_id',product_id,'variant_id',id,'quantity',1,'unit_price',price_cents) from product_variants where id='default:table-lamp'),
      '{"full_name":"Race fixture","email":"fixture@example.invalid","contact_phone":"+23276521208","payment_phone":"+23276521209","provider":"orange","fulfilment":"pickup","country_code":"SL"}');`);
  const a=worker(`insert into customer_addresses(customer_id,label,street_address,area,city,zone_id) values('${uid}','Fifth','Street','Lumley','Freetown','zone-1');select 'BARRIER_READY';select pg_sleep(3)`,'s02-limit-a');
  await a.ready;
  const b=worker(`insert into customer_addresses(customer_id,label,street_address,area,city,zone_id) values('${uid}','Sixth','Street','Lumley','Freetown','zone-1')`,'s02-limit-b');
  await blocked('s02-limit-b');const [ra,rb]=await Promise.all([a.done,b.done]);assert.equal(ra.code,0,ra.err);assert.notEqual(rb.code,0);assert.match(rb.err,/address_limit_reached/);
  assert.equal(sql(`select count(*) from customer_addresses where customer_id='${uid}'`),'5');
  console.log('PASS: concurrent fifth/sixth address inserts serialize at the enforced limit');
  sql(`delete from customer_addresses where customer_id='${uid}' and label in ('Fifth','A4')`);
  const addressPayload=label=>JSON.stringify({label,street_address:'Street',area:'Lumley',city:'Freetown',zone_id:'zone-1',is_default:true});
  const createA=worker(`select save_customer_address(null,'${addressPayload('New default A')}');select 'BARRIER_READY';select pg_sleep(3)`,'s02-create-a');await createA.ready;
  const createB=worker(`select save_customer_address(null,'${addressPayload('New default B')}')`,'s02-create-b');await blocked('s02-create-b');
  const [createdA,createdB]=await Promise.all([createA.done,createB.done]);assert.equal(createdA.code,0,createdA.err);assert.equal(createdB.code,0,createdB.err);
  assert.equal(sql(`select count(*) from customer_addresses where customer_id='${uid}'`),'5');
  assert.equal(sql(`select label from customer_addresses where customer_id='${uid}' and is_default`),'New default B');
  console.log('PASS: concurrent default-address creations serialize within the five-address limit');
  const ids=sql(`select id from customer_addresses where customer_id='${uid}' order by label limit 2`).split('\n');
  const c=worker(`select set_default_address('${ids[0]}');select 'BARRIER_READY';select pg_sleep(3)`,'s02-default-a');await c.ready;
  const d=worker(`select save_customer_address('${ids[1]}','{"is_default":true}')`,'s02-default-b');await blocked('s02-default-b');
  const [rc,rd]=await Promise.all([c.done,d.done]);assert.equal(rc.code,0,rc.err);assert.equal(rd.code,0,rd.err);
  assert.equal(sql(`select id from customer_addresses where customer_id='${uid}' and is_default`),ids[1]);
  console.log('PASS: concurrent default RPC and address edit use one serialized contract');
  const oid=sql(`select id from orders where user_id='${uid}'`);
  assert.equal(sql(`set role service_role;select count(*) from claim_retry_jobs();`).split('\n').at(-1),'1');
  const e=worker(`select claim_order_confirmation('${oid}','Fixture <sender@example.invalid>');select 'BARRIER_READY';select pg_sleep(3)`,'s02-claim-a','service_role');await e.ready;
  const f=worker(`select claim_order_confirmation('${oid}','Fixture <sender@example.invalid>')`,'s02-claim-b','service_role');await blocked('s02-claim-b');
  const [re,rf]=await Promise.all([e.done,f.done]);assert.equal(re.code,0,re.err);assert.equal(rf.code,0,rf.err);assert.equal(rf.out.includes('claim_token'),false);
  assert.equal(sql(`select attempts from order_confirmation_jobs where order_id='${oid}'`),'1');
  const old=sql(`select claim_token from order_confirmation_jobs where order_id='${oid}'`);
  sql(`update order_confirmation_jobs set locked_until=now()-interval '1 second' where order_id='${oid}'`);
  const recovered=JSON.parse(sql(`set role service_role;select claim_order_confirmation('${oid}','Fixture <sender@example.invalid>')`).split('\n').at(-1));
  assert.notEqual(recovered.claim_token,old);
  assert.equal(sql(`set role service_role;select finish_order_confirmation('${oid}','${old}',null,'stale_worker')`).split('\n').at(-1),'f');
  assert.equal(sql(`select attempts||':'||status from order_confirmation_jobs where order_id='${oid}'`),'2:processing');
  assert.equal(sql(`set role service_role;select finish_order_confirmation('${oid}','${recovered.claim_token}','fixture-provider',null)`).split('\n').at(-1),'t');
  console.log('PASS: concurrent claims process one active lease; expired lease recovers and stale token cannot finish');
} finally {
  for(const child of children)child.kill();
  if(created)execFileSync('docker',['exec',container,'dropdb','-U','postgres','--maintenance-db=template1','--force',db],{stdio:'pipe'});
}
