-- Additive admin-only manual metadata. Does not change orders, payments or allocation.
begin;
create table public.business_order_fulfilment (
 order_id uuid primary key references public.orders(id) on delete restrict,
 carrier_label text check (char_length(carrier_label) between 1 and 100 and carrier_label !~ '[[:cntrl:]]'),
 tracking_reference text check (char_length(tracking_reference) between 1 and 100 and tracking_reference ~ '^[A-Za-z0-9 ._/#()+-]+$'),
 version integer not null check (version between 1 and 2147483647),
 updated_at timestamptz not null,
 updated_by uuid not null references auth.users(id) on delete restrict
);
create table public.business_fulfilment_operations (
 operation_id uuid primary key,
 order_id uuid not null references public.orders(id) on delete restrict,
 actor_user_id uuid not null references auth.users(id) on delete restrict,
 expected_version integer not null check (expected_version between 0 and 2147483646),
 carrier_label text,
 tracking_reference text,
 reason text not null,
 previous_value jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create unique index business_fulfilment_history_order on public.business_fulfilment_operations(order_id,expected_version desc);
alter table public.business_order_fulfilment enable row level security;
alter table public.business_fulfilment_operations enable row level security;
revoke all on public.business_order_fulfilment,public.business_fulfilment_operations from public,anon,authenticated,service_role;
create trigger business_fulfilment_history_immutable before update or delete on public.business_fulfilment_operations for each row execute function public.protect_business_order_operation();

create function public.admin_get_fulfilment_v1(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; history jsonb;
begin
 perform public.require_business_admin();
 if p_order_id is null then raise exception 'INVALID_ORDER' using errcode='22023'; end if;
 -- Freeze this order's metadata writers while current value and history are read.
 perform 1 from public.orders where id=p_order_id for share;
 if not found then raise exception 'ORDER_NOT_FOUND' using errcode='22023'; end if;
 select jsonb_build_object('order_id',order_id,'carrier_label',carrier_label,'tracking_reference',tracking_reference,'version',version,'updated_at',updated_at)
 into result from public.business_order_fulfilment where order_id=p_order_id;
 result:=coalesce(result,jsonb_build_object('order_id',p_order_id,'carrier_label',null,'tracking_reference',null,'version',0,'updated_at',null));
 select coalesce(jsonb_agg(jsonb_build_object('operation_id',h.operation_id,'carrier_label',h.carrier_label,'tracking_reference',h.tracking_reference,'reason',h.reason,'version',h.expected_version+1,'created_at',h.created_at) order by h.expected_version desc),'[]'::jsonb)
 into history from (select op.* from public.business_fulfilment_operations op where op.order_id=p_order_id order by op.expected_version desc limit 50) h;
 return jsonb_build_object('current',result,'history',history);
end;
$$;

create function public.admin_save_fulfilment_v1(p_order_id uuid,p_expected_version integer,p_carrier_label text,p_tracking_reference text,p_reason text,p_operation_id uuid) returns jsonb
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
 if coalesce(current_value.version,0)<>p_expected_version then raise exception 'FULFILMENT_CHANGED' using errcode='40001'; end if;
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
revoke all on function public.admin_get_fulfilment_v1(uuid),public.admin_save_fulfilment_v1(uuid,integer,text,text,text,uuid) from public,anon,service_role;
grant execute on function public.admin_get_fulfilment_v1(uuid),public.admin_save_fulfilment_v1(uuid,integer,text,text,text,uuid) to authenticated;
commit;
