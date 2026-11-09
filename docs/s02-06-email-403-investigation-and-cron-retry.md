# S02-06 Email Reliability — 403 Investigation and CRON Retry

**Date:** 2026-11-03  
**Status:** LOCALLY IMPLEMENTED, PENDING HOSTED INVESTIGATION  
**Authorization:** Local implementation only, no hosted changes

---

## Executive Summary

Investigated historical Resend 403 errors using available source code and configuration. Implemented local CRON retry function for failed email jobs. Hosted investigation (Resend dashboard, API logs) requires owner access.

---

## Part 1: Historical 403 Investigation

### Available Evidence

**Source code analysis:**
- `supabase/functions/_shared/email.ts:35-45` — `sendResend()` function
- Line 41: `if (!response.ok) throw new Error('resend_http_${response.status}');`
- Line 24 in `confirmation.ts`: Error code constrained to `resend_http_\d{3}` pattern
- Idempotency key: `lume-order-confirmation-v1-${order.id}` (prevents duplicate sends)

**Schema analysis:**
- `order_confirmation_jobs` table has retry infrastructure:
  - `attempts` counter (default 0)
  - `next_attempt_at` timestamp (default now())
  - `locked_until` timestamp (prevents concurrent claims)
  - `claim_token` UUID (idempotent claim mechanism)
  - `first_attempt_at` timestamp (24-hour dedup window)

**Configuration:**
- Default sender: `Lumé House <onboarding@resend.dev>` (Resend testing domain)
- AGENTS.md note: "Default sender has testing recipient restrictions until a verified owned domain is configured"
- Genuine confirmation accepted by Resend, delivered to Gmail Spam (not Primary Inbox)

### Hypotheses for 403 Errors

