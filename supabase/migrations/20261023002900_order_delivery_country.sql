-- S02-01 Slice 2. Forward only. Approved policy: historical NULL country values
-- remain NULL with no fabricated snapshots or backfill, new orders require the
-- canonical SL code, and existing snapshots remain immutable.
-- Country is immutable purchase evidence for new orders, not a profile mirror.
begin;
alter table public.orders add column country_code text;
alter table public.orders add constraint orders_delivery_country_check
  check (country_code is null or country_code = 'SL');
comment on column public.orders.country_code is
  'Immutable delivery country at placement. NULL only for orders created before this contract.';

create function public.require_order_delivery_country()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.country_code is distinct from 'SL' then
    raise exception 'New orders require delivery country SL' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.require_order_delivery_country() from public,anon,authenticated,service_role;
create trigger orders_delivery_country_required before insert on public.orders
for each row execute function public.require_order_delivery_country();

create function public.protect_order_delivery_country()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.country_code is distinct from old.country_code then
    raise exception 'Historical delivery country is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_order_delivery_country() from public,anon,authenticated,service_role;
create trigger orders_delivery_country_immutable before update on public.orders
for each row execute function public.protect_order_delivery_country();

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
  -- Exact country evidence is checked before any replay lookup or mutation.
  if jsonb_typeof(p_checkout) is distinct from 'object' then raise exception 'INVALID_CHECKOUT'; end if;
  if jsonb_typeof(p_checkout->'country_code') is distinct from 'string'
    or p_checkout->>'country_code' is distinct from 'SL' then
    raise exception 'INVALID_DELIVERY_COUNTRY' using errcode = 'P0001';
  end if;
  -- Serializes all checkouts for this identity, including same-key concurrent retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  select * into result from public.orders where user_id = uid and checkout_request_id = p_request_id;
  if found then
    if result.checkout_source <> 'bag' then raise exception 'CHECKOUT_SOURCE_CONFLICT' using errcode='PT409'; end if;
    return jsonb_build_object('id', result.id, 'reference', result.order_reference, 'total', result.total_cents,
      'currency', result.currency, 'status', result.status, 'payment_status', result.payment_status);
  end if;
  if jsonb_typeof(p_expected_cart) is distinct from 'array'
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
    currency,subtotal_cents,delivery_fee_cents,total_cents,status,country_code)
  values(uid,p_request_id,contact_name,contact_email,contact_phone,method,street,area,city,instructions,
    zone,zone_label,case when method='pickup' then 'Lumley, Freetown' else null end,
    provider,'awaiting_payment',right(payer_phone,4),'NLE',subtotal::integer,fee,(subtotal+fee)::integer,'placed','SL')
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
  -- Exact country evidence is checked before replay and before ensure_variant_cart().
  if jsonb_typeof(p_checkout) is distinct from 'object' then raise exception 'INVALID_CHECKOUT'; end if;
  if jsonb_typeof(p_checkout->'country_code') is distinct from 'string'
    or p_checkout->>'country_code' is distinct from 'SL' then
    raise exception 'INVALID_DELIVERY_COUNTRY' using errcode = 'P0001';
  end if;
  -- Serializes all checkouts for this identity, including same-key concurrent retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  select * into result from public.orders where user_id = uid and checkout_request_id = p_request_id;
  if found then
    if result.checkout_source <> 'bag' then raise exception 'CHECKOUT_SOURCE_CONFLICT' using errcode='PT409'; end if;
    return jsonb_build_object('id', result.id, 'reference', result.order_reference, 'total', result.total_cents,
      'currency', result.currency, 'status', result.status, 'payment_status', result.payment_status);
  end if;
  if jsonb_typeof(p_expected_cart) is distinct from 'array'
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
    currency,subtotal_cents,delivery_fee_cents,total_cents,status,country_code)
  values(uid,p_request_id,contact_name,contact_email,contact_phone,method,street,area,city,instructions,
    zone,zone_label,case when method='pickup' then 'Lumley, Freetown' else null end,
    provider,'awaiting_payment',right(payer_phone,4),'NLE',subtotal::integer,fee,(subtotal+fee)::integer,'placed','SL')
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

