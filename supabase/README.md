# Lumé House database foundation

Hosted Supabase foundation: **VERIFIED on 2026-10-02** in the existing hng-shop project (wyvsbzcltrhnjeuijsva, eu-west-1). Authorized read-only inspection established an empty public application schema and no applied migration history (classification A). A dry run selected exactly the two prepared migrations; both were then applied through the CLI and recorded in hosted history, followed separately by seed.sql. No reset or history repair was needed. Do not create another hosted project. The frontend continues using its local catalog.

Hosted verification found all seven application tables with RLS enabled, thirteen intended ownership/active-product policies, twelve exact active NLE catalog rows and zero rows in profiles, carts, cart_items, orders, order_items and order_confirmation_jobs. Browser-role grants prevent catalog/order writes and all access to confirmation jobs. A read-only rollback query under the hosted anon role returned twelve active NLE products. Real authenticated cross-user sessions, PostgREST/browser requests and future checkout/email integrations are not verified by these checks. No fake customer/order data was inserted. Further application features remain separately authorized phases.

## Safe forward migration

20261002000100_commerce_foundation.sql is preserved unchanged. Run 20261002000200_lume_house_foundation.sql forward from that exact schema, then seed.sql. Fresh databases run both migrations in filename order. The original migration's old defaults are historical; the final schema restricts active products and every new order to NLE.

The forward migration locks affected tables and aborts atomically if ANY historical orders exist. Their payment/fulfilment semantics cannot safely be inferred. This requires a separately reviewed data migration, never deletion of orders. Unexpected schema drift also needs reconciliation. US-style order columns are removed only after proving orders empty under lock. Never drop/reset a hosted database or replay the original migration against existing tables.

Product IDs change from UUID to text to retain the current local IDs (amber-candle, etc.). Existing UUIDs remain exact strings, with surviving cart references and restored foreign keys. Existing non-NLE products become inactive, preserving their currency/price; they are not relabeled or converted. Legacy inactive currencies are allowed only for migration safety. Active products must be NLE and new product currency defaults to NLE.

The obsolete seed is replaced completely with the twenty local Lumé House products. ON CONFLICT (id) DO NOTHING makes repeats safe without resetting subsequent trusted catalog edits. Fresh local setup has twenty products; upgraded setups may additionally retain inactive legacy rows. Columns ending in _cents retain compatibility but mean **integer minor units, 100 per NLE**, not USD cents. No floating-point money is used.

Before any future hosted change, inspect actual tables/constraints/policies, historical order counts and supabase_migrations.schema_migrations. SQL Editor executions may not be recorded in CLI history. Reconcile that history before db push. If the original migration is already applied exactly and orders are empty, only the forward migration and new seed are candidates. If tables are absent and neither migration is applied, both are candidates. Schema drift or existing orders blocks automatic application. Back up/review real data first. Both foundation migrations are now applied; do not replay them. The seed's DO NOTHING behavior preserves existing edits, so inspect conflicts rather than assuming a repeated seed corrects differing values.

## Relationships and meaning

```text
auth.users -> profiles (1:1 mutable defaults)
auth.users -> carts (one per identity) -> cart_items -> products
auth.users -> orders -> order_items -> optional product reference + historical snapshots
                     -> order_confirmation_jobs (one server-only work record per order)
```

Profile = mutable customer defaults/convenience data. Cart = current shopping intent using current product pricing. Order = durable historical transaction using immutable checkout/product/price snapshots. Orders do not depend on mutable profiles for delivery/contact history. Carts/orders directly reference Auth identity, so a missing/deleted profile does not erase history or prevent cart use.

