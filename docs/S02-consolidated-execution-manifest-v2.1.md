# S02 Consolidated Execution Manifest v2.1

**Date:** 2026-11-03
**Branch:** `feat/lume-web-s02-country-enforcement`
**Local HEAD:** `eb035f9` (PR #21 head)
**Remote HEAD:** `fbe16d5` (PR #21 merged to `origin/main` 2026-11-03)
**Local main:** `94eaead` (stale — needs `git fetch`)
**Mode:** PLAN — Read-only. No edits, no commits, no migrations, no hosted changes.

**Supersedes:** v2.0 (incorrect authentication sequencing)

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

### Owner-approved planning decisions (v2.1 corrections)

| # | Decision | Effect on manifest |
|---|---|---|
| D1 | Currency: remove manual dropdown; keep automatic locale detection and informational estimates; NLE authoritative; admin rates later scope | S02-05 reduced to dropdown/disclosure removal; locale detection and `CurrencyEstimate` retained |
| D2 | Email: investigate historical 403 before changes; verified Lumé House-owned subdomain | S02-06 adds investigation prerequisite |
| D3 | Addresses: max 5 per customer; Home/Work/custom labels; manual entry only | S02-NEW-01 scope bounded, no autocomplete |
| D4 | Timeline: customer-visible statuses + timestamps only; admin reasons hidden | S02-NEW-02 RPC excludes `reason` and `actor_user_id` |
| D5 | Notifications: order lifecycle only; persistent inbox, bell, unread count; email delivery status internal | S02-04 excludes email-status notification types |
| D6 | Execution: one coordinated plan, sequential slices, independent review, explicit owner approvals | All slices require owner gate before implementation |

### Authentication deferral decision

**S02-NEW-04 Authentication expansion is FORMALLY DEFERRED to position 12**, after S02 acceptance, engineering foundation, S03 premium UI, S04 responsive/accessibility, and S05 admin platform complete.

Authentication requirements remain traceable and are not removed. Deferral distinguishes completed S02 functionality from future authentication expansion.

---

## 2. Corrected Workstream Matrix

### S02-05 Currency — Simplification (Revised D1)

| Area | v2.0 classification | v2.1 correction |
|---|---|---|
| Currency selector UI (dropdown) | IMPLEMENTED (to keep) | **REMOVE** — manual selection deleted per revised D1 |
| Currency disclosure | IMPLEMENTED (to keep) | **REMOVE** — disclosure deleted per revised D1 |
| Currency estimate display | IMPLEMENTED (to keep) | **KEEP** — "≈ GNF X" display retained per revised D1 |
| Locale-based automatic detection | IMPLEMENTED (to keep) | **KEEP** — automatic detection retained per revised D1 |
| CurrencyProvider and state management | IMPLEMENTED (to keep) | **KEEP** — automatic locale selection retained per revised D1 |
| NLE authoritative | IMPLEMENTED | Unchanged |
| NLE formatting utilities | IMPLEMENTED | Unchanged — `formatMoney()` retained |
| Frankfurter API integration | IMPLEMENTED | Unchanged — rate retrieval retained |
| Admin-managed exchange rates | MISSING | **LATER SCOPE** — not in this plan |
| Multi-currency checkout | MISSING | Architecturally excluded by design |

**Action:** Remove `CurrencySelector` (dropdown) and `CurrencyDisclosure` components. Rename `CurrencySelector.tsx` to `CurrencyEstimate.tsx`. Keep `CurrencyEstimate`, `CurrencyProvider`, `useCurrency`, `CurrencyContext`, `localeCurrency`, and `currency.ts`. Update `SiteFooter.tsx` to remove dropdown/disclosure render. Update import paths in checkout, cart, and product pages.

### S02-06 Email — Investigation-first

| Area | v2.0 classification | v2.1 correction |
|---|---|---|
| Resend API integration | IMPLEMENTED | Unchanged |
| Verified sending domain | MISSING | **INVESTIGATE historical 403 first** per D2 |
| Automated retry / CRON | MISSING | Remains in scope after investigation |
| Admin email management UI | MISSING | **DEFER** — not in this plan |

**Action:** Before any configuration change, investigate the historical 403 errors from Resend. Determine root cause (domain reputation, DNS, API key scope, rate limiting). Only after investigation resolves, proceed with verified domain setup and CRON retry.

### S02-NEW-01 Saved Addresses — Bounded scope

| Area | v2.0 classification | v2.1 correction |
|---|---|---|
| Multiple saved addresses | MISSING | **IMPLEMENT — max 5 per customer** per D3 |
| Address labels | MISSING | **Home / Work / custom labels** per D3 |
| Street address autocomplete | MISSING | **DEFER — manual entry only** per D3 |
| Address management UI | MISSING | Add/edit/delete/list with 5-address cap |

### S02-NEW-02 Order Timeline — Customer-only view

| Area | v2.0 classification | v2.1 correction |
|---|---|---|
| Customer timeline UI | MISSING | **IMPLEMENT** — statuses + timestamps only per D4 |
| Customer history RPC | MISSING | **Exclude `reason` and `actor_user_id`** per D4 |
| Real-time status updates | MISSING | **DEFER** — not in this plan |
| Admin timeline | IMPLEMENTED | Unchanged — admin reasons remain admin-only |

### S02-04 Notifications — Order lifecycle only

| Area | v2.0 classification | v2.1 correction |
|---|---|---|
| Persistent notification table | MISSING | **IMPLEMENT** — order lifecycle types only per D5 |
| Bell icon + inbox + unread count | MISSING | **IMPLEMENT** per D5 |
| Email status notifications | MISSING | **EXCLUDE** — email delivery status is internal per D5 |
| Notification preferences | MISSING | **DEFER** — all enabled, no opt-out |
| Realtime subscription | MISSING | **IMPLEMENT** — scoped to user's notifications |

### S02-NEW-04 Authentication — FORMALLY DEFERRED

| Area | Classification | Evidence |
|---|---|---|
| Google OAuth | **IMPLEMENTED** | `src/features/auth/auth.ts`, PKCE flow, session persistence |
| Email/password sign-in | **DEFERRED** | Position 12 — post-S03/S04/S05 |
| Email/password registration | **DEFERRED** | Position 12 — post-S03/S04/S05 |
| Email verification | **DEFERRED** | Position 12 — post-S03/S04/S05 |
| Password reset | **DEFERRED** | Position 12 — post-S03/S04/S05 |
| Email templates + redirect config | **DEFERRED** | Position 12 — post-S03/S04/S05 |
| Account linking (Google + email) | **DEFERRED** | Future slice — not in this plan |

**NOT removed. NOT silently redefined.** Authentication expansion remains a documented requirement, formally deferred to position 12 in the roadmap.

---

## 3. Sequential Slice Order and Dependencies

```
Slice 0: S02-NEW-03 Guest Continuity Closure (no implementation)
    ↓
Slice 1: S02-05 Currency Simplification (remove selector, estimates, disclosure)
    ↓
Slice 2: S02-06 Email — 403 investigation → verified domain → CRON retry
    ↓
Slice 3: S02-NEW-01 Saved Addresses (max 5, labels, manual entry)
    ↓
Slice 4: S02-NEW-02 Customer Order Timeline (statuses + timestamps)
    ↓
Slice 5: S02-04 Persistent Notifications (order lifecycle, bell, inbox)
    ↓
Slice 6: S02 Acceptance and Release Reconciliation
    ↓
Slice 7: Engineering Foundation
    ↓
Slice 8: S03 Premium UI and Animations
    ↓
Slice 9: S04 Responsive and Accessibility Polish
    ↓
Slice 10: S05 Owner/Admin/Staff Platform
    ↓
Slice 11: S02-NEW-04 Authentication Expansion (FORMALLY DEFERRED)
    ↓
Slice 12: S06 Payments
    ↓
Slice 13: S07 Full Web Acceptance
    ↓
Slice 14: S08 Mobile Handoff
```

### Dependency rationale

- **Slice 0** closes S02-NEW-03 with no code changes.
- **Slice 1** is independent, low-risk, and reduces surface area before email work.
- **Slice 2** investigates the historical 403 before any email configuration changes.
- **Slice 3** extends existing profile schema. Independent of email but assumes auth is complete (Google OAuth).
- **Slice 4** extends existing order infrastructure. Independent but benefits from notifications (Slice 5) being planned next.
- **Slice 5** depends on Slice 4 (order events as notification triggers) and Slice 2 (email as notification channel, though email delivery status is internal per D5).
- **Slice 6** closes S02 with acceptance testing and release reconciliation.
- **Slices 7–10** are post-S02 engineering and UI work (separate manifests required).
- **Slice 11** is authentication expansion, formally deferred until after S03/S04/S05 complete.
- **Slices 12–14** are post-authentication work (separate manifests required).

---

## 4. Slice Execution Details

### Slice 0: S02-NEW-03 Guest Continuity Closure

**Objective:** Document that guest continuity is complete.

**Actions:** None. No code changes, no tests, no migration, no deployment.

**Deliverable:** Closure notation in this manifest and project memory.

**Gate:** Documentation only — no owner approval needed.

---

### Slice 1: S02-05 Currency Simplification (Revised D1)

**Objective:** Remove manual currency dropdown and disclosure; preserve automatic locale detection and informational estimates; confirm NLE-only transactional currency.

**Dependencies:** None

**Revised D1 decision:** Remove manual currency selection while preserving automatic informational conversion. NLE is primary; browser locale auto-detects regional currency; "≈ GNF X" estimate shown underneath NLE prices; no dropdown; checkout NLE-only.

**Actions:**
1. Rename `src/features/currency/CurrencySelector.tsx` to `src/features/currency/CurrencyEstimate.tsx`
2. Remove `CurrencySelector` component (dropdown) from the file
3. Remove `CurrencyDisclosure` component (details) from the file
4. Keep `CurrencyEstimate` component (≈ display) in the file
5. Update `src/components/SiteFooter.tsx` — remove `CurrencySelector` and `CurrencyDisclosure` imports and render
6. Update import paths in `CheckoutPage.tsx`, `OrderSummary.tsx`, `CartPage.tsx`, `ShopPage.tsx`, `ProductDetailsPage.tsx` — change `CurrencySelector` to `CurrencyEstimate`
7. Update `tests/currency-dom.test.mjs` — remove dropdown and disclosure tests, keep estimate tests
8. Update `tests/currency-presentation-dom.test.mjs` — remove disclosure tests, keep estimate tests
9. Add new tests to verify revised D1 behavior (no dropdown, no disclosure, locale detection works)
10. Create `docs/s02-05-currency-decisions.md` — document revised D1 decision

**Files affected:**
- `src/features/currency/CurrencySelector.tsx` → `src/features/currency/CurrencyEstimate.tsx` — RENAME (remove dropdown and disclosure, keep estimate)
- `src/components/SiteFooter.tsx` — MODIFY (remove dropdown and disclosure imports/render)
- `src/features/checkout/CheckoutPage.tsx` — MODIFY (update import path)
- `src/features/checkout/OrderSummary.tsx` — MODIFY (update import path)
- `src/features/cart/CartPage.tsx` — MODIFY (update import path)
- `src/features/products/ShopPage.tsx` — MODIFY (update import path)
- `src/features/products/ProductDetailsPage.tsx` — MODIFY (update import path)
- `tests/currency-dom.test.mjs` — MODIFY (remove dropdown/disclosure tests, add revised D1 tests)
- `tests/currency-presentation-dom.test.mjs` — MODIFY (remove disclosure tests)
- `docs/s02-05-currency-decisions.md` — CREATE

**Files NOT modified:**
- `src/features/currency/CurrencyProvider.tsx` — unchanged (state management retained)
- `src/features/currency/useCurrency.ts` — unchanged (hook retained)
- `src/features/currency/CurrencyContext.ts` — unchanged (context retained)
- `src/features/currency/localeCurrency.ts` — unchanged (automatic detection retained)
- `src/features/currency/currency.ts` — unchanged (NLE formatting and rate utilities retained)
- `src/main.tsx` — unchanged (CurrencyProvider wrapper retained)
- All checkout/cart/order logic — unchanged (NLE enforcement retained)

**SQL/migration concerns:** NONE — no schema changes.

**Exchange-rate provider compatibility:**
- Frankfurter API supports SLE → GNF, GHS, NGN, USD (verified by production usage)
- NLE and SLE treated as 1:1 equivalent (NLE is display name, SLE is ISO code)
- Rate retrieval, conversion, and locale detection logic unchanged
- Graceful degradation on network failure (NLE prices still display)

**Test requirements:**
- Remove tests for `CurrencySelector` dropdown (~15 tests)
- Remove tests for `CurrencyDisclosure` (~8 tests)
- Keep tests for `CurrencyEstimate` (~22 tests)
- Keep tests for locale detection (~30 tests)
- Keep tests for NLE formatting (~50 tests)
- Add tests for revised D1 behavior (~6 tests):
  - No dropdown renders in footer
  - No disclosure renders in footer
  - Estimate still renders for GNF locale
  - No estimate for NLE locale
  - Locale detection overrides stored preference
  - Stale localStorage does not override current locale
- All remaining tests must PASS (~672 tests)

**Rollback:** Restore file name, re-add dropdown and disclosure components, revert import paths. Time: 15 minutes.

**Estimated effort:** 0.6 days (4.75 hours)

**Gates:**
- [ ] Lint clean
- [ ] TypeScript clean
- [ ] All tests pass (~672 tests)
- [ ] Build successful
- [ ] Independent review
- [ ] Browser verification (no dropdown, estimate shows for GNF/GHS/NGN/USD locales, no estimate for NLE)
- [ ] Owner approval

---

### Slice 2: S02-06 Email — 403 investigation → verified domain → CRON retry

**Objective:** Resolve historical 403 errors, configure verified sending domain, implement automated retry.

**Dependencies:** Slice 1 complete

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

**Estimated effort:** 3-6 days (investigation + domain + CRON)

**Gates:**
- [ ] Slice 1 gates passed
- [ ] 403 investigation complete and root cause resolved
- [ ] Owner confirms sending domain selection
- [ ] DNS records configured and verified
- [ ] CRON function deployed and tested
- [ ] Test email delivered to inbox (not spam)
- [ ] Independent review
- [ ] Owner approval

---

### Slice 3: S02-NEW-01 Saved Addresses

**Objective:** Enable customers to save and manage up to 5 delivery addresses with labels.

**Dependencies:** Slice 2 complete

**Owner decisions (confirmed in v2.1):**
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER addresses_max_five
  BEFORE INSERT ON addresses
  FOR EACH ROW EXECUTE FUNCTION enforce_max_five_addresses();

-- Add default_address_id to profiles
ALTER TABLE profiles ADD COLUMN default_address_id uuid REFERENCES addresses(id) ON DELETE SET NULL;
```

**SQL security review:**

| Concern | Assessment | Mitigation |
|---|---|---|
| **SECURITY DEFINER on `enforce_one_default_address()`** | MEDIUM RISK — function runs with definer's privileges (postgres) | Function only updates `addresses` table within same user's rows. No external calls. Input is `NEW` row (already validated by RLS). **SET search_path = public, pg_temp** prevents search_path hijacking. |
| **SECURITY DEFINER on `enforce_max_five_addresses()`** | MEDIUM RISK — same as above | Function only reads `addresses` table for same user. No writes. Raises exception if limit exceeded. **SET search_path = public, pg_temp** prevents search_path hijacking. |
| **RLS policy `addresses_owner_all`** | LOW RISK — standard owner-scoped policy | `USING (user_id = auth.uid())` and `WITH CHECK (user_id = auth.uid())` prevent cross-user access. |
| **UNIQUE constraint on `(user_id, label)`** | LOW RISK — prevents duplicate labels per user | Application layer validates label before submit. Database enforces uniqueness. |
| **CHECK constraint on `city`** | LOW RISK — matches existing checkout validation | Case-insensitive regex `^freetown$` matches existing `CheckoutPage.tsx` validation. Enforces Sierra Leone delivery eligibility. |
| **Foreign key `profiles.default_address_id`** | LOW RISK — references `addresses(id)` with `ON DELETE SET NULL` | If address deleted, profile's `default_address_id` becomes NULL (safe). |
| **Concurrency: two simultaneous inserts** | LOW RISK — trigger runs within transaction | PostgreSQL serializes trigger execution per-row. Max-5 check is atomic within transaction. |
| **Migration rollback** | REVERSIBLE | `DROP TABLE addresses CASCADE` removes table and `profiles.default_address_id` column. No customer data loss (addresses are convenience, not required for existing orders). |

**Test requirements:**
- Address CRUD operations (create, read, update, delete)
- RLS ownership enforcement (user A cannot access user B's addresses)
- Max 5 addresses per user (6th insert fails with `ADDRESS_LIMIT_EXCEEDED`)
- Default address uniqueness (setting one default clears others)
- Label uniqueness per user (duplicate label fails)
- City validation (non-Freetown rejected — enforces Sierra Leone delivery eligibility)
- Checkout address selection (picker renders, selection persists)
- Profile default address reference (update profile → default_address_id set)
- Accessibility: keyboard navigation, ARIA labels, screen reader announcements

**Rollback:**
- `DROP TABLE addresses CASCADE` (removes table and `profiles.default_address_id`)
- Remove address management UI components
- Revert checkout to profile defaults only
- No customer data loss (addresses are convenience, not required)

**Estimated effort:** 3-4 days

**Gates:**
- [ ] Slice 2 gates passed
- [ ] Migration reviewed and approved
- [ ] RLS policies tested (ownership, max-5, default uniqueness)
- [ ] Lint/TypeScript/tests/build clean
- [ ] SQL tests pass (addresses.sql)
- [ ] DOM tests pass (address-management-dom.test.mjs)
- [ ] Staging verification (add/edit/delete addresses, select at checkout)
- [ ] Independent review
- [ ] Owner approval

---

### Slice 4: S02-NEW-02 Customer Order Timeline

**Objective:** Provide customers with a visual timeline of order status transitions (statuses + timestamps only, no admin reasons).

**Dependencies:** Slice 3 complete

**Owner decisions (confirmed in v2.1):**
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION customer_order_history(uuid) TO authenticated;
```

**SQL security review:**

| Concern | Assessment | Mitigation |
|---|---|---|
| **SECURITY DEFINER on `customer_order_history()`** | MEDIUM RISK — function runs with definer's privileges | Explicit `auth.uid()` ownership check before returning data. Function only reads `business_order_operations` (immutable history table). No writes. **SET search_path = public, pg_temp** prevents search_path hijacking. |
| **Excluded columns: `reason`, `actor_user_id`** | INTENTIONAL per D4 | Customer view excludes admin-only fields. Function signature does not return these columns. |
| **RLS on `orders` table** | LOW RISK — existing policy | Ownership check `user_id = auth.uid()` matches existing RLS. Function raises exception if order not found or not owned by caller. |
| **Concurrency** | NONE — read-only function | No writes, no locks, no race conditions. |
| **Migration rollback** | REVERSIBLE | `DROP FUNCTION customer_order_history(uuid)` removes function. No schema changes. No customer data loss. |

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
- No customer data loss (history table remains for admin)

**Estimated effort:** 2-3 days

**Gates:**
- [ ] Slice 3 gates passed
- [ ] Migration reviewed and approved
- [ ] RLS ownership tested (cross-user access denied)
- [ ] Lint/TypeScript/tests/build clean
- [ ] SQL tests pass (customer_order_history.sql)
- [ ] DOM tests pass (order-timeline-dom.test.mjs)
- [ ] Staging verification (view timeline for test orders)
- [ ] Independent review
- [ ] Owner approval

---

### Slice 5: S02-04 Persistent Notifications

**Objective:** Implement persistent notifications with bell icon, inbox, unread count, and Realtime subscription. Order lifecycle only (no email status notifications per D5).

**Dependencies:** Slice 4 complete

**Owner decisions (confirmed in v2.1):**
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE notifications
  SET read_at = now()
  WHERE id = p_notification_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION count_unread_notifications()
RETURNS integer AS $$
BEGIN
  RETURN COUNT(*)::integer
  FROM notifications
  WHERE user_id = auth.uid() AND read_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER order_transition_notification
  AFTER INSERT ON business_order_operations
  FOR EACH ROW EXECUTE FUNCTION notify_order_transition();
```

**SQL security review:**

| Concern | Assessment | Mitigation |
|---|---|---|
| **SECURITY DEFINER on `create_notification()`** | HIGH RISK — service_role only, can insert any user's notifications | Function is granted to `service_role` only (not `authenticated`). Called from `notify_order_transition()` trigger, which runs in SECURITY DEFINER context. Trigger validates `order_id` exists and retrieves `user_id` from `orders` table. No direct user input to `p_user_id`. **SET search_path = public, pg_temp** prevents search_path hijacking. |
| **SECURITY DEFINER on `mark_notification_read()`** | MEDIUM RISK — updates `read_at` for any notification | Explicit `auth.uid()` check in WHERE clause: `WHERE id = p_notification_id AND user_id = auth.uid()`. Prevents cross-user updates. **SET search_path = public, pg_temp** prevents search_path hijacking. |
| **SECURITY DEFINER on `count_unread_notifications()`** | LOW RISK — read-only | Uses `auth.uid()` in WHERE clause. Returns count for caller's notifications only. **SET search_path = public, pg_temp** prevents search_path hijacking. |
| **SECURITY DEFINER on `notify_order_transition()`** | MEDIUM RISK — trigger function runs with definer's privileges | Trigger fires AFTER INSERT on `business_order_operations` (admin-only table). Reads `orders` table to get `user_id`. Calls `create_notification()` with validated data. No direct user input. **SET search_path = public, pg_temp** prevents search_path hijacking. |
| **RLS policies** | LOW RISK — standard owner-scoped | `notifications_owner_read` and `notifications_owner_update` both use `user_id = auth.uid()`. Prevents cross-user access. |
| **Realtime publication** | LOW RISK — Supabase-managed | `ALTER PUBLICATION supabase_realtime ADD TABLE notifications` enables Realtime. Supabase filters by `user_id` (RLS applies to Realtime subscriptions). |
| **Concurrency: simultaneous notification creation** | LOW RISK — insert-only | Multiple triggers can fire simultaneously, but each inserts a new row. No race conditions. |
| **Trusted event generation** | LOW RISK — admin-only trigger | Trigger fires only on `business_order_operations` INSERT (admin action). No customer-initiated notification creation. Prevents spam/abuse. |
| **Deduplication** | NONE REQUIRED — each transition is unique | `business_order_operations` is append-only immutable history. Each status transition creates exactly one row. No duplicate notifications possible. |
| **Migration rollback** | REVERSIBLE with caveats | `DROP TABLE notifications CASCADE` removes table. `DROP TRIGGER order_transition_notification` removes trigger. Existing `business_order_operations` rows unaffected. Notifications created during rollback window are lost (acceptable — notifications are transient, not customer data). |

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
- **No email status notifications** (verify `email_sent` and `email_failed` types are rejected by CHECK constraint)

**Rollback:**
- `DROP TABLE notifications CASCADE`
- `DROP TRIGGER order_transition_notification ON business_order_operations`
- `DROP FUNCTION notify_order_transition()`
- Remove notification UI components
- Revert to transient toast only
- No customer data loss (order history remains)

**Estimated effort:** 5-7 days

**Gates:**
- [ ] Slice 4 gates passed
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

### Slice 6: S02 Acceptance and Release Reconciliation

**Objective:** Close S02 with comprehensive acceptance testing and release documentation.

**Dependencies:** Slices 1–5 complete

**Actions:**
1. Execute full S02 acceptance test suite (all slices)
2. Verify production deployment readiness
3. Update all S02 documentation with final status
4. Create S02 release report
5. Obtain owner sign-off
6. Update Trello and Confluence (owner-executed)

**Deliverables:**
- `docs/s02-acceptance-report.md` — comprehensive test results
- `docs/s02-release-report.md` — release notes and deployment checklist
- Updated project memory with S02 closure

**Gates:**
- [ ] All S02 slices (1–5) gates passed
- [ ] Full test suite PASS (689 existing + all new tests)
- [ ] Staging acceptance complete
- [ ] Production deployment checklist reviewed
- [ ] Owner sign-off obtained
- [ ] Trello and Confluence updated

---

### Slices 7–14: Post-S02 Roadmap

**Slice 7: Engineering Foundation** — separate manifest required
**Slice 8: S03 Premium UI and Animations** — separate manifest required
**Slice 9: S04 Responsive and Accessibility Polish** — separate manifest required
**Slice 10: S05 Owner/Admin/Staff Platform** — separate manifest required
**Slice 11: S02-NEW-04 Authentication Expansion** — FORMALLY DEFERRED, separate manifest required
**Slice 12: S06 Payments** — separate manifest required
**Slice 13: S07 Full Web Acceptance** — separate manifest required
**Slice 14: S08 Mobile Handoff** — separate manifest required

---

## 5. Security and QA Acceptance Criteria

### Security audit summary

| Slice | SECURITY DEFINER functions | RLS policies | Concurrency concerns | Rollback complexity |
|---|---|---|---|---|
| 0 (closure) | NONE | NONE | NONE | NONE |
| 1 (currency) | NONE | NONE | NONE | LOW (restore files) |
| 2 (email) | NONE (CRON uses service_role) | NONE | LOW (idempotency keys) | LOW (disable CRON) |
| 3 (addresses) | 2 (enforce_default, enforce_max_5) | 1 (owner_all) | LOW (trigger serialization) | MEDIUM (DROP TABLE CASCADE) |
| 4 (timeline) | 1 (customer_order_history) | 0 (uses existing orders RLS) | NONE (read-only) | LOW (DROP FUNCTION) |
| 5 (notifications) | 4 (create, mark_read, count, notify_transition) | 2 (owner_read, owner_update) | LOW (insert-only) | MEDIUM (DROP TABLE CASCADE + trigger removal) |

**All SECURITY DEFINER functions include `SET search_path = public, pg_temp` to prevent search_path hijacking attacks.**

### QA strategy per slice

| Slice | Unit Tests | DOM Tests | SQL Tests | Integration Tests | Browser QA | Staging QA |
|---|---|---|---|---|---|---|
| 0 (closure) | N/A | N/A | N/A | N/A | N/A | N/A |
| 1 (currency) | UPDATE (remove selector) | DELETE (selector tests) | N/A | N/A | Verify NLE-only | Verify no regression |
| 2 (email 403 + CRON) | ADD (CRON) | N/A | N/A | ADD (retry flow) | Verify delivery | Verify CRON execution |
| 3 (addresses) | ADD (CRUD) | ADD (UI) | ADD (RLS, constraints) | ADD (checkout integration) | Verify picker | Verify add/edit/delete |
| 4 (timeline) | ADD (RPC) | ADD (UI) | ADD (ownership) | ADD (order detail integration) | Verify timeline | Verify with test orders |
| 5 (notifications) | ADD (RPC) | ADD (UI) | ADD (RLS, triggers) | ADD (Realtime integration) | Verify bell + inbox | Verify end-to-end |
| 6 (acceptance) | N/A | N/A | N/A | N/A | Full regression | Full acceptance |

---

## 6. Outstanding Owner Decisions

### Before any implementation

| # | Decision | Options | Recommendation | Slice |
|---|---|---|---|---|
| 1 | Sending domain selection | A: `send.najbuilds.com` / B: `mail.lumehouse.sl` / C: keep `onboarding@resend.dev` | A or B for production | 2 |
| 2 | CRON retry strategy | A: exponential backoff / B: fixed interval | A (industry best practice) | 2 |

### During implementation

| # | Decision | Options | Recommendation | Slice |
|---|---|---|---|---|
| 3 | Street address autocomplete | A: Google Places / B: Mapbox / C: defer (manual only) | C (Freetown-only, low complexity) | 3 |
| 4 | Notification preferences | A: all enabled / B: per-type opt-out / C: global on/off | A (can add later) | 5 |

### Post-S02 decisions (separate manifests)

| # | Decision | Options | Recommendation | Slice |
|---|---|---|---|---|
| 5 | Account linking (Google + email/password) | YES / NO / DEFER | DEFER (not in S02) | 11 |
| 6 | S03 premium UI scope | TBD | TBD | 8 |
| 7 | S04 responsive/accessibility scope | TBD | TBD | 9 |
| 8 | S05 admin platform scope | TBD | TBD | 10 |

---

## 7. Exact Proposed First Implementation Slice

### Slice 1: S02-05 Currency Simplification (Revised D1)

**Rationale for starting here:**
1. **Lowest risk** — no database changes, no SECURITY DEFINER functions, no RLS policies
2. **Minimal scope** — remove dropdown and disclosure only; keep locale detection and estimates
3. **Independent** — no dependencies on other S02 workstreams
4. **Fast** — 0.6 days estimated effort
5. **Reversible** — restore files from Git history if issues arise
6. **Confirms NLE-only** — aligns implementation with revised D1 decision (no manual selection)

**Pre-requisites (none — no owner decisions required)**

**Implementation plan:**
1. Rename `CurrencySelector.tsx` to `CurrencyEstimate.tsx`
2. Remove `CurrencySelector` (dropdown) and `CurrencyDisclosure` components from the file
3. Keep `CurrencyEstimate` component
4. Update `SiteFooter.tsx` to remove dropdown and disclosure imports/render
5. Update 5 import paths (checkout, cart, product pages)
6. Update tests (remove dropdown/disclosure tests, add revised D1 tests)
7. Create `docs/s02-05-currency-decisions.md`
8. Run full test suite
9. Run `tsc --noEmit` and `npm run build`
10. Submit PR for review

**Files affected:**
- `src/features/currency/CurrencySelector.tsx` → `src/features/currency/CurrencyEstimate.tsx` — RENAME
- `src/components/SiteFooter.tsx` — MODIFY (remove dropdown/disclosure)
- `src/features/checkout/CheckoutPage.tsx` — MODIFY (update import path)
- `src/features/checkout/OrderSummary.tsx` — MODIFY (update import path)
- `src/features/cart/CartPage.tsx` — MODIFY (update import path)
- `src/features/products/ShopPage.tsx` — MODIFY (update import path)
- `src/features/products/ProductDetailsPage.tsx` — MODIFY (update import path)
- `tests/currency-dom.test.mjs` — MODIFY (remove dropdown tests, add revised D1 tests)
- `tests/currency-presentation-dom.test.mjs` — MODIFY (remove disclosure tests)
- `docs/s02-05-currency-decisions.md` — CREATE

**Files NOT modified:**
- `CurrencyProvider.tsx`, `useCurrency.ts`, `CurrencyContext.ts`, `localeCurrency.ts`, `currency.ts` — all retained
- `src/main.tsx` — CurrencyProvider wrapper retained
- All checkout/cart/order logic — NLE enforcement retained

**Testing requirements:**
- Remove ~23 tests (dropdown and disclosure)
- Add ~6 tests (revised D1 verification)
- Keep ~666 tests (locale detection, estimate display, NLE formatting)
- Total after Slice 1: ~672 tests (all must PASS)
- Verify no dropdown in footer
- Verify estimate shows for GNF/GHS/NGN/USD locales
- Verify no estimate for NLE locale
- Verify checkout still enforces NLE
- Verify no console errors

**Rollback plan:**
- Restore file name (`CurrencyEstimate.tsx` → `CurrencySelector.tsx`)
- Re-add `CurrencySelector` and `CurrencyDisclosure` components
- Revert import path changes
- Revert test changes
- Time: 15 minutes

**Success criteria:**
- Currency dropdown removed from footer
- Currency disclosure removed from footer
- Currency estimate still shows underneath NLE prices (≈ GNF X)
- Automatic locale detection works (GN → GNF, GH → GHS, etc.)
- No references to manual currency selection in codebase
- `formatMoney()` still works (NLE formatting)
- Checkout still enforces NLE
- All tests PASS (~672 tests)
- TypeScript clean
- Build successful
- No console errors

**Owner approval request:**

> **Owner approval requested for S02-05 Slice 1: Currency Simplification (Revised D1)**
>
> **Objective:** Remove manual currency dropdown and disclosure; preserve automatic locale detection and informational estimates; confirm NLE-only transactional currency.
>
> **Revised D1 decision:** Remove manual currency selection while preserving automatic informational conversion. NLE is primary; browser locale auto-detects regional currency; "≈ GNF X" estimate shown underneath NLE prices; no dropdown; checkout NLE-only.
>
> **Pre-requisites:** None.
>
> **Scope:** Rename file, remove dropdown/disclosure components, keep estimate component, update imports, update tests, document decisions.
>
> **Out of scope:** Changes to locale detection logic, rate loading, conversion, checkout, orders, admin-managed exchange rates, multi-currency checkout.
>
> **Estimated effort:** 0.6 days (4.75 hours)
>
> **Risk level:** LOW (minimal changes, no logic modifications, no database changes, fully reversible)
>
> **Rollback:** Restore file name and components from Git history (15 minutes)
>
> **Testing:** Remove ~23 tests, add ~6 tests, keep ~666 tests, verify ~672 tests PASS
>
> **Deliverable:** NLE-only storefront with automatic locale detection and informational estimates (no manual selection)
>
> **Next step:** After Slice 1 approval and completion, request approval for Slice 2 (S02-06 email investigation)
>
> **Approve Slice 1 (Revised D1)?** [ ] YES [ ] NO
>
> **Comments:** _______________

---

## 8. Execution Governance

### Sequential slice enforcement

- **No parallel implementation.** Each slice must pass all gates before the next slice begins.
- **Owner approval required** for every slice (gates in §4).
- **Independent review required** for every slice with code changes (Slices 1–6).
- **Staging verification required** for every slice with hosted impact (Slices 2–6).

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
| Owner approval | Explicit owner sign-off (for every slice) | Comment in PR or comment |

### Rollback strategy per slice

| Slice | Rollback action | Time | Data loss |
|---|---|---|---|
| 0 (closure) | N/A | N/A | N/A |
| 1 (currency) | Restore deleted files from Git | 15 min | NONE |
| 2 (email) | Revert `RESEND_FROM` + disable CRON | 5 min | NONE (existing jobs unaffected) |
| 3 (addresses) | `DROP TABLE addresses CASCADE` | 15 min | LOW (addresses are convenience) |
| 4 (timeline) | `DROP FUNCTION customer_order_history` | 5 min | NONE (history table remains) |
| 5 (notifications) | `DROP TABLE notifications CASCADE` + remove trigger | 20 min | LOW (notifications are transient) |

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
| S02-05 Currency | **SIMPLIFY** | Remove dropdown/disclosure, keep locale detection and estimates | 0.6 days | LOW |
| S02-06 Email | **INVESTIGATE + IMPLEMENT** | 403 investigation → verified domain → CRON retry | 3-6 days | MEDIUM |
| S02-NEW-01 Saved Addresses | **IMPLEMENT** | Max 5, labels, manual entry | 3-4 days | MEDIUM |
| S02-NEW-02 Order Timeline | **IMPLEMENT** | Customer-visible statuses + timestamps | 2-3 days | LOW–MEDIUM |
| S02-04 Notifications | **IMPLEMENT** | Order lifecycle, bell, inbox, unread count | 5-7 days | MEDIUM |
| S02 Acceptance | **CLOSE** | Acceptance testing and release documentation | 2-3 days | LOW |
| S02-NEW-04 Authentication | **DEFERRED** | Email/password expansion | TBD (position 12) | TBD |

**Total estimated S02 effort:** 15.6-23.6 days (sequential execution, excluding deferred authentication)

---

## Appendix B: Test Coverage Summary

| Workstream | Existing Test Lines | New Tests Needed |
|---|---|---|
| S02-NEW-03 | 4,658 lines (10 files) | None |
| S02-05 | 1,354 lines (5 files) | MODIFY (remove ~23 dropdown/disclosure tests, add ~6 revised D1 tests) |
| S02-06 | ~500 lines (5+ files) | ~200 lines (CRON, delivery) |
| S02-NEW-01 | 2,974 lines (4 files) | ~600 lines (address CRUD, RLS, UI) |
| S02-NEW-02 | 1,333 lines (7 files) | ~450 lines (timeline UI, RPC) |
| S02-04 | 573 lines (1 file) | ~800 lines (persistent notifications, Realtime) |

**Total existing tests:** ~11,392 lines (~689 tests)
**Total test changes for Slice 1:** MODIFY ~29 tests (remove 23, add 6), net ~672 tests after Slice 1
**Total new tests needed (Slices 2-5):** ~2,050 lines

---

## Appendix C: Migration Summary

| Workstream | New Migrations | Schema Changes | SECURITY DEFINER functions |
|---|---|---|---|
| S02-NEW-03 | None | None | None |
| S02-05 | None | None | None |
| S02-06 | None (CRON function only) | None | None (CRON uses service_role) |
| S02-NEW-01 | 1 (`saved_addresses`) | New `addresses` table + `profiles.default_address_id` | 2 (`enforce_one_default_address`, `enforce_max_five_addresses`) |
| S02-NEW-02 | 1 (`customer_order_history`) | New RPC function | 1 (`customer_order_history`) |
| S02-04 | 1 (`notifications`) | New `notifications` table + triggers | 4 (`create_notification`, `mark_notification_read`, `count_unread_notifications`, `notify_order_transition`) |

**Total new migrations:** 3
**Total new tables:** 2 (`addresses`, `notifications`)
**Total new SECURITY DEFINER functions:** 7 (all with `SET search_path = public, pg_temp`)
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
6. **SET search_path = public, pg_temp:** All SECURITY DEFINER functions explicitly set search_path to prevent search_path hijacking attacks.

**Function-by-function audit:**

| Function | Risk | Ownership check | Input validation | Grant | search_path |
|---|---|---|---|---|---|
| `enforce_one_default_address()` | MEDIUM | Implicit (trigger on user's own insert/update) | CHECK constraints on `addresses` | N/A (trigger) | SET |
| `enforce_max_five_addresses()` | MEDIUM | Implicit (trigger on user's own insert) | CHECK constraints on `addresses` | N/A (trigger) | SET |
| `customer_order_history(p_order_id)` | MEDIUM | `WHERE user_id = auth.uid()` on `orders` table | `p_order_id` is UUID type | `authenticated` | SET |
| `create_notification(p_user_id, p_type, p_title, p_body, p_order_id)` | HIGH | N/A (service_role only) | CHECK constraints on `notifications`, `p_type` IN (...) | `service_role` | SET |
| `mark_notification_read(p_notification_id)` | MEDIUM | `WHERE user_id = auth.uid()` | `p_notification_id` is UUID type | `authenticated` | SET |
| `count_unread_notifications()` | LOW | `WHERE user_id = auth.uid()` | No input parameters | `authenticated` | SET |
| `notify_order_transition()` | MEDIUM | Reads `orders.user_id` (trusted) | Trigger on `business_order_operations` (admin-only) | N/A (trigger) | SET |

**Concurrency concerns:**

- **Trigger serialization:** PostgreSQL serializes trigger execution per-row. Two simultaneous inserts to `addresses` by the same user will not race on the max-5 check.
- **Notification creation:** Multiple order transitions can fire simultaneously, but each inserts a new row. No race conditions.
- **Idempotency:** Email CRON retry uses existing idempotency keys (`lume-order-confirmation-v1-{order.id}`). No duplicate sends.

**Rollback concerns:**

- **DROP TABLE CASCADE:** Removes table and all dependent objects (foreign keys, indexes, triggers). Existing data is lost.
- **DROP FUNCTION:** Removes function only. No data loss.
- **Trigger removal:** `DROP TRIGGER` removes trigger. Existing data unaffected.

**Recommendation:** All SECURITY DEFINER functions in this plan are acceptable with the mitigations applied. High-risk functions (`create_notification`) are granted to `service_role` only, not `authenticated`. All functions include `SET search_path = public, pg_temp` to prevent search_path hijacking.

---

## Appendix E: S02 Acceptance and Release Gate Matrix

### Gate definitions

| Gate | Description | Evidence Required | Responsible |
|---|---|---|---|
| **G1: Local QA** | All tests pass locally before PR submission | `npm test` output (689 existing + new tests PASS), `tsc --noEmit` clean, `npm run build` clean, `npm run lint` clean | Implementer |
| **G2: Independent Review** | Code review by non-author before merge | PR approval from reviewer, review comments addressed | Reviewer |
| **G3: SQL/RLS Verification** | Database schema and security policies verified | SQL test output (`supabase/tests/*.sql`), RLS policy audit, SECURITY DEFINER function review | Implementer + Reviewer |
| **G4: Staging Acceptance** | Manual testing on staging Vercel preview | Staging QA report (`docs/s02-XX-staging-qa.md`), screenshots, test order IDs (if applicable) | Owner + QA |
| **G5: Production Release** | Migration applied, Edge Functions deployed, Vercel deployed | Migration ledger verification, Edge Function deployment logs, Vercel deployment status | Owner |
| **G6: Production Smoke Test** | Verify production works after deployment | Smoke test report, test order placed (if applicable), email delivery verified (if applicable) | Owner |
| **G7: Owner Sign-off** | Explicit owner approval for slice completion | Comment in PR or chat: "Slice X approved" | Owner |
| **G8: Trello/Confluence Closure** | Update external trackers with completion status | Trello card moved to "Done", Confluence page updated with release notes | Owner |

### Gate matrix per slice

| Slice | G1 Local QA | G2 Review | G3 SQL/RLS | G4 Staging | G5 Production | G6 Smoke | G7 Sign-off | G8 Trackers |
|---|---|---|---|---|---|---|---|---|
| 0 (closure) | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| 1 (currency) | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2 (email) | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3 (addresses) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 4 (timeline) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 5 (notifications) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 6 (acceptance) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Legend:** ✓ = Required, — = Not applicable, N/A = No implementation

### Minimum evidence per gate

#### G1: Local QA

**Required for all slices with code changes (1–6):**

- [ ] `npm test` exits 0 with all tests PASS
- [ ] Test count: 689 existing + new tests (report exact count)
- [ ] `tsc --noEmit` exits 0 (no TypeScript errors)
- [ ] `npm run build` exits 0 (build successful)
- [ ] `npm run lint` exits 0 (no lint errors)
- [ ] `git diff --check` exits 0 (no whitespace errors)
- [ ] No console errors in browser dev tools (for UI changes)

**Evidence format:** CI output logs, terminal screenshots

#### G2: Independent Review

**Required for all slices with code changes (1–6):**

- [ ] PR created with descriptive title and body
- [ ] PR body includes: objective, scope, files changed, test coverage, rollback plan
- [ ] At least one non-author reviewer assigned
- [ ] Reviewer approves PR (no unresolved comments)
- [ ] Reviewer verifies: code quality, test coverage, security, accessibility
- [ ] All review comments addressed before merge

**Evidence format:** PR approval, review comments

#### G3: SQL/RLS Verification

**Required for slices with database changes (3, 4, 5):**

- [ ] Migration file reviewed for:
  - [ ] Correct table/column names
  - [ ] Appropriate data types and constraints
  - [ ] CHECK constraints match business rules
  - [ ] Foreign keys with correct ON DELETE behavior
  - [ ] Indexes for performance
- [ ] RLS policies reviewed for:
  - [ ] `ENABLE ROW LEVEL SECURITY` on new tables
  - [ ] `REVOKE ALL` from public/anon/authenticated
  - [ ] `GRANT` only to required roles
  - [ ] `USING (user_id = auth.uid())` for owner-scoped access
  - [ ] `WITH CHECK (user_id = auth.uid())` for write operations
- [ ] SECURITY DEFINER functions reviewed for:
  - [ ] Explicit `auth.uid()` ownership checks
  - [ ] `SET search_path = public, pg_temp` to prevent hijacking
  - [ ] Minimal privilege (granted to `authenticated` or `service_role` only)
  - [ ] No dynamic SQL or string concatenation
  - [ ] No external API calls
- [ ] SQL tests pass:
  - [ ] `supabase/tests/*.sql` executes successfully
  - [ ] RLS ownership tests (cross-user access denied)
  - [ ] Constraint tests (CHECK, UNIQUE, foreign key)
  - [ ] Concurrency tests (if applicable)
- [ ] Migration rollback tested:
  - [ ] `DROP TABLE` / `DROP FUNCTION` / `DROP TRIGGER` commands documented
  - [ ] Rollback does not cause customer data loss
  - [ ] Rollback time estimated

**Evidence format:** SQL test output, migration review comments, rollback documentation

#### G4: Staging Acceptance

**Required for all slices with hosted impact (1–6):**

- [ ] Staging environment verified:
  - [ ] Vercel preview URL accessible
  - [ ] Supabase staging project (`gscihjjwhmvddrmcfpxp`) used (NOT production)
  - [ ] Migration applied to staging (if applicable)
  - [ ] Edge Functions deployed to staging (if applicable)
- [ ] Manual testing completed:
  - [ ] All acceptance criteria from slice plan verified
  - [ ] Happy path tested (normal user flow)
  - [ ] Edge cases tested (error conditions, boundary values)
  - [ ] Accessibility tested (keyboard navigation, screen reader, ARIA labels)
  - [ ] Mobile responsiveness tested (320px minimum width)
  - [ ] Cross-browser tested (Chrome, Firefox, Safari, Edge — last 2 versions)
- [ ] Test data documented:
  - [ ] Test account(s) used (staging only, never production)
  - [ ] Test order IDs (if applicable)
  - [ ] Test email addresses (if applicable)
- [ ] Screenshots captured:
  - [ ] UI changes visible in screenshots
  - [ ] Error states captured (if applicable)
  - [ ] Mobile view captured (if applicable)

**Evidence format:** Staging QA report (`docs/s02-XX-staging-qa.md`), screenshots, test data

#### G5: Production Release

**Required for all slices (1–6):**

- [ ] Pre-release checklist:
  - [ ] All gates (G1–G4) passed
  - [ ] Owner sign-off obtained (G7)
  - [ ] Migration file reviewed and approved (if applicable)
  - [ ] Edge Function code reviewed (if applicable)
  - [ ] Environment variables documented (if applicable)
- [ ] Release sequence (for slices with database changes):
  - [ ] Migration applied to production (`wyvsbzcltrhnjeuijsva`)
  - [ ] Migration verified in production ledger
  - [ ] Edge Functions deployed to production
  - [ ] Vercel production deployment triggered
  - [ ] Environment variables updated (if applicable)
- [ ] Release sequence (for slices without database changes):
  - [ ] PR merged to main
  - [ ] Vercel production deployment triggered
  - [ ] Deployment verified successful

**Evidence format:** Migration ledger screenshot, Edge Function deployment logs, Vercel deployment status

#### G6: Production Smoke Test

**Required for all slices (1–6):**

- [ ] Production environment verified:
  - [ ] Production URL accessible (`https://lume-house-delta.vercel.app`)
  - [ ] No console errors in browser dev tools
  - [ ] Page load time acceptable (< 3 seconds)
- [ ] Happy path tested:
  - [ ] Core functionality works (per slice)
  - [ ] No regressions in existing features
  - [ ] Test transaction completed (if applicable)
- [ ] Email delivery tested (if applicable):
  - [ ] Test email sent from production
  - [ ] Email received (check inbox AND spam folder)
  - [ ] Email content correct
- [ ] Monitoring verified:
  - [ ] No error spikes in Vercel analytics
  - [ ] No error spikes in Supabase logs
  - [ ] No error spikes in Resend dashboard (if applicable)

**Evidence format:** Smoke test report, screenshots, test transaction IDs

#### G7: Owner Sign-off

**Required for all slices (1–6):**

- [ ] Owner explicitly approves slice completion
- [ ] Approval documented in:
  - [ ] PR comment: "Slice X approved" OR
  - [ ] Chat message: "Slice X approved" OR
  - [ ] Email: "Slice X approved"
- [ ] Owner confirms:
  - [ ] All acceptance criteria met
  - [ ] No outstanding issues
  - [ ] Ready for next slice

**Evidence format:** Owner approval comment/message

#### G8: Trello/Confluence Closure

**Required for all slices (1–6):**

- [ ] Trello card updated:
  - [ ] Card moved to "Done" column
  - [ ] Card description updated with completion date
  - [ ] Card comments updated with PR link
- [ ] Confluence page updated:
  - [ ] Release notes added
  - [ ] Slice report linked
  - [ ] Status updated to "Complete"
- [ ] Project memory updated:
  - [ ] Slice closure notation added
  - [ ] Lessons learned documented (if applicable)

**Evidence format:** Trello card screenshot, Confluence page link

### Known QA exceptions (preserve, do not report as passed)

| Exception | Slice | Reason | Status |
|---|---|---|---|
| W4 Scenarios 11, 17 not run at runtime | S02-01 (closed) | Browser automation security constraints | Code review PASS, owner-accepted gap |
| W4 Scenarios 5, 6 not executed | S02-01 (closed) | Mobile APK not available | NOT EXECUTED |
| W4 Scenarios 8, 10, 12–16 unrecoverable | S02-01 (closed) | Original matrix not persisted | NEEDS RECONCILIATION |
| Staging email testing blocked | S02-06 | `RESEND_API_KEY` absent on staging | EXPECTED (email_status: "queued") |
| Local SQL harness not run | All | Docker daemon not running | Tests evidenced by automated suite |

### S02 acceptance criteria (Slice 6)

**All S02 slices (1–5) must pass:**

- [ ] Slice 1 (currency): All gates passed, NLE-only implementation verified
- [ ] Slice 2 (email): All gates passed, 403 resolved, verified domain working, CRON retry tested
- [ ] Slice 3 (addresses): All gates passed, max 5 enforced, labels working, checkout integration verified
- [ ] Slice 4 (timeline): All gates passed, customer timeline rendering, ownership isolation verified
- [ ] Slice 5 (notifications): All gates passed, bell icon working, inbox rendering, Realtime delivery verified

**Full regression test:**

- [ ] All 689 existing tests PASS
- [ ] All new tests PASS (report exact count)
- [ ] No regressions in S02-01 country enforcement
- [ ] No regressions in S02-02 unsupported-country feedback
- [ ] No regressions in S02-03 checkout/cart/ownership
- [ ] No regressions in S02-NEW-03 guest continuity

**Production readiness:**

- [ ] All migrations applied to production
- [ ] All Edge Functions deployed to production
- [ ] Vercel production deployment successful
- [ ] Production smoke test passed
- [ ] No critical bugs outstanding
- [ ] Owner sign-off obtained

**Documentation:**

- [ ] `docs/s02-acceptance-report.md` created with full test results
- [ ] `docs/s02-release-report.md` created with release notes
- [ ] All slice reports linked
- [ ] Project memory updated with S02 closure

**External trackers:**

- [ ] Trello: All S02 cards moved to "Done"
- [ ] Confluence: S02 release page updated
- [ ] GitHub: S02 milestone closed (if applicable)

---

**End of S02 Consolidated Execution Manifest v2.1.**

**Next step:** Owner review and approval request for Slice 1 (S02-05 currency simplification).

**Status:** S02 MANIFEST v2.1 READY FOR OWNER REVIEW
