# Supplemental staging CORS

This additive setting preserves the complete existing `ALLOWED_ORIGINS` secret without retrieving or overwriting it. `allowedOrigins` combines its existing comma-separated entries with valid `ALLOWED_ORIGINS_EXTRA` entries in memory. The supplemental list is honored only when the trusted runtime `SUPABASE_URL` equals `https://gscihjjwhmvddrmcfpxp.supabase.co`. Other projects and local runtimes ignore it.

Supplemental entries must be exact HTTP(S) origins: scheme, host and optional nondefault port, without credentials, wildcard hostnames, paths, trailing slash, query or fragment. Entries are trimmed and deduplicated; malformed or empty supplemental entries grant nothing. Origin matching remains exact. Existing commerce defaults and media's empty-list behavior are retained. CORS permission does not grant authentication, RPC execution, role or row access.

## Proposed rollout — separate approval required

1. Verify the approved candidate SHA and clean worktree, explicit staging project identity and that `RESEND_API_KEY` remains absent. Privately compare existing `ALLOWED_ORIGINS` metadata before/after to verify it did not change; never print or persist its value or digest. Inspect any existing `ALLOWED_ORIGINS_EXTRA` metadata first and stop on unexpected prior configuration.
2. In staging project `gscihjjwhmvddrmcfpxp` only, set `ALLOWED_ORIGINS_EXTRA` to exactly:

   ```text
   https://lume-house-git-feat-lume-web-b2-1-a-direct-order-najbuilds.vercel.app
   ```

   Do not touch `ALLOWED_ORIGINS`, `RESEND_FROM`, other secrets or production. No wildcard Vercel allowance. No migration is needed.
3. Deploy only `place-direct-order`, `place-order`, `order-email` and `product-media` from the newly approved SHA, each with explicit staging project reference. The first three consume the shared commerce handler; product media uses the same origin parser through its entry point. Keep direct `verify_jwt=true`, other platform settings unchanged, handler `getUser`, RLS and membership checks intact. Deployments are sequential, so partial rollout may temporarily produce different origin results between functions.
4. OPTIONS-test the previously accepted original Preview origin and supplemental stable alias across all four functions. Require 204, exact allow-origin, Vary: Origin, expected methods and all four request headers. Reject an unknown origin and suffix-confusable host with 403 and no reflected allow-origin. Do not infer full original-list recovery from these representative probes.
5. Only after CORS passes, resume separately authorized real ES256 security checks using the existing controlled staging Google session. Stop on platform incompatibility; never disable verification. Purchase/stock tests need their existing controlled acceptance scope. Keep staging mail disabled through testing and reconciliation.

## Rollback

With separate staging rollback authorization, remove only the newly introduced `ALLOWED_ORIGINS_EXTRA` setting if it was absent at preflight. If it preexisted unexpectedly, stop before rollout rather than overwriting it. The new handlers then use the untouched original list. If code rollback is required, redeploy the reviewed compatible B2.1 baseline `2167f5aaf9a2ac8732fafa2731d842f2c59b6e06` for the affected functions; first verify the correct prechange product-media source baseline, which must not be assumed from that feature SHA. Do not reverse migration 02800, remove direct recovery, change history or restore Resend. Extra-only Preview access is expected to stop after rollback.

## Verification and manual evidence

`tests/cors.test.mjs` verifies parser boundaries and actual commerce/media entry-point OPTIONS/auth behavior without hosted credentials. Existing direct-handler, order and media tests retain business/auth regression coverage. Run lint, frontend/function typechecks, build, full npm tests and `git diff --check`.

Automated PASS evidence belongs in the implementation handoff. Newly designed human/browser CORS cases belong in the existing Confluence manual QA register as **NOT RUN** until separately executed; do not convert automated tests into manual PASS results.
