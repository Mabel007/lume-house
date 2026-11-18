# S02 Consolidated Execution Manifest

**SUPERSEDED by v2.0** — See `docs/S02-consolidated-execution-manifest-v2.md`

**Supersession date:** 2026-11-03
**Reason:** v2.0 incorporates six owner-approved planning decisions (D1–D6), adds S02-NEW-04 authentication (not deferred), includes SQL security audit, and defines sequential slice execution with gates.

---

**Date:** 2026-11-03  
**Branch:** `feat/lume-web-s02-country-enforcement`  
**HEAD:** `eb035f96f91acfe65a0ccbfe47c807b75ff7fc4f`  
**Mode:** Phase A — Read-only discovery complete. Awaiting owner approval for Phase B.

---

## 1. Verified Repository Baseline

| Item | Value |
|---|---|
| Current branch | `feat/lume-web-s02-country-enforcement` |
| HEAD SHA | `eb035f96f91acfe65a0ccbfe47c807b75ff7fc4f` |
| Modified tracked files | `docs/s02-01-country-qa-matrix.md` (from previous session) |
| Untracked files | `docs/S02-NEW-04-authentication-discovery-report.md` |
| Existing worktrees | 8 (admin, direct-order, catalog, fulfilment, staff-access, invitations, role-foundation, b3-three-role, s02-country) |
| Test suite | 689/689 PASS |
| TypeScript | Clean (`tsc --noEmit`) |
| Vite build | Successful (838.52 kB) |

### Closed workstreams (do not reopen)

| Workstream | Status | Evidence |
|---|---|---|
| S02-01 Country enforcement | RELEASED | PR #21 merged, W4 executed, production schema deployed |
| S02-02 Unsupported-country feedback | COMPLETE | Code audit + 53 DOM tests + 18 order tests PASS |
| S02-03 Checkout, cart, ownership | COMPLETE | 689 tests PASS, RLS verified |

---

## 2. Six-Workstream Current-State Matrix

### S02-04 Notifications

| Area | Classification | Evidence |
|---|---|---|
| Transient toast (BagNotice) | **IMPLEMENTED** | `src/components/BagNotice.tsx` (187 lines), `NotificationProvider.tsx` (158 lines) |
| Session-scoped toast isolation | **IMPLEMENTED** | `NotificationProvider.tsx:34,42,53` — owner + generation tracking |
| Route-scoped toast lifecycle | **IMPLEMENTED** | `NotificationProvider.tsx:85-86` — stale notifiers rejected |
| Accessibility (ARIA live, focus) | **IMPLEMENTED** | `BagNotice.tsx:169-184` — polite/assertive regions, focus management |
| Test coverage | **IMPLEMENTED** | `tests/notification-ui-dom.test.mjs` (573 lines, 22 tests) |
| Bell icon in header | **MISSING** | Not in `Layout.tsx:91-128` |
| Notification dropdown/popover | **MISSING** | No component exists |
| Inbox page | **MISSING** | No `/account/notifications` route |
| Unread count tracking | **MISSING** | No persistent count |
| Notification database table | **MISSING** | No `notifications` table in any migration |
| RLS policies for notifications | **MISSING** | No table to protect |
| RPC functions for notifications | **MISSING** | None exist |
| Order-event notifications | **MISSING** | Only cart/profile toasts; no order lifecycle events |
| Realtime subscription | **MISSING** | No Supabase Realtime channels subscribed |

### S02-05 Currency

