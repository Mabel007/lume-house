# B2.1 + B2.7 controlled staging release — handoff

Candidate: branch `feat/lume-web-b2-1-a-direct-order`, worktree `.codex/b2-1-a-direct-order-worktree`, release base `f16a5c57af8736fc315287a4d2ceec18cf81ae4d` plus the one scoped release commit that contains the B2.1 UX slice, the B2.7 automatic currency work, the six reviewed remediation changes and this handoff. Linked Vercel project `lume-house` under scope `najbuilds`; documentation consistent with [staging-cors.md](staging-cors.md) and [buy-now-integration.md](buy-now-integration.md). This is a staging release candidate only: production deployment, merge-to-main, hosted Supabase settings and migrations remain out of scope for this document's scope of action.

## Release contents

### B2.1 direct order UX slice (frontend)

- Product Details Buy Now semantics preserved: versioned tab-local intent, no Bag dispatch, no stock reservation, review-before-placement, direct review router state and admin-return priority (see [buy-now-integration.md](buy-now-integration.md)).
- Navigation and breadcrumb states: normalized pathname active-state matching; exact route links carry `aria-current="page"`, ancestor-section links (Shop under `/products/*`, Help under `/help/*`, Account under `/account/*`) carry `aria-current="location"`. The signed-in Account trigger is a disclosed menu control and uses the `active` underline with `aria-current="location"` (owner-approved), styled independently of anchor link styling.
- Breadcrumb sibling keys that share a destination unique by `to:label`, preventing duplicate React keys (Home and Shop both link to `/` on product trails).

### B2.7 automatic currency localization and footer presentation

- Fresh visitors obtain one automatic selection from browser `Intl` locale regions: `SL`→NLE, `GN`→GNF, `GH`→GHS, `NG`→NGN, `US`→USD; unknown, unsupported or region-less locales settle to authoritative NLE without any rate request.
- NLE remains authoritative: NLe prices, totals and zone fees are never converted; foreign values are explicitly labelled informational estimates with a target/currency, provider, reference date and staleness disclosure. Manual selection (footer only) always wins over locale, persists, including explicit NLE.
- Rates come from the public Frankfurter API with strict payload validation, 24h cache and 7-day reference-age/future-date rejection; a failed or rejected fetch leaves NLE-only presentation with no request loops.
- Locale parsing evidence correction: `en_US` (underscore form) is deliberately normalized and resolves to `en-US` → USD. It is NOT rejected as malformed. Malformed tags (for example `en-US-u`, `en-Latn-Latn-US`, `!!!`, `123-US`) are rejected; the earlier summary line that grouped `en_US` among rejections was an evidence-summary inaccuracy, corrected here and in the local remediation record (`.codex/B2_1_B2_7_CODEX_REMEDIATION_RESULT.md`, git-ignored). Historical reports under the parent repository's `.codex/` are preserved unchanged.

## Codex review findings — resolution summary

All six findings (REV-01…REV-06) are resolved and documented in the local remediation record. Independent verification: dedicated suites for locale validation, navigation active-state matrices, frozen-clock rate presentation and disclosure `aria-controls` lifecycles, plus a client-renderer duplicate-key guard, all green within the full suite. REV-04's verification channel was corrected: React 19 server markup rendering never emits duplicate-key warnings in any NODE_ENV (probed), so the guard renders through `react-dom/client`, which does.

## Verification evidence (automated, local)

- Full `npm test`: **626/626 pass**, zero failures/skips (baseline 622 before the REV-04 test-channel restructure and REV-06 additions).
- `npm run lint`, `npm run typecheck`, `npm run typecheck:functions`: clean.
- `npm run build`: success; pre-existing informational >500 kB chunk-size note unchanged.
- `git diff --check`: clean (CRLF conversion notices only).

## Staging and production release dependencies

Staging (this release):

1. Publication of this branch to `origin` (GitHub `Mabel007/lume-house`) creates Vercel preview deployments; the branch stable alias `https://lume-house-git-feat-lume-web-b2-1-a-direct-order-najbuilds.vercel.app` re-serves the new release build. Non-production branch pushes create preview environments only; production deployments target the linked repo's production branch, so branch publication cannot alter `https://lume-house-delta.vercel.app` or any production resource by itself.
2. The staging frontend already reads Preview-scoped public variables pointing at staging Supabase `gscihjjwhmvddrmcfpxp` (`VITE_SUPABASE_URL` preview value), keeping staging isolated from production data.
3. Staging Edge Functions already run from `f16a5c5…` (deployed 2026-10-24 from the approved CORS rollout): `place-direct-order` (verify_jwt true), `place-order`, `order-email`, `product-media`; `ALLOWED_ORIGINS_EXTRA` contains exactly this staging origin; `RESEND_API_KEY` remains absent so confirmation jobs stay pending. The candidate adds no `supabase/` changes, so no function redeploy or migration is required for the staging release.
4. Staging publication itself is separately owner-authorized; this handoff stops short of push/deploy.

Production (NOT part of this release; future scope):

- Merging to `main` would trigger a Vercel production deployment of the frontend automatically; Edge Function deploys, JWT settings and migrations are always separate, owner-executed operations. No migration is pending (ledger latest 02800; candidate changes no migrations). Production environment variables are separate, secret-scoped values that must never receive staging content. The CORS supplemental guard applies only to the staging runtime URL; production behavior is unchanged by `f16a5c5`.

## Outstanding browser, security and manual QA (NOT RUN in automation)

Staging acceptance plan for the owner, in the protected staging alias session:

1. Google OAuth sign-in and callback arrive at the expected routes.
2. Signed-in header shows the single Account disclosure with the active underline; signed-out shows the sign-in route link.
3. Account, My Orders and Order Details render own history; other-customer data stays invisible.
4. Catalogue and Product Details read live staging products with authoritative NLe prices.
5. Buy Now opens the direct review route without combining saved Bag quantities; Cart keeps its saved path; both reach the same trusted checkout.
6. Fresh-visitor currency detection: a browser with a US region locale settles to USD, a Sierra Leone locale stays NLE with zero rate requests, unsupported regions stay NLE.
7. Footer-only currency switching updates estimates, clears back to NLE without refetch loops, survives reload via stored preference.
8. NLe prices/totals remain integer minor units everywhere; foreign values always carry the informational estimate disclosure.
9. Mobile and desktop navigation active states match page/location conventions; keyboard operation reaches menus, disclosures and forms; `filter: prefers-reduced-motion` media remains honored.
10. CORS/JWT isolation: staging requests go to staging project only; JWT verification gates still 401 without Authorization; no production endpoint is contacted.

Purchase placement on staging remains gated by the separately-approved staging purchase plan (inventory/idempotency cases), mail stays pending-only (Resend key absent), and reciprocal second-identity isolation remains the documented BLOCKED item. Production resources, hosted settings, CRON, trackers and code history must not be touched from staging QA.
