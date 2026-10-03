# Lumé House

Beautiful things live here.

## Overview

Modern home and lifestyle ecommerce for Sierra Leone, based in Lumley, Freetown.

**Production:** https://lume-house-delta.vercel.app

Market: Sierra Leone. Currency: NLE, displayed as **NLe**. Current catalogue: **20 active products**. Fulfilment: Freetown delivery and Lumley pickup. Money uses integer minor units (100 per leone).

This milestone fulfils the HNG individual ecommerce task; Lumé House continues beyond HNG. The roadmap below describes future work.

## Current Features

- Hosted catalogue, category filtering and reviewed local WebP photography.
- Temporary guest cart and authenticated persisted cart with quantity controls.
- Google sign-in, session restoration, sign-out and editable customer profile.
- Localized checkout with profile defaults, delivery zones, pickup and separate contact/payer numbers.
- Trusted atomic order creation, order success, durable My Orders and historical details.
- Branded server-side Resend confirmation with durable jobs and guarded retries.
- Responsive layouts, labelled controls, visible keyboard focus and reduced-motion support.

## Technology Stack

React 19, TypeScript, Vite and Tailwind CSS; Supabase PostgreSQL, Auth, RLS and Edge Functions; Resend transactional email; Vercel hosting.

## Architecture

Shared UI: `src/components`; business configuration: `src/config`; features: `src/features`; browser Supabase configuration: `src/lib/supabase`.

```text
Browser → Supabase Auth / owner-protected repositories
        → place-order Edge Function → place_order database transaction
                                    → committed order + items + email job
                                    → server-side Resend confirmation
```

Profiles are mutable customer defaults. Carts are current shopping intent. Orders preserve immutable customer, fulfilment and product/price snapshots; changing profiles or current products never rewrites order history.

## Supabase

The existing hosted project is **Lumé House**, reference `wyvsbzcltrhnjeuijsva`. Migrations 00100–00600 are applied. Seven application tables retain RLS: profiles, products, carts, cart_items, orders, order_items and order_confirmation_jobs.

Products load from hosted Supabase, ordered by display_order then ID. Loading, errors and an empty catalogue are explicit; no silent local fallback. The local catalogue remains a test/seed parity reference. See [Supabase documentation](supabase/README.md). Do not replay migrations or seed the existing hosted project as a setup step.

## Google Authentication

```text
Browser → Google → Supabase OAuth callback → application /auth/callback
        → persisted Supabase session
```

Supabase owns identity; the implemented browser flow uses PKCE, session restoration and sign-out, not custom passwords.

Current production references:

- Authorized application origin / Supabase Site URL: `https://lume-house-delta.vercel.app`.
- Google OAuth redirect: `https://wyvsbzcltrhnjeuijsva.supabase.co/auth/v1/callback`.
- Application callback in the Supabase allowlist: `https://lume-house-delta.vercel.app/auth/callback`.

Google client credentials belong only in private provider settings. Local development needs separately allowlisted exact origins/callbacks. Optional VITE_AUTH_REDIRECT_URL must be same-origin; default is current origin plus /auth/callback.

## Cart Persistence

Guests use sessionStorage with IDs/quantities only, preserving intent across same-tab OAuth redirects. Authenticated carts use owner-protected carts/cart_items and restore on reload/later login. Logout immediately hides private data.

On login, guest quantities combine with existing quantities, capped at 99. Successfully persisted guest lines are checkpointed and removed; failed/unattempted lines remain for retry. This merge is a sequence of cart writes, not an atomic checkout. Concurrent device quantities use last-write-wins; ambiguous network failures can require reconciliation. Current hosted prices determine totals.

## Trusted Checkout

Authenticated checkout calls place-order, which validates the JWT and calls place_order using that identity. The database transaction validates owned cart, active products, quantities, current prices and delivery configuration. Submitted prices only detect stale quotes; browser totals, fees, ownership, zone labels and paid status are never authority.

Owner-scoped request idempotency protects retries. Order, immutable items, confirmation job and cart clearing commit atomically. Failed creation leaves no partial order/cart conversion. Checkout edits never silently update saved profile defaults. Contact/payer numbers remain separate; the reuse control follows contact edits and preserves independent payer input.

Provisional owner configuration—not researched courier rates or precise geographical boundaries:

| Zone | Coverage | Fee |
|---|---|---|
| zone-1 | Goderich to Lumley | NLe 40 |
| zone-2 | Lumley to Congo Cross, including Aberdeen | NLe 50 |
| zone-3 | Congo Cross to Central Freetown | NLe 60 |

Delivery requires Freetown address and zone. Pickup in Lumley, Freetown costs NLe 0 and needs no delivery address. The trusted transaction derives and snapshots fee/zone information.

## Orders and Order History

My Orders lists durable owner-readable orders newest first. Details show historical item names, quantities/unit prices, contact/fulfilment snapshots, totals, statuses and masked payer last four digits. Orders survive refresh, logout and later sign-in with the same account.

