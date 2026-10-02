-- Original schema with a historical order: never guess its new semantics.
begin;
insert into auth.users(id) values ('33333333-3333-4333-8333-333333333333');
insert into public.orders(user_id,first_name,last_name,email,address_line1,city,region,
  postal_code,country,currency,subtotal_cents,delivery_fee_cents,total_cents)
values ('33333333-3333-4333-8333-333333333333','Test','Fixture','fixture@example.invalid',
  'Old address','Old city','Old region','Old postal','Old country','USD',1800,500,2300);
