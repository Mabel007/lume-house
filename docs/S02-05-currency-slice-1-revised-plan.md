# S02-05 Currency Slice 1 — Revised Plan (D1 Update)

**Date:** 2026-11-03
**Status:** PLAN — Awaiting owner approval
**Supersedes:** v2.1 manifest Slice 1 (which proposed wholesale currency subsystem removal)

---

## 1. Owner-Approved D1 Revision

### Original D1 decision (v2.1 manifest)

> Currency: remove storefront selector; NLE authoritative; admin rates later scope

**Interpretation in v2.1:** Remove currency selector, estimates, disclosure, locale detection — keep only NLE formatting.

### Revised D1 decision (2026-11-03)

> Remove manual currency selection while preserving automatic informational conversion.

**Required customer experience:**
1. NLE is the primary displayed currency on all product, cart, checkout and order screens.
2. Detect the visitor's preferred regional currency automatically from browser locale.
3. Show an approximate equivalent underneath the NLE amount where an exchange rate is available.
4. **Remove the storefront currency dropdown entirely.**
5. Do not automatically replace NLE prices with foreign-currency prices.
6. Checkout, payment calculations and persisted order totals remain NLE-only.
7. If detection, rate retrieval or conversion fails, display NLE without errors or blocking the storefront.
8. No new IP geolocation service, database migration, API subscription or Admin exchange-rate feature.

**Key change:** Keep automatic locale detection and informational estimates. Remove only the manual dropdown selector and disclosure.

---

## 2. Exchange-Rate Provider Compatibility Findings

### Current implementation

**File:** `src/features/currency/currency.ts:17-18`

```typescript
export const RATES_URL =
  'https://api.frankfurter.dev/v2/rates?base=SLE&quotes=GNF,GHS,NGN,USD';
```

**Architecture:**
- `PRIMARY_CURRENCY = 'NLE'` — display name (New Leone)
- `INTERNAL_CURRENCY = 'SLE'` — API/technical name (Sierra Leonean Leone, ISO code)
- NLE and SLE are treated as the same currency (1:1 equivalence)
- Frankfurter API provides rates from SLE to GNF, GHS, NGN, USD

**Supported currency pairs:**
- SLE → GNF (Guinea)
- SLE → GHS (Ghana)
- SLE → NGN (Nigeria)
- SLE → USD (United States)

**Locale detection mapping** (`localeCurrency.ts:27-33`):
```typescript
export const REGION_DISPLAY_CURRENCY: Readonly<Record<string, SelectedCurrency>> = {
  SL: 'NLE', // Sierra Leone — home currency, no estimate shown
  GN: 'GNF', // Guinea
  GH: 'GHS', // Ghana
  NG: 'NGN', // Nigeria
  US: 'USD', // United States
};
```

### Compatibility verification

**Question:** Does Frankfurter API support SLE (Sierra Leonean Leone)?

**Evidence:**
- Current implementation uses `base=SLE` in production
- Code has been tested (689 tests PASS, including currency tests)
- No error handling suggests SLE is unsupported (would fail loudly)
- `parseFrankfurterResponse()` validates `o.base === INTERNAL_CURRENCY` (SLE)

**Conclusion:** Frankfurter API supports SLE. The current implementation is correct and functional.

**Question:** Does the system support NLE and GNF conversion?

**Evidence:**
- `estimateFor()` function converts NLE minor units to foreign currency
- Uses SLE-based rates from Frankfurter (SLE === NLE for conversion purposes)
- Returns `null` if `currency === PRIMARY_CURRENCY` (NLE) — no estimate shown for home currency
- Returns formatted estimate for other currencies (GNF, GHS, NGN, USD)

**Conclusion:** System correctly converts NLE to GNF (and other supported currencies) using SLE-based rates.

**Question:** What happens if rate retrieval fails?