| Area | Classification | Evidence |
|---|---|---|
| NLE authoritative currency | **IMPLEMENTED** | `src/config/shop.ts:2`, `src/features/currency/currency.ts:6` |
| Currency display components | **IMPLEMENTED** | `CurrencySelector.tsx`, `CurrencyEstimate`, `CurrencyDisclosure` |
| Currency formatting utilities | **IMPLEMENTED** | `shop.ts:6-9` — `formatMoney()` with `Intl.NumberFormat` |
| NLE minor unit handling | **IMPLEMENTED** | Integer minor units everywhere, 100 per NLE |
| Exchange rate fetching | **IMPLEMENTED** | Frankfurter v2 API, 15-min revalidation, 24h cache TTL |
| Display-only conversion | **IMPLEMENTED** | `currency.ts:135-171` — `convertMinorUnits()`, `estimateFor()` |
| Locale-based auto-detection | **IMPLEMENTED** | `localeCurrency.ts` — browser region subtag mapping |
| Currency preference persistence | **IMPLEMENTED** | localStorage `lume:currency` |
| Checkout NLE enforcement | **IMPLEMENTED** | Server hardcodes NLE, schema CHECK constraints |
| Order currency (NLE-only) | **IMPLEMENTED** | `orders.ts:27` validates `currency === 'NLE'` |
| Database NLE lock | **IMPLEMENTED** | CHECK constraints in migrations 00200, 00700 |
| Currency selector UI | **IMPLEMENTED** | Footer-hosted `<select>` with 5 options |
| Test coverage | **IMPLEMENTED** | 1,354 lines across 5 test files |
| Server-side exchange rate storage | **MISSING** | Rates are client-side localStorage only |
| Admin-managed exchange rates | **MISSING** | No admin UI or API |
| Multi-currency order placement | **MISSING** | Architecturally excluded by design |
| Historical rate tracking | **MISSING** | No audit trail |

### S02-06 Email

| Area | Classification | Evidence |
|---|---|---|
| Resend API integration | **IMPLEMENTED** | `supabase/functions/_shared/email.ts:35-45` |
| Email templates (HTML + text) | **IMPLEMENTED** | `email.ts:15-33` — responsive table-layout |
| Order confirmation trigger | **IMPLEMENTED** | `confirmation.ts:1-29` — `deliverConfirmation()` |
| Manual retry endpoint | **IMPLEMENTED** | `order-email` Edge Function |
| Idempotency keys | **IMPLEMENTED** | `email.ts:38` — `lume-order-confirmation-v1-{order.id}` |
| Lease-based claim/finish | **IMPLEMENTED** | `claim_order_confirmation`, `finish_order_confirmation` RPCs |
| Database job queue | **IMPLEMENTED** | `order_confirmation_jobs` table |
| API key security | **IMPLEMENTED** | Edge Function env only, never in client |
| No secret leakage | **IMPLEMENTED** | `tests/orders.test.mjs:152-158` |
| Test coverage | **IMPLEMENTED** | Comprehensive across 5+ test files |
| Automated retry worker / CRON | **MISSING** | No scheduled function; retry is manual only |
| Verified sending domain | **MISSING** | Default `onboarding@resend.dev` (testing only) |
| SPF/DKIM/DMARC | **MISSING** | No DNS authentication records |
| Delivery webhooks/tracking | **MISSING** | `provider_message_id` stored but never updated |
| Admin email management UI | **MISSING** | No interface to view/retry failed emails |
| Staging email testing | **BLOCKED** | `RESEND_API_KEY` intentionally absent on staging |

### S02-NEW-01 Saved Addresses

| Area | Classification | Evidence |
|---|---|---|
| Profile table schema | **IMPLEMENTED** | `20261002000200` — single row per user, 3 address fields |
| Profile CRUD operations | **IMPLEMENTED** | `profile.ts:24-34` — upsert with 23505 fallback |
| Profile UI components | **IMPLEMENTED** | `AccountExperience.tsx:44-55` — full form with fieldsets |
| Profile-to-checkout defaults | **IMPLEMENTED** | `profileDefaults.ts` — one-way copy on mount |
| Checkout address collection | **IMPLEMENTED** | `CheckoutPage.tsx:431-460` — independent form fields |
| Checkout address validation | **IMPLEMENTED** | Client + trusted SQL, city/zone/blank checks |
| Order address snapshot | **IMPLEMENTED** | Immutable columns, CHECK constraints, trigger protection |
| RLS and ownership | **IMPLEMENTED** | `auth.uid()` in all policies, column-level grants |
| Country autocomplete | **IMPLEMENTED** | `CountryCombobox.tsx` (308 lines, 249 countries) |
| Test coverage | **IMPLEMENTED** | ~2,974 lines across TS unit, DOM, and SQL tests |
| Multiple saved addresses | **MISSING** | No `addresses` table, no multi-address support |
| Address management UI | **MISSING** | No add/edit/delete/list UI |
| Address selection at checkout | **MISSING** | No picker/dropdown for saved addresses |
| Address labels (Home/Work) | **MISSING** | No labeling system |
| "Save checkout address to profile" | **MISSING** | Checkout explicitly does NOT update profile |
| Street address autocomplete | **MISSING** | No geocoding/place-search |

