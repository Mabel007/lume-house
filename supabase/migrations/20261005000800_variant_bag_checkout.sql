begin;
alter table public.carts add column cart_version smallint not null default 1 check(cart_version in (1,2));
create table public.variant_cart_items (
  cart_id uuid not null references public.carts(id) on delete cascade,
  variant_id text not null references public.product_variants(id) on delete restrict,
  quantity integer not null check(quantity between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(cart_id,variant_id)
);
create trigger variant_cart_items_updated_at before update on public.variant_cart_items
for each row execute function public.set_commerce_updated_at();
alter table public.variant_cart_items enable row level security;
revoke all on public.variant_cart_items from public,anon,authenticated;
grant select on public.variant_cart_items to authenticated;
grant all on public.variant_cart_items to service_role;
create policy variant_cart_items_owner_read on public.variant_cart_items for select to authenticated
using(exists(select 1 from public.carts where carts.id=cart_id and user_id=(select auth.uid())));

-- Stable receipts make guest checkpoint retries safe even after an ambiguous
-- network response. No expiry/cleanup policy is invented in this migration.
create table public.variant_cart_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  variant_id text not null,
  mode text not null,
  quantity integer,
  expected_quantity integer,
  created_at timestamptz not null default now(),
  primary key(user_id,operation_id)
);
alter table public.variant_cart_operations enable row level security;
revoke all on public.variant_cart_operations from public,anon,authenticated;
grant select on public.variant_cart_operations to service_role;

-- Promoting an owned cart is atomic and uses the same owner advisory lock as
-- checkout/mutation. Unavailable defaults are retained, not silently dropped.
create function public.ensure_variant_cart()
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); target public.carts%rowtype;
begin
  if uid is null or not exists(select 1 from auth.users where id=uid) then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,0));
  insert into public.carts(user_id) values(uid) on conflict(user_id) do nothing;
  select * into target from public.carts where user_id=uid for update;
  if target.cart_version=1 then
    perform 1 from public.cart_items where cart_id=target.id order by product_id for update;
    if exists(select 1 from public.cart_items ci left join public.product_variants v
      on v.product_id=ci.product_id and v.is_default where ci.cart_id=target.id and v.id is null) then
      raise exception 'CART_CHANGED';
    end if;
    insert into public.variant_cart_items(cart_id,variant_id,quantity,created_at,updated_at)
      select ci.cart_id,v.id,ci.quantity,ci.created_at,ci.updated_at from public.cart_items ci
      join public.product_variants v on v.product_id=ci.product_id and v.is_default where ci.cart_id=target.id;
    delete from public.cart_items where cart_id=target.id;
    update public.carts set cart_version=2 where id=target.id;
  end if;
  return target.id;
end;
$$;
create function public.variant_cart_payload(target uuid)
returns jsonb language sql set search_path='' as $$
  select jsonb_build_object('id',target,'items',coalesce((select jsonb_agg(jsonb_build_object(
    'product_id',v.product_id,'variant_id',ci.variant_id,'quantity',ci.quantity) order by ci.variant_id)
    from public.variant_cart_items ci join public.product_variants v on v.id=ci.variant_id where ci.cart_id=target),'[]'::jsonb));
$$;
revoke all on function public.ensure_variant_cart(),public.variant_cart_payload(uuid) from public,anon,authenticated;
create function public.load_variant_cart()
returns jsonb language plpgsql security definer set search_path='' as $$
begin return public.variant_cart_payload(public.ensure_variant_cart()); end;
$$;
revoke all on function public.load_variant_cart() from public,anon;
grant execute on function public.load_variant_cart() to authenticated;

