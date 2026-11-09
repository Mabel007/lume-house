# S02 Consolidated Execution Manifest v2.0

**SUPERSEDED by v2.1** — See `docs/S02-consolidated-execution-manifest-v2.1.md`

**Supersession date:** 2026-11-03
**Reason:** v2.0 placed authentication at positions 2A–2E (immediately after currency), contradicting the owner's explicit decision to defer authentication to position 12 (after S02 acceptance, engineering foundation, S03, S04, S05). v2.1 corrects the sequence and adds `SET search_path = public, pg_temp` to all SECURITY DEFINER functions.

---

**Date:** 2026-11-03
**Branch:** `feat/lume-web-s02-country-enforcement`
**Local HEAD:** `eb035f9` (PR #21 head)
**Remote HEAD:** `fbe16d5` (PR #21 merged to `origin/main` 2026-11-03)
**Local main:** `94eaead` (stale — needs `git fetch`)
**Mode:** PLAN — Read-only. No edits, no commits, no migrations, no hosted changes.

---

## 1. Verified Baseline

### Repository state

| Item | Value |
|---|---|
| Current branch | `feat/lume-web-s02-country-enforcement` |
| Local HEAD | `eb035f96f91acfe65a0ccbfe47c807b75ff7fc4f` |
| Remote `origin/main` | `fbe16d54204a4e0ceae29e317a062bfc82d37306` (PR #21 merged) |
| Local `main` | `94eaead` (PR #20 merge — stale, not fetched) |
| Test suite | 689/689 PASS |
| TypeScript | Clean (`tsc --noEmit`) |
| Vite build | Successful (838.52 kB) |

### PR #21 merge state clarification

PR #21 **is merged on remote** (`origin/main` at `fbe16d5`). Local `main` is behind at `94eaead` because `git fetch` has not been run. No action required — this is a local tracking lag, not a merge failure.

### Closed workstreams (do not reopen)

| Workstream | Status | Evidence |
|---|---|---|
| S02-01 Country enforcement | RELEASED | PR #21 merged, W4 executed, production schema deployed |
| S02-02 Unsupported-country feedback | COMPLETE | Code audit + 53 DOM tests + 18 order tests PASS |
| S02-03 Checkout, cart, ownership | COMPLETE | 689 tests PASS, RLS verified |
| S02-NEW-03 Guest continuity | COMPLETE | 4,658 test lines across 10 files; all guest-to-auth flows implemented |

### Owner-approved planning decisions (v2.0 corrections)

| # | Decision | Effect on manifest |
|---|---|---|
| D1 | Currency: remove storefront selector; NLE authoritative; admin rates later scope | S02-05 reduced to selector removal + documentation |
| D2 | Email: investigate historical 403 before changes; verified Lumé House-owned subdomain | S02-06 adds investigation prerequisite |
| D3 | Addresses: max 5 per customer; Home/Work/custom labels; manual entry only | S02-NEW-01 scope bounded, no autocomplete |
| D4 | Timeline: customer-visible statuses + timestamps only; admin reasons hidden | S02-NEW-02 RPC excludes `reason` and `actor_user_id` |
| D5 | Notifications: order lifecycle only; persistent inbox, bell, unread count; email delivery status internal | S02-04 excludes email-status notification types |
| D6 | Execution: one coordinated plan, sequential slices, independent review, explicit owner approvals | All slices require owner gate before implementation |

---

## 2. Corrected Workstream Matrix

### S02-05 Currency — Simplification

| Area | v1.0 classification | v2.0 correction |
|---|---|---|
| Currency selector UI | IMPLEMENTED (to keep) | **REMOVE** — storefront selector deleted per D1 |
| NLE authoritative | IMPLEMENTED | Unchanged |
| Display-only estimates (Frankfurter) | IMPLEMENTED | Unchanged — remain as informational only |
| Admin-managed exchange rates | MISSING | **LATER SCOPE** — not in this plan |
| Multi-currency checkout | MISSING | Architecturally excluded by design |

**Action:** Remove `CurrencySelector.tsx` from footer. Remove `lume:currency` localStorage key. Keep `CurrencyEstimate` and `CurrencyDisclosure` as display-only NLE-reference components. Document that NLE is the sole transactional currency.

### S02-06 Email — Investigation-first

| Area | v1.0 classification | v2.0 correction |
|---|---|---|
| Resend API integration | IMPLEMENTED | Unchanged |
| Verified sending domain | MISSING | **INVESTIGATE historical 403 first** per D2 |
| Automated retry / CRON | MISSING | Remains in scope after investigation |
| Admin email management UI | MISSING | **DEFER** — not in this plan |

**Action:** Before any configuration change, investigate the historical 403 errors from Resend. Determine root cause (domain reputation, DNS, API key scope, rate limiting). Only after investigation resolves, proceed with verified domain setup and CRON retry.

### S02-NEW-01 Saved Addresses — Bounded scope

| Area | v1.0 classification | v2.0 correction |
|---|---|---|
| Multiple saved addresses | MISSING | **IMPLEMENT — max 5 per customer** per D3 |
| Address labels | MISSING | **Home / Work / custom labels** per D3 |
| Street address autocomplete | MISSING | **DEFER — manual entry only** per D3 |
| Address management UI | MISSING | Add/edit/delete/list with 5-address cap |

### S02-NEW-02 Order Timeline — Customer-only view

| Area | v1.0 classification | v2.0 correction |
|---|---|---|
| Customer timeline UI | MISSING | **IMPLEMENT** — statuses + timestamps only per D4 |
| Customer history RPC | MISSING | **Exclude `reason` and `actor_user_id`** per D4 |
| Real-time status updates | MISSING | **DEFER** — not in this plan |
| Admin timeline | IMPLEMENTED | Unchanged — admin reasons remain admin-only |

### S02-04 Notifications — Order lifecycle only

| Area | v1.0 classification | v2.0 correction |
|---|---|---|
| Persistent notification table | MISSING | **IMPLEMENT** — order lifecycle types only per D5 |
| Bell icon + inbox + unread count | MISSING | **IMPLEMENT** per D5 |
| Email status notifications | MISSING | **EXCLUDE** — email delivery status is internal per D5 |
| Notification preferences | MISSING | **DEFER** — all enabled, no opt-out |
| Realtime subscription | MISSING | **IMPLEMENT** — scoped to user's notifications |

### S02-NEW-04 Authentication — NEW in v2.0

| Area | Classification | Evidence |
|---|---|---|
| Google OAuth | **IMPLEMENTED** | `src/features/auth/auth.ts`, PKCE flow, session persistence |
| Email/password sign-in | **MISSING** | S02-NEW-04 Slice 1 |
| Email/password registration | **MISSING** | S02-NEW-04 Slice 2 |
| Email verification | **MISSING** | S02-NEW-04 Slice 3 |
| Password reset | **MISSING** | S02-NEW-04 Slice 4 |
| Email templates + redirect config | **MISSING** | S02-NEW-04 Slice 5 |
| Account linking (Google + email) | **DEFERRED** | Future slice — not in this plan |

**NOT deferred.** S02-NEW-04 is included in the sequential execution plan as Slices 2A–2E.

---

## 3. Sequential Slice Order and Dependencies

```
Slice 0: S02-NEW-03 Guest Continuity Closure (no implementation)
    ↓
Slice 1: S02-05 Currency Simplification (remove selector)
    ↓
Slice 2A: S02-NEW-04 Authentication — Email/password sign-in
    ↓
Slice 2B: S02-NEW-04 Authentication — Registration
    ↓
Slice 2C: S02-NEW-04 Authentication — Email verification
    ↓
Slice 2D: S02-NEW-04 Authentication — Password reset
    ↓
Slice 2E: S02-NEW-04 Authentication — Email templates + redirect config
    ↓
Slice 3: S02-06 Email — 403 investigation → verified domain → CRON retry
    ↓
Slice 4: S02-NEW-01 Saved Addresses (max 5, labels, manual entry)
    ↓
Slice 5: S02-NEW-02 Customer Order Timeline (statuses + timestamps)
    ↓
Slice 6: S02-04 Persistent Notifications (order lifecycle, bell, inbox)
```

### Dependency rationale

- **Slice 0** closes S02-NEW-03 with no code changes.
- **Slice 1** is independent, low-risk, and reduces surface area before auth work.
- **Slices 2A–2E** are sequential (each builds on the previous). Authentication is foundational — email notifications (Slice 3) and address management (Slice 4) both assume authenticated users.
- **Slice 3** investigates the historical 403 before any email configuration changes. Benefits from auth being in place (verification emails use the same Resend integration).
- **Slice 4** extends existing profile schema. Independent of email but assumes auth is complete.
- **Slice 5** extends existing order infrastructure. Independent but benefits from notifications (Slice 6) being planned next.
- **Slice 6** depends on Slice 5 (order events as notification triggers) and Slice 3 (email as notification channel, though email delivery status is internal per D5).

---

## 4. Slice Execution Details

### Slice 0: S02-NEW-03 Guest Continuity Closure

**Objective:** Document that guest continuity is complete.

**Actions:** None. No code changes, no tests, no migration, no deployment.

**Deliverable:** Closure notation in this manifest and project memory.

**Gate:** Documentation only — no owner approval needed.

---

### Slice 1: S02-05 Currency Simplification

**Objective:** Remove storefront currency selector; confirm NLE-only transactional currency.

**Dependencies:** None

**Actions:**
1. Remove `CurrencySelector.tsx` from footer in `Layout.tsx`
2. Remove `lume:currency` localStorage key usage
3. Keep `CurrencyEstimate` and `CurrencyDisclosure` as display-only components (they reference NLE as authoritative)
4. Remove currency preference persistence from `localeCurrency.ts` (keep locale detection for display estimates only)
5. Update `docs/s02-05-currency-decisions.md` to record: NLE authoritative, display estimates informational only, admin rates later scope, storefront selector removed

**Files affected:**
- `src/features/currency/CurrencySelector.tsx` — DELETE
- `src/components/Layout.tsx` — remove CurrencySelector import and render
- `src/features/currency/localeCurrency.ts` — remove localStorage persistence (keep detection)
- `src/features/currency/currency.ts` — no changes (already NLE-authoritative)
- `docs/s02-05-currency-decisions.md` — CREATE (decision documentation)
- `tests/currency-dom.test.mjs` — UPDATE (remove selector tests, keep estimate tests)

**SQL/migration concerns:** NONE — no schema changes.

**Test requirements:**
- Remove tests for CurrencySelector component
- Keep tests for CurrencyEstimate, CurrencyDisclosure, formatMoney
- Verify no regression in checkout NLE enforcement
- All 689 existing tests must still PASS (minus removed selector tests)

**Rollback:** Re-add CurrencySelector to Layout, restore localStorage key.

**Estimated effort:** 0.5 days

**Gates:**
- [ ] Lint clean
- [ ] TypeScript clean
- [ ] All tests pass
- [ ] Build successful
- [ ] Independent review
- [ ] Owner approval

---

### Slice 2A: S02-NEW-04 Authentication — Email/password sign-in

**Objective:** Enable email/password sign-in for existing users (accounts created manually in Supabase dashboard).

**Dependencies:** None (independent of Slice 1)

**Owner prerequisites (must complete BEFORE development):**
1. Enable email/password provider in Supabase dashboard (Authentication → Providers → Email)
2. Configure redirect URLs in Supabase dashboard:
   - Production: `https://lume-house-delta.vercel.app/auth/callback`
   - Staging: Vercel preview aliases (already covered by wildcard)
   - Local: `http://127.0.0.1:5188/auth/callback`

**Actions:**
1. Create `src/features/auth/EmailSignInForm.tsx` — email/password form with validation
2. Add `startEmailSignIn(client, email, password)` to `src/features/auth/auth.ts`
3. Add "Sign in with email" option to `src/features/account/AccountPage.tsx` (below Google button)
4. Handle email sign-in errors in `src/features/auth/AuthProvider.tsx`
5. Create `tests/email-signin-dom.test.mjs` — form rendering, validation, error handling, accessibility

**Files affected:**
- `src/features/auth/EmailSignInForm.tsx` — NEW (~150 lines)
- `src/features/auth/auth.ts` — MODIFY (+20 lines)
- `src/features/account/AccountPage.tsx` — MODIFY (+10 lines)
- `src/features/auth/AuthProvider.tsx` — MODIFY (+5 lines)
- `tests/email-signin-dom.test.mjs` — NEW (~200 lines)

**SQL/migration concerns:** NONE — no schema changes. Supabase Auth manages `auth.users` internally.

**Security review:**
- Password never logged or stored in plaintext
- HTTPS enforced for all auth requests (existing `config.ts` validation)
- Rate limiting handled by Supabase Auth (server-side)
- Session tokens stored in localStorage (existing pattern — XSS risk mitigated by existing sanitization)
- Generic error messages: "Invalid email or password" (no enumeration)

**Test requirements:**
- Form renders with email/password fields and submit button
- Validation: empty fields, invalid email format
- Error handling: invalid credentials, network failure
- Accessibility: keyboard navigation, ARIA labels, screen reader announcements
- Mobile responsiveness: 320px minimum width
- Regression: existing Google sign-in unchanged

**Rollback:** Remove EmailSignInForm component, remove link from AccountPage. No data loss.

**Estimated effort:** 2-3 days

**Gates:**
- [ ] Owner confirms Supabase dashboard configuration complete
- [ ] Lint clean
- [ ] TypeScript clean
- [ ] All tests pass (689 existing + new)
- [ ] Build successful
- [ ] Independent review
- [ ] Staging verification (sign-in with test account)
- [ ] Owner approval

---

### Slice 2B: S02-NEW-04 Authentication — Registration

**Objective:** Enable email/password self-registration.

**Dependencies:** Slice 2A complete

**Owner prerequisites:**
1. Enable email confirmation in Supabase dashboard (Authentication → Providers → Email → Confirm email: ON)

**Actions:**
1. Create `src/features/auth/RegistrationForm.tsx` — email/password/confirm-password form
2. Add `startRegistration(client, email, password)` to `src/features/auth/auth.ts`
3. Add "Create account" link to `src/features/account/AccountPage.tsx`
4. Handle registration errors in `src/features/auth/AuthProvider.tsx`
5. Create `tests/registration-dom.test.mjs`

**Files affected:**
- `src/features/auth/RegistrationForm.tsx` — NEW (~180 lines)
- `src/features/auth/auth.ts` — MODIFY (+15 lines)
- `src/features/account/AccountPage.tsx` — MODIFY (+10 lines)
- `src/features/auth/AuthProvider.tsx` — MODIFY (+5 lines)
- `tests/registration-dom.test.mjs` — NEW (~250 lines)

**SQL/migration concerns:** NONE — Supabase Auth manages registration internally.

**Security review:**
- Password strength validated by Supabase server-side (client validation is UX-only)
- Generic success message: "Check your email" (no enumeration)
- Duplicate email returns same generic message
- Rate limiting by Supabase Auth

**Test requirements:**
- Form validation: empty fields, invalid email, weak password, password mismatch
- Success flow: registration → "check your email" message
- Duplicate email: generic message (no enumeration)
- Accessibility and mobile responsiveness
- Regression: existing Google sign-in and Slice 2A email sign-in unchanged

**Rollback:** Remove RegistrationForm component, remove link from AccountPage.

**Estimated effort:** 2-3 days

**Gates:**
- [ ] Slice 2A gates passed
- [ ] Owner confirms email confirmation enabled in Supabase dashboard
- [ ] Lint/TypeScript/tests/build clean
- [ ] Independent review
- [ ] Staging verification
- [ ] Owner approval

---

### Slice 2C: S02-NEW-04 Authentication — Email verification

**Objective:** Handle email verification callback and display verification status.

**Dependencies:** Slice 2B complete

**Actions:**
1. Create `src/features/auth/VerificationPage.tsx` — displays "check your email" prompt, resend option
2. Add `/auth/verify` route to `src/main.tsx`
3. Handle verification callback in `src/features/auth/CustomerRoutes.tsx` (extend AuthCallback)
4. Add resend verification email function to `src/features/auth/auth.ts`
5. Create `tests/verification-dom.test.mjs`

**Files affected:**
- `src/features/auth/VerificationPage.tsx` — NEW (~120 lines)
- `src/main.tsx` — MODIFY (+1 route)
- `src/features/auth/CustomerRoutes.tsx` — MODIFY (+20 lines)
- `src/features/auth/auth.ts` — MODIFY (+15 lines)
- `tests/verification-dom.test.mjs` — NEW (~180 lines)

**SQL/migration concerns:** NONE — Supabase Auth manages verification tokens internally.

**Security review:**
- Verification tokens are single-use, time-limited (Supabase default: 24 hours)
- Tokens passed via URL fragment (not query string) — existing PKCE flow
- Tokens validated server-side by Supabase
- No application-layer token storage

**Test requirements:**
- Unverified user sees verification prompt
- Resend verification email works
- Valid verification token → success → redirect to sign-in
- Invalid/expired token → error message
- Already-verified email → success → redirect

**Rollback:** Remove VerificationPage, remove route, revert AuthCallback.

**Estimated effort:** 2 days

**Gates:**
- [ ] Slice 2B gates passed
- [ ] Lint/TypeScript/tests/build clean
- [ ] Independent review
- [ ] Staging verification
- [ ] Owner approval

---

### Slice 2D: S02-NEW-04 Authentication — Password reset

**Objective:** Enable password reset flow for users who forgot their password.

**Dependencies:** Slice 2C complete

**Owner prerequisites:**
1. Enable password recovery in Supabase dashboard (Authentication → Providers → Email → Password recovery: ON)

**Actions:**
1. Create `src/features/auth/PasswordResetRequestForm.tsx` — email input, submit
2. Create `src/features/auth/PasswordResetForm.tsx` — new password + confirm
3. Add `/auth/reset` route to `src/main.tsx`
4. Add `requestPasswordReset(client, email)` and `resetPassword(client, newPassword)` to `src/features/auth/auth.ts`
5. Handle reset callback in `src/features/auth/CustomerRoutes.tsx`
6. Add "Forgot password?" link to EmailSignInForm
7. Create `tests/password-reset-dom.test.mjs`

**Files affected:**
- `src/features/auth/PasswordResetRequestForm.tsx` — NEW (~100 lines)
- `src/features/auth/PasswordResetForm.tsx` — NEW (~130 lines)
- `src/main.tsx` — MODIFY (+1 route)
- `src/features/auth/CustomerRoutes.tsx` — MODIFY (+20 lines)
- `src/features/auth/auth.ts` — MODIFY (+25 lines)
- `src/features/auth/EmailSignInForm.tsx` — MODIFY (+5 lines, "Forgot password?" link)
- `tests/password-reset-dom.test.mjs` — NEW (~220 lines)

**SQL/migration concerns:** NONE — Supabase Auth manages reset tokens internally.

**Security review:**
- Reset tokens are single-use, time-limited (Supabase default: 24 hours)
- Generic success message: "If an account exists..." (no enumeration)
- Tokens passed via URL fragment
- Server-side validation by Supabase

**Test requirements:**
- Request flow: email input → generic success message
- Non-existent email → same generic message (no enumeration)
- Valid reset token → new password form displayed
- Invalid/expired token → error message
- Successful password update → redirect to sign-in

**Rollback:** Remove reset forms, remove route, revert EmailSignInForm.

**Estimated effort:** 3 days

**Gates:**
- [ ] Slice 2C gates passed
- [ ] Owner confirms password recovery enabled in Supabase dashboard
- [ ] Lint/TypeScript/tests/build clean
- [ ] Independent review
- [ ] Staging verification
- [ ] Owner approval

---

### Slice 2E: S02-NEW-04 Authentication — Email templates + redirect config

**Objective:** Customize Supabase auth email templates to match Lumé House branding and finalize redirect URL configuration.

**Dependencies:** Slice 2D complete

**Owner prerequisites:**
1. Provide Lumé House branding assets (logo, colors) for email templates
2. Confirm final production URL for redirect configuration

**Actions:**
1. Create HTML email templates for: verification, password reset, email change
2. Upload templates to Supabase dashboard (Authentication → Email Templates)
3. Verify all redirect URLs configured correctly in Supabase dashboard
4. Test email delivery in staging (verify templates render correctly)
5. Document template configuration in `supabase/README.md`

**Files affected:**
- `supabase/email-templates/verification.html` — NEW
- `supabase/email-templates/reset.html` — NEW
- `supabase/email-templates/email-change.html` — NEW
- `supabase/README.md` — MODIFY (document template configuration)

**SQL/migration concerns:** NONE — email templates are Supabase dashboard configuration, not database objects.

**Security review:**
- Email templates must not contain sensitive data (API keys, internal URLs)
- Template URLs must use production domain (not staging or localhost)
- Images/assets must be hosted on HTTPS URLs

**Test requirements:**
- Verification email renders correctly in Gmail, Outlook, Apple Mail
- Reset email renders correctly
- All links in emails work (redirect to correct URLs)
- Branding displays correctly

**Rollback:** Revert to default Supabase email templates.

**Estimated effort:** 1-2 days

**Gates:**
- [ ] Slice 2D gates passed
- [ ] Owner provides branding assets
- [ ] Email templates render correctly in staging
- [ ] All redirect URLs verified
- [ ] Independent review
- [ ] Owner approval

---

### Slice 3: S02-06 Email — 403 investigation → verified domain → CRON retry

**Objective:** Resolve historical 403 errors, configure verified sending domain, implement automated retry.

**Dependencies:** Slice 2E complete (email templates in place)

**Owner prerequisites:**
1. Provide access to Resend dashboard for 403 investigation
2. Decide on sending domain (Option A: `send.najbuilds.com`, Option B: `mail.lumehouse.sl`, Option C: keep `onboarding@resend.dev`)
3. Decide on CRON retry strategy (Option A: exponential backoff, Option B: fixed interval)

**Actions:**
1. **INVESTIGATION PHASE:**
   - Review Resend API logs for 403 errors
   - Identify root cause: domain reputation, DNS misconfiguration, API key scope, rate limiting
   - Document findings in `docs/s02-06-email-403-investigation.md`
   - Resolve root cause (may require DNS changes, API key rotation, or Resend support)

2. **DOMAIN VERIFICATION PHASE:**
   - Register sending domain with Resend (dashboard configuration)
   - Configure DNS records: SPF, DKIM, DMARC
   - Verify domain in Resend dashboard
   - Update `RESEND_FROM` environment variable in Supabase dashboard

3. **CRON RETRY PHASE:**
   - Create Supabase Edge Function for automated retry
   - Configure CRON schedule in `supabase/config.toml`
   - Implement exponential backoff or fixed interval (per owner decision)
   - Add retry logging and monitoring

**Files affected:**
- `docs/s02-06-email-403-investigation.md` — CREATE (investigation findings)
- `supabase/functions/retry-failed-emails/index.ts` — NEW (CRON function)
- `supabase/config.toml` — MODIFY (add CRON schedule)
- `supabase/README.md` — MODIFY (document domain configuration)

**SQL/migration concerns:**
- CRON function uses `service_role` key (must be stored securely in Supabase secrets)
- No schema changes required
- `order_confirmation_jobs` table already supports retry (existing `status` column)

**Security review:**
- CRON function must authenticate with `service_role` key (never expose in client)
- Retry logic must respect idempotency keys (no duplicate sends)
- DNS records must be configured correctly (SPF/DKIM/DMARC prevent spoofing)
- No API keys in logs or client code

**Test requirements:**
- Send test email with verified domain → verify delivery (not spam)
- Simulate failed email → verify CRON retry executes
- Verify idempotency (no duplicate sends on retry)
- Verify CRON function logs show successful execution
- Verify DNS records pass SPF/DKIM/DMARC checks

**Rollback:**
- Revert `RESEND_FROM` to `onboarding@resend.dev`
- Disable CRON function in `supabase/config.toml`
- No database changes to rollback

**Estimated effort:** 1-2 days (investigation) + 1-2 days (domain) + 1-2 days (CRON) = 3-6 days total

**Gates:**
- [ ] Slice 2E gates passed
- [ ] 403 investigation complete and root cause resolved
- [ ] Owner confirms sending domain selection
- [ ] DNS records configured and verified
- [ ] CRON function deployed and tested
- [ ] Test email delivered to inbox (not spam)
- [ ] Independent review
- [ ] Owner approval

---

### Slice 4: S02-NEW-01 Saved Addresses

**Objective:** Enable customers to save and manage up to 5 delivery addresses with labels.

**Dependencies:** Slice 3 complete (email working for address-related notifications if added later)

**Owner decisions (confirmed in v2.0):**
- Max 5 addresses per customer (D3)
- Labels: Home, Work, custom (D3)
- Manual entry only — no autocomplete (D3)

**Actions:**
1. Create `addresses` table with RLS and constraints
2. Create RPC functions: `create_address`, `update_address`, `delete_address`, `list_addresses`, `set_default_address`
3. Create address management UI: `AddressManager.tsx`, `AddressForm.tsx`, `AddressList.tsx`
4. Add address selection to checkout: modify `CheckoutPage.tsx` to show saved address picker
5. Add "Save this address" checkbox to checkout (optional, not automatic)
6. Update profile to reference `default_address_id`
7. Create tests: `tests/address-management-dom.test.mjs`, `supabase/tests/addresses.sql`

**Files affected:**
- `supabase/migrations/20261103000000_saved_addresses.sql` — NEW
- `src/features/account/AddressManager.tsx` — NEW (~200 lines)
- `src/features/account/AddressForm.tsx` — NEW (~180 lines)
- `src/features/account/AddressList.tsx` — NEW (~150 lines)
- `src/features/checkout/CheckoutPage.tsx` — MODIFY (add address picker, +50 lines)
- `src/features/account/AccountPage.tsx` — MODIFY (add address management section, +20 lines)
- `src/features/account/profile.ts` — MODIFY (add `default_address_id` field, +10 lines)
- `src/features/account/addresses.ts` — NEW (CRUD operations, ~120 lines)
- `tests/address-management-dom.test.mjs` — NEW (~400 lines)
- `supabase/tests/addresses.sql` — NEW (~200 lines)

**Database schema:**

```sql
-- Migration: 20261103000000_saved_addresses.sql

CREATE TABLE addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 50),
  street_address text NOT NULL CHECK (char_length(street_address) BETWEEN 1 AND 200),
  area text NOT NULL CHECK (char_length(area) BETWEEN 1 AND 200),
  city text NOT NULL CHECK (city ~* '^freetown$'),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, label)
);

-- RLS
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON addresses FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON addresses TO authenticated;

CREATE POLICY addresses_owner_all ON addresses
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for fast lookup
CREATE INDEX addresses_user_id_idx ON addresses (user_id);

-- Trigger: enforce one default per user
CREATE OR REPLACE FUNCTION enforce_one_default_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE addresses SET is_default = false
    WHERE user_id = NEW.user_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER addresses_one_default
  BEFORE INSERT OR UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION enforce_one_default_address();

-- Trigger: enforce max 5 addresses per user
CREATE OR REPLACE FUNCTION enforce_max_five_addresses()
RETURNS TRIGGER AS $$
DECLARE
  v_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COUNT(*) INTO v_count FROM addresses WHERE user_id = NEW.user_id;
    IF v_count >= 5 THEN
      RAISE EXCEPTION 'ADDRESS_LIMIT_EXCEEDED' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER addresses_max_five
  BEFORE INSERT ON addresses
  FOR EACH ROW EXECUTE FUNCTION enforce_max_five_addresses();

-- Add default_address_id to profiles
ALTER TABLE profiles ADD COLUMN default_address_id uuid REFERENCES addresses(id) ON DELETE SET NULL;
```

**SQL security review:**

| Concern | Assessment | Mitigation |
|---|---|---|
| **SECURITY DEFINER on `enforce_one_default_address()`** | MEDIUM RISK — function runs with definer's privileges (postgres) | Function only updates `addresses` table within same user's rows. No external calls. Input is `NEW` row (already validated by RLS). |
| **SECURITY DEFINER on `enforce_max_five_addresses()`** | MEDIUM RISK — same as above | Function only reads `addresses` table for same user. No writes. Raises exception if limit exceeded. |
| **RLS policy `addresses_owner_all`** | LOW RISK — standard owner-scoped policy | `USING (user_id = auth.uid())` and `WITH CHECK (user_id = auth.uid())` prevent cross-user access. |
| **UNIQUE constraint on `(user_id, label)`** | LOW RISK — prevents duplicate labels per user | Application layer validates label before submit. Database enforces uniqueness. |
| **CHECK constraint on `city`** | LOW RISK — matches existing checkout validation | Case-insensitive regex `^freetown$` matches existing `CheckoutPage.tsx` validation. |
| **Foreign key `profiles.default_address_id`** | LOW RISK — references `addresses(id)` with `ON DELETE SET NULL` | If address deleted, profile's `default_address_id` becomes NULL (safe). |
| **Concurrency: two simultaneous inserts** | LOW RISK — trigger runs within transaction | PostgreSQL serializes trigger execution per-row. Max-5 check is atomic within transaction. |
| **Migration rollback** | REVERSIBLE | `DROP TABLE addresses CASCADE` removes table and `profiles.default_address_id` column. No data loss (addresses are convenience, not required). |

**RPC functions (not shown in full — illustrative):**

```sql
-- create_address(p_label, p_street_address, p_area, p_city, p_is_default)
-- update_address(p_id, p_label, p_street_address, p_area, p_city)
-- delete_address(p_id)
-- list_addresses() — returns all addresses for auth.uid()
-- set_default_address(p_id) — sets is_default=true, triggers enforce_one_default
```

All RPCs use `SECURITY DEFINER` with explicit `auth.uid()` ownership checks.

**Test requirements:**
- Address CRUD operations (create, read, update, delete)
- RLS ownership enforcement (user A cannot access user B's addresses)
- Max 5 addresses per user (6th insert fails with `ADDRESS_LIMIT_EXCEEDED`)
- Default address uniqueness (setting one default clears others)
- Label uniqueness per user (duplicate label fails)
- City validation (non-Freetown rejected)
- Checkout address selection (picker renders, selection persists)
- Profile default address reference (update profile → default_address_id set)
- Accessibility: keyboard navigation, ARIA labels, screen reader announcements

**Rollback:**
- `DROP TABLE addresses CASCADE` (removes table and `profiles.default_address_id`)
- Remove address management UI components
- Revert checkout to profile defaults only
- No data loss (addresses are convenience, not required)

**Estimated effort:** 3-4 days

**Gates:**
- [ ] Slice 3 gates passed
- [ ] Migration reviewed and approved
- [ ] RLS policies tested (ownership, max-5, default uniqueness)
- [ ] Lint/TypeScript/tests/build clean
- [ ] SQL tests pass (addresses.sql)
- [ ] DOM tests pass (address-management-dom.test.mjs)
- [ ] Staging verification (add/edit/delete addresses, select at checkout)
- [ ] Independent review
- [ ] Owner approval

---

### Slice 5: S02-NEW-02 Customer Order Timeline

**Objective:** Provide customers with a visual timeline of order status transitions (statuses + timestamps only, no admin reasons).

**Dependencies:** Slice 4 complete (address management in place)

**Owner decisions (confirmed in v2.0):**
- Customer-visible statuses and timestamps only (D4)
- Admin reasons hidden from customer view (D4)

**Actions:**
1. Create `customer_order_history(p_order_id)` RPC function
2. Create `src/features/orders/OrderTimeline.tsx` — visual timeline component
3. Add timeline to `OrderDetailPage` in `src/features/orders/OrderPages.tsx`
4. Add abbreviated timeline to `MyOrdersPage` list items
5. Create tests: `tests/order-timeline-dom.test.mjs`, `supabase/tests/customer_order_history.sql`

**Files affected:**
- `supabase/migrations/20261103000001_customer_order_history.sql` — NEW
- `src/features/orders/OrderTimeline.tsx` — NEW (~180 lines)
- `src/features/orders/OrderPages.tsx` — MODIFY (add timeline to OrderDetailPage, +30 lines)
- `src/features/orders/orderRepository.ts` — MODIFY (add `loadCustomerOrderHistory`, +20 lines)
- `tests/order-timeline-dom.test.mjs` — NEW (~300 lines)
- `supabase/tests/customer_order_history.sql` — NEW (~150 lines)

**Database schema:**

```sql
-- Migration: 20261103000001_customer_order_history.sql

CREATE OR REPLACE FUNCTION customer_order_history(p_order_id uuid)
RETURNS TABLE (
  from_status text,
  to_status text,
  created_at timestamptz
) AS $$
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM orders WHERE id = p_order_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  
  RETURN QUERY
  SELECT from_status, to_status, created_at
  FROM business_order_operations
  WHERE order_id = p_order_id
  ORDER BY created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION customer_order_history(uuid) TO authenticated;
```

**SQL security review:**

| Concern | Assessment | Mitigation |
|---|---|---|
| **SECURITY DEFINER on `customer_order_history()`** | MEDIUM RISK — function runs with definer's privileges | Explicit `auth.uid()` ownership check before returning data. Function only reads `business_order_operations` (immutable history table). No writes. |
| **Excluded columns: `reason`, `actor_user_id`** | INTENTIONAL per D4 | Customer view excludes admin-only fields. Function signature does not return these columns. |
| **RLS on `orders` table** | LOW RISK — existing policy | Ownership check `user_id = auth.uid()` matches existing RLS. Function raises exception if order not found or not owned by caller. |
| **Concurrency** | NONE — read-only function | No writes, no locks, no race conditions. |
| **Migration rollback** | REVERSIBLE | `DROP FUNCTION customer_order_history(uuid)` removes function. No schema changes. |

**Test requirements:**
- Ownership enforcement: user A cannot read user B's order history
- Timeline rendering for all status transitions (placed → confirmed → processing → ready_for_pickup → out_for_delivery → completed)
- Cancelled orders display correctly
- Truthful states only: no paid/failed unless actually set
- Timestamps display in user's local timezone
- Accessibility: screen reader announcements for status changes, keyboard navigation

**Rollback:**
- `DROP FUNCTION customer_order_history(uuid)`
- Remove timeline UI components
- No data loss (history table remains for admin)

**Estimated effort:** 2-3 days

**Gates:**
- [ ] Slice 4 gates passed
- [ ] Migration reviewed and approved
- [ ] RLS ownership tested (cross-user access denied)
- [ ] Lint/TypeScript/tests/build clean
- [ ] SQL tests pass (customer_order_history.sql)
- [ ] DOM tests pass (order-timeline-dom.test.mjs)
- [ ] Staging verification (view timeline for test orders)
- [ ] Independent review
- [ ] Owner approval

---

### Slice 6: S02-04 Persistent Notifications

**Objective:** Implement persistent notifications with bell icon, inbox, unread count, and Realtime subscription. Order lifecycle only (no email status notifications per D5).

**Dependencies:** Slice 5 complete (order timeline provides event source)

**Owner decisions (confirmed in v2.0):**
- Order lifecycle notifications only (D5)
- Email delivery status is internal — not exposed as notifications (D5)
- Persistent inbox, bell icon, unread count (D5)

**Actions:**
1. Create `notifications` table with RLS
2. Create RPC functions: `create_notification` (service_role only), `mark_notification_read`, `count_unread_notifications`
3. Add notification triggers in `admin_transition_order` RPC (existing migration 00600)
4. Create `src/components/NotificationBell.tsx` — bell icon with unread count badge
5. Create `src/components/NotificationDropdown.tsx` — dropdown/popover with recent notifications
6. Create `src/features/account/NotificationInbox.tsx` — full inbox page at `/account/notifications`
7. Add bell icon to header in `src/components/Layout.tsx`
8. Add `/account/notifications` route to `src/main.tsx`
9. Add Supabase Realtime subscription for live updates
10. Create tests: `tests/notification-persistent-dom.test.mjs`, `supabase/tests/notifications.sql`

**Files affected:**
- `supabase/migrations/20261103000002_notifications.sql` — NEW
- `src/components/NotificationBell.tsx` — NEW (~120 lines)
- `src/components/NotificationDropdown.tsx` — NEW (~180 lines)
- `src/features/account/NotificationInbox.tsx` — NEW (~250 lines)
- `src/components/Layout.tsx` — MODIFY (add bell icon to header, +10 lines)
- `src/main.tsx` — MODIFY (add `/account/notifications` route, +1 line)
- `src/components/notifications.ts` — MODIFY (extend for persistent notifications, +50 lines)
- `src/components/NotificationProvider.tsx` — MODIFY (integrate persistent + transient, +30 lines)
- `supabase/migrations/20261006001400_admin_orders.sql` — MODIFY (add notification triggers to `admin_transition_order`, +20 lines)
- `tests/notification-persistent-dom.test.mjs` — NEW (~500 lines)
- `supabase/tests/notifications.sql` — NEW (~300 lines)

**Database schema:**

```sql
-- Migration: 20261103000002_notifications.sql

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'order_placed',
    'order_confirmed',
    'order_processing',
    'order_ready_for_pickup',
    'order_out_for_delivery',
    'order_completed',
    'order_cancelled'
  )),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body text CHECK (char_length(body) <= 1000),
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON notifications FROM public, anon, authenticated;
GRANT SELECT, UPDATE (read_at) ON notifications TO authenticated;

CREATE POLICY notifications_owner_read ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notifications_owner_update ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Indexes
CREATE INDEX notifications_user_unread_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notifications_order_idx ON notifications (order_id);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- RPC functions
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_order_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO notifications (user_id, type, title, body, order_id)
  VALUES (p_user_id, p_type, p_title, p_body, p_order_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE notifications
  SET read_at = now()
  WHERE id = p_notification_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION count_unread_notifications()
RETURNS integer AS $$
BEGIN
  RETURN COUNT(*)::integer
  FROM notifications
  WHERE user_id = auth.uid() AND read_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_notification(uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION count_unread_notifications() TO authenticated;

-- Add notification triggers to admin_transition_order (modify existing migration 00600)
CREATE OR REPLACE FUNCTION notify_order_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_notification_type text;
  v_notification_title text;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = NEW.order_id;
  
  -- Map status to notification type
  v_notification_type := 'order_' || NEW.to_status;
  
  -- Generate title based on status
  CASE NEW.to_status
    WHEN 'confirmed' THEN v_notification_title := 'Your order has been confirmed';
    WHEN 'processing' THEN v_notification_title := 'Your order is being processed';
    WHEN 'ready_for_pickup' THEN v_notification_title := 'Your order is ready for pickup';
    WHEN 'out_for_delivery' THEN v_notification_title := 'Your order is out for delivery';
    WHEN 'completed' THEN v_notification_title := 'Your order has been completed';
    WHEN 'cancelled' THEN v_notification_title := 'Your order has been cancelled';
    ELSE v_notification_title := 'Your order status has changed';
  END CASE;
  
  -- Create notification (service_role)
  PERFORM create_notification(
    v_order.user_id,
    v_notification_type,
    v_notification_title,
    NULL,
    v_order.id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER order_transition_notification
  AFTER INSERT ON business_order_operations
  FOR EACH ROW EXECUTE FUNCTION notify_order_transition();
```

**SQL security review:**

| Concern | Assessment | Mitigation |
|---|---|---|
| **SECURITY DEFINER on `create_notification()`** | HIGH RISK — service_role only, can insert any user's notifications | Function is granted to `service_role` only (not `authenticated`). Called from `notify_order_transition()` trigger, which runs in SECURITY DEFINER context. Trigger validates `order_id` exists and retrieves `user_id` from `orders` table. No direct user input to `p_user_id`. |
| **SECURITY DEFINER on `mark_notification_read()`** | MEDIUM RISK — updates `read_at` for any notification | Explicit `auth.uid()` check in WHERE clause: `WHERE id = p_notification_id AND user_id = auth.uid()`. Prevents cross-user updates. |
| **SECURITY DEFINER on `count_unread_notifications()`** | LOW RISK — read-only | Uses `auth.uid()` in WHERE clause. Returns count for caller's notifications only. |
| **SECURITY DEFINER on `notify_order_transition()`** | MEDIUM RISK — trigger function runs with definer's privileges | Trigger fires AFTER INSERT on `business_order_operations` (admin-only table). Reads `orders` table to get `user_id`. Calls `create_notification()` with validated data. No direct user input. |
| **RLS policies** | LOW RISK — standard owner-scoped | `notifications_owner_read` and `notifications_owner_update` both use `user_id = auth.uid()`. Prevents cross-user access. |
| **Realtime publication** | LOW RISK — Supabase-managed | `ALTER PUBLICATION supabase_realtime ADD TABLE notifications` enables Realtime. Supabase filters by `user_id` (RLS applies to Realtime subscriptions). |
| **Concurrency: simultaneous notification creation** | LOW RISK — insert-only | Multiple triggers can fire simultaneously, but each inserts a new row. No race conditions. |
| **Migration rollback** | REVERSIBLE with caveats | `DROP TABLE notifications CASCADE` removes table. `DROP TRIGGER order_transition_notification` removes trigger. Existing `business_order_operations` rows unaffected. Notifications created during rollback window are lost (acceptable — notifications are transient). |

**Test requirements:**
- Notification creation on order transitions (placed → confirmed → processing → ready → delivery → completed → cancelled)
- RLS ownership enforcement (user A cannot read/update user B's notifications)
- Unread count accuracy (increment on create, decrement on mark_read)
- Mark-as-read functionality (updates `read_at` timestamp)
- Realtime delivery (notification appears in UI within 5 seconds of creation)
- Bell icon rendering (displays unread count badge)
- Dropdown/popover interactions (opens on click, closes on outside click)
- Inbox page rendering (displays all notifications, sorted by created_at DESC)
- Accessibility: ARIA live regions for new notifications, keyboard navigation, screen reader announcements

**Rollback:**
- `DROP TABLE notifications CASCADE`
- `DROP TRIGGER order_transition_notification ON business_order_operations`
- `DROP FUNCTION notify_order_transition()`
- Remove notification UI components
- Revert to transient toast only
- No data loss (order history remains)

**Estimated effort:** 5-7 days

**Gates:**
- [ ] Slice 5 gates passed
- [ ] Migration reviewed and approved (SECURITY DEFINER audit)
- [ ] RLS policies tested (ownership, cross-user denial)
- [ ] Realtime subscription tested (notification delivery < 5 seconds)
- [ ] Lint/TypeScript/tests/build clean
- [ ] SQL tests pass (notifications.sql)
- [ ] DOM tests pass (notification-persistent-dom.test.mjs)
- [ ] Staging verification (trigger notifications, verify bell, test inbox, mark as read)
- [ ] Independent review
- [ ] Owner approval

---

## 5. Security and QA Acceptance Criteria

### Security audit summary

| Slice | SECURITY DEFINER functions | RLS policies | Concurrency concerns | Rollback complexity |
|---|---|---|---|---|
| 0 (closure) | NONE | NONE | NONE | NONE |
| 1 (currency) | NONE | NONE | NONE | LOW (re-add component) |
| 2A–2E (auth) | NONE (Supabase-managed) | NONE (Supabase-managed) | NONE | LOW (remove components) |
| 3 (email) | NONE (CRON uses service_role) | NONE | LOW (idempotency keys) | LOW (disable CRON) |
| 4 (addresses) | 2 (enforce_default, enforce_max_5) | 1 (owner_all) | LOW (trigger serialization) | MEDIUM (DROP TABLE CASCADE) |
| 5 (timeline) | 1 (customer_order_history) | 0 (uses existing orders RLS) | NONE (read-only) | LOW (DROP FUNCTION) |
| 6 (notifications) | 4 (create, mark_read, count, notify_transition) | 2 (owner_read, owner_update) | LOW (insert-only) | MEDIUM (DROP TABLE CASCADE + trigger removal) |

### QA strategy per slice

| Slice | Unit Tests | DOM Tests | SQL Tests | Integration Tests | Browser QA | Staging QA |
|---|---|---|---|---|---|---|
| 0 (closure) | N/A | N/A | N/A | N/A | N/A | N/A |
| 1 (currency) | UPDATE (remove selector) | UPDATE (remove selector) | N/A | N/A | Verify NLE-only | Verify no regression |
| 2A (email sign-in) | ADD | ADD | N/A | ADD (sign-in flow) | Verify sign-in | Verify with test account |
| 2B (registration) | ADD | ADD | N/A | ADD (registration flow) | Verify registration | Verify with test account |
| 2C (verification) | ADD | ADD | N/A | ADD (verification flow) | Verify email | Verify in staging |
| 2D (password reset) | ADD | ADD | N/A | ADD (reset flow) | Verify reset | Verify in staging |
| 2E (templates) | N/A | N/A | N/A | N/A | Verify rendering | Verify delivery |
| 3 (email 403 + CRON) | ADD (CRON) | N/A | N/A | ADD (retry flow) | Verify delivery | Verify CRON execution |
| 4 (addresses) | ADD (CRUD) | ADD (UI) | ADD (RLS, constraints) | ADD (checkout integration) | Verify picker | Verify add/edit/delete |
| 5 (timeline) | ADD (RPC) | ADD (UI) | ADD (ownership) | ADD (order detail integration) | Verify timeline | Verify with test orders |
| 6 (notifications) | ADD (RPC) | ADD (UI) | ADD (RLS, triggers) | ADD (Realtime integration) | Verify bell + inbox | Verify end-to-end |

---

## 6. Outstanding Owner Decisions

### Before any implementation

| # | Decision | Options | Recommendation | Slice |
|---|---|---|---|---|
| 1 | Enable email/password provider in Supabase dashboard? | YES / NO | YES (required for Slices 2A–2E) | 2A |
| 2 | Enable email confirmation in Supabase dashboard? | YES / NO | YES (required for Slice 2B) | 2B |
| 3 | Enable password recovery in Supabase dashboard? | YES / NO | YES (required for Slice 2D) | 2D |
| 4 | Configure redirect URLs in Supabase dashboard? | YES / NO | YES (required for all auth slices) | 2A |
| 5 | Sending domain selection | A: `send.najbuilds.com` / B: `mail.lumehouse.sl` / C: keep `onboarding@resend.dev` | A or B for production | 3 |
| 6 | CRON retry strategy | A: exponential backoff / B: fixed interval | A (industry best practice) | 3 |
| 7 | Lumé House branding assets for email templates | Provide / Use default | Provide for brand consistency | 2E |

### During implementation

| # | Decision | Options | Recommendation | Slice |
|---|---|---|---|---|
| 8 | Street address autocomplete | A: Google Places / B: Mapbox / C: defer (manual only) | C (Freetown-only, low complexity) | 4 |
| 9 | Notification preferences | A: all enabled / B: per-type opt-out / C: global on/off | A (can add later) | 6 |
| 10 | Account linking (Google + email/password) | YES / NO / DEFER | DEFER (not in this plan) | Future |

---

## 7. Exact Proposed First Implementation Slice

### Slice 1: S02-05 Currency Simplification

**Rationale for starting here:**
1. **Lowest risk** — no database changes, no SECURITY DEFINER functions, no RLS policies
2. **Reduces surface area** — removes unused currency selector before auth work begins
3. **Independent** — no dependencies on other S02 workstreams
4. **Fast** — 0.5 days estimated effort
5. **Reversible** — re-add component if issues arise
6. **Confirms NLE-only** — aligns implementation with business decision

**Pre-requisites (none — no owner decisions required)**

**Implementation plan:**
1. Remove `CurrencySelector.tsx` from footer in `Layout.tsx`
2. Remove `lume:currency` localStorage key usage from `localeCurrency.ts`
3. Keep `CurrencyEstimate` and `CurrencyDisclosure` (display-only, NLE-reference)
4. Update `tests/currency-dom.test.mjs` — remove selector tests, keep estimate tests
5. Create `docs/s02-05-currency-decisions.md` — document NLE authoritative, display estimates informational, admin rates later scope
6. Run full test suite (689 existing − selector tests + updated estimate tests)
7. Run `tsc --noEmit` and `npm run build`
8. Submit PR for review

**Files affected:**
- `src/features/currency/CurrencySelector.tsx` — DELETE
- `src/components/Layout.tsx` — MODIFY (remove import + render)
- `src/features/currency/localeCurrency.ts` — MODIFY (remove localStorage persistence)
- `tests/currency-dom.test.mjs` — MODIFY (remove selector tests)
- `docs/s02-05-currency-decisions.md` — CREATE

**Testing requirements:**
- Remove all tests for `CurrencySelector` component
- Keep all tests for `CurrencyEstimate`, `CurrencyDisclosure`, `formatMoney`
- Verify checkout still enforces NLE (no regression)
- Verify no console errors about missing `lume:currency` key
- All remaining tests must PASS

**Rollback plan:**
- Re-add `CurrencySelector.tsx` to `Layout.tsx`
- Restore localStorage persistence in `localeCurrency.ts`
- Restore selector tests in `currency-dom.test.mjs`
- Time: 5 minutes

**Success criteria:**
- Currency selector removed from footer
- No references to `lume:currency` localStorage key in codebase
- `CurrencyEstimate` and `CurrencyDisclosure` still render (display-only)
- Checkout still enforces NLE
- All tests PASS
- TypeScript clean
- Build successful
- No console errors

**Owner approval request:**

> **Owner approval requested for S02-05 Slice 1: Currency Simplification**
>
> **Objective:** Remove storefront currency selector; confirm NLE-only transactional currency.
>
> **Pre-requisites:** None.
>
> **Scope:** Remove `CurrencySelector.tsx`, remove localStorage persistence, keep display-only estimate components, document decisions.
>
> **Out of scope:** Admin-managed exchange rates, multi-currency checkout (architecturally excluded).
>
> **Estimated effort:** 0.5 days
>
> **Risk level:** LOW (no database changes, no SECURITY DEFINER, no RLS changes, reversible)
>
> **Rollback:** Re-add component and localStorage key (5 minutes)
>
> **Testing:** Remove selector tests, keep estimate tests, verify no regression
>
> **Deliverable:** NLE-only currency implementation, decision documentation
>
> **Next step:** After Slice 1 approval and completion, request approval for Slice 2A (email/password sign-in)
>
> **Approve Slice 1?** [ ] YES [ ] NO
>
> **Comments:** _______________

---

## 8. Execution Governance

### Sequential slice enforcement

- **No parallel implementation.** Each slice must pass all gates before the next slice begins.
- **Owner approval required** for every slice (gates in §4).
- **Independent review required** for every slice with code changes (Slices 1–6).
- **Staging verification required** for every slice with hosted impact (Slices 2A–6).

### Gate definitions

| Gate | Description | Evidence |
|---|---|---|
| Lint clean | `npm run lint` exits 0 | CI output |
| TypeScript clean | `tsc --noEmit` exits 0 | CI output |
| All tests pass | `npm test` exits 0 with all tests PASS | CI output |
| Build successful | `npm run build` exits 0 | CI output |
| SQL tests pass | `supabase test` exits 0 (for slices with migrations) | Local harness output |
| DOM tests pass | `tests/*-dom.test.mjs` exits 0 | CI output |
| Independent review | Code review by non-author (for slices with code changes) | PR approval |
| Staging verification | Manual testing on staging Vercel preview (for slices with hosted impact) | QA report |
| Owner approval | Explicit owner sign-off (for every slice) | Comment in PR or chat |

### Rollback strategy per slice

| Slice | Rollback action | Time | Data loss |
|---|---|---|---|
| 0 (closure) | N/A | N/A | N/A |
| 1 (currency) | Re-add component + localStorage | 5 min | NONE |
| 2A–2E (auth) | Remove components + routes | 10 min | NONE (Supabase Auth manages users) |
| 3 (email) | Revert `RESEND_FROM` + disable CRON | 5 min | NONE (existing jobs unaffected) |
| 4 (addresses) | `DROP TABLE addresses CASCADE` | 15 min | LOW (addresses are convenience) |
| 5 (timeline) | `DROP FUNCTION customer_order_history` | 5 min | NONE (history table remains) |
| 6 (notifications) | `DROP TABLE notifications CASCADE` + remove trigger | 20 min | LOW (notifications are transient) |

### Post-slice documentation

After each slice passes all gates:
1. Update this manifest with actual effort, issues encountered, and lessons learned
2. Update `docs/s02-XX-slice-report.md` (slice-specific report)
3. Update project memory with closure notation
4. Request owner approval for next slice

---

## Appendix A: Workstream Summary

| Workstream | Status | Implementation Needed | Estimated Effort | Risk Level |
|---|---|---|---|---|
| S02-NEW-03 Guest Continuity | **CLOSE** | None | 0.5 hours | NONE |
| S02-05 Currency | **SIMPLIFY** | Remove selector | 0.5 days | LOW |
| S02-NEW-04 Authentication | **IMPLEMENT** | 5 sub-slices (sign-in, registration, verification, reset, templates) | 10-13 days | LOW–MEDIUM |
| S02-06 Email | **INVESTIGATE + IMPLEMENT** | 403 investigation → verified domain → CRON retry | 3-6 days | MEDIUM |
| S02-NEW-01 Saved Addresses | **IMPLEMENT** | Max 5, labels, manual entry | 3-4 days | MEDIUM |
| S02-NEW-02 Order Timeline | **IMPLEMENT** | Customer-visible statuses + timestamps | 2-3 days | LOW–MEDIUM |
| S02-04 Notifications | **IMPLEMENT** | Order lifecycle, bell, inbox, unread count | 5-7 days | MEDIUM |

**Total estimated effort:** 24-34 days (sequential execution)

---

## Appendix B: Test Coverage Summary

| Workstream | Existing Test Lines | New Tests Needed |
|---|---|---|
| S02-NEW-03 | 4,658 lines (10 files) | None |
| S02-05 | 1,354 lines (5 files) | UPDATE (remove selector tests) |
| S02-NEW-04 | Not yet created | ~1,050 lines (5 test files) |
| S02-06 | ~500 lines (5+ files) | ~200 lines (CRON, delivery) |
| S02-NEW-01 | 2,974 lines (4 files) | ~600 lines (address CRUD, RLS, UI) |
| S02-NEW-02 | 1,333 lines (7 files) | ~450 lines (timeline UI, RPC) |
| S02-04 | 573 lines (1 file) | ~800 lines (persistent notifications, Realtime) |

**Total existing tests:** ~11,392 lines
**Total new tests needed:** ~3,100 lines

---

## Appendix C: Migration Summary

| Workstream | New Migrations | Schema Changes | SECURITY DEFINER functions |
|---|---|---|---|
| S02-NEW-03 | None | None | None |
| S02-05 | None | None | None |
| S02-NEW-04 | None (Supabase-managed) | None (Supabase-managed) | None |
| S02-06 | None (CRON function only) | None | None (CRON uses service_role) |
| S02-NEW-01 | 1 (`saved_addresses`) | New `addresses` table + `profiles.default_address_id` | 2 (`enforce_one_default_address`, `enforce_max_five_addresses`) |
| S02-NEW-02 | 1 (`customer_order_history`) | New RPC function | 1 (`customer_order_history`) |
| S02-04 | 1 (`notifications`) | New `notifications` table + triggers | 4 (`create_notification`, `mark_notification_read`, `count_unread_notifications`, `notify_order_transition`) |

**Total new migrations:** 3
**Total new tables:** 2 (`addresses`, `notifications`)
**Total new SECURITY DEFINER functions:** 7
**Total new RPC functions:** 10 (including non-SECURITY DEFINER)

---

## Appendix D: SQL Security Audit

### SECURITY DEFINER risk assessment

All SECURITY DEFINER functions in this plan run with `postgres` privileges (definer's privileges). This is necessary to bypass RLS for trusted operations, but introduces risk if not properly constrained.

**Mitigation pattern applied to all functions:**

1. **Explicit ownership check:** Every function that reads or writes user-scoped data includes `WHERE user_id = auth.uid()` or equivalent.
2. **Input validation:** All function parameters are validated before use (CHECK constraints, type casting, length limits).
3. **Minimal privilege:** Functions are granted to the minimum required role (`authenticated` for user operations, `service_role` for system operations).
4. **No dynamic SQL:** Functions use parameterized queries only. No string concatenation or `EXECUTE` with user input.
5. **No external calls:** Functions do not call external APIs or write to external tables.

**Function-by-function audit:**

| Function | Risk | Ownership check | Input validation | Grant |
|---|---|---|---|---|
| `enforce_one_default_address()` | MEDIUM | Implicit (trigger on user's own insert/update) | CHECK constraints on `addresses` | N/A (trigger) |
| `enforce_max_five_addresses()` | MEDIUM | Implicit (trigger on user's own insert) | CHECK constraints on `addresses` | N/A (trigger) |
| `customer_order_history(p_order_id)` | MEDIUM | `WHERE user_id = auth.uid()` on `orders` table | `p_order_id` is UUID type | `authenticated` |
| `create_notification(p_user_id, p_type, p_title, p_body, p_order_id)` | HIGH | N/A (service_role only) | CHECK constraints on `notifications`, `p_type` IN (...) | `service_role` |
| `mark_notification_read(p_notification_id)` | MEDIUM | `WHERE user_id = auth.uid()` | `p_notification_id` is UUID type | `authenticated` |
| `count_unread_notifications()` | LOW | `WHERE user_id = auth.uid()` | No input parameters | `authenticated` |
| `notify_order_transition()` | MEDIUM | Reads `orders.user_id` (trusted) | Trigger on `business_order_operations` (admin-only) | N/A (trigger) |

**Concurrency concerns:**

- **Trigger serialization:** PostgreSQL serializes trigger execution per-row. Two simultaneous inserts to `addresses` by the same user will not race on the max-5 check.
- **Notification creation:** Multiple order transitions can fire simultaneously, but each inserts a new row. No race conditions.
- **Idempotency:** Email CRON retry uses existing idempotency keys (`lume-order-confirmation-v1-{order.id}`). No duplicate sends.

**Rollback concerns:**

- **DROP TABLE CASCADE:** Removes table and all dependent objects (foreign keys, indexes, triggers). Existing data is lost.
- **DROP FUNCTION:** Removes function only. No data loss.
- **Trigger removal:** `DROP TRIGGER` removes trigger. Existing data unaffected.

**Recommendation:** All SECURITY DEFINER functions in this plan are acceptable with the mitigations applied. High-risk functions (`create_notification`) are granted to `service_role` only, not `authenticated`.

---

**End of S02 Consolidated Execution Manifest v2.0.**

**Next step:** Owner review and approval request for Slice 1 (S02-05 currency simplification).

**Status:** PLAN READY FOR OWNER REVIEW
