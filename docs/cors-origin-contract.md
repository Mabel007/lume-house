# CORS origin contract

Exact-origin allowlisting for the Lumé House Edge functions. This document is the
single reference for **which** browser origins may call the commerce and media
functions, and **why**. It does not itself change any hosted configuration.

Related: [`staging-cors.md`](./staging-cors.md) (rollout procedure),
`supabase/functions/_shared/cors.ts` (implementation),
`scripts/cors-smoke.mjs` (verification), `scripts/staging-target-guard.mjs`
(staging-target safety).

## 1. Canonical origins

| Role | Origin | Status |
|---|---|---|
| Production storefront | `https://lume.najbuilds.com` | Canonical. Injected in code for the production project; not dependent on any secret. |
| Production Vercel alias | `https://lume-house-delta.vercel.app` | Stable alias resolving to the same production deployment as the storefront domain. Legacy member of the handler's default list. |
| Staging storefront (current S02 QA) | `https://lume-house-git-feat-lume-web-s02-country-enforcement-najbuilds.vercel.app` | Stable **branch** alias for the S02-01 feature preview. |
| Staging storefront (post-merge) | `https://lume-house-git-main-najbuilds.vercel.app` | Stable **main-branch** alias. Resolves today; **not authorised** until separately approved. |

Immutable per-deployment URLs (`https://lume-house-<hash>-najbuilds.vercel.app`)
are **never** canonical. They exist only as short-lived exceptions and are listed
as tolerated, not contractual:

- `https://lume-house-cucv9kk4a-najbuilds.vercel.app` — currently approved preview
- `https://lume-house-cjmywq9fy-najbuilds.vercel.app` — legacy entry inside `ALLOWED_ORIGINS`

Both are pinned to a single past deployment and will stop being relevant without
any code change. Do not add new ones.

## 2. Environment separation

The allowlist is resolved by `allowedOrigins(original, extra, projectUrl)`:

| `SUPABASE_URL` | Effective allowlist |
|---|---|
| `https://wyvsbzcltrhnjeuijsva.supabase.co` (production) | `ALLOWED_ORIGINS` entries **+** `https://lume.najbuilds.com`. `ALLOWED_ORIGINS_EXTRA` is **ignored**. |
| `https://gscihjjwhmvddrmcfpxp.supabase.co` (staging) | `ALLOWED_ORIGINS` entries **+** valid `ALLOWED_ORIGINS_EXTRA` entries. The production storefront is **not** injected. |
| anything else (local, unknown, trailing slash, suffix) | `ALLOWED_ORIGINS` entries only. Both the storefront injection and the supplemental list are inert. |

Rules:

1. **No wildcard.** `https://*.vercel.app`, `*` and `null` are never accepted.
2. **No automatic preview authorisation.** A new deployment gains nothing by existing.
3. **No reflection.** The request `Origin` is echoed only after exact membership succeeds.
4. **No cross-environment secrets.** Staging never receives production credentials, and production never receives `ALLOWED_ORIGINS_EXTRA`.
5. **Exact match only.** Scheme, host and optional non-default port must match byte-for-byte. Trailing slash, path, query, fragment, credentials, uppercase host and explicit `:443` all fail.
6. **CORS is not authorisation.** An allowed origin still needs a valid JWT; `401 AUTH_REQUIRED` is the expected response to an unauthenticated allowed-origin request.

### Platform JWT gate differs per function

`place-order` is deployed with `verify_jwt = false`, so an unauthenticated request reaches the handler and receives `401 AUTH_REQUIRED` with the exact origin echoed in `Access-Control-Allow-Origin`.

`place-direct-order` is deployed with `verify_jwt = true`, so the Supabase gateway rejects the request **before** the function runs. That `401` carries the gateway's own `sb-error-code: UNAUTHORIZED_NO_AUTH_HEADER` and a wildcard `Access-Control-Allow-Origin: *`; none of the function's CORS headers are reached. This is platform behaviour, not origin reflection by our code, and it is expected. `OPTIONS` preflights are not JWT-gated, so browser preflight succeeds normally on both functions.

`scripts/cors-smoke.config.json` records `verifyJwt` per function so the smoke test asserts the correct 401 shape instead of a false failure.

## 3. Secret ownership

| Secret | Owner | May be edited |
|---|---|---|
| `ALLOWED_ORIGINS` | Ops | Additive only; value is not recoverable read-only. |
| `ALLOWED_ORIGINS_EXTRA` | Ops | Staging only. Safe to replace with the exact approved list. |

The in-code default list is a **local-development** fallback and is only in effect
when `ALLOWED_ORIGINS` is absent or empty. It is:

```text
http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,https://lume-house-delta.vercel.app
```

A hosted environment answering `204` for `http://localhost:5173` means the
fallback is active and the real allowlist is missing — `scripts/cors-smoke.mjs`
treats that as a failure.

## 4. Adding or removing an origin

1. Prefer an existing stable Vercel alias or custom domain. Do not create new domains.
2. Verify the alias actually resolves to the intended deployment (`vercel inspect`).
3. Update `scripts/cors-smoke.config.json` in the same change so the expectation and the configuration cannot drift apart.
4. Run `node scripts/staging-target-guard.mjs --target gscihjjwhmvddrmcfpxp` before any hosted write.
5. Apply only `ALLOWED_ORIGINS_EXTRA` in staging, exact origins, comma-separated, no trailing slash.
6. Run `npm run cors:smoke` and require a full PASS.
7. Record evidence with names/timestamps only. Never print secret values or digests.

## 5. Known residual risk

`handler.ts` uses `Deno.env.get('ALLOWED_ORIGINS') || '<defaults>'`. A missing
**or empty** secret therefore falls back to the local-development list rather than
failing closed. Changing `||` to `??` would make an empty secret fail closed, but
that is a runtime behaviour change to already-deployed functions: it cannot take
effect without a separately authorised Edge deployment and would leave the repo
diverged from the deployed source until then. It is intentionally **not** applied
here; detection via the smoke test covers the gap in the meantime.
