-- Disposable rollback fixtures only; never run against hosted Supabase.
begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
insert into auth.users(id) values('30000000-0000-4000-8000-000000000001'),('30000000-0000-4000-8000-000000000002');
select public.set_business_admin('30000000-0000-4000-8000-000000000001',true,'Rollback pagination fixture');
insert into public.products(id,name,description,price_cents,currency,image_path,category,display_order,active)
select 'pagination-'||lpad(n::text,4,'0'),'Pagination piece','Local only',100,'NLE','/images/mug.svg','Pagination',1,false from generate_series(1,510) n;
insert into public.product_variants(id,product_id,sku,options,price_cents,currency,active)
select 'pagination-variant-'||n,'pagination-'||lpad(n::text,4,'0'),'PAGE-SKU-'||n,'{"Colour":"Warm cream","Size":"Large"}'::jsonb,100,'NLE',false from generate_series(1,510) n;
insert into public.orders(id,user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents,created_at)
select ('30000000-aaaa-4000-8000-'||lpad(n::text,12,'0'))::uuid,'30000000-0000-4000-8000-000000000002','Pagination customer','pagination@example.invalid','+23276521208','pickup','Lumley, Freetown','orange','NLE',100,0,100,'2026-10-10'::timestamptz from generate_series(1,205) n;
insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents)
select id,'pagination-0001','Snapshot',1,100 from public.orders where customer_email='pagination@example.invalid';
set constraints all immediate;
set local role anon;
select pg_temp.error('select public.admin_products_page_v1()','42501','anonymous products denied');
select pg_temp.error('select public.admin_inventory_page_v1()','42501','anonymous inventory denied');
select pg_temp.error('select public.admin_orders_page_v1()','42501','anonymous orders denied');
select pg_temp.error($q$select public.admin_export_v1('orders')$q$,'42501','anonymous export denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.error('select public.admin_products_page_v1()','42501','missing authenticated identity denied');
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
select pg_temp.error('select public.admin_products_page_v1()','42501','customer products denied');
select pg_temp.error('select public.admin_inventory_page_v1()','42501','customer inventory denied');
select pg_temp.error('select public.admin_orders_page_v1()','42501','customer orders denied');
select pg_temp.error($q$select public.admin_export_v1('products')$q$,'42501','customer export denied');
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
select pg_temp.assert((public.admin_products_page_v1(0,10,'Pagination')->>'total_count')::int=510,'product total above old cap');
select pg_temp.assert(jsonb_array_length(public.admin_products_page_v1(50,10,'Pagination')->'items')=10,'product last page');
select pg_temp.assert(public.admin_products_page_v1(1,10,'Pagination')->'items'->0->>'id'='pagination-0011','product middle tie-break order');
select pg_temp.assert(jsonb_array_length(public.admin_products_page_v1(51,10,'Pagination')->'items')=0,'out of range has empty items and true count');
select pg_temp.assert((public.admin_inventory_page_v1(0,100,'cream large PAGE-SKU','untracked')->>'total_count')::int=510,'inventory all-term/options/policy search above cap');
select pg_temp.assert((public.admin_inventory_page_v1(0,10,'No structured options','')->>'total_count')::int=530,'empty options display search parity including generated defaults');
select pg_temp.assert((public.admin_inventory_page_v1(0,10,'cream absent','')->>'total_count')::int=0,'inventory requires every term');
select pg_temp.assert((public.admin_inventory_page_v1(0,10,'cream','tracked')->>'total_count')::int=0,'tracking filter');
select pg_temp.assert(jsonb_array_length(public.admin_inventory_page_v1(5,100,'cream PAGE-SKU','')->'items')=10,'inventory last page');
select pg_temp.assert(public.admin_inventory_page_v1(1,10,'cream','')=public.admin_inventory_page_v1(1,10,'cream',''),'inventory deterministic');
select pg_temp.assert((public.admin_orders_page_v1(0,50,'pagination@example.invalid','placed')->>'total_count')::int=205,'order authorized filtered total above cap');
select pg_temp.assert(jsonb_array_length(public.admin_orders_page_v1(4,50,'Pagination','')->'items')=5,'order last page');
select pg_temp.assert(public.admin_orders_page_v1(1,10,'Pagination','')->'items'->0->>'id'='30000000-aaaa-4000-8000-000000000011','order tied timestamp deterministic');
select pg_temp.assert((public.admin_products_page_v1(0,10,'absent')->>'total_count')::int=0,'empty products');
select pg_temp.assert((public.admin_orders_page_v1(0,10,'absent','')->>'total_count')::int=0,'empty orders');
do $$ declare rpc text; begin
 foreach rpc in array array['admin_products_page_v1','admin_inventory_page_v1','admin_orders_page_v1'] loop
  perform pg_temp.error(format('select public.%I(-1,10)',rpc),'22023',rpc||' negative page');
  perform pg_temp.error(format('select public.%I(1000001,10)',rpc),'22023',rpc||' bounded page');
  perform pg_temp.error(format('select public.%I(0,20)',rpc),'22023',rpc||' invalid size');
  perform pg_temp.error(format('select public.%I(null,10)',rpc),'22023',rpc||' null page');
  perform pg_temp.error(format('select public.%I(0,10,null)',rpc),'22023',rpc||' null query');
  perform pg_temp.error(format('select public.%I(0,10,%L)',rpc,repeat('x',201)),'22023',rpc||' query limit');
 end loop;
end;$$;
select pg_temp.error($q$select public.admin_inventory_page_v1(0,10,'','invalid')$q$,'22023','invalid policy');
select pg_temp.error($q$select public.admin_orders_page_v1(0,10,'','paid')$q$,'22023','payment is not operational status');
select pg_temp.error('select * from public.variant_inventory','42501','private inventory direct access denied');
select pg_temp.error('update public.products set active=true','42501','direct product writes denied');
select pg_temp.assert(not exists(select 1 from public.orders),'admin direct orders still owner scoped');
select pg_temp.assert((public.admin_export_v1('products','Pagination')->>'total_count')::int=510 and jsonb_array_length(public.admin_export_v1('products','Pagination')->'items')=510,'complete product export beyond page cap');
select pg_temp.assert(jsonb_array_length(public.admin_export_v1('inventory','cream PAGE-SKU','','untracked')->'items')=510,'complete filtered inventory export');
select pg_temp.assert(jsonb_array_length(public.admin_export_v1('orders','pagination@example.invalid','placed')->'items')=205,'complete filtered order export');
select pg_temp.assert(not ((public.admin_export_v1('orders','Pagination')->'items'->0) ?| array['full_name','customer_email','customer_phone','delivery_street_address','payment_phone_last4','id']),'export excludes contact/payment/identity snapshots');
select pg_temp.assert((select array_agg(key order by key)=array['created_at','currency','order_reference','payment_status','status','total_cents'] from jsonb_object_keys(public.admin_export_v1('orders','Pagination')->'items'->0) key),'explicit order export columns');
select pg_temp.assert(jsonb_array_length(public.admin_export_v1('orders','absent')->'items')=0,'complete empty export');
select pg_temp.error($q$select public.admin_export_v1('invalid')$q$,'22023','invalid export kind');
select pg_temp.error($q$select public.admin_export_v1('products','','placed')$q$,'22023','reject unrelated export filters');
select pg_temp.error($q$select public.admin_export_v1('inventory','','','invalid')$q$,'22023','invalid export tracking');
select pg_temp.error($q$select public.admin_export_v1('orders','','paid')$q$,'22023','invalid export status');
select pg_temp.error($q$select public.admin_export_v1('products',null)$q$,'22023','null export search');
reset role;
savepoint export_limit;
insert into public.products(id,name,description,price_cents,currency,image_path,category,active)
select 'export-limit-'||n,'Export limit piece','Local only',100,'NLE','/images/mug.svg','Limit',false from generate_series(1,10001) n;
set local role authenticated;
select pg_temp.error($q$select public.admin_export_v1('products','Export limit')$q$,'54000','oversize export rejected without truncation');
reset role;
rollback to export_limit;
select public.set_business_admin('30000000-0000-4000-8000-000000000001',false,'Rollback revoke');
set local role authenticated;
select pg_temp.error('select public.admin_products_page_v1()','42501','revoked products denied');
select pg_temp.error('select public.admin_inventory_page_v1()','42501','revoked inventory denied');
select pg_temp.error('select public.admin_orders_page_v1()','42501','revoked orders denied');
select pg_temp.error($q$select public.admin_export_v1('inventory')$q$,'42501','revoked export denied');
reset role;
rollback;
