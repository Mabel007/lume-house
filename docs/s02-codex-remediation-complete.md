# S02 local remediation — implementation and verification record

Date: 2026-11-04
Branch: feat/lume-web-s02-country-enforcement
Status: LOCAL CORRECTIONS AND NATIVE DENO VERIFIED; INDEPENDENT REVIEW AND HOSTED ACCEPTANCE PENDING.

This is the single current remediation status record. Earlier completion/status reports are historical and superseded. This record does not declare S02 released, approve staging, or authorize commits, pushes, hosted settings, migrations, scheduling or deployment.

## Authorization and evidence boundary

The owner authorized remaining local implementation and disposable testing. Existing uncommitted work was preserved on the current branch. The initial remediation involved no commits, pushes, merges, deployments, hosted database access, hosted settings, secrets, dependency/tool installations or tracker changes. The subsequent owner-authorized portable Deno installation and isolated cache population are recorded below; repository dependencies were not installed or changed. The pre-existing fixed-name disposable container was not stopped or altered. New SQL runs used independently named containers with networking disabled and automatic removal; concurrency used disposable cloned databases. No hosted fixtures or real provider emails were created.

Scope follows the accepted S02 requirements and independent REQUEST CHANGES review. S02-02 remains the original unsupported-country feedback workstream. Earlier S02-01/02/03 closure and accepted QA exceptions remain intact. Authentication expansion remains deferred. S03's separate engineering/release gates are not waived.

Approved roadmap: https://mabel007.atlassian.net/wiki/spaces/SM/pages/203587587

## Original 23 findings

Original IDs are retained from s02-codex-remediation-batch-a.md. The intervening completion report incorrectly split B.2 and dropped B.8; that renumbering is not used here. VERIFIED below means the locally remediable correction and its stated local evidence, not hosted release acceptance.

| ID | Finding | Local disposition and evidence |
|---|---|---|
| A.1 | Address UPDATE syntax | VERIFIED FIXED. Current migration applies; default RPC executes in both SQL runners. |
| A.2 | COMMENT syntax | VERIFIED FIXED. Timeline and notification migrations apply in both runners. |
| A.3 | Retry SQL/schema ambiguity | VERIFIED FIXED. Qualified candidate columns, fixed search path, actual service-role RPC execution with modern JSON claims. |
| A.4 | Address SQL paths | VERIFIED FIXED. Both runners resolve repository-root tests/addresses-rls.test.sql and execute it successfully. |
| A.5 | Auth fixtures | VERIFIED FIXED. ID-only fixtures match the isolated Auth bootstrap; all 11 address checks pass. |
| A.6 | Test contexts/assertions/signature | VERIFIED FIXED. Correct contexts, unique_violation/error checks, one-argument default RPC; actual second-owner rows now precede negative SELECT/UPDATE checks. |
| B.1 | Notification grants/RPC ownership | VERIFIED FIXED. Browser UPDATE denied; anonymous execution denied; owner read/unread/mark-all and cross-owner negatives execute against PostgreSQL. |
| B.2 | Bell/inbox identity isolation | VERIFIED FIXED. Components key private state by user ID plus session generation before commit, cancel stale requests and mutations. Five actual component tests cover switching, failures, reauthentication and late work. |
| B.3 | Nested forms | VERIFIED FIXED. Address manager remains outside the profile form. Existing account regressions pass. |
| B.4 | Checkout autofill precedence | VERIFIED FIXED. Concurrent reads are reconciled once: customer edits win, then valid saved default, then profile delivery fields. Four new DOM regressions cover response order, manual edits and read failure. |
| B.5 | Default creation/edit concurrency | VERIFIED FIXED. save_customer_address derives ownership and serializes create/edit/default under the same advisory lock as limit enforcement. Direct default-column writes revoked. Original set_default_address(uuid) is preserved as a wrapper. Real creation, switching/edit and limit races pass. |
| B.6 | Timeline placement | VERIFIED FIXED. Placement derives from immutable order timestamp; actual owner/cross-owner and sanitized transition checks pass. Equal timestamps have deterministic lifecycle ordering, covered by SQL. |
| B.7 | Placement notifications | VERIFIED FIXED. Trusted placement generates one event; repeat unchanged status update deduplicates. Both runners exercise it. |
| B.8 | Persistent security/concurrency tests | VERIFIED FIXED. s02-security.sql, s02-concurrency.mjs, notification identity tests and actual handler/HTTP tests are persistent source files in the uncommitted worktree and included by supported commands. No simulated concurrency proof is substituted for SQL. |
| C.1 | Candidate/lease protocol | VERIFIED FIXED. Candidate selection is non-mutating and includes due pending/failed/expired leases. Only claim_order_confirmation owns a lease. Crash-before-claim does not strand a reset job. |
| C.2 | Attempt counting | VERIFIED FIXED. Candidate reads do not increment; actual claims increment exactly once. Repeated and simultaneous claims are tested. |
| C.3 | Expired lease recovery | VERIFIED FIXED. Expired processing lease is selected/reclaimed with a new token; active lease cannot be claimed again. |
| C.4 | Manual-review exclusions | VERIFIED FIXED. Candidate and direct claim paths reject manual review and exhausted attempts; old ambiguity window fails closed without consuming a new attempt. |
| C.5 | Backoff ownership | VERIFIED FIXED. Token-guarded finish writes status and 5/10/20/40/60-minute backoff atomically using actual attempt count. Edge has no direct job updates; stale token cannot alter a newer lease. |
| C.6 | Scheduler authentication/gateway | VERIFIED FIXED LOCALLY. Explicit gateway setting and selected named-secret apikey contract; wrong/public/legacy/forged credentials rejected before SQL. Hosted key choice, custody, scheduling and acceptance remain owner decisions. |
| C.7 | Lint/Edge validation | VERIFIED FIXED LOCALLY. Earlier full lint/frontend/Edge source gates pass. Owner-authorized Deno 2.9.8 now checks the retry function and all five Edge entry points successfully, using the isolated cache. Native validation exposed and corrected an obsolete SDK paths mapping and missing Deno library targeting; strict checking remains enabled. See the native checkpoint below. |
| C.8 | Currency lifecycle coverage | VERIFIED FIXED. Real provider-remount/cache-timestamp, open-tab expiry/throttled refresh and slow-request checkout tests restored; all currency tests pass. Manual selector was not restored. |
| C.9 | Standard test omissions | VERIFIED FIXED. npm test discovers all src/tests .test.ts/.test.mjs files, including four previously omitted files; 48 files and 751 tests run. |

