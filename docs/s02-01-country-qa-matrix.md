# S02-01 controlled staging QA matrix (country enforcement)

**Status: RELEASED — PR #21 merged to main 2026-11-03 (merge commit `fbe16d5`).**

This document was the QA specification for the S02-01 delivery-country contract.
It defined the 17-scenario matrix and the controlled staging scenarios for gate **W4**.
Sections §3–§5, §9–§12 are preserved as historical specification for repeatability.
Post-execution results are recorded in §2 (scenario map) and §6 (individual scenarios).

| Field | Value |
| --- | --- |
| Original gate | W4 — controlled staging QA (specification) |
| Staging target | Supabase project `gscihjjwhmvddrmcfpxp` (never production `wyvsbzcltrhnjeuijsva`) |
| Branch under test | `feat/lume-web-s02-country-enforcement` @ `eb035f9` (PR head) |
| Migration under test | `20261023002900_order_delivery_country.sql` |
| Edge functions under test | `place-order`, `place-direct-order` |
| QA origin (Web) | `https://lume-house-git-feat-lume-web-s02-country-enforcement-najbuilds.vercel.app` |
| Matrix size | 17 numbered slots — 8 Web, 2 Mobile, 7 unreconciled |
| W4 execution result | 6 PASS (owner-reported), 2 BLOCKED (code review only), 2 Mobile NOT EXECUTED, 7 NEEDS RECONCILIATION |
| Production release | PR #21 merged to main 2026-11-03. Production schema deployed. Migration ledger `02900` reconciliation pending. |

---

## 1. Provenance and reconstruction basis

### 1.1 The original matrix was never persisted

The 17-scenario matrix was defined during S02-01 implementation but was never written to a
file, a commit, a PR body or a PR comment. Verified by:

- full-tree content search for scenario/matrix references;
- `git log --all -S "17-scenario"` and `-S "scenario matrix"` — **no commits**;
- `git log --all --diff-filter=D` filtered for `scenario|QA|MATRIX|country` — **no deletions**;
- PR #21 body and comments — **no matrix**.

### 1.2 The only surviving reference

Exactly one sentence in the whole repository enumerates any of the scenarios
(`.codex/LUME_WEB_S02_01_CORS_CONFIGURATION_FIX.md:164`, gate table row 5):

> Controlled staging test orders (Web scenarios 1-4, 7, 9, 11, 17; Mobile 5-6 after APK) —
> **NOT AUTHORISED** — baseline is 6 NULL-country + 2 SL orders; reset ownership not agreed.

From this, only three things are **recovered** facts:

1. the matrix has **17** numbered slots;
2. the controlled-order subset is **Web 1–4, 7, 9, 11, 17** and **Mobile 5–6**;
3. Mobile scenarios are gated on an APK being available.

### 1.3 What is reconstructed, and how

Everything else in this document is **reconstructed from verified source evidence**, not
recalled. The rules applied were:

- Every expected behaviour must be traceable to implementation, migration, test, or an
  existing report. Each scenario cites its sources.
- No acceptance criterion, threshold, actor or requirement is invented. Where the original
  wording cannot be recovered, the slot is marked **NEEDS RECONCILIATION** (§8).
