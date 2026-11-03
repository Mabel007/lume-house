-- Isolated disposable PostgreSQL ONLY. All identities/orders/stock roll back.
begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end;$$;
create function pg_temp.error(statement text,expected text) returns text language plpgsql as $$
begin begin execute statement;exception when others then if sqlerrm<>expected then raise;end if;return 'PASS: rejected '||expected;end;raise exception 'FAIL: expected %',expected;end;$$;
create function pg_temp.denied(statement text) returns text language plpgsql as $$
begin begin execute statement;exception when insufficient_privilege then return 'PASS: permission denied';end;raise exception 'FAIL: expected permission denial';end;$$;
create function pg_temp.pickup(overrides jsonb default '{}') returns jsonb language sql as $$
select '{"full_name":"Country fixture","email":"fixture@example.invalid","contact_phone":"+23276521208","payment_phone":"+23276521209","provider":"orange","fulfilment":"pickup","country_code":"SL"}'::jsonb || overrides;$$;
create function pg_temp.delivery(zone text, overrides jsonb default '{}') returns jsonb language sql as $$
select pg_temp.pickup(overrides) || jsonb_build_object('fulfilment','delivery','zone_id',zone,'street','Local landmark','area','Lumley','city','Freetown');$$;
create function pg_temp.quote() returns jsonb language sql as $$
select coalesce(jsonb_agg(jsonb_build_object('product_id',ci.product_id,'quantity',ci.quantity,'unit_price',p.price_cents) order by ci.product_id),'[]'::jsonb)
from public.cart_items ci join public.products p on p.id=ci.product_id
join public.carts c on c.id=ci.cart_id where c.user_id=auth.uid();$$;
create function pg_temp.vquote() returns jsonb language sql as $$
select coalesce(jsonb_agg(jsonb_build_object('product_id',v.product_id,'variant_id',v.id,'quantity',ci.quantity,'unit_price',v.price_cents) order by v.id),'[]'::jsonb)
from public.variant_cart_items ci join public.product_variants v on v.id=ci.variant_id
join public.carts c on c.id=ci.cart_id where c.user_id=auth.uid();$$;
create function pg_temp.dquote() returns jsonb language sql as $$
select jsonb_build_object('product_id',product_id,'variant_id',id,'quantity',1,'unit_price',price_cents)
from public.product_variants where id='default:table-lamp';$$;
create function pg_temp.direct(r uuid,c jsonb) returns jsonb language sql as $$
select public.place_direct_variant_order(r,'default:table-lamp',1,pg_temp.dquote(),c);$$;
create function pg_temp.bad_countries() returns jsonb language sql immutable as $$
select '[null,""," SL ","  SL","SL ","sl","Sl","sLE","SLE","SLX","Sierra Leone","US","NG",1,true,{},[],["SL"]]'::jsonb;$$;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444');
insert into public.carts(id,user_id,cart_version) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',1),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',2),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','44444444-4444-4444-8444-444444444444',1);
insert into public.cart_items(cart_id,product_id,quantity) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','amber-candle',2),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','amber-candle',1);
insert into public.variant_cart_items(cart_id,variant_id,quantity) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','default:amber-candle',2);

select pg_temp.assert((select atttypid='text'::regtype and not attnotnull and not atthasdef
 from pg_attribute where attrelid='public.orders'::regclass and attname='country_code' and not attisdropped),
 'country is nullable text without a backfill default');
select pg_temp.assert((select count(*)=1 from information_schema.columns
 where table_schema='public' and table_name='orders' and column_name='country_code'),'one country snapshot column');
select pg_temp.assert((select count(*)=0 from information_schema.columns
 where table_schema='public' and table_name='orders' and column_name='country'),'no legacy duplicate country column');
select pg_temp.assert((select pg_get_constraintdef(oid) like '%country_code IS NULL%'
 and pg_get_constraintdef(oid) like '%''SL''%' from pg_constraint
 where conrelid='public.orders'::regclass and conname='orders_delivery_country_check'),
 'check allows only NULL or exact SL');
select pg_temp.assert((select count(*)=1 from pg_trigger where tgrelid='public.orders'::regclass
 and tgname='orders_delivery_country_required' and tgtype=7 and not tgisinternal),'insert requires country');
