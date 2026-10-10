-- Additive local-reviewed contracts. Existing list RPCs remain compatible.
begin;
create function public.admin_products_page_v1(p_page integer default 0,p_page_size integer default 10,p_query text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_admin();
 if p_page is null or p_page not between 0 and 1000000 or p_page_size is null or p_page_size not in (10,50,100) or p_query is null or char_length(p_query)>200 then
  raise exception 'INVALID_PRODUCT_PAGE' using errcode='22023';
 end if;
 with filtered as materialized (
  select id,name,description,category,image_path,background_color,display_order,active,updated_at
  from public.products where position(lower(p_query) in lower(name||' '||category))>0
 ), page_rows as (
  select * from filtered order by display_order,id limit p_page_size offset p_page::bigint*p_page_size
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by display_order,id) from page_rows r),'[]'::jsonb),
  'total_count',(select count(*) from filtered),'page',p_page,'page_size',p_page_size) into result;
 return result;
end;
$$;
create function public.admin_inventory_page_v1(p_page integer default 0,p_page_size integer default 10,p_query text default '',p_policy text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_admin();
 if p_page is null or p_page not between 0 and 1000000 or p_page_size is null or p_page_size not in (10,50,100) or p_query is null or char_length(p_query)>200 or p_policy is null or p_policy not in ('','tracked','untracked') then
  raise exception 'INVALID_INVENTORY_PAGE' using errcode='22023';
 end if;
 with candidates as (
  select v.id variant_id,p.name product_name,v.sku,v.options,v.active,v.inventory_policy,v.updated_at,i.on_hand,i.allocated,
   (p.active and v.active and (v.inventory_policy='untracked' or coalesce(i.on_hand>i.allocated,false))) available,
   lower(p.name||' '||v.sku||' '||coalesce((select string_agg(e.key||': '||e.value,' · ' order by e.key) from jsonb_each_text(v.options) e),'No structured options')) search_text
  from public.product_variants v join public.products p on p.id=v.product_id left join public.variant_inventory i on i.variant_id=v.id
 ), filtered as materialized (
  select variant_id,product_name,sku,options,active,inventory_policy,updated_at,on_hand,allocated,available from candidates
  where (p_policy='' or inventory_policy=p_policy) and not exists (
   select 1 from regexp_split_to_table(lower(btrim(p_query)),E'\\s+') term where term<>'' and position(term in search_text)=0
  )
 ), page_rows as (
  select * from filtered order by product_name,variant_id limit p_page_size offset p_page::bigint*p_page_size
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by product_name,variant_id) from page_rows r),'[]'::jsonb),
  'total_count',(select count(*) from filtered),'page',p_page,'page_size',p_page_size) into result;
 return result;
end;
$$;
create function public.admin_orders_page_v1(p_page integer default 0,p_page_size integer default 10,p_query text default '',p_status text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_admin();
 if p_page is null or p_page not between 0 and 1000000 or p_page_size is null or p_page_size not in (10,50,100) or p_query is null or char_length(p_query)>200 or p_status is null or (p_status<>'' and p_status not in ('placed','confirmed','processing','ready_for_pickup','out_for_delivery','completed','cancelled')) then
  raise exception 'INVALID_ORDER_PAGE' using errcode='22023';
 end if;
 with filtered as materialized (
  select id,order_reference,full_name,created_at,fulfilment_method,status,payment_status,currency,total_cents from public.orders
  where (p_status='' or status=p_status) and position(lower(p_query) in lower(order_reference||' '||full_name||' '||customer_email))>0
 ), page_rows as (
  select * from filtered order by created_at desc,id limit p_page_size offset p_page::bigint*p_page_size
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc,id) from page_rows r),'[]'::jsonb),
  'total_count',(select count(*) from filtered),'page',p_page,'page_size',p_page_size) into result;
 return result;
end;
$$;
revoke all on function public.admin_products_page_v1(integer,integer,text), public.admin_inventory_page_v1(integer,integer,text,text), public.admin_orders_page_v1(integer,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_products_page_v1(integer,integer,text), public.admin_inventory_page_v1(integer,integer,text,text), public.admin_orders_page_v1(integer,integer,text,text) to authenticated;
commit;
