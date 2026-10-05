-- Isolated, rollback-only variant commerce fixtures. No hosted identities/orders.
begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlerrm<>expected then raise; end if;return 'PASS: rejected '||expected;end;raise exception 'FAIL: expected %',expected;end;$$;
create function pg_temp.denied(statement text) returns text language plpgsql as $$
begin begin execute statement;exception when insufficient_privilege then return 'PASS: permission denied';end;raise exception 'FAIL: expected permission denial';end;$$;
create function pg_temp.checkout() returns jsonb language sql as $$
select '{"full_name":"Local fixture","email":"fixture@example.invalid","contact_phone":"+23276521208","payment_phone":"+23276521209","provider":"orange","fulfilment":"pickup"}'::jsonb;$$;
create function pg_temp.quote() returns jsonb language sql as $$
select coalesce(jsonb_agg(jsonb_build_object('product_id',v.product_id,'variant_id',v.id,'quantity',ci.quantity,'unit_price',v.price_cents) order by v.id),'[]')
from public.variant_cart_items ci join public.product_variants v on v.id=ci.variant_id
where cart_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';$$;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.carts(id,user_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
insert into public.cart_items(cart_id,product_id,quantity) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','amber-candle',2);
insert into public.product_variants(id,product_id,sku,options,price_cents) values('fixture-blue','amber-candle','fixture-blue','{"Color":"Blue"}',30000),('fixture-red','amber-candle','fixture-red','{"Color":"Red"}',35000);
set local role anon;
select pg_temp.denied('select public.load_variant_cart()');
select pg_temp.denied('select * from public.variant_cart_items');
reset role;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select public.load_variant_cart();
select pg_temp.assert((select quantity=2 and variant_id='default:amber-candle' from public.variant_cart_items),'legacy owned Bag promoted to exact default variant');
select pg_temp.assert((select cart_version=2 from public.carts),'owned cart marked variant version');
select pg_temp.assert((select count(*)=0 from public.cart_items),'legacy lines removed only after atomic promotion');
select pg_temp.denied('insert into public.variant_cart_items default values');
select pg_temp.denied('update public.variant_cart_items set quantity=99');
select pg_temp.denied('select public.ensure_variant_cart()');
select pg_temp.denied('select * from public.variant_cart_operations');
select pg_temp.error($q$insert into public.cart_items(cart_id,product_id,quantity) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','amber-candle',1)$q$,'CART_CHANGED');
select public.change_variant_cart('fixture-blue','add',1,null,'10000000-0000-4000-8000-000000000001');
select public.change_variant_cart('fixture-blue','add',1,null,'10000000-0000-4000-8000-000000000001');
select pg_temp.assert((select quantity=1 from public.variant_cart_items where variant_id='fixture-blue'),'ambiguous add replay does not duplicate intent');
select pg_temp.error($q$select public.change_variant_cart('fixture-blue','add',2,null,'10000000-0000-4000-8000-000000000001')$q$,'INVALID_REQUEST');
select public.change_variant_cart('fixture-red','merge',2,null,'10000000-0000-4000-8000-000000000002');
select public.change_variant_cart('fixture-red','merge',2,null,'10000000-0000-4000-8000-000000000002');
select pg_temp.assert((select quantity=2 from public.variant_cart_items where variant_id='fixture-red'),'guest merge checkpoint replay is idempotent');
select public.change_variant_cart('fixture-blue','set',3,1,'10000000-0000-4000-8000-000000000003');
select pg_temp.error($q$select public.change_variant_cart('fixture-blue','set',4,1,'10000000-0000-4000-8000-000000000004')$q$,'CART_CHANGED');
select public.change_variant_cart('fixture-red','remove',null,2,'10000000-0000-4000-8000-000000000005');
select pg_temp.assert((select count(*)=2 from public.variant_cart_items),'removal affects only selected variant line');
select public.change_variant_cart('fixture-red','add',2,null,'10000000-0000-4000-8000-000000000006');
select pg_temp.assert((select count(*)=3 from public.variant_cart_items),'same parent supports separate variant identities');
select pg_temp.error($q$select public.change_variant_cart('fixture-red','set',100,2,'10000000-0000-4000-8000-000000000007')$q$,'INVALID_REQUEST');
reset role;
update public.product_variants set active=false where id='fixture-blue';
set local role authenticated;
select pg_temp.error($q$select public.place_variant_order('20000000-0000-4000-8000-000000000001',pg_temp.checkout(),pg_temp.quote())$q$,'PRODUCT_UNAVAILABLE');
select pg_temp.error($q$select public.change_variant_cart('fixture-blue','add',1,null,'10000000-0000-4000-8000-000000000008')$q$,'PRODUCT_UNAVAILABLE');
reset role;
update public.product_variants set active=true where id='fixture-blue';
set local role authenticated;
select pg_temp.error($q$select public.place_variant_order('20000000-0000-4000-8000-000000000001',pg_temp.checkout(),'[]')$q$,'CART_CHANGED');
select pg_temp.error($q$select public.place_order('20000000-0000-4000-8000-000000000001',pg_temp.checkout(),'[]')$q$,'CART_CHANGED');
select pg_temp.assert((select count(*)=0 from public.orders),'inactive/stale/legacy-client failures create no order');
select public.place_variant_order('20000000-0000-4000-8000-000000000001',pg_temp.checkout()||'{"user_id":"22222222-2222-4222-8222-222222222222","total":0,"payment_status":"paid"}',pg_temp.quote());
select pg_temp.assert((select user_id='11111111-1111-4111-8111-111111111111' and subtotal_cents=210000 and total_cents=210000 and status='placed' and payment_status='awaiting_payment' from public.orders),'trusted identity/prices/totals/payment semantics retained');
select pg_temp.assert((select count(*)=3 and count(distinct variant_id)=3 from public.order_items),'new order keeps two meaningful variants and default separately');
select pg_temp.assert((select variant_options='{"Color":"Blue"}' and variant_sku='fixture-blue' and variant_currency='NLE' and unit_price_cents=30000 from public.order_items where variant_id='fixture-blue'),'trusted immutable SKU/options/price/currency snapshots');
select public.place_variant_order('20000000-0000-4000-8000-000000000001','{}','[]');
select pg_temp.assert((select count(*)=1 from public.orders),'variant order retry idempotent after cart conversion');
select pg_temp.assert((select count(*)=0 from public.variant_cart_items),'variant Bag converted atomically');
reset role;
select pg_temp.assert((select count(*)=1 from public.order_confirmation_jobs),'one durable email job');
update public.product_variants set price_cents=31000,options='{"Color":"Edited"}' where id='fixture-blue';
select pg_temp.assert((select variant_options='{"Color":"Blue"}' and unit_price_cents=30000 from public.order_items where variant_id='fixture-blue'),'current variant edits never rewrite historical snapshots');
select pg_temp.error($q$update public.order_items set variant_options='{}'$q$,'Historical order item snapshot is immutable');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
select pg_temp.assert((select count(*)=0 from public.variant_cart_items),'another owner cannot read variant intent');
select pg_temp.assert((select count(*)=0 from public.orders),'another owner cannot read variant order');
select pg_temp.error($q$select public.place_variant_order('20000000-0000-4000-8000-000000000001',pg_temp.checkout(),'[]')$q$,'EMPTY_CART');
reset role;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
create function pg_temp.fail_variant_delete() returns trigger language plpgsql as $$begin raise exception 'TEST_TRANSACTION_FAILURE';end;$$;
create trigger test_variant_conversion before delete on public.variant_cart_items for each row execute function pg_temp.fail_variant_delete();
set local role authenticated;
select public.change_variant_cart('fixture-red','add',1,null,'10000000-0000-4000-8000-000000000009');
select pg_temp.error($q$select public.place_variant_order('20000000-0000-4000-8000-000000000002',pg_temp.checkout(),pg_temp.quote())$q$,'TEST_TRANSACTION_FAILURE');
select pg_temp.assert((select count(*)=1 from public.orders),'failed variant conversion rolls back order');
select pg_temp.assert((select count(*)=1 from public.variant_cart_items),'failed conversion retains intent');
reset role;
select pg_temp.assert((select count(*)=1 from public.order_confirmation_jobs),'failed conversion creates no extra job');
set constraints all immediate;
rollback;
select 'PASS: variant checkout fixtures rolled back';
