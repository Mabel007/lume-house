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
select pg_temp.error($q$select public.customer_cancellation_request('10000000-aaaa-4000-8000-000000000001','')$q$,'42501','anonymous request denied');
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.error('select public.admin_list_orders()','42501','customer all-order access denied');
select public.change_variant_cart('default:amber-candle','add',2,null,'10000000-2222-4000-8000-000000000001');
select public.place_variant_order('10000000-3333-4000-8000-000000000001',pg_temp.checkout('pickup'),pg_temp.quote())->>'id' as cancellation_id \gset
select pg_temp.assert(public.customer_cancellation_request(:'cancellation_id',' Changed plans ')->>'status'='pending','eligible owner request');
select pg_temp.assert(public.customer_cancellation_request(:'cancellation_id','Changed plans')->>'status'='pending','identical request replay');
select pg_temp.error(format('select public.customer_cancellation_request(%L,%L)',:'cancellation_id','Different'),'22023','changed duplicate reason denied');
select pg_temp.assert(public.customer_get_cancellation_request(:'cancellation_id')->>'reason'='Changed plans','owner request visible');
select pg_temp.error('update public.order_cancellation_requests set status=''accepted''','42501','customer resolution bypass denied');
select pg_temp.error(format('select public.admin_reject_cancellation_request(%L,%L)',:'cancellation_id','Self approval'),'42501','customer admin resolution denied');
reset role;
select pg_temp.assert((select allocated=2 and on_hand=5 from public.variant_inventory where variant_id='default:amber-candle'),'request does not release or consume stock');
select pg_temp.assert((select status='placed' and payment_status='awaiting_payment' from public.orders where id=:'cancellation_id'),'request does not mutate order/payment');
set local role authenticated;
select pg_temp.error(format('select public.admin_get_order(%L)',:'cancellation_id'),'42501','even owner cannot call admin detail');
select pg_temp.error(format('select public.admin_transition_order(%L,%L,%L,%L,%L)',:'cancellation_id','placed','cancelled','Untrusted','10000000-4444-4000-8000-000000000001'),'42501','customer admin cancellation denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.error(format('select public.customer_get_cancellation_request(%L)',:'cancellation_id'),'42501','cross customer privacy');
select pg_temp.error(format('select public.customer_cancellation_request(%L,%L)',:'cancellation_id','Wrong'),'42501','wrong owner denied');
select public.change_variant_cart('default:amber-candle','add',1,null,'10000000-2222-4000-8000-000000000002');
select public.place_variant_order('10000000-3333-4000-8000-000000000002',pg_temp.checkout('delivery'),pg_temp.quote())->>'id' as completion_id \gset
select public.customer_cancellation_request(:'completion_id','Please cancel');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select pg_temp.assert(public.admin_get_cancellation_request(:'cancellation_id')->>'status'='pending','admin sees request');
select pg_temp.assert(jsonb_array_length(public.admin_list_orders())=2,'admin sees private business orders');
select pg_temp.assert(not (public.admin_get_order(:'cancellation_id') ? 'user_id') and not (public.admin_get_order(:'cancellation_id') ? 'checkout_request_id'),'admin detail omits unnecessary identity/request metadata');
select pg_temp.error('update public.orders set status=''cancelled''','42501','direct admin-browser order write denied');
select public.admin_transition_order(:'cancellation_id','placed','cancelled','Local eligible cancellation','10000000-4444-4000-8000-000000000001');
select public.admin_transition_order(:'cancellation_id','placed','cancelled','Local eligible cancellation','10000000-4444-4000-8000-000000000001');
select pg_temp.error(format('select public.admin_transition_order(%L,%L,%L,%L,%L)',:'cancellation_id','placed','cancelled','Changed request','10000000-4444-4000-8000-000000000001'),'22023','operation UUID cannot be reused with changed arguments');
select pg_temp.error(format('select public.admin_transition_order(%L,%L,%L,%L,%L)',:'cancellation_id','cancelled','cancelled','Repeat','10000000-4444-4000-8000-000000000099'),'22023','new operation cannot cancel terminal order again');
select pg_temp.assert(public.admin_get_cancellation_request(:'cancellation_id')->>'status'='accepted','trusted cancellation accepts request');
reset role;
select pg_temp.assert((select on_hand=5 and allocated=1 from public.variant_inventory where variant_id='default:amber-candle'),'cancellation releases exactly allocated stock, not physical stock');
select pg_temp.assert((select count(*)=1 from public.inventory_ledger where order_id=:'cancellation_id' and event='order_release'),'retry creates one release ledger event');
select pg_temp.assert((select status='cancelled' and payment_status='awaiting_payment' from public.orders where id=:'cancellation_id'),'cancellation preserves order/payment history');
set local role authenticated;
select public.admin_transition_order(:'completion_id','placed','confirmed','Confirm operation','10000000-4444-4000-8000-000000000002');
select pg_temp.error(format('select public.admin_transition_order(%L,%L,%L,%L,%L)',:'completion_id','placed','processing','Stale','10000000-4444-4000-8000-000000000003'),'40001','stale operational status rejected');
select public.admin_transition_order(:'completion_id','confirmed','processing','Begin fulfilment','10000000-4444-4000-8000-000000000003');
select pg_temp.assert(public.admin_get_cancellation_request(:'completion_id')->>'status'='closed','progress closes request without cancellation');
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
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.customer_cancellation_request('10000000-aaaa-4000-8000-000000000001','Legacy request');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select pg_temp.assert(public.admin_reject_cancellation_request('10000000-aaaa-4000-8000-000000000001','Unable to approve')->>'status'='rejected','admin rejection');
select pg_temp.assert(public.admin_reject_cancellation_request('10000000-aaaa-4000-8000-000000000001','Unable to approve')->>'status'='rejected','rejection replay');
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
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.assert(public.customer_cancellation_request(:'completion_id','Please cancel')->>'status'='closed','retry after progression replays request');
select pg_temp.error(format('select public.customer_cancellation_request(%L,%L)',:'completion_id','New reason'),'22023','terminal request not overwritten');
reset role;
select pg_temp.assert((select count(*)=3 from public.order_cancellation_requests),'one durable request per order');
set constraints all deferred;
insert into public.orders(id,user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents,status)
select ('10000000-aaaa-4000-8000-000000000' || n)::uuid,'10000000-0000-4000-8000-000000000002','Local legacy fixture','fixture@example.invalid','+23276521208','pickup','Lumley, Freetown','orange','NLE',100,0,100,state
from (values ('111','processing'),('112','completed'),('113','cancelled'),('114','confirmed')) v(n,state);
insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents)
select id,'table-lamp','Legacy snapshot',1,100 from public.orders where id::text like '10000000-aaaa-4000-8000-00000000011%';
set constraints all immediate;
set local role authenticated;
select pg_temp.error($q$select public.customer_cancellation_request('10000000-aaaa-4000-8000-000000000111','')$q$,'22023','processing new request denied');
select pg_temp.error($q$select public.customer_cancellation_request('10000000-aaaa-4000-8000-000000000112','')$q$,'22023','completed new request denied');
select pg_temp.error($q$select public.customer_cancellation_request('10000000-aaaa-4000-8000-000000000113','')$q$,'22023','cancelled new request denied');
select pg_temp.assert(public.customer_cancellation_request('10000000-aaaa-4000-8000-000000000114','')->>'status'='pending','confirmed legacy order eligible without fake stock');
rollback;