create function public.change_variant_cart(p_variant_id text,p_mode text,p_quantity integer,p_expected_quantity integer,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); target uuid; current_quantity integer; candidate integer; receipt public.variant_cart_operations%rowtype;
begin
  target:=public.ensure_variant_cart();
  if p_operation_id is null or p_variant_id is null or char_length(p_variant_id) not between 1 and 150
    or p_mode is null or p_mode not in ('add','set','remove','merge') then raise exception 'INVALID_REQUEST'; end if;
  select * into receipt from public.variant_cart_operations where user_id=uid and operation_id=p_operation_id;
  if found then
    if row(receipt.variant_id,receipt.mode,receipt.quantity,receipt.expected_quantity)
      is distinct from row(p_variant_id,p_mode,p_quantity,p_expected_quantity) then raise exception 'INVALID_REQUEST'; end if;
    return public.variant_cart_payload(target);
  end if;
  select quantity into current_quantity from public.variant_cart_items where cart_id=target and variant_id=p_variant_id for update;
  current_quantity:=coalesce(current_quantity,0);
  if p_mode in ('set','remove') and (p_expected_quantity is null or p_expected_quantity<>current_quantity) then raise exception 'CART_CHANGED'; end if;
  if p_mode='remove' then
    delete from public.variant_cart_items where cart_id=target and variant_id=p_variant_id;
  else
    if p_quantity is null or p_quantity not between 1 and 99 then raise exception 'INVALID_REQUEST'; end if;
    perform 1 from public.product_variants v join public.products p on p.id=v.product_id
      where v.id=p_variant_id and v.active and p.active and v.currency='NLE' and v.inventory_policy='untracked' for share of v,p;
    if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if p_mode='set' and current_quantity=0 then raise exception 'CART_CHANGED'; end if;
    candidate:=case when p_mode='set' then p_quantity else least(99,current_quantity+p_quantity) end;
    if current_quantity=0 and (select count(*) from public.variant_cart_items where cart_id=target)>=100 then raise exception 'CART_LIMIT'; end if;
    insert into public.variant_cart_items(cart_id,variant_id,quantity) values(target,p_variant_id,candidate)
      on conflict(cart_id,variant_id) do update set quantity=excluded.quantity;
  end if;
  insert into public.variant_cart_operations(user_id,operation_id,variant_id,mode,quantity,expected_quantity)
    values(uid,p_operation_id,p_variant_id,p_mode,p_quantity,p_expected_quantity);
  return public.variant_cart_payload(target);
end;
$$;
revoke all on function public.change_variant_cart(text,text,integer,integer,uuid) from public,anon;
grant execute on function public.change_variant_cart(text,text,integer,integer,uuid) to authenticated;

-- Legacy clients may still operate on unpromoted carts. Once promoted, they
-- cannot mutate the new variant intent through product-only table predicates.
drop policy cart_items_owner_insert on public.cart_items;
drop policy cart_items_owner_update on public.cart_items;
create policy cart_items_owner_insert on public.cart_items for insert to authenticated with check(
  exists(select 1 from public.carts where id=cart_id and user_id=(select auth.uid()) and cart_version=1)
  and exists(select 1 from public.products where id=product_id and active));
create policy cart_items_owner_update on public.cart_items for update to authenticated using(
  exists(select 1 from public.carts where id=cart_id and user_id=(select auth.uid()) and cart_version=1)) with check(
  exists(select 1 from public.carts where id=cart_id and user_id=(select auth.uid()) and cart_version=1)
  and exists(select 1 from public.products where id=product_id and active));

-- Serialize legacy statements before their row locks. A stale RLS statement
-- snapshot must not insert product-only intent after another client promotes
-- the cart. The row guard rechecks the locked parent in trusted execution.
create function public.lock_legacy_cart_statement()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  end if;
  return null;
end;
$$;
create function public.guard_legacy_cart_version()
returns trigger language plpgsql security definer set search_path='' as $$
declare version smallint;
begin
  select cart_version into version from public.carts
    where id=case when tg_op='DELETE' then old.cart_id else new.cart_id end
      and (auth.uid() is null or user_id=auth.uid()) for update;
  if tg_op='DELETE' and version is null then return old; end if;
  if version is null then raise exception 'Not permitted' using errcode='42501'; end if;
  if version is distinct from 1 then raise exception 'CART_CHANGED'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function public.lock_legacy_cart_statement(),public.guard_legacy_cart_version() from public,anon,authenticated;
create trigger cart_items_serialize_legacy before insert or update or delete on public.cart_items
for each statement execute function public.lock_legacy_cart_statement();
create trigger cart_items_guard_version before insert or update or delete on public.cart_items
for each row execute function public.guard_legacy_cart_version();

-- Preserve product-only legacy uniqueness; new orders can contain two variants
-- of the same parent, while each purchasable identity still has one line.
alter table public.order_items drop constraint order_items_order_id_product_id_key;
create unique index order_items_legacy_product_unique on public.order_items(order_id,product_id) where variant_id is null;
create unique index order_items_variant_unique on public.order_items(order_id,variant_id) where variant_id is not null;

