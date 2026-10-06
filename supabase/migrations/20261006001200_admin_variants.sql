begin;
-- Parent availability gates catalogue reads; do not overwrite independently
-- archived default variants when a parent is archived/reactivated.
create or replace function public.sync_legacy_default_variant()
returns trigger language plpgsql set search_path='' as $$
begin
  insert into public.product_variants(id,product_id,sku,is_default,price_cents,currency,active)
  values('default:'||new.id,new.id,'DEFAULT-'||new.id,true,new.price_cents,new.currency,new.active)
  on conflict(id) do update set price_cents=excluded.price_cents,currency=excluded.currency;
  return new;
end;
$$;
create function public.admin_list_variants(p_product_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.require_business_admin();
  select coalesce(jsonb_agg(to_jsonb(v) order by v.is_default desc,v.id),'[]') into result
  from public.product_variants v where product_id=p_product_id;
  return result;
end;
$$;
create function public.admin_save_variant(p_id text,p_product_id text,p_expected_updated_at timestamptz,p_sku text,p_options jsonb,p_price_cents integer,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare variant public.product_variants%rowtype;
begin
  perform public.require_business_admin();
  if p_sku is null or char_length(btrim(p_sku)) not between 1 and 150 or p_sku<>btrim(p_sku)
    or p_options is null or not public.valid_variant_options(p_options)
    or exists(select 1 from jsonb_each(p_options) e where e.key<>btrim(e.key) or e.value#>>'{}'<>btrim(e.value#>>'{}'))
    or p_price_cents is null or p_price_cents<0 or p_active is null then raise exception 'INVALID_VARIANT' using errcode='22023'; end if;
  perform 1 from public.products where id=p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='22023'; end if;
  if p_id is null then
    if p_expected_updated_at is not null or p_options='{}' or p_sku like 'DEFAULT-%' then raise exception 'INVALID_OPTIONS' using errcode='22023'; end if;
    insert into public.product_variants(product_id,sku,options,price_cents,active)
      values(p_product_id,p_sku,p_options,p_price_cents,p_active) returning * into variant;
  else
    select * into variant from public.product_variants where id=p_id and product_id=p_product_id for update;
    if not found then raise exception 'VARIANT_NOT_FOUND' using errcode='22023'; end if;
    if p_expected_updated_at is null or variant.updated_at is distinct from p_expected_updated_at then raise exception 'VARIANT_CHANGED' using errcode='40001'; end if;
    if variant.is_default and (p_options<>'{}' or p_sku<>variant.sku) then raise exception 'DEFAULT_IDENTITY_IMMUTABLE' using errcode='22023'; end if;
    update public.product_variants set sku=p_sku,options=p_options,price_cents=p_price_cents,active=p_active where id=p_id returning * into variant;
    if variant.is_default then
      update public.products set price_cents=p_price_cents where id=p_product_id;
    end if;
  end if;
  return to_jsonb(variant);
end;
$$;
revoke all on function public.admin_list_variants(text),public.admin_save_variant(text,text,timestamptz,text,jsonb,integer,boolean) from public,anon;
grant execute on function public.admin_list_variants(text),public.admin_save_variant(text,text,timestamptz,text,jsonb,integer,boolean) to authenticated;
commit;