### S02-NEW-02 Order Timeline

| Area | Classification | Evidence |
|---|---|---|
| Order status values & constraints | **IMPLEMENTED** | 7 operational + 4 payment states, DB-enforced |
| Status transition logic | **IMPLEMENTED** | Frontend map + SQL validator + admin RPC |
| Status display components | **IMPLEMENTED** | Pills in OrderSnapshot, OrderHistory, AdminOrderList |
| My Orders page | **IMPLEMENTED** | Paginated, RLS-scoped, status pills |
| Order Details page | **IMPLEMENTED** | Full snapshot, cancellation, email retry |
| Status history table | **IMPLEMENTED** | `business_order_operations` — immutable, audited |
| Order creation RPCs | **IMPLEMENTED** | 3 place_order variants |
| Status update RPC | **IMPLEMENTED** | `admin_transition_order` with optimistic locking |
| Admin timeline UI | **IMPLEMENTED** | `OrderTimeline.tsx` / `AdminOrderTimeline` |
| Payment status independence | **IMPLEMENTED** | Never changes through operations |
| Fulfillment metadata | **IMPLEMENTED** | Admin-only carrier/tracking with versioned history |
| Test coverage | **IMPLEMENTED** | 1,333 total test lines across 7 files |
| Customer timeline UI | **MISSING** | No progress indicator or history view |
| Customer history RPC | **MISSING** | No customer-scoped query for `business_order_operations` |
| Real-time status updates | **MISSING** | No Supabase Realtime subscriptions |
| Status notification triggers | **MISSING** | No transition-triggered emails/notifications |

### S02-NEW-03 Guest Continuity

| Area | Classification | Evidence |
|---|---|---|
| Guest cart storage (sessionStorage) | **IMPLEMENTED** | `CartProvider.tsx:16-17,54` |
| Guest cart state management | **IMPLEMENTED** | `guestCart.ts` — serialization, validation, dedup |
| Cart merge on authentication | **IMPLEMENTED** | `CartProvider.tsx:86-98` — server-side RPC with receipts |
| Checkout intent preservation | **IMPLEMENTED** | `customerAuthIntent.ts`, `directIntent.ts` |
| Return URL storage/restoration | **IMPLEMENTED** | `CustomerRoutes.tsx:10-15` — AuthCallback |
| Direct checkout (Buy Now) intent | **IMPLEMENTED** | `DirectCheckoutPage.tsx:12-27` — owner binding |
| Cross-tab auth state sync | **IMPLEMENTED** | Supabase localStorage + onAuthStateChange |
| Cross-tab checkout coordination | **IMPLEMENTED** | Web Locks API — `checkoutAttempt.ts:83-93` |
| Guest session persistence | **IMPLEMENTED** | sessionStorage survives reload, lost on tab close |
| Authenticated session restoration | **IMPLEMENTED** | `auth.ts:2-15` — getSession + generation tracking |
| Session expiry handling | **IMPLEMENTED** | Auto-refresh + error states |
| Cart ownership (auth.uid()) | **IMPLEMENTED** | Full RLS in migrations 00100, 00800 |
| Merge ownership transfer | **IMPLEMENTED** | Atomic within RPC transaction |
| Test coverage | **ALREADY VERIFIED** | 4,658 lines across 10 test files (S02-03 audit) |

**S02-NEW-03 Recommendation: CLOSE WITHOUT NEW IMPLEMENTATION.** All guest-to-authenticated continuity requirements are fully implemented and comprehensively tested for the current Google OAuth model. Gaps (email/password auth, phone OTP, account linking) belong to S02-NEW-04 or are intentional design decisions.

---

## 3. Shared Dependency Graph

```
S02-05 Currency (independent — no dependencies on other S02 workstreams)
    ↓
    (no downstream dependencies)

S02-06 Email (independent — notification system could use it later)
    ↓
    (no downstream dependencies within S02)

S02-NEW-01 Saved Addresses (independent — profile schema already exists)
    ↓
    (no downstream dependencies)

S02-NEW-02 Order Timeline (independent — status infrastructure already exists)
    ↓
    S02-04 Notifications (could trigger notifications on status changes)

S02-04 Notifications (depends on S02-06 for email notifications, S02-NEW-02 for order events)
    ↓
    (no downstream dependencies)

S02-NEW-03 Guest Continuity (CLOSE — already complete)
```

