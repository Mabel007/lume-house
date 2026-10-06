begin;
create table public.order_cancellation_requests (
 order_id uuid primary key references public.orders(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict,
 reason text not null check(char_length(reason)<=500),
 requested_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','accepted','rejected','closed')),
 resolved_at timestamptz,
 resolved_by uuid references auth.users(id) on delete restrict,
 resolution text,
 check((status='pending' and resolved_at is null and resolved_by is null and resolution is null)
    or (status<>'pending' and resolved_at is not null and resolution is not null))
);
alter table public.order_cancellation_requests enable row level security;
revoke all on public.order_cancellation_requests from public,anon,authenticated,service_role;
create function public.customer_cancellation_request(p_order_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare purchase public.orders%rowtype; request public.order_cancellation_requests%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if p_reason is null or char_length(btrim(p_reason))>500 then raise exception 'INVALID_REASON' using errcode='22023'; end if;
 select * into purchase from public.orders where id=p_order_id and user_id=auth.uid() for update;
 if not found then raise exception 'ORDER_UNAVAILABLE' using errcode='42501'; end if;
 select * into request from public.order_cancellation_requests where order_id=p_order_id;
 if found then
  if request.reason is distinct from btrim(p_reason) then raise exception 'REQUEST_ALREADY_EXISTS' using errcode='22023'; end if;
  return to_jsonb(request)-'user_id'-'resolved_by';
 end if;
 if purchase.status not in ('placed','confirmed') then raise exception 'CANCELLATION_REQUEST_UNAVAILABLE' using errcode='22023'; end if;
 insert into public.order_cancellation_requests(order_id,user_id,reason) values(p_order_id,auth.uid(),btrim(p_reason)) returning * into request;
 return to_jsonb(request)-'user_id'-'resolved_by';
end;
$$;
create function public.customer_get_cancellation_request(p_order_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.orders where id=p_order_id and user_id=auth.uid()) then raise exception 'ORDER_UNAVAILABLE' using errcode='42501'; end if;
 select to_jsonb(r)-'user_id'-'resolved_by' into result from public.order_cancellation_requests r where order_id=p_order_id;
 return result;
end;
$$;
create function public.admin_get_cancellation_request(p_order_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_admin();
 select to_jsonb(r)-'user_id'-'resolved_by' into result from public.order_cancellation_requests r where order_id=p_order_id;
 return result;
end;
$$;
create function public.admin_reject_cancellation_request(p_order_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare request public.order_cancellation_requests%rowtype;
begin
 perform public.require_business_admin();
 if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'INVALID_REASON' using errcode='22023'; end if;
 perform 1 from public.orders where id=p_order_id for update;
 select * into request from public.order_cancellation_requests where order_id=p_order_id for update;
 if not found then raise exception 'REQUEST_UNAVAILABLE' using errcode='22023'; end if;
 if request.status='rejected' and request.resolution=btrim(p_reason) then return to_jsonb(request)-'user_id'-'resolved_by'; end if;
 if request.status<>'pending' then raise exception 'REQUEST_RESOLVED' using errcode='22023'; end if;
 update public.order_cancellation_requests set status='rejected',resolved_at=now(),resolved_by=auth.uid(),resolution=btrim(p_reason) where order_id=p_order_id returning * into request;
 return to_jsonb(request)-'user_id'-'resolved_by';
end;
$$;
create function public.close_order_cancellation_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status and new.status not in ('placed','confirmed') then
  update public.order_cancellation_requests set status=case when new.status='cancelled' then 'accepted' else 'closed' end,
    resolved_at=now(),resolved_by=auth.uid(),resolution=case when new.status='cancelled' then 'Order cancelled by Lumé House. Cancellation does not issue a refund.' else 'Fulfilment has progressed; cancellation is no longer available.' end
    where order_id=new.id and status='pending';
 end if;
 return new;
end;
$$;
revoke all on function public.close_order_cancellation_request() from public,anon,authenticated,service_role;
create trigger orders_close_cancellation_request after update of status on public.orders for each row execute function public.close_order_cancellation_request();
revoke all on function public.customer_cancellation_request(uuid,text),public.customer_get_cancellation_request(uuid),public.admin_get_cancellation_request(uuid),public.admin_reject_cancellation_request(uuid,text) from public,anon;
grant execute on function public.customer_cancellation_request(uuid,text),public.customer_get_cancellation_request(uuid),public.admin_get_cancellation_request(uuid),public.admin_reject_cancellation_request(uuid,text) to authenticated;
commit;
