-- Network-disabled disposable harness only. Every identity/order rolls back.
begin;
create function pg_temp.assert(ok boolean,label text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end;$$;
create function pg_temp.denied(statement text,expected text) returns text language plpgsql as $$
begin begin execute statement;exception when others then if sqlstate<>expected then raise;end if;return 'PASS: denied '||expected;end;raise exception 'FAIL: expected denial';end;$$;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select public.place_direct_variant_order('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','default:table-lamp',1,
 (select jsonb_build_object('product_id',product_id,'variant_id',id,'quantity',1,'unit_price',price_cents) from public.product_variants where id='default:table-lamp'),
 '{"full_name":"SQL fixture","email":"fixture@example.invalid","contact_phone":"+23276521208","payment_phone":"+23276521209","provider":"orange","fulfilment":"pickup","country_code":"SL"}'::jsonb);
select id as oid from public.orders \gset
select id as nid from public.customer_notifications where order_id=:'oid' \gset
select pg_temp.assert((select count(*)=1 from public.customer_notifications where event_type='order_placed'),'placement notification from trusted order');
select pg_temp.assert((select count(*)=1 from public.get_customer_order_timeline(:'oid') where event_type='order_placed'),'owner placement timeline');
select pg_temp.assert(not has_table_privilege('authenticated','public.customer_notifications','UPDATE'),'no browser notification UPDATE');
select pg_temp.denied('select public.save_customer_address(gen_random_uuid(),''{"is_default":true}''::jsonb)','P0002');
select pg_temp.denied('select public.save_customer_address(null,''{"customer_id":"forged"}''::jsonb)','22023');
select pg_temp.denied('insert into public.customer_addresses(customer_id,label,street_address,area,city,zone_id,is_default) values(auth.uid(),''Home'',''Street'',''Lumley'',''Freetown'',''zone-1'',true)','42501');
select pg_temp.denied('update public.customer_notifications set title=''tampered''','42501');
select public.mark_notification_read(:'nid');
select pg_temp.assert((select is_read and read_at is not null from public.customer_notifications where id=:'nid'),'owner mark read');
select public.mark_notification_unread(:'nid');
select pg_temp.assert(public.mark_all_notifications_read()=1,'owner mark all');
select pg_temp.denied('select * from public.claim_retry_jobs()','42501');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select pg_temp.assert((select count(*)=0 from public.customer_notifications),'other owner sees no notifications');
select pg_temp.denied(format('select * from public.get_customer_order_timeline(%L)',:'oid'),'P0002');
select pg_temp.denied(format('select public.mark_notification_unread(%L)',:'nid'),'P0002');
select pg_temp.assert(public.mark_all_notifications_read()=0,'other owner mark-all affects no rows');
reset role;
set local role anon;
select pg_temp.denied('select * from public.customer_notifications','42501');
select pg_temp.denied(format('select public.mark_notification_read(%L)',:'nid'),'42501');
reset role;
insert into public.business_admins(user_id,reason) values('22222222-2222-4222-8222-222222222222','isolated fixture');
set local role authenticated;
select public.admin_transition_order(:'oid','placed','confirmed','INTERNAL NOTE MUST NOT LEAK','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
reset role;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
select pg_temp.assert((select count(*)=2 from public.get_customer_order_timeline(:'oid')),'placement plus confirmed timeline');
select pg_temp.assert((select array_agg(t.event_type)=array['order_placed','order_confirmed'] from public.get_customer_order_timeline(:'oid') t),'tied transaction timestamps preserve lifecycle order');
select pg_temp.assert((select jsonb_agg(to_jsonb(t))::text not like '%INTERNAL NOTE%' from public.get_customer_order_timeline(:'oid') t),'timeline hides internal notes');
reset role;
update public.orders set status='confirmed' where id=:'oid';
select pg_temp.assert((select count(*)=1 from public.customer_notifications where event_type='order_confirmed'),'status deduplication');

-- Actual service RPC execution with modern PostgREST claims, no legacy role GUC.
set local request.jwt.claims='{"role":"service_role"}';
set local role service_role;
select pg_temp.assert((select count(*)=1 from public.claim_retry_jobs()),'pending job selected');
select pg_temp.assert((select count(*)=1 from public.claim_retry_jobs()),'selection survives scheduler crash before claim');
select pg_temp.assert((select attempts=0 from public.order_confirmation_jobs),'candidate selection does not increment');
select pg_temp.denied('select * from public.claim_retry_jobs(0,10)','22023');
select public.claim_order_confirmation(:'oid','Fixture <sender@example.invalid>') as claim1 \gset
select pg_temp.assert(public.claim_order_confirmation(:'oid','Fixture <sender@example.invalid>') is null,'active lease cannot be claimed again');
select pg_temp.assert((select attempts=1 from public.order_confirmation_jobs),'one increment per claim');
select pg_temp.assert(not public.finish_order_confirmation(:'oid',gen_random_uuid(),null,'send_failed'),'wrong token cannot finish');
select pg_temp.assert(public.finish_order_confirmation(:'oid',(:'claim1'::jsonb->>'claim_token')::uuid,null,'send_failed'),'owner completes failure');
select pg_temp.assert((select status='failed' and next_attempt_at=now()+interval '5 minutes' from public.order_confirmation_jobs),'first failure atomic five-minute backoff');
select pg_temp.assert((select count(*)=0 from public.claim_retry_jobs()),'backoff respected');
reset role;
update public.order_confirmation_jobs set next_attempt_at=now();
set local role service_role;
select public.claim_order_confirmation(:'oid','Fixture <sender@example.invalid>') as claim2 \gset
select pg_temp.assert(public.finish_order_confirmation(:'oid',(:'claim2'::jsonb->>'claim_token')::uuid,null,'send_failed'),'second failure completed');
select pg_temp.assert((select attempts=2 and next_attempt_at=now()+interval '10 minutes' from public.order_confirmation_jobs),'second attempt counted once; ten-minute backoff');
reset role;
update public.order_confirmation_jobs set next_attempt_at=now(),attempts=10;
set local role service_role;
select pg_temp.assert((select count(*)=0 from public.claim_retry_jobs()),'attempt limit excludes candidates');
select pg_temp.assert(public.claim_order_confirmation(:'oid','Fixture <sender@example.invalid>') is null,'direct claim cannot bypass attempt limit');
reset role;
update public.order_confirmation_jobs set attempts=2,last_error_code='manual_reconciliation_required';
set local role service_role;
select pg_temp.assert((select count(*)=0 from public.claim_retry_jobs()),'manual review excluded');
select pg_temp.assert(public.claim_order_confirmation(:'oid','Fixture <sender@example.invalid>') is null,'direct claim cannot bypass manual review');
reset role;
update public.order_confirmation_jobs set last_error_code=null,first_attempt_at=now()-interval '24 hours';
set local role service_role;
select pg_temp.assert(public.claim_order_confirmation(:'oid','Fixture <sender@example.invalid>') is null,'old provider window fails closed');
select pg_temp.assert((select last_error_code='manual_reconciliation_required' and attempts=2 from public.order_confirmation_jobs),'manual review does not consume an attempt');
reset role;
update public.order_confirmation_jobs set last_error_code=null,first_attempt_at=now(),next_attempt_at=now();
set local role service_role;
select public.claim_order_confirmation(:'oid','Fixture <sender@example.invalid>') as claim3 \gset
reset role;
update public.order_confirmation_jobs set locked_until=now()-interval '1 second';
set local role service_role;
select pg_temp.assert((select count(*)=1 from public.claim_retry_jobs()),'expired processing lease eligible');
select public.claim_order_confirmation(:'oid','Fixture <sender@example.invalid>') as claim4 \gset
select pg_temp.assert(not public.finish_order_confirmation(:'oid',(:'claim3'::jsonb->>'claim_token')::uuid,null,'stale_worker'),'stale token cannot change newer lease/backoff');
select pg_temp.assert((select status='processing' and attempts=4 and claim_token=(:'claim4'::jsonb->>'claim_token')::uuid from public.order_confirmation_jobs),'new claim retains exclusive ownership');
select pg_temp.assert(public.finish_order_confirmation(:'oid',(:'claim4'::jsonb->>'claim_token')::uuid,'fixture-provider-id',null),'new owner completes');
select pg_temp.assert((select count(*)=0 from public.claim_retry_jobs()),'sent job excluded');
reset role;
rollback;
select 'PASS: S02 security fixtures rolled back';
