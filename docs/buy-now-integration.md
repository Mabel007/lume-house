# B2.1 Buy Now — local integration handoff

Baseline: `41974f2c468c3d6b81f5a8fb2912b825a67db50f`. Worktree/branch: `.codex/b2-1-a-direct-order-worktree`, `feat/lume-web-b2-1-a-direct-order`. This is a feature-branch review candidate. No hosted migrations, settings or deployments were performed. SQL contract/parity matrix: [direct-order-contract.md](direct-order-contract.md).

## User flow

Product Details Buy Now freezes the selected variant/quantity into a versioned tab-local intent and opens `/checkout/buy-now`. It does not dispatch any Bag action, combine saved quantities, require a working saved Bag, or reserve stock. Add to Cart keeps its existing confirmed-action path.

Direct review reuses CheckoutPage's contact, independent profile defaults, Freetown delivery/pickup, mobile-money metadata, NLE summary, currency estimates and validation. Authentication is required to place. Google continuation points only to the fixed direct review route, never automatically submits and does not change Google/Supabase redirect configuration. Admin return intent retains priority. Canceled sign-in offers a return to review.

Before a new direct invocation, the client reloads current catalogue data and requires the visible quote to match. The SQL transaction remains authoritative for price, fees, quantity and stock at placement. Price/availability drift requires another explicit review/submit; no automatic repricing acceptance. Direct success navigates to the existing immutable order success/history experience and never calls Bag success cleanup.

## Storage, ownership and coordination

- `lume-direct-checkout-v1` in sessionStorage holds only intent UUID, product/variant IDs, quantity, nullable owner UUID and a restoration hold. No contact data, tokens, quotes or payment numbers are persisted.
- Anonymous intent binds to the first authenticated owner. Another account cannot render/replay it. Leaving that selection preserves any owner-scoped pending request for recovery by its original owner.
- `lume-customer-auth-return` contains only the matching intent UUID. Callback consumes it into a fixed route; it is not a free-form redirect URL.
- `lume-checkout-attempt-${owner}` in localStorage retains minimal source/selection/request context across tabs/reload. Existing Bag sessionStorage IDs (`lume-checkout-${owner}`) remain readable and are retained when starting Bag attempts. Inconsistent records fail closed. Whenever it observes a shared attempt, and before starting one, the tab verifies a minimal sessionStorage copy at `lume-checkout-shared-${owner}`. A later loss of localStorage access cannot turn that known pending purchase into an empty recovery state.
- Ordinary Bag checkout retains the legacy session-only capability when localStorage is denied from the outset and this tab has no shared recovery copy. Its verified session request survives reload/retry; missing rows still retain the same ID. A failed shared write can downgrade only before invocation, after an affirmative read proves no shared record was stored. Partial/unknown writes, malformed records, unavailable sessionStorage and known shared attempts fail closed. Direct never uses this fallback. Session-only Bag recovery cannot discover unresolved purchases in another tab when shared storage is unreadable, just as legacy Bag, other browser profiles and devices cannot coordinate that state; Web Locks still excludes overlapping active operations when supported. This compatibility limit does not weaken the SQL owner/request/source boundary.
- Web Locks serializes new-client placement for an owner across same-origin tabs. Shared pending records block cross-source/different-intent reuse. Direct submission fails closed if Web Locks or durable storage is unavailable; legacy Bag retains its in-process fallback. Cross-device/browser profiles and old deployed clients do not share this browser lock. Different request IDs remain distinct purchases at the SQL boundary.
- Accepted recovery explicitly checks current session owner, pins the captured JWT, checks order source and the direct immutable item identity/quantity. A missing row remains unknown; it does not clear the request or create a new ID.
- Unknown errors, unavailable servers and previously uncertain attempts retain the same request and selection. Only an accepted result, or a definite SQL refusal on an initial attempt with no earlier uncertainty, allows removal of that attempt. Source/selection conflicts require review, never a fallback to Bag placement.
- Checkout mounts are keyed by Auth session lifetime as well as owner/intent; late responses from an earlier lifetime cannot clear recovery, reveal personal form state or navigate the new session.

## Saved Bag preservation

CartProvider suppresses mutating restoration/promotion and guest merging while the direct hold is active, including OAuth return, reload, token refresh, catalogue refresh, success and cancellation. Guest intent and merge receipts stay in their original storage. Explicit entry to `/cart` releases the hold and resumes the existing restore/merge behavior. Resuming the same intent, entering direct review (including browser back and trailing-slash/case-equivalent routes), binding its owner and preparing/consuming Google continuation re-arm and verify that hold. A matching customer callback marker also guards restoration before callback routing effects run. This is a deliberate return to the normal Bag flow; an unresolved direct attempt still blocks starting another checkout mode.

Accepted Bag results release the checkout ticket without clearing client items and re-read the current trusted Bag. Recovery or an accepted RPC replay can refer to an older order while newer items already exist; an accepted order ID does not prove the currently visible Bag converted. A genuinely new Bag order is likewise reconciled from the server's converted state. Direct success and recovery do not invoke any Bag cleanup or refresh.

An operation already sent before Buy Now began may finish at the server. Its late response cannot checkpoint away the retained guest intent during the hold. Reconciliation reuses the same merge receipt, so an accepted merge is not applied twice. Another independently active device/tab can still intentionally change the Bag; Buy Now itself does not perform those mutations.