select pg_temp.assert((select count(*)=1 from pg_trigger where tgrelid='public.orders'::regclass
 and tgname='orders_delivery_country_immutable' and tgtype=19 and not tgisinternal),'update country is immutable');
select pg_temp.assert((select count(*)=4 from pg_trigger where tgrelid='public.orders'::regclass
 and tgname in ('orders_snapshot_immutable','orders_zone_snapshot_immutable','orders_checkout_source_immutable','orders_delivery_country_immutable')),
 'existing snapshot, zone and source guards remain installed');
select pg_temp.assert((select proconfig=array['search_path=""'] and not prosecdef from pg_proc
 where oid='public.require_order_delivery_country()'::regprocedure),'insert guard has fixed empty search path');
select pg_temp.assert((select proconfig=array['search_path=""'] and not prosecdef from pg_proc
 where oid='public.protect_order_delivery_country()'::regprocedure),'update guard has fixed empty search path');
select pg_temp.assert(not has_function_privilege('authenticated','public.require_order_delivery_country()','EXECUTE'),'insert guard not browser-callable');
select pg_temp.assert(not has_function_privilege('authenticated','public.protect_order_delivery_country()','EXECUTE'),'update guard not browser-callable');
select pg_temp.assert(not has_function_privilege('anon','public.place_order(uuid,jsonb,jsonb)','EXECUTE'),'anonymous Bag placement denied');
select pg_temp.assert(has_function_privilege('authenticated','public.place_order(uuid,jsonb,jsonb)','EXECUTE'),'authenticated Bag placement allowed');
select pg_temp.assert(has_function_privilege('authenticated','public.place_variant_order(uuid,jsonb,jsonb)','EXECUTE'),'authenticated variant Bag placement allowed');
select pg_temp.assert(not has_function_privilege('anon','public.place_direct_variant_order(uuid,text,integer,jsonb,jsonb)','EXECUTE'),'anonymous direct placement denied');
select pg_temp.assert(not has_function_privilege('service_role','public.place_direct_variant_order(uuid,text,integer,jsonb,jsonb)','EXECUTE'),'no service-role direct bypass');
select pg_temp.assert(has_function_privilege('authenticated','public.place_direct_variant_order(uuid,text,integer,jsonb,jsonb)','EXECUTE'),'authenticated direct placement allowed');
select pg_temp.assert((select prosecdef and proconfig=array['search_path=""'] from pg_proc
 where oid='public.place_direct_variant_order(uuid,text,integer,jsonb,jsonb)'::regprocedure),'direct definer boundary preserved');

create temp table country_state as select
 (select count(*) from public.orders) orders,
 (select count(*) from public.order_items) items,
 (select count(*) from public.order_confirmation_jobs) jobs,
 (select jsonb_agg(to_jsonb(c) order by id) from public.carts c) carts,
 (select jsonb_agg(to_jsonb(ci) order by cart_id,product_id) from public.cart_items ci) legacy,
 (select jsonb_agg(to_jsonb(v) order by cart_id,variant_id) from public.variant_cart_items v) variants;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
do $$declare bad jsonb;c jsonb;begin
 for bad in select value from jsonb_array_elements(pg_temp.bad_countries()) loop
  c:=pg_temp.pickup()||jsonb_build_object('country_code',bad);
  perform pg_temp.error(format('select public.place_order(gen_random_uuid(),%L::jsonb,%L::jsonb)',c::text,pg_temp.quote()::text),'INVALID_DELIVERY_COUNTRY');
  perform pg_temp.error(format('select public.place_variant_order(gen_random_uuid(),%L::jsonb,%L::jsonb)',c::text,pg_temp.vquote()::text),'INVALID_DELIVERY_COUNTRY');
  perform pg_temp.error(format('select pg_temp.direct(gen_random_uuid(),%L::jsonb)',c::text),'INVALID_DELIVERY_COUNTRY');
 end loop;
 perform pg_temp.error(format('select public.place_order(gen_random_uuid(),%L::jsonb,%L::jsonb)',(pg_temp.pickup()-'country_code')::text,pg_temp.quote()::text),'INVALID_DELIVERY_COUNTRY');
 perform pg_temp.error(format('select public.place_variant_order(gen_random_uuid(),%L::jsonb,%L::jsonb)',(pg_temp.pickup()-'country_code')::text,pg_temp.vquote()::text),'INVALID_DELIVERY_COUNTRY');
 perform pg_temp.error(format('select pg_temp.direct(gen_random_uuid(),%L::jsonb)',(pg_temp.pickup()-'country_code')::text),'INVALID_DELIVERY_COUNTRY');
 perform pg_temp.error('select public.place_order(gen_random_uuid(),''[]'',''[]'')','INVALID_CHECKOUT');
 perform pg_temp.error('select public.place_variant_order(gen_random_uuid(),''null'',''[]'')','INVALID_CHECKOUT');
 perform pg_temp.error('select pg_temp.direct(gen_random_uuid(),''[]'')','INVALID_CHECKOUT');
