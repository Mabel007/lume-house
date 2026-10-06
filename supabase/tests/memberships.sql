begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
select public.set_business_admin('10000000-0000-4000-8000-000000000001',true,'Local fixture');
set local role anon;
select pg_temp.error('select public.admin_list_memberships()','42501','anonymous membership denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.error('select public.admin_list_memberships()','42501','customer membership denied');
select pg_temp.error($q$select public.set_business_admin('10000000-0000-4000-8000-000000000002',true,'Escalation')$q$,'42501','self promotion denied');
reset role;
select public.set_business_admin('10000000-0000-4000-8000-000000000002',true,'Local second fixture');
select updated_at::text as stamp from public.business_admins where user_id='10000000-0000-4000-8000-000000000002' \gset
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.assert(jsonb_array_length(public.admin_list_memberships())=2,'admin lists memberships');
select pg_temp.error($q$select public.admin_revoke_membership('10000000-0000-4000-8000-000000000001',now(),'Self')$q$,'22023','self revocation prevented');
select public.admin_revoke_membership('10000000-0000-4000-8000-000000000002',:'stamp','Local revoke');
select pg_temp.assert(jsonb_array_length(public.admin_membership_history())=3,'membership change audit exists');
select pg_temp.error('update public.business_admins set active=true','42501','direct membership bypass denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.error('select public.admin_list_products()','42501','revoked admin loses operation access');
reset role;
select pg_temp.assert((select count(*)=1 from public.business_admins where active),'last operator preserved');
select pg_temp.error('delete from public.business_admin_history','23514','audit immutable even privileged');
rollback;
