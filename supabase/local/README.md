# Lumé House local Supabase

Validated on 2026-10-08 with CLI 2.120.0 and Edge runtime v1.77.4: all 18 migrations and 102 genuine Auth/API checks passed. Browser journeys remain pending human QA. First use may download official Docker images; leave downloads running until complete. If a download fails, retry without changing unrelated services or system networking.

Run from the repository root with Docker Desktop's Linux engine running and Node 22.12+ installed. These scripts never link to a hosted project. Do not use `supabase start`, `stop`, `reset` or remote database commands directly for this environment.

1. `node supabase/local/start.mjs`
2. In a second PowerShell window: `node supabase/local/edge.mjs` (leave running for checkout).
3. In a third window: `node supabase/local/app.mjs` (leave running).

The pinned CLI is invoked with `npx --yes supabase@2.120.0`; no dependency/global install is needed. An optional `LOCAL_SUPABASE_CLI` can select an already verified 2.120.0 binary. Downloads may take time.

- Application: http://127.0.0.1:5188
- Local synthetic sign-in: http://127.0.0.1:5188/supabase/local/auth.html
- Studio: http://127.0.0.1:54323
- Auth mail capture: http://127.0.0.1:54324
- API: http://127.0.0.1:54321
- PostgreSQL: 127.0.0.1:54322; shadow port reserved 54320.
- Auth helper: loopback 5190. Edge inspector reserved 8083.

Use the sign-in helper to select Customer A/B or Admin A/B. It creates genuine synthetic local Auth identities each time the app helper starts, retains passwords only in memory, and bootstraps admin membership through the verified local database. These are LOCAL TEST identities. Existing local data persists. Production Google login is unchanged. The helper is not included in the production build. Do not paste credentials into chat or logs.

The app injects only local public URL/key values into the Vite child process; hosted `.env.local` is not changed. The Edge process uses a generated local environment with an empty Resend key, so orders persist with queued confirmations and no external email. Payment selection remains metadata, never a real payment.

When finished, press Ctrl+C in the app and Edge windows, then run `node supabase/local/stop.mjs`. The stop command also shuts down a running frontend/helper after verifying its local ownership marker. Only containers with the exact Lumé project label are stopped. Volumes/networks/data remain. No prune is performed. After reboot repeat steps 1–3. Do not stop unrelated services.

Fresh bootstrap copies unchanged migrations 00100–00400 into an ignored, unlinked workspace, starts the local stack through a process-only Docker guard, verifies the named/labelled DB port, loads the reviewed repository catalogue transactionally at the empty 00400 boundary, copies all unchanged migrations and runs `migration up --local` through 01800. It never weakens the photography guard or loads hosted data. Generated state belongs in ignored `.codex/local-stack` only.

The Docker guard rejects prune and writes to unrelated resources, binds published services to loopback, and rejects nonempty Resend credentials. Failure requires inspection; do not bypass the guard or change another project's ports.

Human QA remains required: session restore/logout/account switching; customer `/admin` denial; admin products, variants, inventory, orders and memberships; guest Bag then sign-in merge; two same-parent variants; checkout and owned order details; cancellation requests; admin cancellation/rejection; revocation in two independent browser profiles without clearing the revoked session. Check routes, responsive widths, keyboard/focus and private-data removal. API checks are not browser evidence. Never claim payment success or email delivery.
