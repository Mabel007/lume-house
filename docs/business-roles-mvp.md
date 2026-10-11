# Owner and basic Staff MVP

Source review only. Migration `20261011002400_business_roles_mvp.sql` starts
disabled, assigns nobody and preserves active administrators' existing authority.
Do not activate, assign real identities or apply persistent migrations without
separate approval. Invitations and permission-editing UI are deferred.

## Enforced behavior after approved activation

Owner keeps existing admin products, variants/media, inventory, order lifecycle,
dashboard, exports and membership access. Staff sees only their own Auth profile,
order counts by open/completed/cancelled, and 20-row pages containing reference,
date, operational status and NLE minor-unit amount. No names, contact/address,
payment fields, order details, free-text reasons, stock/catalogue data, search,
CSV or mutation endpoints are included in Staff projections.

`require_business_admin()` and `is_business_admin()` authorize only Owner after
activation. Every baseline admin RPC uses the former. Pending Batch 06 gallery
RPCs and Batch 07 fulfilment RPCs also use it; Batch 06 POST checks the latter
before and after validation. Staff fails both, including on legacy clients.
Customer Auth ownership/RLS and public active-catalogue media access are separate.
Role assignment never comes from Auth metadata, email or client-provided actor IDs.

The frontend calls `business_access_v1()`. Only a genuinely missing RPC permits
fallback to the existing admin check; denial/network/malformed responses do not.
Staff routes mount separate projections and cannot mount Owner detail/mutation
components. Old clients deny Staff entry and their direct privileged RPC calls.

## Reviewed identity and cutover procedure still required

1. Verify initial Owner identities out of band and approve the exact assignment
   for every active legacy administrator. Review recovery authority and audit
   retention. Do not transmit credentials or identity material in chat or Git.
2. Inspect target ledger/backup readiness and migration order. Batch 07 owns
   02150; Batch 06 owns 02200/02300. Do not rewrite history or blindly introduce
   older pending migrations after 02400. No Storage activation is part of this MVP.
3. Apply the forward migration only under separate authorization. With roles
   disabled, service-only `recovery_set_business_role_v1` can stage explicit Owner
   assignments on existing memberships. Staff assignment is rejected even for an
   inactive member. Existing active permissions remain unchanged.
4. Independently verify signatures/grants, approved subjects and assignments,
   recovery access, compatibility with actual Batch 06/07 endpoint versions, and
   genuine Auth/API/browser acceptance in an approved isolated environment.
5. Service-only `activate_business_roles_v1(reason, context)` atomically requires
   at least one active Owner and an explicit Owner assignment for **every** active
   administrator. It records an immutable activation event. No partial cutover,
   inferred assignments, scheduled fallback or public bootstrap exists. If any
   legacy administrator must not become Owner, this cutover cannot proceed until
   the owner approves a compatible migration procedure; do not invent one.
6. Only after activation can an Owner use `admin_set_business_role_v1` to assign
   Owner/Staff roles to existing memberships. There is no editing UI. New Staff
   provisioning uses approved trusted tooling: create an inactive membership,
   assign Staff, then activate it through the guarded service-only membership
   function. Auth account creation/invitations are outside this patch.

Role mutation requires expected revision, actor-bound operation UUID and bounded
reason; trusted recovery also requires operator/case context. Current authority is
checked before replay. Replays preserve original receipts; changed actor/payload
or stale revisions fail. `admin_business_roles_v1()` exposes assignments, latest
100 role events and activation record only to unrestricted administrators (legacy
before cutover, Owners after). No direct browser/service table grants exist.

All role/membership writers use the existing membership advisory lock, then an
exclusive control-row lock, then membership/assignment rows. Ordinary authorized
operations hold shared control/membership/assignment locks until completion.
Revocation/demotion therefore waits for already authorized transactions; a later
operation cannot use removed authority. Service provisioning and Owner revocation
preserve last active Owner and last admin after cutover. Existing browser
self-revocation remains disabled. Audit has no deletion/retention API; PostgreSQL
superuser operations remain a trusted operational boundary.

## Acceptance and rollback

Disposable tests cover default-disabled compatibility, projections, every
baseline/pending admin RPC denial, private grants, Owner access, role receipts,
last Owner, and real concurrent demotions/revocations/replays. Pending compatibility
can be checked with the optional `CompatibilityMigrations` harness parameter for
the two reviewed 02150/02200 files, only inside its network-disabled disposable
container. This is not genuine JWT/PostgREST/Storage acceptance.

Manual QA remains required: real Owner/Staff/customer/revoked sessions; narrow
response keys at API level; old clients/direct RPC/Edge upload denial; pagination,
empty/error/retry; deep links; keyboard/screen reader and 360–1440 px layouts;
logout/account switch; concurrent operations against revocation; unchanged Owner
commerce/inventory/cancellation/media behavior. Payment remains unverified metadata.

Cutover is one-way through supported APIs. Do not roll the shared helper back to
equal-admin behavior while Staff remains active. Approved forward restrictions or
disabling access must preserve last-Owner recovery and all role/membership/audit
data. Frontend rollback alone does not undo server isolation. Do not delete tables,
audit, orders, stock history or real memberships as a rollback shortcut.

Production: **NO-GO** until identities, cutover/migration/deployment authorization
and genuine manual/API acceptance are complete. This patch does not apply them.