Genuine human E2E verified Google login, profile/cart persistence, checkout, durable order creation/history/details, refresh, logout privacy and restoration. The final audit found no evidenced HNG submission blocker. Broader cross-user authenticated runtime testing remains hardening; local ownership-denial tests and hosted policies are verified.

## Transactional Email

**Resend is the implemented provider. Mailgun and Brevo are not integrated.** Email runs server-side through Supabase Edge Functions using RESEND_API_KEY, never a VITE variable.

Confirmation uses the durable order recipient and immutable snapshots. Branded HTML/plain text contains reference, customer, items/quantities/prices, subtotal, delivery, total, fulfilment and payment-awaiting-confirmation wording. Email failure never deletes or rolls back the order.

Durable jobs use leases, guarded retries, frozen sender and order-based provider idempotency. Sent means provider acceptance, not guaranteed delivery. External exactly-once delivery is not promised. No scheduled retry worker exists. Order Details offers owner-authorized retry; attempts outside the safe provider deduplication window require manual reconciliation.

Default testing sender: **Lumé House <onboarding@resend.dev>**, unless trusted RESEND_FROM overrides it. [Resend restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain) limit testing-sender recipients to the Resend account email until an owned sender domain is verified.

A genuine confirmation was accepted/sent, reported delivered, accepted by Gmail SMTP and later manually found in **Gmail Spam**. Primary Inbox delivery is not claimed. A verified custom sender domain/deliverability improvements remain production hardening. hello@lumehouse.sl is display-only, not a verified transactional sender.

## Payment Status

Orange Money/Afrimoney are payment-method selections/metadata only. No real payment processing, collection or provider verification exists. Phone validation checks +232 plus eight digits, not account registration. No PIN/OTP is collected.

Orders initialize **status=placed / payment_status=awaiting_payment**. Successful placement never means payment successful.

## Deployment

Frontend production is on Vercel. Root vercel.json supplies the /index.html SPA fallback for BrowserRouter deep links, including account/order/auth callback routes, while preserving static assets.

place-order and order-email are deployed and active in Supabase. CORS uses exact allowed origins, including production and localhost/127.0.0.1 ports 5173/5174. ALLOWED_ORIGINS overrides the fallback and must include intended origins; never use *.

## Environment Variables

| Environment | Variables | Boundary |
|---|---|---|
| Browser/Vercel | VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY | Public URL/publishable key only |
| Browser/Vercel, optional | VITE_AUTH_REDIRECT_URL | Same-origin callback |
| Supabase Edge Functions | RESEND_API_KEY | Private server secret |
| Supabase Edge Functions, optional | RESEND_FROM, ALLOWED_ORIGINS | Verified sender override / exact origins |

Use .env.example as the browser template and ignored .env.local locally. supabase/functions/.env.example documents server configuration. Hosted Supabase supplies built-in server variables. No service-role keys, Google secrets, database passwords or email keys belong in browser/VITE/examples/logs/Git.

## Local Development

Requires Node 22.12+:

```powershell
npm.cmd ci
# Copy .env.example to ignored .env.local; fill browser-safe values privately.
npm.cmd run dev
```

Use only the intended existing project and allowlist your local callback. Never use production as a SQL fixture or create fake customers/orders. Checkout contact/payment drafts are not persisted locally.

## Validation / Tests

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run typecheck:functions
npm.cmd run build
npm.cmd test
git diff --check
```

Baseline: 44 passing tests. Disposable SQL validation requires Docker:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File supabase/tests/run-local.ps1
```

The final audit passed163 SQL assertions/messages. The harness uses an isolated local PostgreSQL container and rollback fixtures, never hosted data. Local mocks/SQL, hosted read-only checks and human E2E are distinct evidence.

## Security

Auth identity and owner RLS protect private data. Browser roles cannot directly write orders/items or access email jobs. Trusted pricing uses bounded integer arithmetic and immutable snapshots. place_order is deliberately authenticated-callable with internal ownership/input validation; anon is denied. Email claim/finish functions are service-only. Both Edge Functions explicitly validate real JWT users despite gateway verify_jwt=false.

Do not rewrite applied migrations; use reviewed forward changes. Keep environment files, .codex evidence, Supabase temp metadata and build/cache output ignored.

## Known Limitations

- No live mobile-money processing; payment remains awaiting_payment until a future trusted workflow.
- Testing-sender recipient/deliverability restrictions; verified domain and scheduled retry worker remain future work.
- Profile name/phone mismatch is an unproven deferred UI/autofill investigation. Named mappings are correct; the hosted constraint rejects the invalid phone string; that test profile row was not verified independently.
- Existing Vite >500KB chunk advisory is non-blocking.
- Admin/product-management functionality is future work. These limitations are not evidenced HNG submission blockers.

## Post-HNG Roadmap

Protected /admin/roles/dashboard; product CRUD; Supabase Storage/image management; inventory/stock and variants; order management/status workflow; analytics; real Orange Money/Afrimoney integrations; verified sender/domain and deliverability; remaining UI/profile polish and optional bundle optimization. These are future capabilities, not current implementation.
