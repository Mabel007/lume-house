-- Isolated rollback-only identities, never hosted.
begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
set local role anon;
select pg_temp.error('select public.is_business_admin()','42501','anonymous admin probe denied');
select pg_temp.error('select * from public.business_admins','42501','anonymous memberships private');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(not public.is_business_admin(),'normal customer not admin');
select pg_temp.error($q$select public.set_business_admin('10000000-0000-4000-8000-000000000001',true,'Self escalation')$q$,'42501','customer cannot provision self');
select pg_temp.error('select public.require_business_admin()','42501','private helper not callable');
select pg_temp.error('update public.business_admins set active=true','42501','direct membership writes denied');
reset role;
set local role service_role;
select public.set_business_admin('10000000-0000-4000-8000-000000000001',true,'Local test provisioning');
reset role;
set local role authenticated;
select pg_temp.assert(public.is_business_admin(),'trusted provision grants admin');
select pg_temp.error($q$select public.set_business_admin('10000000-0000-4000-8000-000000000002',true,'Other')$q$,'42501','admin cannot provision others');
select pg_temp.error('select * from public.business_admins','42501','membership table stays private to admin browser');
reset role;
set local role service_role;
select public.set_business_admin('10000000-0000-4000-8000-000000000001',false,'Local revocation');
reset role;
set local role authenticated;
select pg_temp.assert(not public.is_business_admin(),'revocation effective without JWT refresh');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.assert(not public.is_business_admin(),'other customer remains nonadmin');
reset role;
select pg_temp.assert((select relrowsecurity from pg_class where oid='public.business_admins'::regclass),'membership RLS enabled');
rollback;
