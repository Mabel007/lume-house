-- Forward only: preserve all customer data, snapshots and existing RLS/grants.
begin;
alter table public.orders add column checkout_request_id uuid;
create unique index orders_checkout_request_idx on public.orders(user_id, checkout_request_id)
  where checkout_request_id is not null;
comment on column public.orders.checkout_request_id is 'Owner-scoped durable checkout idempotency key; legacy orders may be null.';
create function public.protect_checkout_request()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.checkout_request_id is distinct from old.checkout_request_id then
    raise exception 'Historical checkout request is immutable' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_checkout_request() from public,anon,authenticated;
create trigger orders_checkout_request_immutable before update on public.orders
for each row execute function public.protect_checkout_request();

-- The sole browser-callable write boundary is this validated transaction, never
-- table INSERT grants. Edge authenticates JWT; SQL independently uses auth.uid().
create function public.place_order(p_request_id uuid, p_checkout jsonb, p_expected_cart jsonb)
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
  -- Parent lock blocks new FK inserts; item/product locks prevent edits/repricing
  -- between validation and conversion. Deterministic order avoids lock inversion.
  for line in
    select ci.product_id, ci.quantity, p.name, p.price_cents, p.currency, p.active
    from public.cart_items ci join public.products p on p.id = ci.product_id
    where ci.cart_id = target_cart_id order by ci.product_id
    for update of ci for share of p
  loop
    if not line.active or line.currency <> 'NLE' or line.quantity not between 1 and 99
      or line.price_cents < 0 then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    line_count := line_count + 1;
    if line_count > 100 then raise exception 'CART_LIMIT'; end if;
    subtotal := subtotal + line.price_cents::bigint * line.quantity;
    if subtotal + fee > 2147483647 then raise exception 'ORDER_TOTAL_LIMIT'; end if;
    snapshots := snapshots || jsonb_build_array(jsonb_build_object('product_id',line.product_id,
      'name',line.name,'quantity',line.quantity,'price',line.price_cents));
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
  insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents)
    select result.id,item->>'product_id',item->>'name',(item->>'quantity')::integer,(item->>'price')::integer
    from jsonb_array_elements(snapshots) item;
  insert into public.order_confirmation_jobs(order_id) values(result.id);
  delete from public.cart_items where cart_items.cart_id = target_cart_id;
  set constraints public.orders_line_total, public.order_items_line_total immediate;
  return jsonb_build_object('id',result.id,'reference',result.order_reference,'total',result.total_cents,
    'currency',result.currency,'status',result.status,'payment_status',result.payment_status);
end;
$$;
revoke all on function public.place_order(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.place_order(uuid,jsonb,jsonb) to authenticated;

alter table public.order_confirmation_jobs drop constraint order_confirmation_jobs_status_check;
alter table public.order_confirmation_jobs
  add constraint order_confirmation_jobs_status_check check(status in ('pending','processing','sent','failed')),
  add column claim_token uuid,
  add column locked_until timestamptz,
  add column first_attempt_at timestamptz,
  add column provider_message_id text,
  add column last_error_code text check(char_length(last_error_code) <= 100),
  add column sender_snapshot text,
  add constraint order_confirmation_claim_state check(
    (status='processing' and claim_token is not null and locked_until is not null)
    or (status<>'processing' and claim_token is null and locked_until is null));

create function public.claim_order_confirmation(p_order_id uuid, p_sender text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job public.order_confirmation_jobs%rowtype;
begin
  if p_sender is null or char_length(p_sender) not between 3 and 254 then raise exception 'INVALID_SENDER'; end if;
  select * into job from public.order_confirmation_jobs where order_id=p_order_id for update;
  if not found or job.status='sent' then return null; end if;
  if job.status='processing' and job.locked_until > now() then return null; end if;
  if job.next_attempt_at > now() then return null; end if;
  -- Resend keys expire after24h. Fail closed on ambiguous old attempts rather
  -- than automatically risking a duplicate email beyond the dedup window.
  if job.first_attempt_at is not null and job.first_attempt_at < now()-interval '23 hours' then
    update public.order_confirmation_jobs set status='failed',claim_token=null,locked_until=null,
      last_error_code='manual_reconciliation_required' where order_id=p_order_id;
    return null;
  end if;
  update public.order_confirmation_jobs set status='processing',claim_token=gen_random_uuid(),
    locked_until=now()+interval '2 minutes',attempts=attempts+1,
    first_attempt_at=coalesce(first_attempt_at,now()),sender_snapshot=coalesce(sender_snapshot,p_sender)
    where order_id=p_order_id returning * into job;
  return jsonb_build_object('order_id',job.order_id,'claim_token',job.claim_token,'sender',job.sender_snapshot);
end;
$$;
create function public.finish_order_confirmation(p_order_id uuid,p_claim_token uuid,p_provider_id text,p_error_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.order_confirmation_jobs set
    status=case when p_provider_id is not null then 'sent' else 'failed' end,
    sent_at=case when p_provider_id is not null then now() else null end,
    provider_message_id=p_provider_id,last_error_code=left(p_error_code,100),
    claim_token=null,locked_until=null,next_attempt_at=now()+interval '1 minute'
  where order_id=p_order_id and status='processing' and claim_token=p_claim_token;
  return found;
end;
$$;
revoke all on function public.claim_order_confirmation(uuid,text),public.finish_order_confirmation(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_order_confirmation(uuid,text),public.finish_order_confirmation(uuid,uuid,text,text) to service_role;
-- No table write privileges or ownership policies are broadened.
commit;