- The **assignment of a behaviour to a specific number** (e.g. "scenario 7 is the direct
  order") is a **reconstruction, not a recovered fact**. The numbers are preserved; the
  behaviour attached to each number is proposed. Independent review must confirm or
  re-map them before execution. This is the single largest residual risk in this document
  and is recorded as **Finding R1** in the reconciliation report.

### 1.4 Erratum (corrected)

`.codex/LUME_WEB_S02_RELEASE_READINESS_RECONCILIATION.md:139` said "for each of the **7**
Web scenarios", while its own enumeration at line 128 lists **eight** IDs
(1, 2, 3, 4, 7, 9, 11, 17). The enumeration is the more specific evidence and is
authoritative. The prose count was a miscount, not evidence of an eighth exclusion.
**Corrected on 2026-11-03:** line 139 now reads "8". Recorded as **Finding R2**.

---

## 2. Scenario numbering map

The 17 slots are preserved exactly. Numbers are never renumbered or reused.

| # | Surface | Behaviour (reconstructed) | In W4 controlled-order scope | Status |
| --- | --- | --- | --- | --- |
| 1 | Web | Bag + delivery, Sierra Leone — accepted | Yes | **PASS** — owner-reported; order LH-3F6EF8AE24764A72 |
| 2 | Web | Bag + pickup, Sierra Leone — accepted | Yes | **PASS** — owner-reported; order LH-3CE149E56A444B57 |
| 3 | Web | Non-Sierra-Leone + delivery — rejected | Yes | **PASS** — owner-reported UI-layer verification |
| 4 | Web | Non-Sierra-Leone + pickup — rejected | Yes | **PASS** — owner-reported UI-layer verification |
| 5 | Mobile | Mobile Bag + delivery, Sierra Leone — accepted | No — after APK | NOT EXECUTED |
| 6 | Mobile | Mobile Bag + pickup, Sierra Leone — accepted | No — after APK | NOT EXECUTED |
| 7 | Web | Buy Now (direct) + delivery, Sierra Leone — accepted | Yes | **PASS** — owner-reported; order LH-1368A9C7DEB24A02 |
| 8 | — | Original objective unrecoverable | Unknown | **NEEDS RECONCILIATION** |
| 9 | Web | Buy Now (direct) + pickup, Sierra Leone — accepted | Yes | **PASS** — owner-reported; order LH-D058CD112B05476A |
| 10 | — | Original objective unrecoverable | Unknown | **NEEDS RECONCILIATION** |
| 11 | Web | Missing / empty country — rejected | Yes | **NOT RUN at runtime** — code review only; owner-accepted gap |
| 12 | — | Original objective unrecoverable | Unknown | **NEEDS RECONCILIATION** |
| 13 | — | Original objective unrecoverable | Unknown | **NEEDS RECONCILIATION** |
| 14 | — | Original objective unrecoverable | Unknown | **NEEDS RECONCILIATION** |
| 15 | — | Original objective unrecoverable | Unknown | **NEEDS RECONCILIATION** |
| 16 | — | Original objective unrecoverable | Unknown | **NEEDS RECONCILIATION** |
| 17 | Web | Replay/idempotency + historical NULL preservation | Yes | **NOT RUN at runtime** — code review only; owner-accepted gap |

Slots 8, 10 and 12–16 are **not** enumerated as controlled staging test orders in the only
surviving reference. They are therefore treated as out of W4 controlled-order scope, but
their original subject matter is unknown and must not be guessed (§8).

**Evidence note:** Scenarios 1–4, 7, 9 were executed by the owner via browser on the staging
Vercel preview and reported as PASS. Order IDs are owner-observed. No independent agent
browser session verified these outcomes. Scenarios 11 and 17 were not executed at runtime;
their PASS claims rest on code review of `handler.ts:60`, the migration RPCs, and the
automated test suite (`tests/orders.test.mjs`, `supabase/tests/country-order.sql`,
`supabase/tests/country-order-concurrency.mjs`).

---

## 3. Preconditions — historical specification (preserved for repeatability)

> **Note:** W4 executed on 2026-11-03 against staging `gscihjjwhmvddrmcfpxp`. These
> preconditions are preserved as the original specification. Items that were satisfied at
> execution time are noted inline.

These must hold before the first order in any future re-execution:

1. **Explicit authorisation** naming staging `gscihjjwhmvddrmcfpxp` and the exact scenario
   subset being executed. This document is not authorisation.
   — *Satisfied for W4: owner authorised scenarios 1–4, 7, 9, 11, 17.*
2. **Read-only baseline captured immediately before QA** (§4). A stale baseline invalidates
   the order-count deltas.
   — *W4 baseline: 8 orders (6 NULL-country, 2 SL), 15 order items, 8 confirmation jobs.*
3. **Reset/cleanup ownership agreed** for every order created. Without it the baseline
   becomes unreproducible and W4 cannot be re-run.
   — *W4 test orders created; cleanup pending.*
4. **Email suppression confirmed.** `RESEND_API_KEY` must be absent on staging so
   `email_status: "queued"` is an expected result, not a failure. If the key is present,
   this matrix's email expectation is wrong and must be revised before execution.
5. **Migration state confirmed read-only**: `20261023002900` applied on staging; remote-only
   `20261030145607` retained untouched.
   — *Satisfied. Migration also applied on production as part of W5 release sequence.*
6. **Edge deployment matches the branch under test.** `place-order` and `place-direct-order`
   must both be the S02-01 build, not an earlier deployment.
7. **Origin allowlist confirmed.** The QA origin must be in the staging `ALLOWED_ORIGINS`
   contract; `place-direct-order` must retain `verify_jwt=true`.
8. **Authenticated QA identities exist and are not production users.** Fixture identities
   belong only in isolated rollback tests, never in hosted runtime data — so QA must use
   genuinely created, owner-controlled staging accounts and must not seed fake customers.

---

## 4. Staging baseline — historical record

> **Note:** This section records the baseline captured before W4 execution. A fresh baseline
> must be taken before any re-execution.

**Pre-W4 baseline (captured 2026-11-03):**

| Recorded state | Value | Source |
| --- | --- | --- |
| Orders with `country_code IS NULL` | 6 | CORS report gate 5; readiness reconciliation §5 |
| Orders with `country_code = 'SL'` | 2 | same |
| Total orders | 8 | Owner-reported read-only staging query |
| Order items | 15 | same |
| Confirmation jobs | 8 | same |
| Cart count | not recorded | — |

**Post-W4 state:** 4 additional test orders created (scenarios 1, 2, 7, 9), all with
`country_code = 'SL'`. Cleanup pending.

**For re-execution:** A fresh read-only baseline is mandatory immediately before QA,
capturing at minimum:

- total `orders` count and `country_code` distribution (NULL / SL / anything else);
- `order_items` count;
- `order_confirmation_jobs` count and `status` distribution;
- `inventory_ledger` count for the QA variants;
- cart row count and cart-line count for the QA identities;
- `variant_inventory.on_hand` / `allocated` for every QA variant.

That read creates nothing and is a separate, smaller authorisation than the controlled
orders. Nothing in §6–§7 may run until it exists.

---

## 5. Common contract — historical specification (preserved for repeatability)

> **Note:** This section defines the expected behaviour for every scenario. It was the
> acceptance criterion for W4 execution. Preserved unchanged for any future re-execution.

Applies to every scenario:

### 5.1 Accept path

- HTTP **200**.
- `place-order` body: `{ order: { id, reference, total, currency, status, payment_status }, email_status }`.
- `place-direct-order` body adds `protocol: 1`, `checkout_source: "direct"`, `request_id`.
- Persisted order: `status = 'placed'`, `payment_status = 'awaiting_payment'`,
  `currency = 'NLE'`, `country_code = 'SL'`.
- Placement succeeding is **never** payment success.
- Exactly **one** `order_confirmation_jobs` row per order.
- On staging with no `RESEND_API_KEY`: the HTTP body carries `email_status = "queued"`
  while the persisted `order_confirmation_jobs.status` remains `"pending"`. `queued` is a
  response value only; it is never written to the job row.
- Fees are derived in trusted SQL, never taken from the browser:
  zone-1 `4000`, zone-2 `5000`, zone-3 `6000` NLE minor units; pickup `0`.
- Zone labels are trusted snapshots, persisted exactly as written in SQL:
  `Goderich to Lumley`, `Lumley to Congo Cross, including Aberdeen`,
  `Congo Cross to Central Freetown`. The UI may display a shorter zone-2 name; the persisted
  snapshot is the longer string.
- Pickup snapshot location: `Lumley, Freetown`; no delivery zone snapshot, no fake address.

### 5.2 Reject path

- Rejections return `{ error: "<CODE>", outcome: "rejected" }` for definite refusals.
- Status mapping (`supabase/functions/_shared/handler.ts`):
  - `401` — `AUTH_REQUIRED`
  - `400` — `INVALID_REQUEST`, `INVALID_CHECKOUT`, `INVALID_DELIVERY_ZONE`,
    `INVALID_DELIVERY_DETAILS`, `INVALID_DELIVERY_COUNTRY`, `ORDER_TOTAL_LIMIT`, `CART_LIMIT`
  - `409` — `CART_CHANGED`, `PRODUCT_UNAVAILABLE`, `EMPTY_CART`, `OUT_OF_STOCK`,
    `CHECKOUT_SOURCE_CONFLICT`, `CHECKOUT_SELECTION_CONFLICT`, `QUOTE_CHANGED`
  - `503` — `ORDER_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `DIRECT_UNAVAILABLE`
- A definite rejection must never be presented to the customer as a transient outage and
  must never auto-retry.

### 5.3 Country enforcement — two independent layers

1. **Edge layer** (`handler.ts:60`): if `checkout.country_code !== 'SL'` the request is
   rejected before any RPC call, so no SQL, no order, no job, no allocation occurs.
2. **Trusted SQL layer** (`20261023002900_order_delivery_country.sql`): every RPC re-checks
   and raises `INVALID_DELIVERY_COUNTRY` (`P0001`) before replay lookup or mutation. Insert
   trigger requires exact `SL` (`23514`); update trigger makes country immutable (`23514`);
   `CHECK (country_code is null or country_code = 'SL')`.

Neither layer normalises, trims or upper-cases. `' SL '`, `'sl'`, `'Sl'`, `'SLE'`, `'SLX'`,
`'Sierra Leone'` are all rejected.

### 5.4 Idempotency

- Idempotency key is the owner-scoped `checkout_request_id` (the request `request_id`).
- Replaying the same `request_id` for the same owner returns the **same** order and creates
  no second order, job, item set or allocation.
- Reusing the key with changed purchase mode → `CHECKOUT_SOURCE_CONFLICT` (409).
- Reusing the key with a changed direct selection → `CHECKOUT_SELECTION_CONFLICT` (409).
- The country check runs **before** the replay lookup, so a replay with a non-SL country is
  rejected rather than served from history.

### 5.5 Inventory

- Allocation exists only on the `place_variant_order` (`cart_version: 2`) and
  `place_direct_variant_order` paths. The legacy `place_order` (`cart_version` absent or `1`)
  is untracked-only: it rejects any `inventory_policy <> 'untracked'` with
  `PRODUCT_UNAVAILABLE` (409) and never allocates.
- Tracked variants: `allocated += quantity` once; `on_hand` is **not** decremented at
  placement; one `inventory_ledger` `order_allocation` event per allocation.
- Untracked variants: no allocation, no ledger row.
- Replay allocates nothing further.
- Insufficient stock → `OUT_OF_STOCK` (409) with no partial allocation.
- A cart/Bag does **not** reserve stock.

### 5.6 Origin

The handler rejects a present-but-unlisted `Origin` with `403 ORIGIN_NOT_ALLOWED`. Browser QA
must run from the authorised staging origin. Non-browser probes that send no `Origin` are not
filtered by this check — which is exactly why service-level probes require separate
authorisation (§6.3, §6.4, §6.11).

---

## 6. Web scenarios

Each scenario below states its sources. "Sources" means the implementation and tests that
establish the expected behaviour — not that the scenario has been run.

### Scenario 1 — Bag + delivery, Sierra Leone (accepted)

| Field | Specification |
| --- | --- |
| Objective | A signed-in customer places a delivery order from the Bag for Sierra Leone; trusted SQL snapshots country, fee, zone and prices and converts the cart atomically. |
| Actor | Authenticated customer with a populated **variant** Bag → `place_variant_order` via `cart_version: 2`. The legacy v1 Bag (`place_order`) is untracked-only and cannot carry the tracked-allocation evidence below (see §5.5). |
| Prerequisites | §3 satisfied; baseline captured; at least one active NLE product available (tracked if allocation evidence is required); city `Freetown`; `zone_id: "zone-3"`. |
| Input / action | `POST` `place-order` with `{ request_id: <uuid>, checkout: { …, country_code: "SL", fulfilment: "delivery", city: "Freetown", zone_id: "zone-3" }, expected_cart: [...], cart_version: 2 }` and a valid Bearer JWT. |
| Expected HTTP response | `200`; `{ order: { id, reference, total, currency: "NLE", status: "placed", payment_status: "awaiting_payment" }, email_status: "queued" }`. |
| Expected DB state | One `orders` row: `country_code = 'SL'`, `status = 'placed'`, `payment_status = 'awaiting_payment'`, `currency = 'NLE'`, `checkout_source = 'bag'`, `delivery_fee_cents = 6000`, `delivery_zone_label = 'Congo Cross to Central Freetown'`, `total_cents = subtotal + 6000`; matching immutable `order_items` snapshots; exactly one `order_confirmation_jobs` row (`status = 'pending'`); Bag cart converted, not left populated. |
| Expected error code | n/a (accept path). Rejections that must **not** occur here: `INVALID_DELIVERY_COUNTRY`. |
| Idempotency | Replaying the same `request_id` returns the same `order.id`; no second order, item set, job or allocation. |
| Inventory | On `cart_version: 2`: a tracked variant is allocated once (`allocated += qty`, `on_hand` unchanged) with one `inventory_ledger` `order_allocation`; an untracked variant allocates nothing. On the legacy `place_order` path only untracked variants are accepted — a tracked variant returns `409 PRODUCT_UNAVAILABLE` and allocates nothing. |
| Evidence to capture | Request envelope (redacting JWT), response JSON, owner-scoped `orders` row, `order_items` rows, jobs count, cart state after placement, `variant_inventory` before/after, ledger row. |
| Cleanup | Record `orders.id` + `order_reference`. Do not delete unless reset ownership (§3.3) explicitly covers it. |
| Sources | `handler.ts:57–75`; migration `place_variant_order` (`20261023002900_order_delivery_country.sql:230–276`) and legacy `place_order` untracked-only guard (`:120`); `supabase/tests/country-order.sql`; `supabase/tests/checkout.sql`; `tests/checkout-delivery-dom.test.mjs:400`. |
| Status | **PASS** — owner-reported; order LH-3F6EF8AE24764A72 |

> Path note: `cart_version: 2` routes to `place_variant_order`, which supports tracked
> allocation. Omitting `cart_version` routes to the legacy `place_order`, which accepts only
> `inventory_policy = 'untracked'`, returns `409 PRODUCT_UNAVAILABLE` for a tracked variant,
> and never writes an allocation or ledger row. Run Scenario 1 with `cart_version: 2`; record
> any legacy-path result separately rather than folding it into this scenario.

### Scenario 2 — Bag + pickup, Sierra Leone (accepted)

| Field | Specification |
| --- | --- |
| Objective | Pickup is free, has no zone or street requirement, snapshots `Lumley, Freetown`, and remains subject to the same country gate. |
| Actor | Authenticated customer with a populated Bag. |
| Prerequisites | §3 satisfied; baseline captured; active NLE product. |
| Input / action | `POST` `place-order` with `checkout: { …, country_code: "SL", fulfilment: "pickup", zone_id: "", city: "" }`, `cart_version: 2`, valid JWT. |
| Expected HTTP response | `200`; `order.status = "placed"`, `payment_status = "awaiting_payment"`, `email_status: "queued"`. |
| Expected DB state | One `orders` row with `country_code = 'SL'`, `fulfilment_method = 'pickup'`, `delivery_fee_cents = 0`, `delivery_zone_id`/`delivery_zone_label`/`delivery_street_address`/`delivery_area`/`delivery_city` NULL, `pickup_location = 'Lumley, Freetown'`; one `order_items` set; one job; Bag converted. |
| Expected error code | n/a. Must not return `INVALID_DELIVERY_ZONE` or `INVALID_DELIVERY_DETAILS` for a valid pickup. |
| Idempotency | Same-key replay returns the same order; no duplicate job or allocation. |
| Inventory | As Scenario 1. |
| Evidence to capture | As Scenario 1, plus the pickup snapshot columns and the absence of zone/address snapshots. |
| Cleanup | As Scenario 1. |
| Sources | `src/config/fulfilment.ts` (`pickupLocation`, `getDeliveryFee` pickup → 0); migration pickup branch; `country-order.sql` (`Bag pickup snapshots exact SL with no fee`); `tests/checkout-delivery-dom.test.mjs:445`. |
| Status | **PASS** — owner-reported; order LH-3CE149E56A444B57 |

### Scenario 3 — Non-Sierra-Leone + delivery (rejected)

| Field | Specification |
| --- | --- |
| Objective | A non-SL delivery country can never produce an order, at either layer. |
| Actor | Authenticated customer. |
| Prerequisites | §3 satisfied; baseline captured. |
| Input / action | **UI layer:** select a non-SL country (e.g. `Ghana`) with delivery. **Service layer (separate authorisation required):** crafted authenticated `POST place-order` with `checkout.country_code = "GH"`. |
| Expected HTTP response | **UI layer: no HTTP request is issued at all** — submit is disabled and zero order-service calls begin. **Service layer: `400`** `{ "error": "INVALID_DELIVERY_COUNTRY", "outcome": "rejected" }`. |
| Expected DB state | No new `orders` row, no `order_items`, no `order_confirmation_jobs`, no `inventory_ledger` row; cart unchanged and unconverted; no country snapshot written anywhere. |
| Expected error code | `INVALID_DELIVERY_COUNTRY` (HTTP 400). Never `INVALID_DELIVERY_ZONE` — country is checked first. |
| Idempotency | The rejection is not persisted. After correcting to `SL`, the same `request_id` creates exactly one order. |
| Inventory | Zero allocation; `variant_inventory` unchanged. |
| Evidence to capture | UI: screenshot of the blocked state + zero requests in the network log. Service: raw response body/status + before/after row counts proving no delta. |
| Cleanup | None if UI-only. If a service probe ran, no rows were created, so nothing to reset. |
| Sources | `handler.ts:60`; `tests/orders.test.mjs:191–217` (all 13 non-canonical variants rejected with `rpcCount === 0`); `country-order.sql` (`every non-canonical country and container is rejected by all three RPCs`, `invalid country allocates no stock`); `tests/checkout-delivery-dom.test.mjs:400`. |
| Status | **PASS** — owner-reported UI-layer verification |

### Scenario 4 — Non-Sierra-Leone + pickup (rejected)

| Field | Specification |
| --- | --- |
| Objective | Country eligibility applies to the **order**, not the fulfilment method: pickup does not create a country loophole. |
| Actor | Authenticated customer. |
| Prerequisites | §3 satisfied; baseline captured. |
| Input / action | **UI layer:** select pickup, then choose `Ghana`. **Service layer (separate authorisation):** crafted `POST place-order` with `fulfilment: "pickup"`, `country_code: "GH"`. |
| Expected HTTP response | **UI layer: no HTTP request**; submit disabled, `unsupportedCountry` message shown, focus moved to the country field. **Service layer: `400`** `{ "error": "INVALID_DELIVERY_COUNTRY", "outcome": "rejected" }`. |
| Expected DB state | No order/job/item/ledger row; cart and Buy Now intent preserved; no pickup snapshot written. |
| Expected error code | `INVALID_DELIVERY_COUNTRY` (400). |
| Idempotency | Not persisted; correction then resubmit creates one order. |
| Inventory | Zero allocation. |
| Evidence to capture | UI: blocked state, error text, preserved form values, zero calls. Service: response + zero delta. |
| Cleanup | None. |
| Sources | Commit `309c19e` (`fix(checkout): enforce Sierra Leone eligibility for pickup`); `CheckoutPage.tsx:149–157, 225`; `tests/checkout-delivery-dom.test.mjs:828` (`an unsupported country blocks pickup…`); `tests/direct-checkout-dom.test.mjs:113`; `country-order.sql` (`invalid country rejects before Bag conversion or allocation`). |
| Status | **PASS** — owner-reported UI-layer verification |

### Scenario 7 — Buy Now (direct) + delivery, Sierra Leone (accepted)

| Field | Specification |
| --- | --- |
| Objective | The direct single-item path places a delivery order without touching the Bag. |
| Actor | Authenticated customer with a Buy Now intent (no Bag conversion). |
| Prerequisites | §3 satisfied; baseline captured; `place-direct-order` deployed with `verify_jwt = true`; active NLE variant. |
| Input / action | `POST place-direct-order` with `{ protocol: 1, request_id: <uuid>, variant_id, quantity, expected_quote: [{ product_id, variant_id, quantity, unit_price }], checkout: { …, country_code: "SL", fulfilment: "delivery", city: "Freetown", zone_id: "zone-3" } }` and valid JWT. |
| Expected HTTP response | `200`; `{ protocol: 1, checkout_source: "direct", request_id, order: { id, reference, total, currency: "NLE", status: "placed", payment_status: "awaiting_payment" }, email_status: "queued" }`. |
| Expected DB state | One `orders` row with `checkout_source = 'direct'`, `country_code = 'SL'`, delivery fee `6000`, trusted zone label; exactly one `order_items` row; one job; **no cart row created or modified**. |
| Expected error code | n/a on accept. Must not return `QUOTE_CHANGED`, `PRODUCT_UNAVAILABLE`, `OUT_OF_STOCK`, `CHECKOUT_SELECTION_CONFLICT`. |
| Idempotency | Same `request_id` → same order; one item, one job, one allocation. |
| Inventory | Tracked variant allocated once; one ledger event. |
| Evidence to capture | Response JSON (including `protocol`/`checkout_source`), order row, single `order_items` row, jobs count, cart-table counts before/after (must be identical), inventory delta. |
| Cleanup | Record order id/reference; do not delete without agreed reset ownership. |
| Sources | Migration `place_direct_variant_order` (country guard, `checkout_source 'direct'`, `SL`, one job); `handler.ts:71–75`; `tests/direct-checkout-dom.test.mjs`; `direct-order.sql`; `direct-order-concurrency.mjs`; `scripts/cors-smoke.config.json` (`place-direct-order` `verifyJwt: true`). |
| Status | **PASS** — owner-reported; order LH-1368A9C7DEB24A02 |

> Gateway note: because `place-direct-order` has `verify_jwt = true`, a request without a
> valid JWT is rejected by the platform before the function runs
> (`sb-error-code: UNAUTHORIZED_NO_AUTH_HEADER`). This is a gateway refusal, not an
> application `AUTH_REQUIRED` response, and must be recorded as such.

### Scenario 9 — Buy Now (direct) + pickup, Sierra Leone (accepted)

| Field | Specification |
| --- | --- |
| Objective | Direct pickup is free, snapshots `Lumley, Freetown`, and leaves the Bag untouched. |
| Actor | Authenticated customer with a Buy Now intent. |
| Prerequisites | §3 satisfied; baseline captured. |
| Input / action | `POST place-direct-order` with `checkout: { …, country_code: "SL", fulfilment: "pickup", zone_id: "" }`, `protocol: 1`, valid JWT. |
| Expected HTTP response | `200`; `protocol: 1`, `checkout_source: "direct"`, `status: "placed"`, `payment_status: "awaiting_payment"`, `email_status: "queued"`. |
| Expected DB state | One order with `country_code = 'SL'`, `fulfilment_method = 'pickup'`, `delivery_fee_cents = 0`, `pickup_location = 'Lumley, Freetown'`, zone/address snapshots NULL; one item; one job; cart tables unchanged. |
| Expected error code | n/a. |
| Idempotency | Same key → same order, no duplicates. |
| Inventory | Allocated once (tracked) or none (untracked). |
| Evidence to capture | As Scenario 7, plus pickup snapshot columns and zero-fee assertion. |
| Cleanup | As Scenario 7. |
| Sources | `direct-order.sql` (`direct pickup snapshots exact SL with no fee`); `tests/direct-checkout-dom.test.mjs:113`; migration direct pickup branch. |
| Status | **PASS** — owner-reported; order LH-D058CD112B05476A |

### Scenario 11 — Missing / empty country (rejected)

| Field | Specification |
| --- | --- |
| Objective | Absence of a country is a rejection, not a default. No silent fallback to `SL`. |
| Actor | Authenticated customer. |
| Prerequisites | §3 satisfied; baseline captured. |
| Input / action | **UI layer:** clear the country field and submit. **Service layer (separate authorisation):** `POST place-order` with `country_code` omitted / `""` / `null`. |
| Expected HTTP response | **UI layer: no HTTP request**; submit blocked with the "choose your country" message. **Service layer: `400`** `{ "error": "INVALID_DELIVERY_COUNTRY", "outcome": "rejected" }`. |
| Expected DB state | No order/job/item/ledger row; cart and form preserved. |
| Expected error code | `INVALID_DELIVERY_COUNTRY` (400) **at the Edge layer**. Note the distinction: a request sent straight to SQL with no `country_code` key raises `INVALID_CHECKOUT` (the key is not a JSON string), while a present-but-not-`SL` value raises `INVALID_DELIVERY_COUNTRY`. Both must be recorded with the layer that produced them. |
| Idempotency | Not persisted; correction then resubmit creates one order. |
| Inventory | Zero allocation. |
| Evidence to capture | UI blocked state + zero calls; or response body + zero delta with the producing layer named. |
| Cleanup | None. |
| Sources | `handler.ts:60`; migration `jsonb_typeof(p_checkout->'country_code') is distinct from 'string' → INVALID_CHECKOUT`; `tests/orders.test.mjs:205–208` (undefined/null/`""` all `400 INVALID_DELIVERY_COUNTRY`, `rpcCount === 0`); `tests/checkout-delivery-dom.test.mjs:871`. |
| Status | **NOT RUN at runtime** — code review PASS (automated tests `orders.test.mjs:205-208`); owner-accepted gap |

### Scenario 17 — Replay / idempotency and historical NULL preservation

| Field | Specification |
| --- | --- |
| Objective | A repeated submit cannot duplicate an order, job or allocation; and the country contract never backfills or rewrites historical NULL-country orders. |
| Actor | Authenticated customer (replay), plus an owner-scoped read of pre-existing historical orders. |
| Prerequisites | §3 satisfied; baseline captured; at least one pre-existing NULL-country order identified by id in the baseline (read-only). |
| Input / action | (a) Place one accepted `SL` order (Scenario 1 or 7), then re-send the identical body with the same `request_id`. (b) Read the historical NULL-country order as its owner. |
| Expected HTTP response | Both calls `200`; identical `order.id` and `order.reference`. |
| Expected DB state | Exactly **one** order, one item set, one job, one allocation/ledger event for that `request_id`. Historical rows still have `country_code IS NULL` — unchanged, unbackfilled. Any attempt to change a placed order's `country_code` is refused (`23514`). |
| Expected error code | Mutated replay: `CHECKOUT_SOURCE_CONFLICT` (409) if the purchase mode changed; `CHECKOUT_SELECTION_CONFLICT` (409) if the direct selection changed; `INVALID_DELIVERY_COUNTRY` (400) if the replay carries a non-SL country. |
| Idempotency | This scenario *is* the idempotency proof: count deltas must be 0 on the second call. |
| Inventory | Second call allocates nothing; ledger count unchanged. |
| Evidence to capture | Both response bodies, `orders`/`order_items`/jobs/ledger counts before and after each call, and the historical order's `country_code` value before and after. |
| Cleanup | As Scenario 1/7. The historical order must not be modified or deleted. |
| Sources | Migration (`country is nullable text without a backfill default`, `privileged updates cannot backfill historical country snapshots`, `Historical delivery country is immutable`, `replay never duplicates orders or jobs`); `country-order.sql`; `country-order-concurrency.mjs` (`two valid SL retries create one order, one allocation and one job`); `tests/orders.test.mjs:191`. |
| Status | **NOT RUN at runtime** — code review PASS (automated tests `country-order-concurrency.mjs`); owner-accepted gap |

---

## 7. Mobile-only scenarios

Mobile is a separate client with a separate release path. These scenarios are gated on an
APK and are **not** part of the Web W4 sign-off. Including them here does not change the
release roadmap.

Verified Mobile behaviour that constrains these scenarios:

- `C:\Dev-Per\lume-house-mobile\src\features\checkout\checkout.ts` hardcodes
  `country_code: 'SL'` in `checkoutPayload`.
- Mobile has **no country selector**, so a non-SL selection is unreachable from the client.
- Mobile calls **only** `place-order` with `cart_version: 2` (→ `place_variant_order`).
  It deliberately does not use the direct RPC.
- Mobile maps `INVALID_DELIVERY_COUNTRY` to a customer message, so the contract is honoured
  defensively even though the UI cannot trigger it.

### Scenario 5 — Mobile Bag + delivery, Sierra Leone (accepted)

| Field | Specification |
| --- | --- |
| Objective | The Mobile client places a delivery order that satisfies the same country contract as Web. |
| Actor | Signed-in Mobile QA user on a QA-variant APK with a populated Bag. |
| Prerequisites | APK built against the staging QA backend (`QA_SUPABASE_URL`, `QA_SUPABASE_PUBLISHABLE_KEY`, `QA_SUPABASE_PROJECT_REF` present); Auth allowlist includes `lumehousemobile-qa://auth/callback`; §3 satisfied; baseline captured. |
| Input / action | In-app checkout, delivery, Freetown zone → `place-order` with `{ request_id, checkout (country_code "SL"), expected_cart, cart_version: 2 }`. |
| Expected HTTP response | `200`; `order.status = "placed"`, `payment_status = "awaiting_payment"`, `email_status: "queued"`. |
| Expected DB state | One order with `country_code = 'SL'`, trusted zone fee, `checkout_source = 'bag'`; one job; Bag converted. |
| Expected error code | n/a. |
| Idempotency | Retry with the same `request_id` returns the same order. |
| Inventory | Tracked variant allocated once. |
| Evidence to capture | App screenshots, response body from device logs (JWT redacted), order row, jobs count, cart state. |
| Cleanup | Record order id; deletion only under agreed reset ownership. |
| Sources | `lume-house-mobile/src/features/checkout/checkout.ts:145`; `.../orderRepository.ts:96`; `.../orderRepository.ts:14`. |
| Status | **NOT EXECUTED** — blocked on APK / QA backend configuration |

### Scenario 6 — Mobile Bag + pickup, Sierra Leone (accepted)

| Field | Specification |
| --- | --- |
| Objective | Mobile pickup is free, snapshots `Lumley, Freetown`, and satisfies the same country contract. |
| Actor | Signed-in Mobile QA user with a populated Bag. |
| Prerequisites | As Scenario 5. |
| Input / action | In-app checkout, pickup → `place-order` with `fulfilment: "pickup"`, `cart_version: 2`. |
| Expected HTTP response | `200`; `status: "placed"`, `payment_status: "awaiting_payment"`. |
| Expected DB state | One order with `country_code = 'SL'`, `delivery_fee_cents = 0`, `pickup_location = 'Lumley, Freetown'`, zone/address NULL; one job; Bag converted. |
| Expected error code | n/a. |
| Idempotency | Same-key retry returns the same order. |
| Inventory | As Scenario 5. |
| Evidence to capture | As Scenario 5, plus zero-fee and pickup-snapshot assertions. |
| Cleanup | As Scenario 5. |
| Sources | As Scenario 5; shared `place_variant_order` pickup branch. |
| Status | **NOT EXECUTED** — blocked on APK / QA backend configuration |

> Mobile cannot exercise a non-SL rejection through its UI. A Mobile negative test would
> require an out-of-band crafted request, which is outside the Mobile client contract and is
> not proposed here.

---

## 8. NEEDS RECONCILIATION — slots 8, 10, 12, 13, 14, 15, 16

These seven slots exist in the 17-scenario matrix but are **not** enumerated as controlled
staging test orders in the only surviving reference. Their original objectives are
unrecoverable: no file, commit, PR text or report describes them.

They are recorded here rather than invented. Each must be reconciled with the matrix author
before it can be specified or executed.

| Slot | Objective | Actor | Expected HTTP | Expected DB state | Status |
| --- | --- | --- | --- | --- | --- |
| 8 | Unrecoverable | Unknown | Unknown | Unknown | **NEEDS RECONCILIATION** |
| 10 | Unrecoverable | Unknown | Unknown | Unknown | **NEEDS RECONCILIATION** |
| 12 | Unrecoverable | Unknown | Unknown | Unknown | **NEEDS RECONCILIATION** |
| 13 | Unrecoverable | Unknown | Unknown | Unknown | **NEEDS RECONCILIATION** |
| 14 | Unrecoverable | Unknown | Unknown | Unknown | **NEEDS RECONCILIATION** |
| 15 | Unrecoverable | Unknown | Unknown | Unknown | **NEEDS RECONCILIATION** |
| 16 | Unrecoverable | Unknown | Unknown | Unknown | **NEEDS RECONCILIATION** |

What is *not* claimed about these slots:

- They are not claimed to be Web or Mobile controlled-order scenarios.
- They are not claimed to be read-only checks, CORS checks, or regression checks — that would
  be a guess.
- They are not renumbered, merged or dropped.

Consequence: the matrix is **complete in numbering** (all 17 slots accounted for) but
**incomplete in content** (7 of 17 unspecified). W4 executed on the 8 Web scenarios without
these seven, because W4's controlled-order subset never included them — but the 17-scenario
matrix as a whole cannot be called closed until they are reconciled.

---

## 9. Evidence capture template

For each executed scenario, record:

| Field | Required content |
| --- | --- |
| Scenario | Number and title |
| Timestamp (UTC) | Execution time |
| Environment | staging `gscihjjwhmvddrmcfpxp`; deployment id; migration ledger state |
| Actor | Staging user id (not email, not a secret) |
| Request | Method, function, `request_id`, `Origin`, redacted body (no JWT, no key) |
| Response | HTTP status + body |
| DB delta | Before/after counts for `orders`, `order_items`, `order_confirmation_jobs`, `inventory_ledger`, cart tables |
| Country proof | `orders.country_code` for the created order; unchanged value for any historical row touched by a read |
| Trust proof | Submitted vs persisted `total`, `delivery_fee_cents`, `delivery_zone_label`, `status`, `payment_status` |
| Email | `email_status` value, the persisted `order_confirmation_jobs.status`, and why both are expected |
| Verdict | PASS / FAIL / BLOCKED, with the specific assertion that decided it |
| Cleanup | What was created, who owns reset, whether it was reset |

Evidence must never include a JWT, service-role key, publishable key value, database password
or provider token. Redact before storing.

---

## 10. Cleanup and reset — historical specification

> **Note:** W4 created 4 test orders on staging. Cleanup is pending.

- Every accepted scenario creates real hosted rows. Nothing in this matrix may run until
  reset ownership is agreed (§3.3).
- Cleanup must not be "delete the orders and hope". The required record is: which order ids
  were created, which were reset, and what the resulting baseline is — so W4 is re-runnable
  and the earlier baseline stays interpretable.
- Historical NULL-country orders are **read-only evidence**. They must never be updated,
  backfilled or deleted to make a count tidy.
- If a scenario fails after creating an order, that order stays. A failure is recorded, not
  erased.

---

## 11. Prohibitions during execution — historical specification

> **Note:** These prohibitions applied during W4 execution. They remain in force for any
> re-execution.

- No access to production `wyvsbzcltrhnjeuijsva`.
- No hosted command without an explicit `--remote=gscihjjwhmvddrmcfpxp`.
- No migration, no schema change, no seed, no fixture identity in hosted data.
- No service-role key in a browser, log, report or chat.
- No real payment provider call; Orange Money and Afrimoney remain metadata only.
- No claim that placement means payment success.
- No deletion of another owner's order, and no cross-owner probing beyond the owner-scoped
  read in Scenario 17.
- No manufacturing of evidence: no fake users, no resends, no edited responses.

---

## 12. Open questions for independent review

1. **R1 — number→behaviour mapping.** The eight Web behaviours above are each verified, but
   their assignment to numbers 1–4, 7, 9, 11, 17 is reconstructed. Confirm or re-map.
2. **R2 — "7 Web scenarios" vs eight enumerated IDs.** Resolved as a miscount and corrected
   in `.codex/LUME_WEB_S02_RELEASE_READINESS_RECONCILIATION.md:139`; the eight enumerated IDs
   remain authoritative.
3. **R3 — service-level rejection probes.** Scenarios 3, 4 and 11 are blocked by the UI, so
   their HTTP expectations can only be observed with a crafted authenticated request. Decide
   whether W4 authorises that probe or accepts UI-level evidence only.
   — *W4 accepted UI-level evidence for scenarios 3 and 4. Scenario 11 was not runtime-tested.*
4. **R4 — slots 8, 10, 12–16.** Supply the original objectives, or confirm they are out of
   S02-01 scope permanently.
5. **R5 — email expectation.** Confirm `RESEND_API_KEY` is still absent on staging at
   execution time; if present, §5.1's `email_status: "queued"` expectation is wrong.
   — *Resolved: Resend is now active on staging per AGENTS.md. Email expectation needs revision for any re-execution.*
6. **R6 — reset ownership.** Name the owner and the permitted reset mechanism before the
   first order.
   — *W4 test orders created; cleanup still pending.*
