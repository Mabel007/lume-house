-- Atomic bounded exports: no offset traversal, retained files or export jobs.
begin;
create function public.admin_export_v1(p_kind text,p_query text default '',p_status text default '',p_policy text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_admin();
 if p_kind is null or p_kind not in ('products','inventory','orders') or p_query is null or char_length(p_query)>200 or p_status is null or p_policy is null
  or (p_kind<>'orders' and p_status<>'') or (p_kind<>'inventory' and p_policy<>'')
  or p_policy not in ('','tracked','untracked') or (p_status<>'' and p_status not in ('placed','confirmed','processing','ready_for_pickup','out_for_delivery','completed','cancelled')) then
  raise exception 'INVALID_EXPORT' using errcode='22023';
 end if;
 if p_kind='products' then
  with filtered as materialized (select id,name,category,active,display_order from public.products where position(lower(p_query) in lower(name||' '||category))>0), bounded as (select * from filtered order by display_order,id limit 10001)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by display_order,id) from bounded r),'[]'::jsonb),'total_count',(select count(*) from filtered)) into result;
 elsif p_kind='orders' then
  with filtered as materialized (select order_reference,created_at,status,payment_status,currency,total_cents,id from public.orders where (p_status='' or status=p_status) and position(lower(p_query) in lower(order_reference||' '||full_name||' '||customer_email))>0), bounded as (select * from filtered order by created_at desc,id limit 10001)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r)-'id' order by created_at desc,id) from bounded r),'[]'::jsonb),'total_count',(select count(*) from filtered)) into result;
 else
  with candidates as (
   select p.id product_id,p.name product_name,v.id variant_id,v.sku,v.inventory_policy,i.on_hand,i.allocated,
    (p.active and v.active and (v.inventory_policy='untracked' or coalesce(i.on_hand>i.allocated,false))) available,
    lower(p.name||' '||v.sku||' '||coalesce((select string_agg(e.key||': '||e.value,' · ' order by e.key) from jsonb_each_text(v.options) e),'No structured options')) search_text
   from public.product_variants v join public.products p on p.id=v.product_id left join public.variant_inventory i on i.variant_id=v.id
  ), filtered as materialized (
   select product_id,product_name,variant_id,sku,inventory_policy,on_hand,allocated,available from candidates
   where (p_policy='' or inventory_policy=p_policy) and not exists(select 1 from regexp_split_to_table(lower(btrim(p_query)),E'\\s+') term where term<>'' and position(term in search_text)=0)
  ), bounded as (select * from filtered order by product_name,variant_id limit 10001)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by product_name,variant_id) from bounded r),'[]'::jsonb),'total_count',(select count(*) from filtered)) into result;
 end if;
 if (result->>'total_count')::bigint>10000 or octet_length(result::text)>8388608 then raise exception 'EXPORT_TOO_LARGE' using errcode='54000'; end if;
 return result;
end;
$$;
revoke all on function public.admin_export_v1(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_export_v1(text,text,text,text) to authenticated;
commit;
