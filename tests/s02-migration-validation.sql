-- Inspect the schema already applied by the disposable harness. Never replay migrations.
\set ON_ERROR_STOP on
\if :{?LUME_DISPOSABLE_TEST}
begin;
do $$
begin
  if not (select relrowsecurity from pg_class where oid='public.customer_addresses'::regclass)
    or not (select relrowsecurity from pg_class where oid='public.customer_notifications'::regclass) then
    raise exception 'S02 RLS missing';
  end if;
  if has_table_privilege('authenticated','public.customer_notifications','UPDATE')
    or has_table_privilege('authenticated','public.orders','INSERT')
    or has_table_privilege('authenticated','public.order_confirmation_jobs','SELECT')
    or has_function_privilege('anon','public.save_customer_address(uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.claim_retry_jobs(integer,integer)','EXECUTE') then
    raise exception 'Unexpected browser privileges';
  end if;
  if exists(select 1 from pg_proc where oid in (
    'public.claim_retry_jobs(integer,integer)'::regprocedure,
    'public.claim_order_confirmation(uuid,text)'::regprocedure,
    'public.finish_order_confirmation(uuid,uuid,text,text)'::regprocedure,
    'public.save_customer_address(uuid,jsonb)'::regprocedure)
    and (not prosecdef or proconfig is distinct from array['search_path=""'])) then
    raise exception 'Unexpected privileged function configuration';
  end if;
end;
$$;
rollback;
select 'PASS: S02 RLS, grants and privileged function configuration';
\else
do $$begin raise exception 'Run through the disposable SQL harness; direct validation is disabled';end;$$;
\endif
