-- Disposable rollback-only SQL fixtures. Never run against hosted resources.
begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end;$$;
create function pg_temp.error(statement text,expected text) returns text language plpgsql as $$
begin begin execute statement;exception when others then if sqlerrm<>expected then raise;end if;return 'PASS: rejected '||expected;end;raise exception 'FAIL: expected %',expected;end;$$;
create function pg_temp.denied(statement text) returns text language plpgsql as $$
begin begin execute statement;exception when insufficient_privilege then return 'PASS: permission denied';end;raise exception 'FAIL: expected permission denial';end;$$;
create function pg_temp.checkout() returns jsonb language sql as $$
select '{"full_name":"Local fixture","email":"fixture@example.invalid","contact_phone":"+23276521208","payment_phone":"+23276521209","provider":"orange","fulfilment":"pickup"}'::jsonb;$$;
create function pg_temp.quote(v text default 'default:amber-candle',q integer default 2) returns jsonb language sql as $$
select coalesce((select jsonb_build_object('product_id',product_id,'variant_id',id,'quantity',q,'unit_price',price_cents) from public.product_variants where id=v),'{}'::jsonb);$$;
create function pg_temp.direct(r uuid default 'a1000000-0000-4000-8000-000000000001',v text default 'default:amber-candle',q integer default 2, c jsonb default null) returns jsonb language sql as $$
select public.place_direct_variant_order(r,v,q,pg_temp.quote(v,q),coalesce(c,pg_temp.checkout()));$$;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');
insert into public.carts(id,user_id,cart_version) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',1),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',2);
insert into public.cart_items(cart_id,product_id,quantity) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','amber-candle',99);
insert into public.variant_cart_items(cart_id,variant_id,quantity) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','default:amber-candle',7),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','default:table-lamp',3);
create temp table bag_before as select
 (select jsonb_agg(to_jsonb(t) order by id) from public.carts t) carts,
 (select jsonb_agg(to_jsonb(t) order by cart_id,product_id) from public.cart_items t) legacy,
 (select jsonb_agg(to_jsonb(t) order by cart_id,variant_id) from public.variant_cart_items t) variants,
 (select jsonb_agg(to_jsonb(t)) from public.variant_cart_operations t) operations;

select pg_temp.assert(not has_function_privilege('anon','public.place_direct_variant_order(uuid,text,integer,jsonb,jsonb)','EXECUTE'),'anonymous RPC execution denied');
select pg_temp.assert(not has_function_privilege('service_role','public.place_direct_variant_order(uuid,text,integer,jsonb,jsonb)','EXECUTE'),'no service-role placement bypass grant');
select pg_temp.assert(has_function_privilege('authenticated','public.place_direct_variant_order(uuid,text,integer,jsonb,jsonb)','EXECUTE'),'authenticated RPC explicitly executable');
select pg_temp.assert((select prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='public.place_direct_variant_order(uuid,text,integer,jsonb,jsonb)'::regprocedure),'definer boundary has fixed empty search_path');
set local role anon;
select pg_temp.denied('select pg_temp.direct()');
reset role;
set local role authenticated;
select pg_temp.error('select pg_temp.direct()','AUTH_REQUIRED');
reset role;
select set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
set local role authenticated;
select pg_temp.error('select pg_temp.direct()','AUTH_REQUIRED');
reset role;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select pg_temp.error($q$select pg_temp.direct(null)$q$,'INVALID_REQUEST');
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid(),null)$q$,'INVALID_REQUEST');
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid(),'default:amber-candle',0)$q$,'INVALID_REQUEST');
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid(),'default:amber-candle',100)$q$,'INVALID_REQUEST');
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid(),'default:amber-candle',null)$q$,'INVALID_REQUEST');
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid(),'missing')$q$,'PRODUCT_UNAVAILABLE');
select pg_temp.error($q$select public.place_direct_variant_order(gen_random_uuid(),'default:amber-candle',2,'[]',pg_temp.checkout())$q$,'INVALID_CHECKOUT');
select pg_temp.error($q$select public.place_direct_variant_order(gen_random_uuid(),'default:amber-candle',2,null,pg_temp.checkout())$q$,'INVALID_CHECKOUT');
select pg_temp.error($q$select public.place_direct_variant_order(gen_random_uuid(),'default:amber-candle',2,pg_temp.quote(),null)$q$,'INVALID_CHECKOUT');
select pg_temp.error($q$select public.place_direct_variant_order(gen_random_uuid(),'default:amber-candle',2,pg_temp.quote()||'{"unit_price":0}',pg_temp.checkout())$q$,'QUOTE_CHANGED');
select pg_temp.error($q$select public.place_direct_variant_order(gen_random_uuid(),'default:amber-candle',2,pg_temp.quote()||'{"product_id":"table-lamp"}',pg_temp.checkout())$q$,'QUOTE_CHANGED');
-- All required checkout fields are validated independently at the SQL boundary.
do $$declare pair record;bad jsonb;begin
 for pair in select * from (values ('full_name','""'::jsonb),('email','"bad"'::jsonb),('contact_phone','"123"'::jsonb),('payment_phone','"123"'::jsonb),('provider','"other"'::jsonb),('fulfilment','"other"'::jsonb),('full_name','{}'::jsonb),('email','null'::jsonb)) v(k,val) loop
   bad:=pg_temp.checkout()||jsonb_build_object(pair.k,pair.val);
   perform pg_temp.error(format('select pg_temp.direct(gen_random_uuid(),%L,2,%L::jsonb)','default:amber-candle',bad::text),'INVALID_CHECKOUT');
 end loop;
