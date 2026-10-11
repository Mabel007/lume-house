-- Disposable policy-model only. Never run against real Supabase/local stack.
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated,service_role;
grant all on storage.buckets,storage.objects to anon,authenticated,service_role;
-- Deliberately broad existing policies: the new restrictive policy must still deny the media bucket.
create policy broad_existing_objects on storage.objects for all using(true) with check(true);
create policy broad_existing_buckets on storage.buckets for all using(true) with check(true);