### Shared infrastructure

| Component | Used by |
|---|---|
| `NotificationProvider` / `useNotifications()` | S02-04 (extend), all current toast callers |
| `order_confirmation_jobs` table | S02-06 (existing), S02-04 (could add notification events) |
| `business_order_operations` table | S02-NEW-02 (existing), S02-04 (event source) |
| `profiles` table | S02-NEW-01 (existing), S02-04 (notification preferences) |
| `orders` table | S02-NEW-02 (existing), S02-04 (event source) |
| `CartProvider` / guest cart | S02-NEW-03 (existing, close) |
| Frankfurter API | S02-05 (existing) |
| Resend API | S02-06 (existing) |

### Database migration dependencies

| Migration | Used by |
|---|---|
| `20261002000100_commerce_foundation` | All workstreams (orders, carts, RLS) |
| `20261002000200_lume_house_foundation` | S02-NEW-01 (profiles), S02-NEW-02 (orders) |
| `20261002000400_atomic_checkout_email` | S02-06 (email jobs) |
| `20261005000800_variant_bag_checkout` | S02-NEW-03 (cart merge) |
| `20261006001400_admin_orders` | S02-NEW-02 (status history) |
| `20261023002900_order_delivery_country` | S02-01 (closed) |

### Edge Function dependencies

| Function | Used by |
|---|---|
| `place-order` | S02-06 (email trigger) |
| `place-direct-order` | S02-06 (email trigger) |
| `order-email` | S02-06 (manual retry) |
| `product-media` | None (independent) |

---

## 4. Proposed Slice Order and Execution Manifest

### Implementation order rationale

1. **S02-NEW-03** — Close without implementation (already complete)
2. **S02-05** — Independent, no dependencies, low risk
3. **S02-06** — Independent, configuration-heavy, low code risk
4. **S02-NEW-01** — Independent, extends existing profile schema
5. **S02-NEW-02** — Independent, extends existing order infrastructure
6. **S02-04** — Depends on S02-NEW-02 (order events), S02-06 (email notifications)

### Slice execution manifest

#### Slice 1: S02-NEW-03 Closure (no implementation)

**Objective:** Document that guest continuity is complete and close the workstream.

**Actions:**
- Update project memory with closure notation
- No code changes
- No new tests
- No migration
- No deployment

**Deliverable:** Closure notation in memory and documentation

**Estimated effort:** 0.5 hours

---

#### Slice 2: S02-05 Currency — Decision documentation

**Objective:** Document pending decisions for currency expansion. No implementation.

**Actions:**
- Document current state (NLE authoritative, display estimates via Frankfurter)
- List pending decisions:
  - Automatic location-based switching (current: browser locale only)
  - Admin-managed exchange rates (current: third-party API only)
  - Multi-currency checkout (current: architecturally excluded)
  - New estimate currencies (current: hardcoded array)
- No code changes
- No migration
- No deployment

**Deliverable:** Decision documentation in `docs/s02-05-currency-decisions.md`

**Estimated effort:** 2 hours

---

#### Slice 3: S02-06 Email — Verified domain and automated retry

**Objective:** Resolve email delivery limitations and add automated retry.

**Dependencies:** None

**Actions:**
1. Configure verified sending domain (owner decision: `send.najbuilds.com` or `mail.lumehouse.sl`)
2. Set up DNS records (SPF, DKIM, DMARC)
3. Update `RESEND_FROM` environment variable
4. Implement Supabase CRON function for automated retry
5. Add admin email management interface (optional)

**Files affected:**
- `supabase/functions/_shared/confirmation.ts` (no changes — already supports `RESEND_FROM`)
- `supabase/config.toml` (add CRON configuration)
- New migration for CRON function (if needed)
- Supabase dashboard configuration (manual)

**Security considerations:**
- DNS records must be configured correctly
- CRON function must use service-role key securely
- No API key exposure in logs or client code

**Test coverage:**
- Existing email tests remain valid
- Add CRON function tests
- Add delivery status tracking tests (if implemented)

