-- Disabled by default. No identities assigned and no existing admin downgraded.
begin;
create table public.business_role_control (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into public.business_role_control(singleton) values(true);
create table public.business_roles (
 user_id uuid primary key references public.business_admins(user_id) on delete restrict,
 role text not null check(role in ('owner','staff')),
 revision integer not null check(revision between 1 and 2147483647),
 updated_at timestamptz not null default clock_timestamp()
);
create table public.business_role_history (
 operation_id uuid primary key,
 user_id uuid not null references public.business_admins(user_id) on delete restrict,
 actor_user_id uuid references auth.users(id) on delete restrict,
 actor_kind text not null check(actor_kind in ('owner','recovery')),
 actor_context text not null check(char_length(actor_context) between 1 and 200),
 expected_revision integer not null,
 previous_role text,
 role text not null check(role in ('owner','staff')),
 reason text not null check(char_length(reason) between 1 and 500),
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create unique index business_role_history_revision on public.business_role_history(user_id,expected_revision);
create table public.business_role_activation (
 singleton boolean primary key check(singleton),
 reason text not null check(char_length(reason) between 1 and 500),
 recovery_context text not null check(char_length(recovery_context) between 1 and 200),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.business_role_activation enable row level security;
revoke all on public.business_role_activation from public,anon,authenticated,service_role;
create trigger business_role_activation_immutable before update or delete on public.business_role_activation for each row execute function public.protect_business_order_operation();
alter table public.business_role_control enable row level security;
alter table public.business_roles enable row level security;
alter table public.business_role_history enable row level security;
revoke all on public.business_role_control,public.business_roles,public.business_role_history from public,anon,authenticated,service_role;
create trigger business_role_history_immutable before update or delete on public.business_role_history for each row execute function public.protect_business_order_operation();

-- Lock order: control, membership, assignment. Role/membership writers also take
-- the existing global membership advisory lock before the exclusive control lock.
create function public.require_business_access_v1() returns text
language plpgsql security definer set search_path='' as $$
declare enabled boolean; assigned text;
begin
 select c.enabled into enabled from public.business_role_control c where singleton for share;
 perform 1 from public.business_admins where user_id=auth.uid() and active for share;
 if not found then raise exception 'BUSINESS_ACCESS_REQUIRED' using errcode='42501'; end if;
 if not enabled then return 'legacy'; end if;
 select role into assigned from public.business_roles where user_id=auth.uid() for share;
 if assigned is null then raise exception 'ROLE_REQUIRED' using errcode='42501'; end if;
 return assigned;
end;
$$;
revoke all on function public.require_business_access_v1() from public,anon,authenticated,service_role;
create or replace function public.require_business_admin() returns void
language plpgsql security definer set search_path='' as $$
begin
 if public.require_business_access_v1() not in ('legacy','owner') then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
end;
$$;
-- This remains an unrestricted-admin check, including pending media POST checks.
create or replace function public.is_business_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.business_admins a cross join public.business_role_control c
 left join public.business_roles r on r.user_id=a.user_id
 where c.singleton and a.user_id=auth.uid() and a.active and (not c.enabled or r.role='owner'));
$$;
create function public.business_access_v1() returns text
language plpgsql security definer set search_path='' as $$
begin return public.require_business_access_v1(); end;
$$;
revoke all on function public.business_access_v1() from public,anon,service_role;
grant execute on function public.business_access_v1() to authenticated;

-- Restricted projections intentionally have no customer-ID/detail/search/CSV API.
create function public.staff_dashboard_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_access_v1();
 select jsonb_build_object('open_orders',count(*) filter(where status not in ('completed','cancelled')),
 'completed_orders',count(*) filter(where status='completed'),
 'cancelled_orders',count(*) filter(where status='cancelled')) into result from public.orders;
 return result;
end;
$$;
create function public.staff_orders_page_v1(p_page integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_access_v1();
 if p_page is null or p_page not between 0 and 100000 then raise exception 'INVALID_PAGE' using errcode='22023'; end if;
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(rows) order by created_at desc,order_reference),'[]'::jsonb),'has_more',
 exists(select 1 from public.orders order by created_at desc,order_reference offset (p_page::bigint*20+20) limit 1)) into result
 from (select order_reference,created_at,status,total_cents from public.orders order by created_at desc,order_reference limit 20 offset (p_page::bigint*20)) rows;
 return result;
