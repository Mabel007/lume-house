-- Forward, local validation only. No customer is automatically provisioned.
begin;
create table public.business_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  active boolean not null default true,
  reason text not null check(char_length(btrim(reason)) between 1 and 500),
  updated_at timestamptz not null default now()
);
alter table public.business_admins enable row level security;
revoke all on public.business_admins from public,anon,authenticated,service_role;
create function public.set_business_admin(p_user_id uuid,p_active boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_user_id is null or p_active is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'INVALID_ADMIN_MEMBERSHIP' using errcode='22023';
  end if;
  insert into public.business_admins(user_id,active,reason) values(p_user_id,p_active,btrim(p_reason))
  on conflict(user_id) do update set active=excluded.active,reason=excluded.reason,updated_at=now();
end;
$$;
revoke all on function public.set_business_admin(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.set_business_admin(uuid,boolean,text) to service_role;
create function public.is_business_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.business_admins where user_id=auth.uid() and active);
$$;
revoke all on function public.is_business_admin() from public,anon;
grant execute on function public.is_business_admin() to authenticated;
-- Membership row lock serializes revocation with each authorized operation.
-- Private helper: no direct customer execution even if membership is active.
create function public.require_business_admin()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.business_admins where user_id=auth.uid() and active for share;
  if not found then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
end;
$$;
revoke all on function public.require_business_admin() from public,anon,authenticated,service_role;
commit;
