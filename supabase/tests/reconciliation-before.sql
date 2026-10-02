-- Isolated rollback test only: legacy UUID catalog/cart survives forward change.
begin;
insert into auth.users(id) values ('33333333-3333-4333-8333-333333333333');
insert into public.products(id,name,description,price_cents,currency,image_path,category)
values ('00000000-0000-4000-8000-000000000001','Legacy item','Old price, not converted',1800,'USD','/images/mug.svg','Legacy');
insert into public.carts(id,user_id)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','33333333-3333-4333-8333-333333333333');
insert into public.cart_items(cart_id,product_id,quantity)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','00000000-0000-4000-8000-000000000001',2);