end;
$$;
revoke all on function public.staff_dashboard_v1(),public.staff_orders_page_v1(integer) from public,anon,service_role;
grant execute on function public.staff_dashboard_v1(),public.staff_orders_page_v1(integer) to authenticated;

create or replace function public.set_business_admin(p_user_id uuid,p_active boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare enabled boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('business-admin-memberships',0));
 select c.enabled into enabled from public.business_role_control c where singleton for update;
 if p_user_id is null or p_active is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'INVALID_ADMIN_MEMBERSHIP' using errcode='22023'; end if;
 if enabled then
  if p_active and not exists(select 1 from public.business_roles where user_id=p_user_id) then raise exception 'ROLE_REQUIRED' using errcode='22023'; end if;
  if not p_active and exists(select 1 from public.business_admins where user_id=p_user_id and active) then
   if (select count(*) from public.business_admins where active)<2 then raise exception 'LAST_ADMIN_PROTECTED' using errcode='22023'; end if;
   if exists(select 1 from public.business_roles where user_id=p_user_id and role='owner') and
    (select count(*) from public.business_roles r join public.business_admins a using(user_id) where a.active and r.role='owner')<2 then raise exception 'LAST_OWNER_PROTECTED' using errcode='22023'; end if;
  end if;
 end if;
 insert into public.business_admins(user_id,active,reason) values(p_user_id,p_active,btrim(p_reason))
 on conflict(user_id) do update set active=excluded.active,reason=excluded.reason,updated_at=clock_timestamp();
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
 if p_expected_updated_at is null or membership.updated_at is distinct from p_expected_updated_at then raise exception 'MEMBERSHIP_CHANGED' using errcode='40001'; end if;
 if (select count(*) from public.business_admins where active)<2 then raise exception 'LAST_ADMIN_PROTECTED' using errcode='22023'; end if;
 perform public.set_business_admin(p_user_id,false,p_reason);
end;
$$;

create function public.business_set_role_internal(p_user_id uuid,p_role text,p_expected_revision integer,p_reason text,p_operation_id uuid,p_actor_kind text,p_context text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare enabled boolean; prior public.business_roles%rowtype; receipt public.business_role_history%rowtype; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('business-admin-memberships',0));
 select c.enabled into enabled from public.business_role_control c where singleton for update;
 if p_actor_kind='owner' then
  if not enabled then raise exception 'ROLES_DISABLED' using errcode='42501'; end if;
  perform public.require_business_admin();
 elsif p_actor_kind is distinct from 'recovery' then raise exception 'INVALID_ACTOR' using errcode='22023'; end if;
 if p_user_id is null or p_role is null or p_role not in ('owner','staff') or p_expected_revision is null or p_expected_revision not between 0 and 2147483646
 or p_operation_id is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500
 or p_context is null or char_length(btrim(p_context)) not between 1 and 200 then raise exception 'INVALID_ROLE_INPUT' using errcode='22023'; end if;
 select * into receipt from public.business_role_history where operation_id=p_operation_id;
 if found then
  if row(receipt.user_id,receipt.role,receipt.expected_revision,receipt.reason,receipt.actor_kind,receipt.actor_context,receipt.actor_user_id)
   is distinct from row(p_user_id,p_role,p_expected_revision,btrim(p_reason),p_actor_kind,btrim(p_context),auth.uid()) then raise exception 'OPERATION_REUSED' using errcode='22023'; end if;
  return receipt.result;
 end if;
 if not enabled and p_role<>'owner' then raise exception 'STAFF_REQUIRES_CUTOVER' using errcode='22023'; end if;
 perform 1 from public.business_admins where user_id=p_user_id for update;
 if not found then raise exception 'MEMBERSHIP_REQUIRED' using errcode='22023'; end if;
 select * into prior from public.business_roles where user_id=p_user_id for update;
 if coalesce(prior.revision,0)<>p_expected_revision then raise exception 'ROLE_CHANGED' using errcode='40001'; end if;
 if prior.role='owner' and p_role='staff' and exists(select 1 from public.business_admins where user_id=p_user_id and active) and
  (select count(*) from public.business_roles r join public.business_admins a using(user_id) where a.active and r.role='owner')<2 then raise exception 'LAST_OWNER_PROTECTED' using errcode='22023'; end if;
 insert into public.business_roles(user_id,role,revision) values(p_user_id,p_role,p_expected_revision+1)
 on conflict(user_id) do update set role=excluded.role,revision=excluded.revision,updated_at=clock_timestamp();
 result:=jsonb_build_object('user_id',p_user_id,'role',p_role,'revision',p_expected_revision+1);
 insert into public.business_role_history(operation_id,user_id,actor_user_id,actor_kind,actor_context,expected_revision,previous_role,role,reason,result)
 values(p_operation_id,p_user_id,auth.uid(),p_actor_kind,btrim(p_context),p_expected_revision,prior.role,p_role,btrim(p_reason),result);
 return result;
