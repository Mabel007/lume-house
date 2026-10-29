-- LOCAL ONLY. Actual fixture counts exist solely in this rolled-back test.
begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end;$$;
create function pg_temp.error(statement text,expected text) returns text language plpgsql as $$
begin begin execute statement;exception when others then if sqlerrm<>expected then raise;end if;return 'PASS: rejected '||expected;end;raise exception 'FAIL: expected %',expected;end;$$;
create function pg_temp.denied(statement text) returns text language plpgsql as $$
begin begin execute statement;exception when insufficient_privilege then return 'PASS: permission denied';end;raise exception 'FAIL: expected permission denial';end;$$;
create function pg_temp.checkout() returns jsonb language sql as $$
select '{"full_name":"Local inventory fixture","email":"fixture@example.invalid","contact_phone":"+23276521208","payment_phone":"+23276521209","provider":"orange","fulfilment":"pickup","country_code":"SL"}'::jsonb;$$;
create function pg_temp.quote() returns jsonb language sql as $$
select coalesce(jsonb_agg(jsonb_build_object('product_id',v.product_id,'variant_id',v.id,'quantity',ci.quantity,'unit_price',v.price_cents) order by v.id),'[]')
from public.variant_cart_items ci join public.product_variants v on v.id=ci.variant_id
join public.carts c on c.id=ci.cart_id where c.user_id=auth.uid();$$;
select pg_temp.assert((select count(*)=0 from public.variant_inventory),'migration creates no invented stock');
select pg_temp.assert((select count(*)=20 from public.product_variants where inventory_policy='untracked'),'twenty defaults remain untracked');
select pg_temp.assert((select bool_and(available) from public.catalogue_variant_availability()),'untracked availability remains compatible');
select pg_temp.error($q$update public.product_variants set inventory_policy='tracked' where id='default:amber-candle'$q$,'INVENTORY_NOT_READY');
set local role anon;
select pg_temp.denied('select * from public.variant_inventory');
select pg_temp.denied('select * from public.inventory_ledger');
select pg_temp.denied($q$select public.adjust_variant_inventory('default:amber-candle',5,'fixture','10000000-0000-4000-8000-000000000001')$q$);
select pg_temp.assert((select count(*)=20 from public.catalogue_variant_availability()),'public availability exposes only active catalogue');
reset role;
set local role service_role;
select public.adjust_variant_inventory('default:amber-candle',5,'Local test initial count','10000000-0000-4000-8000-000000000001');
select public.adjust_variant_inventory('default:amber-candle',5,'Local test initial count','10000000-0000-4000-8000-000000000001');
select pg_temp.assert((select on_hand=5 and allocated=0 from public.variant_inventory),'adjustment replay does not duplicate stock');
select pg_temp.denied('update public.variant_inventory set on_hand=99');
select pg_temp.denied('insert into public.inventory_ledger default values');
select pg_temp.error($q$select public.adjust_variant_inventory('default:amber-candle',6,'Local test initial count','10000000-0000-4000-8000-000000000001')$q$,'INVALID_INVENTORY_ADJUSTMENT');
select pg_temp.error($q$select public.adjust_variant_inventory('default:amber-candle',-6,'Local test bad count','10000000-0000-4000-8000-000000000002')$q$,'INVALID_INVENTORY_QUANTITY');
reset role;
update public.product_variants set inventory_policy='tracked' where id='default:amber-candle';
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select pg_temp.denied('select * from public.variant_inventory');
select pg_temp.denied($q$select public.adjust_variant_inventory('default:amber-candle',99,'untrusted','10000000-0000-4000-8000-000000000003')$q$);
select public.change_variant_cart('default:amber-candle','add',3,null,'20000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.assert((select allocated=0 from public.variant_inventory),'Bag does not reserve stock');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
select public.change_variant_cart('default:amber-candle','add',3,null,'20000000-0000-4000-8000-000000000002');
reset role;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select public.place_variant_order('30000000-0000-4000-8000-000000000001',pg_temp.checkout(),pg_temp.quote());
select public.place_variant_order('30000000-0000-4000-8000-000000000001','{"country_code":"SL"}','[]');
reset role;
select pg_temp.assert((select allocated=3 and on_hand=5 from public.variant_inventory),'tracked order allocates trusted quantity without decrementing physical on-hand');
select pg_temp.assert((select count(*)=1 from public.inventory_ledger where event='order_allocation'),'order retry does not allocate twice');
select pg_temp.assert((select status='placed' and payment_status='awaiting_payment' from public.orders),'allocation is not payment confirmation');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
select pg_temp.error($q$select public.place_variant_order('30000000-0000-4000-8000-000000000002',pg_temp.checkout(),pg_temp.quote())$q$,'OUT_OF_STOCK');
select pg_temp.assert((select quantity=3 from public.variant_cart_items),'oversell rejection retains other owner Bag');
select public.change_variant_cart('default:amber-candle','set',2,3,'20000000-0000-4000-8000-000000000003');
select public.place_variant_order('30000000-0000-4000-8000-000000000002',pg_temp.checkout(),pg_temp.quote());
select pg_temp.error($q$select public.change_variant_cart('default:amber-candle','add',1,null,'20000000-0000-4000-8000-000000000004')$q$,'PRODUCT_UNAVAILABLE');
reset role;
select pg_temp.assert((select allocated=5 and on_hand=5 from public.variant_inventory),'available finite stock cannot become negative');
select pg_temp.assert((select not available from public.catalogue_variant_availability() where variant_id='default:amber-candle'),'authoritative boolean becomes unavailable at full allocation');
select pg_temp.error($q$update public.inventory_ledger set allocated_after=0 where event='order_allocation'$q$,'Inventory history is immutable');
do $$begin
  begin update public.variant_inventory set on_hand=-1;
  exception when check_violation then return;end;
  raise exception 'FAIL: negative physical stock accepted';
end;$$;
select 'PASS: database constraint rejects negative physical stock';
do $$begin
  begin update public.variant_inventory set allocated=on_hand+1;
  exception when check_violation then return;end;
  raise exception 'FAIL: overallocated stock accepted';
end;$$;
select 'PASS: database constraint rejects overallocated stock';
set local role service_role;
select pg_temp.error($q$select public.adjust_variant_inventory('default:amber-candle',-1,'Below allocations','10000000-0000-4000-8000-000000000004')$q$,'INVALID_INVENTORY_QUANTITY');
select public.adjust_variant_inventory('default:amber-candle',2,'Local test replenishment','10000000-0000-4000-8000-000000000005');
reset role;
create function pg_temp.fail_conversion() returns trigger language plpgsql as $$begin raise exception 'TEST_INVENTORY_ROLLBACK';end;$$;
create trigger test_inventory_rollback before delete on public.variant_cart_items for each row execute function pg_temp.fail_conversion();
set local role authenticated;
select public.change_variant_cart('default:amber-candle','add',2,null,'20000000-0000-4000-8000-000000000005');
select pg_temp.error($q$select public.place_variant_order('30000000-0000-4000-8000-000000000003',pg_temp.checkout(),pg_temp.quote())$q$,'TEST_INVENTORY_ROLLBACK');
reset role;
select pg_temp.assert((select allocated=5 and on_hand=7 from public.variant_inventory),'conversion failure rolls back allocation');
select pg_temp.assert((select count(*)=2 from public.inventory_ledger where event='order_allocation'),'conversion failure rolls back allocation ledger');
select pg_temp.assert((select count(*)=2 from public.orders),'conversion failure rolls back new order');
select pg_temp.assert((select count(*)=2 from public.order_confirmation_jobs),'conversion failure rolls back durable job');
update public.product_variants set active=false where id='default:amber-candle';
set local role authenticated;
select pg_temp.error($q$select public.place_variant_order('30000000-0000-4000-8000-000000000003',pg_temp.checkout(),pg_temp.quote())$q$,'PRODUCT_UNAVAILABLE');
reset role;
select pg_temp.assert((select count(*)=0 from public.catalogue_variant_availability() where variant_id='default:amber-candle'),'inactive variant is never public available');
rollback;
select 'PASS: inventory fixtures rolled back';
