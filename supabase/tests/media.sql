begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
select public.set_business_admin('10000000-0000-4000-8000-000000000001',true,'Local fixture');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.error('select public.admin_media_assets()','42501','customer media denied');
select pg_temp.error($q$select public.admin_set_product_media('missing',now(),'/images/mug.svg')$q$,'42501','customer mutation denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(jsonb_array_length(public.admin_media_assets())>0,'reviewed assets available to admin');
select pg_temp.error($q$select public.admin_set_product_media('missing',now(),'/images/../evil.svg')$q$,'22023','unsafe path denied');
select pg_temp.error($q$select public.admin_set_product_media('missing',now(),'/images/unknown.png')$q$,'22023','unregistered path denied');
select pg_temp.error('delete from public.product_media_assets','42501','asset registry bypass denied');
reset role;
select id as product_id,updated_at::text as stamp from public.products order by id limit 1 \gset
set local role authenticated;
select pg_temp.assert(public.admin_set_product_media(:'product_id',:'stamp','/images/mug.svg')->>'image_path'='/images/mug.svg','primary replacement through trusted operation');
select pg_temp.error(format('select public.admin_set_product_media(%L,%L,%L)',:'product_id','2000-01-01','/images/mug.svg'),'40001','stale media update denied');
reset role;
select pg_temp.assert((select count(*)=20 from public.products),'media leaves product identities intact');
rollback;