end;
$$;
revoke all on function public.business_set_role_internal(uuid,text,integer,text,uuid,text,text) from public,anon,authenticated,service_role;
create function public.admin_set_business_role_v1(p_user_id uuid,p_role text,p_expected_revision integer,p_reason text,p_operation_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select public.business_set_role_internal(p_user_id,p_role,p_expected_revision,p_reason,p_operation_id,'owner','Authenticated owner');
$$;
create function public.recovery_set_business_role_v1(p_user_id uuid,p_role text,p_expected_revision integer,p_reason text,p_operation_id uuid,p_context text)
returns jsonb language sql security definer set search_path='' as $$
 select public.business_set_role_internal(p_user_id,p_role,p_expected_revision,p_reason,p_operation_id,'recovery',p_context);
$$;
revoke all on function public.admin_set_business_role_v1(uuid,text,integer,text,uuid) from public,anon,service_role;
grant execute on function public.admin_set_business_role_v1(uuid,text,integer,text,uuid) to authenticated;
revoke all on function public.recovery_set_business_role_v1(uuid,text,integer,text,uuid,text) from public,anon,authenticated;
grant execute on function public.recovery_set_business_role_v1(uuid,text,integer,text,uuid,text) to service_role;

-- Owner audit reader. Legacy full admins keep compatibility before cutover.
create function public.admin_business_roles_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_admin();
 select jsonb_build_object('assignments',coalesce((select jsonb_agg(to_jsonb(r) order by user_id) from public.business_roles r),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by created_at desc,operation_id) from (select * from public.business_role_history order by created_at desc,operation_id limit 100) h),'[]'::jsonb),
 'activation',(select to_jsonb(a) from public.business_role_activation a)) into result;
 return result;
end;
$$;
revoke all on function public.admin_business_roles_v1() from public,anon,service_role;
grant execute on function public.admin_business_roles_v1() to authenticated;

-- Service-only, one-way cutover. EVERY active admin must have an explicitly
-- assigned owner role; no automatic conversion or compatibility timer.
create function public.activate_business_roles_v1(p_reason text,p_context text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('business-admin-memberships',0));
 perform 1 from public.business_role_control where singleton for update;
 if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 or p_context is null or char_length(btrim(p_context)) not between 1 and 200 then raise exception 'RECOVERY_CONTEXT_REQUIRED' using errcode='22023'; end if;
 if exists(select 1 from public.business_role_activation) then raise exception 'ROLES_ALREADY_ACTIVATED' using errcode='22023'; end if;
 if not exists(select 1 from public.business_admins a join public.business_roles r using(user_id) where a.active and r.role='owner') or
 exists(select 1 from public.business_admins a left join public.business_roles r using(user_id) where a.active and r.role is distinct from 'owner') then raise exception 'EXPLICIT_OWNER_ASSIGNMENTS_REQUIRED' using errcode='22023'; end if;
 update public.business_role_control set enabled=true where singleton;
 insert into public.business_role_activation(singleton,reason,recovery_context) values(true,btrim(p_reason),btrim(p_context));
end;
$$;
revoke all on function public.activate_business_roles_v1(text,text) from public,anon,authenticated;
grant execute on function public.activate_business_roles_v1(text,text) to service_role;
commit;
