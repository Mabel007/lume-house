do $$
begin
  if not exists (select 1 from public.products where id='00000000-0000-4000-8000-000000000001'
      and not active and currency='USD' and price_cents=1800) then
    raise exception 'Legacy product must retain its currency/price and be archived';
  end if;
  if not exists (select 1 from public.cart_items where
      product_id='00000000-0000-4000-8000-000000000001' and quantity=2) then
    raise exception 'Legacy cart reference must survive UUID-to-text conversion';
  end if;
end;
$$;
select 'PASS: legacy UUID product/cart references preserved; USD archived without conversion';
rollback;
