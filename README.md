# Lumé House

Beautiful things live here. Modern home and lifestyle ecommerce for Lumley, Freetown, Sierra Leone. Country SLE; currency NLE displayed as NLe. Money uses integer minor units (100 per leone).

## Current application

React 19, TypeScript, Vite and Tailwind. The runtime loads 20 active products from the existing hosted Supabase project (wyvsbzcltrhnjeuijsva), ordered by display_order then ID. Loading, unavailable service and empty catalog are explicit; there is no silent local fallback. The local catalog remains a test/seed parity reference. All 20 product images use visually reviewed, locally optimized owner-supplied WebP photography. Stable IDs and NLE prices are preserved; the local catalog, seed and hosted catalog match. The editorial hero also uses an optimized supplied photograph; unused JPEG originals/alternates and the generated hero have been removed.

Google sign-in uses Supabase Auth with PKCE, automatic session restoration and sign-out. My Account displays Auth email and supports optional name, normalized Sierra Leone contact phone and default street/area/city. Profiles are created lazily on save. The human has verified genuine local Google login, profile save/refresh, cart persistence, logout privacy and login restoration. A second genuine account remains necessary for cross-user session verification.

Guests use temporary cart intent in sessionStorage (IDs/quantities only) so it survives the OAuth redirect in the same browser tab. Authenticated carts load from carts/cart_items through owner RLS. Quantities are 1–99 and prices always come from current hosted products. Writes are serialized by disabling cart controls while saving; failures retain the prior displayed state. Logout hides private cart data immediately. On login guest quantities combine with existing quantities, capped at 99. Each successfully persisted guest line is checkpointed and removed from temporary intent; failed/unattempted lines remain for retry. This is a sequence of browser writes, not an atomic transaction. Concurrent changes across multiple devices use last-write-wins quantities; ambiguous network failures after a server commit still require reconciliation.

Checkout prefills profile defaults if available before the customer begins editing. Checkout edits never save the profile. Checkout drafts and payment number are not persisted locally. Contact and payer numbers remain separate; the reuse checkbox follows contact edits and restores independent payer input when deselected.

Delivery serves Freetown with provisional owner-configured zones: Goderich–Lumley NLe 40; Lumley–Congo Cross including Aberdeen NLe 50; Congo Cross–Central Freetown NLe 60. These are product configuration, not researched courier prices or precise geographic boundaries. Pickup in Lumley, Freetown costs NLe 0 and needs no delivery address. Missing zone leaves totals incomplete. Phone validation checks +232 followed by eight digits, not provider registration. Orange Money/Afrimoney selection does not initiate or verify payment; no PIN/OTP is collected.

Authenticated checkout now calls the trusted place-order Edge Function. Its authenticated PostgreSQL transaction loads and locks the current owned cart/products, derives authoritative NLE prices and configured zone fees, rejects stale quotes, snapshots items/contact/fulfilment, creates one durable email job and clears cart items atomically. A user-owned request UUID protects double-click/retry, including reload recovery. Browser prices are only a stale-cart detector, never authority. My Orders lists durable owner-readable orders and historical details. Placement is placed / awaiting_payment, with no paid state or real payment processing.

Resend confirmation runs server-side only after commit. Jobs use guarded leases, stable provider idempotency and retry state; email failure preserves the order. Order Details offers a safe email retry. There is no scheduled retry worker yet, and provider acceptance does not guarantee delivery. Display email hello@lumehouse.sl is not a configured sender. The default testing sender is Lumé House <onboarding@resend.dev>; Resend testing-recipient restrictions apply until a sender domain is verified. No PIN/OTP or full payer phone is saved for history; only its last four digits.

## Local setup

Node 22.12+:

```powershell
npm.cmd ci
# Copy .env.example to ignored .env.local and fill browser-safe values privately.
npm.cmd run dev
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run typecheck:functions
npm.cmd run build
npm.cmd test
git diff --check
```

VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are public browser configuration. Never use service-role/secret keys. Optional VITE_AUTH_REDIRECT_URL must be same-origin; default is current origin + /auth/callback, so it is not localhost-only. Production SPA hosting must rewrite routes to index.html. Never commit local env, tokens or .codex reports.

## Google configuration reference (local login manually verified)

1. In Google Cloud Console configure OAuth consent/branding and audience; if testing, add your genuine Google account as a test user. Create an OAuth client of type Web application.
2. Authorized redirect URI: https://wyvsbzcltrhnjeuijsva.supabase.co/auth/v1/callback. Set the app's origin as an authorized JavaScript origin where requested (local test: http://127.0.0.1:5174).
3. In this existing Supabase project's Authentication → Sign In / Providers → Google, enable Google and enter the client ID and client secret privately. The secret belongs only in Supabase settings, never VITE variables/source/chat.
4. Authentication → URL Configuration: set local Site URL to http://127.0.0.1:5174 and add http://127.0.0.1:5174/auth/callback to allowed redirects. Add localhost URLs separately if using that origin. Later use the real deployment origin/site/callback; do not configure a fictional deployment.
5. Open /account, select Sign in with Google and complete login personally. Verify profile save/reload, cart add/quantity/remove/reload, logout/login restore and guest merge. A second genuine account is required for cross-user session testing.

See [official Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls) and [database foundation](supabase/README.md).

## Server runtime configuration checkpoint

The linked hosted database now has migrations 00100 through 00600, 20 matching NLE products, unchanged owner RLS and no browser order-table writes. Edge Function source is implemented and typechecked, but has **not been deployed** in this run. No application order/email end-to-end result is claimed.

1. Privately set RESEND_API_KEY in this project’s Edge Function secrets. Do not paste it into chat or VITE variables. Keep the testing sender default or set RESEND_FROM to a genuinely verified sender.
2. Set ALLOWED_ORIGINS to the exact local/application origin(s), comma-separated. The defaults allow localhost/127.0.0.1 on 5173 and 5174. Google redirect settings must separately match the actual origin.
3. When ready, deploy the two functions yourself (deployment was excluded from this run):

```powershell
npx.cmd supabase functions deploy place-order --project-ref wyvsbzcltrhnjeuijsva
npx.cmd supabase functions deploy order-email --project-ref wyvsbzcltrhnjeuijsva
```

Their explicit getUser validation is mandatory: the function configuration uses verify_jwt=false to support the browser publishable key, and never treats that setting as anonymous authorization. The database RPC independently derives auth.uid() and validates all inputs. Built-in Supabase server credentials stay server-side.

Local rollback-only SQL tests are run with powershell.exe -NoProfile -ExecutionPolicy Bypass -File supabase/tests/run-local.ps1. Never run test SQL on hosted Supabase. See [database and transaction documentation](supabase/README.md).

The foundation baseline is committed; auth/profile/cart and commerce/photo work remain uncommitted for review. No push, PR or deployment occurred.
