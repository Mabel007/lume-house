begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
select public.set_business_admin('10000000-0000-4000-8000-000000000001',true,'Local fixture');
set local role anon;
select pg_temp.error('select public.admin_list_products()','42501','anon operational catalogue denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.error('select public.admin_list_products()','42501','customer operational catalogue denied');
select pg_temp.error($q$select public.admin_save_product(null,null,'Test','Test','Test','/images/mug.svg','#e9e3d8',0,false,100)$q$,'42501','customer product create denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(jsonb_array_length(public.admin_list_products())=20,'admin catalogue listing');
select pg_temp.error($q$select public.admin_save_product(null,null,'','Test','Test','/images/mug.svg','#e9e3d8',0,false,100)$q$,'22023','blank product denied');
select pg_temp.error($q$select public.admin_save_product(null,null,'Test','Test','Test','https://evil.invalid/x','#e9e3d8',0,false,100)$q$,'22023','external image writes denied');
select pg_temp.error($q$select public.admin_save_product(null,null,'Test','Test','Test','/images/../x.svg','#e9e3d8',0,false,100)$q$,'22023','image traversal denied');
select public.admin_save_product(null,null,'Local business fixture','Local fixture only','Test','/images/mug.svg','#e9e3d8',0,false,100)->>'id' as fixture_id \gset
reset role;
select pg_temp.assert((select count(*)=1 from public.product_variants where product_id=:'fixture_id' and is_default and options='{}' and price_cents=100),'create generates real simple default');
insert into public.orders(id,user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents)
values('10000000-aaaa-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Fixture','fixture@example.invalid','+23276521208','pickup','Lumley, Freetown','orange','NLE',100,0,100);
insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents) values('10000000-aaaa-4000-8000-000000000001',:'fixture_id','Snapshot name',1,100);
set constraints all immediate;
select updated_at::text as fixture_updated from public.products where id=:'fixture_id' \gset
set local role authenticated;
select public.admin_save_product(:'fixture_id',:'fixture_updated','Renamed','Edited','Test','/images/mug.svg','#e9e3d8',1,true,null);
select pg_temp.error('update public.products set active=false','42501','admin direct-table bypass denied');
reset role;
select pg_temp.assert((select active and name='Renamed' and price_cents=100 from public.products where id=:'fixture_id'),'edit/reactivate preserves variant-owned price');
select pg_temp.assert((select product_name='Snapshot name' and unit_price_cents=100 and variant_id is null from public.order_items where order_id='10000000-aaaa-4000-8000-000000000001'),'editorial writes preserve historical order');
set local role authenticated;
select public.admin_save_product(:'fixture_id',:'fixture_updated','Renamed','Edited','Test','/images/mug.svg','#e9e3d8',1,false,null);
reset role;
set local role anon;
select pg_temp.assert(not exists(select 1 from public.products where id=:'fixture_id'),'archive hidden from storefront');
reset role;
select pg_temp.assert((select count(*)=1 from public.products where id=:'fixture_id'),'archive does not delete product');
rollback;
