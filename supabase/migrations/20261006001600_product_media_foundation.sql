begin;
-- Reviewed static assets remain the source of bytes. This is not an upload API.
create table public.product_media_assets (
 path text primary key check(path ~ '^/images/[A-Za-z0-9][A-Za-z0-9/_-]*\.(webp|png|jpg|jpeg|svg)$' and path not like '%..%'),
 created_at timestamptz not null default now()
);
insert into public.product_media_assets(path) select distinct image_path from public.products;
insert into public.product_media_assets(path) values('/images/mug.svg') on conflict do nothing;
alter table public.product_media_assets enable row level security;
revoke all on public.product_media_assets from public,anon,authenticated,service_role;
create function public.admin_media_assets() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_admin();
 select coalesce(jsonb_agg(path order by path),'[]') into result from public.product_media_assets;
 return result;
end;
$$;
create function public.admin_set_product_media(p_product_id text,p_expected_updated_at timestamptz,p_path text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare product public.products%rowtype;
begin
 perform public.require_business_admin();
 if not exists(select 1 from public.product_media_assets where path=p_path) then raise exception 'UNREVIEWED_MEDIA' using errcode='22023'; end if;
 select * into product from public.products where id=p_product_id for update;
 if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='22023'; end if;
 if p_expected_updated_at is null or product.updated_at is distinct from p_expected_updated_at then raise exception 'PRODUCT_CHANGED' using errcode='40001'; end if;
 update public.products set image_path=p_path where id=p_product_id returning * into product;
 return to_jsonb(product);
end;
$$;
revoke all on function public.admin_media_assets(),public.admin_set_product_media(text,timestamptz,text) from public,anon;
grant execute on function public.admin_media_assets(),public.admin_set_product_media(text,timestamptz,text) to authenticated;
commit;