| Table | Design |
| --- | --- |
| profiles | Auth UUID PK/FK; optional name, normalized Sierra Leone phone, default street/landmark, area/community, city; timestamps. No email duplicate. |
| products | Stable text ID, name/description/category, integer price, currency, local image path, active flag, display order/color, timestamps. |
| carts | UUID ID, unique Auth owner, creation timestamp. |
| cart_items | UUID ID, unique cart/product pair, quantity 1-99, timestamps. No authoritative paid-price snapshot. |
| orders | UUID ID, unique LH- reference with sixteen random hex digits, Auth owner, immutable customer/fulfilment/money snapshots, separate order/payment states, provider, optional suffix/reference, paid timestamp and timestamps. |
| order_items | UUID ID, order FK, nullable product FK, historical name, quantity 1-99, integer paid unit price. Derive line total as quantity times snapshot price. |
| order_confirmation_jobs | Order PK/FK, pending/sent/failed status, attempts, retry time, sent time, timestamps. No customer access/provider secrets. |

Profiles are lazily created by the authenticated owner through restricted insert/upsert when the Profile feature is implemented. There is no new auth.users trigger, custom authentication or profile seed. Defaults can be null, but supplied blank strings are rejected. The current account email comes from Auth. Orders deliberately retain an immutable checkout contact email for historical contact and queued confirmation: it does not change when the Auth email changes, and is not a profile mirror.

## Historical constraints

Order states: placed, confirmed, processing, ready_for_pickup, out_for_delivery, completed, cancelled. Payment states: pending, awaiting_payment, paid, failed. Placement defaults to pending; paid requires paid_at and non-paid forbids it. Provider is orange or afri, matching frontend selection. None of these fields establish real provider verification. Transition authorization/refunds/provider callbacks belong to future trusted work.

Delivery requires street/landmark, area and Freetown city snapshot; instructions are optional. Pickup requires a location snapshot, zero fee and null delivery fields. ready_for_pickup applies only to pickup; out_for_delivery only to delivery. The trusted endpoint must supply the pickup location, currently Lumley, Freetown. Delivery fee is required/nonnegative with no default or invented fee matrix. The future endpoint must refuse unknown fees until an approved matrix exists. Total must equal subtotal plus fee.

Deferred constraints require at least one item and the sum of quantity times historical unit price to equal subtotal at transaction end. Orders and items must be written in ONE transaction, not separate autocommit API requests. These constraints check consistency, not authoritative product pricing. A trusted server must still fetch current prices.

Triggers reject financial/customer/fulfilment snapshot updates and item name/quantity/unit-price updates even by trusted roles. Product references may become null on deletion; reassignment to another product is forbidden. State/verified payment metadata remain server-updatable. Corrections/refunds need a later explicit design.

Product changes/deactivation do not alter historical items. Product deletion removes temporary cart references and sets historical product references null. Cart deletion never deletes orders. Auth deletion cascades mutable profiles/carts but is restricted while orders exist until a retention/account-deletion policy is approved. Browsers cannot delete orders; explicit trusted order deletion cascades items/jobs.

History index (user_id, created_at DESC, id DESC) supports stable pagination/list/detail queries. Human order references are unique; future creation must retry improbable random collisions. Non-null provider transaction references are unique within the provider. RLS protects ownership even if a reference is known.

## Payment metadata and privacy

Store only optional payment_phone_last4 for masked history, not a full payer number merely for display. A future trusted initiation flow can hold normalized payer input transiently and discard it; a real provider's retry needs must be reviewed before adding persistent storage. An opaque, non-secret provider reference can be recorded later. No PIN, OTP, token or credential field exists. Contact phone is a SEPARATE required full normalized fulfilment snapshot, not assumed to equal payer phone. Keep sensitive inputs out of logs. Frontend general number-format validation is not account/provider verification.

## RLS and grants

All seven tables have RLS and explicit privileges. Public/anonymous and authenticated visitors read active products only; browser roles cannot write the catalog. Authenticated customers can read/create/update only their profile; column grants prohibit changing owner/timestamps or deletion. Customers can read/create/delete only their own cart; read/insert/update quantity/delete only its items. Additions/quantity updates require active products. Ownership columns cannot be changed by browsers; inactive intent can be removed.

Orders and items are owner-readable only, with NO browser insert/update/delete grants or policies. No browser paid-status/totals updates. Confirmation jobs have no browser grants/policies and are server-only. Trusted service_role access does not remove the need for secure server validation. Its keys must never be exposed in VITE variables or browser code.

## Future trusted checkout and email

