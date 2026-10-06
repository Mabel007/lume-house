begin;
create function public.admin_list_products(p_query text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.require_business_admin();
  if p_query is null or char_length(p_query)>200 then raise exception 'INVALID_SEARCH' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.display_order,p.id),'[]') into result from
    (select * from public.products where position(lower(p_query) in lower(name||' '||category))>0 order by display_order,id limit 200) p;
  return result;
end;
$$;
create function public.admin_save_product(p_id text,p_expected_updated_at timestamptz,p_name text,p_description text,p_category text,p_image_path text,p_background_color text,p_display_order integer,p_active boolean,p_initial_price integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare product public.products%rowtype;
begin
  perform public.require_business_admin();
  if p_name is null or char_length(btrim(p_name)) not between 1 and 200
    or p_description is null or char_length(btrim(p_description)) not between 1 and 2000
    or p_category is null or char_length(btrim(p_category)) not between 1 and 100
    or p_image_path is null or char_length(p_image_path)>500 or p_image_path !~ '^/images/[A-Za-z0-9][A-Za-z0-9/_-]*\.(webp|png|jpg|jpeg|svg)$' or p_image_path like '%..%'
    or p_background_color is null or p_background_color !~ '^#[0-9a-fA-F]{6}$'
    or p_display_order is null or p_display_order<0 or p_active is null then
    raise exception 'INVALID_PRODUCT' using errcode='22023';
  end if;
  if p_id is null then
    if p_initial_price is null or p_initial_price<0 or p_expected_updated_at is not null then raise exception 'INVALID_INITIAL_VARIANT_PRICE' using errcode='22023'; end if;
    insert into public.products(id,name,description,category,image_path,background_color,display_order,active,price_cents,currency)
    values(gen_random_uuid()::text,btrim(p_name),btrim(p_description),btrim(p_category),p_image_path,p_background_color,p_display_order,p_active,p_initial_price,'NLE') returning * into product;
  else
    select * into product from public.products where id=p_id for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='22023'; end if;
    if p_expected_updated_at is null or product.updated_at is distinct from p_expected_updated_at then raise exception 'PRODUCT_CHANGED' using errcode='40001'; end if;
    if p_initial_price is not null then raise exception 'VARIANT_PRICE_IS_SEPARATE' using errcode='22023'; end if;
    update public.products set name=btrim(p_name),description=btrim(p_description),category=btrim(p_category),image_path=p_image_path,
      background_color=p_background_color,display_order=p_display_order,active=p_active where id=p_id returning * into product;
  end if;
  return to_jsonb(product);
end;
$$;
revoke all on function public.admin_list_products(text),public.admin_save_product(text,timestamptz,text,text,text,text,text,integer,boolean,integer) from public,anon;
grant execute on function public.admin_list_products(text),public.admin_save_product(text,timestamptz,text,text,text,text,text,integer,boolean,integer) to authenticated;
commit;
