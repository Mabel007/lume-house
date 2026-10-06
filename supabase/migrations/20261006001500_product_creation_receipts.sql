begin;
create table public.business_product_creations (
 operation_id uuid primary key,
 actor_user_id uuid not null references auth.users(id) on delete restrict,
 request jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.business_product_creations enable row level security;
revoke all on public.business_product_creations from public,anon,authenticated,service_role;
-- Legacy editor RPC remains usable for edits only. Creation must use a receipt.
alter function public.admin_save_product(text,timestamptz,text,text,text,text,text,integer,boolean,integer) rename to business_save_product_internal;
create function public.admin_save_product(p_id text,p_expected_updated_at timestamptz,p_name text,p_description text,p_category text,p_image_path text,p_background_color text,p_display_order integer,p_active boolean,p_initial_price integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.require_business_admin();
 if p_id is null then raise exception 'USE_IDEMPOTENT_CREATION' using errcode='22023'; end if;
 return public.business_save_product_internal(p_id,p_expected_updated_at,p_name,p_description,p_category,p_image_path,p_background_color,p_display_order,p_active,p_initial_price);
end;
$$;
-- Replace the delegated call after rename; internal creation is never exposed.
create function public.admin_create_product(p_operation_id uuid,p_name text,p_description text,p_category text,p_image_path text,p_background_color text,p_display_order integer,p_active boolean,p_initial_price integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare request jsonb; receipt public.business_product_creations%rowtype; result jsonb;
begin
 perform public.require_business_admin();
 if p_operation_id is null then raise exception 'OPERATION_REQUIRED' using errcode='22023'; end if;
 request:=jsonb_build_object('name',btrim(p_name),'description',btrim(p_description),'category',btrim(p_category),'image',p_image_path,'background',p_background_color,'display_order',p_display_order,'active',p_active,'price',p_initial_price);
 perform pg_advisory_xact_lock(hashtextextended('business-product-creation:'||p_operation_id::text,0));
 select * into receipt from public.business_product_creations where operation_id=p_operation_id;
 if found then
  if receipt.actor_user_id is distinct from auth.uid() or receipt.request is distinct from request then raise exception 'OPERATION_CHANGED' using errcode='22023'; end if;
  return receipt.result;
 end if;
 result:=public.business_save_product_internal(null,null,p_name,p_description,p_category,p_image_path,p_background_color,p_display_order,p_active,p_initial_price);
 insert into public.business_product_creations(operation_id,actor_user_id,request,result) values(p_operation_id,auth.uid(),request,result);
 return result;
end;
$$;
revoke all on function public.business_save_product_internal(text,timestamptz,text,text,text,text,text,integer,boolean,integer) from public,anon,authenticated,service_role;
revoke all on function public.admin_save_product(text,timestamptz,text,text,text,text,text,integer,boolean,integer) from public,anon;
grant execute on function public.admin_save_product(text,timestamptz,text,text,text,text,text,integer,boolean,integer) to authenticated;
revoke all on function public.admin_create_product(uuid,text,text,text,text,text,integer,boolean,integer) from public,anon;
grant execute on function public.admin_create_product(uuid,text,text,text,text,text,integer,boolean,integer) to authenticated;
commit;
