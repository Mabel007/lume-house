begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
select public.set_business_admin('10000000-0000-4000-8000-000000000001',true,'Local fixture');
set local role anon;
select pg_temp.error($q$select public.admin_create_product('20000000-0000-4000-8000-000000000001','Test','Test','Test','/images/mug.svg','#e9e3d8',0,false,100)$q$,'42501','anonymous create denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.error($q$select public.admin_create_product('20000000-0000-4000-8000-000000000001','Test','Test','Test','/images/mug.svg','#e9e3d8',0,false,100)$q$,'42501','customer create denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.admin_create_product('20000000-0000-4000-8000-000000000001',' Test ','Test','Test','/images/mug.svg','#e9e3d8',0,false,100)->>'id' as created_id \gset
select pg_temp.assert(public.admin_create_product('20000000-0000-4000-8000-000000000001','Test','Test','Test','/images/mug.svg','#e9e3d8',0,false,100)->>'id'=:'created_id','normalized identical retry replays original');
select pg_temp.error($q$select public.admin_create_product('20000000-0000-4000-8000-000000000001','Changed','Test','Test','/images/mug.svg','#e9e3d8',0,false,100)$q$,'22023','changed request rejected');
select pg_temp.error($q$select public.admin_save_product(null,null,'Test','Test','Test','/images/mug.svg','#e9e3d8',0,false,100)$q$,'22023','legacy unreceipted creation denied');
select pg_temp.error($q$select public.admin_create_product('20000000-0000-4000-8000-000000000002','','Test','Test','/images/mug.svg','#e9e3d8',0,false,100)$q$,'22023','failed create rolls back');
select pg_temp.error('select * from public.business_product_creations','42501','receipts private');
select pg_temp.error($q$select public.business_save_product_internal(null,null,'Test','Test','Test','/images/mug.svg','#e9e3d8',0,false,100)$q$,'42501','internal create bypass denied');
reset role;
select pg_temp.assert((select count(*)=21 from public.products),'retries and failures create only one product');
select pg_temp.assert((select count(*)=1 from public.product_variants where product_id=:'created_id' and is_default and options='{}'),'one atomic default variant');
select pg_temp.assert((select count(*)=1 from public.business_product_creations),'failed operations leave no receipt');
select pg_temp.assert((select result->>'id'=:'created_id' from public.business_product_creations),'durable original result');
rollback;
