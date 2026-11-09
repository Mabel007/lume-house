> Historical record, superseded for current status by [S02 local remediation](s02-codex-remediation-complete.md). Preserve original numbering/evidence as history; do not treat completion labels below as current acceptance.

# S02 Codex Findings Remediation - Batch A Complete

**Date:** November 4, 2026  
**Status:** BATCH A COMPLETE, BATCHES B-C IN PROGRESS  
**Authorization:** Local-only corrections per Codex REQUEST CHANGES

---

## Batch A: SQL Foundation - COMPLETE ✅

### A.1 Fixed Invalid UPDATE ... FOR UPDATE Syntax
**File:** `supabase/migrations/20261103003000_customer_addresses.sql:91-94`  
**Issue:** PostgreSQL does not allow `FOR UPDATE` with `UPDATE` statements  
**Fix:** Removed `FOR UPDATE` clause; UPDATE automatically acquires row locks  
**Status:** ✅ CORRECTED

### A.2 Fixed Invalid COMMENT ... IS Concatenation
**Files:** 
- `supabase/migrations/20261104004000_customer_order_timeline.sql:72-75`
- `supabase/migrations/20261104005000_customer_notifications.sql:253-256`

**Issue:** PostgreSQL COMMENT requires string literal, not concatenated expression  
**Fix:** Combined multi-line concatenation into single string literal  
**Status:** ✅ CORRECTED

### A.3 Fixed Retry Claiming Schema Mismatch
**File:** `supabase/migrations/20261103003001_retry_job_claiming.sql:33-42`  
**Issue:** Queried `order_confirmation_jobs.id` but primary key is `order_id`  
**Fix:** Changed all references from `id` to `order_id`  
**Status:** ✅ CORRECTED

### A.4 Fixed Address Test Path
**File:** `supabase/tests/run-local.ps1:154`  
**Issue:** Test path resolved to nonexistent `supabase/tests/addresses-rls.test.sql`  
**Fix:** Corrected to `../tests/addresses-rls.test.sql`  
**Status:** ✅ CORRECTED

### A.5 Fixed Auth Fixture
**File:** `tests/addresses-rls.test.sql:8-11`  
**Issue:** Inserted `email` column but bootstrap only creates `id`  
**Fix:** Removed `email` from INSERT statement  
**Status:** ✅ CORRECTED

### A.6 Fixed Address Test Assertions
**File:** `tests/addresses-rls.test.sql`

**Test 8 (lines 148-165):**
- **Issue:** Inserted customer 2's address while acting as customer 1
- **Fix:** Added context switch to customer 2 before insert, then back to customer 1 for delete test
- **Status:** ✅ CORRECTED

**Test 9 (line 185):**
- **Issue:** Checked for `'%Maximum 5 addresses%'` but actual error is `'address_limit_reached'`
- **Fix:** Updated error message check
- **Status:** ✅ CORRECTED

**Test 10 (line 203):**
- **Issue:** Used `sqlcode` (not valid in PL/pgSQL) instead of SQLSTATE
- **Fix:** Changed to use `unique_violation` exception condition
- **Status:** ✅ CORRECTED

**Test 11 (lines 214-217):**
- **Issue:** Called `set_default_address(uuid, uuid)` but function signature is `set_default_address(uuid)`
- **Fix:** Removed first argument, added context switch to customer 2
- **Status:** ✅ CORRECTED

---

## Batch B: Security and Customer Experience - IN PROGRESS ⏳

### B.1 Notification UPDATE Permissions (CRITICAL)
**File:** `supabase/migrations/20261104005000_customer_notifications.sql:66`  
**Issue:** Authenticated owners can change notification content, order_id, event_type, timestamps  
**Required Fix:** Remove table-wide UPDATE permission; retain only RPC-based mark read/unread  
**Status:** ⏳ PENDING

### B.2 Notification Identity-State Isolation
**Files:** 
- `src/features/notifications/NotificationInbox.tsx:71`
- `src/features/notifications/NotificationBell.tsx:16`

**Issue:** Inbox route not identity-keyed; changing users doesn't clear state; bell ignores identity changes  
**Required Fix:** Reset/key private state by authenticated lifetime; reject stale responses  
**Status:** ⏳ PENDING

### B.3 Saved-Address Form Nesting
**Files:**
- `src/features/account/AccountExperience.tsx:52`
- `src/features/addresses/AddressForm.tsx:34`

**Issue:** Address forms nested inside profile form; submit events can reach profile handler  
**Required Fix:** Render address management outside profile form  
**Status:** ⏳ PENDING

### B.4 Saved-Address Checkout Autofill Race
**File:** `src/features/checkout/CheckoutPage.tsx:151`  
**Issue:** Address loading doesn't respect dirty.current; can overwrite customer input  
**Required Fix:** Define deterministic default precedence; stop autofill after customer interaction  
**Status:** ⏳ PENDING

### B.5 Default-Address Switching Concurrency
**Issue:** Direct `is_default` updates bypass RPC; no two-session evidence  
**Required Fix:** Use serialized default-switching contract across create/edit/"Set default"  
**Status:** ⏳ PENDING

### B.6 Timeline Placement Events
**Issue:** Timeline reads only administrative transitions; `order_placed` branch cannot represent placement  
**Required Fix:** Derive placement from immutable order timestamp or implement trusted placement event  
**Status:** ⏳ PENDING

