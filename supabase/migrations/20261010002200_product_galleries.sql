begin;
-- Bytes are registered only by the server after full bounded PNG validation.
create table public.uploaded_product_media (
 path text primary key check(path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$'),
 width integer not null check(width between 1 and 4096), height integer not null check(height between 1 and 4096),
 byte_size integer not null check(byte_size between 45 and 2097152), created_at timestamptz not null default now(),
 check(width::bigint*height<=4000000)
);
create table public.product_images (
 product_id text not null references public.products(id),
 position integer not null check(position between 0 and 7),
 source text not null check(source in ('static','storage')),
 path text not null,
 primary key(product_id,position), unique(product_id,source,path)
);
create index product_images_storage_path on public.product_images(path) where source='storage';
alter table public.uploaded_product_media enable row level security;
alter table public.product_images enable row level security;
revoke all on public.uploaded_product_media,public.product_images from public,anon,authenticated,service_role;
grant select on public.product_images to anon,authenticated;
create policy customer_product_images on public.product_images for select to anon,authenticated
 using(exists(select 1 from public.products p where p.id=product_id and p.active));
create function public.register_product_image_v1(p_path text,p_width integer,p_height integer,p_bytes integer)
returns void language sql security definer set search_path='' as $$
 insert into public.uploaded_product_media(path,width,height,byte_size) values(p_path,p_width,p_height,p_bytes);
$$;
revoke all on function public.register_product_image_v1(text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.register_product_image_v1(text,integer,integer,integer) to service_role;
create function public.admin_product_gallery_v1(p_product_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; stamp timestamptz;
begin
 perform public.require_business_admin();
 select updated_at into stamp from public.products where id=p_product_id;
 if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('source',source,'path',path,'position',position) order by position),'[]'::jsonb) into result from public.product_images where product_id=p_product_id;
 return jsonb_build_object('items',result,'updated_at',stamp);
end;
$$;
create function public.admin_save_product_gallery_v1(p_product_id text,p_expected_updated_at timestamptz,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare stamp timestamptz; item jsonb; idx integer=0;
begin
 perform public.require_business_admin();
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>8 then raise exception 'INVALID_GALLERY' using errcode='22023';end if;
 select updated_at into stamp from public.products where id=p_product_id for update;
 if not found then raise exception 'PRODUCT_NOT_FOUND' using errcode='22023';end if;
 if stamp is distinct from p_expected_updated_at then raise exception 'PRODUCT_CHANGED' using errcode='40001';end if;
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
create function public.catalogue_media_visible_v1(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.product_images i join public.products p on p.id=i.product_id
 where i.source='storage' and i.path=p_path and p.active);
$$;
revoke all on function public.admin_product_gallery_v1(text),public.admin_save_product_gallery_v1(text,timestamptz,jsonb),public.catalogue_media_visible_v1(text) from public,anon,authenticated,service_role;
grant execute on function public.admin_product_gallery_v1(text),public.admin_save_product_gallery_v1(text,timestamptz,jsonb) to authenticated;
grant execute on function public.catalogue_media_visible_v1(text) to anon,authenticated;
commit;