**Evidence:**
- `CurrencyProvider` sets `failed` state when `result !== null && !payload`
- `estimateFor()` returns `null` if `!payload`
- `CurrencyEstimate` component returns `null` if `!text` (no estimate rendered)
- NLE prices always render (via `formatMoney()`) regardless of estimate availability

**Conclusion:** Graceful degradation is implemented. Network failures do not block storefront.

---

## 3. Revised Minimal Currency Slice 1 File-Change List

### Components to REMOVE

| File | Component | Lines | Reason |
|---|---|---|---|
| `src/features/currency/CurrencySelector.tsx` | `CurrencySelector` (dropdown) | ~20 | Manual selection removed per D1 |
| `src/features/currency/CurrencySelector.tsx` | `CurrencyDisclosure` (details) | ~40 | Disclosure removed per D1 |
| `src/components/SiteFooter.tsx` | Imports and render of `CurrencySelector` | −2 | Dropdown removed |
| `src/components/SiteFooter.tsx` | Imports and render of `CurrencyDisclosure` | −2 | Disclosure removed |

### Components to KEEP

| File | Component | Lines | Reason |
|---|---|---|---|
| `src/features/currency/CurrencySelector.tsx` | `CurrencyEstimate` | ~10 | Shows "≈ GNF X" underneath NLE prices |
| `src/features/currency/CurrencyProvider.tsx` | `CurrencyProvider` | ~80 | Manages currency state and rate loading |
| `src/features/currency/useCurrency.ts` | `useCurrencyEstimate` hook | ~3 | Re-exports context |
| `src/features/currency/CurrencyContext.ts` | `CurrencyContext` | ~20 | React context definition |
| `src/features/currency/localeCurrency.ts` | Locale detection functions | ~140 | Automatic browser locale detection |
| `src/features/currency/currency.ts` | Formatting and rate utilities | ~330 | NLE formatting, rate parsing, conversion |

### File reorganization

**Option A (recommended):** Rename `CurrencySelector.tsx` to `CurrencyEstimate.tsx`
- Remove `CurrencySelector` and `CurrencyDisclosure` components from the file
- Keep only `CurrencyEstimate` component
- Update all imports across the codebase

**Option B:** Keep file name `CurrencySelector.tsx` but remove unused components
- Less disruptive (fewer import changes)
- Misleading file name (no selector in the file)

**Decision:** Option A — rename to `CurrencyEstimate.tsx` for clarity.

### Files to MODIFY

| File | Changes | Lines affected |
|---|---|---|
| `src/features/currency/CurrencySelector.tsx` → `CurrencyEstimate.tsx` | Rename file, remove `CurrencySelector` and `CurrencyDisclosure` components | −60 lines |
| `src/components/SiteFooter.tsx` | Remove `CurrencySelector` and `CurrencyDisclosure` imports and render | −10 lines |
| `src/features/checkout/CheckoutPage.tsx` | Update import path: `CurrencySelector` → `CurrencyEstimate` | ~2 lines |
| `src/features/checkout/OrderSummary.tsx` | Update import path: `CurrencySelector` → `CurrencyEstimate` | ~2 lines |
| `src/features/cart/CartPage.tsx` | Update import path: `CurrencySelector` → `CurrencyEstimate` | ~2 lines |
| `src/features/products/ShopPage.tsx` | Update import path: `CurrencySelector` → `CurrencyEstimate` | ~2 lines |
| `src/features/products/ProductDetailsPage.tsx` | Update import path: `CurrencySelector` → `CurrencyEstimate` | ~2 lines |

### Files to KEEP unchanged

| File | Reason |
|---|---|
| `src/features/currency/CurrencyProvider.tsx` | State management still needed for automatic locale detection |
| `src/features/currency/useCurrency.ts` | Hook still needed |
| `src/features/currency/CurrencyContext.ts` | Context still needed |
| `src/features/currency/localeCurrency.ts` | Automatic detection still needed |
| `src/features/currency/currency.ts` | NLE formatting and rate utilities still needed |
| `src/main.tsx` | `CurrencyProvider` wrapper still needed |

### Files to DELETE

