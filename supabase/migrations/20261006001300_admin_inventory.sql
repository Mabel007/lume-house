begin;
alter table public.inventory_ledger add column actor_user_id uuid default auth.uid() references auth.users(id) on delete restrict;
create function public.admin_list_inventory()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.require_business_admin();
  select coalesce(jsonb_agg(to_jsonb(row) order by row.product_name,row.variant_id),'[]') into result from (
    select v.id variant_id,p.name product_name,v.sku,v.options,v.active,v.inventory_policy,v.updated_at,
      i.on_hand,i.allocated,(p.active and v.active and (v.inventory_policy='untracked' or coalesce(i.on_hand>i.allocated,false))) available
    from public.product_variants v join public.products p on p.id=v.product_id left join public.variant_inventory i on i.variant_id=v.id
    order by p.name,v.id limit 500) row;
  return result;
end;
$$;
create function public.admin_inventory_history(p_variant_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.require_business_admin();
  select coalesce(jsonb_agg(to_jsonb(row) order by row.created_at desc,row.id),'[]') into result from
    (select id,event,on_hand_delta,allocated_delta,on_hand_after,allocated_after,reason,created_at,order_id
      from public.inventory_ledger where variant_id=p_variant_id order by created_at desc,id limit 100) row;
  return result;
end;
$$;
create function public.admin_adjust_inventory(p_variant_id text,p_delta integer,p_reason text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.require_business_admin();
  return public.adjust_variant_inventory(p_variant_id,p_delta,p_reason,p_operation_id);
end;
$$;
create function public.admin_set_inventory_policy(p_variant_id text,p_policy text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare variant public.product_variants%rowtype; stock public.variant_inventory%rowtype;
begin
  perform public.require_business_admin();
  if p_policy is null or p_policy not in ('tracked','untracked') then raise exception 'INVALID_POLICY' using errcode='22023'; end if;
  select * into variant from public.product_variants where id=p_variant_id for update;
  if not found then raise exception 'VARIANT_NOT_FOUND' using errcode='22023'; end if;
  if p_expected_updated_at is null or variant.updated_at is distinct from p_expected_updated_at then raise exception 'VARIANT_CHANGED' using errcode='40001'; end if;
  select * into stock from public.variant_inventory where variant_id=p_variant_id for update;
  if p_policy='tracked' and stock.variant_id is null then raise exception 'PREPARE_ACTUAL_STOCK_FIRST' using errcode='22023'; end if;
  if p_policy='untracked' and coalesce(stock.allocated,0)>0 then raise exception 'ALLOCATIONS_REQUIRE_TRACKING' using errcode='22023'; end if;
  update public.product_variants set inventory_policy=p_policy where id=p_variant_id returning * into variant;
  return to_jsonb(variant);
end;
$$;
revoke all on function public.admin_list_inventory(),public.admin_inventory_history(text),public.admin_adjust_inventory(text,integer,text,uuid),public.admin_set_inventory_policy(text,text,timestamptz) from public,anon;
grant execute on function public.admin_list_inventory(),public.admin_inventory_history(text),public.admin_adjust_inventory(text,integer,text,uuid),public.admin_set_inventory_policy(text,text,timestamptz) to authenticated;
commit;