end;$$;
select 'PASS: eight SQL checkout field validation cases';
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid(),'default:amber-candle',2,pg_temp.checkout()||jsonb_build_object('full_name',repeat('x',201)))$q$,'INVALID_CHECKOUT');
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid(),'default:amber-candle',2,pg_temp.checkout()||jsonb_build_object('email',repeat('a',250)||'@x.invalid'))$q$,'INVALID_CHECKOUT');
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid(),'default:amber-candle',2,pg_temp.checkout()||jsonb_build_object('extra',repeat('x',8001)))$q$,'INVALID_CHECKOUT');
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid(),'default:amber-candle',2,pg_temp.checkout()||'{"fulfilment":"delivery","zone_id":"zone-4"}')$q$,'INVALID_DELIVERY_ZONE');
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid(),'default:amber-candle',2,pg_temp.checkout()||'{"fulfilment":"delivery","zone_id":"zone-1","street":"x","area":"x","city":"Bo"}')$q$,'INVALID_DELIVERY_DETAILS');
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid(),'default:amber-candle',2,pg_temp.checkout()||jsonb_build_object('fulfilment','delivery','zone_id','zone-1','street','x','area','x','city','Freetown','instructions',repeat('x',501)))$q$,'INVALID_DELIVERY_DETAILS');
select pg_temp.direct();
select pg_temp.assert((select checkout_source='direct' and status='placed' and payment_status='awaiting_payment' and delivery_fee_cents=0 and payment_phone_last4='1209' and pickup_location='Lumley, Freetown' from public.orders),'trusted direct metadata and pickup snapshot');
select pg_temp.assert((select count(*)=1 from public.order_items),'one selected item only');
select pg_temp.assert((select quantity=2 and variant_id='default:amber-candle' and variant_currency='NLE' from public.order_items),'immutable selected identity and quantity');
select pg_temp.denied('insert into public.orders(checkout_source) values(''direct'')');
select pg_temp.denied('update public.orders set checkout_source=''bag''');
select pg_temp.denied('delete from public.order_items');
select pg_temp.denied('select * from public.order_confirmation_jobs');
select pg_temp.denied('select * from public.variant_inventory');
select pg_temp.denied('insert into public.variant_cart_items(cart_id,variant_id,quantity) values(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'',''default:amber-candle'',1)');
select pg_temp.error($q$select public.place_order('a1000000-0000-4000-8000-000000000001','{}','[]')$q$,'CHECKOUT_SOURCE_CONFLICT');
select pg_temp.error($q$select public.place_variant_order('a1000000-0000-4000-8000-000000000001','{}','[]')$q$,'CHECKOUT_SOURCE_CONFLICT');
select pg_temp.error($q$select pg_temp.direct('a1000000-0000-4000-8000-000000000001','default:table-lamp')$q$,'CHECKOUT_SELECTION_CONFLICT');
select pg_temp.error($q$select pg_temp.direct('a1000000-0000-4000-8000-000000000001','default:amber-candle',3)$q$,'CHECKOUT_SELECTION_CONFLICT');
reset role;
select pg_temp.error($q$update public.orders set checkout_source='bag'$q$,'Historical checkout source is immutable');
-- Constraint enforcement on inserts (updates are rejected by immutability first).
do $$begin
 begin
  insert into public.orders(user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents,checkout_source)
  values('11111111-1111-4111-8111-111111111111','Local source fixture','fixture@example.invalid','+23276521208','pickup','Lumley, Freetown','orange','NLE',100,0,100,'unknown');
 exception when check_violation then
  if sqlerrm not like '%orders_checkout_source_check%' then raise;end if;
  return;
 end;
 raise exception 'FAIL: invalid source accepted';