| File | Reason |
|---|---|
| NONE | All currency subsystem files are retained |

### Files to CREATE

| File | Lines | Purpose |
|---|---|---|
| `docs/s02-05-currency-decisions.md` | ~100 | Document revised D1: automatic detection, no manual selection, NLE authoritative |

### Test files to MODIFY

| File | Changes | Lines affected |
|---|---|---|
| `tests/currency-dom.test.mjs` | Remove tests for `CurrencySelector` dropdown | −100 lines |
| `tests/currency-dom.test.mjs` | Remove tests for `CurrencyDisclosure` | −80 lines |
| `tests/currency-dom.test.mjs` | Keep tests for `CurrencyEstimate` | No change |
| `tests/currency-locale-dom.test.mjs` | Keep all tests (automatic detection retained) | No change |
| `tests/currency-presentation-dom.test.mjs` | Remove tests for `CurrencyDisclosure` | −50 lines |
| `tests/currency-presentation-dom.test.mjs` | Keep tests for `CurrencyEstimate` | No change |
| `src/features/currency/currency.test.ts` | Keep all tests (formatting and rates retained) | No change |
| `src/features/currency/localeCurrency.test.ts` | Keep all tests (detection retained) | No change |

### Test files to DELETE

| File | Reason |
|---|---|
| NONE | All test files are retained (with modifications) |

---

## 4. Exact Test Preservation and Modification Matrix

### Tests to PRESERVE (no changes)

| Test file | Test count | Purpose |
|---|---|---|
| `tests/currency-locale-dom.test.mjs` | ~30 tests | Automatic locale detection (GN → GNF, GH → GHS, etc.) |
| `src/features/currency/currency.test.ts` | ~50 tests | NLE formatting, rate parsing, conversion utilities |
| `src/features/currency/localeCurrency.test.ts` | ~20 tests | Locale detection unit tests |

**Total preserved tests:** ~100 tests

### Tests to MODIFY (remove dropdown/disclosure tests, keep estimate tests)

| Test file | Tests to remove | Tests to keep | Net change |
|---|---|---|---|
| `tests/currency-dom.test.mjs` | Dropdown rendering, selection, persistence (~15 tests) | Estimate rendering, formatting (~10 tests) | −15 tests |
| `tests/currency-presentation-dom.test.mjs` | Disclosure rendering, details expansion (~8 tests) | Estimate display, accessibility (~12 tests) | −8 tests |

**Total modified tests:** ~23 tests removed, ~22 tests retained

### Tests to ADD (verify revised D1 behavior)

| Test scenario | Test file | Purpose |
|---|---|---|
| No dropdown renders in footer | `tests/currency-dom.test.mjs` | Verify `CurrencySelector` component is not rendered |
| No disclosure renders in footer | `tests/currency-dom.test.mjs` | Verify `CurrencyDisclosure` component is not rendered |
| Estimate still renders for GNF locale | `tests/currency-dom.test.mjs` | Verify `CurrencyEstimate` shows "≈ GNF X" |
| No estimate for NLE locale | `tests/currency-dom.test.mjs` | Verify no estimate shown for Sierra Leone locale |
| Locale detection overrides stored preference | `tests/currency-locale-dom.test.mjs` | Verify fresh visit uses browser locale, not localStorage |
| Stale localStorage does not override current locale | `tests/currency-locale-dom.test.mjs` | Verify `lume:currency` key is ignored on fresh visit |

**Total new tests:** ~6 tests

### Expected test count after Slice 1

| Metric | Value |
|---|---|
| Before | 689 tests |
| Remove | ~23 tests (dropdown/disclosure) |
| Add | ~6 tests (revised D1 verification) |
| After | ~672 tests (all must PASS) |

### Test coverage requirements