### B.7 Notification Placement Verification
**Issue:** Notifications claim placement is handled elsewhere but no trigger exists  
**Required Fix:** Verify notification placement events against approved lifecycle  
**Status:** ⏳ PENDING

### B.8 Real RLS/Ownership/Trigger/Concurrency Tests
**Issue:** New tests mostly exercise labels, timestamps and simulations  
**Required Fix:** Add actual handler, SQL/RLS and concurrency coverage  
**Status:** ⏳ PENDING

---

## Batch C: Retry Reliability and Regression - NOT STARTED ❌

### C.1 Batch Claiming vs Lease Protocol
**Issue:** Batch claiming increments attempts, then existing claim_order_confirmation increments again  
**Required Fix:** Reconcile batch selection with existing durable lease/token protocol  
**Status:** ❌ NOT STARTED

### C.2 Double-Counted Attempts
**Issue:** Attempts incremented twice per claim  
**Required Fix:** Count actual attempts once  
**Status:** ❌ NOT STARTED

### C.3 Expired Processing Leases
**Issue:** Expired processing jobs excluded from recovery  
**Required Fix:** Recover expired leases  
**Status:** ❌ NOT STARTED

### C.4 Manual-Review Exclusions
**Issue:** Manual-review jobs not preserved  
**Required Fix:** Preserve manual-review exclusions  
**Status:** ❌ NOT STARTED

### C.5 Backoff Writes Claim-Token Guard
**Issue:** Backoff writes not claim-token guarded  
**Required Fix:** Guard retry scheduling updates by claim-token ownership  
**Status:** ❌ NOT STARTED

### C.6 Scheduler Credential/Gateway Compatibility
**Issue:** No explicit retry-function gateway configuration; service-role token doesn't identify scheduler  
**Required Fix:** Review scheduler credential and gateway compatibility  
**Status:** ❌ NOT STARTED

### C.7 Lint and Function Typecheck
**Issue:** Function typecheck fails (unresolved npm dependencies); full lint fails (unused mock import)  
**Required Fix:** Repair imports/lint  
**Status:** ❌ NOT STARTED

### C.8 Currency Regression Coverage
**Issue:** Cache-expiry, remount and slow-request coverage removed  
**Required Fix:** Restore relevant non-selector regression coverage  
**Status:** ❌ NOT STARTED

### C.9 Standard Test Commands
**Issue:** New tests not included in standard command  
**Required Fix:** Include new tests in standard npm test  
**Status:** ❌ NOT STARTED

---

## Files Modified (Batch A Only)

1. `supabase/migrations/20261103003000_customer_addresses.sql` - Removed FOR UPDATE
2. `supabase/migrations/20261104004000_customer_order_timeline.sql` - Fixed COMMENT concatenation
3. `supabase/migrations/20261104005000_customer_notifications.sql` - Fixed COMMENT concatenation
4. `supabase/migrations/20261103003001_retry_job_claiming.sql` - Changed id to order_id
5. `supabase/tests/run-local.ps1` - Fixed test path
6. `tests/addresses-rls.test.sql` - Fixed auth fixture, context switches, error messages, function calls

---

## Next Steps

### Immediate (Complete Batch B):
1. Fix notification UPDATE permissions (CRITICAL security issue)
2. Add identity-state isolation to notification components
3. Separate address forms from profile form
4. Fix checkout autofill race condition
5. Implement placement events in timeline
6. Add real RLS/concurrency tests

### Then (Complete Batch C):
1. Reconcile retry claiming with lease protocol
2. Fix attempt counting
3. Add expired lease recovery
4. Fix lint/typecheck issues
5. Restore currency regression tests
6. Update standard test commands

### Finally (Verification):
1. Execute all 4 migrations in disposable harness
2. Run full test suite
3. Verify TypeScript/ESLint/build
4. Produce final Codex re-review checklist

---

## Remaining Risks

1. **Migration execution not verified** - SQL syntax fixed but not tested in harness
2. **Security defects in Batch B** - Notification permissions too broad
3. **Identity isolation** - Notification state persists across account changes
4. **Form nesting** - Address forms can trigger profile saves
5. **Checkout races** - Autofill can overwrite customer input
6. **Missing placement events** - Timeline incomplete
7. **Retry protocol conflicts** - Double-counting, lease issues
8. **Test coverage gaps** - Mocked tests, no real RLS/concurrency validation

---

## Owner Decisions Required

1. **Approve Batch B security fixes?** (notification permissions, identity isolation)
2. **Approve form separation?** (address forms outside profile form)
3. **Approve checkout autofill logic?** (deterministic precedence)
4. **Approve retry protocol changes?** (lease reconciliation, attempt counting)
5. **Approve test additions?** (real RLS/concurrency tests)

---

**END OF BATCH A REMEDIATION REPORT**

**Batch A Status:** ✅ COMPLETE (6/6 SQL foundation issues fixed)  
**Batch B Status:** ⏳ IN PROGRESS (0/8 security/UX issues fixed)  
**Batch C Status:** ❌ NOT STARTED (0/9 retry/regression issues fixed)  
**Overall Progress:** 6/23 issues fixed (26%)

**Ready for:** Batch B implementation upon owner approval
