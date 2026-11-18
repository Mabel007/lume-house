-- Customer-facing order timeline
-- Provides sanitized view of order status transitions for the order owner
-- Excludes internal admin notes, staff comments, and sensitive operational details
-- SECURITY: Owner-scoped via auth.uid() verification

-- Function: get_customer_order_timeline
-- Returns customer-visible status transitions for a specific order
-- Caller must be the order owner (verified via auth.uid())
create or replace function public.get_customer_order_timeline(
  p_order_id uuid
)
returns table (
  occurred_at timestamptz,
  from_status text,
  to_status text,
  event_type text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_order_exists boolean;
begin
  -- Verify caller is authenticated
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;
  
  -- Verify order exists and caller owns it
  select exists(
    select 1 from public.orders 
    where id = p_order_id and user_id = v_customer_id
  ) into v_order_exists;
  
  if not v_order_exists then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  
  -- Return sanitized timeline events
  -- Excludes: reason, result (jsonb), actor_user_id (sensitive)
  -- Maps operational transitions to customer-friendly event types
  -- Includes initial placement derived from order created_at (business_order_operations has non-null from_status)
  return query
  select events.occurred_at,events.from_status,events.to_status,events.event_type
  from (
  select 
    o.created_at as occurred_at,
    null::text as from_status,
    'placed' as to_status,
    'order_placed' as event_type
  from public.orders o
  where o.id = p_order_id
  union all
  select 
    op.created_at as occurred_at,
    op.from_status,
    op.to_status,
    case
      when op.to_status = 'confirmed' then 'order_confirmed'
      when op.to_status = 'processing' then 'order_processing'
      when op.to_status = 'ready_for_pickup' then 'ready_for_pickup'
      when op.to_status = 'out_for_delivery' then 'out_for_delivery'
      when op.to_status = 'completed' then 'order_completed'
      when op.to_status = 'cancelled' then 'order_cancelled'
      else 'status_changed'
    end as event_type
  from public.business_order_operations op
  where op.order_id = p_order_id
  ) events
  order by events.occurred_at asc,
    case events.event_type when 'order_placed' then 0 when 'order_confirmed' then 1
      when 'order_processing' then 2 when 'ready_for_pickup' then 3
      when 'out_for_delivery' then 3 when 'order_completed' then 4
      when 'order_cancelled' then 4 else 5 end,
    events.event_type;
end;
$$;

-- Revoke all default grants
revoke all on function public.get_customer_order_timeline(uuid) from public, anon, authenticated;
-- Only authenticated users can call (ownership verified inside function)
grant execute on function public.get_customer_order_timeline(uuid) to authenticated;

-- Comment documenting security properties
comment on function public.get_customer_order_timeline is 
  'Customer-scoped order timeline. Verifies caller ownership via auth.uid(). Returns sanitized transitions excluding internal notes and staff details. Timestamps are timestamptz (UTC) for client-side timezone conversion.';