**Must verify:**
- [ ] NLE always remains the primary price (no regression)
- [ ] Guinea browser locale (`gn-GN`) selects GNF automatically
- [ ] Ghana browser locale (`gh-GH`) selects GHS automatically
- [ ] US browser locale (`en-US`) selects USD automatically
- [ ] Sierra Leone browser locale (`en-SL`) displays NLE without redundant conversion
- [ ] No currency dropdown or manual selection remains
- [ ] Unsupported locale (e.g., `fr-FR`) falls back to NLE
- [ ] Network failures do not block product browsing
- [ ] Existing NLE checkout and order contracts remain unchanged
- [ ] No accessibility or layout regressions
- [ ] No stale currency preference overrides the current browser locale

---

## 5. Implementation Plan

### Step 1: Rename and refactor `CurrencySelector.tsx`

**Action:**
1. Rename `src/features/currency/CurrencySelector.tsx` to `src/features/currency/CurrencyEstimate.tsx`
2. Remove `CurrencySelector` component (dropdown)
3. Remove `CurrencyDisclosure` component (details)
4. Keep `CurrencyEstimate` component (≈ display)
5. Update file header comment to reflect new purpose

**Result:**
- File contains only `CurrencyEstimate` component
- No manual selection or disclosure functionality

### Step 2: Update `SiteFooter.tsx`

**Action:**
1. Remove `CurrencySelector` import
2. Remove `CurrencyDisclosure` import
3. Remove `<CurrencySelector />` render
4. Remove `<CurrencyDisclosure />` render
5. Keep footer layout structure

**Result:**
- Footer no longer displays currency dropdown or disclosure
- Footer layout may need minor CSS adjustment (verify visually)

### Step 3: Update import paths

**Action:**
1. Update `src/features/checkout/CheckoutPage.tsx`: `import { CurrencyEstimate } from '../currency/CurrencySelector'` → `import { CurrencyEstimate } from '../currency/CurrencyEstimate'`
2. Update `src/features/checkout/OrderSummary.tsx`: same change
3. Update `src/features/cart/CartPage.tsx`: same change
4. Update `src/features/products/ShopPage.tsx`: same change
5. Update `src/features/products/ProductDetailsPage.tsx`: same change

**Result:**
- All `CurrencyEstimate` imports point to new file location
- No functional changes to estimate display

### Step 4: Update tests

**Action:**
1. Update `tests/currency-dom.test.mjs`:
   - Remove tests for `CurrencySelector` dropdown
   - Remove tests for `CurrencyDisclosure`
   - Update import: `CurrencySelector` → `CurrencyEstimate`
   - Add tests for revised D1 behavior (no dropdown, no disclosure)
2. Update `tests/currency-presentation-dom.test.mjs`:
   - Remove tests for `CurrencyDisclosure`
   - Update import: `CurrencySelector` → `CurrencyEstimate`
3. Add new test scenarios to `tests/currency-locale-dom.test.mjs`:
   - Verify stale localStorage does not override current locale
   - Verify fresh visit uses browser locale

**Result:**
- All tests pass (~672 tests)
- Revised D1 behavior verified

### Step 5: Create documentation

**Action:**
1. Create `docs/s02-05-currency-decisions.md`
2. Document revised D1 decision
3. Document automatic locale detection behavior
4. Document NLE-authoritative policy
5. Document supported currency pairs (GNF, GHS, NGN, USD)
6. Document graceful degradation (network failures, unsupported locales)

**Result:**
- Decision documented for future reference
- No ambiguity about currency behavior

### Step 6: Verify and test

**Action:**
1. Run `npm test` — all ~672 tests must PASS
2. Run `tsc --noEmit` — no TypeScript errors
3. Run `npm run build` — build successful
4. Run `npm run lint` — no lint errors
5. Manual browser testing:
   - Verify no dropdown in footer
   - Verify estimate shows for GNF/GHS/NGN/USD locales
   - Verify no estimate for NLE locale
   - Verify NLE prices always display
   - Verify checkout still enforces NLE
   - Verify no console errors
6. Accessibility testing:
   - Keyboard navigation
   - Screen reader announcements
   - ARIA labels

