-- Isolated disposable PostgreSQL ONLY. All identities/orders roll back.
begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end; $$;
create function pg_temp.error(statement text,message text) returns text language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm <> message then raise; end if; return 'PASS: rejected '||message;
  end;
  raise exception 'FAIL: expected %',message;
end; $$;
create function pg_temp.quote() returns jsonb language sql as $$
select coalesce(jsonb_agg(jsonb_build_object('product_id',ci.product_id,'quantity',ci.quantity,'unit_price',p.price_cents) order by ci.product_id),'[]'::jsonb)
from public.cart_items ci join public.products p on p.id=ci.product_id
join public.carts c on c.id=ci.cart_id where c.user_id=auth.uid(); $$;
create function pg_temp.checkout(method text,zone text default null) returns jsonb language sql as $$
select jsonb_build_object('full_name','Test Customer','email','fixture@example.invalid','contact_phone','+23276521208',
 'payment_phone','+23230521209','provider','orange','fulfilment',method,'zone_id',zone,
 'street','Test landmark','area','Lumley','city','Freetown','subtotal',1,'total',1,'fee',1,'zone_label','Untrusted','payment_status','paid','user_id','22222222-2222-4222-8222-222222222222'); $$;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.carts(id,user_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
select pg_temp.assert(not has_function_privilege('anon','public.place_order(uuid,jsonb,jsonb)','EXECUTE'),'anon cannot create order');
select pg_temp.assert(has_function_privilege('authenticated','public.place_order(uuid,jsonb,jsonb)','EXECUTE'),'validated JWT transaction executable');
select pg_temp.assert(not has_function_privilege('authenticated','public.claim_order_confirmation(uuid,text)','EXECUTE'),'browser cannot claim email');
select pg_temp.assert(not has_function_privilege('authenticated','public.finish_order_confirmation(uuid,uuid,text,text)','EXECUTE'),'browser cannot mark email sent');
select pg_temp.assert(not has_table_privilege('authenticated','public.orders','INSERT'),'no browser order table writes');
select pg_temp.assert((select proconfig=array['search_path=""'] from pg_proc where oid='public.place_order(uuid,jsonb,jsonb)'::regprocedure),'fixed empty search path');
select pg_temp.error($q$select public.place_order(gen_random_uuid(),pg_temp.checkout('pickup'),pg_temp.quote())$q$,'AUTH_REQUIRED');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select pg_temp.error($q$select public.place_order(gen_random_uuid(),pg_temp.checkout('pickup'),pg_temp.quote())$q$,'EMPTY_CART');
insert into public.cart_items(cart_id,product_id,quantity) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','amber-candle',2);
select pg_temp.error($q$select public.place_order(gen_random_uuid(),pg_temp.checkout('delivery','zone-4'),pg_temp.quote())$q$,'INVALID_DELIVERY_ZONE');
select pg_temp.error($q$select public.place_order(gen_random_uuid(),pg_temp.checkout('delivery','zone-1')||'{"city":"Bo"}',pg_temp.quote())$q$,'INVALID_DELIVERY_DETAILS');
select pg_temp.error($q$select public.place_order(gen_random_uuid(),pg_temp.checkout('pickup')||'{"payment_phone":"123"}',pg_temp.quote())$q$,'INVALID_CHECKOUT');
select pg_temp.error($q$select public.place_order(gen_random_uuid(),pg_temp.checkout('pickup')||'{"email":"bad"}',pg_temp.quote())$q$,'INVALID_CHECKOUT');
select pg_temp.error($q$select public.place_order(gen_random_uuid(),pg_temp.checkout('pickup'),'[]')$q$,'CART_CHANGED');
select pg_temp.error($q$select public.place_order(gen_random_uuid(),pg_temp.checkout('pickup'),'[{"product_id":"missing-product","quantity":1,"unit_price":1}]')$q$,'CART_CHANGED');
reset role;
update public.products set active=false where id='amber-candle';
set local role authenticated;
select pg_temp.error($q$select public.place_order(gen_random_uuid(),pg_temp.checkout('pickup'),pg_temp.quote())$q$,'PRODUCT_UNAVAILABLE');
reset role;
update public.products set active=true,price_cents=30000 where id='amber-candle';
set local role authenticated;
select pg_temp.error($q$select public.place_order(gen_random_uuid(),pg_temp.checkout('pickup'),'[{"product_id":"amber-candle","quantity":2,"unit_price":25000}]')$q$,'CART_CHANGED');
select pg_temp.assert((select count(*)=0 from public.orders),'failed attempts created no orders');
select pg_temp.assert((select quantity=2 from public.cart_items),'failed attempts retain cart');
select public.place_order('10000000-0000-4000-8000-000000000001',pg_temp.checkout('delivery','zone-1'),pg_temp.quote());
set constraints all immediate;
set constraints all deferred;
select pg_temp.assert((select subtotal_cents=60000 and delivery_fee_cents=4000 and total_cents=64000 from public.orders),'authoritative repricing + zone1 fee, ignores browser totals');
select pg_temp.assert((select user_id=auth.uid() from public.orders),'ownership uses JWT, ignores supplied user');
select pg_temp.assert((select status='placed' and payment_status='awaiting_payment' and paid_at is null and payment_reference is null from public.orders),'placement is never payment success');
select pg_temp.assert((select payment_phone_last4='1209' from public.orders),'only payer suffix persisted');
select pg_temp.assert((select delivery_zone_label='Goderich to Lumley' from public.orders),'trusted zone label');
select pg_temp.assert((select unit_price_cents=30000 and product_name='Amber Glass Candle' and quantity=2 from public.order_items),'historical authoritative items');
select pg_temp.assert((select count(*)=0 from public.cart_items),'cart converted atomically');
select public.place_order('10000000-0000-4000-8000-000000000001','{}','[]');
select pg_temp.assert((select count(*)=1 from public.orders),'same-key retry returns existing order with empty cart');
reset role;
select pg_temp.assert((select count(*)=1 from public.order_confirmation_jobs),'one durable email job');
update public.products set price_cents=25000,name='Changed current name' where id='amber-candle';
select pg_temp.error($q$update public.orders set checkout_request_id=gen_random_uuid()$q$,'Historical checkout request is immutable');
select pg_temp.assert((select unit_price_cents=30000 and product_name='Amber Glass Candle' from public.order_items),'later product edits preserve history');
set local role authenticated;
set constraints all immediate;
insert into public.cart_items(cart_id,product_id,quantity) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','amber-candle',1);
select public.place_order('10000000-0000-4000-8000-000000000002',pg_temp.checkout('delivery','zone-2'),pg_temp.quote());
select pg_temp.assert((select delivery_fee_cents=5000 and total_cents=30000 from public.orders where checkout_request_id='10000000-0000-4000-8000-000000000002'),'zone2 fee');
insert into public.cart_items(cart_id,product_id,quantity) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','amber-candle',1);
select public.place_order('10000000-0000-4000-8000-000000000003',pg_temp.checkout('delivery','zone-3'),pg_temp.quote());
select pg_temp.assert((select delivery_fee_cents=6000 and total_cents=31000 from public.orders where checkout_request_id='10000000-0000-4000-8000-000000000003'),'zone3 fee');
insert into public.cart_items(cart_id,product_id,quantity) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','amber-candle',1);
select public.place_order('10000000-0000-4000-8000-000000000004',pg_temp.checkout('pickup')||'{"provider":"afri"}',pg_temp.quote());
select pg_temp.assert((select delivery_fee_cents=0 and pickup_location='Lumley, Freetown' and delivery_street_address is null and delivery_zone_id is null and payment_provider='afri' from public.orders where checkout_request_id='10000000-0000-4000-8000-000000000004'),'pickup zero fee without fake address');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select pg_temp.assert((select count(*)=0 from public.orders),'userB cannot read userA orders');
select pg_temp.assert((select count(*)=0 from public.order_items),'userB cannot read userA items');
select pg_temp.error($q$select public.place_order('10000000-0000-4000-8000-000000000001',pg_temp.checkout('pickup'),pg_temp.quote())$q$,'EMPTY_CART');
reset role;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
create function pg_temp.fail_cart_delete() returns trigger language plpgsql as $$begin raise exception 'TEST_TRANSACTION_FAILURE'; end;$$;
create trigger test_fail_conversion before delete on public.cart_items for each row execute function pg_temp.fail_cart_delete();
set local role authenticated;
insert into public.cart_items(cart_id,product_id,quantity) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','amber-candle',1);
select pg_temp.error($q$select public.place_order('10000000-0000-4000-8000-000000000005',pg_temp.checkout('pickup'),pg_temp.quote())$q$,'TEST_TRANSACTION_FAILURE');
reset role;
drop trigger test_fail_conversion on public.cart_items;
select pg_temp.assert((select count(*)=4 from public.orders),'conversion failure rolls back order');
select pg_temp.assert((select count(*)=4 from public.order_items),'conversion failure rolls back items');
select pg_temp.assert((select count(*)=4 from public.order_confirmation_jobs),'conversion failure rolls back email job');
select pg_temp.assert((select count(*)=1 from public.cart_items),'conversion failure preserves cart');
update public.products set price_cents=2147483647 where id='amber-candle';
update public.cart_items set quantity=99;
set local role authenticated;
select pg_temp.error($q$select public.place_order(gen_random_uuid(),pg_temp.checkout('pickup'),pg_temp.quote())$q$,'ORDER_TOTAL_LIMIT');
reset role;
-- Lease ownership, provider failure isolation and external dedup-window safety.
create temp table test_claim as select public.claim_order_confirmation(id,'Lumé House <onboarding@resend.dev>') as value from public.orders where checkout_request_id='10000000-0000-4000-8000-000000000001';
select pg_temp.assert(value is not null,'email job claimed') from test_claim;
select pg_temp.assert(public.claim_order_confirmation((value->>'order_id')::uuid,'sender') is null,'concurrent email claim refused') from test_claim;
select pg_temp.assert(not public.finish_order_confirmation((value->>'order_id')::uuid,gen_random_uuid(),'mock-id',null),'wrong lease cannot acknowledge') from test_claim;
select pg_temp.assert(public.finish_order_confirmation((value->>'order_id')::uuid,(value->>'claim_token')::uuid,null,'provider_rejected'),'email failure recorded') from test_claim;
select pg_temp.assert((select count(*)=4 from public.orders),'email failure leaves order intact');
update public.order_confirmation_jobs set next_attempt_at=now()-interval '1 second';
update test_claim set value=public.claim_order_confirmation((value->>'order_id')::uuid,'different-sender');
select pg_temp.assert(value->>'sender'='Lumé House <onboarding@resend.dev>','retry freezes original sender') from test_claim;
select pg_temp.assert(public.finish_order_confirmation((value->>'order_id')::uuid,(value->>'claim_token')::uuid,'mock-provider-id',null),'email acknowledged') from test_claim;
select pg_temp.assert(public.claim_order_confirmation((value->>'order_id')::uuid,'sender') is null,'sent job never reclaimed') from test_claim;
update public.order_confirmation_jobs set first_attempt_at=now()-interval '25 hours' where status<>'sent';
select pg_temp.assert(public.claim_order_confirmation(order_id,'sender') is null,'expired dedup window requires manual reconciliation') from public.order_confirmation_jobs where status<>'sent';
set constraints all immediate;
rollback;
select 'PASS: checkout fixtures rolled back';