All original findings now have verified local corrections. This is not unconditional 23/23 release completion: independent acceptance and hosted/human acceptance remain unfinished gates.

## Implementation details and preserved contracts

- Modified only the four still-unapplied S02 migration files where relevant; no applied migration history was rewritten. Notification/timeline fixes were retained. Order placement, price/zone/snapshot, payment-awaiting and durable email contracts remain intact.
- Retry selector retains claim_retry_jobs(integer,integer) and its return columns. Existing single-order claim/finish signatures and order-based provider idempotency key remain unchanged. Batch candidates may overlap; only the per-order durable lease permits processing. Finish and backoff are atomic, token-owned SQL operations.
- save_customer_address(uuid,jsonb) is additive and owner-scoped; it serializes default create/edit/switch and the five-address limit. Browser grants no longer allow direct is_default writes. The frontend create/edit paths use that RPC. Existing set_default_address(uuid) remains usable. Address snapshots submitted to checkout still go through trusted checkout validation.
- Notification private state is remounted for every authenticated lifetime. Stale async work cannot reload or mutate the next lifetime's UI. Mutation errors are actionable. Read/unread touch targets are at least 44px.
- Checkout loads profile/addresses concurrently and applies a single deterministic result. It never silently saves profile edits. Customer edits prevent automatic overwrites while still making saved choices available.
- Every Vite DOM server owns a temporary cache and disables WebSockets; close is idempotent and deletes only its checked temporary path. Existing test assertions were preserved. Cleanup handles setup failure. Standard test concurrency is bounded to two files with a per-file timeout.
- The scheduler handler uses the existing pinned Supabase SDK import map; custom jose/HS256 logic and unguarded scheduling writes are removed. Missing owner-selected key/provider configuration is fail-closed. No hosted credential choice was made.

## Exact verification commands and final results

Commands were run from C:/Dev-Per/lume-house. SQL and Node logs are retained in the ignored .codex/s02-final-remediation-2026-11-04 directory.

