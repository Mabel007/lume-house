-- LOCAL TEST DATABASE ONLY. Synthetic identities exist only inside this rolled-back test.
-- Run with psql -v ON_ERROR_STOP=1 after migration and seed.
begin;
create function pg_temp.assert(ok boolean, label text) returns text language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'PASS: ' || label;
end;
$$;
create function pg_temp.expect_error(statement text, expected_code text, label text)
returns text language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate <> expected_code then raise; end if;
    return 'PASS: ' || label;
  end;
  raise exception 'FAIL: expected error for %', label;
end;
$$;

select pg_temp.assert((select count(*) = 7 from pg_class where relnamespace = 'public'::regnamespace and relname in ('products','profiles','carts','cart_items','orders','order_items','order_confirmation_jobs') and relrowsecurity), 'RLS enabled on all seven tables');
select pg_temp.assert((select count(*) = 20 from public.products where active), 'repeatable seed contains exactly twenty active products');

insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into public.carts(id,user_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');
insert into public.cart_items(cart_id,product_id,quantity) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','amber-candle',2),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','linen-cushion',1);
insert into public.profiles(id,full_name) values ('22222222-2222-4222-8222-222222222222','User B');
insert into public.orders(id,user_id,full_name,customer_email,customer_phone,fulfilment_method,
 delivery_street_address,delivery_area,delivery_city,pickup_location,payment_provider,payment_phone_last4,
 currency,subtotal_cents,delivery_fee_cents,total_cents)
select id,user_id,'Historical Customer','fixture@example.invalid','+23276521208',
 case when id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then 'delivery' else 'pickup' end,
 case when id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then 'Test landmark' end,
 case when id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then 'Lumley' end,
 case when id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then 'Freetown' end,
 case when id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' then 'Lumley, Freetown' end,
 'orange','1208','NLE',25000,
 case when id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then 5000 else 0 end,
 case when id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then 30000 else 25000 end from public.carts;
insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents)
select id,'amber-candle','Historical candle name',1,25000 from public.orders;
insert into public.order_confirmation_jobs(order_id) select id from public.orders;
set constraints all immediate;
set constraints all deferred;
update public.products set active = false where id = 'table-lamp';