end;$$;
select 'PASS: every non-canonical country and container is rejected by all three RPCs';
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
do $$begin
 perform pg_temp.error(format('select public.place_variant_order(gen_random_uuid(),%L::jsonb,%L::jsonb)',(pg_temp.pickup()-'country_code')::text,'[]'),'INVALID_DELIVERY_COUNTRY');
end;$$;
reset role;
select pg_temp.assert((select cart_version=1 from public.carts where user_id='44444444-4444-4444-8444-444444444444'),'invalid country never promotes a legacy Bag');
select pg_temp.assert((select count(*)=1 from public.cart_items where cart_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),'invalid country never converts legacy lines');
select pg_temp.assert((select count(*)=0 from public.variant_cart_items where cart_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),'invalid country creates no variant intent');
select pg_temp.assert((select orders=(select count(*) from public.orders) and items=(select count(*) from public.order_items)
 and jobs=(select count(*) from public.order_confirmation_jobs)
 and carts is not distinct from (select jsonb_agg(to_jsonb(c) order by id) from public.carts c)
 and legacy is not distinct from (select jsonb_agg(to_jsonb(ci) order by cart_id,product_id) from public.cart_items ci)
 and variants is not distinct from (select jsonb_agg(to_jsonb(v) order by cart_id,variant_id) from public.variant_cart_items v)
 from country_state),'invalid country mutates no order, job or cart state');
select pg_temp.assert((select count(*)=0 from public.variant_inventory),'invalid country allocates no stock');

-- Valid delivery and pickup for each RPC, with an exact immutable SL snapshot.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select public.place_order('c1000000-0000-4000-8000-000000000001',pg_temp.delivery('zone-1'),pg_temp.quote());
select pg_temp.assert((select country_code='SL' and checkout_source='bag' and currency='NLE'
 and subtotal_cents=50000 and delivery_fee_cents=4000 and total_cents=54000
 from public.orders where checkout_request_id='c1000000-0000-4000-8000-000000000001'),
 'Bag delivery snapshots exact SL with trusted NLE fee');
insert into public.cart_items(cart_id,product_id,quantity) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','amber-candle',1);
select public.place_order('c1000000-0000-4000-8000-000000000002',pg_temp.pickup(),pg_temp.quote());
select pg_temp.assert((select country_code='SL' and delivery_fee_cents=0 and total_cents=25000
 from public.orders where checkout_request_id='c1000000-0000-4000-8000-000000000002'),
 'Bag pickup snapshots exact SL with no fee');
reset role;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
select public.place_variant_order('c2000000-0000-4000-8000-000000000001',pg_temp.delivery('zone-2'),pg_temp.vquote());
select pg_temp.assert((select country_code='SL' and checkout_source='bag' and delivery_zone_id='zone-2'
 and delivery_fee_cents=5000 and total_cents=55000
 from public.orders where checkout_request_id='c2000000-0000-4000-8000-000000000001'),
 'variant Bag delivery snapshots exact SL with trusted NLE fee');
select public.change_variant_cart('default:amber-candle','add',1,null,'c2000000-0000-4000-8000-000000000009');
select public.place_variant_order('c2000000-0000-4000-8000-000000000002',pg_temp.pickup(),pg_temp.vquote());
select pg_temp.assert((select country_code='SL' and delivery_fee_cents=0 and total_cents=25000
 from public.orders where checkout_request_id='c2000000-0000-4000-8000-000000000002'),
 'variant Bag pickup snapshots exact SL with no fee');