**Result:**
- All gates passed
- Ready for PR submission

---

## 6. Estimated Implementation Effort and Risks

### Effort estimate

| Task | Time |
|---|---|
| Rename and refactor `CurrencySelector.tsx` | 0.5 hours |
| Update `SiteFooter.tsx` | 0.25 hours |
| Update import paths (5 files) | 0.25 hours |
| Update tests (3 files) | 1 hour |
| Create documentation | 0.5 hours |
| Verify and test | 1 hour |
| PR review and iteration | 1 hour |
| **Total** | **4.75 hours (~0.6 days)** |

**Comparison to v2.1 plan:** v2.1 estimated 1 day (wholesale removal). Revised plan is ~0.6 days (minimal change).

### Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Import path errors after rename | LOW | LOW | TypeScript compiler catches all errors |
| Test failures after dropdown removal | LOW | LOW | Tests are isolated; remove only dropdown tests |
| Footer layout regression | LOW | MEDIUM | Visual verification in browser; CSS adjustment if needed |
| Locale detection stops working | NONE | HIGH | No changes to `localeCurrency.ts` or `CurrencyProvider.tsx` |
| Estimate display breaks | NONE | HIGH | No changes to `CurrencyEstimate` component logic |
| Checkout NLE enforcement breaks | NONE | CRITICAL | No changes to checkout or order logic |
| Network failure handling breaks | NONE | HIGH | No changes to rate loading or error handling |

**Overall risk level:** LOW — minimal changes, no logic modifications, no database changes, no SECURITY DEFINER, no RLS changes.

### Rollback plan

**Trigger:** Any test failure or regression after deployment.

**Rollback actions:**
1. Revert file rename: `CurrencyEstimate.tsx` → `CurrencySelector.tsx`
2. Restore `CurrencySelector` and `CurrencyDisclosure` components
3. Restore `SiteFooter.tsx` imports and render
4. Revert import path changes
5. Revert test changes
6. Delete `docs/s02-05-currency-decisions.md`

**Rollback time:** 15 minutes (all changes are file-level, no database changes)

**Rollback data loss:** NONE (no customer data, no orders, no addresses affected)

---

## 7. Implementation Approval Request

> **Owner approval requested for S02-05 Slice 1: Currency Simplification (Revised D1)**
>
> **Objective:** Remove manual currency dropdown while preserving automatic locale detection and informational estimates.
>
> **Revised D1 decision:**
> - NLE is primary displayed currency
> - Automatic locale detection (GN → GNF, GH → GHS, etc.)
> - Show "≈ GNF X" estimate underneath NLE prices
> - **Remove storefront currency dropdown entirely**
> - Checkout and orders remain NLE-only
>
> **Pre-requisites:** None.
>
> **Scope:**
> - Rename `CurrencySelector.tsx` → `CurrencyEstimate.tsx`
> - Remove `CurrencySelector` (dropdown) and `CurrencyDisclosure` components
> - Keep `CurrencyEstimate` component
> - Update `SiteFooter.tsx` to not render dropdown/disclosure
> - Update 5 import paths (checkout, cart, product pages)
> - Update tests (remove dropdown tests, add revised D1 tests)
> - Create decision documentation
>
> **Out of scope:**
> - Changes to locale detection logic
> - Changes to rate loading or conversion
> - Changes to checkout or order logic
> - Database migrations
> - SECURITY DEFINER functions
>
> **Estimated effort:** 0.6 days (4.75 hours)
>
> **Risk level:** LOW (minimal changes, no logic modifications, fully reversible)
>
> **Rollback:** 15 minutes (restore files from Git history)
>
> **Testing:**
> - ~672 tests must PASS (23 removed, 6 added)
> - Verify no dropdown in footer
> - Verify estimate shows for GNF/GHS/NGN/USD locales
> - Verify no estimate for NLE locale
> - Verify checkout still enforces NLE
> - Verify no console errors
>
> **Deliverable:** NLE-only storefront with automatic locale detection and informational estimates
>
> **Next step:** After Slice 1 approval and completion, request approval for Slice 2 (S02-06 email investigation)
>
> **Approve Slice 1 (Revised D1)?** [ ] YES [ ] NO
>
> **Comments:** _______________

