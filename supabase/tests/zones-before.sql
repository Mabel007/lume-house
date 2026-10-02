-- LOCAL ONLY. Exercise additive migration against actual pre-zone history.
begin;
create function pg_temp.assert(ok boolean, label text) returns text language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if;
 return 'PASS: '||label;
end; $$;
create function pg_temp.expect_error(statement text, label text) returns text language plpgsql as $$
begin
 begin execute statement;
 exception when check_violation then return 'PASS: '||label; end;
 raise exception 'FAIL: expected rejection for %',label;
end; $$;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111');
insert into public.orders(id,user_id,full_name,customer_email,customer_phone,fulfilment_method,
 delivery_street_address,delivery_area,delivery_city,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
 'Historical Customer','fixture@example.invalid','+23276521208','delivery','Test landmark','Lumley','Freetown','orange','NLE',25000,5000,30000);
insert into public.order_items(order_id,product_name,quantity,unit_price_cents)
values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Historical candle',1,25000);
set constraints all immediate;
set constraints all deferred;
