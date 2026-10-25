# Lumé House

**Beautiful things live here.**

Lumé House is a modern home and lifestyle e-commerce experience for Sierra Leone, built as a Naj Builds portfolio project and developed beyond its original HNG coursework.

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
- See NLE prices and, in the Batch 2 staging candidate, optional **informational** GNF, GHS, NGN and USD estimates. **NLE remains the only checkout and settlement currency.**

**Administration**
- Protected admin sign-in and role-gated workspaces.
- Catalogue, variants, inventory and reviewed product media workflows.
- Order-management and fulfilment interfaces, reporting, filtering and export workflows, with server-enforced permissions.
- Restricted staff views; additional owner/admin/staff role design remains planned rather than released.

**Release status:** The Batch 2 Buy Now, navigation and automatic-currency improvements are in a separately validated staging release candidate. They should not be assumed live on the production domain until that branch is merged, deployed and smoke-tested.

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

**Email:** Resend is implemented server-side with durable order-confirmation jobs. Actual sending depends on per-environment configuration; staging may intentionally disable outgoing email. Email delivery is not a prerequisite for persisting a successfully placed order.

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

- [Supabase backend and local validation](supabase/README.md)
- [Buy Now integration and recovery](docs/buy-now-integration.md)
- [Direct-order contract](docs/direct-order-contract.md)
- [Exact-origin staging CORS](docs/staging-cors.md)
- [Batch 2 staging release handoff](docs/staging-release-b2-1-b2-7.md)

## Current limitations and roadmap

- Real mobile-money collection, verification and reconciliation are **not** integrated.
- Customer payments remain awaiting confirmation after order placement.
- Staging mail may be intentionally disabled; a verified production sender and deliverability require operational validation.
- Broader accessibility, performance and cross-browser acceptance are ongoing.
- A more granular **Owner / Admin / Staff** permission model and further storefront motion/design polish are planned.
- Production release of the current Batch 2 candidate requires completion of its deployment, security and recovery gates.

## About

Lumé House is designed and built by **[Naj Builds](https://najbuilds.com)** as a portfolio e-commerce product for the Sierra Leone market.

For enquiries: **contact@najbuilds.com**.