create or replace function public.place_order(p_request_id uuid, p_checkout jsonb, p_expected_cart jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target_cart_id uuid;
  result public.orders%rowtype;
  line record;
  subtotal bigint := 0;
  fee integer := 0;
  line_count integer := 0;
  snapshots jsonb := '[]'::jsonb;
  quote jsonb := '[]'::jsonb;
  method text := p_checkout->>'fulfilment';
  provider text := p_checkout->>'provider';
  zone text;
  zone_label text;
  contact_name text := btrim(p_checkout->>'full_name');
  contact_email text := btrim(p_checkout->>'email');
  contact_phone text := p_checkout->>'contact_phone';
  payer_phone text := p_checkout->>'payment_phone';
  street text;
  area text;
  city text;
  instructions text;
begin
  if uid is null or not exists(select 1 from auth.users where id = uid) then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_request_id is null then raise exception 'INVALID_REQUEST'; end if;
  -- Serializes all checkouts for this identity, including same-key concurrent retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  select * into result from public.orders where user_id = uid and checkout_request_id = p_request_id;
  if found then
    return jsonb_build_object('id', result.id, 'reference', result.order_reference, 'total', result.total_cents,
      'currency', result.currency, 'status', result.status, 'payment_status', result.payment_status);
  end if;
  if jsonb_typeof(p_checkout) is distinct from 'object' or jsonb_typeof(p_expected_cart) is distinct from 'array'
    or pg_catalog.octet_length(p_checkout::text) > 8000 then raise exception 'INVALID_CHECKOUT'; end if;
  if jsonb_array_length(p_expected_cart)>100 then raise exception 'CART_LIMIT'; end if;
  if contact_name is null or char_length(contact_name) not between 1 and 200
    or contact_email is null or char_length(contact_email) not between 3 and 254
    or contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or contact_phone is null or contact_phone !~ '^\+232[0-9]{8}$'
    or payer_phone is null or payer_phone !~ '^\+232[0-9]{8}$'
    or method is null or method not in ('delivery','pickup')
    or provider is null or provider not in ('orange','afri') then raise exception 'INVALID_CHECKOUT'; end if;
  if method = 'delivery' then
    zone := p_checkout->>'zone_id';
    case zone
      when 'zone-1' then fee := 4000; zone_label := 'Goderich to Lumley';
      when 'zone-2' then fee := 5000; zone_label := 'Lumley to Congo Cross, including Aberdeen';
      when 'zone-3' then fee := 6000; zone_label := 'Congo Cross to Central Freetown';
      else raise exception 'INVALID_DELIVERY_ZONE';
    end case;
    street := btrim(p_checkout->>'street'); area := btrim(p_checkout->>'area'); city := btrim(p_checkout->>'city');
    instructions := nullif(btrim(p_checkout->>'instructions'), '');
    if street is null or char_length(street) not between 1 and 200
      or area is null or char_length(area) not between 1 and 200
      or city is null or char_length(city) not between 1 and 200 or lower(city) <> 'freetown'
      or char_length(instructions) > 500 then raise exception 'INVALID_DELIVERY_DETAILS'; end if;
    city := 'Freetown';
  end if;
  select id into target_cart_id from public.carts where user_id = uid for update;
  if not found then raise exception 'EMPTY_CART'; end if;
  if exists(select 1 from public.carts where id=target_cart_id and cart_version<>1) then raise exception 'CART_CHANGED'; end if;
  -- Parent lock blocks new FK inserts; item/product locks prevent edits/repricing
  -- between validation and conversion. Deterministic order avoids lock inversion.
  for line in
    select ci.product_id,ci.quantity,p.name,v.price_cents,v.currency,(p.active and v.active) as active,
      v.id as variant_id,v.sku,v.options,v.inventory_policy
    from public.cart_items ci join public.products p on p.id=ci.product_id
    join public.product_variants v on v.product_id=p.id and v.is_default
    where ci.cart_id=target_cart_id order by ci.product_id
    for update of ci for share of p,v
  loop
    if line.inventory_policy <> 'untracked' or not line.active or line.currency <> 'NLE' or line.quantity not between 1 and 99
      or line.price_cents < 0 then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    line_count := line_count + 1;
    if line_count > 100 then raise exception 'CART_LIMIT'; end if;
    subtotal := subtotal + line.price_cents::bigint * line.quantity;
    if subtotal + fee > 2147483647 then raise exception 'ORDER_TOTAL_LIMIT'; end if;
    snapshots := snapshots || jsonb_build_array(jsonb_build_object('product_id',line.product_id,
      'name',line.name,'quantity',line.quantity,'price',line.price_cents,
      'variant_id',line.variant_id,'sku',line.sku,'options',line.options,'currency',line.currency));
    quote := quote || jsonb_build_array(jsonb_build_object('product_id',line.product_id,
      'quantity',line.quantity,'unit_price',line.price_cents));
  end loop;
  if line_count = 0 then raise exception 'EMPTY_CART'; end if;
  -- Expected prices are ONLY a change detector/customer review guard. Neither
  -- they nor any submitted totals/fees/status/labels are used to create the order.
  if quote is distinct from p_expected_cart then raise exception 'CART_CHANGED'; end if;
  set constraints public.orders_line_total, public.order_items_line_total deferred;
  insert into public.orders(user_id,checkout_request_id,full_name,customer_email,customer_phone,
    fulfilment_method,delivery_street_address,delivery_area,delivery_city,delivery_instructions,
    delivery_zone_id,delivery_zone_label,pickup_location,payment_provider,payment_status,payment_phone_last4,
    currency,subtotal_cents,delivery_fee_cents,total_cents,status)
  values(uid,p_request_id,contact_name,contact_email,contact_phone,method,street,area,city,instructions,
    zone,zone_label,case when method='pickup' then 'Lumley, Freetown' else null end,
    provider,'awaiting_payment',right(payer_phone,4),'NLE',subtotal::integer,fee,(subtotal+fee)::integer,'placed')
  returning * into result;
  insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents,variant_id,variant_sku,variant_options,variant_currency)
    select result.id,item->>'product_id',item->>'name',(item->>'quantity')::integer,(item->>'price')::integer,
      item->>'variant_id',item->>'sku',item->'options',item->>'currency'
    from jsonb_array_elements(snapshots) item;
  insert into public.order_confirmation_jobs(order_id) values(result.id);
  delete from public.cart_items where cart_items.cart_id = target_cart_id;
  set constraints public.orders_line_total, public.order_items_line_total immediate;
  return jsonb_build_object('id',result.id,'reference',result.order_reference,'total',result.total_cents,
    'currency',result.currency,'status',result.status,'payment_status',result.payment_status);
