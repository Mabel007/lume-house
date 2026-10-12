-- Permanent optimistic conflicts use HTTP 409 without serialization retries.
-- Preserve function identity, grants, locks, authorization and audit contracts.
begin;
create or replace function public.business_save_product_internal(p_id text,p_expected_updated_at timestamptz,p_name text,p_description text,p_category text,p_image_path text,p_background_color text,p_display_order integer,p_active boolean,p_initial_price integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare product public.products%rowtype;
begin
  perform public.require_business_admin();
  if p_name is null or char_length(btrim(p_name)) not between 1 and 200
    or p_description is null or char_length(btrim(p_description)) not between 1 and 2000
    or p_category is null or char_length(btrim(p_category)) not between 1 and 100
    or p_image_path is null or char_length(p_image_path)>500 or p_image_path !~ '^/images/[A-Za-z0-9][A-Za-z0-9/_-]*\.(webp|png|jpg|jpeg|svg)$' or p_image_path like '%..%'
    or p_background_color is null or p_background_color !~ '^#[0-9a-fA-F]{6}$'
    or p_display_order is null or p_display_order<0 or p_active is null then
    raise exception 'INVALID_PRODUCT' using errcode='22023';
  end if;
  if p_id is null then
    if p_initial_price is null or p_initial_price<0 or p_expected_updated_at is not null then raise exception 'INVALID_INITIAL_VARIANT_PRICE' using errcode='22023'; end if;
    insert into public.products(id,name,description,category,image_path,background_color,display_order,active,price_cents,currency)
    values(gen_random_uuid()::text,btrim(p_name),btrim(p_description),btrim(p_category),p_image_path,p_background_color,p_display_order,p_active,p_initial_price,'NLE') returning * into product;
  else
    select * into product from public.products where id=p_id for update;
    if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='22023'; end if;
    if p_expected_updated_at is null or product.updated_at is distinct from p_expected_updated_at then raise exception 'PRODUCT_CHANGED' using errcode='PT409'; end if;
    if p_initial_price is not null then raise exception 'VARIANT_PRICE_IS_SEPARATE' using errcode='22023'; end if;
    update public.products set name=btrim(p_name),description=btrim(p_description),category=btrim(p_category),image_path=p_image_path,
      background_color=p_background_color,display_order=p_display_order,active=p_active where id=p_id returning * into product;
  end if;
  return to_jsonb(product);
end;
$$;
create or replace function public.admin_save_variant(p_id text,p_product_id text,p_expected_updated_at timestamptz,p_sku text,p_options jsonb,p_price_cents integer,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare variant public.product_variants%rowtype;
begin
  perform public.require_business_admin();
  if p_sku is null or char_length(btrim(p_sku)) not between 1 and 150 or p_sku<>btrim(p_sku)
    or p_options is null or not public.valid_variant_options(p_options)
    or exists(select 1 from jsonb_each(p_options) e where e.key<>btrim(e.key) or e.value#>>'{}'<>btrim(e.value#>>'{}'))
    or p_price_cents is null or p_price_cents<0 or p_active is null then raise exception 'INVALID_VARIANT' using errcode='22023'; end if;
  perform 1 from public.products where id=p_product_id for update;
  if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='22023'; end if;
  if p_id is null then
    if p_expected_updated_at is not null or p_options='{}' or p_sku like 'DEFAULT-%' then raise exception 'INVALID_OPTIONS' using errcode='22023'; end if;
    insert into public.product_variants(product_id,sku,options,price_cents,active)
      values(p_product_id,p_sku,p_options,p_price_cents,p_active) returning * into variant;
  else
    select * into variant from public.product_variants where id=p_id and product_id=p_product_id for update;
    if not found then raise exception 'VARIANT_NOT_FOUND' using errcode='22023'; end if;
    if p_expected_updated_at is null or variant.updated_at is distinct from p_expected_updated_at then raise exception 'VARIANT_CHANGED' using errcode='PT409'; end if;
    if variant.is_default and (p_options<>'{}' or p_sku<>variant.sku) then raise exception 'DEFAULT_IDENTITY_IMMUTABLE' using errcode='22023'; end if;
    update public.product_variants set sku=p_sku,options=p_options,price_cents=p_price_cents,active=p_active where id=p_id returning * into variant;
    if variant.is_default then
      update public.products set price_cents=p_price_cents where id=p_product_id;
    end if;
  end if;
  return to_jsonb(variant);
end;
$$;
create or replace function public.admin_set_inventory_policy(p_variant_id text,p_policy text,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare variant public.product_variants%rowtype; stock public.variant_inventory%rowtype;
begin
  perform public.require_business_admin();
  if p_policy is null or p_policy not in ('tracked','untracked') then raise exception 'INVALID_POLICY' using errcode='22023'; end if;
  select * into variant from public.product_variants where id=p_variant_id for update;
  if not found then raise exception 'VARIANT_NOT_FOUND' using errcode='22023'; end if;
  if p_expected_updated_at is null or variant.updated_at is distinct from p_expected_updated_at then raise exception 'VARIANT_CHANGED' using errcode='PT409'; end if;
  select * into stock from public.variant_inventory where variant_id=p_variant_id for update;
  if p_policy='tracked' and stock.variant_id is null then raise exception 'PREPARE_ACTUAL_STOCK_FIRST' using errcode='22023'; end if;
  if p_policy='untracked' and coalesce(stock.allocated,0)>0 then raise exception 'ALLOCATIONS_REQUIRE_TRACKING' using errcode='22023'; end if;
  update public.product_variants set inventory_policy=p_policy where id=p_variant_id returning * into variant;
  return to_jsonb(variant);
end;
$$;
create or replace function public.admin_transition_order(p_order_id uuid,p_expected_status text,p_to_status text,p_reason text,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.orders%rowtype; receipt public.business_order_operations%rowtype;
  allocation record; stock public.variant_inventory%rowtype; result jsonb;
begin
  perform public.require_business_admin();
  if p_operation_id is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'INVALID_ORDER_OPERATION' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('business-order-operation:'||p_operation_id::text,0));
  select * into receipt from public.business_order_operations where operation_id=p_operation_id;
  if found then
    if row(receipt.order_id,receipt.actor_user_id,receipt.from_status,receipt.to_status,receipt.reason)
      is distinct from row(p_order_id,auth.uid(),p_expected_status,p_to_status,btrim(p_reason)) then raise exception 'OPERATION_ID_REUSED' using errcode='22023'; end if;
    return receipt.result;
  end if;
  select * into target from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='22023'; end if;
  if p_expected_status is null or target.status<>p_expected_status then raise exception 'ORDER_CHANGED' using errcode='PT409'; end if;
  if not public.valid_business_order_transition(target.status,p_to_status,target.fulfilment_method) then raise exception 'INVALID_ORDER_TRANSITION' using errcode='22023'; end if;
  if p_to_status in ('cancelled','completed') then
    -- Consume/release only genuine allocation ledger facts, never fabricate
    -- allocations from historical product-only order rows/current inventory.
    for allocation in select variant_id,allocated_delta from public.inventory_ledger
      where order_id=p_order_id and event='order_allocation' order by variant_id loop
      if exists(select 1 from public.inventory_ledger where order_id=p_order_id and variant_id=allocation.variant_id and event in ('order_release','order_consumption')) then
        raise exception 'ALLOCATION_ALREADY_TERMINAL' using errcode='23514';
      end if;
      select * into stock from public.variant_inventory where variant_id=allocation.variant_id for update;
      if stock.variant_id is null or stock.allocated<allocation.allocated_delta or stock.on_hand<allocation.allocated_delta then
        raise exception 'INVALID_ALLOCATION_BALANCE' using errcode='23514';
      end if;
      update public.variant_inventory set allocated=allocated-allocation.allocated_delta,
        on_hand=on_hand-case when p_to_status='completed' then allocation.allocated_delta else 0 end
        where variant_id=allocation.variant_id returning * into stock;
      insert into public.inventory_ledger(operation_id,variant_id,event,on_hand_delta,allocated_delta,on_hand_after,allocated_after,order_id,reason)
        values(gen_random_uuid(),allocation.variant_id,case when p_to_status='completed' then 'order_consumption' else 'order_release' end,
          case when p_to_status='completed' then -allocation.allocated_delta else 0 end,-allocation.allocated_delta,stock.on_hand,stock.allocated,p_order_id,btrim(p_reason));
    end loop;
  end if;
  update public.orders set status=p_to_status where id=p_order_id returning * into target;
  result:=jsonb_build_object('id',target.id,'status',target.status,'payment_status',target.payment_status);
  insert into public.business_order_operations(operation_id,order_id,actor_user_id,from_status,to_status,reason,result)
    values(p_operation_id,p_order_id,auth.uid(),p_expected_status,p_to_status,btrim(p_reason),result);
  return result;
end;
$$;
create or replace function public.admin_revoke_membership(p_user_id uuid,p_expected_updated_at timestamptz,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare membership public.business_admins%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('business-admin-memberships',0));
 perform 1 from public.business_role_control where singleton for update;
 perform public.require_business_admin();
 if p_user_id is null or p_user_id=auth.uid() then raise exception 'SELF_REVOCATION_DISABLED' using errcode='22023'; end if;
 select * into membership from public.business_admins where user_id=p_user_id for update;
 if not found or not membership.active then raise exception 'ACTIVE_MEMBERSHIP_REQUIRED' using errcode='22023'; end if;
 if p_expected_updated_at is null or membership.updated_at is distinct from p_expected_updated_at then raise exception 'MEMBERSHIP_CHANGED' using errcode='PT409'; end if;
 if (select count(*) from public.business_admins where active)<2 then raise exception 'LAST_ADMIN_PROTECTED' using errcode='22023'; end if;
 perform public.set_business_admin(p_user_id,false,p_reason);
end;
$$;
create or replace function public.admin_save_product_gallery_v1(p_product_id text,p_expected_updated_at timestamptz,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stamp timestamptz; item jsonb; idx integer=0;
begin
 perform public.require_business_admin();
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>8 then raise exception 'INVALID_GALLERY' using errcode='22023';end if;
 select updated_at into stamp from public.products where id=p_product_id for update;
 if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='22023';end if;
 if stamp is distinct from p_expected_updated_at then raise exception 'PRODUCT_CHANGED' using errcode='PT409';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item) is distinct from 'object' or
   not coalesce(((item->>'source'='static' and exists(select 1 from public.product_media_assets where path=item->>'path')) or
        (item->>'source'='storage' and exists(select 1 from public.uploaded_product_media where path=item->>'path'))),false) then
   raise exception 'UNREVIEWED_MEDIA' using errcode='22023';end if;
 end loop;
 delete from public.product_images where product_id=p_product_id;
 for item in select value from jsonb_array_elements(p_items) loop
  insert into public.product_images(product_id,position,source,path) values(p_product_id,idx,item->>'source',item->>'path');idx=idx+1;
 end loop;
 -- First gallery entry is primary. Legacy image_path remains an unchanged compatibility fallback.
 update public.products set updated_at=clock_timestamp() where id=p_product_id;
 return public.admin_product_gallery_v1(p_product_id);
end;
$$;
commit;