end;$$;
select 'PASS: unsupported checkout source rejected by its constraint';
select pg_temp.assert((select attnotnull and atthasdef from pg_attribute where attrelid='public.orders'::regclass and attname='checkout_source'),'source is non-null with backward-compatible default');
select pg_temp.assert((select pg_get_constraintdef(oid) like '%bag%' and pg_get_constraintdef(oid) like '%direct%' from pg_constraint where conrelid='public.orders'::regclass and conname='orders_checkout_source_check'),'source is constrained to supported purchase modes');
update public.product_variants set active=false,price_cents=price_cents+1 where id='default:amber-candle';
set local role authenticated;
select public.place_direct_variant_order('a1000000-0000-4000-8000-000000000001','default:amber-candle',2,'{}','{}');
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid())$q$,'PRODUCT_UNAVAILABLE');
reset role;
select pg_temp.assert((select count(*)=1 from public.orders),'accepted retry precedes current price and availability checks');
select pg_temp.assert((select count(*)=1 from public.order_confirmation_jobs),'retry queues one durable job');
update public.product_variants set active=true,price_cents=price_cents-1 where id='default:amber-candle';
-- A different owner may use the same UUID, but cannot read the original order.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
select pg_temp.assert((select count(*)=0 from public.orders),'owner RLS hides another customer order');
select pg_temp.assert((select count(*)=0 from public.order_items),'owner RLS hides another customer items');
select pg_temp.direct();
reset role;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
set local role authenticated;
select pg_temp.direct();
reset role;
select pg_temp.assert(not exists(select 1 from public.carts where user_id='33333333-3333-4333-8333-333333333333'),'direct order creates no cart for a cartless owner');
-- Real finite stock allocation and accepted retry despite stock exhaustion.
select public.adjust_variant_inventory('default:amber-candle',2,'Disposable local fixture','b1000000-0000-4000-8000-000000000001');
update public.product_variants set inventory_policy='tracked' where id='default:amber-candle';
set local role authenticated;
select pg_temp.direct('a1000000-0000-4000-8000-000000000002');
select public.place_direct_variant_order('a1000000-0000-4000-8000-000000000002','default:amber-candle',2,'{}','{}');
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid())$q$,'OUT_OF_STOCK');
reset role;
select pg_temp.assert((select allocated=2 and on_hand=2 from public.variant_inventory),'finite stock allocated once, physical count preserved');
select pg_temp.assert((select count(*)=1 from public.inventory_ledger where event='order_allocation'),'one allocation ledger event on exhausted-stock retry');
select public.adjust_variant_inventory('default:amber-candle',2,'Disposable replenish','b1000000-0000-4000-8000-000000000002');
-- Failure after stock allocation, while queuing the durable confirmation.
create function pg_temp.fail_job() returns trigger language plpgsql as $$begin raise exception 'TEST_DIRECT_ROLLBACK';end;$$;
create trigger test_direct_job before insert on public.order_confirmation_jobs for each row execute function pg_temp.fail_job();
set local role authenticated;
select pg_temp.error($q$select pg_temp.direct('a1000000-0000-4000-8000-000000000003')$q$,'TEST_DIRECT_ROLLBACK');
reset role;
select pg_temp.assert((select allocated=2 from public.variant_inventory),'job failure rolls back allocation');
select pg_temp.assert((select count(*)=1 from public.inventory_ledger where event='order_allocation'),'job failure rolls back ledger');
select pg_temp.assert(not exists(select 1 from public.orders where checkout_request_id='a1000000-0000-4000-8000-000000000003'),'job failure rolls back order');
select pg_temp.assert((select count(*)=4 from public.order_items),'job failure rolls back items');
select pg_temp.assert((select count(*)=4 from public.order_confirmation_jobs),'job failure leaves existing jobs intact');
drop trigger test_direct_job on public.order_confirmation_jobs;
select pg_temp.assert((select carts is not distinct from (select jsonb_agg(to_jsonb(t) order by id) from public.carts t)
 and legacy is not distinct from (select jsonb_agg(to_jsonb(t) order by cart_id,product_id) from public.cart_items t)
 and variants is not distinct from (select jsonb_agg(to_jsonb(t) order by cart_id,variant_id) from public.variant_cart_items t)
 and operations is not distinct from (select jsonb_agg(to_jsonb(t)) from public.variant_cart_operations t) from bag_before),'all cart tables and mutation receipts unchanged across direct success, failure and replay');
