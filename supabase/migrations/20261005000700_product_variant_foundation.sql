-- Expand first. No cart cutover, checkout replacement or historical backfill.
begin;
create function public.valid_variant_options(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(value) = 'object' then
    pg_catalog.octet_length(value::text) <= 2000
    and (select count(*) <= 8 from jsonb_each(value))
    and not exists(select 1 from jsonb_each(value) entry
      where char_length(btrim(entry.key)) not between 1 and 40
        or jsonb_typeof(entry.value) <> 'string'
        or char_length(btrim(entry.value #>> '{}')) not between 1 and 100)
    else false end;
$$;
revoke all on function public.valid_variant_options(jsonb) from public;
grant execute on function public.valid_variant_options(jsonb) to anon,authenticated,service_role;

create table public.product_variants (
  id text primary key default gen_random_uuid()::text check(char_length(id) between 1 and 150),
  product_id text not null references public.products(id) on delete cascade,
  sku text not null unique check(char_length(sku) between 1 and 150),
  options jsonb not null default '{}'::jsonb check(public.valid_variant_options(options)),
  is_default boolean not null default false,
  price_cents integer not null check(price_cents >= 0),
  currency text not null default 'NLE' check(currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  inventory_policy text not null default 'untracked' check(inventory_policy in ('untracked','tracked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id,options),
  unique(id,product_id),
  constraint variant_default_identity check (
    (is_default and id = 'default:' || product_id and sku = 'DEFAULT-' || product_id and options = '{}')
    or (not is_default and id not like 'default:%' and sku not like 'DEFAULT-%' and options <> '{}')),
  constraint variant_active_currency check(not active or currency = 'NLE'),
  -- Tracked purchases stay disabled until trusted allocation is implemented.
  constraint variant_inventory_ready check(not active or inventory_policy = 'untracked')
);
create unique index product_variants_one_default on public.product_variants(product_id) where is_default;
create trigger product_variants_updated_at before update on public.product_variants
for each row execute function public.set_commerce_updated_at();

-- IDs/SKUs are injective over the existing stable product IDs, with reserved
-- technical namespaces. No fake Color/Size option or finite stock is invented.
insert into public.product_variants(id,product_id,sku,is_default,price_cents,currency,active)
select 'default:' || id,id,'DEFAULT-' || id,true,price_cents,currency,active from public.products;

-- Temporary compatibility bridge: legacy product prices remain the purchase
-- authority until the later variant checkout migration. New products get a default.
create function public.sync_legacy_default_variant()
returns trigger language plpgsql set search_path = '' as $$
begin
  insert into public.product_variants(id,product_id,sku,is_default,price_cents,currency,active)
  values('default:' || new.id,new.id,'DEFAULT-' || new.id,true,new.price_cents,new.currency,new.active)
  on conflict (id) do update set price_cents=excluded.price_cents,currency=excluded.currency,active=excluded.active;
  return new;
end;
$$;
revoke all on function public.sync_legacy_default_variant() from public,anon,authenticated;
create trigger products_legacy_default_variant after insert or update of price_cents,currency,active on public.products
for each row execute function public.sync_legacy_default_variant();

alter table public.product_variants enable row level security;
revoke all on public.product_variants from public,anon,authenticated;
grant select(id,product_id,options,is_default,price_cents,currency,active,inventory_policy)
  on public.product_variants to anon,authenticated;
grant all on public.product_variants to service_role;
create policy product_variants_public_active_read on public.product_variants
for select to anon,authenticated using(active and exists(
  select 1 from public.products where products.id=product_id and products.active));

alter table public.order_items
  add column variant_id text references public.product_variants(id) on delete restrict,
  add column variant_sku text,
  add column variant_options jsonb,
  add column variant_currency text,
  add constraint order_items_variant_parent foreign key(variant_id,product_id)
    references public.product_variants(id,product_id),
  add constraint order_items_variant_snapshot_shape check (
    (variant_id is null and variant_sku is null and variant_options is null and variant_currency is null)
    or (variant_id is not null and variant_sku is not null and char_length(variant_sku) between 1 and 150
      and variant_options is not null and public.valid_variant_options(variant_options) and variant_currency = 'NLE'));
-- PostgreSQL CHECK treats null as passing: explicitly guard snapshot currency.
alter table public.order_items add constraint order_items_variant_currency_present
  check(variant_id is null or variant_currency is not null);
comment on column public.order_items.variant_id is 'Nullable for genuine legacy history. Never backfill fictional variant purchases.';
create or replace function public.protect_order_item_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.id,new.order_id,new.product_name,new.quantity,new.unit_price_cents,new.created_at,
      new.variant_id,new.variant_sku,new.variant_options,new.variant_currency)
    is distinct from row(old.id,old.order_id,old.product_name,old.quantity,old.unit_price_cents,old.created_at,
      old.variant_id,old.variant_sku,old.variant_options,old.variant_currency)
    or (new.product_id is distinct from old.product_id and new.product_id is not null) then
    raise exception 'Historical order item snapshot is immutable' using errcode='23514';
  end if;
  return new;
end;
$$;
commit;
