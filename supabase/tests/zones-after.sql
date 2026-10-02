select pg_temp.assert((select delivery_zone_id is null and delivery_zone_label is null and total_cents=30000 from public.orders), 'additive zone migration preserves legacy order');
select pg_temp.assert((select count(*)=7 from pg_class where relnamespace='public'::regnamespace and relrowsecurity), 'zone migration preserves seven RLS tables');
select pg_temp.assert((select count(*)=13 from pg_policies where schemaname='public'), 'zone migration preserves ownership policies');
select pg_temp.assert(not has_any_column_privilege('authenticated','public.orders','UPDATE'), 'zone columns not browser editable');
insert into public.orders(user_id,full_name,customer_email,customer_phone,fulfilment_method,
 delivery_street_address,delivery_area,delivery_city,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents,delivery_zone_id,delivery_zone_label)
values('11111111-1111-4111-8111-111111111111','Test Customer','fixture@example.invalid','+23230521208','delivery',
 'Test landmark','Aberdeen','Freetown','afri','NLE',25000,5000,30000,'zone-2','Lumley to Congo Cross, including Aberdeen');
insert into public.order_items(order_id,product_name,quantity,unit_price_cents)
select id,'Candle',1,25000 from public.orders where delivery_zone_id='zone-2';
select pg_temp.assert((select count(*)=1 from public.orders where delivery_zone_id='zone-2'), 'new order retains coverage snapshot and general phone format');
select pg_temp.expect_error($s$update public.orders set delivery_zone_label='Changed'$s$, 'zone label immutable');
select pg_temp.expect_error($s$update public.orders set delivery_zone_id='zone-3'$s$, 'zone ID immutable');
select pg_temp.expect_error($s$update public.orders set total_cents=1$s$, 'existing financial guard remains');
-- INSERT checks are independent of update-trigger protections.
select pg_temp.expect_error($s$insert into public.orders(user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents,delivery_zone_id,delivery_zone_label) values('11111111-1111-4111-8111-111111111111','Test','fixture@example.invalid','+23276521208','pickup','Lumley','orange','NLE',0,0,0,'zone-1','Goderich to Lumley')$s$, 'pickup rejects delivery zone');
select pg_temp.expect_error($s$insert into public.orders(user_id,full_name,customer_email,customer_phone,fulfilment_method,delivery_street_address,delivery_area,delivery_city,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents,delivery_zone_id) values('11111111-1111-4111-8111-111111111111','Test','fixture@example.invalid','+23276521208','delivery','Street','Lumley','Freetown','orange','NLE',0,0,0,'zone-1')$s$, 'zone pair required together');
select pg_temp.expect_error($s$insert into public.orders(user_id,full_name,customer_email,customer_phone,fulfilment_method,delivery_street_address,delivery_area,delivery_city,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents,delivery_zone_id,delivery_zone_label) values('11111111-1111-4111-8111-111111111111','Test','fixture@example.invalid','+23276521208','delivery','Street','Lumley','Freetown','orange','NLE',0,0,0,'Bad ID','Zone')$s$, 'zone slug constraint');
select pg_temp.expect_error($s$insert into public.orders(user_id,full_name,customer_email,customer_phone,fulfilment_method,delivery_street_address,delivery_area,delivery_city,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents,delivery_zone_id,delivery_zone_label) values('11111111-1111-4111-8111-111111111111','Test','fixture@example.invalid','+23276521208','delivery','Street','Lumley','Freetown','orange','NLE',0,0,0,'zone-1',' ')$s$, 'blank zone label constraint');
set constraints all immediate;
rollback;
