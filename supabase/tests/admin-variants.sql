begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001');
select public.set_business_admin('10000000-0000-4000-8000-000000000001',true,'Local fixture');
set local role anon;
select pg_temp.error($q$select public.admin_list_variants('amber-candle')$q$,'42501','anon private variants denied');
reset role;
set local role authenticated;
select pg_temp.error($q$select public.admin_save_variant(null,'amber-candle',null,'LOCAL-BLUE','{"Colour":"Blue"}',200,true)$q$,'42501','no-identity variant write denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(jsonb_array_length(public.admin_list_variants('amber-candle'))=1,'admin sees genuine default');
select public.admin_save_variant(null,'amber-candle',null,'LOCAL-BLUE','{"Colour":"Blue"}',200,true)->>'id' as variant_id \gset
select pg_temp.error($q$select public.admin_save_variant(null,'amber-candle',null,'LOCAL-BLUE','{"Colour":"Red"}',300,true)$q$,'23505','duplicate SKU rejected');
select pg_temp.error($q$select public.admin_save_variant(null,'amber-candle',null,'LOCAL-OTHER','{"Colour":"Blue"}',200,true)$q$,'23505','duplicate option combination rejected');
select pg_temp.error($q$select public.admin_save_variant(null,'amber-candle',null,'LOCAL-EMPTY','{}',200,true)$q$,'22023','meaningful variant requires actual options');
select pg_temp.error($q$select public.admin_save_variant(null,'amber-candle',null,'LOCAL-SPACE','{"Colour":" Blue "}',200,true)$q$,'22023','noncanonical option spaces rejected');
select pg_temp.error($q$select public.admin_save_variant(null,'missing',null,'LOCAL-MISSING','{"Colour":"Red"}',300,true)$q$,'22023','missing parent rejected');
select pg_temp.error($q$select public.admin_save_variant(null,'amber-candle',null,'LOCAL-NEG','{"Colour":"Red"}',-1,true)$q$,'22023','negative price rejected');
reset role;
select updated_at::text as default_updated from public.product_variants where id='default:amber-candle' \gset
set local role authenticated;
select public.admin_save_variant('default:amber-candle','amber-candle',:'default_updated','DEFAULT-amber-candle','{}',12345,false);
select pg_temp.error($q$select public.admin_save_variant('default:amber-candle','amber-candle','2000-01-01','DEFAULT-amber-candle','{}',100,true)$q$,'40001','stale variant edit denied');
reset role;
select pg_temp.assert((select price_cents=12345 from public.products where id='amber-candle'),'default price keeps legacy product compatibility');
select pg_temp.assert((select not active from public.product_variants where id='default:amber-candle'),'price bridge preserves independent deactivation');
update public.products set active=false where id='amber-candle';
update public.products set active=true where id='amber-candle';
select pg_temp.assert((select not active from public.product_variants where id='default:amber-candle'),'parent reactivation cannot reactivate intentionally archived variant');
set local role anon;
select pg_temp.assert((select count(*)=1 from public.product_variants where product_id='amber-candle'),'public projection exposes active meaningful variant only');
select pg_temp.assert((select options='{"Colour":"Blue"}' and price_cents=200 from public.product_variants where id=:'variant_id'),'options/price reach storefront data');
select pg_temp.error('select sku from public.product_variants','42501','admin SKU stays private to catalogue customer');
reset role;
rollback;