reset role;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
set local role authenticated;
select pg_temp.direct('c3000000-0000-4000-8000-000000000001',pg_temp.delivery('zone-2'));
select pg_temp.assert((select country_code='SL' and checkout_source='direct' and currency='NLE'
 and delivery_fee_cents=5000 and total_cents=subtotal_cents+5000
 from public.orders where checkout_request_id='c3000000-0000-4000-8000-000000000001'),
 'direct delivery snapshots exact SL with trusted NLE fee');
select pg_temp.direct('c3000000-0000-4000-8000-000000000002',pg_temp.pickup());
select pg_temp.assert((select country_code='SL' and delivery_fee_cents=0 and pickup_location='Lumley, Freetown'
 from public.orders where checkout_request_id='c3000000-0000-4000-8000-000000000002'),
 'direct pickup snapshots exact SL with no fee');
reset role;
select pg_temp.assert((select count(*)=6 from public.orders where country_code='SL'),'all six orders snapshot SL');
select pg_temp.assert((select count(*)=6 from public.order_items),'the six orders keep one historical item each');
select pg_temp.assert((select count(*)=6 from public.order_confirmation_jobs),'the six orders queue one durable job each');
select pg_temp.assert((select count(*)=4 from public.orders where checkout_source='bag') and (select count(*)=2 from public.orders where checkout_source='direct'),'purchase source remains distinct');

-- Valid SL replay stays read-only; invalid replay never mutates or reallocates.
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select public.place_order('c1000000-0000-4000-8000-000000000001','{"country_code":"SL"}','[]');
select pg_temp.error($q$select public.place_order('c1000000-0000-4000-8000-000000000001','{}','[]')$q$,'INVALID_DELIVERY_COUNTRY');
reset role;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
select public.place_variant_order('c2000000-0000-4000-8000-000000000001','{"country_code":"SL"}','[]');
reset role;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
set local role authenticated;
select public.place_direct_variant_order('c3000000-0000-4000-8000-000000000001','default:table-lamp',1,'{}','{"country_code":"SL"}');
select pg_temp.error($q$select public.place_direct_variant_order('c3000000-0000-4000-8000-000000000001','default:table-lamp',1,'{}','{}')$q$,'INVALID_DELIVERY_COUNTRY');
select pg_temp.error($q$select public.place_direct_variant_order('c3000000-0000-4000-8000-000000000001','default:amber-candle',1,'{}','{"country_code":"SL"}')$q$,'CHECKOUT_SELECTION_CONFLICT');
reset role;
select pg_temp.assert((select count(*)=6 from public.orders) and (select count(*)=6 from public.order_confirmation_jobs),'replay never duplicates orders or jobs');
select pg_temp.assert((select checkout_source='direct' from public.orders where checkout_request_id='c3000000-0000-4000-8000-000000000001'),'direct order is unchanged by cross-mode recovery');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select pg_temp.error($q$select public.place_direct_variant_order('c1000000-0000-4000-8000-000000000001','default:table-lamp',1,'{}','{"country_code":"SL"}')$q$,'CHECKOUT_SOURCE_CONFLICT');
reset role;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
set local role authenticated;
select pg_temp.error($q$select public.place_order('c3000000-0000-4000-8000-000000000001','{"country_code":"SL"}','[]')$q$,'CHECKOUT_SOURCE_CONFLICT');
reset role;

-- Cross-account isolation and no cross-owner recovery.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
select pg_temp.assert((select count(*)=2 from public.orders),'another owner reads only their own orders');
select pg_temp.assert((select count(*)=2 from public.order_items),'another owner reads only their own items');
reset role;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
set local role authenticated;
select pg_temp.error(format($q$select public.place_order('c1000000-0000-4000-8000-000000000001',%L,'[]')$q$,pg_temp.pickup()),'EMPTY_CART');
reset role;
select pg_temp.assert((select country_code='SL' from public.orders where checkout_request_id='c1000000-0000-4000-8000-000000000001'),'cross-owner attempt leaves the original snapshot intact');

