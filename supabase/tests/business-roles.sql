-- Synthetic identities only in the disposable harness; all changes roll back.
begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end; raise exception 'FAIL: expected error %',label; end;$$;
insert into auth.users(id) values('80000000-0000-4000-8000-000000000001'),('80000000-0000-4000-8000-000000000002'),('80000000-0000-4000-8000-000000000003'),('80000000-0000-4000-8000-000000000004');
select public.set_business_admin('80000000-0000-4000-8000-000000000001',true,'Disposable owner A');
select public.set_business_admin('80000000-0000-4000-8000-000000000002',true,'Disposable owner B');
select public.set_business_admin('80000000-0000-4000-8000-000000000003',false,'Disposable future staff');
select pg_temp.assert(not (select enabled from public.business_role_control),'role activation defaults disabled');
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert(public.is_business_admin() and public.business_access_v1()='legacy','unassigned existing active administrator retains compatibility');
select pg_temp.assert(public.admin_dashboard_v1() is not null and public.admin_list_products() is not null,'legacy admin features retained before cutover');
select pg_temp.error('select public.activate_business_roles_v1(''Reason'',''Context'')','42501','browser cannot activate roles');
select pg_temp.error('select public.recovery_set_business_role_v1(null,null,null,null,null,null)','42501','browser cannot provision or recover roles');
select pg_temp.error('select public.admin_set_business_role_v1(null,null,null,null,null)','42501','owner role management disabled before cutover');
reset role;
select pg_temp.error('select public.activate_business_roles_v1(''Reviewed synthetic cutover'',''Fixture'')','22023','cutover rejects missing explicit owner assignments');
select pg_temp.error('select public.recovery_set_business_role_v1(''80000000-0000-4000-8000-000000000003'',''staff'',0,''Reason'',''80000000-1111-4000-8000-000000000003'',''Fixture'')','22023','cannot assign staff before legacy isolation enabled');
select public.recovery_set_business_role_v1('80000000-0000-4000-8000-000000000001','owner',0,'Verified fixture','80000000-1111-4000-8000-000000000001','Fixture');
select pg_temp.error('select public.activate_business_roles_v1(''Reason'',''Fixture'')','22023','all active admins require explicit owner assignments');
select public.recovery_set_business_role_v1('80000000-0000-4000-8000-000000000002','owner',0,'Verified fixture','80000000-1111-4000-8000-000000000002','Fixture');
select public.activate_business_roles_v1('Approved fixture cutover','Disposable security test');
select pg_temp.assert((select enabled from public.business_role_control) and (select count(*)=1 from public.business_role_activation),'activation is explicit and audited');
select pg_temp.error('select public.activate_business_roles_v1(''Reason'',''Fixture'')','22023','activation cannot be replayed as an unaudited toggle');
select public.recovery_set_business_role_v1('80000000-0000-4000-8000-000000000003','staff',0,'Staff fixture','80000000-1111-4000-8000-000000000003','Fixture');
select public.set_business_admin('80000000-0000-4000-8000-000000000003',true,'Explicit staff activation fixture');
select pg_temp.error('select public.recovery_set_business_role_v1(''80000000-0000-4000-8000-000000000003'',''administrator'',1,''Reason'',''80000000-4444-4000-8000-000000000001'',''Fixture'')','22023','unknown role rejected');
select pg_temp.error('select public.recovery_set_business_role_v1(''80000000-0000-4000-8000-000000000003'',''owner'',2147483647,''Reason'',''80000000-4444-4000-8000-000000000002'',''Fixture'')','22023','role revision arithmetic bounded');
select pg_temp.error('select public.recovery_set_business_role_v1(''80000000-0000-4000-8000-000000000003'',''owner'',1,''Reason'',''80000000-4444-4000-8000-000000000003'',null)','22023','recovery requires explicit operator context');
select pg_temp.error('select public.set_business_admin(''80000000-0000-4000-8000-000000000004'',true,''No role'')','22023','service cannot activate an unassigned member after cutover');
-- Include sensitive fields in source; projections must omit them at the server.
set constraints all deferred;
insert into public.orders(id,user_id,full_name,customer_email,customer_phone,fulfilment_method,pickup_location,payment_provider,payment_phone_last4,payment_status,currency,subtotal_cents,delivery_fee_cents,total_cents)
values('80000000-2222-4000-8000-000000000001','80000000-0000-4000-8000-000000000004','Private fixture','private@example.invalid','+23276521208','pickup','Fixture','orange','1208','awaiting_payment','NLE',100,0,100);
insert into public.order_items(order_id,product_id,product_name,quantity,unit_price_cents) values('80000000-2222-4000-8000-000000000001','table-lamp','Private product',1,100);
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.assert(not public.is_business_admin() and public.business_access_v1()='staff','staff never passes legacy admin or media upload check');
select pg_temp.assert(public.staff_dashboard_v1()=jsonb_build_object('open_orders',1,'completed_orders',0,'cancelled_orders',0),'staff dashboard returns only operational counts');
select pg_temp.assert((select array_agg(k order by k)=array['created_at','order_reference','status','total_cents'] from jsonb_object_keys(public.staff_orders_page_v1()->'items'->0) k),'staff order projection has exactly four approved fields');
select pg_temp.assert(public.staff_orders_page_v1()->>'has_more'='false' and jsonb_array_length(public.staff_orders_page_v1(1)->'items')=0,'bounded staff pagination and empty state');
select pg_temp.error('select public.staff_orders_page_v1(-1)','22023','invalid staff page denied');
select pg_temp.error('select * from public.business_roles','42501','direct assignments read denied');
select pg_temp.error('update public.business_roles set role=''owner''','42501','direct privilege escalation denied');
select pg_temp.error('select * from public.business_role_history','42501','staff cannot read global role audit');
select pg_temp.error('select public.require_business_access_v1()','42501','private authorization helper not exposed');
select pg_temp.error('select public.business_set_role_internal(null,null,null,null,null,null,null)','42501','private role transition not exposed');
-- Exercise every legacy and pending admin_* entry point, not only UI menus.
create function pg_temp.staff_rpc_denials() returns setof text language plpgsql as $$declare rpc record; statement text; caught boolean; begin
 for rpc in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'admin\_%' escape '\' loop
  select format('select public.%I(%s)',rpc.proname,coalesce(string_agg('null::'||format_type(t,null),',' order by ord),'')) into statement from unnest((select proargtypes::oid[] from pg_proc where oid=rpc.oid)) with ordinality args(t,ord);
  caught:=false;begin execute statement;exception when insufficient_privilege then caught:=true;end;
  if not caught then raise exception 'FAIL: staff bypass %',rpc.proname;end if;
  return next 'PASS: staff legacy/pending RPC denied '||rpc.proname;
 end loop;
