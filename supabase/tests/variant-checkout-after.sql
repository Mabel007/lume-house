do $$ begin
  if exists((select value from before_variant_orders) except(select to_jsonb(o) from public.orders o))
    or exists((select value from before_variant_items) except(select to_jsonb(i) from public.order_items i))
    or exists((select value from before_cart_items) except(select to_jsonb(ci) from public.cart_items ci))
    or exists(select 1 from public.carts where cart_version<>1) then raise exception 'Checkout expansion rewrote legacy data'; end if;
end;$$;
rollback;
select 'PASS: checkout expansion preserves legacy cart and historical order data';
