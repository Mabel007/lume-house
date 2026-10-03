# Lumé House Supabase

## Current hosted state

Existing project **Lumé House**, reference wyvsbzcltrhnjeuijsva, is active. Migrations 00100–00600 are applied. Hosted catalogue has 20 active NLE products matching local catalogue/photography. Google Auth, profiles, authenticated carts, trusted checkout, durable orders/history and Resend confirmation work. place-order and order-email are deployed/active; Resend is configured server-side.

Genuine human E2E verified login, profile/cart refresh, checkout, durable order/history/details, logout privacy and restoration. Resend accepted/sent a genuine confirmation, reported delivery; Gmail SMTP accepted it and the human later found it in Gmail Spam. No Primary Inbox claim. Automated/local SQL, hosted read-only and human evidence are distinct.

## Schema and ownership

```text
auth.users → profiles
auth.users → carts → cart_items → products
auth.users → orders → order_items (product reference + historical snapshots)
                    → order_confirmation_jobs
```

| Table | Purpose/security |
|---|---|
| profiles | Auth UUID PK, mutable defaults, own read/insert/update; Auth supplies account email |
| products | Stable IDs/current integer NLE pricing/image/category/active metadata; active public reads, no browser writes |
| carts | One authenticated owner's current intent |
| cart_items | Unique cart/product, quantity 1–99, current prices; owner access |
| orders | Durable LH-reference, owner, immutable checkout/fulfilment/money snapshots; owner reads only |
| order_items | Historical names/quantities/unit prices; owner reads through order; no browser writes |
| order_confirmation_jobs | Server-only durable status/attempts/leases/frozen sender/provider ID/safe error |

All seven tables have RLS. Profiles are mutable defaults; carts are current intent; orders are historical snapshots. Checkout email is independently snapshotted, not copied into profiles. Product/profile changes never rewrite orders. Product deletion can null a historical reference without deleting the snapshot; cart deletion does not delete orders. Auth deletion with retained orders is restricted pending retention policy.

Browser privileges forbid direct order/item writes, job access and ownership reassignment. Historical snapshot triggers also protect against unauthorized trusted edits.

## Trusted transaction

place-order verifies JWT through Auth getUser and calls public.place_order with that identity. The fixed-empty-search-path SECURITY DEFINER RPC deliberately grants EXECUTE to authenticated, never anon; it independently derives auth.uid() and validates real identity.

It locks the owned cart/current active NLE products, validates quantities/bounded integer totals and derives names/prices. Submitted unit prices only detect stale quotes; user ownership, totals, fee/zone label and paid state are not browser authority.

Trusted provisional owner zones: zone-1=4000 / Goderich to Lumley;zone-2=5000 / Lumley to Congo Cross including Aberdeen;zone-3=6000 / Congo Cross to Central Freetown. Pickup=0 / Lumley, Freetown. Delivery requires supported Freetown details; orders snapshot zone/fee/address or pickup. Fees are product configuration, not researched courier rates.

Owner advisory lock plus unique(user_id,checkout_request_id) protects durable idempotency. Order/items/job creation, total consistency and cart clearing commit in one transaction; failed conversion leaves no partial data. New orders initialize **status=placed, payment_status=awaiting_payment**. No real Orange Money/Afrimoney processing. Payer number is transient; only last4 persists, never PIN/OTP. Contact phone is a separate fulfilment snapshot.

## Resend confirmation

Resend is active; Mailgun/Brevo are not integrated. Sending is attempted after committed placement or owner-authorized order-email retry. Recipient/content comes only from persisted order snapshots. Email failure never deletes/rolls back the order.

Service-only claim/finish RPCs use claim token, two-minute lease, one-minute retry delay, frozen sender and provider ID. Browsers cannot execute them. States: pending/processing/sent/failed; sent is provider acceptance, not delivery guarantee. Stable key lume-order-confirmation-v1-{order.id} reduces duplicates within the provider window. After 23 hours from first attempt, uncertain/failed jobs require manual reconciliation rather than resend beyond the 24-hour deduplication window. No external exactly-once promise or scheduled worker.

Default sender **Lumé House <onboarding@resend.dev>** unless RESEND_FROM overrides it. Testing sender permits only the Resend account recipient; arbitrary recipients require a verified owned domain. See [Resend restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain). hello@lumehouse.sl is display-only. Verified sender/domain/deliverability remain future hardening.

## Configuration boundaries

Browser-safe: VITE_SUPABASE_URL,VITE_SUPABASE_PUBLISHABLE_KEY,optional same-origin VITE_AUTH_REDIRECT_URL. Production: https://lume-house-delta.vercel.app.

Google callback: https://wyvsbzcltrhnjeuijsva.supabase.co/auth/v1/callback. App callback: https://lume-house-delta.vercel.app/auth/callback. Production Site URL/origin/callback are configured; local development needs separately allowlisted URLs. Google secrets stay in private provider settings.

Server: RESEND_API_KEY,optional RESEND_FROM/ALLOWED_ORIGINS; built-in Supabase server credentials stay server-side. Never use private values in VITE/examples/Git. CORS default includes production and localhost/127.0.0.1 ports 5173/5174; overrides must preserve intended exact origins, never *. Gateway verify_jwt=false supports publishable configuration; explicit getUser/database identity checks remain mandatory.

## Applied migration history

| Version | Purpose |
|---|---|
| 20261002000100 | Original commerce foundation preserved |
| 20261002000200 | Lumé House profiles/NLE/ownership/historical reconciliation |
| 20261002000300 | Immutable delivery-zone snapshots |
| 20261002000400 | Atomic checkout/idempotency/durable email processing |
| 20261003000500 | Reviewed product photography metadata |
| 20261003000600 | Remaining reviewed photography metadata |

These are applied history, not replay instructions. Never reset hosted data, rewrite applied history or replay seed. seed.sql is a reproducible local reference, not an automatic production operation. Authorized hosted changes require inspection/reviewed forward changes; current catalogue updates never rewrite historical order items.

## Local validation

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run typecheck:functions
npm.cmd run build
npm.cmd test
git diff --check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File supabase/tests/run-local.ps1
```

Baseline: 44 tests and 163 SQL PASS assertions/messages. Function typecheck uses installed SDK/Deno declarations, not native Deno execution. SQL runner uses disposable network-isolated postgres:14.1-alpine, rollback-only synthetic Auth identities and cleanup in finally. It checks migrations, repeated local seed, ownership denial, snapshots, repricing/zones, atomic conversion/idempotency and email leases. End checks ensure fixtures are gone. Never run supabase/tests against hosted data; no project credentials are used. Emulated SQL/Auth is distinct from genuine Google/JWT/PostgREST E2E.

## Remaining work

Testing-sender limitations, verified domain/deliverability, scheduled retry worker, live payments, deferred unproven profile/autofill issue and broader authenticated cross-user runtime testing. Admin/product management, Storage, inventory, variants, order workflow and analytics are post-HNG. These are not evidenced submission blockers.
