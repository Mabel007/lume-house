# B2.1-A direct-order database contract

Baseline: `41974f2c468c3d6b81f5a8fb2912b825a67db50f`. Forward migration: `20261023002800_direct_order_contract.sql`.

This document records Slice A's database scope. Subsequent local Edge/frontend implementation and its remaining release gates are documented in [buy-now-integration.md](buy-now-integration.md). Nothing has been deployed.

This slice adds SQL only. It does not add a frontend flow, an Edge endpoint or a deployment. Future direct purchases must use a dedicated endpoint, never a mode field sent to an older `place-order` handler.

## RPC

`public.place_direct_variant_order(p_request_id uuid, p_variant_id text, p_quantity integer, p_expected_quote jsonb, p_checkout jsonb)` is executable by `authenticated`, not `PUBLIC`, `anon` or `service_role`. It validates `auth.uid()` against Auth users. No ownership parameter or table write grants are added. A future Edge endpoint must validate the JWT and call this RPC using the caller's identity, not service-role placement.

For a new request, `p_expected_quote` is exactly one object with `product_id`, `variant_id`, `quantity`, `unit_price` matching the current trusted variant quote. IDs and quantity describe intent; submitted price only detects changes. Missing/extra/wrong fields cause `QUOTE_CHANGED`; non-object/null quote causes `INVALID_CHECKOUT`. Quantity is a PostgreSQL integer and must be 1–99; the future Edge adapter must reject fractional JSON quantities before invocation. PostgREST decoding is a later integration gate. Product identity is resolved from the variant.

`p_checkout` uses existing Bag fields: full_name, email, contact_phone, payment_phone, provider, fulfilment, zone_id, street, area, city, instructions. Phones must already be normalized to +232 and eight digits; SQL does not perform the existing Edge normalization. Unknown fields never supply authority. Known contact/delivery fields must be strings or null; required/null validation still applies.

Return shape remains `{id, reference, total, currency, status, payment_status}`. New orders use `checkout_source='direct'`; existing orders and unchanged Bag inserts default to `bag`. Source is constrained, non-null and immutable even for trusted updates. Original item snapshots provide the immutable direct variant/quantity binding without another draft/receipt table.

## Validation-parity matrix

| Rule | Existing variant Bag | Direct |
| --- | --- | --- |
| Identity | auth.uid(), existing Auth user | Same |
| Serialization | Owner advisory lock; cart and catalogue locks; stock lock | Same owner lock; product/variant share locks then stock update lock; no cart lock/access |
| Idempotency | Global unique owner/request; accepted Bag replays before checkout validation | Same unique index; accepted direct replays before quote/checkout/current catalogue checks, with original variant/quantity |
| Cross-source request reuse | Previously unspecified | Both Bag functions and direct reject `CHECKOUT_SOURCE_CONFLICT` (PT409) |
| Changed direct variant/quantity | Not applicable | `CHECKOUT_SELECTION_CONFLICT` (PT409), including when original catalogue becomes unavailable |
| Selection | All saved owned Bag lines, maximum 100 | Exactly one supplied variant, quantity 1–99 |
| Active/currency/pricing | Active product and variant, NLE, current variant price | Same; quote mismatch is `QUOTE_CHANGED` (PT409), not Bag `CART_CHANGED` |
| Checkout | Bounded name/email, email pattern, normalized phones, provider/fulfilment enum | Same, plus explicit JSON scalar-type checks for known fields |
| Delivery | Freetown case-insensitive, canonical snapshot; required bounded street/area; instructions ≤500 | Same |
| Fees | zone-1 4000, zone-2 5000, zone-3 6000 minor units; trusted labels | Same, no submitted fee/label authority |
| Pickup | Zero fee, Lumley/Freetown snapshot, delivery fields omitted | Same |
| Arithmetic | bigint subtotal, signed-integer total bound | Same |
| Inventory | Tracked stock locked and checked; allocation/ledger transaction; untracked supported | Same; no reservation at draft/click |
| Persistence | Order/items/job/stock and Bag consumption atomic | Order/one item/job/stock atomic; no cart creation, promotion, read or mutation |
| History/payment | Immutable product/options/prices/fulfilment; placed/awaiting_payment; payer last4 | Same |
| Email | Durable job, later service-only delivery | Same job; this SQL slice sends no email |
| Profile | Defaults independent, no profile save | No profile mutation |

New direct errors use stable SQL exception messages. PT409 marks permanent source/selection/quote conflicts, avoiding transaction-retry semantics. Other validation/availability errors retain the existing checkout messages. A future Edge adapter must explicitly map them; no adapter is included here.

The subsequent local Edge slice now maps source conflicts explicitly. An older hosted handler may still return generic unavailability until separately deployed. The SQL guard prevents wrong-source success or Bag conversion; a generic error never permits minting a replacement request ID during uncertainty.

## Retry and uncertainty

Same owner/request/same variant/quantity returns the existing order without rechecking today's stock, price or checkout details. Invalid identity/selection parameter shapes are rejected first. Retrying with another mode or selection conflicts. Existing Bag same-mode retries still accept empty quote/checkout as before.

An ordinary lookup returning no row does not prove an earlier request failed: an uncommitted transaction can later commit. Preserve and retry the same request ID. Different IDs are distinct purchases; SQL does not deduplicate independently generated IDs across tabs. A future client must retain source/selection and pending-owner context and must not call Bag `finishCheckout(true)` for direct success.

## Permissions and compatibility

No existing RLS policy or table-write privilege changes. SECURITY DEFINER is necessary for the validated transaction and uses fixed empty search_path and qualified table references. Source protection is a trigger, not an editable browser field. Only trusted database code can insert order source metadata.

The two Bag function bodies are copied from their latest baseline definitions with only the source guard added in the accepted-order branch. Direct validation/persistence deliberately follows the latest variant checkout body rather than broadly refactoring production Bag SQL in this slice. Tests cover parity; maintain this matrix when future checkout rules change.

Safe future rollout: reviewed migration, dedicated new Edge endpoint, then separately approved UI. No direct request may fall back to `place-order`. Keep source guards and recovery support during UI rollback; do not remove metadata or accepted orders. Applying this migration exposes an authenticated validated RPC, matching the existing RPC privilege model, even before an Edge endpoint exists.

## Local tests

Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File supabase/tests/run-local.ps1`. The existing disposable `postgres:14.1-alpine` container has no network and no hosted credentials. New rollback-only suites cover populated history preservation, direct placement, Bag invariance, validations, privileges, snapshots and rollback. Existing checkout/variant/inventory suites run again after 02800. Coordinated real PostgreSQL sessions in a disposable cloned database cover final-stock races, identical retries, cross-source races and in-flight no-row recovery. No concurrency fixture survives clone deletion.

For targeted iteration, add `-DirectOrderOnly`. It builds the original local 00100–00900 prerequisites, applies/tests 02800, reruns checkout regressions and runs the direct concurrency clone. The default command retains all existing suites through 02700 and the final fixture-cleanliness assertion, as well as the new tests.

Not established here: hosted migration/function parity, live JWT/PostgREST behavior, Google continuation/guest-merge suppression, frontend retry state or external email delivery. Those remain later gates. SQL decimal JSON coercion at the PostgREST wire boundary requires later integration tests; SQL tests can prove typed-signature rejection only.