end;$$;
select * from pg_temp.staff_rpc_denials();
reset role;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert(public.is_business_admin() and public.business_access_v1()='owner','explicit owner retains unrestricted authority');
select pg_temp.assert(public.admin_dashboard_v1() is not null and public.admin_get_order('80000000-2222-4000-8000-000000000001')->>'customer_email'='private@example.invalid','owner retains full admin projections');
select pg_temp.assert(jsonb_array_length(public.admin_business_roles_v1()->'history')=3,'owner can read immutable role history');
select pg_temp.error('select public.admin_set_business_role_v1(''80000000-0000-4000-8000-000000000003'',''staff'',0,''Staff fixture'',''80000000-1111-4000-8000-000000000003'')','22023','different actor/kind cannot reuse service role receipt');
select public.admin_set_business_role_v1('80000000-0000-4000-8000-000000000002','staff',1,'Approved fixture demotion','80000000-3333-4000-8000-000000000001') as receipt \gset
select pg_temp.assert(public.admin_set_business_role_v1('80000000-0000-4000-8000-000000000002','staff',1,'Approved fixture demotion','80000000-3333-4000-8000-000000000001')=:'receipt'::jsonb,'same actor normalized operation replays exact immutable role receipt');
select pg_temp.error('select public.admin_set_business_role_v1(''80000000-0000-4000-8000-000000000002'',''owner'',1,''Changed'',''80000000-3333-4000-8000-000000000001'')','22023','changed replay denied');
select pg_temp.error('select public.admin_set_business_role_v1(''80000000-0000-4000-8000-000000000002'',''owner'',1,''Stale'',''80000000-3333-4000-8000-000000000002'')','40001','stale role transition denied');
select pg_temp.error('select public.admin_set_business_role_v1(''80000000-0000-4000-8000-000000000001'',''staff'',1,''Demote last'',''80000000-3333-4000-8000-000000000003'')','22023','last active owner cannot self-demote');
select pg_temp.error('select public.admin_revoke_membership(''80000000-0000-4000-8000-000000000001'',now(),''Self'')','22023','existing self-revocation safeguard preserved');
reset role;
select pg_temp.error('select public.set_business_admin(''80000000-0000-4000-8000-000000000001'',false,''Recovery deactivation'')','22023','trusted service cannot remove last active owner');
select pg_temp.error('update public.business_role_history set reason=''Tamper''','23514','role audit immutable');
select pg_temp.error('delete from public.business_role_activation','23514','activation audit immutable');
select public.set_business_admin('80000000-0000-4000-8000-000000000003',false,'Fixture revocation');
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select pg_temp.error('select public.business_access_v1()','42501','revoked staff access denied');
select pg_temp.error('select public.staff_dashboard_v1()','42501','revoked summary denied');
select pg_temp.error('select public.staff_orders_page_v1()','42501','revoked orders denied');
select pg_temp.error('select public.admin_set_business_role_v1(''80000000-0000-4000-8000-000000000002'',''staff'',1,''Approved fixture demotion'',''80000000-3333-4000-8000-000000000001'')','42501','revoked actor cannot replay owner receipt');
reset role;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select pg_temp.error('select public.staff_dashboard_v1()','42501','customer summary denied');
select pg_temp.error('select public.staff_orders_page_v1()','42501','customer orders denied');
reset role;
set local role anon;
select pg_temp.error('select public.staff_dashboard_v1()','42501','anonymous summary denied');
select pg_temp.error('select public.staff_orders_page_v1()','42501','anonymous orders denied');
reset role;
select pg_temp.assert((select bool_and(prosecdef and proconfig=ARRAY['search_path=""']) from pg_proc where proname in ('business_access_v1','staff_dashboard_v1','staff_orders_page_v1','business_set_role_internal','activate_business_roles_v1')),'new role RPCs have fixed empty search paths');
select pg_temp.assert(not has_function_privilege('authenticated','public.activate_business_roles_v1(text,text)','execute') and not has_function_privilege('authenticated','public.recovery_set_business_role_v1(uuid,text,integer,text,uuid,text)','execute'),'activation and recovery remain service-only');
rollback;
