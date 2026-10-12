-- Permanent version conflicts must not trigger PostgREST serialization retries.
-- Preserve locks, receipts, authorization, function identity and grants.
begin;
create or replace function public.admin_save_fulfilment_v1(p_order_id uuid,p_expected_version integer,p_carrier_label text,p_tracking_reference text,p_reason text,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare carrier text:=nullif(btrim(p_carrier_label),''); tracking text:=nullif(btrim(p_tracking_reference),''); reason text:=btrim(p_reason);
 receipt public.business_fulfilment_operations%rowtype; current_value public.business_order_fulfilment%rowtype; method text; previous jsonb; result jsonb; saved_at timestamptz;
begin
 perform public.require_business_admin();
 if p_order_id is null or p_operation_id is null or p_expected_version is null or p_expected_version not between 0 and 2147483646
 or char_length(coalesce(p_carrier_label,''))>100 or char_length(coalesce(p_tracking_reference,''))>100
 or coalesce(p_carrier_label,'') ~ '[[:cntrl:]]' or (tracking is not null and tracking !~ '^[A-Za-z0-9 ._/#()+-]+$')
 or reason is null or char_length(reason) not between 1 and 500 or reason ~ '[[:cntrl:]]'
 then raise exception 'INVALID_FULFILMENT_INPUT' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('fulfilment:'||p_operation_id::text,0));
 select * into receipt from public.business_fulfilment_operations where operation_id=p_operation_id;
 if found then
  if receipt.actor_user_id is distinct from auth.uid() or receipt.order_id is distinct from p_order_id or receipt.expected_version is distinct from p_expected_version
   or receipt.carrier_label is distinct from carrier or receipt.tracking_reference is distinct from tracking or receipt.reason is distinct from reason
   then raise exception 'OPERATION_REUSED' using errcode='22023'; end if;
  return receipt.result;
 end if;
 -- Same order lock as existing transitions; independent edits serialize without modifying lifecycle.
 select fulfilment_method into method from public.orders where id=p_order_id for update;
 if not found or method<>'delivery' then raise exception 'DELIVERY_ORDER_REQUIRED' using errcode='22023'; end if;
 select * into current_value from public.business_order_fulfilment where order_id=p_order_id;
 if coalesce(current_value.version,0)<>p_expected_version then raise exception 'FULFILMENT_CHANGED' using errcode='PT409'; end if;
 previous:=jsonb_build_object('carrier_label',current_value.carrier_label,'tracking_reference',current_value.tracking_reference,'version',coalesce(current_value.version,0));
 saved_at:=clock_timestamp();
 insert into public.business_order_fulfilment(order_id,carrier_label,tracking_reference,version,updated_at,updated_by)
 values(p_order_id,carrier,tracking,p_expected_version+1,saved_at,auth.uid())
 on conflict(order_id) do update set carrier_label=excluded.carrier_label,tracking_reference=excluded.tracking_reference,version=excluded.version,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 result:=jsonb_build_object('order_id',p_order_id,'carrier_label',carrier,'tracking_reference',tracking,'version',p_expected_version+1,'updated_at',saved_at);
 insert into public.business_fulfilment_operations(operation_id,order_id,actor_user_id,expected_version,carrier_label,tracking_reference,reason,previous_value,result)
 values(p_operation_id,p_order_id,auth.uid(),p_expected_version,carrier,tracking,reason,previous,result);
 return result;
end;
$$;
commit;