| Command | Exit | Actual result |
|---|---:|---|
| npm.cmd run test:sql | 0 | Full network-disabled disposable PostgreSQL harness; 91 CHECK invocations, 1,581 PASS output lines; cleanup and fixture absence verified. PASS lines include repeated legacy regressions and status messages, not 1,580 distinct coverage requirements. |
| npm.cmd run test:sql:s02 | 0 | 40 SQL CHECK invocations, 50 PASS output lines, including four real two-session races; complete prerequisites, RLS and cleanup pass. |
| npm.cmd test | 0 | 48 files; 751 tests, 7 suites; 751 pass, 0 fail/cancel/skip; final duration 110,969 ms. |
| npm.cmd run lint | 0 | Full repository, no errors/warnings. Source-only lint is not substituted for this gate. |
| npm.cmd run typecheck | 0 | Frontend strict TypeScript. |
| npm.cmd run typecheck:functions | 0 | Available strict Edge source validation, including retry handler. |
| npm.cmd run typecheck:functions:deno (initial remediation) | 1 | Historical environment failure: Deno unavailable; underlying checker exit 2. Superseded by the successful authorized native checkpoint below. |
| npm.cmd run build | 0 | 225 modules; JS 856.22 kB, CSS 94.78 kB. Existing large-chunk warning remains; no deployment. |
| git diff --check | 0 | No whitespace errors. Git emits line-ending normalization notices. |
| node --experimental-strip-types --test tests/retry-jwt-authorization.test.mjs tests/retry-concurrency.test.mjs tests/notification-identity-dom.test.mjs | 0 | 21 focused authorization/actual HTTP/identity tests pass. |
| node --experimental-strip-types --test tests/notification-identity-dom.test.mjs tests/top-nav-states-dom.test.mjs | 0 | 13 tests pass with final isolated caches/WebSockets disabled. |
| node --experimental-strip-types --test tests/currency-dom.test.mjs | 0 | 17 tests pass, including three restored lifecycle regressions. |

Both SQL scripts invoke s02-concurrency.mjs themselves. It observes actual lock waits, not merely sequential calls: fifth/sixth insert limit; two default creations; default switch versus edit; simultaneous email claims, expiry recovery and stale-token rejection. All fixture databases and newly created containers are removed; the unrelated pre-existing fixed-name container remains untouched.

Evidence files: node-final.log, sql-full.log, sql-focused.log, security-node.log, identity-navigation.log, currency-final.log, build.log, initial-currency-investigation.log and before-default-cache-failure.log. Final standard Node output contains zero WebSocket errors, ENOTEMPTY errors or failing tests.

A final SQL regression also verifies placement precedes a transition when both share the same transaction timestamp. Both SQL gates were rerun after that deterministic ordering correction.

## Test discrepancy and failures investigated

The historical 679/680 report did not retain a failing name/trace. It remains impossible to identify that historical single failure; it is not labelled unrelated. Before implementation, the exact default command reproduced Vite shared-cache ENOTEMPTY setup failures in top-nav-states-dom.test.mjs and an unsafe server.close cleanup error. The first affected title was "document titles follow valid mixed-case routes, keep product names and preserve genuine 404s" at line 100. Its eight assertions passed independently. The archived before-default log retains the native error and cleanup stack. After cache isolation, safe cleanup and bounded concurrency, the supported full command passes all assertions; no assertion was deleted to make that setup green.

One newly restored test initially failed at currency-dom.test.mjs:175 with expected 1 request, actual 0. The component's existing fifteen-minute refresh throttle intentionally still applied after cache expiry. The corrected regression preserves that policy: estimates disappear at expiry, then refresh at the allowed interval and coalesce repeated focus requests. Product code was not changed to weaken rate freshness or throttle rules. The initial failure and final pass are both retained.

Count reconciliation: original standard selection 680; four omitted files added 70; replacing 17 simulated retry-concurrency cases with 4 real HTTP cases removes 13, replacing 10 simulated JWT cases with 12 actual auth cases adds 2; 5 identity, 4 checkout and 3 currency cases add 12. Final total: 680+70-13+2+12=751. Real SQL concurrency is counted separately, not padded into the Node total.

## Native Deno acceptance checkpoint — 2026-11-04

The owner subsequently authorized portable Windows x64 Deno 2.9.8, SHA-256 verification, isolated cache population, native checks and related focused corrections. Branch and HEAD remain feat/lume-web-s02-country-enforcement / eb035f96f91acfe65a0ccbfe47c807b75ff7fc4f.

Installation target did not exist before installation. Official archive: https://github.com/denoland/deno/releases/download/v2.9.8/deno-x86_64-pc-windows-msvc.zip. Its SHA-256 matched cba84b26e0df5ae7f74fc66b86a95b866872a86292ebd84fa1e959927edd93bf before extraction. Absolute-path version probe exited 0: Deno 2.9.8 stable, x86_64-pc-windows-msvc; V8 15.0.245.2-rusty; TypeScript 6.0.3.