-- Snapshot updates fail for browsers and privileged sessions; status stays mutable.
set local role authenticated;
select pg_temp.denied($q$update public.orders set country_code='SL' where checkout_request_id='c1000000-0000-4000-8000-000000000001'$q$);
reset role;
select pg_temp.error($q$update public.orders set country_code=null where checkout_request_id='c1000000-0000-4000-8000-000000000001'$q$,'Historical delivery country is immutable');
select pg_temp.error($q$update public.orders set country_code='SLE' where checkout_request_id='c1000000-0000-4000-8000-000000000001'$q$,'Historical delivery country is immutable');
update public.orders set country_code='SL' where checkout_request_id='c1000000-0000-4000-8000-000000000001';
update public.orders set status='confirmed' where checkout_request_id='c1000000-0000-4000-8000-000000000001';
select pg_temp.assert((select country_code='SL' and status='confirmed' from public.orders where checkout_request_id='c1000000-0000-4000-8000-000000000001'),'unchanged country and legitimate status updates succeed');
update public.products set price_cents=31000,name='Changed country fixture' where id='amber-candle';
select pg_temp.assert((select unit_price_cents=25000 and product_name='Amber Glass Candle' from public.order_items where order_id=(select id from public.orders where checkout_request_id='c1000000-0000-4000-8000-000000000001')),'later catalogue edits never rewrite country-era history');

-- Raw inserts cannot omit or vary the country even for a privileged session.
do $$begin
 begin
  insert into public.orders(user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents)
  values('11111111-1111-4111-8111-111111111111','No country fixture','fixture@example.invalid','+23276521208','pickup','Lumley, Freetown','orange','NLE',100,0,100);
  raise exception 'FAIL: no-country insert accepted';
 exception when check_violation then
  if sqlerrm<>'New orders require delivery country SL' then raise;end if;
 end;
end;$$;
do $$declare bad text;begin
 foreach bad in array array['null','SLE','sl'] loop
  begin
   if bad='null' then
    insert into public.orders(user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents,country_code)
    values('11111111-1111-4111-8111-111111111111','Bad country fixture','fixture@example.invalid','+23276521208','pickup','Lumley, Freetown','orange','NLE',100,0,100,null);
   else
    insert into public.orders(user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents,country_code)
    values('11111111-1111-4111-8111-111111111111','Bad country fixture','fixture@example.invalid','+23276521208','pickup','Lumley, Freetown','orange','NLE',100,0,100,bad);
   end if;
   raise exception 'FAIL: invalid country insert accepted';
  exception when check_violation then
   if sqlerrm<>'New orders require delivery country SL' then raise;end if;
  end;
 end loop;
end;$$;
select 'PASS: raw inserts require exact SL';

-- Finite stock is untouched by a country rejection before allocation.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
set local role service_role;
select public.adjust_variant_inventory('default:table-lamp',5,'Country stock fixture','c1000000-0000-4000-8000-000000000010');
reset role;
update public.product_variants set inventory_policy='tracked' where id='default:table-lamp';
set local role authenticated;
select pg_temp.error($q$select pg_temp.direct(gen_random_uuid(),(pg_temp.pickup()-'country_code'))$q$,'INVALID_DELIVERY_COUNTRY');
reset role;
select pg_temp.assert((select allocated=0 and on_hand=5 from public.variant_inventory where variant_id='default:table-lamp'),'invalid country allocates no finite stock');
select pg_temp.assert((select count(*)=0 from public.inventory_ledger where variant_id='default:table-lamp' and event='order_allocation'),'invalid country writes no allocation ledger');
set local role service_role;
select public.adjust_variant_inventory('default:amber-candle',5,'Country variant stock','c1000000-0000-4000-8000-000000000011');
reset role;
update public.product_variants set inventory_policy='tracked' where id='default:amber-candle';
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
select public.change_variant_cart('default:amber-candle','add',1,null,'c2000000-0000-4000-8000-000000000010');
select pg_temp.error(format('select public.place_variant_order(gen_random_uuid(),%L::jsonb,%L::jsonb)',(pg_temp.pickup()-'country_code')::text,pg_temp.vquote()::text),'INVALID_DELIVERY_COUNTRY');
reset role;
select pg_temp.assert((select allocated=0 and on_hand=5 from public.variant_inventory where variant_id='default:amber-candle'),'invalid country rejects before Bag conversion or allocation');
select pg_temp.assert((select count(*)=1 from public.variant_cart_items where cart_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'invalid country retains finite-stock Bag intent');
select pg_temp.assert((select count(*)=0 from public.inventory_ledger where variant_id='default:amber-candle' and event='order_allocation'),'invalid country writes no variant allocation ledger');
set constraints all immediate;
rollback;
select 'PASS: country order fixtures rolled back';
