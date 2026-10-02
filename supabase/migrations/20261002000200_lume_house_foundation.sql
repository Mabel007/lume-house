-- Forward-only reconciliation of 20261002000100; never rewrite applied history.
-- Hosted application is NOT authorized by this phase. See supabase/README.md.
begin;
lock table public.products, public.carts, public.cart_items,
  public.orders, public.order_items in access exclusive mode;

-- The old schema cannot establish fulfilment/payment semantics for old orders.
-- Refuse to guess, convert money, drop snapshots or silently backfill real history.
do $$
begin
  if exists (select 1 from public.orders) then
    raise exception 'Existing orders require a reviewed data migration before Lume House reconciliation';
  end if;
end;
$$;

-- Preserve UUID references as their exact text representation, while allowing the
-- reviewed local catalog's stable IDs (amber-candle, etc.). Never rename old IDs.
drop policy cart_items_owner_insert on public.cart_items;
drop policy cart_items_owner_update on public.cart_items;
alter table public.cart_items drop constraint cart_items_product_id_fkey;
alter table public.order_items drop constraint order_items_product_id_fkey;
alter table public.products alter column id drop default;
alter table public.products alter column id type text using id::text;
alter table public.cart_items alter column product_id type text using product_id::text;
alter table public.order_items alter column product_id type text using product_id::text;
alter table public.products add constraint products_id_shape
  check (id ~ '^[a-z0-9][a-z0-9-]{0,99}$');
alter table public.cart_items add constraint cart_items_product_id_fkey
  foreign key (product_id) references public.products(id) on delete cascade;
alter table public.order_items add constraint order_items_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

-- Archive non-NLE catalog rows without relabeling/converting their old prices.
-- Their cart references survive and resolve as unavailable through public reads.
update public.products set active = false where currency <> 'NLE';
alter table public.products alter column currency set default 'NLE';
alter table public.products add constraint products_active_nle
  check (not active or currency = 'NLE');
comment on column public.products.price_cents is
  'Legacy column name: integer minor units; 100 minor units per NLE. Not USD cents.';

create policy cart_items_owner_insert on public.cart_items
for insert to authenticated with check (
  exists (select 1 from public.carts where id = cart_id and user_id = (select auth.uid()))
  and exists (select 1 from public.products where id = product_id and active)
);
create policy cart_items_owner_update on public.cart_items
for update to authenticated using (
  exists (select 1 from public.carts where id = cart_id and user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.carts where id = cart_id and user_id = (select auth.uid()))
  and exists (select 1 from public.products where id = product_id and active)
);

-- Lazy owner-created profile: no auth.users trigger, passwords or duplicate email.
-- A profile is optional convenience data; carts/orders remain tied to auth identity.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(btrim(full_name)) between 1 and 200),
  phone text check (phone ~ '^\+232[0-9]{8}$'),
  default_street_address text check (char_length(btrim(default_street_address)) between 1 and 200),
  default_area text check (char_length(btrim(default_area)) between 1 and 200),
  default_city text check (char_length(btrim(default_city)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_commerce_updated_at();
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, full_name, phone, default_street_address, default_area, default_city)
  on public.profiles to authenticated;
grant update (full_name, phone, default_street_address, default_area, default_city)
  on public.profiles to authenticated;
grant all on public.profiles to service_role;
create policy profiles_owner_read on public.profiles
for select to authenticated using (id = (select auth.uid()));
create policy profiles_owner_insert on public.profiles
for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_owner_update on public.profiles
for update to authenticated using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Safe because the guard guarantees there are no legacy historical orders.
alter table public.orders rename column first_name to full_name;
alter table public.orders rename column email to customer_email;
alter table public.orders rename column phone to customer_phone;
alter table public.orders rename column address_line1 to delivery_street_address;
alter table public.orders rename column city to delivery_city;
alter table public.orders drop column last_name;
alter table public.orders drop column address_line2;
alter table public.orders drop column region;
alter table public.orders drop column postal_code;
alter table public.orders drop column country;
alter table public.orders alter column customer_phone set not null;
alter table public.orders alter column delivery_street_address drop not null;
alter table public.orders alter column delivery_city drop not null;
alter table public.orders drop constraint orders_currency_check;
alter table public.orders alter column currency set default 'NLE';
alter table public.orders add constraint orders_currency_check check (currency = 'NLE');
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('placed', 'confirmed', 'processing', 'ready_for_pickup',
    'out_for_delivery', 'completed', 'cancelled'));
