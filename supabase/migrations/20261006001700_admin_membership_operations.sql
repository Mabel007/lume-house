begin;
-- Unknown historic provisioning times stay null.
alter table public.business_admins add column created_at timestamptz;
alter table public.business_admins alter column created_at set default now();
create table public.business_admin_history (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete restrict,
 actor_user_id uuid references auth.users(id) on delete restrict,
 active boolean not null, reason text not null,
 created_at timestamptz not null default now()
);
alter table public.business_admin_history enable row level security;
revoke all on public.business_admin_history from public,anon,authenticated,service_role;
create trigger business_admin_history_immutable before update or delete on public.business_admin_history for each row execute function public.protect_business_order_operation();
create function public.record_business_admin_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.business_admin_history(user_id,actor_user_id,active,reason) values(new.user_id,auth.uid(),new.active,new.reason);
 return new;
end;
$$;
revoke all on function public.record_business_admin_change() from public,anon,authenticated,service_role;
create trigger business_admin_history_record after insert or update on public.business_admins for each row execute function public.record_business_admin_change();
create or replace function public.set_business_admin(p_user_id uuid,p_active boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('business-admin-memberships',0));
 if p_user_id is null or p_active is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'INVALID_ADMIN_MEMBERSHIP' using errcode='22023'; end if;
 insert into public.business_admins(user_id,active,reason) values(p_user_id,p_active,btrim(p_reason))
 on conflict(user_id) do update set active=excluded.active,reason=excluded.reason,updated_at=now();
end;
$$;
create function public.admin_list_memberships() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_admin();
 select coalesce(jsonb_agg(to_jsonb(m) order by m.user_id),'[]') into result from public.business_admins m;
 return result;
end;
$$;
create function public.admin_membership_history() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_admin();
 select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc,h.id),'[]') into result from (select * from public.business_admin_history order by created_at desc,id limit 100) h;
 return result;
end;
$$;
create function public.admin_revoke_membership(p_user_id uuid,p_expected_updated_at timestamptz,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare membership public.business_admins%rowtype;
begin
 -- All membership mutations share this lock before acquiring membership rows.
 perform pg_advisory_xact_lock(hashtextextended('business-admin-memberships',0));
 perform public.require_business_admin();
 if p_user_id is null or p_user_id=auth.uid() then raise exception 'SELF_REVOCATION_DISABLED' using errcode='22023'; end if;
 select * into membership from public.business_admins where user_id=p_user_id for update;
 if not found or not membership.active then raise exception 'ACTIVE_MEMBERSHIP_REQUIRED' using errcode='22023'; end if;
 if p_expected_updated_at is null or membership.updated_at is distinct from p_expected_updated_at then raise exception 'MEMBERSHIP_CHANGED' using errcode='40001'; end if;
 if (select count(*) from public.business_admins where active)<2 then raise exception 'LAST_ADMIN_PROTECTED' using errcode='22023'; end if;
 perform public.set_business_admin(p_user_id,false,p_reason);
end;
$$;
revoke all on function public.admin_list_memberships(),public.admin_membership_history(),public.admin_revoke_membership(uuid,timestamptz,text) from public,anon;
grant execute on function public.admin_list_memberships(),public.admin_membership_history(),public.admin_revoke_membership(uuid,timestamptz,text) to authenticated;
-- set_business_admin retains its existing service-role-only execution grant.
commit;
