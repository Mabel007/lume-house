# S03 Production Release Record

Date: 2026-11-22 · Status: released · Evidence class: Git/source reconciliation and prior local QA evidence.

This is a concise release record, not a new production acceptance test. It does not extend the single D5 checkout transaction into a broader payment, email-deliverability or security claim.

## Release identity

| Item | Verified value |
| --- | --- |
| S03 integration merge | `5c83c03b6d7517986ae23fd45961b7a2e72a714f` |
| Commit subject | `Merge pull request #24 from Mabel007/s03-release-integration` |
| Merge timestamp | 2026-11-22 18:51:01 +0000 |
| Verification | `git fetch origin main` followed by `git merge-base --is-ancestor 5c83c03b origin/main` → `ANCESTOR_OF_ORIGIN_MAIN` |
| Local baseline note | Local `main` was stale at `63b62dd0` before the safe ref fetch; no branch was switched, reset or force-updated. |

## Verified release identity and accepted evidence

### Verified release identity

| Item | Value |
| --- | --- |
| PR | [#24 — S03 release integration](https://github.com/Mabel007/lume-house/pull/24) |
| CI | [Actions run 45056675533](https://github.com/Mabel007/lume-house/actions/runs/45056675533) |
| Source SHA | `4ee875c16962b479a6d3209a7f6f738e059fbaaa` — verified locally with `git cat-file`/`git log` as the second parent of the merge |
| Merge SHA | `5c83c03b6d7517986ae23fd45961b7a2e72a714f` — verified locally as the S03 integration merge |

### Accepted release evidence

- Vercel staging Preview deployed.
- Owner-reported staging smoke: **7/7 PASS**.
- Owner-reported production smoke: **6/6 PASS**.
- Production URL: https://lume.najbuilds.com

The two smoke results are **owner-reported acceptance evidence**, not independently executed tests in this documentation pass. They confirm the accepted release smokes only; they are not claims of comprehensive accessibility, payment or performance verification. See also the narrower single-transaction limitation in D5 above.

### Unverified or deferred

- Google OAuth on staging Preview — **UNVERIFIED**.
- Dedicated Core Web Vitals measurements — **UNVERIFIED**.
- Four Windows Narrator spoken-announcement checks — **UNVERIFIED**:
  1. Shop search result count.
  2. Shop category-filter result count.
  3. Cart quantity/removal feedback.
  4. Checkout validation feedback.
- Sitewide motion consistency — **UNVERIFIED**. Homepage and Shop are the strongest implemented areas; broader motion enhancement remains a future discovery topic.

### Tracker references

- [S03 Trello](https://trello.com/c/Y6y6GfmO)
- [S04 Trello](https://trello.com/c/gnghDsZj)
- [Confluence master roadmap](https://mabel007.atlassian.net/wiki/spaces/SM/pages/203587587)

## Released scope

S03 Premium UI, Editorial Design and Motion was integrated through PR #24. The released integration includes the cross-page editorial/motion foundation, the refined storefront and cart target work, and the corresponding documentation updates recorded in the merge. This record confirms release identity; it does not re-scope or restart S03 discovery (D7).

## Evidence reused

- Prior gate: `.codex/storefront-ux/qa/s03-slice3-final-regression-gate.md` (local source/static inspection, quality gates and one broad automated run).
- Raw broad-suite log: `.codex/storefront-ux/qa/s03-slice3-final-regression-suite.log`.
- Accepted slice evidence: `s03-slice1-d7-independent-review.md`, `s03-slice2-owner-acceptance-evidence.md`, `s03-slice2b-acceptance-and-cart-fix.md` and `s03-slice2b-independent-review.md` in the same QA directory.
- Prior gate totals: 905 passing tests, 0 assertion failures, 0 skips, 1 documented file-level timeout cancellation (`tests/s03-b2-address-dom.test.mjs`); lint, both TypeScript checks, build and `git diff --check` passed. A fully green `npm test` exit 0 remains UNVERIFIED for that environment and is not claimed here.

## Invariants preserved

D1–D7 remain authoritative. The S03 release record does not authorize D2 email retries, reopen D3's historical Resend 403 investigation, repair D4 migration-ledger drift, broaden D5's single-transaction evidence, introduce D6 deferred features, or change the S01–S08 roadmap. No auth, RLS, order, payment, email, database, dependency or hosted-configuration change is part of this record.

## Follow-on

S04 Responsive and Accessibility Polish commenced from the verified merge. The first slice's measured defects, minimal CSS fixes, regression coverage and unresolved items are recorded in `.codex/storefront-ux/qa/s04-doc-responsive-first-slice.md`.