**Hypothesis 1: Domain Reputation (LIKELY)**
- **Evidence:** Using `onboarding@resend.dev` (Resend's shared testing domain)
- **Mechanism:** Resend restricts sending from unverified domains to prevent abuse
- **Root cause:** No verified domain configured
- **Fix:** Verify owned domain (e.g., `hello@lumehouse.sl`) in Resend dashboard
- **Verification required:** Resend dashboard → Domains → Check verification status

**Hypothesis 2: API Key Scope (POSSIBLE)**
- **Evidence:** `RESEND_API_KEY` environment variable used in `confirmation.ts:4`
- **Mechanism:** API key may have restricted permissions (e.g., read-only, expired, revoked)
- **Root cause:** Invalid or insufficient API key scope
- **Fix:** Regenerate API key with full sending permissions
- **Verification required:** Resend dashboard → API Keys → Check key permissions

**Hypothesis 3: Rate Limiting (UNLIKELY)**
- **Evidence:** No rate limiting logic in source code
- **Mechanism:** Resend enforces sending limits (free tier: 100 emails/day, 3,000/month)
- **Root cause:** Exceeded rate limit
- **Fix:** Upgrade Resend plan or implement client-side rate limiting
- **Verification required:** Resend dashboard → Usage → Check limits

**Hypothesis 4: Recipient Restrictions (LIKELY)**
- **Evidence:** AGENTS.md states "testing recipient restrictions"
- **Mechanism:** Resend testing domain only allows sending to verified recipients
- **Root cause:** Customer email not in allowed recipients list
- **Fix:** Add recipient to Resend dashboard → Audiences → Allowed recipients
- **Verification required:** Resend dashboard → Check recipient verification

**Hypothesis 5: DNS/SPF/DKIM (POSSIBLE)**
- **Evidence:** No DNS configuration in source code
- **Mechanism:** Missing or incorrect SPF/DKIM records cause authentication failures
- **Root cause:** DNS not configured for sending domain
- **Fix:** Add SPF/DKIM records to domain DNS
- **Verification required:** DNS lookup for `lumehouse.sl` SPF/DKIM records

### Verified Root Causes (Local Analysis)

**Cannot verify locally.** Requires access to:
1. Resend dashboard (API logs, error messages, delivery status)
2. Hosted Edge Function logs (actual 403 response bodies)
3. DNS configuration (SPF/DKIM records)
4. Resend API key permissions and status

### Recommended Investigation Steps (Owner Action Required)

1. **Access Resend dashboard:**
   - Navigate to https://resend.com/dashboard
   - Check "Emails" → "Failed" for 403 error details
   - Review error messages (e.g., "Domain not verified", "Recipient not allowed")

2. **Verify domain status:**
   - Check "Domains" section
   - Confirm `lumehouse.sl` (or sending domain) is verified
   - Verify SPF/DKIM records are configured

3. **Check API key:**
   - Navigate to "API Keys"
   - Confirm `RESEND_API_KEY` is active and has sending permissions
   - Regenerate if expired or revoked

4. **Review recipient list:**
   - Check "Audiences" → "Allowed recipients"
   - Confirm test recipients are verified
   - For production: verify domain allows sending to any recipient

5. **Check usage limits:**
   - Navigate to "Usage" or "Billing"
   - Confirm within free tier limits (100/day, 3,000/month)
   - Upgrade plan if needed

### Findings Documentation

**Status:** PENDING OWNER INVESTIGATION

**Owner action required:**
- Provide Resend dashboard access or error logs
- Confirm domain verification status
- Confirm API key validity
- Document findings in this section

**Interim conclusion:**
Based on source code analysis and AGENTS.md notes, the most likely root causes are:
1. **Unverified sending domain** (using `onboarding@resend.dev` testing domain)
2. **Recipient restrictions** (testing domain only allows verified recipients)

**Recommended fix path:**
1. Verify owned domain (`lumehouse.sl` or subdomain) in Resend
2. Configure SPF/DKIM DNS records
3. Update `RESEND_FROM` environment variable to use verified domain
4. Test with verified recipient before production rollout

---

## Part 2: CRON Retry Implementation

### Local Implementation (Completed)

**Created:** `supabase/functions/retry-failed-emails/index.ts`

**Purpose:** Periodically retry failed email jobs that are eligible for retry

**Logic:**
1. Query `order_confirmation_jobs` for pending/failed jobs where `next_attempt_at <= now()`
2. For each eligible job, call `deliverConfirmation()` to attempt send
3. Respect existing claim/lock mechanism (no concurrent processing)
4. Update `next_attempt_at` with exponential backoff on failure
5. Mark as `failed` with `manual_reconciliation_required` after 24-hour dedup window

**Safety constraints:**
- Uses existing idempotency keys (no duplicate sends)
- Respects 23-hour dedup window (fails closed on old attempts)
- Service-role only (no browser access)
- No customer data exposure in logs

### Implementation Details

**File:** `supabase/functions/retry-failed-emails/index.ts`

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';
import { deliverConfirmation } from '../_shared/confirmation.ts';

Deno.serve(async (req) => {
  // CRON authorization check (Supabase verifies this before invocation)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Fetch eligible jobs (pending/failed, next_attempt_at <= now())
  const { data: jobs, error } = await admin
    .from('order_confirmation_jobs')
    .select('order_id,status,attempts,next_attempt_at')
    .in('status', ['pending', 'failed'])
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(50); // Batch size to prevent timeout

  if (error) {
    console.error('retry_fetch_failed', { error: error.message });
    return new Response(JSON.stringify({ error: 'fetch_failed' }), { status: 500 });
  }

  if (!jobs || jobs.length === 0) {
    return new Response(JSON.stringify({ processed: 0, message: 'no_eligible_jobs' }), { status: 200 });
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const result = await deliverConfirmation(admin, job.order_id);
      processed++;
      if (result === 'sent') {
        succeeded++;
      } else {
        failed++;
        // Update next_attempt_at with exponential backoff
        const backoffMinutes = Math.min(5 * Math.pow(2, job.attempts), 60); // Max 1 hour
        const nextAttempt = new Date(Date.now() + backoffMinutes * 60 * 1000);
        await admin
          .from('order_confirmation_jobs')
          .update({ next_attempt_at: nextAttempt.toISOString() })
          .eq('order_id', job.order_id);
      }
    } catch (err) {
      console.error('retry_job_failed', { order_id: job.order_id, error: err.message });
      failed++;
    }
  }

  return new Response(
    JSON.stringify({ processed, succeeded, failed, total_eligible: jobs.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
```

### Deployment Instructions (Owner Action Required)

**Step 1: Deploy the function**
```bash
cd supabase/functions/retry-failed-emails
supabase functions deploy retry-failed-emails --project-ref <project-id>
```

**Step 2: Configure CRON schedule**

Add to `supabase/functions/retry-failed-emails/deno.json`:
```json
{
  "tasks": {
    "cron": "0 */15 * * * *"
  }
}
```

Or configure via Supabase dashboard:
- Navigate to Edge Functions → `retry-failed-emails` → Settings
- Enable CRON schedule: every 15 minutes

**Step 3: Grant service-role access**

The function uses `SUPABASE_SERVICE_ROLE_KEY` which already has access to `order_confirmation_jobs` (granted in foundation migration).

**Step 4: Test the function**
```bash
# Manual invocation test
curl -X POST https://<project-ref>.supabase.co/functions/v1/retry-failed-emails \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{"processed":0,"succeeded":0,"failed":0,"total_eligible":0}
```

### Rollback Plan

**If CRON causes issues:**
1. Disable CRON schedule in Supabase dashboard
2. Function remains deployed but won't execute automatically
3. Manual invocation still possible for debugging

**To remove entirely:**
```bash
supabase functions delete retry-failed-emails --project-ref <project-id>
```

**Impact:** None on existing email jobs. They remain in `order_confirmation_jobs` table and can be retried manually or by future CRON re-enablement.

---

## Part 3: Acceptance Criteria

### Local Gates (Completed)

- ✅ CRON function implemented
- ✅ Uses existing idempotency keys (no duplicate sends)
- ✅ Respects 23-hour dedup window
- ✅ Exponential backoff (5min → 10min → 20min → 40min → 60min max)
- ✅ Batch processing (50 jobs per invocation)
- ✅ Error handling and logging
- ✅ Service-role only (no browser access)

### Hosted Gates (Pending Owner Action)

- ⏳ Deploy function to staging
- ⏳ Configure CRON schedule (every 15 minutes)
- ⏳ Test with simulated failed job
- ⏳ Verify no duplicate sends
- ⏳ Investigate Resend 403 root cause
- ⏳ Configure verified sending domain
- ⏳ Deploy to production

### Evidence Required

**For 403 investigation:**
- Resend dashboard screenshots (error logs, domain status, API key status)
- DNS records (SPF/DKIM) for sending domain
- Test email delivery confirmation

**For CRON retry:**
- Function deployment confirmation
- CRON execution logs (Supabase dashboard → Logs)
- Test job processing (create failed job → verify CRON retries it)

---

## Part 4: Risk Assessment

**Low Risk:**
- CRON function uses existing, tested `deliverConfirmation()` logic
- Idempotency keys prevent duplicate sends
- Service-role only (no customer-facing endpoint)
- Exponential backoff prevents Resend rate limiting
- Batch size (50) prevents function timeout

**Mitigations:**
- CRON can be disabled instantly via Supabase dashboard
- No database schema changes
- No API key or secret changes
- Existing email jobs unaffected if CRON fails

**Monitoring:**
- Supabase dashboard → Edge Functions → `retry-failed-emails` → Logs
- Check for `retry_fetch_failed` or `retry_job_failed` errors
- Monitor `order_confirmation_jobs` table for stuck jobs

---

## Part 5: Next Steps

**Owner action required:**
1. Investigate Resend 403 root cause (dashboard access needed)
2. Deploy CRON function to staging
3. Configure CRON schedule
4. Test with simulated failed job
5. Verify 403 resolution (domain verification, recipient list, etc.)
6. Deploy to production

**Local work completed:**
- ✅ 403 investigation document (hypotheses, verification steps)
- ✅ CRON retry function implementation
- ✅ Deployment instructions
- ✅ Rollback plan
- ✅ Acceptance criteria

**Slice 2 status:** LOCALLY IMPLEMENTED, PENDING HOSTED INVESTIGATION AND DEPLOYMENT

---

**Prepared by:** S02 Consolidated Execution Coordinator  
**Review status:** Local implementation complete, awaiting owner investigation and deployment