set local role anon;
select pg_temp.assert((select count(*) = 19 from public.products), 'anonymous can read only active products');
select pg_temp.expect_error('insert into public.products default values','42501','anonymous product insert denied');
select pg_temp.expect_error('select * from public.profiles','42501','anonymous profiles denied');
select pg_temp.expect_error('select * from public.order_confirmation_jobs','42501','anonymous email jobs denied');
select pg_temp.expect_error('select * from public.carts','42501','anonymous private carts denied');
select pg_temp.expect_error('select * from public.cart_items','42501','anonymous private cart items denied');
select pg_temp.expect_error('select * from public.orders','42501','anonymous private orders denied');
select pg_temp.expect_error('select * from public.order_items','42501','anonymous private order items denied');
reset role;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select pg_temp.assert((select count(*)=0 from public.profiles), 'user A cannot read B profile');
insert into public.profiles(id,full_name,phone,default_street_address,default_area,default_city)
values ('11111111-1111-4111-8111-111111111111','User A','+23276521208','New default landmark','Lumley','Freetown');
select pg_temp.assert((select count(*)=1 from public.profiles), 'own profile insert/read allowed');
update public.profiles set full_name='Updated A',default_street_address='Changed default';
select pg_temp.assert((select full_name='Updated A' from public.profiles), 'own profile update allowed');
select pg_temp.expect_error($s$insert into public.profiles(id) values ('22222222-2222-4222-8222-222222222222')$s$,'42501','cannot create B profile');
select pg_temp.expect_error($s$insert into public.profiles(id) values ('11111111-1111-4111-8111-111111111111')$s$,'23505','one profile per auth user');
select pg_temp.expect_error($s$update public.profiles set id='22222222-2222-4222-8222-222222222222'$s$,'42501','profile owner cannot be changed');
select pg_temp.expect_error('update public.profiles set created_at=now()','42501','profile timestamps cannot be supplied by browser');
update public.profiles set full_name='Tampered' where id='22222222-2222-4222-8222-222222222222';
select pg_temp.expect_error('delete from public.profiles','42501','browser profile delete denied');
select pg_temp.expect_error('select * from public.order_confirmation_jobs','42501','customer email-job reads denied');
select pg_temp.expect_error('insert into public.order_confirmation_jobs default values','42501','customer email-job enqueue denied');
select pg_temp.expect_error($s$update public.orders set payment_status='paid',paid_at=now()$s$,'42501','browser paid-status update denied');
select pg_temp.assert((select bool_and(full_name='Historical Customer') from public.orders), 'profile edits do not change order contact snapshot');
select pg_temp.assert((select delivery_street_address='Test landmark' from public.orders), 'profile edits do not change order address snapshot');
select pg_temp.assert((select count(*) = 1 from public.carts), 'user A sees only own cart');
select pg_temp.assert((select count(*) = 1 from public.cart_items), 'user A sees only own cart items');
select pg_temp.assert((select count(*) = 1 from public.orders), 'user A sees only own order');
select pg_temp.assert((select count(*) = 1 from public.order_items), 'user A sees only own order items');
select pg_temp.expect_error($s$insert into public.carts(user_id) values ('22222222-2222-4222-8222-222222222222')$s$,'42501','cannot create another user cart');
select pg_temp.expect_error($s$insert into public.cart_items(cart_id,product_id,quantity) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','arch-vase',1)$s$,'42501','cannot insert another user cart item');
insert into public.cart_items(cart_id,product_id,quantity) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','arch-vase',1);
select pg_temp.assert((select count(*) = 2 from public.cart_items), 'own cart item insert allowed');
update public.cart_items set quantity=3 where cart_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.assert((select bool_and(quantity=3) from public.cart_items), 'own quantity update allowed');
select pg_temp.expect_error('update public.cart_items set quantity=0','23514','zero quantity rejected');
select pg_temp.expect_error('update public.cart_items set quantity=100','23514','excessive quantity rejected');
select pg_temp.expect_error($s$update public.cart_items set cart_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$s$,'42501','cannot transfer cart items');
select pg_temp.expect_error($s$insert into public.cart_items(cart_id,product_id,quantity) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','table-lamp',1)$s$,'42501','inactive product cannot be added');
select pg_temp.expect_error($s$insert into public.cart_items(cart_id,product_id,quantity) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','amber-candle',1)$s$,'23505','duplicate cart product rejected');
update public.cart_items set quantity=99 where cart_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
delete from public.cart_items where cart_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
delete from public.carts where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select pg_temp.expect_error('insert into public.orders default values','42501','browser order insert denied');
select pg_temp.expect_error('update public.orders set total_cents=0','42501','browser order update denied');
select pg_temp.expect_error('delete from public.orders','42501','browser order delete denied');
select pg_temp.expect_error('insert into public.order_items default values','42501','browser order item insert denied');
select pg_temp.expect_error('update public.order_items set unit_price_cents=0','42501','browser paid-price alteration denied');
select pg_temp.expect_error('delete from public.order_items','42501','browser order item delete denied');
select pg_temp.expect_error('update public.products set price_cents=0','42501','browser catalog mutation denied');
delete from public.cart_items where product_id='arch-vase';
select pg_temp.assert((select count(*) = 1 from public.cart_items), 'own cart item removal allowed');
reset role;

select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
select pg_temp.assert((select count(*) = 1 from public.carts), 'user B cart survives cross-user deletion attempt');
select pg_temp.assert((select full_name='User B' from public.profiles), 'user B profile survives cross-user update');
select pg_temp.assert((select count(*) = 1 and min(quantity)=1 from public.cart_items), 'user B item survives cross-user mutation attempts');
select pg_temp.assert((select count(*) = 1 and min(user_id::text)='22222222-2222-4222-8222-222222222222' from public.orders), 'user B sees only own order');
select pg_temp.assert((select count(*) = 1 from public.order_items), 'user B sees only own order items');
delete from public.carts;
select pg_temp.assert((select count(*) = 0 from public.cart_items), 'own cart delete cascades to items');
insert into public.carts(user_id) values ('22222222-2222-4222-8222-222222222222');
select pg_temp.assert((select count(*) = 1 from public.carts), 'own cart creation allowed');
reset role;

-- Trusted-role/schema checks are separate from browser ownership tests.
-- This temporary factory only exists inside the rollback transaction.
create function pg_temp.make_order(overrides jsonb default '{}'::jsonb, include_items boolean default true)
returns uuid language plpgsql as $$
declare
  payload jsonb;
  new_id uuid;
begin
  payload := jsonb_build_object(
    'user_id','11111111-1111-4111-8111-111111111111',
    'full_name','Test Recipient','customer_email','fixture@example.invalid',
    'customer_phone','+23288790011','fulfilment_method','pickup',
    'pickup_location','Lumley, Freetown','payment_provider','afri',
    'payment_status','pending','currency','NLE',
    'subtotal_cents',25000,'delivery_fee_cents',0,'total_cents',25000,
    'status','placed'
  ) || overrides;
  insert into public.orders(user_id,full_name,customer_email,customer_phone,
    fulfilment_method,pickup_location,delivery_street_address,delivery_area,
    delivery_city,delivery_instructions,payment_provider,payment_status,
    payment_phone_last4,paid_at,currency,subtotal_cents,delivery_fee_cents,total_cents,status)
  values ((payload->>'user_id')::uuid,payload->>'full_name',payload->>'customer_email',
    payload->>'customer_phone',payload->>'fulfilment_method',payload->>'pickup_location',
    payload->>'delivery_street_address',payload->>'delivery_area',payload->>'delivery_city',
    payload->>'delivery_instructions',payload->>'payment_provider',payload->>'payment_status',
    payload->>'payment_phone_last4',(payload->>'paid_at')::timestamptz,payload->>'currency',
    (payload->>'subtotal_cents')::integer,(payload->>'delivery_fee_cents')::integer,
    (payload->>'total_cents')::integer,payload->>'status') returning id into new_id;
  if include_items then
    insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents)
    values(new_id,'amber-candle','Historical candle name',1,25000);
  end if;
  set constraints all immediate;
  set constraints all deferred;
  return new_id;
end;
$$;

select pg_temp.assert((select bool_and(currency='NLE') from public.products where active), 'all active products are NLE');
select pg_temp.expect_error($s$update public.products set currency='USD' where active$s$,'23514','active USD products denied');
select pg_temp.expect_error($s$insert into public.profiles(id) values ('44444444-4444-4444-8444-444444444444')$s$,'23503','profile requires real auth identity');
select pg_temp.expect_error($s$update public.profiles set phone='76521208'$s$,'23514','profile phone must be normalized');
select pg_temp.expect_error($s$update public.profiles set full_name='  '$s$,'23514','blank profile name denied');
select pg_temp.assert((select bool_and(order_reference ~ '^LH-[A-F0-9]{16}$') and count(distinct order_reference)=2 from public.orders), 'human references generated uniquely');
select pg_temp.assert((select payment_status='pending' from public.orders where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'placement defaults to pending payment');
select pg_temp.assert((select delivery_street_address is null and delivery_area is null and delivery_city is null and delivery_fee_cents=0 from public.orders where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'pickup requires no fake delivery address and is free');
select pg_temp.expect_error($s$select pg_temp.make_order('{
  "fulfilment_method":"delivery","pickup_location":null
}'::jsonb)$s$,'23514','delivery requires address snapshot');
select pg_temp.expect_error($s$select pg_temp.make_order('{
  "fulfilment_method":"delivery","pickup_location":null,
  "delivery_street_address":"Test landmark","delivery_area":"Test area","delivery_city":"Bo"
}'::jsonb)$s$,'23514','delivery outside initial service city denied');
select pg_temp.expect_error($s$select pg_temp.make_order('{"delivery_street_address":"Meaningless pickup address"}'::jsonb)$s$,'23514','pickup cannot contain misleading delivery address');
select pg_temp.expect_error($s$select pg_temp.make_order('{"delivery_fee_cents":100,"total_cents":25100}'::jsonb)$s$,'23514','pickup cannot charge delivery fee');
select pg_temp.expect_error($s$select pg_temp.make_order('{"currency":"USD"}'::jsonb)$s$,'23514','orders cannot use USD');
select pg_temp.expect_error($s$select pg_temp.make_order('{"status":"fulfilled"}'::jsonb)$s$,'23514','obsolete order status rejected');
select pg_temp.expect_error($s$select pg_temp.make_order('{"payment_status":"verified"}'::jsonb)$s$,'23514','unsupported payment status rejected');
select pg_temp.expect_error($s$select pg_temp.make_order('{"payment_provider":"card"}'::jsonb)$s$,'23514','unsupported payment provider rejected');
select pg_temp.expect_error($s$select pg_temp.make_order('{"payment_phone_last4":"+23288790011"}'::jsonb)$s$,'23514','full payer phone cannot be stored as display suffix');
select pg_temp.expect_error($s$select pg_temp.make_order('{"payment_status":"paid"}'::jsonb)$s$,'23514','paid status requires trusted timestamp');
select pg_temp.expect_error($s$select pg_temp.make_order('{"paid_at":"2026-10-02T00:00:00Z"}'::jsonb)$s$,'23514','unpaid order cannot carry paid timestamp');
select pg_temp.expect_error($s$select pg_temp.make_order('{"status":"out_for_delivery"}'::jsonb)$s$,'23514','pickup cannot be out for delivery');
select pg_temp.expect_error($s$update public.orders set status='ready_for_pickup' where fulfilment_method='delivery'$s$,'23514','delivery cannot be ready for pickup');
select pg_temp.expect_error($s$select pg_temp.make_order('{}'::jsonb,false)$s$,'23514','deferred constraint prevents orders without items');
select pg_temp.expect_error($s$select pg_temp.make_order('{"subtotal_cents":50000,"total_cents":50000}'::jsonb)$s$,'23514','deferred constraint prevents mismatched line subtotal');
select pg_temp.expect_error($s$update public.orders set delivery_street_address='Changed history' where fulfilment_method='delivery'$s$,'23514','trusted updates cannot accidentally rewrite delivery snapshot');
select pg_temp.expect_error($s$update public.orders set full_name='Changed history'$s$,'23514','trusted updates cannot rewrite customer snapshot');
select pg_temp.expect_error($s$update public.order_items set unit_price_cents=30000$s$,'23514','trusted updates cannot rewrite paid-price snapshot');
select pg_temp.expect_error($s$update public.order_items set product_name='Changed history'$s$,'23514','trusted updates cannot rewrite product-name snapshot');

-- All supported status values are executable; fulfilment-specific states tested above.
do $$
declare next_status text;
begin
  foreach next_status in array array['placed','confirmed','processing','ready_for_pickup','completed','cancelled'] loop
    update public.orders set status=next_status where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  end loop;
  update public.orders set status='out_for_delivery' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  foreach next_status in array array['pending','awaiting_payment','failed'] loop
    update public.orders set payment_status=next_status where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  end loop;
end;
$$;
select 'PASS: all supported order/payment statuses fit the appropriate fulfilment';
set local role service_role;
update public.orders set payment_status='paid',paid_at=now(),payment_reference='isolated-test-reference'
where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.assert((select payment_status='paid' and paid_at is not null from public.orders where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'trusted role can record verified payment separately from order status');
update public.order_confirmation_jobs set status='failed',attempts=1;
select pg_temp.assert((select count(*)=2 from public.orders), 'email failure does not erase durable orders');
select pg_temp.expect_error($s$insert into public.order_confirmation_jobs(order_id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$s$,'23505','one confirmation job per order');
update public.order_confirmation_jobs set status='sent',sent_at=now(),attempts=2;
select pg_temp.assert((select bool_and(status='sent' and sent_at is not null) from public.order_confirmation_jobs), 'trusted email job records retry and sent state');
reset role;

select pg_temp.expect_error('update public.products set price_cents=-1','23514','negative product price rejected');
select pg_temp.expect_error('update public.orders set total_cents=1','23514','inconsistent order total rejected');
select pg_temp.expect_error('update public.order_items set unit_price_cents=-1','23514','negative paid price rejected');
select pg_temp.expect_error($s$delete from auth.users where id='11111111-1111-4111-8111-111111111111'$s$,'23503','account deletion cannot silently erase orders');
update public.products set price_cents=9999,name='Renamed product' where id='amber-candle';
select pg_temp.assert((select bool_and(unit_price_cents=25000 and product_name='Historical candle name') from public.order_items), 'catalog changes preserve historical snapshots');
update public.products set active=false where id='amber-candle';
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select pg_temp.assert((select count(*)=0 from public.products where id='amber-candle'), 'inactive purchased product hidden from current catalog');
select pg_temp.assert((select count(*)=1 and bool_and(unit_price_cents=25000) from public.order_items), 'inactive product does not hide historical item');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select pg_temp.assert((select count(*)=0 from public.orders), 'missing identity cannot read history');
reset role;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select pg_temp.assert((select count(*)=1 from public.orders), 'restored SQL identity reads same durable order');
reset role;
delete from public.products where id='amber-candle';
select pg_temp.assert((select count(*)=2 and bool_and(product_id is null and unit_price_cents=25000) from public.order_items), 'product deletion preserves order history');
select pg_temp.assert((select count(*)=2 from public.orders), 'cart deletion never deletes orders');
insert into auth.users(id) values('33333333-3333-4333-8333-333333333333');
insert into public.profiles(id) values('33333333-3333-4333-8333-333333333333');
insert into public.carts(user_id) values('33333333-3333-4333-8333-333333333333');
delete from auth.users where id='33333333-3333-4333-8333-333333333333';
select pg_temp.assert(not exists(select 1 from public.profiles where id='33333333-3333-4333-8333-333333333333')
  and not exists(select 1 from public.carts where user_id='33333333-3333-4333-8333-333333333333'),
  'account without orders cascades only mutable profile/cart');
set constraints all immediate;
rollback;
