-- No inventory quantities are backfilled. Current variants stay untracked.
begin;
create table public.variant_inventory (
  variant_id text primary key references public.product_variants(id) on delete restrict,
  on_hand integer not null check(on_hand>=0),
  allocated integer not null default 0 check(allocated>=0 and allocated<=on_hand),
  updated_at timestamptz not null default now()
);
create trigger variant_inventory_updated_at before update on public.variant_inventory
for each row execute function public.set_commerce_updated_at();
create table public.inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  variant_id text not null references public.product_variants(id) on delete restrict,
  event text not null check(event in ('stock_adjustment','order_allocation')),
  on_hand_delta integer not null,
  allocated_delta integer not null,
  on_hand_after integer not null check(on_hand_after>=0),
  allocated_after integer not null check(allocated_after>=0 and allocated_after<=on_hand_after),
  order_id uuid references public.orders(id) on delete restrict,
  reason text not null check(char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  constraint inventory_event_shape check(
    (event='stock_adjustment' and order_id is null and allocated_delta=0)
    or (event='order_allocation' and order_id is not null and on_hand_delta=0 and allocated_delta>0))
);
create unique index inventory_one_order_allocation on public.inventory_ledger(order_id,variant_id)
where event='order_allocation';
alter table public.variant_inventory enable row level security;
alter table public.inventory_ledger enable row level security;
revoke all on public.variant_inventory,public.inventory_ledger from public,anon,authenticated,service_role;
grant select on public.variant_inventory,public.inventory_ledger to service_role;
create function public.protect_inventory_ledger()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Inventory history is immutable' using errcode='23514'; end;
$$;
revoke all on function public.protect_inventory_ledger() from public,anon,authenticated;
create trigger inventory_ledger_immutable before update or delete on public.inventory_ledger
for each row execute function public.protect_inventory_ledger();

-- Service-only, explicit actual adjustments. Zero may initialize a genuinely
-- empty tracked variant; no existing catalogue row receives an invented count.
create function public.adjust_variant_inventory(p_variant_id text,p_delta integer,p_reason text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stock public.variant_inventory%rowtype; receipt public.inventory_ledger%rowtype; candidate bigint;
begin
  if p_variant_id is null or p_delta is null or p_operation_id is null
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'INVALID_INVENTORY_ADJUSTMENT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('inventory-operation:'||p_operation_id::text,0));
  select * into receipt from public.inventory_ledger where operation_id=p_operation_id;
  if found then
    if receipt.event<>'stock_adjustment' or row(receipt.variant_id,receipt.on_hand_delta,receipt.reason)
      is distinct from row(p_variant_id,p_delta,btrim(p_reason)) then raise exception 'INVALID_INVENTORY_ADJUSTMENT'; end if;
    return jsonb_build_object('on_hand',receipt.on_hand_after,'allocated',receipt.allocated_after);
  end if;
  if not exists(select 1 from public.product_variants where id=p_variant_id) then raise exception 'VARIANT_NOT_FOUND'; end if;
  insert into public.variant_inventory(variant_id,on_hand) values(p_variant_id,0) on conflict(variant_id) do nothing;
  select * into stock from public.variant_inventory where variant_id=p_variant_id for update;
  candidate:=stock.on_hand::bigint+p_delta;
  if candidate<stock.allocated or candidate>2147483647 then raise exception 'INVALID_INVENTORY_QUANTITY'; end if;
  update public.variant_inventory set on_hand=candidate::integer where variant_id=p_variant_id;
  insert into public.inventory_ledger(operation_id,variant_id,event,on_hand_delta,allocated_delta,on_hand_after,allocated_after,reason)
    values(p_operation_id,p_variant_id,'stock_adjustment',p_delta,0,candidate::integer,stock.allocated,btrim(p_reason));
  return jsonb_build_object('on_hand',candidate,'allocated',stock.allocated);
end;
$$;
revoke all on function public.adjust_variant_inventory(text,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.adjust_variant_inventory(text,integer,text,uuid) to service_role;

create function public.guard_tracked_variant()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.active and new.inventory_policy='tracked' and not exists(
    select 1 from public.variant_inventory where variant_id=new.id) then raise exception 'INVENTORY_NOT_READY'; end if;
  return new;
end;
$$;
revoke all on function public.guard_tracked_variant() from public,anon,authenticated;
alter table public.product_variants drop constraint variant_inventory_ready;
create trigger product_variants_inventory_ready before insert or update of active,inventory_policy on public.product_variants
for each row execute function public.guard_tracked_variant();

-- Public availability is a boolean only. Counts/ledger are never public data.
create function public.catalogue_variant_availability()
returns table(variant_id text,available boolean) language sql stable security definer set search_path='' as $$
  select v.id,v.inventory_policy='untracked' or coalesce(i.on_hand>i.allocated,false)
  from public.product_variants v join public.products p on p.id=v.product_id
  left join public.variant_inventory i on i.variant_id=v.id
  where v.active and p.active and v.currency='NLE';
$$;
revoke all on function public.catalogue_variant_availability() from public;
grant execute on function public.catalogue_variant_availability() to anon,authenticated;

-- Trusted cart/order definitions below are forward replacements of00800.

create or replace function public.change_variant_cart(p_variant_id text,p_mode text,p_quantity integer,p_expected_quantity integer,p_operation_id uuid)
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
      where v.id=p_variant_id and v.active and p.active and v.currency='NLE' and (v.inventory_policy='untracked' or exists(select 1 from public.variant_inventory i where i.variant_id=v.id and i.on_hand>i.allocated)) for share of v,p;
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

create or replace function public.place_variant_order(p_request_id uuid, p_checkout jsonb, p_expected_cart jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  target_cart_id uuid;
  result public.orders%rowtype;
  line record;
  stock public.variant_inventory%rowtype;
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
    if not line.active or line.currency <> 'NLE' or line.quantity not between 1 and 99
      or line.price_cents < 0 then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if line.inventory_policy='tracked' then
      select * into stock from public.variant_inventory where variant_id=line.variant_id for update;
      if not found or stock.on_hand-stock.allocated<line.quantity then raise exception 'OUT_OF_STOCK'; end if;
    end if;
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

  -- All finite stock rows were locked above in variant-ID order. Allocation,
  -- snapshots, durable email job and Bag conversion share this transaction.
  -- Awaiting payment does not invent a TTL or a cancellation/release workflow.
  for line in select item from jsonb_array_elements(snapshots) item loop
    if (select inventory_policy='tracked' from public.product_variants where id=line.item->>'variant_id') then
      update public.variant_inventory set allocated=allocated+(line.item->>'quantity')::integer
        where variant_id=line.item->>'variant_id' returning * into stock;
      insert into public.inventory_ledger(operation_id,variant_id,event,on_hand_delta,allocated_delta,on_hand_after,allocated_after,order_id,reason)
        values(gen_random_uuid(),stock.variant_id,'order_allocation',0,(line.item->>'quantity')::integer,stock.on_hand,stock.allocated,result.id,'Order placement allocation');
    end if;
  end loop;
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
commit;
