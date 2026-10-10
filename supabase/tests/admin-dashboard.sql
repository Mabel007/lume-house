-- Local disposable rollback fixture only. Never apply to hosted Supabase.
begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
insert into auth.users(id) values('40000000-0000-4000-8000-000000000001'),('40000000-0000-4000-8000-000000000002');
select public.set_business_admin('40000000-0000-4000-8000-000000000001',true,'Local dashboard fixture');
set local role anon;
select pg_temp.error('select public.admin_dashboard_v1()','42501','anonymous dashboard denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.error('select public.admin_dashboard_v1()','42501','missing identity dashboard denied');
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000002',true);
select pg_temp.error('select public.admin_dashboard_v1()','42501','ordinary customer dashboard denied');
reset role;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000001',true);
savepoint empty_catalogue;
delete from public.products;
set local role authenticated;
select pg_temp.assert((public.admin_dashboard_v1()->>'active_products')::int=0 and (public.admin_dashboard_v1()->>'total_variants')::int=0 and (public.admin_dashboard_v1()->>'total_orders')::int=0,'empty catalogue/orders exact zero');
select pg_temp.assert(jsonb_array_length(public.admin_dashboard_v1()->'recent_orders')=0 and jsonb_array_length(public.admin_dashboard_v1()->'stock_attention')=0,'empty attention lists');
select pg_temp.assert((select sum(value::int)=0 from jsonb_each_text(public.admin_dashboard_v1()->'by_status')),'empty status breakdown');
reset role;
rollback to empty_catalogue;
insert into public.products(id,name,description,price_cents,currency,image_path,category,active)
values('dashboard-active','Dashboard product','Local only',100,'NLE','/images/mug.svg','Fixture',true),('dashboard-archive','Archived product','Local only',100,'NLE','/images/mug.svg','Fixture',false);
insert into public.product_variants(id,product_id,sku,options,price_cents,currency,active,inventory_policy)
select 'dashboard-'||name,case when name='archive' then 'dashboard-archive' else 'dashboard-active' end,'DASH-'||name,jsonb_build_object('Fixture',name),100,'NLE',name not in ('inactive','unknown'),'untracked'
from unnest(array['zero','allocated','positive','unknown','inactive','archive','untracked']) name;
insert into public.variant_inventory(variant_id,on_hand,allocated) values('dashboard-zero',0,0),('dashboard-allocated',5,5),('dashboard-positive',3,1),('dashboard-inactive',0,0),('dashboard-archive',0,0),('dashboard-untracked',0,0);
update public.product_variants set inventory_policy='tracked' where id like 'dashboard-%' and id<>'dashboard-untracked';
select pg_temp.error($q$update public.product_variants set active=true where id='dashboard-unknown'$q$,'P0001','unprepared tracked stock cannot become active');
insert into public.orders(id,user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,delivery_street_address,delivery_area,delivery_city,delivery_zone_id,delivery_zone_label,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents,status,payment_status,created_at)
select ('40000000-aaaa-4000-8000-'||lpad(n::text,12,'0'))::uuid,'40000000-0000-4000-8000-000000000002','Local customer','private@example.invalid','+23276521208',case when n=5 then 'delivery' else 'pickup' end,case when n=5 then null else 'Lumley, Freetown' end,
 case when n=5 then 'Local street' end,case when n=5 then 'Lumley' end,case when n=5 then 'Freetown' end,case when n=5 then 'zone-1' end,case when n=5 then 'Local zone' end,'orange','NLE',100,case when n=5 then 4000 else 0 end,case when n=5 then 4100 else 100 end,
 case n when 1 then 'placed' when 2 then 'confirmed' when 3 then 'processing' when 4 then 'ready_for_pickup' when 5 then 'out_for_delivery' when 6 then 'completed' when 7 then 'cancelled' else 'placed' end,
 case when n=7 then 'failed' else 'awaiting_payment' end,'2026-10-10'::timestamptz from generate_series(1,22) n;
insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents)
select id,'dashboard-active','Snapshot',1,100 from public.orders;
set constraints all immediate;
set local role authenticated;
select pg_temp.assert((public.admin_dashboard_v1()->>'active_products')::int=21,'active products exclude archive');
select pg_temp.assert((public.admin_dashboard_v1()->>'total_variants')::int=29 and (public.admin_dashboard_v1()->>'tracked_variants')::int=6,'all variants and tracked variants exact');
select pg_temp.assert((public.admin_dashboard_v1()->>'out_of_stock')::int=2,'zero available includes fully allocated physical stock, excludes inactive/archive/untracked');
select pg_temp.assert((public.admin_dashboard_v1()->>'unconfigured_stock')::int=0,'unprepared inactive stock is not fabricated as available or zero');
select pg_temp.assert((public.admin_dashboard_v1()->>'total_orders')::int=22 and (public.admin_dashboard_v1()->>'orders_placed')::int=16,'order totals are operational, not sales');
select pg_temp.assert((public.admin_dashboard_v1()->>'awaiting_payment')::int=21,'exact awaiting_payment state including completed, excludes failed');
select pg_temp.assert(public.admin_dashboard_v1()->'by_status'='{"placed":16,"confirmed":1,"processing":1,"ready_for_pickup":1,"out_for_delivery":1,"completed":1,"cancelled":1}'::jsonb,'status definition parity and full total');
select pg_temp.assert(jsonb_array_length(public.admin_dashboard_v1()->'recent_orders')=10,'recent queue bounded');
select pg_temp.assert(public.admin_dashboard_v1()->'recent_orders'->0->>'id'='40000000-aaaa-4000-8000-000000000001','tied date order deterministic');
select pg_temp.assert(not exists(select 1 from jsonb_array_elements(public.admin_dashboard_v1()->'recent_orders') r where r->>'status' in ('completed','cancelled')),'recent queue excludes terminal orders');
select pg_temp.assert(not (public.admin_dashboard_v1()->'recent_orders'->0 ?| array['full_name','customer_email','customer_phone','total_cents']),'minimal recent projection');
select pg_temp.assert(public.admin_dashboard_v1()->'stock_attention'->0->>'variant_id'='dashboard-allocated','inventory attention deterministic');
select pg_temp.assert(not (public.admin_dashboard_v1() ?| array['revenue','low_stock','paid_sales']),'no unapproved metrics');
select pg_temp.error('select * from public.variant_inventory','42501','dashboard does not widen private table access');
select pg_temp.assert(not exists(select 1 from public.orders),'dashboard does not widen customer order RLS');
reset role;
select public.set_business_admin('40000000-0000-4000-8000-000000000001',false,'Local revoke');
set local role authenticated;
select pg_temp.error('select public.admin_dashboard_v1()','42501','revoked dashboard denied');
reset role;
rollback;
