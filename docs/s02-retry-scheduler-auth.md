# S02 retry scheduler authentication and operations contract

Status: **CANCELLED / OUT OF SCOPE by owner decision, 2026-11-18 (D2).** Hosted credential selection, scheduling and deployment are neither authorized nor requested. Do not configure a scheduler, create or select a named secret, set `RETRY_SCHEDULER_KEY_NAME`, deploy `retry-failed-emails`, or open tickets to finish this work. The existing fail-closed behavior is the intended behavior: a confirmation job that cannot send stays durable and is never retried on its own, and no document here may be cited as evidence that failed emails retry automatically.

This contract is retained unchanged as the historical authentication and operations design record for the code that shipped in `20261103003001`. Reopen it only if the owner explicitly changes the requirement. Canonical decisions: [`../AGENTS.md`](../AGENTS.md#owner-engineering-decisions).

Previously recorded status, superseded by the paragraph above: local implementation verified; hosted credential selection, scheduling and deployment are NOT authorized or configured.

## Implemented authentication

`retry-failed-emails` accepts POST requests with an `apikey` header. It compares the supplied value with exactly one owner-selected named secret API key from Supabase's injected `SUPABASE_SECRET_KEYS` JSON dictionary. `RETRY_SCHEDULER_KEY_NAME` selects that dictionary entry and has no default. Missing selection, malformed configuration or a missing/non-secret entry returns 503 before any database call. Missing/wrong credentials return 401. GET returns 405. Missing Resend configuration returns 503 without selecting or claiming jobs.

The function's repository configuration explicitly sets `verify_jwt=false`: this is service-to-service API-key authentication, enforced in the handler, not an anonymous endpoint. The handler accepts neither user JWTs, forged service-role claims, legacy bearer tokens nor publishable keys. It does not read, generate or require a JWT signing secret. No automatic cron JWT generation is assumed. API keys are not JWTs, so exp/sub/issuer claims do not apply.

The selected key authenticates a service credential, not a human or an independently attested scheduler process. Anyone holding that key can call the endpoint. Supabase secret API keys also carry project service privileges outside this endpoint; the handler is not a way to reduce the key's project-wide authority.

## Owner decisions that would precede hosted work (not requested since the 2026-11-18 cancellation)

1. Select a dedicated named Supabase secret API key for the scheduler (recommended, if available), or explicitly accept reuse of an existing named server key and its shared privilege/rotation exposure. Provide only the key NAME in ordinary documentation; never disclose the key value in chat, Git, browser configuration or logs. Creating a new key requires separate approval; none was created here.
2. Select Supabase pg_cron + pg_net with Vault custody, or an external scheduler with its own approved secret store. Both can use the implemented POST/apikey contract. No scheduler was configured.
3. Approve frequency, batch/attempt limits, failure monitoring, credential rotation ownership and staged acceptance. The local defaults are at most 50 candidates and 10 actual claims per job.
4. If project service credentials are unacceptable, commission a separately reviewed least-privilege broker/authentication design. There is no silent fallback to legacy JWTs or a newly invented shared token.

## Credential custody and rotation

- Supabase injects `SUPABASE_URL` and `SUPABASE_SECRET_KEYS`. The URL is public configuration; secret key VALUES are private. The handler does not print either the selected key or raw provider errors.
- Set `RETRY_SCHEDULER_KEY_NAME` only during separately authorized hosted configuration, after verifying the named entry exists in the target runtime. Do not set reserved `SUPABASE_*` variables manually.
- For pg_cron, store the invocation key in Supabase Vault and retrieve it within the scheduled command. Do not embed a literal credential in cron.job.command, SQL migrations or reports. Use `cron.schedule`, not direct inserts into cron.job with guessed columns.
- pg_net temporarily places decrypted request headers in its request queue. Audit access to that queue and database login roles before approving this custody arrangement; Vault alone does not eliminate this exposure.
- Rotation must coordinate the named key/handler selection, Vault or external-store value and scheduler. Pause invocation if necessary, update the approved key selection/store, verify a successful authorized request plus rejection of the old credential, then revoke the old key. A temporary 401/503 is fail-closed and does not mutate jobs. Active durable leases remain recoverable. Do not rotate the project's JWT signing secret to satisfy this endpoint.

Example scheduling shape, recorded only as the historical design and **not** an instruction: the cancelled status above forbids running this or any equivalent `cron.schedule`/`net.http_post` statement.

```sql
select cron.schedule(
  'lume-retry-order-confirmations',
  '*/5 * * * *',
  $$select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'approved_lume_project_url')
      || '/functions/v1/retry-failed-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'approved_lume_retry_key')
    ),
    body := '{}'::jsonb
  );$$
);
```

The symbolic Vault names above are not configured resources. The actual project, Vault entries, key choice and privileges require a separate approved release plan.

## RPC authorization and durable processing

`claim_retry_jobs(integer,integer)` retains its two-argument interface but is a non-mutating candidate selector. It includes due pending/failed jobs and expired processing leases, excludes manual-review jobs and exhausted attempts, and validates bounded inputs. EXECUTE is revoked from PUBLIC, anon and authenticated and granted only to service_role. PostgREST authenticates that role; SQL does not depend on the obsolete request.jwt.claim.role GUC. SECURITY DEFINER functions use a fixed empty search_path.

Candidate lists may overlap across schedulers. They are not reservations. `claim_order_confirmation(uuid,text)` is the only durable claim mechanism: it locks the job row, rejects active leases, sent/manual-review/exhausted/not-due jobs, assigns a new claim token and two-minute lease, and increments attempts exactly once. A crash before claiming leaves the candidate unchanged; a crash after claiming is recovered after lease expiry.

`finish_order_confirmation(uuid,uuid,text,text)` atomically finishes and schedules backoff only when status and claim token still match. Backoff uses the actual claim count: 5, 10, 20, 40, then 60 minutes capped. The Edge handler never writes job status, attempts or next_attempt_at directly. A stale token cannot finish or change a newer lease's schedule.

The existing confirmation path, immutable order snapshots, sender snapshot and provider idempotency key `lume-order-confirmation-v1-{order_id}` remain in use. Attempts older than the 23-hour provider ambiguity window fail closed to manual review. No external exactly-once delivery guarantee is claimed: a provider can accept an email before the worker loses its response or fails to persist completion. Preserve reconciliation procedures and never automatically resend beyond the safe window.

## Monitoring and failure handling

No scheduler runs today, so the cron-oriented checks below have no live source and are not monitoring work to set up. They describe the design as recorded before the 2026-11-18 cancellation.

- Alert on repeated 401 (key/custody mismatch), 503 scheduler_not_configured, email_not_configured or retry_candidates_unavailable, and non-2xx cron HTTP results. Check both cron execution and the pg_net HTTP response, not just job submission.
- Handler response counters are candidates/sent/queued/review. queued includes busy leases and uncertain outcomes; it is not proof of a send failure. The existing per-job constrained last_error_code provides operational detail without raw provider responses.
- Monitor overdue pending/failed jobs, expired processing leases, attempts >= 10 and manual_reconciliation_required through authorized server-only monitoring. Do not grant customers access to the jobs table.
- An individual unexpected delivery error leaves the durable lease for recovery. SQL candidate failure returns 503; do not report a healthy zero-job run.
- Retry failure never rolls back or deletes an order and never changes its payment status.

## Local evidence and the hosted acceptance that was never taken

No hosted acceptance for this scheduler is pending. Cancellation (D2) closed the workstream, so the checks below are recorded as what would have been required and remain relevant only if the owner reauthorizes it.

Executable local coverage: service-only SQL grants, real pending selection/claims, recovery, bounded attempts, manual-review exclusions, token-owned backoff, two-session claims and stale-token rejection; actual handler authorization and loopback Supabase/Resend HTTP interactions. The standard application command includes those handler tests; both disposable SQL commands include the database coverage.

Native Deno validation is unavailable on this machine. Available strict source typechecking and Node/SDK execution pass, but they do not prove deployment bundling/runtime compatibility. No dependencies were installed.

Before any reauthorized deployment — not authorized now: verify the actual target's injected named-key dictionary, gateway configuration and SDK import-map resolution; run native Deno validation; apply reviewed migrations with backup/ledger/shared-client checks; and settle email configuration. The Resend historical-403 investigation is closed as historical (D3): it is not a deployment prerequisite and must not be reopened without evidence of a new failure; owned-domain verification stays separate future hardening. Acceptance/delivery/human receipt remain distinct. One owner-received production confirmation landed in Gmail Primary on 2026-11-18 (D5), which proves neither general inbox placement nor guaranteed deliverability.

References:
- https://supabase.com/docs/guides/functions/auth-headers
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/functions/schedule-functions
- https://github.com/citusdata/pg_cron
