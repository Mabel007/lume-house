do $$
begin
  if exists((select value from before_variant_orders) except (select to_jsonb(o) from public.orders o))
    or exists((select value from before_variant_items) except (select to_jsonb(i)-array['variant_id','variant_sku','variant_options','variant_currency'] from public.order_items i))
    or exists(select 1 from public.order_items where variant_id is not null or variant_sku is not null or variant_options is not null or variant_currency is not null) then
    raise exception 'Expand migration changed historical order data';
  end if;
end;
$$;
rollback;
select 'PASS: variant expansion preserves exact legacy order/items without fictional backfill';
