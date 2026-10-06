begin;
create table public.business_order_operations (
  operation_id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  from_status text not null,
  to_status text not null,
  reason text not null check(char_length(btrim(reason)) between 1 and 500),
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.business_order_operations enable row level security;
revoke all on public.business_order_operations from public,anon,authenticated,service_role;
create function public.protect_business_order_operation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Order operation history is immutable' using errcode='23514'; end;
$$;
revoke all on function public.protect_business_order_operation() from public,anon,authenticated,service_role;
create trigger business_order_operations_immutable before update or delete on public.business_order_operations
for each row execute function public.protect_business_order_operation();
alter table public.inventory_ledger drop constraint inventory_ledger_event_check;
alter table public.inventory_ledger add constraint inventory_ledger_event_check
  check(event in ('stock_adjustment','order_allocation','order_release','order_consumption'));
alter table public.inventory_ledger drop constraint inventory_event_shape;
alter table public.inventory_ledger add constraint inventory_event_shape check(
  (event='stock_adjustment' and order_id is null and allocated_delta=0)
  or (event='order_allocation' and order_id is not null and on_hand_delta=0 and allocated_delta>0)
  or (event='order_release' and order_id is not null and on_hand_delta=0 and allocated_delta<0)
  or (event='order_consumption' and order_id is not null and on_hand_delta=allocated_delta and allocated_delta<0));
create unique index inventory_one_terminal_order_event on public.inventory_ledger(order_id,variant_id)
where event in ('order_release','order_consumption');
create function public.valid_business_order_transition(p_from text,p_to text,p_fulfilment text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce((p_from='placed' and p_to in ('confirmed','cancelled'))
    or (p_from='confirmed' and p_to in ('processing','cancelled'))
    or (p_from='processing' and ((p_fulfilment='pickup' and p_to='ready_for_pickup') or (p_fulfilment='delivery' and p_to='out_for_delivery')))
    or (p_from='ready_for_pickup' and p_fulfilment='pickup' and p_to='completed')
    or (p_from='out_for_delivery' and p_fulfilment='delivery' and p_to='completed'),false);
$$;
revoke all on function public.valid_business_order_transition(text,text,text) from public,anon,authenticated;
create function public.admin_list_orders(p_query text default '',p_status text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.require_business_admin();
  if p_query is null or char_length(p_query)>200 or p_status is null or (p_status<>'' and p_status not in ('placed','confirmed','processing','ready_for_pickup','out_for_delivery','completed','cancelled')) then
    raise exception 'INVALID_ORDER_SEARCH' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(row) order by row.created_at desc,row.id),'[]') into result from
    (select id,order_reference,full_name,created_at,fulfilment_method,status,payment_status,currency,total_cents from public.orders
      where (p_status='' or status=p_status) and position(lower(p_query) in lower(order_reference||' '||full_name||' '||customer_email))>0
      order by created_at desc,id limit 200) row;
  return result;
end;
$$;
create function public.admin_get_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.require_business_admin();
  select (to_jsonb(o)-'user_id'-'idempotency_key'-'checkout_request_id') || jsonb_build_object('order_items',
    (select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from public.order_items i where i.order_id=o.id))
    into result from public.orders o where o.id=p_order_id;
  if result is null then raise exception 'ORDER_NOT_FOUND' using errcode='22023'; end if;
  return result;
end;
$$;
create function public.admin_order_history(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.require_business_admin();
  select coalesce(jsonb_agg(to_jsonb(row) order by row.created_at desc,row.operation_id),'[]') into result from
    (select operation_id,from_status,to_status,reason,created_at from public.business_order_operations where order_id=p_order_id order by created_at desc,operation_id limit 100) row;
  return result;
end;
$$;
create function public.admin_transition_order(p_order_id uuid,p_expected_status text,p_to_status text,p_reason text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.orders%rowtype; receipt public.business_order_operations%rowtype;
  allocation record; stock public.variant_inventory%rowtype; result jsonb;
begin
  perform public.require_business_admin();
  if p_operation_id is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'INVALID_ORDER_OPERATION' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('business-order-operation:'||p_operation_id::text,0));
  select * into receipt from public.business_order_operations where operation_id=p_operation_id;
  if found then
    if row(receipt.order_id,receipt.actor_user_id,receipt.from_status,receipt.to_status,receipt.reason)
      is distinct from row(p_order_id,auth.uid(),p_expected_status,p_to_status,btrim(p_reason)) then raise exception 'OPERATION_ID_REUSED' using errcode='22023'; end if;
    return receipt.result;
  end if;
  select * into target from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='22023'; end if;
  if p_expected_status is null or target.status<>p_expected_status then raise exception 'ORDER_CHANGED' using errcode='40001'; end if;
  if not public.valid_business_order_transition(target.status,p_to_status,target.fulfilment_method) then raise exception 'INVALID_ORDER_TRANSITION' using errcode='22023'; end if;
  if p_to_status in ('cancelled','completed') then
    -- Consume/release only genuine allocation ledger facts, never fabricate
    -- allocations from historical product-only order rows/current inventory.
    for allocation in select variant_id,allocated_delta from public.inventory_ledger
      where order_id=p_order_id and event='order_allocation' order by variant_id loop
      if exists(select 1 from public.inventory_ledger where order_id=p_order_id and variant_id=allocation.variant_id and event in ('order_release','order_consumption')) then
        raise exception 'ALLOCATION_ALREADY_TERMINAL' using errcode='23514';
      end if;
      select * into stock from public.variant_inventory where variant_id=allocation.variant_id for update;
      if stock.variant_id is null or stock.allocated<allocation.allocated_delta or stock.on_hand<allocation.allocated_delta then
        raise exception 'INVALID_ALLOCATION_BALANCE' using errcode='23514';
      end if;
      update public.variant_inventory set allocated=allocated-allocation.allocated_delta,
        on_hand=on_hand-case when p_to_status='completed' then allocation.allocated_delta else 0 end
        where variant_id=allocation.variant_id returning * into stock;
      insert into public.inventory_ledger(operation_id,variant_id,event,on_hand_delta,allocated_delta,on_hand_after,allocated_after,order_id,reason)
        values(gen_random_uuid(),allocation.variant_id,case when p_to_status='completed' then 'order_consumption' else 'order_release' end,
          case when p_to_status='completed' then -allocation.allocated_delta else 0 end,-allocation.allocated_delta,stock.on_hand,stock.allocated,p_order_id,btrim(p_reason));
    end loop;
  end if;
  update public.orders set status=p_to_status where id=p_order_id returning * into target;
  result:=jsonb_build_object('id',target.id,'status',target.status,'payment_status',target.payment_status);
  insert into public.business_order_operations(operation_id,order_id,actor_user_id,from_status,to_status,reason,result)
    values(p_operation_id,p_order_id,auth.uid(),p_expected_status,p_to_status,btrim(p_reason),result);
  return result;
end;
$$;
revoke all on function public.admin_list_orders(text,text),public.admin_get_order(uuid),public.admin_order_history(uuid),public.admin_transition_order(uuid,text,text,text,uuid) from public,anon;
grant execute on function public.admin_list_orders(text,text),public.admin_get_order(uuid),public.admin_order_history(uuid),public.admin_transition_order(uuid,text,text,text,uuid) to authenticated;
commit;