end;
$$;

create or replace function public.place_variant_order(p_request_id uuid, p_checkout jsonb, p_expected_cart jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target_cart_id uuid;
  result public.orders%rowtype;
  line record;
  subtotal bigint := 0;
  fee integer := 0;
  line_count integer := 0;
  snapshots jsonb := '[]'::jsonb;
  quote jsonb := '[]'::jsonb;
  method text := p_checkout->>'fulfilment';
  provider text := p_checkout->>'provider';
  zone text;
  zone_label text;
  contact_name text := btrim(p_checkout->>'full_name');
  contact_email text := btrim(p_checkout->>'email');
  contact_phone text := p_checkout->>'contact_phone';
  payer_phone text := p_checkout->>'payment_phone';
  street text;
  area text;
  city text;
  instructions text;
begin
  if uid is null or not exists(select 1 from auth.users where id = uid) then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if p_request_id is null then raise exception 'INVALID_REQUEST'; end if;
  -- Serializes all checkouts for this identity, including same-key concurrent retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  select * into result from public.orders where user_id = uid and checkout_request_id = p_request_id;
  if found then
    return jsonb_build_object('id', result.id, 'reference', result.order_reference, 'total', result.total_cents,
      'currency', result.currency, 'status', result.status, 'payment_status', result.payment_status);
  end if;
  if jsonb_typeof(p_checkout) is distinct from 'object' or jsonb_typeof(p_expected_cart) is distinct from 'array'
    or pg_catalog.octet_length(p_checkout::text) > 8000 then raise exception 'INVALID_CHECKOUT'; end if;
  if jsonb_array_length(p_expected_cart)>100 then raise exception 'CART_LIMIT'; end if;
  if contact_name is null or char_length(contact_name) not between 1 and 200
    or contact_email is null or char_length(contact_email) not between 3 and 254
    or contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or contact_phone is null or contact_phone !~ '^\+232[0-9]{8}$'
    or payer_phone is null or payer_phone !~ '^\+232[0-9]{8}$'
    or method is null or method not in ('delivery','pickup')
    or provider is null or provider not in ('orange','afri') then raise exception 'INVALID_CHECKOUT'; end if;
  if method = 'delivery' then
    zone := p_checkout->>'zone_id';
    case zone
      when 'zone-1' then fee := 4000; zone_label := 'Goderich to Lumley';
      when 'zone-2' then fee := 5000; zone_label := 'Lumley to Congo Cross, including Aberdeen';
      when 'zone-3' then fee := 6000; zone_label := 'Congo Cross to Central Freetown';
      else raise exception 'INVALID_DELIVERY_ZONE';
    end case;
    street := btrim(p_checkout->>'street'); area := btrim(p_checkout->>'area'); city := btrim(p_checkout->>'city');
    instructions := nullif(btrim(p_checkout->>'instructions'), '');
    if street is null or char_length(street) not between 1 and 200
      or area is null or char_length(area) not between 1 and 200
      or city is null or char_length(city) not between 1 and 200 or lower(city) <> 'freetown'
      or char_length(instructions) > 500 then raise exception 'INVALID_DELIVERY_DETAILS'; end if;
    city := 'Freetown';
  end if;
  target_cart_id:=public.ensure_variant_cart();
  -- Parent lock blocks new FK inserts; item/product locks prevent edits/repricing
  -- between validation and conversion. Deterministic order avoids lock inversion.
  for line in
    select v.product_id,ci.quantity,p.name,v.price_cents,v.currency,(p.active and v.active) as active,
      v.id as variant_id,v.sku,v.options,v.inventory_policy
    from public.variant_cart_items ci join public.product_variants v on v.id=ci.variant_id
    join public.products p on p.id=v.product_id
    where ci.cart_id=target_cart_id order by ci.variant_id
    for update of ci for share of p,v
  loop
    if line.inventory_policy <> 'untracked' or not line.active or line.currency <> 'NLE' or line.quantity not between 1 and 99
      or line.price_cents < 0 then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    line_count := line_count + 1;
    if line_count > 100 then raise exception 'CART_LIMIT'; end if;
    subtotal := subtotal + line.price_cents::bigint * line.quantity;
    if subtotal + fee > 2147483647 then raise exception 'ORDER_TOTAL_LIMIT'; end if;
    snapshots := snapshots || jsonb_build_array(jsonb_build_object('product_id',line.product_id,
      'name',line.name,'quantity',line.quantity,'price',line.price_cents,
      'variant_id',line.variant_id,'sku',line.sku,'options',line.options,'currency',line.currency));
    quote := quote || jsonb_build_array(jsonb_build_object('product_id',line.product_id,
      'variant_id',line.variant_id,'quantity',line.quantity,'unit_price',line.price_cents));
  end loop;
  if line_count = 0 then raise exception 'EMPTY_CART'; end if;
  -- Expected prices are ONLY a change detector/customer review guard. Neither
  -- they nor any submitted totals/fees/status/labels are used to create the order.
  if quote is distinct from (select coalesce(jsonb_agg(item order by item->>'variant_id'),'[]'::jsonb) from jsonb_array_elements(p_expected_cart) item) then raise exception 'CART_CHANGED'; end if;
  set constraints public.orders_line_total, public.order_items_line_total deferred;
  insert into public.orders(user_id,checkout_request_id,full_name,customer_email,customer_phone,
    fulfilment_method,delivery_street_address,delivery_area,delivery_city,delivery_instructions,
    delivery_zone_id,delivery_zone_label,pickup_location,payment_provider,payment_status,payment_phone_last4,
    currency,subtotal_cents,delivery_fee_cents,total_cents,status)
  values(uid,p_request_id,contact_name,contact_email,contact_phone,method,street,area,city,instructions,
    zone,zone_label,case when method='pickup' then 'Lumley, Freetown' else null end,
    provider,'awaiting_payment',right(payer_phone,4),'NLE',subtotal::integer,fee,(subtotal+fee)::integer,'placed')
  returning * into result;
  insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents,variant_id,variant_sku,variant_options,variant_currency)
    select result.id,item->>'product_id',item->>'name',(item->>'quantity')::integer,(item->>'price')::integer,
      item->>'variant_id',item->>'sku',item->'options',item->>'currency'
    from jsonb_array_elements(snapshots) item;
  insert into public.order_confirmation_jobs(order_id) values(result.id);
  delete from public.variant_cart_items where variant_cart_items.cart_id=target_cart_id;
  set constraints public.orders_line_total, public.order_items_line_total immediate;
  return jsonb_build_object('id',result.id,'reference',result.order_reference,'total',result.total_cents,
    'currency',result.currency,'status',result.status,'payment_status',result.payment_status);
end;
$$;
revoke all on function public.place_variant_order(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.place_variant_order(uuid,jsonb,jsonb) to authenticated;
commit;
