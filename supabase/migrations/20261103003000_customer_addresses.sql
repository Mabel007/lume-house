begin;
-- Customer saved addresses
-- Allows authenticated customers to store up to 5 delivery addresses
-- Owner-scoped access via RLS; zone_id validated against delivery config
-- Concurrency-safe default switching and limit enforcement

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 20),
  street_address text not null check (char_length(street_address) between 1 and 200),
  area text not null check (char_length(area) between 1 and 200),
  city text not null check (char_length(city) between 1 and 200),
  zone_id text not null check (zone_id in ('zone-1', 'zone-2', 'zone-3')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_addresses_customer_label_unique 
    unique (customer_id, label)
);

-- Partial unique index: only one default address per customer
create unique index customer_addresses_default_idx 
  on public.customer_addresses (customer_id) 
  where is_default = true;

-- Index for fast lookup by customer
create index customer_addresses_customer_idx 
  on public.customer_addresses (customer_id);

-- RLS: owner-scoped access only
alter table public.customer_addresses enable row level security;

create policy "Customers can view their own addresses"
  on public.customer_addresses for select
  to authenticated
  using (customer_id = auth.uid());

create policy "Customers can insert their own addresses"
  on public.customer_addresses for insert
  to authenticated
  with check (customer_id = auth.uid());

create policy "Customers can update their own addresses"
  on public.customer_addresses for update
  to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy "Customers can delete their own addresses"
  on public.customer_addresses for delete
  to authenticated
  using (customer_id = auth.uid());

-- Revoke default PUBLIC grants
revoke all on public.customer_addresses from public, anon;
revoke all on public.customer_addresses from authenticated;
grant select, delete on public.customer_addresses to authenticated;
grant insert(customer_id,label,street_address,area,city,zone_id),
  update(label,street_address,area,city,zone_id) on public.customer_addresses to authenticated;

-- Function: atomic default address switching (concurrency-safe)
-- SECURITY: Verifies caller ownership via auth.uid() match
create or replace function public.set_default_address(
  p_address_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.save_customer_address(p_address_id,'{"is_default":true}'::jsonb);
end;
$$;

-- Revoke default PUBLIC execute grant
revoke all on function public.set_default_address(uuid) from public, anon;
grant execute on function public.set_default_address(uuid) to authenticated;

-- Trigger function: concurrency-safe address limit enforcement
-- Uses advisory lock per customer to serialize inserts
create or replace function public.enforce_address_limit()
returns trigger 
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_address_count integer;
  v_lock_id bigint;
begin
  -- Verify caller is authenticated
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;
  
  -- Verify ownership
  if NEW.customer_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '28000';
  end if;
  
  if TG_OP = 'INSERT' then
    -- Acquire a customer-specific advisory lock to serialize concurrent inserts
    v_lock_id := hashtext(NEW.customer_id::text);
    perform pg_advisory_xact_lock(v_lock_id);
    
    -- Recheck count after acquiring lock
    select count(*) into v_address_count
    from public.customer_addresses
    where customer_id = NEW.customer_id;
    
    if v_address_count >= 5 then
      raise exception 'address_limit_reached' using errcode = '23514';
    end if;
  end if;
  
  return NEW;
end;
$$;

-- Revoke default PUBLIC execute grant
revoke all on function public.enforce_address_limit() from public, anon;
grant execute on function public.enforce_address_limit() to authenticated;

create trigger customer_addresses_limit_check
  before insert on public.customer_addresses
  for each row execute function public.enforce_address_limit();

-- Trigger: updated_at timestamp
create trigger customer_addresses_updated_at
  before update on public.customer_addresses
  for each row execute function public.set_commerce_updated_at();


-- All create/edit/default operations lock the customer before reading/writing rows.
-- This is additive; the original set_default_address(uuid) signature is preserved.
create or replace function public.save_customer_address(p_address_id uuid,p_address jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); address public.customer_addresses%rowtype; make_default boolean;
begin
  if owner_id is null then raise exception 'auth_required' using errcode='28000';end if;
  if p_address is null or jsonb_typeof(p_address)<>'object' then raise exception 'invalid_address' using errcode='22023';end if;
  if exists(select 1 from jsonb_each(p_address) e where e.key not in ('label','street_address','area','city','zone_id','is_default')
    or (e.key='is_default' and jsonb_typeof(e.value)<>'boolean')
    or (e.key<>'is_default' and jsonb_typeof(e.value)<>'string')) then
    raise exception 'invalid_address' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(owner_id::text)::bigint);
  if p_address_id is not null then
    select a.* into address from public.customer_addresses a where a.id=p_address_id and a.customer_id=owner_id for update;
    if not found then raise exception 'address_not_found' using errcode='P0002';end if;
  end if;
  make_default:=coalesce((p_address->>'is_default')::boolean,address.is_default,false);
  address.label:=btrim(coalesce(p_address->>'label',address.label));
  address.street_address:=btrim(coalesce(p_address->>'street_address',address.street_address));
  address.area:=btrim(coalesce(p_address->>'area',address.area));
  address.city:=btrim(coalesce(p_address->>'city',address.city));
  address.zone_id:=coalesce(p_address->>'zone_id',address.zone_id);
  if lower(address.city) is distinct from 'freetown' then raise exception 'unsupported_city' using errcode='22023';end if;
  if make_default then
    update public.customer_addresses set is_default=false where customer_id=owner_id and is_default;
  end if;
  if p_address_id is null then
    insert into public.customer_addresses(customer_id,label,street_address,area,city,zone_id,is_default)
    values(owner_id,address.label,address.street_address,address.area,address.city,address.zone_id,make_default)
    returning * into address;
  else
    update public.customer_addresses set label=address.label,street_address=address.street_address,
      area=address.area,city=address.city,zone_id=address.zone_id,is_default=make_default
    where id=p_address_id and customer_id=owner_id returning * into address;
  end if;
  return to_jsonb(address);
end;
$$;
revoke all on function public.save_customer_address(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_customer_address(uuid,jsonb) to authenticated;

commit;
