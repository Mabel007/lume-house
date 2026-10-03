# Lumé House

## Purpose and current scope
Maintain the implemented Sierra Leone ecommerce application. React 19/TypeScript/Vite is deployed on Vercel; Supabase PostgreSQL/Auth/RLS and Google OAuth own identity/persistence. Hosted products, profiles, authenticated carts, trusted checkout, durable order history and server-side Resend confirmations are implemented with genuine human E2E evidence. Preserve validated behavior and avoid unnecessary architecture replacement. Never stage, commit, push, create a PR, deploy or mutate hosted resources without task authorization.

## Engineering
Use strict TypeScript, functional React and explicit types. Shared UI belongs in src/components, replaceable business configuration in src/config, business features in src/features and browser Supabase configuration in src/lib/supabase. Store integer NLE minor units; format centrally as NLe. Derive totals, avoid redundant state, unnecessary dependencies and speculative abstractions.

## Commerce and identity invariants

- Supabase Auth/Google owns identity. Never simulate users or trust browser user IDs for ownership. Preserve JWT validation and owner RLS.
- Hosted products supply current pricing. Carts are current intent, not history. Profiles are mutable defaults; checkout edits must not silently save them.
- place-order plus validated place_order owns transactional creation. Derive prices, currency, zone fees and totals in trusted execution. Submitted quote prices only detect changes; never trust browser totals, labels or paid status.
- Preserve atomic order/items/job creation and cart conversion, owner-scoped idempotency, bounded arithmetic and fixed SQL search paths. No direct browser order/item writes or job access.
- Orders/items preserve immutable customer/fulfilment/zone/product/price snapshots. Current profile/catalog changes never rewrite history. New orders start placed/awaiting_payment, never paid merely because placement succeeded.
- Orange Money/Afrimoney are metadata only; no real processing/provider verification exists. Phone validation is format-only. No PIN/OTP; payer history retains only masked last4.
- Resend confirmation follows durable persistence. Email failure must never rollback/delete orders. Preserve service-only processing, leases, guarded retries and order-based provider idempotency; do not promise external exactly-once delivery.

## Database and hosted safety
Use the existing Lumé House project wyvsbzcltrhnjeuijsva; do not create another without explicit authorization. Migrations 00100–00600 are applied. Never rewrite applied history/reset hosted data/replay migrations or seed to resolve uncertainty. Inspect first and use reviewed forward changes when authorized. Preserve RLS/grants/snapshot protections. SQL fixture identities belong only in isolated rollback tests, never production seed/runtime data.

## UX and content
Preserve warm editorial branding, reviewed images, responsiveness and accessibility: semantic landmarks, skip link, focus-visible states, labels, meaningful alt text, touch targets, reduced motion and explicit loading/error/empty states. Never add HNG/student/demo customer copy, unsupported business claims or fake social links. hello@lumehouse.sl is display-only, not a verified sender.

Provisional owner-configured zones: zone-1 NLe 40, zone-2 NLe 50, zone-3 NLe 60; pickup Lumley, Freetown is free. These are not researched courier pricing/geospatial boundaries. Preserve trusted fees/snapshots. Order success means placed/payment awaiting confirmation, not payment successful.

## Environment and email evidence
All VITE values are public. Browser uses public project URL/publishable key and optional same-origin auth redirect. Never expose service-role keys, Google secrets, database passwords or Resend API keys in browser/VITE/source/examples/logs/Git. Ignore local env, .codex evidence, Supabase temp/build/cache output. Never request secrets in chat or print them.

Resend is active; Mailgun/Brevo are not integrated. Default sender Lumé House <onboarding@resend.dev> has testing recipient restrictions until a verified owned domain is configured. Genuine confirmation was accepted/sent, reported delivered and found in Gmail Spam; do not claim Primary Inbox placement. Distinguish provider acceptance/delivery/human receipt and never manufacture evidence via fake users/orders or email resends.

## Validation
Run lint, frontend/function typechecks, build, existing tests and git diff --check. Use the disposable local SQL harness for transaction/RLS changes, never hosted fixtures. Preserve quantity/repricing/zone/idempotency/atomicity/ownership/snapshot/email-failure tests. Browser-check relevant responsive/keyboard/routes where tooling permits. Distinguish source, automated, hosted read-only and human E2E evidence; report limitations honestly.

## Post-HNG direction (not implemented)
Protected /admin, roles/dashboard, product CRUD, Supabase Storage, inventory, variants, order management/status workflow, analytics, real Orange Money/Afrimoney, verified sender/domain/deliverability and remaining UI/profile polish. Do not implement without a scoped task. Profile/autofill remains unproven; avoid speculative UI/data fixes.
