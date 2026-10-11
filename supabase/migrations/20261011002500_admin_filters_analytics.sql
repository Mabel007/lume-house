-- Additive read-only v2 contracts. Apply only after reviewed 02400; never replaces v1.
begin;
create function public.admin_record_rows_v2(p_kind text,p_filters jsonb)
returns table(item jsonb,ordinal bigint) language plpgsql security definer set search_path='' as $$
declare q text; s text; direction text; keys text[]; from_time timestamptz; to_time timestamptz;
begin
 perform public.require_business_admin();
 if p_kind is null or p_kind not in ('products','inventory','orders') or p_filters is null or jsonb_typeof(p_filters)<>'object' then raise exception 'INVALID_RECORD_FILTERS' using errcode='22023'; end if;
 keys:=case p_kind when 'orders' then array['query','status','fulfilment','payment','from','to','sort','direction'] when 'products' then array['query','category','publication','sort','direction'] else array['query','policy','attention','sort','direction'] end;
 if exists(select 1 from jsonb_each(p_filters) e where not e.key=any(keys) or jsonb_typeof(e.value)<>'string') then raise exception 'INVALID_RECORD_FILTERS' using errcode='22023'; end if;
 q:=coalesce(p_filters->>'query','');
 s:=coalesce(nullif(p_filters->>'sort',''),case p_kind when 'orders' then 'created_at' when 'products' then 'name' else 'product_name' end);
 direction:=coalesce(p_filters->>'direction',case when p_kind='orders' then 'desc' else 'asc' end);
 if char_length(q)>200 or direction not in ('asc','desc')
 or (p_kind='orders' and (s not in ('created_at','reference','status','total') or coalesce(p_filters->>'status','') not in ('','placed','confirmed','processing','ready_for_pickup','out_for_delivery','completed','cancelled') or coalesce(p_filters->>'payment','') not in ('','pending','awaiting_payment','paid','failed') or coalesce(p_filters->>'fulfilment','') not in ('','pickup','delivery')))
 or (p_kind='products' and (s not in ('name','updated_at','publication','display_order') or char_length(coalesce(p_filters->>'category',''))>100 or coalesce(p_filters->>'publication','') not in ('','active','archived')))
 or (p_kind='inventory' and (s not in ('product_name','available_quantity','updated_at') or coalesce(p_filters->>'policy','') not in ('','tracked','untracked') or coalesce(p_filters->>'attention','') not in ('','zero','unconfigured','available'))) then raise exception 'INVALID_RECORD_FILTERS' using errcode='22023'; end if;
 if coalesce(p_filters->>'from','')<>'' or coalesce(p_filters->>'to','')<>'' then
  begin from_time:=(p_filters->>'from')::timestamptz; to_time:=(p_filters->>'to')::timestamptz;
  exception when others then raise exception 'INVALID_RECORD_RANGE' using errcode='22023'; end;
  if from_time is null or to_time is null or not isfinite(from_time) or not isfinite(to_time) or to_time<=from_time or to_time>(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC' then raise exception 'INVALID_RECORD_RANGE' using errcode='22023'; end if;
 end if;
 return query with candidates as (
 select jsonb_build_object('id',o.id,'order_reference',o.order_reference,'full_name',o.full_name,'created_at',o.created_at,'fulfilment_method',o.fulfilment_method,'status',o.status,'payment_status',o.payment_status,'currency',o.currency,'total_cents',o.total_cents) r,
 o.id::text identity_key,case s when 'reference' then o.order_reference when 'status' then o.status end text_sort,case when s='total' then o.total_cents::bigint end number_sort,case when s='created_at' then o.created_at end time_sort
 from public.orders o where p_kind='orders' and position(lower(q) in lower(o.order_reference||' '||o.full_name||' '||o.customer_email))>0
 and (coalesce(p_filters->>'status','')='' or o.status=p_filters->>'status') and (coalesce(p_filters->>'payment','')='' or o.payment_status=p_filters->>'payment') and (coalesce(p_filters->>'fulfilment','')='' or o.fulfilment_method=p_filters->>'fulfilment') and (from_time is null or o.created_at>=from_time and o.created_at<to_time)
 union all
 select jsonb_build_object('id',p.id,'name',p.name,'description',p.description,'category',p.category,'image_path',p.image_path,'background_color',p.background_color,'display_order',p.display_order,'active',p.active,'updated_at',p.updated_at),p.id,
 case when s='name' then lower(p.name) end,case s when 'publication' then p.active::integer::bigint when 'display_order' then p.display_order::bigint end,case when s='updated_at' then p.updated_at end
 from public.products p where p_kind='products' and position(lower(q) in lower(p.name||' '||p.category))>0 and (coalesce(p_filters->>'category','')='' or p.category=p_filters->>'category') and (coalesce(p_filters->>'publication','')='' or p.active=(p_filters->>'publication'='active'))
 union all
 select jsonb_build_object('variant_id',v.id,'product_name',p.name,'sku',v.sku,'options',v.options,'active',v.active,'inventory_policy',v.inventory_policy,'updated_at',v.updated_at,'on_hand',i.on_hand,'allocated',i.allocated,'available',(p.active and v.active and (v.inventory_policy='untracked' or coalesce(i.on_hand>i.allocated,false))),'product_id',p.id),v.id,
 case when s='product_name' then lower(p.name) end,case when s='available_quantity' and v.inventory_policy='tracked' then (i.on_hand-i.allocated)::bigint end,case when s='updated_at' then v.updated_at end
 from public.product_variants v join public.products p on p.id=v.product_id left join public.variant_inventory i on i.variant_id=v.id where p_kind='inventory'
 and (coalesce(p_filters->>'policy','')='' or v.inventory_policy=p_filters->>'policy')
 and (coalesce(p_filters->>'attention','')='' or p.active and v.active and ((p_filters->>'attention'='zero' and v.inventory_policy='tracked' and i.on_hand=i.allocated) or (p_filters->>'attention'='unconfigured' and v.inventory_policy='tracked' and i.on_hand is null) or (p_filters->>'attention'='available' and (v.inventory_policy='untracked' or i.on_hand>i.allocated))))
 and not exists(select 1 from regexp_split_to_table(lower(btrim(q)),E'\\s+') term where term<>'' and position(term in lower(p.name||' '||v.sku||' '||coalesce((select string_agg(e.key||': '||e.value,' ' order by e.key) from jsonb_each_text(v.options) e),'')))=0)
 ) select r,row_number() over(order by case when direction='asc' then text_sort end asc nulls last,case when direction='desc' then text_sort end desc nulls last,case when direction='asc' then number_sort end asc nulls last,case when direction='desc' then number_sort end desc nulls last,case when direction='asc' then time_sort end asc nulls last,case when direction='desc' then time_sort end desc nulls last,identity_key asc) from candidates;
end;
$$;
revoke all on function public.admin_record_rows_v2(text,jsonb) from public,anon,authenticated,service_role;
create function public.admin_records_page_v2(p_kind text,p_filters jsonb default '{}'::jsonb,p_page integer default 0,p_page_size integer default 10)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_admin();
 if p_page is null or p_page not between 0 and 1000000 or p_page_size is null or p_page_size not in (10,50,100) then raise exception 'INVALID_RECORD_PAGE' using errcode='22023'; end if;
 with rows as materialized(select * from public.admin_record_rows_v2(p_kind,p_filters)), page_rows as(select * from rows order by ordinal limit p_page_size offset p_page::bigint*p_page_size)
 select jsonb_build_object('items',coalesce((select jsonb_agg(item order by ordinal) from page_rows),'[]'::jsonb),'total_count',(select count(*) from rows),'page',p_page,'page_size',p_page_size) into result;
 return result;
end;
$$;
create function public.admin_export_v2(p_kind text,p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_admin();
 with rows as materialized(select * from public.admin_record_rows_v2(p_kind,p_filters)), bounded as(select * from rows order by ordinal limit 10001)
 select jsonb_build_object('items',coalesce((select jsonb_agg(case p_kind when 'orders' then item-array['id','full_name','fulfilment_method'] when 'products' then item-array['description','image_path','background_color','updated_at'] else item-array['options','active','updated_at'] end order by ordinal) from bounded),'[]'::jsonb),'total_count',(select count(*) from rows)) into result;
 if (result->>'total_count')::bigint>10000 or octet_length(result::text)>8388608 then raise exception 'EXPORT_TOO_LARGE' using errcode='54000'; end if;
 return result;
end;
$$;
create function public.admin_order_analytics_v1(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_admin();
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<=p_from or p_to-p_from>interval '366 days' or p_to>(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC' then raise exception 'INVALID_ANALYTICS_RANGE' using errcode='22023'; end if;
 with cohort as materialized(select created_at,status,fulfilment_method,payment_status from public.orders where created_at>=p_from and created_at<p_to), days as(select d::date bucket_date from generate_series((p_from at time zone 'UTC')::date::timestamp,((p_to-interval '1 microsecond') at time zone 'UTC')::date::timestamp,interval '1 day') d)
 select jsonb_build_object('from',p_from,'to',p_to,'total_orders',(select count(*) from cohort),'awaiting_payment',(select count(*) from cohort where payment_status='awaiting_payment'),
 'by_status',(select jsonb_object_agg(s.status,(select count(*) from cohort c where c.status=s.status)) from (values('placed'),('confirmed'),('processing'),('ready_for_pickup'),('out_for_delivery'),('completed'),('cancelled')) s(status)),
 'by_fulfilment',jsonb_build_object('pickup',(select count(*) from cohort where fulfilment_method='pickup'),'delivery',(select count(*) from cohort where fulfilment_method='delivery')),
 'series',(select jsonb_agg(jsonb_build_object('date',to_char(bucket_date,'YYYY-MM-DD'),'orders',(select count(*) from cohort c where (c.created_at at time zone 'UTC')::date=bucket_date)) order by bucket_date) from days)) into result;
 return result;
end;
$$;
revoke all on function public.admin_records_page_v2(text,jsonb,integer,integer),public.admin_export_v2(text,jsonb),public.admin_order_analytics_v1(timestamptz,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.admin_records_page_v2(text,jsonb,integer,integer),public.admin_export_v2(text,jsonb),public.admin_order_analytics_v1(timestamptz,timestamptz) to authenticated;
-- UTC range scans and stable page traversal; wildcard search remains bounded by server pagination.
create index orders_admin_created_id_idx on public.orders(created_at desc,id);
create index products_admin_category_active_idx on public.products(category,active,id);
commit;
