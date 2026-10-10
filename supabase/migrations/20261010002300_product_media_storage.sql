begin;
-- Requires the genuine Storage schema/service. Fail closed if an existing bucket conflicts.
do $$begin
 if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname='objects' and c.relrowsecurity) then raise exception 'STORAGE_RLS_REQUIRED';end if;
 if exists(select 1 from storage.buckets where id='product-media') then raise exception 'PRODUCT_MEDIA_BUCKET_ALREADY_EXISTS_REVIEW_REQUIRED';end if;
end$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('product-media','product-media',false,2097152,array['image/png']);
-- Restrictive policy defeats any pre-existing permissive browser policy for this bucket.
-- All writes go through the JWT-verified, content-validating Edge endpoint; no browser deletion API.
create policy product_media_server_only on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'product-media') with check(bucket_id<>'product-media');
create policy product_media_bucket_server_only on storage.buckets as restrictive for all to anon,authenticated
 using(id<>'product-media') with check(id<>'product-media');
commit;