After direct success, the saved Bag can contain a now-unavailable item because inventory was allocated to the direct order. Do not silently remove that saved intent. Existing availability/reconciliation UI handles the later explicit Bag visit. Outside the normal Bag flow, the header explains that saved-item changes resume when the customer opens their Cart.

## Dedicated Edge contract

`supabase/functions/place-direct-order/index.ts` uses `commerceHandler('direct')`. It validates the actual bearer JWT with Auth getUser, request/body limits, protocol, integer quantity and exact quote shape, then calls only `place_direct_variant_order` under the caller JWT. Service role is used only by existing post-persistence confirmation processing.

Only `place-direct-order` enables platform `verify_jwt = true` in both Supabase configuration files, in addition to mandatory handler `auth.getUser` verification. Other functions retain their existing platform settings. Hosted acceptance of genuine staging ES256 user JWTs remains NOT RUN until separately authorized deployment and authenticated smoke tests.

Request:

```text
POST place-direct-order
{protocol: 1, request_id, variant_id, quantity,
 expected_quote: {product_id, variant_id, quantity, unit_price}, checkout}
```

Success includes `protocol:1`, `checkout_source:'direct'`, matching `request_id`, order and email status. The browser requires this envelope. There is no direct-to-`place-order` fallback. Missing RPC maps to DIRECT_UNAVAILABLE; unknown/transport/malformed outcomes remain uncertain. SQL source, selection and quote conflicts map to 409, along with unavailable stock/product; validation maps to 400 and auth to 401. Only known SQL refusals carry `outcome:'rejected'`. Ingress validation/auth failures cannot resolve a previously uncertain attempt.

The existing Bag endpoint's default routing is unchanged. Its new source-conflict errors are now mapped explicitly. Durable email failure still cannot roll back an accepted order; provider acceptance and delivery are distinct.

## Executed QA and limits

The full SQL harness, including coordinated stock/source/replay races, passed. Handler tests execute the real TypeScript handler and Supabase client's HTTP requests against loopback Auth/RPC stand-ins; they do not establish real Deno gateway/JWT behavior. DOM tests use isolated catalogue/database fixtures. The full npm command includes these new suites and the existing Bag, checkout, admin callback, currency, delivery and order regressions. Exact commands/results are recorded in ignored `.codex/LUME_HOUSE_WEB_B2_1_B_E_IMPLEMENTATION.md`.

Real local Supabase integration was attempted twice and blocked at migration 02300 with `STORAGE_RLS_REQUIRED`. Enabling the genuine local Storage service did not resolve that precondition. The guard was not weakened; the temporary Storage/start-script experiment was reverted and only verified Lumé local containers were stopped, retaining local data/volumes. The local function configuration now includes the dedicated endpoint. Do not bypass the migration guard or treat the emulated SQL Storage model as genuine Supabase Storage evidence.

No browser surfaces were available through the browser tool, so visual/responsive real-browser QA is blocked. Real Google OAuth, hosted JWT/PostgREST, Deno runtime, deployment and external email tests were not run. No claim of production readiness follows solely from the local tests.

## Review and staged rollout — separate authorization required

1. OpenCode/Qoder review the combined A–D diff, source-aware retries, storage state transitions, guest-merge deferral and evidence. Inspect hosted migration/function parity read-only; do not replay seed/history to resolve uncertainty.
2. In a separately authorized non-production environment, resolve the genuine Storage prerequisite and complete real JWT/PostgREST/Deno integration, direct and Bag source conflicts, malformed quantity decoding, dropped-response recovery, stock competition and browser QA. Preserve test data isolation and keep external email disabled unless explicitly authorized.
3. Under separate hosted authorization, apply reviewed forward migration 02800 first. Verify historical source defaults, grants/RLS, both Bag retry paths and the dedicated direct RPC.
4. Deploy `place-direct-order` and the shared-handler updates to dependent functions, with explicit JWT validation and intended CORS origins preserved. Verify the protocol envelope and errors before enabling frontend entry. Do not assume any existing deployment automation includes the new function.
5. Deploy frontend only after its database/endpoint dependencies are verified. Test real customer Google return/cancel, guest intent plus existing Bag, token/catalogue refresh, owner switching, uncertainty, 320/390px and desktop, keyboard/focus and existing whole-Bag ordering. No automatic order submission after Google return.
6. Keep confirmation processing/retry semantics and immutable history checks. Order placement never means payment captured or verified; no real Orange Money/Afrimoney processing was added.

## Recovery and rollback

The safest UI rollback removes/hides the new PDP entry while retaining the direct review/recovery route, pending records and dedicated endpoint for in-flight attempts. A blind rollback to an older frontend can remove recovery support; review that risk explicitly. Keep 02800 source metadata/guards and accepted orders. Do not drop columns, delete orders, rotate credentials, clear customer browser data or restore saved Bags from snapshots.

For an uncertain result, use the original owner/request and check history or retry that same selection. A no-row lookup is not a negative receipt. For deployment incompatibility, fail closed and repair the dependency order rather than routing direct purchases through Bag checkout. Hosted rollback or configuration changes remain owner-authorized actions.