The portable executable is %LOCALAPPDATA%/LumeHouse/tools/deno-2.9.8/deno.exe. Evidence is outside the repository at %LOCALAPPDATA%/LumeHouse/validation/lume-house-s02-deno-2.9.8; DENO_DIR is its cache subdirectory. No persistent PATH or system setting was changed. The existing npm script received the executable directory through its child process PATH only.

Exact substantive commands, from the repository root (PowerShell variables expand to the paths above):

```powershell
$denoTools = Join-Path $env:LOCALAPPDATA 'LumeHouse/tools/deno-2.9.8'
if (Test-Path -LiteralPath $denoTools) { throw 'Installation target already exists; refusing overwrite' }
New-Item -ItemType Directory -Path $denoTools -ErrorAction Stop | Out-Null
$denoZip = Join-Path $denoTools 'deno.zip'
Invoke-WebRequest -UseBasicParsing 'https://github.com/denoland/deno/releases/download/v2.9.8/deno-x86_64-pc-windows-msvc.zip' -OutFile $denoZip
if ((Get-FileHash -LiteralPath $denoZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'cba84b26e0df5ae7f74fc66b86a95b866872a86292ebd84fa1e959927edd93bf') { throw 'Deno archive SHA256 mismatch; extraction refused' }
Expand-Archive -LiteralPath $denoZip -DestinationPath $denoTools
$denoExe = Join-Path $denoTools 'deno.exe'
& $denoExe --version
$evidenceDir = Join-Path $env:LOCALAPPDATA 'LumeHouse/validation/lume-house-s02-deno-2.9.8'
$env:DENO_DIR = Join-Path $evidenceDir 'cache'
$env:DENO_NO_UPDATE_CHECK = '1'
& $denoExe cache --no-lock --node-modules-dir=none --config supabase/functions/deno.json supabase/functions/retry-failed-emails/index.ts
& $denoExe info --json --no-lock --node-modules-dir=none --config supabase/functions/deno.json supabase/functions/retry-failed-emails/index.ts
& $denoExe check --cached-only --no-lock --node-modules-dir=none --config supabase/functions/deno.json supabase/functions/retry-failed-emails/index.ts
$env:Path = "$denoTools;$env:Path" # process-only; used by the existing script
npm.cmd run typecheck:functions:deno
npm.cmd run typecheck:functions
.\node_modules\.bin\eslint.cmd supabase/functions scripts/check-functions-deno.mjs
git diff --check
```

Cache population and dependency graph inspection exited 0. These commands resolve/cache modules without executing the Edge Function, remote application code or npm lifecycle scripts. No allow-scripts option was used; node-modules-dir=none keeps packages in DENO_DIR, and no-lock prevents repository lockfile discovery/writes. All subsequent native checks use cached-only.

Resolved package graph (dependency-graph.json; nine packages): @supabase/supabase-js, @supabase/auth-js, @supabase/functions-js, @supabase/postgrest-js, @supabase/realtime-js and @supabase/storage-js are all 2.117.2; @supabase/phoenix is 0.4.5; iceberg-js is 0.8.1; tslib is 2.8.1. Registry metadata was also fetched for the optional @opentelemetry/api peer, which is not a resolved package in this graph. No new repository dependency or lockfile was added.

Native validation did reveal two configuration defects that the Node source gate had not exposed:

1. Initial cached check exited 1: `Failed resolving types. Import "npm:@supabase/supabase-js@2.117.2" via 'compilerOptions.paths["npm:@supabase/supabase-js@2.117.2"]' did not match an existing file`, at _shared/retry.ts:1:49. Removed the obsolete npm-specifier-to-local-node_modules mapping from functions/tsconfig.json. Existing bare SDK imports continue to resolve normally in Node and through the pinned import map in Deno.
2. The next cached check exited 1 with five TS2304 diagnostics, `Cannot find name 'Deno'`, at confirmation.ts:4:18, 6:18, 7:19; retry.ts:33:16; retry-failed-emails/index.ts:2:1. Added explicit compilerOptions.lib=["deno.window"] and strict=true to functions/deno.json so native checks use the actual runtime declarations rather than inheriting the Node-oriented DOM libraries. No error suppression or application source change was introduced.

