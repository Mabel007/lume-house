-- Isolated rollback fixture proving expand migration preserves existing history.
begin;
insert into auth.users(id) values('99999999-9999-4999-8999-999999999999');
insert into public.orders(id,user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents)
values('99999999-aaaa-4999-8999-999999999999','99999999-9999-4999-8999-999999999999','Legacy fixture','fixture@example.invalid','+23276521208','pickup','Lumley, Freetown','orange','NLE',25000,0,25000);
insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents)
values('99999999-aaaa-4999-8999-999999999999','amber-candle','Actual historical name',1,25000);
set constraints all immediate;
create temporary table before_variant_orders as select to_jsonb(o) as value from public.orders o;
create temporary table before_variant_items as select to_jsonb(i) as value from public.order_items i;