**Rollback strategy:**
- Revert `RESEND_FROM` to default
- Disable CRON function
- No database changes to rollback

**Estimated effort:** 1-2 days

**Owner decisions required:**
- Sending domain selection
- Whether to implement admin email management UI
- CRON retry interval and backoff strategy

---

#### Slice 4: S02-NEW-01 Saved addresses — Multi-address support

**Objective:** Enable customers to save and manage multiple delivery addresses.

**Dependencies:** None

**Actions:**
1. Create `addresses` table with RLS
2. Add address management UI (add/edit/delete/list)
3. Add address selection to checkout
4. Add "save this address" option after checkout
5. Add address labels (Home, Work, etc.)
6. Update profile to reference default address

**Files affected:**
- New migration: `20261103000000_saved_addresses.sql`
- `src/features/account/AddressManager.tsx` (new)
- `src/features/account/AddressForm.tsx` (new)
- `src/features/account/AddressList.tsx` (new)
- `src/features/checkout/CheckoutPage.tsx` (modify — add address picker)
- `src/features/account/AccountPage.tsx` (modify — add address management section)
- `src/features/account/profile.ts` (modify — add default_address_id)
- `tests/address-management-dom.test.mjs` (new)

**Database schema:**
```sql
CREATE TABLE addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text CHECK (char_length(label) BETWEEN 1 AND 50),
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
```

**Security considerations:**
- RLS enforces owner-only access
- City validation matches existing checkout rules
- Label uniqueness per user prevents duplicates
- Default address trigger is atomic

**Test coverage:**
- Address CRUD operations
- RLS ownership enforcement
- Default address uniqueness
- Checkout address selection
- Profile default address reference
- Accessibility (keyboard navigation, ARIA labels)

**Rollback strategy:**
- Drop `addresses` table
- Remove address management UI
- Revert checkout to profile defaults only
- No data loss (addresses are convenience, not required)

**Estimated effort:** 3-4 days

---

#### Slice 5: S02-NEW-02 Order timeline — Customer-facing timeline

**Objective:** Provide customers with a visual timeline of their order progress.

**Dependencies:** None (could integrate with S02-04 notifications later)

**Actions:**
1. Create customer-scoped RPC to read order status history
2. Add timeline UI component to Order Details page
3. Add timeline to My Orders list items (abbreviated)
4. Ensure truthful states only (no invented payment/fulfillment states)

**Files affected:**
- New migration: `20261103000001_customer_order_history.sql`
- `src/features/orders/OrderTimeline.tsx` (new)
- `src/features/orders/OrderPages.tsx` (modify — add timeline to OrderDetailPage)
- `src/features/orders/orderRepository.ts` (modify — add `loadCustomerOrderHistory`)
- `tests/order-timeline-dom.test.mjs` (new)

**Database schema:**
```sql
CREATE OR REPLACE FUNCTION customer_order_history(p_order_id uuid)
RETURNS TABLE (
  from_status text,
  to_status text,
  reason text,
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
  SELECT from_status, to_status, reason, created_at
  FROM business_order_operations
  WHERE order_id = p_order_id
  ORDER BY created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION customer_order_history(uuid) TO authenticated;
```

**Security considerations:**
- Ownership check prevents cross-user data access
- SECURITY DEFINER with explicit auth.uid() check
- No admin-only fields exposed (actor_user_id hidden)
- Read-only (no customer writes to history)

