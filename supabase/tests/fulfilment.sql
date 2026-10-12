-- Disposable harness only; all fixture writes roll back.
begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
create function pg_temp.checkout(method text) returns jsonb language sql as $$
select jsonb_build_object('full_name','Isolated fixture','email','fixture@example.invalid','contact_phone','+23276521208','payment_phone','+23276521209','provider','orange','fulfilment',method,'zone_id','zone-1','street','Fixture street','area','Lumley','city','Freetown');$$;
create function pg_temp.quote() returns jsonb language sql as $$
select coalesce(jsonb_agg(jsonb_build_object('product_id',v.product_id,'variant_id',v.id,'quantity',ci.quantity,'unit_price',v.price_cents) order by v.id),'[]')
from public.variant_cart_items ci join public.product_variants v on v.id=ci.variant_id join public.carts c on c.id=ci.cart_id where c.user_id=auth.uid();$$;
insert into auth.users(id) values('70000000-0000-4000-8000-000000000001'),('70000000-0000-4000-8000-000000000002'),('70000000-0000-4000-8000-000000000003');
select public.set_business_admin('70000000-0000-4000-8000-000000000002',true,'Isolated admin A');
select public.set_business_admin('70000000-0000-4000-8000-000000000003',true,'Isolated admin B');
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.change_variant_cart('default:amber-candle','add',1,null,'70000000-1111-4000-8000-000000000001');
select public.place_variant_order('70000000-2222-4000-8000-000000000001',pg_temp.checkout('delivery'),pg_temp.quote())->>'id' as delivery_id \gset
select public.change_variant_cart('default:amber-candle','add',1,null,'70000000-1111-4000-8000-000000000002');
select public.place_variant_order('70000000-2222-4000-8000-000000000002',pg_temp.checkout('pickup'),pg_temp.quote())->>'id' as pickup_id \gset
select pg_temp.error(format('select public.admin_get_fulfilment_v1(%L)',:'delivery_id'),'42501','customer fulfilment read denied');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,0,%L,%L,%L,%L)',:'delivery_id','Carrier','Ref','Reason','70000000-3333-4000-8000-000000000001'),'42501','customer fulfilment save denied');
reset role;
set local role anon;
select pg_temp.error(format('select public.admin_get_fulfilment_v1(%L)',:'delivery_id'),'42501','anonymous fulfilment read denied');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,0,null,null,%L,%L)',:'delivery_id','Reason','70000000-3333-4000-8000-000000000001'),'42501','anonymous fulfilment save denied');
reset role;
create temporary table before_orders as select * from public.orders;
create temporary table before_items as select * from public.order_items;
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.assert(public.admin_get_fulfilment_v1(:'delivery_id')->'current'->>'version'='0','legacy delivery starts empty at version zero');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,0,%L,%L,%L,%L)',:'pickup_id','Carrier','Ref','Reason','70000000-3333-4000-8000-000000000001'),'22023','pickup metadata rejected');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,-1,null,null,%L,%L)',:'delivery_id','Reason','70000000-3333-4000-8000-000000000001'),'22023','negative version rejected');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,2147483647,null,null,%L,%L)',:'delivery_id','Reason','70000000-3333-4000-8000-000000000001'),'22023','version arithmetic bounded');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,0,%L,null,%L,%L)',:'delivery_id',repeat('x',101),'Reason','70000000-3333-4000-8000-000000000001'),'22023','carrier maximum enforced');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,0,null,%L,%L,%L)',:'delivery_id',repeat('x',101),'Reason','70000000-3333-4000-8000-000000000001'),'22023','tracking maximum enforced');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,0,null,%L,%L,%L)',:'delivery_id','https://unsafe.example','Reason','70000000-3333-4000-8000-000000000001'),'22023','tracking URL and unsupported punctuation rejected');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,0,%L,null,%L,%L)',:'delivery_id',E'Bad\nCarrier','Reason','70000000-3333-4000-8000-000000000001'),'22023','carrier control characters rejected');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,0,null,null,%L,%L)',:'delivery_id','   ','70000000-3333-4000-8000-000000000001'),'22023','empty reason rejected');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,0,null,null,%L,%L)',:'delivery_id',repeat('x',501),'70000000-3333-4000-8000-000000000001'),'22023','reason maximum enforced');
select public.admin_save_fulfilment_v1(:'delivery_id',0,'  Courrier é  ',' Ref-01 / 2 ',' First manual entry ','70000000-3333-4000-8000-000000000001') as first_result \gset
select pg_temp.assert(public.admin_save_fulfilment_v1(:'delivery_id',0,'Courrier é','Ref-01 / 2','First manual entry','70000000-3333-4000-8000-000000000001')=:'first_result'::jsonb,'same actor normalized retry returns identical receipt');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,0,%L,%L,%L,%L)',:'delivery_id','Changed','Ref-01 / 2','First manual entry','70000000-3333-4000-8000-000000000001'),'22023','changed replay rejected');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,0,null,null,%L,%L)',:'delivery_id','Stale edit','70000000-3333-4000-8000-000000000002'),'PT409','competing expected version rejected');
select set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,0,%L,%L,%L,%L)',:'delivery_id','Courrier é','Ref-01 / 2','First manual entry','70000000-3333-4000-8000-000000000001'),'22023','different actor cannot reuse receipt');
select pg_temp.assert(public.admin_save_fulfilment_v1(:'delivery_id',1,repeat('C',100),repeat('R',100),repeat('N',500),'70000000-3333-4000-8000-000000000002')->>'version'='2','maximum field sizes and second admin update allowed');
select pg_temp.assert(public.admin_save_fulfilment_v1(:'delivery_id',2,'','  ','Clear optional fields','70000000-3333-4000-8000-000000000003')->'carrier_label'='null'::jsonb,'optional fields can be cleared with audit');
select pg_temp.assert(jsonb_array_length(public.admin_get_fulfilment_v1(:'delivery_id')->'history')=3,'one audit receipt per successful revision');
select pg_temp.assert(public.admin_get_fulfilment_v1(:'delivery_id')->'history'->0->>'version'='3','history deterministically newest revision first');
select pg_temp.assert(not (public.admin_get_fulfilment_v1(:'delivery_id')->'current' ? 'updated_by') and not (public.admin_get_fulfilment_v1(:'delivery_id')->'history'->0 ? 'actor_user_id'),'read projection excludes internal actor identifiers');
select pg_temp.error('select * from public.business_order_fulfilment','42501','direct metadata table read denied');
select pg_temp.error('update public.business_order_fulfilment set version=1','42501','direct metadata table write denied');
select pg_temp.error('select * from public.business_fulfilment_operations','42501','direct audit table read denied');
reset role;
select pg_temp.assert(not exists((select * from public.orders except select * from before_orders) union all (select * from before_orders except select * from public.orders)),'all order snapshots statuses pricing and payment unchanged');
select pg_temp.assert(not exists((select * from public.order_items except select * from before_items) union all (select * from before_items except select * from public.order_items)),'all purchased item snapshots unchanged');
select pg_temp.assert((select count(*)=2 from public.order_confirmation_jobs) and not exists(select 1 from public.inventory_ledger),'no additional email jobs or stock events');
select pg_temp.error('update public.business_fulfilment_operations set reason=''tamper''','23514','fulfilment audit immutable');
select public.set_business_admin('70000000-0000-4000-8000-000000000003',false,'Isolated revocation');
set local role authenticated;
select pg_temp.error(format('select public.admin_get_fulfilment_v1(%L)',:'delivery_id'),'42501','revoked admin read denied');
select pg_temp.error(format('select public.admin_save_fulfilment_v1(%L,3,null,null,%L,%L)',:'delivery_id','Revoked','70000000-3333-4000-8000-000000000004'),'42501','revoked admin save denied');
reset role;
select pg_temp.assert((select bool_and(prosecdef and proconfig=ARRAY['search_path=""']) from pg_proc where proname in ('admin_get_fulfilment_v1','admin_save_fulfilment_v1')),'new RPCs SECURITY DEFINER and fixed empty search paths');
select pg_temp.assert(not has_function_privilege('anon','public.admin_get_fulfilment_v1(uuid)','execute') and not has_function_privilege('service_role','public.admin_save_fulfilment_v1(uuid,integer,text,text,text,uuid)','execute'),'explicit grants exclude anonymous and service-role entry points');
rollback;