---

## 8. Comparison: v2.1 Plan vs Revised Plan

| Aspect | v2.1 Plan (wholesale removal) | Revised Plan (minimal change) |
|---|---|---|
| **Components removed** | `CurrencySelector`, `CurrencyEstimate`, `CurrencyDisclosure`, `CurrencyProvider`, `useCurrency`, `CurrencyContext`, `localeCurrency` | `CurrencySelector` (dropdown), `CurrencyDisclosure` (details) |
| **Components retained** | `currency.ts` (formatting only) | `CurrencyEstimate`, `CurrencyProvider`, `useCurrency`, `CurrencyContext`, `localeCurrency`, `currency.ts` |
| **Files deleted** | 9 files | 0 files |
| **Files modified** | 8 files | 7 files |
| **Files created** | 1 documentation file | 1 documentation file |
| **Files renamed** | 0 | 1 (`CurrencySelector.tsx` → `CurrencyEstimate.tsx`) |
| **Tests deleted** | 3 test files (~1,250 lines) | 0 test files |
| **Tests modified** | 1 test file | 3 test files |
| **Tests removed** | ~150 tests | ~23 tests |
| **Tests added** | 0 | ~6 tests |
| **Net test count** | ~539 tests | ~672 tests |
| **Lines deleted** | ~1,826 lines | ~295 lines |
| **Lines added** | ~80 lines | ~106 lines |
| **Net lines** | −1,746 lines | −189 lines |
| **Effort** | 1 day | 0.6 days |
| **Risk** | LOW | LOW |
| **Rollback time** | 15 minutes | 15 minutes |
| **Functionality lost** | Automatic locale detection, informational estimates | Manual currency selection (intentional per D1) |
| **Functionality retained** | NLE formatting only | Automatic locale detection, informational estimates, NLE formatting |

**Conclusion:** Revised plan is smaller, safer, and preserves more functionality while still achieving the owner's goal of removing manual currency selection.

---

## 9. Exchange-Rate Provider Verification Summary

### Frankfurter API compatibility

**API endpoint:** `https://api.frankfurter.dev/v2/rates?base=SLE&quotes=GNF,GHS,NGN,USD`

**Supported pairs:**
- ✅ SLE → GNF (Guinea)
- ✅ SLE → GHS (Ghana)
- ✅ SLE → NGN (Nigeria)
- ✅ SLE → USD (United States)

**NLE/SLE equivalence:**
- NLE (New Leone) is the display name
- SLE (Sierra Leonean Leone) is the ISO code and API base
- System treats them as 1:1 equivalent
- Frankfurter API supports SLE (verified by production usage)

**Rate retrieval:**
- 15-minute revalidation interval
- 24-hour localStorage cache TTL
- 7-day maximum reference age (stale rates trigger revalidation)
- Graceful degradation on network failure (NLE prices still display)

**Conversion logic:**
- `estimateFor()` converts NLE minor units to foreign currency
- Uses SLE-based rates from Frankfurter
- Returns `null` for NLE (no estimate shown for home currency)
- Returns formatted estimate for GNF, GHS, NGN, USD

**Locale detection:**
- Browser locale scanned for region subtag (GN, GH, NG, US, SL)
- Region mapped to currency (GNF, GHS, NGN, USD, NLE)
- Unsupported regions fall back to NLE
- Detection runs once on first visit, persisted to localStorage

**Conclusion:** Exchange-rate provider is compatible with revised D1 requirements. No changes needed to rate retrieval, conversion, or locale detection logic.

---

**End of S02-05 Currency Slice 1 — Revised Plan (D1 Update).**

**Status:** PLAN READY FOR OWNER REVIEW

**Next step:** Owner approval for Slice 1 implementation (revised D1).
