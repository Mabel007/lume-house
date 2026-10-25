do $$begin
 if exists(select 1 from public.orders where checkout_source<>'bag')
 or exists((select value from before_source_orders) except (select to_jsonb(o)-'checkout_source' from public.orders o))
 or exists((select value from before_source_items) except (select to_jsonb(i) from public.order_items i)) then
   raise exception 'Source migration rewrote existing order history';
 end if;
end;$$;
select set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.place_variant_order('99000000-0000-4000-8000-000000000003','{}','[]');
reset role;
do $$begin if (select count(*) from public.orders)<>1 or (select count(*) from public.order_confirmation_jobs)<>1 then raise exception 'Existing Bag replay duplicated after migration';end if;end;$$;
rollback;
select 'PASS: populated orders gain only bag source; historical fields and old request replay preserved';
