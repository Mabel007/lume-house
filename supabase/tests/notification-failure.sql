-- Disposable, network-disabled harness only. No hosted fixtures or email sends.
\set ON_ERROR_STOP on
\if :{?LUME_DISPOSABLE_TEST}
begin;
create function pg_temp.assert(ok boolean, label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; return 'PASS: ' || label; end; $$;
create function pg_temp.checkout() returns jsonb language sql as $$
select '{"full_name":"SQL fixture","email":"fixture@example.invalid","contact_phone":"+23276521208","payment_phone":"+23276521209","provider":"orange","fulfilment":"pickup","country_code":"SL"}'::jsonb; $$;
create function pg_temp.quote() returns jsonb language sql as $$
select jsonb_build_array(jsonb_build_object('product_id',product_id,'variant_id',id,'quantity',2,'unit_price',price_cents))
from public.product_variants where id='default:table-lamp'; $$;

insert into auth.users(id) values('77777777-7777-4777-8777-777777777777');
select public.adjust_variant_inventory('default:table-lamp',3,'Disposable notification fixture','77777777-7777-4777-8777-777777777770');
update public.product_variants set inventory_policy='tracked' where id='default:table-lamp';
select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);
set local role authenticated;
select public.change_variant_cart('default:table-lamp','add',2,null,'77777777-7777-4777-8777-777777777771');
reset role;
create temporary table notification_cart_before on commit drop as
select to_jsonb(c) as cart, to_jsonb(ci) as item from public.carts c
join public.variant_cart_items ci on ci.cart_id=c.id where c.user_id=auth.uid();

create function pg_temp.fail_notification() returns trigger language plpgsql as $$
begin raise exception 'TEST_NOTIFICATION_INSERT_FAILURE' using errcode='P0001'; end; $$;
create trigger test_notification_failure before insert on public.customer_notifications
for each row execute function pg_temp.fail_notification();
set local role authenticated;
do $$
begin
  begin
    perform public.place_variant_order('77777777-7777-4777-8777-777777777772',pg_temp.checkout(),pg_temp.quote());
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'TEST_NOTIFICATION_INSERT_FAILURE' then raise; end if;
    raise notice 'PASS: exact notification insertion failure propagated';
    return;
  end;
  raise exception 'FAIL: checkout unexpectedly succeeded';
end; $$;
reset role;
select pg_temp.assert((select count(*)=0 from public.orders),'notification failure leaves no order');
select pg_temp.assert((select count(*)=0 from public.order_items),'notification failure leaves no items');
select pg_temp.assert((select count(*)=0 from public.order_confirmation_jobs),'notification failure leaves no confirmation job');
select pg_temp.assert((select count(*)=0 from public.customer_notifications),'notification failure leaves no notification');
select pg_temp.assert((select on_hand=3 and allocated=0 from public.variant_inventory where variant_id='default:table-lamp')
  and not exists(select 1 from public.inventory_ledger where event='order_allocation'),'notification failure preserves stock and allocation ledger');
select pg_temp.assert((select count(*)=1 from public.carts c join public.variant_cart_items ci on ci.cart_id=c.id
  join notification_cart_before b on b.cart=to_jsonb(c) and b.item=to_jsonb(ci)),'notification failure preserves exact cart and item state');

drop trigger test_notification_failure on public.customer_notifications;
set local role authenticated;
select public.place_variant_order('77777777-7777-4777-8777-777777777772',pg_temp.checkout(),pg_temp.quote())->>'id' as oid \gset
select pg_temp.assert(public.place_variant_order('77777777-7777-4777-8777-777777777772',pg_temp.checkout(),pg_temp.quote())->>'id'=:'oid','successful same-key retry remains idempotent');
reset role;
select pg_temp.assert((select count(*)=1 from public.orders) and
  (select status='placed' and payment_status='awaiting_payment' from public.orders where id=:'oid'),'retry creates exactly one awaiting-payment order');
select pg_temp.assert((select count(*)=1 from public.order_items) and
  (select quantity=2 and variant_id='default:table-lamp' from public.order_items where order_id=:'oid'),'retry creates exactly one consistent item snapshot');
select pg_temp.assert((select count(*)=1 from public.order_confirmation_jobs) and
  (select status='pending' and attempts=0 from public.order_confirmation_jobs where order_id=:'oid'),'retry creates exactly one unsent confirmation job');
select pg_temp.assert((select count(*)=1 from public.customer_notifications) and
  (select customer_id=auth.uid() and event_type='order_placed' from public.customer_notifications where order_id=:'oid'),'retry creates exactly one owned placement notification');
select pg_temp.assert((select count(*)=0 from public.variant_cart_items) and
  (select on_hand=3 and allocated=2 from public.variant_inventory where variant_id='default:table-lamp') and
  (select count(*)=1 from public.inventory_ledger where order_id=:'oid' and event='order_allocation' and allocated_delta=2),'retry converts cart and allocates stock exactly once');

create trigger test_notification_status_failure before insert on public.customer_notifications
for each row execute function pg_temp.fail_notification();
do $$
declare
  v_oid uuid;
begin
  select id into v_oid from public.orders where checkout_request_id = '77777777-7777-4777-8777-777777777772';
  begin
    update public.orders set status = 'confirmed' where id = v_oid;
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'TEST_NOTIFICATION_INSERT_FAILURE' then raise; end if;
    raise notice 'PASS: exact notification failure on status update propagated';
    return;
  end;
  raise exception 'FAIL: order status update unexpectedly succeeded';
end; $$;
select pg_temp.assert((select status='placed' from public.orders where id=:'oid'),'notification failure rolls back order status update');
select pg_temp.assert((select count(*)=0 from public.customer_notifications where order_id=:'oid' and event_type='order_confirmed'),'notification failure leaves no confirmed notification');

drop trigger test_notification_status_failure on public.customer_notifications;
update public.orders set status='confirmed' where id=:'oid';
select pg_temp.assert((select status='confirmed' from public.orders where id=:'oid'),'normal status update succeeds after dropping failure trigger');
select pg_temp.assert((select count(*)=1 from public.customer_notifications where order_id=:'oid' and event_type='order_confirmed'),'normal status update creates confirmed notification');
rollback;
do $$ begin
  if exists(select 1 from auth.users where id='77777777-7777-4777-8777-777777777777')
    or exists(select 1 from public.orders where checkout_request_id='77777777-7777-4777-8777-777777777772')
    or exists(select 1 from public.inventory_ledger where operation_id='77777777-7777-4777-8777-777777777770')
    or exists(select 1 from pg_trigger where tgname in ('test_notification_failure','test_notification_status_failure')) then
    raise exception 'FAIL: notification failure fixtures persisted';
  end if;
end; $$;
select 'PASS: notification failure fixtures and injected trigger rolled back';
\else
do $$ begin raise exception 'Run through the disposable SQL harness only'; end; $$;
\endif
