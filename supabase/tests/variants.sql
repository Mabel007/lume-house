-- LOCAL ONLY; all fixtures roll back.
begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin
  begin execute statement;
  exception when others then if sqlstate <> expected then raise; end if; return 'PASS: '||label; end;
  raise exception 'FAIL: expected error %',label;
end;$$;
select pg_temp.assert((select count(*)=20 from public.product_variants),'all existing products have default variants');
select pg_temp.assert((select bool_and(v.id='default:'||p.id and v.sku='DEFAULT-'||p.id and v.options='{}' and v.price_cents=p.price_cents and v.currency=p.currency and v.inventory_policy='untracked') from public.products p join public.product_variants v on v.product_id=p.id),'deterministic defaults preserve identity/pricing without fake options or stock');
select pg_temp.assert((select relrowsecurity from pg_class where oid='public.product_variants'::regclass),'variant RLS enabled');
select pg_temp.error($q$insert into public.product_variants(product_id,sku,options,price_cents) values('missing','test','{"Color":"Blue"}',100)$q$,'23503','parent FK enforced');
select pg_temp.error($q$insert into public.product_variants(product_id,sku,options,price_cents) values('amber-candle','test','{"Color":{}}',100)$q$,'23514','invalid nested options denied');
select pg_temp.error($q$insert into public.product_variants(product_id,sku,options,price_cents) values('amber-candle','test','{"Color":""}',100)$q$,'23514','blank options denied');
select pg_temp.error($q$insert into public.product_variants(product_id,sku,options,price_cents) values('amber-candle','test','{"Color":"Blue"}',-1)$q$,'23514','negative variant price denied');
select pg_temp.error($q$insert into public.product_variants(product_id,sku,options,price_cents,inventory_policy) values('amber-candle','test','{"Color":"Blue"}',100,'tracked')$q$,'23514','tracked purchases disabled before allocation exists');
insert into public.product_variants(id,product_id,sku,options,price_cents) values('fixture-blue','amber-candle','fixture-blue','{"Color":"Blue"}',30000);
select pg_temp.error($q$insert into public.product_variants(product_id,sku,options,price_cents) values('amber-candle','other','{"Color":"Blue"}',100)$q$,'23505','duplicate combination denied');
select pg_temp.error($q$insert into public.product_variants(product_id,sku,options,price_cents) values('amber-candle','fixture-blue','{"Color":"Red"}',100)$q$,'23505','SKU collision denied');
update public.products set price_cents=26000 where id='amber-candle';
select pg_temp.assert((select price_cents=26000 from public.product_variants where id='default:amber-candle'),'legacy price bridge preserves default compatibility');
update public.products set active=false where id='table-lamp';
update public.product_variants set active=false where id='fixture-blue';
set local role anon;
select pg_temp.assert((select count(*)=19 from public.product_variants),'anon sees active variants only under active parents');
select pg_temp.error('insert into public.product_variants default values','42501','anon variant writes denied');
select pg_temp.error('update public.product_variants set price_cents=0','42501','anon prices denied');
select pg_temp.error('select sku from public.product_variants','42501','internal SKU omitted from public catalogue grant');
reset role;
set local role authenticated;
select pg_temp.error('delete from public.product_variants','42501','customer variant deletes denied');
select pg_temp.error('update public.product_variants set active=false','42501','customer availability writes denied');
reset role;
insert into public.products(id,name,description,price_cents,image_path,category) values('local-fixture','Local fixture','Local-only test',100,'/images/mug.svg','Test');
select pg_temp.assert((select count(*)=1 from public.product_variants where product_id='local-fixture' and is_default),'new simple products receive one default');
insert into auth.users(id) values('99999999-9999-4999-8999-999999999999');
insert into public.orders(id,user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,payment_provider,currency,subtotal_cents,delivery_fee_cents,total_cents)
values('99999999-aaaa-4999-8999-999999999999','99999999-9999-4999-8999-999999999999','Fixture','fixture@example.invalid','+23276521208','pickup','Lumley, Freetown','orange','NLE',100,0,100);
insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents) values('99999999-aaaa-4999-8999-999999999999','local-fixture','Historical fixture',1,100);
set constraints all immediate;
select pg_temp.error($q$update public.order_items set variant_id='default:local-fixture',variant_sku='DEFAULT-local-fixture',variant_options='{}',variant_currency='NLE'$q$,'23514','legacy snapshot cannot be rewritten into variant history');
select pg_temp.assert((select variant_id is null from public.order_items),'legacy reference stays null');
rollback;
select 'PASS: variant fixtures rolled back';