**Test coverage:**
- Ownership enforcement (user A cannot read user B's history)
- Timeline rendering for all status transitions
- Truthful states only (no paid/failed unless actually set)
- Accessibility (screen reader announcements for status changes)

**Rollback strategy:**
- Drop `customer_order_history` function
- Remove timeline UI components
- No data loss (history table remains for admin)

**Estimated effort:** 2-3 days

---

#### Slice 6: S02-04 Notifications — Persistent notification system

**Objective:** Implement persistent notifications with bell icon, inbox, and unread counts.

**Dependencies:** S02-NEW-02 (order events), S02-06 (email notifications — optional)

**Actions:**
1. Create `notifications` table with RLS
2. Add RPC functions for notification CRUD
3. Add notification creation triggers in order transition RPCs
4. Add bell icon to header
5. Add notification dropdown/popover
6. Add inbox page at `/account/notifications`
7. Add unread count badge
8. Add Supabase Realtime subscription
9. Add mark-as-read functionality

**Files affected:**
- New migration: `20261103000002_notifications.sql`
- `src/components/NotificationBell.tsx` (new)
- `src/components/NotificationDropdown.tsx` (new)
- `src/features/account/NotificationInbox.tsx` (new)
- `src/components/Layout.tsx` (modify — add bell icon)
- `src/main.tsx` (modify — add `/account/notifications` route)
- `src/components/notifications.ts` (modify — extend for persistent notifications)
- `src/components/NotificationProvider.tsx` (modify — integrate persistent + transient)
- `tests/notification-persistent-dom.test.mjs` (new)

**Database schema:**
```sql
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('order_placed', 'order_confirmed', 'order_processing', 'order_ready_for_pickup', 'order_out_for_delivery', 'order_completed', 'order_cancelled', 'email_sent', 'email_failed')),
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
```

**Security considerations:**
- RLS enforces owner-only access
- `create_notification` is service_role only (called from order transition RPCs)
- `mark_notification_read` and `count_unread_notifications` are authenticated
- No cross-user data access possible
- Realtime subscription filtered by `user_id`

**Test coverage:**
- Notification creation on order transitions
- RLS ownership enforcement
- Unread count accuracy
- Mark-as-read functionality
- Realtime delivery
- Bell icon rendering
- Dropdown/popover interactions
- Inbox page rendering
- Accessibility (ARIA live regions, keyboard navigation)

**Rollback strategy:**
- Drop `notifications` table
- Remove notification UI components
- Revert to transient toast only
- No data loss (order history remains)

**Estimated effort:** 5-7 days

---

## 5. QA and Release Strategy

### QA approach per slice

| Slice | Unit Tests | DOM Tests | SQL Tests | Integration Tests | Browser QA |
|---|---|---|---|---|---|
| S02-NEW-03 Closure | N/A | N/A | N/A | N/A | N/A |
| S02-05 Decisions | N/A | N/A | N/A | N/A | N/A |
| S02-06 Email | Add CRON tests | N/A | N/A | Add delivery tests | Staging email test |
| S02-NEW-01 Addresses | Add address tests | Add address DOM tests | Add address RLS tests | Add checkout integration | Staging address test |
| S02-NEW-02 Timeline | Add timeline tests | Add timeline DOM tests | Add history RPC tests | Add order detail integration | Staging timeline test |
| S02-04 Notifications | Add notification tests | Add notification DOM tests | Add notification RLS tests | Add realtime integration | Staging notification test |

### Release gates per slice

| Gate | S02-NEW-03 | S02-05 | S02-06 | S02-NEW-01 | S02-NEW-02 | S02-04 |
|---|---|---|---|---|---|---|
| Lint clean | N/A | N/A | Required | Required | Required | Required |
| TypeScript clean | N/A | N/A | Required | Required | Required | Required |
| All tests pass | N/A | N/A | Required | Required | Required | Required |
| Build successful | N/A | N/A | Required | Required | Required | Required |
| SQL tests pass | N/A | N/A | Required | Required | Required | Required |
| Independent review | N/A | N/A | Required | Required | Required | Required |
| Staging verification | N/A | N/A | Required | Required | Required | Required |
| Production approval | N/A | N/A | Required | Required | Required | Required |
| Post-deploy smoke | N/A | N/A | Required | Required | Required | Required |

### Staging verification per slice

| Slice | Staging Actions |
|---|---|
| S02-NEW-03 | None (closure only) |
| S02-05 | None (documentation only) |
| S02-06 | Send test email, verify delivery, test CRON retry |
| S02-NEW-01 | Add/edit/delete addresses, select at checkout, verify profile default |
| S02-NEW-02 | View order timeline, verify truthful states, test ownership isolation |
| S02-04 | Trigger notifications, verify bell icon, test inbox, mark as read |

### Production acceptance per slice

| Slice | Production Actions |
|---|---|
| S02-NEW-03 | None |
| S02-05 | None |
| S02-06 | Apply migration (if any), deploy CRON function, update `RESEND_FROM`, configure DNS |
| S02-NEW-01 | Apply migration, deploy Edge Functions (if any), verify RLS |
| S02-NEW-02 | Apply migration, verify RPC permissions |
| S02-04 | Apply migration, enable Realtime, verify RLS, test end-to-end |

---

## 6. Decisions Requiring Owner Approval

### Before any implementation

1. **S02-06: Sending domain selection**
   - Option A: `send.najbuilds.com`
   - Option B: `mail.lumehouse.sl`
   - Option C: Keep `onboarding@resend.dev` (testing only, emails go to spam)
   - **Recommendation:** Option A or B for production reliability

2. **S02-06: Admin email management UI**
   - Option A: Implement admin interface to view/retry failed emails
   - Option B: Defer (manual database queries only)
   - **Recommendation:** Option B for now (low volume initially)

3. **S02-06: CRON retry strategy**
   - Option A: Exponential backoff (1min, 5min, 15min, 1hr, 4hr) within 23-hour window
   - Option B: Fixed interval (every 15 minutes) within 23-hour window
   - **Recommendation:** Option A (matches industry best practices)

4. **S02-NEW-01: Address limit per user**
   - Option A: 5 addresses maximum
   - Option B: 10 addresses maximum
   - Option C: Unlimited
   - **Recommendation:** Option A (prevents abuse, sufficient for most users)

5. **S02-NEW-01: Address labels**
   - Option A: Free-text labels (user-defined)
   - Option B: Predefined labels (Home, Work, Other)
   - Option C: Both (predefined + custom)
   - **Recommendation:** Option C (flexibility + structure)

6. **S02-NEW-02: Timeline detail level**
   - Option A: Status transitions only (placed → confirmed → processing → ...)
   - Option B: Transitions + timestamps + reasons (admin-entered)
   - Option C: Transitions + timestamps (hide admin reasons from customer)
   - **Recommendation:** Option C (transparent but private)

7. **S02-04: Notification types**
   - Option A: Order lifecycle only (placed, confirmed, processing, ready, delivery, completed, cancelled)
   - Option B: Order lifecycle + email status (sent, failed)
   - Option C: Order lifecycle + email status + promotional (future)
   - **Recommendation:** Option B for now (Option C can be added later)

8. **S02-04: Realtime subscription scope**
   - Option A: All notifications for the user
   - Option B: Unread notifications only
   - Option C: Last 24 hours of notifications
   - **Recommendation:** Option A (user can filter in UI)

9. **Implementation order**
   - Option A: Sequential (Slice 3 → 4 → 5 → 6)
   - Option B: Parallel where possible (Slice 3 + 4 in parallel, then 5, then 6)
   - **Recommendation:** Option A (safer, easier to review)

### During implementation

10. **S02-NEW-01: Street address autocomplete**
    - Option A: Implement with Google Places API
    - Option B: Implement with Mapbox API
    - Option C: Defer (manual entry only)
    - **Recommendation:** Option C for now (Freetown-only, low complexity)

11. **S02-04: Notification preferences**
    - Option A: All notifications enabled (no preferences)
    - Option B: Per-type opt-in/opt-out
    - Option C: Global on/off switch
    - **Recommendation:** Option A for now (can add preferences later)

---

## 7. Recommended First Implementation Slice

### Slice 3: S02-06 Email — Verified domain and automated retry

**Rationale for starting here:**
1. **Low code risk** — Most changes are configuration, not source code
2. **High user impact** — Resolves spam folder issue, improves delivery reliability
3. **Unblocks testing** — Enables staging email testing for all future slices
4. **Independent** — No dependencies on other S02 workstreams
5. **Small scope** — 1-2 days estimated effort
6. **Reversible** — Can revert to default sender if issues arise

**Pre-requisites (owner-executed):**
1. Decide on sending domain (Option A or B above)
2. Register domain with Resend (dashboard configuration)
3. Configure DNS records (SPF, DKIM, DMARC) — owner or infrastructure team
4. Decide on CRON retry strategy (Option A or B above)

**Implementation plan:**
1. Update `RESEND_FROM` environment variable in Supabase dashboard
2. Create Supabase CRON function for automated retry
3. Add CRON schedule configuration
4. Test email delivery with verified domain
5. Test CRON retry with failed emails
6. Document configuration in `supabase/README.md`

**Files affected:**
- `supabase/config.toml` (add CRON configuration)
- New migration for CRON function (if needed)
- `supabase/README.md` (document configuration)

**Testing requirements:**
- Send test email to verified recipient
- Verify delivery (not in spam)
- Simulate failed email, verify CRON retry
- Verify idempotency (no duplicate sends)

**Rollback plan:**
- Revert `RESEND_FROM` to `onboarding@resend.dev`
- Disable CRON function
- No database changes to rollback

**Success criteria:**
- Emails delivered to inbox (not spam)
- Failed emails retried automatically within 23-hour window
- No duplicate emails sent
- CRON function logs show successful execution

**Owner approval request:**

> **Owner approval requested for S02-06 Slice 3: Verified domain and automated retry**
>
> **Objective:** Resolve email delivery limitations and add automated retry.
>
> **Pre-requisites:** Owner must select sending domain, configure DNS records, and decide on CRON retry strategy.
>
> **Scope:** Update `RESEND_FROM`, create CRON function, test delivery and retry.
>
> **Out of scope:** Admin email management UI, delivery webhooks, batch processing.
>
> **Estimated effort:** 1-2 days
>
> **Risk level:** LOW (configuration changes, no schema changes, reversible)
>
> **Rollback:** Revert environment variable, disable CRON (5 minutes)
>
> **Testing:** Send test emails, verify delivery, simulate failures, verify retry
>
> **Deliverable:** Working email delivery with automated retry, documented configuration
>
> **Next step:** After Slice 3 approval and completion, request approval for Slice 4 (saved addresses)
>
> **Approve Slice 3?** [ ] YES [ ] NO
>
> **Comments:** _______________

---

## Appendix A: Workstream Summary

| Workstream | Status | Implementation Needed | Estimated Effort | Risk Level |
|---|---|---|---|---|
| S02-NEW-03 Guest Continuity | **CLOSE** | None | 0.5 hours | NONE |
| S02-05 Currency | **DOCUMENT** | None (decisions only) | 2 hours | NONE |
| S02-06 Email | **IMPLEMENT** | Verified domain + CRON retry | 1-2 days | LOW |
| S02-NEW-01 Saved Addresses | **IMPLEMENT** | Multi-address support | 3-4 days | MEDIUM |
| S02-NEW-02 Order Timeline | **IMPLEMENT** | Customer-facing timeline | 2-3 days | LOW |
| S02-04 Notifications | **IMPLEMENT** | Persistent notifications | 5-7 days | MEDIUM |

**Total estimated effort:** 11-16 days (excluding S02-NEW-03 closure and S02-05 documentation)

---

## Appendix B: Test Coverage Summary

| Workstream | Existing Test Lines | New Tests Needed |
|---|---|---|
| S02-NEW-03 | 4,658 lines (10 files) | None |
| S02-05 | 1,354 lines (5 files) | None |
| S02-06 | ~500 lines (5+ files) | ~200 lines (CRON, delivery) |
| S02-NEW-01 | 2,974 lines (4 files) | ~500 lines (address CRUD, RLS, UI) |
| S02-NEW-02 | 1,333 lines (7 files) | ~300 lines (timeline UI, RPC) |
| S02-04 | 573 lines (1 file) | ~800 lines (persistent notifications, Realtime) |

**Total existing tests:** ~11,392 lines  
**Total new tests needed:** ~1,800 lines

---

## Appendix C: Migration Summary

| Workstream | New Migrations | Schema Changes |
|---|---|---|
| S02-NEW-03 | None | None |
| S02-05 | None | None |
| S02-06 | None (CRON function only) | None |
| S02-NEW-01 | 1 (`saved_addresses`) | New `addresses` table |
| S02-NEW-02 | 1 (`customer_order_history`) | New RPC function |
| S02-04 | 1 (`notifications`) | New `notifications` table + RPC functions |

**Total new migrations:** 3  
**Total new tables:** 2 (`addresses`, `notifications`)  
**Total new RPC functions:** 5 (`customer_order_history`, `create_notification`, `mark_notification_read`, `count_unread_notifications`, `enforce_one_default_address`)

---

**End of consolidated execution manifest.**

**Next step:** Owner review and approval request for Slice 3 (S02-06 email verified domain and automated retry).

**Status:** READY for owner decision.
