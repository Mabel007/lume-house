-- Unapplied S02 migration. Candidates are not reservations; the existing single-order RPC owns leases.
begin;
create or replace function public.claim_retry_jobs(p_batch_size integer default 50,p_max_attempts integer default 10)
returns table(order_id uuid,status text,attempts integer,next_attempt_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if p_batch_size is null or p_batch_size not between 1 and 50 or p_max_attempts is null or p_max_attempts not between 1 and 10 then
    raise exception 'INVALID_RETRY_BATCH' using errcode='22023';
  end if;
  -- Service-only EXECUTE grant; no legacy JWT GUC dependency.
  return query select j.order_id,j.status,j.attempts,j.next_attempt_at
  from public.order_confirmation_jobs j
  where j.attempts<p_max_attempts and j.next_attempt_at<=now()
    and j.last_error_code is distinct from 'manual_reconciliation_required'
    and (j.status in ('pending','failed') or (j.status='processing' and j.locked_until<=now()))
  order by j.next_attempt_at,j.order_id limit p_batch_size;
end;
$$;
create or replace function public.claim_order_confirmation(p_order_id uuid,p_sender text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.order_confirmation_jobs%rowtype;
begin
  if p_sender is null or char_length(p_sender) not between 3 and 254 then raise exception 'INVALID_SENDER'; end if;
  select j.* into job from public.order_confirmation_jobs j where j.order_id=p_order_id for update;
  if not found or job.status='sent' or job.attempts>=10 or job.last_error_code='manual_reconciliation_required' then return null; end if;
  if job.status='processing' and job.locked_until>now() then return null; end if;
  if job.next_attempt_at>now() then return null; end if;
  if job.first_attempt_at is not null and job.first_attempt_at<now()-interval '23 hours' then
    update public.order_confirmation_jobs set status='failed',claim_token=null,locked_until=null,
      last_error_code='manual_reconciliation_required' where order_id=p_order_id;
    return null;
  end if;
  update public.order_confirmation_jobs set status='processing',claim_token=gen_random_uuid(),
    locked_until=now()+interval '2 minutes',attempts=attempts+1,
    first_attempt_at=coalesce(first_attempt_at,now()),sender_snapshot=coalesce(sender_snapshot,p_sender)
    where order_id=p_order_id returning * into job;
  return jsonb_build_object('order_id',job.order_id,'claim_token',job.claim_token,'sender',job.sender_snapshot);
end;
$$;
create or replace function public.finish_order_confirmation(p_order_id uuid,p_claim_token uuid,p_provider_id text,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  -- Atomic completion/backoff: a stale worker cannot change a newer lease.
  update public.order_confirmation_jobs j set
    status=case when p_provider_id is not null then 'sent' else 'failed' end,
    sent_at=case when p_provider_id is not null then now() else null end,
    provider_message_id=p_provider_id,last_error_code=left(p_error_code,100),claim_token=null,locked_until=null,
    next_attempt_at=now()+make_interval(mins=>case when j.attempts>=5 then 60 else 5*(1 << greatest(j.attempts-1,0)) end)
  where j.order_id=p_order_id and j.status='processing' and j.claim_token=p_claim_token;
  return found;
end;
$$;
revoke all on function public.claim_retry_jobs(integer,integer),public.claim_order_confirmation(uuid,text),public.finish_order_confirmation(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_retry_jobs(integer,integer),public.claim_order_confirmation(uuid,text),public.finish_order_confirmation(uuid,uuid,text,text) to service_role;
commit;
