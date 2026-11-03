-- Rollback-only populated history at the pre-02900 boundary.
begin;
insert into auth.users(id) values
 ('88000000-0000-4000-8000-000000000001'),
 ('88000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','88000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.change_variant_cart('default:amber-candle','add',1,null,'88000000-0000-4000-8000-000000000002');
select public.place_variant_order('88000000-0000-4000-8000-000000000003',
 '{"full_name":"Historical local order","email":"fixture@example.invalid","contact_phone":"+23276521208","payment_phone":"+23276521209","provider":"orange","fulfilment":"pickup"}',
 (select jsonb_build_array(jsonb_build_object('product_id',product_id,'variant_id',id,'quantity',1,'unit_price',price_cents)) from public.product_variants where id='default:amber-candle'));
reset role;
create temp table before_country_orders as select to_jsonb(o) value from public.orders o;
create temp table before_country_items as select to_jsonb(i) value from public.order_items i;
create temp table before_country_jobs as select to_jsonb(j) value from public.order_confirmation_jobs j;
