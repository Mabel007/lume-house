# Lumé House

Beautiful things live here. A modern home and lifestyle storefront for Lumley, Freetown, Sierra Leone, initially serving Freetown. Country code: SLE; currency: NLE, displayed consistently as NLe (for example NLe 450 or NLe 1,250). All prices use integer minor units (100 per leone).

## Current product

React 19, strict TypeScript, Vite and Tailwind CSS. The existing SPA architecture supports a local 20-product catalog, category filtering, accessible product cards, temporary cart, quantity limits (1–99), current-price calculations, empty/unavailable items, checkout options and unknown routes. Owner-supplied identity/contact data lives in src/config/shop.ts. Merchandise, prices and local SVG artwork remain fictional and easy to replace in src/features/products/catalog.ts; this is not a live inventory system.

Checkout collects full name, contact phone, email, street address/landmark, area/community, free-text city/town, delivery instructions and a required delivery zone. Delivery is limited to Freetown. Provisional selectable zones in src/config/fulfilment.ts: zone-1 Goderich to Lumley, NLe 40; zone-2 Lumley to Congo Cross including Aberdeen, NLe 50; zone-3 Congo Cross to Central Freetown, NLe 60. These are product-owner configuration, not researched courier-market pricing or precise geospatial boundaries. They will be refined. No undefined future zones are active. Missing zone/unsupported city leaves the total incomplete. Pickup in Lumley, Freetown costs NLe 0 and requires no delivery address. A future trusted server must load authoritative zone fees itself, never trust browser totals.

Orange Money and Afrimoney selection and number entry are frontend UX only. Validation checks the current product format: +232 followed by eight national digits, without restrictive provider-prefix lists. Spaces, parentheses, hyphens, local eight-digit numbers, a local leading zero, 232 and 00232 formats normalize centrally. Examples are non-exhaustive and do not establish mobile account/provider registration. Contact and payer numbers are separate: “Use my contact phone number” follows edits while selected; turning it off restores the independent payer input. Invalid/missing contact input remains invalid; nothing is persisted. Payment is never initiated or verified. Future payment states remain pending, awaiting_payment, paid and failed.

The storefront uses an editorial Lumé Edit, collection navigation and a 20-piece catalog. Four columns at 1200px+, three at 900px+, two at 360px+, one below 360px. Local original SVG illustrations remain placeholders; final owned photography is a future content pass. The shared image frame can accept editorial photographs without changing card layout. Photography direction: warm cream/stone/wood, natural window light, realistic shadows, tactile surfaces and varied restrained scenes. No third-party photographs or hotlinks. CSS motion is restrained and disabled under prefers-reduced-motion.

Order placement is disabled. There are no persisted orders, payments, authenticated users, confirmation messages or emails. Cart resets on refresh; checkout information is not persisted locally or transmitted by this application. No personal development data is prefilled.

Display contacts: +232 76 521207; Lumley, Freetown, Sierra Leone; hello@lumehouse.sl. The email is brand information only: no mailbox/domain ownership or sender capability is assumed. Social links are omitted until real handles exist.

## Local setup and validation

Node.js 22.12+ and npm:

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm run build
npm test
git diff --check
```

Use npm.cmd instead of npm in Windows PowerShell if execution policy blocks npm.ps1. No environment configuration is required for this local-catalog phase. Build outputs ignored dist/. Production SPA hosting will need unmatched routes rewritten to /index.html.

Tests cover currency, new catalog totals/repricing, quantity invariants, pickup and delivery configuration, phone normalization and general payment-number format and contact-number reuse. Existing product-boundary, mocked Supabase request, configuration-safety and component rendering tests remain. Mocked request tests do not verify hosted Supabase.

## Supabase database foundation

The intentionally preserved Supabase client/repository and SQL foundation have now been reconciled for Lumé House through a forward migration. The original migration remains unchanged; the local seed now matches all twenty local NLE products and IDs. Profiles, owner-isolated carts, historical orders/items, delivery/pickup/contact snapshots, separate mobile-money payment status and a server-only confirmation job model are prepared. Runtime stays on the local catalog, cart stays in memory and Place Order remains disabled.

Hosted foundation was **verified on 2026-10-02** (project now named Lumé House) in the existing hng-shop project: both prepared migrations are recorded, all seven application tables have RLS enabled, and twelve active NLE products matched the then-current local catalog. The six customer/cart/order/job tables are empty. Actual policies and browser-role grants were inspected; a hosted anon-role query read all twelve products. Genuine authenticated cross-user sessions and PostgREST/browser integration remain untested. The frontend still uses its local catalog. No Google OAuth, profile/order UI, trusted checkout endpoint, payment API or email worker has been implemented.

See [database design, migration safety and local SQL tests](supabase/README.md) for relationships, grants/RLS, historical snapshots, payment privacy and future trusted checkout/email boundaries. Local SQL tests use isolated rollback fixtures, not genuine Supabase Auth verification.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File supabase/tests/run-local.ps1
```

## Next full-stack phase

Keep the existing product context/validated adapter boundary and cart product-ID/quantity model. No additional generic service abstraction is needed now. Hosted schema and catalog are prepared; reconnecting the runtime requires a separate controlled integration with browser-safe configuration and actual request verification. Never drop or reset existing tables blindly. Use only the existing hng-shop project. Public VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY may eventually live in ignored .env.local; all VITE_ data is public. Never put service-role keys, OAuth client secrets or email credentials in frontend variables or Git.

Future authorized work: Supabase Google authentication with validated redirect URLs, public product reads, user-owned cart persistence with RLS, trusted checkout and order history, logout/reopen/login persistence checks, provider-agnostic transactional email and production deployment. Authentication should own session lifecycle separately from cart and product concerns.

Trusted server-side order creation must authenticate ownership, validate quantities/availability, retrieve database prices, calculate approved delivery charges independently, and atomically persist orders plus order_items. Browser totals are never authoritative. Cart lines use current prices; historical order items snapshot the actual paid unit price and product name. Order history must read user-owned durable records, not cart state. Provider callbacks must be authenticated and idempotent before marking paid. Only after successful durable order persistence should a trusted, duplicate-protected service send confirmation through a selected email provider. Mailgun is not mandatory.

Later integration test fixtures remain local/developer-only; no personal customer data is prefilled.

No commit, push, PR or deployment is authorized. .codex/ contains local-only reports and is ignored by Git.

## Pending hosted reconciliation and future checkout

This UX phase made NO hosted connection or mutation. Hosted catalog remains 12 products. The expanded 20-product seed and additive 20261002000300_delivery_zone_snapshots.sql are LOCAL preparation only. Before separately authorized application, inspect current hosted history/schema/counts, compare all existing product fields, apply only the pending migration and reconcile eight additions. ON CONFLICT DO NOTHING preserves trusted edits; it is not a correction mechanism for mismatched rows.

New nullable delivery_zone_id/label snapshots preserve legacy orders with unknown zones and reject pickup zone values or incomplete pairs. Snapshot updates are immutable. Future trusted creation must require a configured zone for new delivery orders and snapshot its coverage label and actual fee; legacy null pairs are retained without guessing. No zone-definition FK or permanent fee table is added.

Future durable success copy should say “Your order has been placed”, with order status placed and payment pending/awaiting_payment; it must never equate placement with payment success. No confirmation page is simulated now. Merchant/USSD/provider collection instructions remain undecided until a genuine payment method exists. No PIN or OTP is collected.
