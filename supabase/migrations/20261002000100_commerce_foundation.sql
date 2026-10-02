-- Phase 2 foundation. Apply once to the EXISTING hng-shop project.
-- No identity fixtures, order RPCs, payments, OAuth or email integration.
begin;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  image_path text not null check (image_path like '/images/%' or image_path like 'https://%'),
  category text not null check (char_length(btrim(category)) between 1 and 100),
  background_color text not null default '#e9e3d8' check (background_color ~ '^#[0-9a-fA-F]{6}$'),
  display_order integer not null default 0 check (display_order >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id)
);
create index cart_items_product_id_idx on public.cart_items(product_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  -- Preserve history: deleting an account requires an explicit future retention policy.
  user_id uuid not null references auth.users(id) on delete restrict,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 200),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 200),
  email text not null check (char_length(btrim(email)) between 3 and 254),
  phone text check (char_length(phone) <= 200),
  address_line1 text not null check (char_length(btrim(address_line1)) between 1 and 200),
  address_line2 text check (char_length(address_line2) <= 200),
  city text not null check (char_length(btrim(city)) between 1 and 200),
  region text not null check (char_length(btrim(region)) between 1 and 200),
  postal_code text not null check (char_length(btrim(postal_code)) between 1 and 200),
  country text not null check (char_length(btrim(country)) between 1 and 200),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  delivery_fee_cents integer not null check (delivery_fee_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  status text not null default 'placed' check (status in ('placed', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_cents::bigint = subtotal_cents::bigint + delivery_fee_cents::bigint)
);
create index orders_user_id_idx on public.orders(user_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null check (char_length(btrim(product_name)) between 1 and 200),
  quantity integer not null check (quantity between 1 and 99),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);
create index order_items_product_id_idx on public.order_items(product_id);
comment on column public.order_items.unit_price_cents is 'Actual price paid at checkout; never re-derived from current catalog prices.';
comment on column public.order_items.product_name is 'Historical name preserved even if the product is renamed or deleted.';

create function public.set_commerce_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_commerce_updated_at() from public, anon, authenticated;
create trigger products_updated_at before update on public.products
for each row execute function public.set_commerce_updated_at();
create trigger cart_items_updated_at before update on public.cart_items
for each row execute function public.set_commerce_updated_at();
create trigger orders_updated_at before update on public.orders
for each row execute function public.set_commerce_updated_at();

alter table public.products enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Override permissive Supabase default grants on these new tables only.
revoke all on table public.products, public.carts, public.cart_items,
  public.orders, public.order_items from public, anon, authenticated;
grant select on public.products to anon, authenticated;
grant select, delete on public.carts, public.cart_items to authenticated;
grant insert (user_id) on public.carts to authenticated;
grant insert (cart_id, product_id, quantity) on public.cart_items to authenticated;
grant update (quantity) on public.cart_items to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant all on public.products, public.carts, public.cart_items,
  public.orders, public.order_items to service_role;

create policy products_public_active_read on public.products
for select to anon, authenticated using (active);

create policy carts_owner_read on public.carts
for select to authenticated using (user_id = (select auth.uid()));
create policy carts_owner_insert on public.carts
for insert to authenticated with check (user_id = (select auth.uid()));
create policy carts_owner_delete on public.carts
for delete to authenticated using (user_id = (select auth.uid()));

create policy cart_items_owner_read on public.cart_items
for select to authenticated using (
  exists (select 1 from public.carts where id = cart_id and user_id = (select auth.uid()))
);
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
create policy cart_items_owner_delete on public.cart_items
for delete to authenticated using (
  exists (select 1 from public.carts where id = cart_id and user_id = (select auth.uid()))
);

-- No browser INSERT/UPDATE/DELETE grants or policies for orders or their snapshots.
-- Later trusted order creation must validate identity, fetch current prices,
-- calculate totals and atomically persist order + immutable snapshots.
create policy orders_owner_read on public.orders
for select to authenticated using (user_id = (select auth.uid()));
create policy order_items_owner_read on public.order_items
for select to authenticated using (
  exists (select 1 from public.orders where id = order_id and user_id = (select auth.uid()))
);

commit;
