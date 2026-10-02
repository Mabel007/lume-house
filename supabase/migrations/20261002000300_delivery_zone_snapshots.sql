-- LOCAL PREPARATION ONLY. Hosted application requires separate authorization.
begin;
-- Nullable pair preserves old delivery history without inventing a chosen zone.
alter table public.orders
 add column delivery_zone_id text,
 add column delivery_zone_label text,
 add constraint orders_delivery_zone_snapshot check (
   (delivery_zone_id is null and delivery_zone_label is null)
   or (fulfilment_method = 'delivery' and delivery_zone_id is not null
     and delivery_zone_label is not null
     and delivery_zone_id ~ '^[a-z0-9][a-z0-9-]{0,99}$'
     and char_length(btrim(delivery_zone_label)) between 1 and 200)
 );
comment on column public.orders.delivery_zone_id is
 'Historical configuration ID, not a FK. Trusted creation must supply for new delivery orders; legacy snapshots may be null.';
comment on column public.orders.delivery_zone_label is
 'Immutable coverage label at checkout; independent of future zone edits. Fee remains delivery_fee_cents.';
create function public.protect_order_zone_snapshot()
returns trigger language plpgsql set search_path = '' as $$
begin
 if row(new.delivery_zone_id, new.delivery_zone_label) is distinct from
    row(old.delivery_zone_id, old.delivery_zone_label) then
   raise exception 'Historical delivery zone snapshot is immutable' using errcode = '23514';
 end if;
 return new;
end;
$$;
revoke all on function public.protect_order_zone_snapshot() from public, anon, authenticated;
create trigger orders_zone_snapshot_immutable before update on public.orders
for each row execute function public.protect_order_zone_snapshot();
-- Existing ownership RLS, grants and all historical snapshot guards unchanged.
commit;