create or replace function public.place_direct_variant_order(p_request_id uuid, p_variant_id text, p_quantity integer, p_expected_quote jsonb, p_checkout jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
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
  contact_name text := pg_catalog.btrim(p_checkout->>'full_name');
  contact_email text := pg_catalog.btrim(p_checkout->>'email');
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
  if p_request_id is null or p_variant_id is null or pg_catalog.char_length(p_variant_id) not between 1 and 150
    or p_quantity is null or p_quantity not between 1 and 99 then raise exception 'INVALID_REQUEST'; end if;
  -- Exact country evidence is checked before replay lookup and before catalogue/stock.
  if pg_catalog.jsonb_typeof(p_checkout) is distinct from 'object' then raise exception 'INVALID_CHECKOUT'; end if;
  if pg_catalog.jsonb_typeof(p_checkout->'country_code') is distinct from 'string'
    or p_checkout->>'country_code' is distinct from 'SL' then
    raise exception 'INVALID_DELIVERY_COUNTRY' using errcode = 'P0001';
  end if;
  -- Serializes all checkouts for this identity, including same-key concurrent retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  select * into result from public.orders where user_id = uid and checkout_request_id = p_request_id;
  if found then
    if result.checkout_source <> 'direct' then raise exception 'CHECKOUT_SOURCE_CONFLICT' using errcode='PT409'; end if;
    -- Compare immutable purchased identity, not today's catalogue or stock.
    if (select count(*) from public.order_items where order_id=result.id) <> 1
      or not exists(select 1 from public.order_items where order_id=result.id
        and variant_id=p_variant_id and quantity=p_quantity) then
      raise exception 'CHECKOUT_SELECTION_CONFLICT' using errcode='PT409';
    end if;
    return pg_catalog.jsonb_build_object('id', result.id, 'reference', result.order_reference, 'total', result.total_cents,
      'currency', result.currency, 'status', result.status, 'payment_status', result.payment_status);
  end if;
  if pg_catalog.jsonb_typeof(p_expected_quote) is distinct from 'object'
    or pg_catalog.octet_length(p_checkout::text) > 8000 then raise exception 'INVALID_CHECKOUT'; end if;
  if pg_catalog.octet_length(p_expected_quote::text)>1000 then raise exception 'INVALID_REQUEST'; end if;
  -- Do not accept JSON objects/arrays/numbers as string contact fields via ->>.
  if exists(select 1 from pg_catalog.jsonb_each(p_checkout) as field(key,value)
    where field.key in ('full_name','email','contact_phone','payment_phone','provider','fulfilment',
      'zone_id','street','area','city','instructions')
      and pg_catalog.jsonb_typeof(field.value) not in ('string','null')) then raise exception 'INVALID_CHECKOUT'; end if;
  if contact_name is null or pg_catalog.char_length(contact_name) not between 1 and 200
    or contact_email is null or pg_catalog.char_length(contact_email) not between 3 and 254
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
    street := pg_catalog.btrim(p_checkout->>'street'); area := pg_catalog.btrim(p_checkout->>'area'); city := pg_catalog.btrim(p_checkout->>'city');
    instructions := nullif(pg_catalog.btrim(p_checkout->>'instructions'), '');
    if street is null or pg_catalog.char_length(street) not between 1 and 200
      or area is null or pg_catalog.char_length(area) not between 1 and 200
      or city is null or pg_catalog.char_length(city) not between 1 and 200 or pg_catalog.lower(city) <> 'freetown'
      or pg_catalog.char_length(instructions) > 500 then raise exception 'INVALID_DELIVERY_DETAILS'; end if;
    city := 'Freetown';
  end if;
  -- Same product/variant then inventory lock order as Bag checkout. No cart access.
  for line in
    select v.product_id,p_quantity as quantity,p.name,v.price_cents,v.currency,(p.active and v.active) as active,
      v.id as variant_id,v.sku,v.options,v.inventory_policy
    from public.product_variants v
    join public.products p on p.id=v.product_id
    where v.id=p_variant_id
    for share of p,v
  loop
    if not line.active or line.currency <> 'NLE' or line.quantity not between 1 and 99
      or line.price_cents < 0 then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if line.inventory_policy='tracked' then
      select * into stock from public.variant_inventory where variant_id=line.variant_id for update;
      if not found or stock.on_hand-stock.allocated<line.quantity then raise exception 'OUT_OF_STOCK'; end if;
    end if;
    line_count := line_count + 1;
    subtotal := subtotal + line.price_cents::bigint * line.quantity;
    if subtotal + fee > 2147483647 then raise exception 'ORDER_TOTAL_LIMIT'; end if;
    snapshots := snapshots || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',line.product_id,
      'name',line.name,'quantity',line.quantity,'price',line.price_cents,
      'variant_id',line.variant_id,'sku',line.sku,'options',line.options,'currency',line.currency));
    quote := quote || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',line.product_id,
      'variant_id',line.variant_id,'quantity',line.quantity,'unit_price',line.price_cents));
  end loop;
  if line_count = 0 then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  -- Expected prices are ONLY a change detector/customer review guard. Neither
  -- they nor any submitted totals/fees/status/labels are used to create the order.
  if (quote->0) is distinct from p_expected_quote then raise exception 'QUOTE_CHANGED' using errcode='PT409'; end if;
  set constraints public.orders_line_total, public.order_items_line_total deferred;
  insert into public.orders(user_id,checkout_request_id,full_name,customer_email,customer_phone,
    fulfilment_method,delivery_street_address,delivery_area,delivery_city,delivery_instructions,
    delivery_zone_id,delivery_zone_label,pickup_location,payment_provider,payment_status,payment_phone_last4,
    currency,subtotal_cents,delivery_fee_cents,total_cents,status,checkout_source,country_code)
  values(uid,p_request_id,contact_name,contact_email,contact_phone,method,street,area,city,instructions,
    zone,zone_label,case when method='pickup' then 'Lumley, Freetown' else null end,
    provider,'awaiting_payment',pg_catalog.right(payer_phone,4),'NLE',subtotal::integer,fee,(subtotal+fee)::integer,'placed','direct','SL')
  returning * into result;

  -- The selected finite stock row remains locked through allocation. Allocation,
  -- snapshots and durable email job share this transaction; the Bag is untouched.
  -- Awaiting payment does not invent a TTL or a cancellation/release workflow.
  for line in select item from pg_catalog.jsonb_array_elements(snapshots) item loop
    if (select inventory_policy='tracked' from public.product_variants where id=line.item->>'variant_id') then
      update public.variant_inventory set allocated=allocated+(line.item->>'quantity')::integer
        where variant_id=line.item->>'variant_id' returning * into stock;
      insert into public.inventory_ledger(operation_id,variant_id,event,on_hand_delta,allocated_delta,on_hand_after,allocated_after,order_id,reason)
        values(pg_catalog.gen_random_uuid(),stock.variant_id,'order_allocation',0,(line.item->>'quantity')::integer,stock.on_hand,stock.allocated,result.id,'Order placement allocation');
    end if;
  end loop;
  insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents,variant_id,variant_sku,variant_options,variant_currency)
    select result.id,item->>'product_id',item->>'name',(item->>'quantity')::integer,(item->>'price')::integer,
      item->>'variant_id',item->>'sku',item->'options',item->>'currency'
    from pg_catalog.jsonb_array_elements(snapshots) item;
  insert into public.order_confirmation_jobs(order_id) values(result.id);
  set constraints public.orders_line_total, public.order_items_line_total immediate;
  return pg_catalog.jsonb_build_object('id',result.id,'reference',result.order_reference,'total',result.total_cents,
    'currency',result.currency,'status',result.status,'payment_status',result.payment_status);
end;
$$;
revoke all on function public.place_direct_variant_order(uuid,text,integer,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.place_direct_variant_order(uuid,text,integer,jsonb,jsonb) to authenticated;
-- Reassert the existing Bag boundary without expanding table privileges.
revoke all on function public.place_order(uuid,jsonb,jsonb),public.place_variant_order(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.place_order(uuid,jsonb,jsonb),public.place_variant_order(uuid,jsonb,jsonb) to authenticated;
commit;