An authenticated Edge Function or equivalent must verify Auth identity and ownership, validate quantities/active products, consistently read or lock authoritative prices, validate checkout snapshots/coverage, calculate approved fees, atomically create order and immutable items, clear/convert cart and enqueue one confirmation job. Browser unit prices, subtotal, fees, total and paid status are NEVER authoritative. Multiple Supabase HTTP writes are not atomic: a trusted-only database transaction helper/RPC may be necessary. No order endpoint/RPC is implemented now. Order retries need a deliberate idempotency contract before Place Order is enabled.

A future worker sends from committed order/contact/item snapshots after persistence. Email failure records retry work and leaves the order intact. One job per order prevents duplicate enqueue but cannot alone guarantee exactly-once external delivery. Implement atomic claiming/locking and stable order-based provider idempotency (or reconcile uncertain sends) for crash/concurrency safety. No worker or email provider is implemented. hello@lumehouse.sl is display-only; later testing uses chrisbarbz17@gmail.com, never seeded recipients. Mailgun is not mandatory.

## Local SQL verification

Requires Docker and postgres:14.1-alpine:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File supabase/tests/run-local.ps1
```

The runner creates lume-foundation-sql-check without network/published ports, checks each command and removes the container in finally. Trust authentication is confined to this disposable environment. It runs the unchanged migration, tests populated-order refusal and UUID/cart preservation with rollback-only identities, applies the forward migration, seeds twice, and tests ownership/constraints/history inside rollback. Final assertions ensure no identities/private fixtures remain and twenty NLE products are unchanged.

NEVER apply supabase/tests/ files to hosted Supabase. The bootstrap emulates only auth.users/auth.uid and SQL roles; it does not test Google OAuth, real JWTs, PostgREST, hosted Supabase grants/extensions/Auth triggers or browser sessions. Static inspection, local executable PostgreSQL checks and hosted verification are distinct. Mocked product tests verify local catalog-to-NLE repository mapping without contacting hosted services.

Official references: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth-linked profiles](https://supabase.com/docs/guides/auth/managing-user-data), [migration history](https://supabase.com/docs/guides/local-development/database-migrations).

## Local storefront refinement — hosted changes pending

Hosted verification above is the historical 12-product foundation, not verification of the expanded catalog. This UX phase does not connect to or mutate hosted Supabase. Project display name is now Lumé House; reference unchanged. Local seed now has 20 stable IDs; existing first twelve unchanged. Later authorized reconciliation must inspect row conflicts before adding eight products; never blindly overwrite trusted catalog edits.

20261002000300_delivery_zone_snapshots.sql is an additive local-only forward migration. Apply after both existing migrations only when authorized. It adds nullable delivery_zone_id and delivery_zone_label (coverage snapshot), accepts only paired nulls or valid delivery pairs, forbids pickup zone values and protects both against update. Null legacy pairs preserve existing history without guessing a zone; the future trusted order endpoint must require an active configured zone for NEW delivery orders. RLS/grants and existing historical guards remain unchanged. It deliberately stores no FK to mutable temporary zone configuration.

Provisional frontend zones: zone-1 Goderich–Lumley 4000 minor units; zone-2 Lumley–Congo Cross including Aberdeen 5000; zone-3 Congo Cross–Central Freetown 6000. These are product configuration, not researched courier rates or exact geographical boundaries. No permanent DB fee matrix. Future trusted server reads authoritative approved configuration and snapshots the actual fee and coverage; browser-submitted prices/fees/totals are untrusted.

Neither current profile/contact DB constraints nor the existing payment model restrict provider-specific phone prefixes: normalized +232 plus eight digits is already compatible. No phone-related migration needed. Payer input remains transient with optional last4 history; no secrets/PIN/OTP. Future success means persisted order placed, with pending/awaiting_payment, never payment verified. Collection instructions/provider integration remain deferred.

The local runner additionally applies/tests this migration against rollback-only historical delivery data, checks pairs/pickup/immutability/RLS/grants, rolls back fixtures, then applies it to the isolated database before the existing suite. No Supabase test file is safe for hosted execution.
