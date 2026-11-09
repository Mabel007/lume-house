-- Customer notifications for order lifecycle events
-- Persistent notification system with read/unread tracking
-- SECURITY: Owner-scoped via RLS, no internal operational details exposed

-- Notifications table
create table public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  title text not null check (char_length(title) between 1 and 200),
  message text not null check (char_length(message) between 1 and 1000),
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  -- Event type must match known order lifecycle events
  constraint customer_notifications_event_type_check check (
    event_type in (
      'order_placed',
      'order_confirmed', 
      'order_processing',
      'ready_for_pickup',
      'out_for_delivery',
      'order_completed',
      'order_cancelled'
    )
  ),
  -- Read timestamp must be after creation
  constraint customer_notifications_read_after_create check (
    read_at is null or read_at >= created_at
  ),
  -- One notification per order per event type (idempotency)
  constraint customer_notifications_unique_event unique (order_id, event_type)
);

-- Index for fast customer notification queries
create index customer_notifications_customer_idx 
  on public.customer_notifications (customer_id, is_read, created_at desc);

-- Index for unread count queries
create index customer_notifications_unread_idx 
  on public.customer_notifications (customer_id) 
  where is_read = false;

-- RLS: Enable row-level security
alter table public.customer_notifications enable row level security;

-- RLS: Customers can only view their own notifications
create policy "Customers can view their own notifications"
  on public.customer_notifications for select
  to authenticated
  using (customer_id = auth.uid());

-- RLS: Customers can only update their own notifications (mark as read/unread)
-- RLS: No customer INSERT/DELETE/UPDATE (notifications created/modified by system triggers and RPCs)
-- Customers can only SELECT their own notifications
-- Mark read/unread operations use SECURITY DEFINER RPC functions with owner verification

-- Revoke default PUBLIC grants
revoke all on public.customer_notifications from public, anon, authenticated;
grant select on public.customer_notifications to authenticated;
-- service_role gets full access for trigger-based notification creation and RPC functions
grant all on public.customer_notifications to service_role;

-- Function: mark notification as read
create or replace function public.mark_notification_read(
  p_notification_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
begin
  -- Verify caller is authenticated
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;
  
  -- Update notification (RLS ensures caller owns it)
  update public.customer_notifications
  set is_read = true,
      read_at = now()
  where id = p_notification_id
    and customer_id = v_customer_id
    and is_read = false;
    
  if not found then
    raise exception 'notification_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Function: mark notification as unread
create or replace function public.mark_notification_unread(
  p_notification_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
begin
  -- Verify caller is authenticated
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;
  
  -- Update notification (RLS ensures caller owns it)
  update public.customer_notifications
  set is_read = false,
      read_at = null
  where id = p_notification_id
    and customer_id = v_customer_id
    and is_read = true;
    
  if not found then
    raise exception 'notification_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Function: mark all notifications as read
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_count integer;
begin
  -- Verify caller is authenticated
  v_customer_id := auth.uid();
  if v_customer_id is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;
  
  -- Update all unread notifications for this customer
  update public.customer_notifications
  set is_read = true,
      read_at = now()
  where customer_id = v_customer_id
    and is_read = false;
    
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Revoke and grant function permissions
revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

revoke all on function public.mark_notification_unread(uuid) from public, anon;
grant execute on function public.mark_notification_unread(uuid) to authenticated;

revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Trigger: Create notification when order is placed
-- Fires after INSERT on orders table
create or replace function public.create_order_placed_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Insert notification for new order (idempotent via unique constraint)
  insert into public.customer_notifications (
    customer_id,
    order_id,
    event_type,
    title,
    message
  ) values (
    new.user_id,
    new.id,
    'order_placed',
    'Order placed',
    'Your order ' || new.order_reference || ' has been received and is awaiting payment confirmation.'
  )
  on conflict (order_id, event_type) do nothing;
  
  return null;
end;
$$;

-- Create trigger for order placement
create trigger trg_order_placed_notification
  after insert on public.orders
  for each row
  execute function public.create_order_placed_notification();

-- Revoke function execution from public
revoke all on function public.create_order_placed_notification() from public, anon, authenticated;

-- Trigger: Create notification when order status changes
-- Fires after UPDATE on orders.status column
create or replace function public.create_order_status_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_message text;
  v_event_type text;
begin
  -- Only create notification if status actually changed
  if old.status is not distinct from new.status then
    return null;
  end if;
  
  -- Map status to event type and generate customer-friendly message
  case new.status
    when 'confirmed' then
      v_event_type := 'order_confirmed';
      v_title := 'Order confirmed';
      v_message := 'Your order ' || new.order_reference || ' has been confirmed and is being prepared.';
    when 'processing' then
      v_event_type := 'order_processing';
      v_title := 'Order processing';
      v_message := 'Your order ' || new.order_reference || ' is now being processed.';
    when 'ready_for_pickup' then
      v_event_type := 'ready_for_pickup';
      v_title := 'Ready for pickup';
      v_message := 'Your order ' || new.order_reference || ' is ready for pickup at ' || coalesce(new.pickup_location, 'the store') || '.';
    when 'out_for_delivery' then
      v_event_type := 'out_for_delivery';
      v_title := 'Out for delivery';
      v_message := 'Your order ' || new.order_reference || ' is out for delivery.';
    when 'completed' then
      v_event_type := 'order_completed';
      v_title := 'Order completed';
      v_message := 'Your order ' || new.order_reference || ' has been completed. Thank you for shopping with Lumé House!';
    when 'cancelled' then
      v_event_type := 'order_cancelled';
      v_title := 'Order cancelled';
      v_message := 'Your order ' || new.order_reference || ' has been cancelled.';
    else
      -- No notification for 'placed' (handled by order creation) or unknown statuses
      return null;
  end case;
  
  -- Insert notification (idempotent via unique constraint)
  insert into public.customer_notifications (
    customer_id,
    order_id,
    event_type,
    title,
    message
  ) values (
    new.user_id,
    new.id,
    v_event_type,
    v_title,
    v_message
  )
  on conflict (order_id, event_type) do nothing;
  
  return null;
end;
$$;

-- Create trigger for order status changes
create trigger trg_order_status_notification
  after update on public.orders
  for each row
  execute function public.create_order_status_notification();

-- Revoke function execution from public
revoke all on function public.create_order_status_notification() from public, anon, authenticated;
-- Only triggers can call this function (no direct execution needed)

-- Comment documenting security properties
comment on table public.customer_notifications is
  'Customer-facing notifications for order lifecycle events. Owner-scoped via RLS. Created by system triggers on order status changes. Customers can mark as read/unread. No internal operational details exposed.';
