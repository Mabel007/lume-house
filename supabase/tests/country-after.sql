do $$begin
 if exists(select 1 from public.orders where country_code is not null) then
   raise exception 'Country migration backfilled a historical delivery country';
 end if;
 if exists((select value from before_country_orders) except (select to_jsonb(o)-'country_code' from public.orders o))
   or exists((select to_jsonb(o)-'country_code' from public.orders o) except (select value from before_country_orders))
   or exists((select value from before_country_items) except (select to_jsonb(i) from public.order_items i))
   or exists((select to_jsonb(i) from public.order_items i) except (select value from before_country_items))
   or exists((select value from before_country_jobs) except (select to_jsonb(j) from public.order_confirmation_jobs j))
   or exists((select to_jsonb(j) from public.order_confirmation_jobs j) except (select value from before_country_jobs)) then
   raise exception 'Country migration rewrote existing order history';
 end if;
end;$$;
do $$begin
 begin
  insert into public.orders(user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents)
  values('88000000-0000-4000-8000-000000000001','Country-free new fixture','fixture@example.invalid','+23276521208','pickup','Lumley, Freetown','orange','NLE',100,0,100);
  raise exception 'FAIL: a new order without a country was accepted';
 exception when check_violation then
  if sqlerrm <> 'New orders require delivery country SL' then raise;end if;
 end;
end;$$;
select set_config('request.jwt.claim.sub','88000000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$begin
 begin
  perform public.place_variant_order('88000000-0000-4000-8000-000000000004',
   '{"full_name":"New country-free fixture","email":"fixture@example.invalid","contact_phone":"+23276521208","payment_phone":"+23276521209","provider":"orange","fulfilment":"pickup"}','[]');
  raise exception 'FAIL: country-free placement was accepted';
 exception when raise_exception then
  if sqlerrm <> 'INVALID_DELIVERY_COUNTRY' then raise;end if;
 end;
end;$$;
-- Valid replay of a pre-migration request remains owner-scoped and keeps NULL history.
select public.place_variant_order('88000000-0000-4000-8000-000000000003','{"country_code":"SL"}','[]');
do $$begin
 if (select country_code from public.orders where checkout_request_id='88000000-0000-4000-8000-000000000003') is not null then
   raise exception 'Historical replay invented a country snapshot';
 end if;
 if (select count(*) from public.orders)<>1 then raise exception 'Historical replay created another order';end if;
end;$$;
reset role;
-- A privileged (table-owner) update cannot backfill a historical NULL snapshot.
do $$declare before_row jsonb;after_row jsonb;begin
 select value into strict before_row from before_country_orders
  where value->>'checkout_request_id'='88000000-0000-4000-8000-000000000003';
 begin
  update public.orders set country_code='SL'
   where checkout_request_id='88000000-0000-4000-8000-000000000003';
  raise exception 'FAIL: privileged update backfilled a historical country';
 exception when check_violation then
  if sqlerrm <> 'Historical delivery country is immutable' then raise;end if;
 end;
 if (select country_code from public.orders where checkout_request_id='88000000-0000-4000-8000-000000000003') is not null then
  raise exception 'Historical country snapshot changed after a rejected backfill';
 end if;
 select (to_jsonb(o)-'country_code') into strict after_row from public.orders o
  where checkout_request_id='88000000-0000-4000-8000-000000000003';
 if after_row is distinct from before_row then raise exception 'Historical order changed after a rejected country backfill';end if;
 if (select count(*) from public.orders)<>1 then raise exception 'Rejected backfill changed the order count';end if;
end;$$;
select 'PASS: privileged updates cannot backfill historical country snapshots';
select set_config('request.jwt.claim.sub','88000000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.orders) then raise exception 'Cross-account historical order leaked';end if;
end;$$;
reset role;
do $$begin
 if (select count(*) from public.orders)<>1 or (select count(*) from public.order_confirmation_jobs)<>1 then
   raise exception 'Historical recovery duplicated order or job';
 end if;
end;$$;
rollback;
select 'PASS: country migration preserves NULL history and owner-scoped recovery';