Final results: focused retry native check exit 0; existing npm native gate exit 0 for order-email, place-direct-order, place-order, product-media and retry-failed-emails; Edge source typecheck exit 0; focused ESLint exit 0; git diff --check exit 0. No remaining native diagnostics. Complete captured output is retained in cache.log, retry-check.log (initial failure), retry-check-final.log (missing runtime libraries), retry-check-native-libs.log (success), all-edge-check.log and dependency-graph.json in the external evidence directory.

Worktree verification: a pre-validation SHA-256 aggregate covered 394 Git-listed existing files, excluding this report. Replacing only the two corrected configuration hashes with their checkpoint values reproduces the exact baseline digest FF6E6C0704B019DEA7702B79954E2BA5792F27D1B908357E3072006BCA7A9862. No other existing repository input changed. package.json and package-lock.json hashes are unchanged; node_modules and its .package-lock.json timestamps remain unchanged. Only functions/deno.json, functions/tsconfig.json and this canonical report changed during this continuation. No commits, pushes, hosted access/writes, infrastructure, scheduler or secret modifications occurred.

The prior 751-test and SQL evidence is reused: these corrections affect validation configuration only, and business source, migrations and tests are unchanged. No complete application/SQL suite was rerun. Static native validation does not prove hosted bundling, gateway behavior or delivery. Independent acceptance can now proceed; an independent reviewer must still accept the remediation and these configuration fixes before any separately authorized staging execution.

## Environment and hosted limitations

- Native Deno static validation is now complete using the authorized portable installation and isolated cache above. It does not prove the target Supabase runtime's bundling/deployed import-map behavior. Earlier reports stating that Deno is unavailable describe the historical checkpoint and are superseded by this record.
- .env.local was not changed. No production-connected browser/dev-server journey was started. Automated DOM tests use local fixtures/module-boundary clients; the HTTP contract suite permits only its loopback dependencies. Native-device, screen-reader, cross-browser and genuine hosted-user acceptance are not newly proven.
- Memory failure is not currently reproduced. Both corrected disposable runners execute. No Windows paging or Docker allocation settings were modified.
- Hosted key dictionary, gateway overrides, migration ledger, shared Mobile compatibility, Vault/cron and provider/domain configuration were not queried or changed. No evidence here authorizes migration replay or ledger repair.

## Hosted decisions and deployment blockers

Use s02-retry-scheduler-auth.md as the implementation-ready authentication/operations contract. The owner must select a dedicated named Supabase secret API key or explicitly approve an existing named server key, choose Supabase Vault/pg_cron/pg_net versus an external scheduler/secret store, and approve scope/rotation/monitoring. No key, JWT secret or scheduler was created. API-key project privileges and pg_net queue exposure must be accepted; a different least-privilege broker would be separate work.

Before any hosted release: independent review; target-runtime bundling/deployed import-map verification; authorized staging plan with backup/migration-ledger/shared-client review; selected key and gateway acceptance; genuine notification/address/timeline/retry journeys; historical Resend 403 and verified-owned-domain/delivery evidence. Preserve owner-accepted prior QA exceptions; do not convert them to passes. Provider acceptance, reported delivery and human receipt are distinct; no external exactly-once or Primary Inbox claim is made.

## Independent review checklist

- Inspect the uncommitted migrations and compare unchanged applied migration history; execute both supported disposable commands.
- Verify service-only retry grants, non-mutating selection, active/expired lease behavior, bounded attempts, manual review and token-owned finish/backoff. Review provider ambiguity limits.
- Verify create/edit/default serialization and column grants, owner-derived identities, count races and rollback behavior on constraint failures.
- Review notification lifetime keys and stale load/mutation cancellation; run identity tests including layout-effect commit observations and same-user reauthentication.
- Review both checkout response orders, manual-edit precedence and failure fallback; confirm no profile write was added.
- Run full npm test, lint, both available typechecks, build and diff check; inspect discovery and isolated-cache cleanup rather than relying on this report.
- Review the completed native Deno evidence and two configuration corrections, then complete separately authorized hosted acceptance. Confirm the chosen API-key/gateway contract; never generate a JWT secret to fit the implementation.
- Preserve original S02-02 scope, existing S02-01/02/03 closures, deferred QA, authentication deferral and the separate engineering foundation gate before S03.

## Local readiness verdict

READY FOR INDEPENDENT ACCEPTANCE of the locally remediable corrections. Native Deno validation now passes for all five Edge entry points, alongside the retained local gate evidence. No original finding remains unresolved at the local implementation level; independent review and hosted configuration/acceptance remain pending. Staging planning may proceed, with staging execution requiring separate approval. This is not approval to stage, release, deploy or declare production readiness.