alter table public.orders
  add column order_reference text not null unique
    default ('LH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)))
    check (order_reference ~ '^LH-[A-F0-9]{16}$'),
  add column fulfilment_method text not null check (fulfilment_method in ('delivery', 'pickup')),
  add column delivery_area text check (char_length(btrim(delivery_area)) between 1 and 200),
  add column delivery_instructions text check (char_length(delivery_instructions) <= 500),
  add column pickup_location text check (char_length(btrim(pickup_location)) between 1 and 200),
  add column payment_provider text not null check (payment_provider in ('orange', 'afri')),
  add column payment_status text not null default 'pending'
    check (payment_status in ('pending', 'awaiting_payment', 'paid', 'failed')),
  -- Payment number is not needed for order history. Only the last four digits
  -- may be retained. Full delivery/contact phone is a separate required snapshot.
  add column payment_phone_last4 text check (payment_phone_last4 ~ '^[0-9]{4}$'),
  add column payment_reference text check (char_length(btrim(payment_reference)) between 1 and 200),
  add column paid_at timestamptz,
  add constraint orders_contact_phone check (customer_phone ~ '^\+232[0-9]{8}$'),
  add constraint orders_paid_timestamp check ((payment_status = 'paid') = (paid_at is not null)),
  add constraint orders_fulfilment_snapshot check (
    (fulfilment_method = 'delivery' and delivery_street_address is not null
      and delivery_area is not null and delivery_city is not null
      and lower(btrim(delivery_city)) = 'freetown' and pickup_location is null)
    or
    (fulfilment_method = 'pickup' and pickup_location is not null
      and delivery_fee_cents = 0 and delivery_street_address is null
      and delivery_area is null and delivery_city is null and delivery_instructions is null)
  ),
  add constraint orders_fulfilment_status check (
    (status <> 'ready_for_pickup' or fulfilment_method = 'pickup')
    and (status <> 'out_for_delivery' or fulfilment_method = 'delivery')
  );
create index orders_owner_history_idx on public.orders(user_id, created_at desc, id desc);
create unique index orders_payment_reference_idx on public.orders(payment_provider, payment_reference)
  where payment_reference is not null;
comment on column public.orders.customer_email is
  'Immutable checkout contact snapshot for history/email, not a profile/auth email mirror.';
comment on column public.orders.delivery_fee_cents is
  'Actual approved fee in NLE minor units at order creation. No default/invented fee policy.';
comment on column public.orders.payment_phone_last4 is
  'Optional display suffix only. Never store mobile-money PIN, OTP, secrets or full payer number here.';
comment on table public.orders is
  'Historical checkout snapshots. Trusted transaction required; browser roles have SELECT only.';

-- Guard historical snapshots even against accidental trusted updates. Status,
-- verified payment metadata and updated_at may change; purchased facts may not.
create function public.protect_order_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.id, new.user_id, new.order_reference, new.full_name,
      new.customer_email, new.customer_phone, new.fulfilment_method,
      new.delivery_street_address, new.delivery_area, new.delivery_city,
      new.delivery_instructions, new.pickup_location, new.currency,
      new.subtotal_cents, new.delivery_fee_cents, new.total_cents,
      new.payment_provider, new.payment_phone_last4, new.created_at)
    is distinct from
    row(old.id, old.user_id, old.order_reference, old.full_name,
      old.customer_email, old.customer_phone, old.fulfilment_method,
      old.delivery_street_address, old.delivery_area, old.delivery_city,
      old.delivery_instructions, old.pickup_location, old.currency,
      old.subtotal_cents, old.delivery_fee_cents, old.total_cents,
      old.payment_provider, old.payment_phone_last4, old.created_at) then
    raise exception 'Historical order snapshot is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
create function public.protect_order_item_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.id, new.order_id, new.product_name, new.quantity, new.unit_price_cents, new.created_at)
    is distinct from
    row(old.id, old.order_id, old.product_name, old.quantity, old.unit_price_cents, old.created_at)
    or (new.product_id is distinct from old.product_id and new.product_id is not null) then
    raise exception 'Historical order item snapshot is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger orders_snapshot_immutable before update on public.orders
for each row execute function public.protect_order_snapshot();
create trigger order_items_snapshot_immutable before update on public.order_items
for each row execute function public.protect_order_item_snapshot();

-- Deferred consistency allows order + lines to be created in one transaction,
-- but prevents incomplete orders and line edits from corrupting historical totals.
create function public.check_order_line_total()
returns trigger language plpgsql set search_path = '' as $$
declare
  target_id uuid;
  expected_total integer;
  item_count bigint;
  actual_total numeric;
begin
  if tg_table_name = 'orders' then
    target_id := coalesce(new.id, old.id);
  else
    target_id := coalesce(new.order_id, old.order_id);
  end if;
  select subtotal_cents into expected_total from public.orders where id = target_id;
  if not found then return null; end if; -- Explicit trusted order deletion.
  select count(*), coalesce(sum(unit_price_cents::bigint * quantity), 0)
    into item_count, actual_total from public.order_items where order_id = target_id;
  if item_count = 0 or actual_total <> expected_total then
    raise exception 'Order requires items matching the historical subtotal' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger orders_line_total after insert or update on public.orders
deferrable initially deferred for each row execute function public.check_order_line_total();
create constraint trigger order_items_line_total after insert or update or delete on public.order_items
deferrable initially deferred for each row execute function public.check_order_line_total();
revoke all on function public.protect_order_snapshot(), public.protect_order_item_snapshot(),
  public.check_order_line_total() from public, anon, authenticated;

-- Minimal provider-agnostic durable work record, not an email implementation.
-- The future order transaction must enqueue once, then a server worker sends
-- after commit. No customer access, API keys or synthetic recipients.
create table public.order_confirmation_jobs (
  order_id uuid primary key references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'sent') = (sent_at is not null))
);
create index order_confirmation_pending_idx on public.order_confirmation_jobs(next_attempt_at)
  where status <> 'sent';
create trigger order_confirmation_jobs_updated_at before update on public.order_confirmation_jobs
for each row execute function public.set_commerce_updated_at();
alter table public.order_confirmation_jobs enable row level security;
revoke all on public.order_confirmation_jobs from public, anon, authenticated;
grant all on public.order_confirmation_jobs to service_role;
-- Orders/order_items retain their existing SELECT-only browser grants/policies.
commit;
