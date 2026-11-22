# Lumé House

**Beautiful things live here.**

Lumé House is a modern home and lifestyle e-commerce experience for Sierra Leone, built as a Naj Builds portfolio project and developed beyond its original HNG coursework. It is a portfolio demonstration rather than a storefront serving live commercial customers (D1) — that limits infrastructure and automation scope, never security, authorization, data-integrity or payment-state rigor.

**Live storefront:** https://lume.najbuilds.com  
**Alternative production URL:** https://lume-house-delta.vercel.app  
**Market:** Sierra Leone · **Checkout currency:** NLE

> This repository includes work in progress. A feature branch or staging preview may contain functionality not yet released to production.

## What the application does

**Customer storefront**
- Browse a hosted catalogue of home and lifestyle products, search and filter, and view product details and available variants.
- Shop with a guest Cart or a persisted, account-linked Cart.
- Sign in with Google, edit customer profile defaults, and view personal order history.
- Choose Freetown delivery or pickup, review totals, and place orders through a trusted server-side flow.
- Follow orders from placement through history and fulfilment information. Order placement and payment confirmation are separate.
- See NLE prices with optional **informational** GNF, GHS, NGN and USD estimates shown alongside. **NLE remains the only checkout and settlement currency.**

**Administration**
- Protected admin sign-in and role-gated workspaces.
- Catalogue, variants, inventory and reviewed product media workflows.
- Order-management and fulfilment interfaces, reporting, filtering and export workflows, with server-enforced permissions.
- Restricted staff views alongside owner and legacy administration access. Inviting new members and finer delegated-role boundaries are **not released** and remain unfinished work.

**Release status:** S02 — Sierra Leone country enforcement, saved addresses, order timeline and notifications — is live in production as of 2026-11-18 (candidate `8aa2df6`, merged as `9084f7d`). The earlier Batch 2 Buy Now, navigation and browser-locale display-currency initialization work is also released — that initialization reads the browser's own locale region subtag once and is not the deferred location-based currency detection (D6). Production checkout was owner-verified on 2026-11-18 with a single real order whose confirmation reached Gmail Primary; that is one transaction, not a deliverability or payment-settlement guarantee. The transactional-email retry scheduler is **cancelled and out of scope** by owner decision — no credential, cron job or trigger is to be configured, and failed emails are not automatically retried. **S03 — Premium UI, Editorial Design and Motion — is in progress.** Standing owner decisions D1–D7 and their authoritative links live in [`AGENTS.md`](AGENTS.md#owner-engineering-decisions); current status and evidence: [S02 production release record](docs/s02-codex-remediation-complete.md).

## Technology

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Routing | React Router |
| Backend | Supabase PostgreSQL, Auth, Row Level Security, Edge Functions |
| Hosting | Vercel |
| Transactional email | Resend via server-side configuration |

Lumé House Web shares commerce data contracts with **Lumé House Mobile**, which is maintained in a separate repository.

## Architecture and trust boundaries

```text
Customer / Admin browser
  ├─ React storefront and protected admin UI
  ├─ Supabase Auth and owner/role-restricted reads
  └─ Authenticated Edge Functions
       ├─ Trusted cart/order and direct-order operations
       ├─ Product media operations
       └─ Order email processing
               ↓
       PostgreSQL transactions + RLS
```

Prices, inventory eligibility, order ownership and fulfilment charges are validated by trusted backend operations. Customer-supplied totals and payment-success claims are not authoritative. Orders retain historical price and fulfilment snapshots.

**Payments:** Orange Money and Afrimoney are currently checkout selections and order metadata, not live payment collection or verification integrations. Newly placed orders await payment confirmation. Never enter mobile-money PINs or OTPs in this application.

**Email:** Resend is implemented server-side with durable order-confirmation jobs. Actual sending depends on per-environment configuration; staging may intentionally disable outgoing email. Email delivery is not a prerequisite for persisting a successfully placed order. There is no scheduler and no automatic retry (D2): an unsent job stays durable and requires an explicitly authorized action, so never describe failed email as automatically retried.

## Environments

- **Production:** https://lume.najbuilds.com
- **Production alternative:** https://lume-house-delta.vercel.app
- **Staging:** separate Vercel Preview deployment and Supabase project, with exact-origin CORS rules. Preview hostnames are not necessarily interchangeable with the authorized stable staging alias.

Never point staging development or test-order workflows at production Supabase. Database migrations, privileged functions and deployment secrets must be managed as separate, reviewed operations. A frontend merge alone does not apply a database migration.

## Run locally

Requires **Node.js 22.12+** and access to a suitable non-production Supabase environment.

```powershell
npm.cmd ci
# Copy .env.example to .env.local and populate public development values.
npm.cmd run dev
```

The browser requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put service-role keys, Resend API keys, OAuth client secrets, database passwords or other private credentials in `VITE_*` variables or committed files.

## Validation

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run typecheck:functions
npm.cmd test
npm.cmd run build
git diff --check
```

**Latest documented Batch 2 staging-candidate evidence (October 25, 2026):** 635/635 application tests passed, plus lint, both TypeScript checks and build, before the five-file FX correction was committed. This is evidence for that tested commit, **not** a claim that production or every hosted integration has been verified.

Some database/security tests use a separately isolated local harness; see [Supabase documentation](supabase/README.md). Human staging/browser acceptance, CI checks and production smoke tests remain separate release gates.

## Key documentation

- [`AGENTS.md`](AGENTS.md) — cross-agent entry point: invariants, validation gates, and the canonical **Owner engineering decisions** (D1–D7)
- [Supabase backend and local validation](supabase/README.md)
- [Buy Now integration and recovery](docs/buy-now-integration.md)
- [Direct-order contract](docs/direct-order-contract.md)
- [Exact-origin staging CORS](docs/staging-cors.md)
- [Batch 2 staging release handoff](docs/staging-release-b2-1-b2-7.md)

## Current limitations and roadmap

- Real mobile-money collection, verification and reconciliation are **not** integrated, and adding it is deferred work (D6) rather than a current goal. Automatic location-based currency detection, browser push notifications, native mobile push and any expansion of production infrastructure are likewise out of scope; none of them may be introduced incidentally while changing UI, motion, notifications or checkout.
- Customer payments remain awaiting confirmation after order placement.
- Staging mail may be intentionally disabled; a verified production sender and deliverability require operational validation. One owner-received production confirmation in Gmail Primary (2026-11-18) does not establish either. The four historical `resend_http_403` job failures are closed as historical, with no conclusively established root cause; they are reopened only by a new reproducible failure (D3). There is no automatic retry: the scheduler is cancelled (D2).
- Broader accessibility, performance and cross-browser acceptance are ongoing.
- A more granular **Owner / Admin / Staff** permission model and further storefront motion/design polish are planned; the permission work exists only on unmerged branches.
- **Migration safety:** production migration `20261023002900` has applied schema objects with an incomplete ledger record. It must never be replayed and the ledger must not be auto-repaired; a read-only equivalence check precedes any future migration, and reconciliation needs explicit approval (D4).

## About

Lumé House is designed and built by **[Naj Builds](https://najbuilds.com)** as a portfolio e-commerce product for the Sierra Leone market.

For enquiries: **contact@najbuilds.com**.
