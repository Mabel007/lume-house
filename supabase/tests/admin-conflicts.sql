-- Disposable final-schema regressions; each suite rolls its fixtures back.
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
select pg_temp.error(format('select public.admin_save_product(%L,%L,%L,%L,%L,%L,%L,0,false,null)',:'created_id','2000-01-01','Test','Test','Test','/images/mug.svg','#e9e3d8'),'PT409','final product edit permanent conflict');
select pg_temp.error($q$select public.admin_set_inventory_policy('default:amber-candle','untracked','2000-01-01')$q$,'PT409','inventory policy permanent conflict');
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

begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001');
select public.set_business_admin('10000000-0000-4000-8000-000000000001',true,'Local fixture');
set local role anon;
select pg_temp.error($q$select public.admin_list_variants('amber-candle')$q$,'42501','anon private variants denied');
reset role;
set local role authenticated;
select pg_temp.error($q$select public.admin_save_variant(null,'amber-candle',null,'LOCAL-BLUE','{"Colour":"Blue"}',200,true)$q$,'42501','no-identity variant write denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(jsonb_array_length(public.admin_list_variants('amber-candle'))=1,'admin sees genuine default');
select public.admin_save_variant(null,'amber-candle',null,'LOCAL-BLUE','{"Colour":"Blue"}',200,true)->>'id' as variant_id \gset
select pg_temp.error($q$select public.admin_save_variant(null,'amber-candle',null,'LOCAL-BLUE','{"Colour":"Red"}',300,true)$q$,'23505','duplicate SKU rejected');
select pg_temp.error($q$select public.admin_save_variant(null,'amber-candle',null,'LOCAL-OTHER','{"Colour":"Blue"}',200,true)$q$,'23505','duplicate option combination rejected');
select pg_temp.error($q$select public.admin_save_variant(null,'amber-candle',null,'LOCAL-EMPTY','{}',200,true)$q$,'22023','meaningful variant requires actual options');
select pg_temp.error($q$select public.admin_save_variant(null,'amber-candle',null,'LOCAL-SPACE','{"Colour":" Blue "}',200,true)$q$,'22023','noncanonical option spaces rejected');
select pg_temp.error($q$select public.admin_save_variant(null,'missing',null,'LOCAL-MISSING','{"Colour":"Red"}',300,true)$q$,'22023','missing parent rejected');
select pg_temp.error($q$select public.admin_save_variant(null,'amber-candle',null,'LOCAL-NEG','{"Colour":"Red"}',-1,true)$q$,'22023','negative price rejected');
reset role;
select updated_at::text as default_updated from public.product_variants where id='default:amber-candle' \gset
set local role authenticated;
select public.admin_save_variant('default:amber-candle','amber-candle',:'default_updated','DEFAULT-amber-candle','{}',12345,false);
select pg_temp.error($q$select public.admin_save_variant('default:amber-candle','amber-candle','2000-01-01','DEFAULT-amber-candle','{}',100,true)$q$,'PT409','stale variant edit denied');
reset role;
select pg_temp.assert((select price_cents=12345 from public.products where id='amber-candle'),'default price keeps legacy product compatibility');
select pg_temp.assert((select not active from public.product_variants where id='default:amber-candle'),'price bridge preserves independent deactivation');
update public.products set active=false where id='amber-candle';
update public.products set active=true where id='amber-candle';
select pg_temp.assert((select not active from public.product_variants where id='default:amber-candle'),'parent reactivation cannot reactivate intentionally archived variant');
set local role anon;
select pg_temp.assert((select count(*)=1 from public.product_variants where product_id='amber-candle'),'public projection exposes active meaningful variant only');
select pg_temp.assert((select options='{"Colour":"Blue"}' and price_cents=200 from public.product_variants where id=:'variant_id'),'options/price reach storefront data');
select pg_temp.error('select sku from public.product_variants','42501','admin SKU stays private to catalogue customer');
reset role;
rollback;

begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001');
select public.set_business_admin('10000000-0000-4000-8000-000000000001',true,'Local fixture');
select updated_at::text as variant_updated from public.product_variants where id='default:amber-candle' \gset
set local role anon;
select pg_temp.error('select public.admin_list_inventory()','42501','anon inventory denied');
reset role;
set local role authenticated;
select pg_temp.error('select public.admin_list_inventory()','42501','customer private inventory denied');
select pg_temp.error($q$select public.admin_adjust_inventory('default:amber-candle',5,'Test','10000000-bbbb-4000-8000-000000000001')$q$,'42501','customer adjustment denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.error('update public.variant_inventory set on_hand=999','42501','admin direct stock bypass denied');
select pg_temp.error($q$select public.adjust_variant_inventory('default:amber-candle',5,'Bypass','10000000-bbbb-4000-8000-000000000001')$q$,'42501','service-only primitive not exposed to browser');
select pg_temp.error(format('select public.admin_set_inventory_policy(%L,%L,%L)','default:amber-candle','tracked',:'variant_updated'),'22023','tracking requires explicit actual stock');
select public.admin_adjust_inventory('default:amber-candle',5,'Local known stock','10000000-bbbb-4000-8000-000000000001');
select public.admin_adjust_inventory('default:amber-candle',5,'Local known stock','10000000-bbbb-4000-8000-000000000001');
select public.admin_set_inventory_policy('default:amber-candle','tracked',:'variant_updated');
reset role;
select updated_at::text as variant_updated from public.product_variants where id='default:amber-candle' \gset
set local role authenticated;
select pg_temp.assert(jsonb_array_length(public.admin_inventory_history('default:amber-candle'))=1,'idempotent adjustment one ledger event');
select pg_temp.error($q$select public.admin_adjust_inventory('default:amber-candle',-6,'Invalid','10000000-bbbb-4000-8000-000000000002')$q$,'P0001','negative balance rejected');
select public.admin_adjust_inventory('default:amber-candle',-2,'Local decrease','10000000-bbbb-4000-8000-000000000003');
reset role;
select pg_temp.assert((select on_hand=3 and allocated=0 from public.variant_inventory where variant_id='default:amber-candle'),'increase/decrease preserve trusted balance');
select pg_temp.assert((select bool_and(actor_user_id='10000000-0000-4000-8000-000000000001') from public.inventory_ledger),'adjustment actor recorded server-side');
update public.variant_inventory set allocated=2 where variant_id='default:amber-candle';
set local role authenticated;
select pg_temp.error(format('select public.admin_set_inventory_policy(%L,%L,%L)','default:amber-candle','untracked',:'variant_updated'),'22023','allocated stock cannot disable tracking');
select pg_temp.error($q$select public.admin_adjust_inventory('default:amber-candle',-2,'Below allocation','10000000-bbbb-4000-8000-000000000004')$q$,'P0001','decrease cannot consume allocated stock');
reset role;
update public.variant_inventory set allocated=0 where variant_id='default:amber-candle';
set local role authenticated;
select public.admin_set_inventory_policy('default:amber-candle','untracked',:'variant_updated');
reset role;
select pg_temp.assert((select on_hand=3 from public.variant_inventory where variant_id='default:amber-candle'),'untracked transition preserves actual balance');
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.error($q$select public.admin_inventory_history('default:amber-candle')$q$,'42501','customer adjustment notes denied');
reset role;
rollback;

-- Local rollback-only orders and stock; no emails are sent by SQL tests.
begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
create function pg_temp.checkout(method text) returns jsonb language sql as $$
select jsonb_build_object('full_name','Local operations fixture','email','fixture@example.invalid','contact_phone','+23276521208','payment_phone','+23276521209','provider','orange','fulfilment',method,'zone_id','zone-1','street','Local landmark','area','Lumley','city','Freetown');$$;
create function pg_temp.quote() returns jsonb language sql as $$
select coalesce(jsonb_agg(jsonb_build_object('product_id',v.product_id,'variant_id',v.id,'quantity',ci.quantity,'unit_price',v.price_cents) order by v.id),'[]')
from public.variant_cart_items ci join public.product_variants v on v.id=ci.variant_id join public.carts c on c.id=ci.cart_id where c.user_id=auth.uid();$$;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003');
select public.set_business_admin('10000000-0000-4000-8000-000000000003',true,'Local operator');
select public.adjust_variant_inventory('default:amber-candle',5,'Actual local fixture','10000000-1111-4000-8000-000000000001');
update public.product_variants set inventory_policy='tracked' where id='default:amber-candle';
set local role anon;
select pg_temp.error('select public.admin_list_orders()','42501','anon admin orders denied');
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.error('select public.admin_list_orders()','42501','customer all-order access denied');
select public.change_variant_cart('default:amber-candle','add',2,null,'10000000-2222-4000-8000-000000000001');
select public.place_variant_order('10000000-3333-4000-8000-000000000001',pg_temp.checkout('pickup'),pg_temp.quote())->>'id' as cancellation_id \gset
select pg_temp.error(format('select public.admin_get_order(%L)',:'cancellation_id'),'42501','even owner cannot call admin detail');
select pg_temp.error(format('select public.admin_transition_order(%L,%L,%L,%L,%L)',:'cancellation_id','placed','cancelled','Untrusted','10000000-4444-4000-8000-000000000001'),'42501','customer admin cancellation denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.change_variant_cart('default:amber-candle','add',1,null,'10000000-2222-4000-8000-000000000002');
select public.place_variant_order('10000000-3333-4000-8000-000000000002',pg_temp.checkout('delivery'),pg_temp.quote())->>'id' as completion_id \gset
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select pg_temp.assert(jsonb_array_length(public.admin_list_orders())=2,'admin sees private business orders');
select pg_temp.assert(not (public.admin_get_order(:'cancellation_id') ? 'user_id') and not (public.admin_get_order(:'cancellation_id') ? 'checkout_request_id'),'admin detail omits unnecessary identity/request metadata');
select pg_temp.error('update public.orders set status=''cancelled''','42501','direct admin-browser order write denied');
select public.admin_transition_order(:'cancellation_id','placed','cancelled','Local eligible cancellation','10000000-4444-4000-8000-000000000001');
select public.admin_transition_order(:'cancellation_id','placed','cancelled','Local eligible cancellation','10000000-4444-4000-8000-000000000001');
select pg_temp.error(format('select public.admin_transition_order(%L,%L,%L,%L,%L)',:'cancellation_id','placed','cancelled','Changed request','10000000-4444-4000-8000-000000000001'),'22023','operation UUID cannot be reused with changed arguments');
select pg_temp.error(format('select public.admin_transition_order(%L,%L,%L,%L,%L)',:'cancellation_id','cancelled','cancelled','Repeat','10000000-4444-4000-8000-000000000099'),'22023','new operation cannot cancel terminal order again');
reset role;
select pg_temp.assert((select on_hand=5 and allocated=1 from public.variant_inventory where variant_id='default:amber-candle'),'cancellation releases exactly allocated stock, not physical stock');
select pg_temp.assert((select count(*)=1 from public.inventory_ledger where order_id=:'cancellation_id' and event='order_release'),'retry creates one release ledger event');
select pg_temp.assert((select status='cancelled' and payment_status='awaiting_payment' from public.orders where id=:'cancellation_id'),'cancellation preserves order/payment history');
set local role authenticated;
select public.admin_transition_order(:'completion_id','placed','confirmed','Confirm operation','10000000-4444-4000-8000-000000000002');
select pg_temp.error(format('select public.admin_transition_order(%L,%L,%L,%L,%L)',:'completion_id','placed','processing','Stale','10000000-4444-4000-8000-000000000003'),'PT409','stale operational status rejected');
select public.admin_transition_order(:'completion_id','confirmed','processing','Begin fulfilment','10000000-4444-4000-8000-000000000003');
select pg_temp.error(format('select public.admin_transition_order(%L,%L,%L,%L,%L)',:'completion_id','processing','cancelled','Too late','10000000-4444-4000-8000-000000000004'),'22023','cancellation after fulfilment starts rejected');
select pg_temp.error(format('select public.admin_transition_order(%L,%L,%L,%L,%L)',:'completion_id','processing','ready_for_pickup','Wrong mode','10000000-4444-4000-8000-000000000004'),'22023','wrong fulfilment-mode transition rejected');
select public.admin_transition_order(:'completion_id','processing','out_for_delivery','Dispatch','10000000-4444-4000-8000-000000000004');
select public.admin_transition_order(:'completion_id','out_for_delivery','completed','Complete delivery','10000000-4444-4000-8000-000000000005');
select public.admin_transition_order(:'completion_id','out_for_delivery','completed','Complete delivery','10000000-4444-4000-8000-000000000005');
select pg_temp.error(format('select public.admin_transition_order(%L,%L,%L,%L,%L)',:'completion_id','completed','cancelled','Invalid','10000000-4444-4000-8000-000000000006'),'22023','completed-order protection');
reset role;
select pg_temp.assert((select on_hand=4 and allocated=0 from public.variant_inventory where variant_id='default:amber-candle'),'completion consumes and clears allocation once');
select pg_temp.assert((select count(*)=1 from public.inventory_ledger where order_id=:'completion_id' and event='order_consumption'),'one consumption on replay');
select pg_temp.assert((select bool_and(payment_status='awaiting_payment') from public.orders),'ordinary operations never mark payment paid');
select pg_temp.assert((select count(*)=2 from public.order_confirmation_jobs),'operations do not enqueue extra emails');
select pg_temp.assert((select quantity=1 and unit_price_cents=25000 and variant_id='default:amber-candle' from public.order_items where order_id=:'completion_id'),'immutable purchase snapshot unaffected');
-- Legacy untracked order has no fictional allocation to release/consume.
set constraints all deferred;
insert into public.orders(id,user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents)
values('10000000-aaaa-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Legacy fixture','fixture@example.invalid','+23276521208','pickup','Lumley, Freetown','orange','NLE',100,0,100);
insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents) values('10000000-aaaa-4000-8000-000000000001','table-lamp','Legacy name',1,100);
set constraints all immediate;
set constraints all deferred;
set local role authenticated;
select public.admin_transition_order('10000000-aaaa-4000-8000-000000000001','placed','confirmed','Legacy confirmation','10000000-4444-4000-8000-000000000011');
select public.admin_transition_order('10000000-aaaa-4000-8000-000000000001','confirmed','processing','Legacy fulfilment','10000000-4444-4000-8000-000000000012');
select public.admin_transition_order('10000000-aaaa-4000-8000-000000000001','processing','ready_for_pickup','Legacy ready','10000000-4444-4000-8000-000000000013');
select public.admin_transition_order('10000000-aaaa-4000-8000-000000000001','ready_for_pickup','completed','Legacy completion','10000000-4444-4000-8000-000000000014');
reset role;
select pg_temp.assert(not exists(select 1 from public.inventory_ledger where order_id='10000000-aaaa-4000-8000-000000000001'),'legacy order does not invent stock events');
select pg_temp.assert((select variant_id is null and product_name='Legacy name' and unit_price_cents=100 from public.order_items where order_id='10000000-aaaa-4000-8000-000000000001'),'legacy snapshots remain readable and unchanged');
-- Second variant forces a later balance failure; earlier release must roll back.
set constraints all deferred;
insert into public.product_variants(id,product_id,sku,options,price_cents) values('zz-local-terminal','amber-candle','LOCAL-TERMINAL','{"Colour":"Blue"}',25000);
select public.adjust_variant_inventory('zz-local-terminal',2,'Local actual fixture','10000000-1111-4000-8000-000000000002');
update public.product_variants set inventory_policy='tracked' where id='zz-local-terminal';
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.change_variant_cart('default:amber-candle','add',1,null,'10000000-2222-4000-8000-000000000003');
select public.change_variant_cart('zz-local-terminal','add',1,null,'10000000-2222-4000-8000-000000000004');
select public.place_variant_order('10000000-3333-4000-8000-000000000003',pg_temp.checkout('pickup'),pg_temp.quote())->>'id' as atomic_id \gset
reset role;
update public.variant_inventory set allocated=0 where variant_id='zz-local-terminal'; -- intentional isolated corruption fixture
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.error(format('select public.admin_transition_order(%L,%L,%L,%L,%L)',:'atomic_id','placed','cancelled','Atomic cancellation','10000000-4444-4000-8000-000000000020'),'23514','bad later allocation blocks entire operation');
reset role;
select pg_temp.assert((select allocated=1 from public.variant_inventory where variant_id='default:amber-candle'),'earlier release rolled back atomically');
select pg_temp.assert((select status='placed' from public.orders where id=:'atomic_id') and not exists(select 1 from public.business_order_operations where order_id=:'atomic_id'),'failed operation leaves status/receipt unchanged');
select pg_temp.assert(not exists(select 1 from public.inventory_ledger where order_id=:'atomic_id' and event='order_release'),'failed operation leaves no partial ledger');
update public.variant_inventory set allocated=1 where variant_id='zz-local-terminal';
set local role authenticated;
select public.admin_transition_order(:'atomic_id','placed','cancelled','Atomic cancellation','10000000-4444-4000-8000-000000000020');
select public.admin_transition_order(:'atomic_id','placed','cancelled','Atomic cancellation','10000000-4444-4000-8000-000000000020');
select pg_temp.assert(jsonb_array_length(public.admin_order_history(:'atomic_id'))=1,'operation retry history stays singular');
reset role;
select public.set_business_admin('10000000-0000-4000-8000-000000000003',false,'Local revocation');
set local role authenticated;
select pg_temp.error('select public.admin_list_orders()','42501','revoked admin operational access denied immediately');
select pg_temp.error('select * from public.business_order_operations','42501','direct private receipt bypass denied');
reset role;
select pg_temp.error('update public.business_order_operations set reason=''Changed''','23514','operational history immutable');
rollback;

begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
select public.set_business_admin('10000000-0000-4000-8000-000000000001',true,'Local fixture');
set local role anon;
select pg_temp.error('select public.admin_list_memberships()','42501','anonymous membership denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.error('select public.admin_list_memberships()','42501','customer membership denied');
select pg_temp.error($q$select public.set_business_admin('10000000-0000-4000-8000-000000000002',true,'Escalation')$q$,'42501','self promotion denied');
reset role;
select public.set_business_admin('10000000-0000-4000-8000-000000000002',true,'Local second fixture');
select updated_at::text as stamp from public.business_admins where user_id='10000000-0000-4000-8000-000000000002' \gset
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(jsonb_array_length(public.admin_list_memberships())=2,'admin lists memberships');
select pg_temp.error($q$select public.admin_revoke_membership('10000000-0000-4000-8000-000000000001',now(),'Self')$q$,'22023','self revocation prevented');
select pg_temp.error($q$select public.admin_revoke_membership('10000000-0000-4000-8000-000000000002','2000-01-01','Stale revoke')$q$,'PT409','membership permanent conflict');
select public.admin_revoke_membership('10000000-0000-4000-8000-000000000002',:'stamp','Local revoke');
select pg_temp.assert(jsonb_array_length(public.admin_membership_history())=3,'membership change audit exists');
select pg_temp.error('update public.business_admins set active=true','42501','direct membership bypass denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.error('select public.admin_list_products()','42501','revoked admin loses operation access');
reset role;
select pg_temp.assert((select count(*)=1 from public.business_admins where active),'last operator preserved');
select pg_temp.error('delete from public.business_admin_history','23514','audit immutable even privileged');
rollback;

begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$begin begin execute statement;exception when others then if sqlstate<>expected then raise;end if;return 'PASS: '||label;end;raise exception 'FAIL: expected error %',label;end$$;
insert into auth.users values('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
select public.set_business_admin('20000000-0000-4000-8000-000000000001',true,'Disposable media fixture');
select id as product_id,updated_at::text as stamp,image_path as legacy from public.products order by id limit 1 \gset
set local role anon;
select pg_temp.error($q$select public.admin_product_gallery_v1('missing')$q$,'42501','anonymous gallery editing denied');
select pg_temp.error($q$select public.register_product_image_v1('20000000-0000-4000-8000-000000000003.png',1,1,100)$q$,'42501','anonymous validated registry bypass denied');
reset role;set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.error($q$select public.admin_product_gallery_v1('missing')$q$,'42501','customer gallery editing denied');
select pg_temp.error('delete from public.product_images','42501','direct gallery mutation denied');
select pg_temp.error($q$select public.register_product_image_v1('20000000-0000-4000-8000-000000000003.png',1,1,100)$q$,'42501','customer validated registry bypass denied');
reset role;set local role service_role;
select public.register_product_image_v1('20000000-0000-4000-8000-000000000003.png',1,1,100);
select pg_temp.error($q$select public.register_product_image_v1('../evil.png',1,1,100)$q$,'23514','unsafe uploaded key denied');
select pg_temp.error($q$select public.register_product_image_v1('20000000-0000-4000-8000-000000000004.png',4096,4096,100)$q$,'23514','oversized pixel registry denied');
reset role;set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(public.admin_product_gallery_v1(:'product_id')->'items'='[]','empty gallery preserves fallback');
select pg_temp.error(format('select public.admin_save_product_gallery_v1(%L,%L,%L)',:'product_id',:'stamp','[{"source":"storage","path":"unknown.png"}]'),'22023','unvalidated storage media denied');
select pg_temp.error(format('select public.admin_save_product_gallery_v1(%L,%L,%L)',:'product_id',:'stamp','[{"source":"static","path":"/images/../evil.png"}]'),'22023','unreviewed static path denied');
select pg_temp.error(format('select public.admin_save_product_gallery_v1(%L,%L,%L)',:'product_id',:'stamp','[{}]'),'22023','missing gallery fields denied');
select pg_temp.assert(jsonb_array_length(public.admin_save_product_gallery_v1(:'product_id',:'stamp',jsonb_build_array(jsonb_build_object('source','storage','path','20000000-0000-4000-8000-000000000003.png'),jsonb_build_object('source','static','path',:'legacy')))->'items')=2,'authorized gallery replacement');
select pg_temp.assert(public.admin_product_gallery_v1(:'product_id')->'items'->0->>'source'='storage','first position is primary');
select pg_temp.assert(public.admin_product_gallery_v1(:'product_id')->'items'->1->>'path'=:'legacy','deliberate gallery ordering');
select pg_temp.error(format('select public.admin_save_product_gallery_v1(%L,%L,%L)',:'product_id','2000-01-01','[]'),'PT409','stale gallery update denied');
reset role;
select pg_temp.assert((select image_path=:'legacy' from public.products where id=:'product_id'),'legacy product image unchanged');
set local role anon;
select pg_temp.assert(public.catalogue_media_visible_v1('20000000-0000-4000-8000-000000000003.png'),'linked active image publicly resolvable');
select pg_temp.assert(not public.catalogue_media_visible_v1('missing.png'),'unlinked object not public');
select pg_temp.assert((select count(*)=2 from public.product_images where product_id=:'product_id'),'active gallery customer readable');
reset role;
update public.products set active=false where id=:'product_id';
set local role anon;
select pg_temp.assert(not public.catalogue_media_visible_v1('20000000-0000-4000-8000-000000000003.png'),'archived product image not publicly resolvable');
select pg_temp.assert((select count(*)=0 from public.product_images where product_id=:'product_id'),'archived gallery customer isolated');
reset role;
select public.set_business_admin('20000000-0000-4000-8000-000000000002',true,'Disposable second admin');
select public.set_business_admin('20000000-0000-4000-8000-000000000001',false,'Disposable revocation');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select pg_temp.error(format('select public.admin_product_gallery_v1(%L)',:'product_id'),'42501','revoked gallery admin denied');
rollback;