-- Delivery fees and forged browser totals/identity/status are never authority.
set local role authenticated;
do $$declare z integer;begin for z in 1..3 loop
 perform pg_temp.direct(gen_random_uuid(),'default:table-lamp',1,pg_temp.checkout()||jsonb_build_object('fulfilment','delivery','zone_id','zone-'||z,'street','Fixture','area','Lumley','city','fReEtOwN','user_id','11111111-1111-4111-8111-111111111111','total',0,'payment_status','paid','delivery_fee',0));
end loop;end;$$;
select pg_temp.assert((select array_agg(delivery_fee_cents order by delivery_zone_id)=array[4000,5000,6000] from public.orders where fulfilment_method='delivery'),'all three trusted delivery fees');
select pg_temp.assert((select bool_and(user_id='33333333-3333-4333-8333-333333333333' and payment_status='awaiting_payment' and delivery_city='Freetown' and total_cents=subtotal_cents+delivery_fee_cents and checkout_source='direct') from public.orders where fulfilment_method='delivery'),'forged ownership/totals/status ignored; canonical city and source');
reset role;
update public.product_variants set price_cents=2147483647 where id='default:table-lamp';
set local role authenticated;
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid(),'default:table-lamp',2)$q$,'ORDER_TOTAL_LIMIT');
reset role;
-- Normal legacy Bag still converts and its historical replay remains permissive.
update public.product_variants set inventory_policy='untracked' where id='default:table-lamp';
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
-- Use an untracked variant for the existing 99-unit legacy line.
update public.product_variants set inventory_policy='untracked' where id='default:amber-candle';
set local role authenticated;
select public.place_order('a1000000-0000-4000-8000-000000000010',pg_temp.checkout(),jsonb_build_array(jsonb_build_object('product_id','amber-candle','quantity',99,'unit_price',(select price_cents from public.products where id='amber-candle'))));
select public.place_order('a1000000-0000-4000-8000-000000000010','{}','[]');
select pg_temp.error($q$select pg_temp.direct('a1000000-0000-4000-8000-000000000010')$q$,'CHECKOUT_SOURCE_CONFLICT');
select pg_temp.assert((select checkout_source='bag' from public.orders where checkout_request_id='a1000000-0000-4000-8000-000000000010'),'legacy Bag defaults to bag source');
reset role;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
update public.product_variants set price_cents=100 where id='default:table-lamp';
set local role authenticated;
select public.place_variant_order('a1000000-0000-4000-8000-000000000011',pg_temp.checkout(),(select jsonb_agg(jsonb_build_object('product_id',v.product_id,'variant_id',v.id,'quantity',ci.quantity,'unit_price',v.price_cents)) from public.variant_cart_items ci join public.product_variants v on v.id=ci.variant_id));
select public.place_variant_order('a1000000-0000-4000-8000-000000000011','{}','[]');
select pg_temp.error($q$select pg_temp.direct('a1000000-0000-4000-8000-000000000011')$q$,'CHECKOUT_SOURCE_CONFLICT');
select pg_temp.assert((select checkout_source='bag' from public.orders where checkout_request_id='a1000000-0000-4000-8000-000000000011'),'variant Bag defaults to bag source');
reset role;
rollback;
select 'PASS: direct-order SQL fixtures rolled back';
