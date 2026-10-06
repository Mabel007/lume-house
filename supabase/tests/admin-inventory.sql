begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;$$;
create function pg_temp.error(statement text,expected text,label text) returns text language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate<>expected then raise; end if; return 'PASS: '||label; end;
raise exception 'FAIL: expected error %',label; end;$$;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001');
select public.set_business_admin('10000000-0000-4000-8000-000000000001',true,'Local fixture');
select updated_at::text as variant_updated from public.product_variants where id='default:amber-candle' \gset
set local role anon;
select pg_temp.error('select public.admin_list_inventory()','42501','anon inventory denied');
reset role;
set local role authenticated;
select pg_temp.error('select public.admin_list_inventory()','42501','customer private inventory denied');
select pg_temp.error($q$select public.admin_adjust_inventory('default:amber-candle',5,'Test','10000000-bbbb-4000-8000-000000000001')$q$,'42501','customer adjustment denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.error('update public.variant_inventory set on_hand=999','42501','admin direct stock bypass denied');
select pg_temp.error($q$select public.adjust_variant_inventory('default:amber-candle',5,'Bypass','10000000-bbbb-4000-8000-000000000001')$q$,'42501','service-only primitive not exposed to browser');
select pg_temp.error(format('select public.admin_set_inventory_policy(%L,%L,%L)','default:amber-candle','tracked',:'variant_updated'),'22023','tracking requires explicit actual stock');
select public.admin_adjust_inventory('default:amber-candle',5,'Local known stock','10000000-bbbb-4000-8000-000000000001');
select public.admin_adjust_inventory('default:amber-candle',5,'Local known stock','10000000-bbbb-4000-8000-000000000001');
select public.admin_set_inventory_policy('default:amber-candle','tracked',:'variant_updated');
reset role;
select updated_at::text as variant_updated from public.product_variants where id='default:amber-candle' \gset
set local role authenticated;
select pg_temp.assert(jsonb_array_length(public.admin_inventory_history('default:amber-candle'))=1,'idempotent adjustment one ledger event');
select pg_temp.error($q$select public.admin_adjust_inventory('default:amber-candle',-6,'Invalid','10000000-bbbb-4000-8000-000000000002')$q$,'P0001','negative balance rejected');
select public.admin_adjust_inventory('default:amber-candle',-2,'Local decrease','10000000-bbbb-4000-8000-000000000003');
reset role;
select pg_temp.assert((select on_hand=3 and allocated=0 from public.variant_inventory where variant_id='default:amber-candle'),'increase/decrease preserve trusted balance');
select pg_temp.assert((select bool_and(actor_user_id='10000000-0000-4000-8000-000000000001') from public.inventory_ledger),'adjustment actor recorded server-side');
update public.variant_inventory set allocated=2 where variant_id='default:amber-candle';
set local role authenticated;
select pg_temp.error(format('select public.admin_set_inventory_policy(%L,%L,%L)','default:amber-candle','untracked',:'variant_updated'),'22023','allocated stock cannot disable tracking');
select pg_temp.error($q$select public.admin_adjust_inventory('default:amber-candle',-2,'Below allocation','10000000-bbbb-4000-8000-000000000004')$q$,'P0001','decrease cannot consume allocated stock');
reset role;
update public.variant_inventory set allocated=0 where variant_id='default:amber-candle';
set local role authenticated;
select public.admin_set_inventory_policy('default:amber-candle','untracked',:'variant_updated');
reset role;
select pg_temp.assert((select on_hand=3 from public.variant_inventory where variant_id='default:amber-candle'),'untracked transition preserves actual balance');
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.error($q$select public.admin_inventory_history('default:amber-candle')$q$,'42501','customer adjustment notes denied');
reset role;
rollback;
