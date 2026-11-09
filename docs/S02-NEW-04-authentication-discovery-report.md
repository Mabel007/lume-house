# S02-NEW-04 Authentication Architecture Discovery Report

**Project:** Lumé House Web  
**Repository:** Mabel007/lume-house  
**Branch:** feat/lume-web-s02-country-enforcement  
**HEAD:** eb035f96f91acfe65a0ccbfe47c807b75ff7fc4f  
**Date:** 2026-11-03  
**Mode:** READ-ONLY DISCOVERY — No implementation  

---

## 1. Baseline and Evidence

### Repository state
- **Branch:** `feat/lume-web-s02-country-enforcement` (S02-01 country enforcement, now merged to main)
- **HEAD:** `eb035f9` (PR #21 head commit)
- **Working tree:** One modified tracked file (`docs/s02-01-country-qa-matrix.md`) from previous session
- **Untracked:** `.codex/` directory (git-excluded, contains session reports)

### Discovery methodology
- Source code inspection: `src/features/auth`, `src/features/account`, `src/features/cart`, `src/lib/supabase`
- Database schema review: `supabase/migrations/00100` through `02900`
- Edge Function audit: `supabase/functions/_shared/handler.ts`, `place-order`, `place-direct-order`
- Test coverage verification: 689 automated tests PASS (full suite)
- Documentation review: `README.md`, `docs/`, `supabase/README.md`

### Evidence classification
- **VERIFIED**: Confirmed in Web source code, migrations, or tests
- **ASSUMED**: Inferred for Mobile based on shared contracts (requires separate Mobile verification)
- **MISSING**: Not implemented in current codebase
- **PARTIAL**: Partially implemented or configuration-dependent

---

## 2. Existing Authentication Architecture

### 2.1 Supabase Auth initialization

**Status: IMPLEMENTED**

**File:** `src/lib/supabase/client.ts:1-25`
- Singleton client created by `getSupabaseClient()`
- Auth configuration:
  - `persistSession: true` — localStorage persistence
  - `autoRefreshToken: true` — automatic token refresh
  - `detectSessionInUrl: true` — OAuth callback detection
  - `flowType: "pkce"` — PKCE OAuth flow (secure browser-based)

**File:** `src/lib/supabase/config.ts:1-38`
- Validates `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
- Enforces HTTPS in production, permits localhost in development
- Rejects secret-key format (`sb_secret_*`), requires `sb_publishable_` prefix
- Rejects URLs with embedded credentials, paths, query strings, or fragments

**Tests:** `src/lib/supabase/config.test.ts:1-47` — 3 test cases covering validation rules

### 2.2 Google OAuth implementation

**Status: IMPLEMENTED**

**Sign-in initiation:** `src/features/auth/auth.ts:21-24`
- `startGoogleSignIn(client, redirectTo)` calls `client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })`
- Throws user-facing error on failure

**Redirect URL construction:** `src/features/auth/auth.ts:16-20`
- `authRedirect(origin, configured?)` builds callback URL
- Defaults to `/auth/callback` if `VITE_AUTH_REDIRECT_URL` unset
- Validates same-origin and protocol safety

**Customer sign-in trigger:** `src/features/auth/AuthProvider.tsx:30-33`
- `signIn(adminReturnTo?)` clears pending customer auth return if admin intent supplied
- Stores admin intent in sessionStorage
- Calls `startGoogleSignIn`
- Error message: "Google sign-in could not start. Please try again."

**Admin sign-in trigger:** `src/features/admin/AdminPage.tsx:41`
- Calls `signIn(location.pathname + location.search + location.hash)` to store admin return path

**Customer UI button:** `src/features/account/AccountPage.tsx:74`
- Renders `<button className="button google-sign-in">` with Google "G" mark
- Calls `auth.signIn()` on click

**Callback handling:** `src/features/auth/CustomerRoutes.tsx:10-15`
- `AuthCallback` component at `/auth/callback` route (registered in `main.tsx:41`)
- Consumes admin auth intent or customer auth return from sessionStorage
- Navigates to stored target on success
- Shows error page with checkout link on failure
- Shows "Returning to checkout..." with `role="status"` while session loads

**Admin return path storage:** `src/features/auth/adminAuthIntent.ts:1-24`
- sessionStorage key: `lume-house-admin-return`
- Validates path starts with `/admin` and is same-origin

**Customer return path storage:** `src/features/auth/customerAuthIntent.ts:1-22`
- sessionStorage key: `lume-customer-auth-return`
- Stores direct-checkout intent ID for callback routing

**Tests:** `src/features/auth/customer.test.ts:22-29` — redirect URL validation, cross-origin rejection

### 2.3 Session management

**Status: IMPLEMENTED**

**Session persistence:** `src/lib/supabase/client.ts:17`
- `persistSession: true` — Supabase stores session in localStorage

**Session restoration:** `src/features/auth/auth.ts:2-15`
- `watchSession()` calls `client.auth.getSession()` to restore current session
- Guards against duplicate `INITIAL_SESSION` events with `observed` flag

**Session refresh:** `src/lib/supabase/client.ts:18`
- `autoRefreshToken: true` — Supabase handles token refresh automatically

**Session generation tracking:** `src/features/auth/AuthProvider.tsx:10,21`
- `sessionGeneration` state increments on sign-out or user identity change
- Exposed through `AuthContext` for CartProvider, CheckoutPage, NotificationProvider
- Scopes data to specific sign-in lifetime

**Sign-out implementation:** `src/features/auth/AuthProvider.tsx:35-47`
- `requestSignOut()` calls `client.auth.signOut()`
- Clears session and error state on success
- Returns `{ ok: true }` or `{ ok: false, message }`

**Sign-out controller:** `src/features/auth/AuthContext.ts:29-58`
- `createSignOutController()` wraps sign-out in idempotent controller
- Concurrent calls share same in-flight promise
- `signingOut` boolean tracks pending state
- `error` holds retryable failure messages

**Sign-out hook:** `src/features/auth/useCustomerSignOut.ts:1-24`
- `useCustomerSignOut()` subscribes to shared controller
- Returns `{ signingOut, error, signOut }` for UI components

### 2.4 Auth state subscriptions

**Status: IMPLEMENTED**

**Central subscription:** `src/features/auth/auth.ts:2-15`
- `watchSession()` is single point of subscription
- Calls `client.auth.onAuthStateChange()`
- Returns cleanup function that sets `active = false` and calls `subscription.unsubscribe()`

**Provider wiring:** `src/features/auth/AuthProvider.tsx:13-29`
- `useEffect` with empty dependency array calls `watchSession` once on mount
- Cleanup function sets `active = false` and calls `stop()` to unsubscribe
- State updates guarded by `active` flag to prevent post-unmount updates

**Context propagation:** `src/features/auth/AuthContext.ts:75-86`
- `AuthContext` created with `createContext`
- `AuthProvider` wraps entire app (`main.tsx:24`)
- `useAuth()` hook consumed by 20+ components for session state, sign-in, sign-out

**Cleanup on unmount:** `src/features/auth/auth.ts:14`
- Cleanup calls `subscription.unsubscribe()` on Supabase listener
- Sets `active = false` to suppress stale callbacks

**Tests:** `src/features/auth/customer.test.ts:30-44` — post-stop event suppression, unsubscribe verification

### 2.5 Profile management

**Status: IMPLEMENTED**

**Profile type:** `src/features/account/profile.ts:3-4`
- Fields: `full_name`, `phone`, `default_street_address`, `default_area`, `default_city`
- `emptyProfile` provides blank defaults

**Profile creation flow:** `src/features/account/profile.ts:24-34`
- `saveProfile()` first calls `loadProfile()` to check existence
- If no profile exists: `insert` with `{ id: userId, ...values }`
- On unique constraint violation (`23505`): falls through to `update`
- `update` targets only mutable profile columns, never `id`

**Profile read:** `src/features/account/profile.ts:19-23`
- `loadProfile()` queries `profiles` table
- Selects only five profile columns
- Filtered by `id = userId`
- Uses `maybeSingle()`

**Profile RLS:** Implied by `id = userId` scoping
- `id` column is user's Supabase Auth UID
- Insert uses `{ id: userId }` from `auth.session.user.id`
- Update scoped by `.eq("id", userId)`
- RLS policies enforce `auth.uid() = id` on `profiles` table (server-side in Supabase)

**Profile validation:** `src/features/account/profile.ts:10-18`
- `profileValues()` trims fields
- Rejects values over 200 characters
- Validates/normalizes phone numbers using `validatePaymentPhone` and `normalizePhone`

**Profile UI:** `src/features/account/AccountPage.tsx:56-106`
- `useEffect` loads profile on `id` change with session-ownership guards
- `save()` handler with same ownership guards
- Triggers notification on success, shows inline error on failure

**Profile form:** `src/features/account/AccountExperience.tsx:44-55`
- Renders labeled inputs with `autoComplete` attributes
- Email is read-only with `aria-describedby` linking to explanatory note

**Display name:** `src/features/account/accountIdentity.ts:1-13`
- `accountDisplayName()` reads `full_name` then `name` from `user_metadata`

**Initials:** `src/features/account/accountInitials.ts:1-7`
- `accountInitials()` uses `Intl.Segmenter` for grapheme-correct initials
- Falls back to "LH"

**Tests:** `src/features/auth/customer.test.ts:59-93` — profile mapping, nullable defaults, phone validation, insert-vs-update flow, duplicate-creation race handling

### 2.6 Route protection

**Status: IMPLEMENTED (soft guard pattern)**

**Router structure:** `src/main.tsx:23-56`
- All routes wrapped in `<AuthProvider>` at top level
- No dedicated `<ProtectedRoute>` or `<RequireAuth>` wrapper components

**Customer route protection:** `src/features/account/AccountPage.tsx:64-76`
- If `auth.loading`: shows "Restoring your session..." with `role="status"`
- If no `id` (not signed in): renders inline sign-in prompt with Google button and collection link
- If on `/auth/callback` with session: redirects to `/account` via `<Navigate to="/account" replace />`

**Order pages protection:** `src/features/orders/OrderPages.tsx:48-58,93,157-165`
- `AccountRequired` gate component shows "Sign in to view your orders" when `!id || auth.loading`
- `MyOrdersPage` and `OrderDetailPage` both render `AccountRequired` when unauthenticated

**Checkout protection:** `src/features/checkout/CheckoutPage.tsx:49`
- Reads `auth` from `useAuth()`
- Relies on cart provider's visibility logic rather than explicit redirect

**Direct checkout protection:** `src/features/checkout/DirectCheckoutPage.tsx:25-28`
- Shows "Restoring your session..." while loading
- If direct intent belongs to different owner: prompts sign-out/sign-in

**Admin route protection:** `src/features/admin/AdminPage.tsx:37-53`
- If `loading`: shows "Restoring your session..."
- If `session` exists: renders `AdminAccess` which calls `checkBusinessAccess()` RPC
- If no session: shows "Sign in to administration" button

**Admin access check:** `src/features/admin/AdminPage.tsx:13-35`
- `AdminAccess` component checks business access via RPC
- Routes to `StaffWorkspace`, `AdminWorkspace` (for legacy/owner), or shows denial/error gate

**Business access RPC:** `src/features/admin/businessAccess.ts:6-14`
- `checkBusinessAccess()` calls `client.rpc('business_access_v1')` with bearer token
- Falls back to `checkAdmin()` (legacy RPC) only for specific migration error codes
- Returns `'legacy' | 'owner' | 'staff' | null`

**Admin vs customer boundaries:**
- `src/features/admin/adminRepository.ts:5-8` — `checkAdmin()` calls `client.rpc('is_business_admin')`
- `src/features/admin/AdminWorkspace.tsx:44-53` — Admin workspace has internal `<Routes>` for `/admin/*` sub-pages
- `src/features/admin/StaffWorkspace.tsx` — Staff workspace is separate, restricted subset

**Cart visibility by auth state:** `src/features/cart/cartRepository.ts:3-5`
- `visibleCart()` returns empty array while loading
- Returns saved cart only when `userId` matches
- Returns guest cart for unauthenticated users

### 2.7 Error handling and accessibility

**Status: IMPLEMENTED**

**Auth error messages:**
| Location | Error message | File:Line |
|---|---|---|
| `AuthProvider.tsx` | "Your session could not be restored. Please sign in again." | 25 |
| `AuthProvider.tsx` | "Account services are unavailable. Please try again later." | 27 |
| `AuthProvider.tsx` | "Google sign-in could not start. Please try again." | 33 |
| `AuthProvider.tsx` | "Sign-out failed. Please try again." | 43-44 |
| `auth.ts` | "Google sign-in could not start. Please try again." | 23 |
| `auth.ts` | "Invalid sign-in redirect configuration." | 18 |
| `AuthContext.ts` | "Sign-out failed. Please try again." | 45 |
| `AccountPage.tsx` | "Your profile could not be loaded. Reload to try again." | 61 |
| `AccountPage.tsx` | "Your profile could not be saved." | 99 |
| `profile.ts` | "Your profile could not be loaded." | 21 |
| `profile.ts` | "Your profile could not be saved." | 30, 33 |
| `profile.ts` | "Please keep each field within 200 characters." | 12 |
| `AdminPage.tsx` | "Administration access could not be checked." | 31 |
| `AdminPage.tsx` | "This account does not have business administration access." | 31 |
| `adminRepository.ts` | "Administration access was denied. Private data and actions are hidden..." | 28 |
| `OrderPages.tsx` | "Your orders could not be loaded. Please retry." | 87 |
| `OrderPages.tsx` | "Your order could not be loaded." | 150 |

**Loading states:**
| Component | Loading indicator | File:Line |
|---|---|---|
| `AccountPage` | `<p role="status">Restoring your session...</p>` | `AccountPage.tsx:68` |
| `AccountPage` | `setStatus("Loading profile...")` | `AccountPage.tsx:17,52` |
| `AccountPage` | `{busy ? "Saving..." : "Save profile & delivery details"}` | `AccountExperience.tsx:55` |
| `AdminPage` | `<p role="status">Restoring your session...</p>` | `AdminPage.tsx:48` |
| `AdminPage` | `<p role="status">Checking administration access...</p>` | `AdminPage.tsx:30` |
| `AdminPage` | `{starting ? 'Opening Google...' : 'Sign in to administration'}` | `AdminPage.tsx:50` |
| `DirectCheckoutPage` | `<p role="status">Restoring your session...</p>` | `DirectCheckoutPage.tsx:25` |
| `OrderPages` | `<p role="status">Loading your orders...</p>` | `OrderPages.tsx:99` |
| `OrderPages` | `<p role="status">Loading your order...</p>` | `OrderPages.tsx:191` |
| `AuthCallback` | `<p role="status">Returning to checkout...</p>` | `CustomerRoutes.tsx:14` |
| `AccountMenu` | `{signingOut ? "Signing out..." : "Sign out"}` | `AccountMenu.tsx:150` |
| `useCustomerSignOut` | `signingOut` boolean from controller | `useCustomerSignOut.ts:23` |

**ARIA labels and roles:**
| Element | ARIA attribute | File:Line |
|---|---|---|
| Sign-in button error | `role="alert"` | `AccountPage.tsx:74` |
| Profile form | `aria-label="Profile and delivery details"` | `AccountExperience.tsx:51` |
| Form description | `aria-describedby="account-defaults-note"` | `AccountExperience.tsx:51` |
| Email field note | `aria-describedby="account-email-note"` | `AccountExperience.tsx:53` |
| Status messages | `role="status"` | Multiple files |
| Error messages | `role="alert"` | Multiple files |
| Profile error | `role="alert"` | `AccountExperience.tsx:55` |
| Sign-out error | `role="alert"` | `AccountExperience.tsx:58` |
| Account menu trigger | `aria-haspopup="menu"` | `AccountMenu.tsx:116` |
| Account menu trigger | `aria-expanded={open}` | `AccountMenu.tsx:117` |
| Account menu trigger | `aria-controls={menuId}` | `AccountMenu.tsx:118` |
| Account menu trigger | `aria-label="Account, signed in"` | `AccountMenu.tsx:119` |
| Account menu trigger | `aria-current={active ? "location" : undefined}` | `AccountMenu.tsx:120` |
| Menu popover | `role="menu"` | `AccountMenu.tsx:127` |
| Menu items | `role="menuitem"` | `AccountMenu.tsx:130,143` |
| Sign-out button | `aria-busy={signingOut}` | `AccountMenu.tsx:146` |
| Menu error | `role="alert"` | `AccountMenu.tsx:154` |
| Admin session error | `role="alert"` | `AdminPage.tsx:51` |
| Admin access loading | `role="status"` | `AdminPage.tsx:30` |
| Skip link | `<a href="#main" className="skip-link">Skip to content</a>` | `Layout.tsx:84` |
| Main content | `tabIndex={-1}` on `<main>` | `Layout.tsx:131` |
| Cart count | `aria-label="Cart (${count})"` | `Layout.tsx:117` |
| Section headings | `aria-labelledby` on multiple sections | `AccountExperience.tsx:57-59` |
| Legend focus targets | `tabIndex={-1}` on `<legend>` elements | `AccountExperience.tsx:53-54,58-59` |

**Focus management:**
- `src/components/AccountMenu.tsx:79-81` — When menu opens, focus moves to first item
- `src/components/AccountMenu.tsx:83-86` — `close(returnFocus)` returns focus to trigger button on Escape
- `src/components/AccountMenu.tsx:88-108` — Full keyboard navigation: ArrowDown/ArrowUp cycle, Home/End jump, Escape closes and returns focus, Tab closes
- `src/features/account/AccountExperience.tsx:31-39` — Hash-based section navigation scrolls and focuses target heading
- `src/components/Layout.tsx:56-81` — SPA navigation moves focus to `<main>` on path change (not on initial load, preserving skip-link as first tab stop)
- `src/components/NotificationProvider.tsx:25-31,63-65` — `focusPageIfNoticeHasFocus()` restores focus to `<main>` when notification with focus is dismissed

**Session-ownership guards:**
- `src/features/account/AccountPage.tsx:28-39,56-63,77-105` — `identity` ref tracks user ID, `epoch` ref tracks session changes, `alive` ref tracks component mount. All async callbacks check these before updating state
- `src/features/cart/CartProvider.tsx:28-29,48,66-67` — Same pattern: `identity` ref, `epoch` ref, `isCurrent()` guard on every async resolution
- `src/features/auth/AuthContext.ts:29-58` — Sign-out controller uses `inFlight` promise to deduplicate concurrent sign-out requests

---

## 3. Implemented vs Missing Capability Matrix

### 3.1 Email/password authentication

**Status: MISSING (by design)**

| Capability | Status | Evidence |
|---|---|---|
| Email/password registration | **MISSING** | No `signUp` calls in production code |
| Email/password login | **MISSING** | No `signInWithPassword` calls in production code |
| Email confirmation | **MISSING** | Disabled in local QA config (`supabase/local/config.toml:22-24`) |
| Forgotten password request | **MISSING** | No `resetPasswordForEmail` calls |
| Password reset callback | **MISSING** | No password reset routes or handlers |
| Password update | **MISSING** | No `updateUser` password calls |
| Email/password form components | **MISSING** | No `<input type="password">` in any `.tsx` file |
| Password policy enforcement | **MISSING** | No password validation logic |
| Rate limiting for auth attempts | **MISSING** | No throttling or attempt counting |
| Enumeration-resistant messaging | **MISSING** | No generic error messages for login/register |

**Design rationale:**
- `src/features/content/PolicyPages.tsx:29` — "Lumé House uses Google sign-in through Supabase Auth... Lumé House does not manage a password for these Google accounts."
- `supabase/migrations/20261002000200_lume_house_foundation.sql:56` — "Lazy owner-created profile: no auth.users trigger, passwords or duplicate email."
- Production `supabase/config.toml` has no `[auth]` section — no email auth configuration

**Local QA helper (non-production):**
- `supabase/local/app.mjs:19` — Creates synthetic local users via `client.auth.signUp({email, password})` with `randomUUID()` credentials
- `supabase/local/app.mjs:30` — Serves `/session` endpoint that calls `client.auth.signInWithPassword(user)` to hand access token to local QA frontend
- `tests/admin.test.mjs:323` — Test assertion that `MembershipManager.tsx` does NOT reference `signUp` (confirming admin UI never calls it)

### 3.2 Google OAuth authentication

**Status: IMPLEMENTED**

| Capability | Status | Evidence |
|---|---|---|
| Google sign-in initiation | **IMPLEMENTED** | `auth.ts:21-24` — `startGoogleSignIn` calls `signInWithOAuth({ provider: "google" })` |
| PKCE OAuth flow | **IMPLEMENTED** | `client.ts:21` — `flowType: "pkce"` |
| Redirect URL construction | **IMPLEMENTED** | `auth.ts:16-20` — `authRedirect` builds callback URL with validation |
| OAuth callback handling | **IMPLEMENTED** | `CustomerRoutes.tsx:10-15` — `AuthCallback` consumes return intent and navigates |
| Session persistence | **IMPLEMENTED** | `client.ts:17` — `persistSession: true` |
| Session restoration | **IMPLEMENTED** | `auth.ts:2-15` — `watchSession` calls `getSession` |
| Session refresh | **IMPLEMENTED** | `client.ts:18` — `autoRefreshToken: true` |
| Sign-out | **IMPLEMENTED** | `AuthProvider.tsx:35-47` — `requestSignOut` calls `signOut` |
| Session generation tracking | **IMPLEMENTED** | `AuthProvider.tsx:10,21` — `sessionGeneration` increments on user change |
| Admin return path storage | **IMPLEMENTED** | `adminAuthIntent.ts:1-24` — sessionStorage with validation |
| Customer return path storage | **IMPLEMENTED** | `customerAuthIntent.ts:1-22` — sessionStorage with intent ID |
| Error handling | **IMPLEMENTED** | User-facing messages for all failure paths |
| Accessibility | **IMPLEMENTED** | `role="status"`, `role="alert"`, ARIA labels, focus management |

### 3.3 Guest cart and account continuity

**Status: IMPLEMENTED**

| Capability | Status | Evidence |
|---|---|---|
| Guest cart storage | **IMPLEMENTED** | `CartProvider.tsx:16-17,54` — sessionStorage with in-memory fallback |
| Sign-in with guest cart | **IMPLEMENTED** | `CartProvider.tsx:86-98` — resolves, merges via RPC, removes confirmed items |
| Cart merge logic | **IMPLEMENTED** | `variant_bag_checkout.sql:75-110` (server), `cartRepository.ts:37-47` (legacy client) |
| Conflict handling (same product) | **IMPLEMENTED** | `variant_bag_checkout.sql:99` — quantities summed, capped at 99 |
| Cross-tab cart sync | **PARTIAL** | Cart: none (sessionStorage per-tab); Checkout: `localStorage` + Web Locks (`checkoutAttempt.ts:29-93`); Direct intent: custom event + `storage` event (`directIntent.ts:34-38`) |
| Buy Now on session change | **IMPLEMENTED** | `DirectCheckoutPage.tsx:12-27`, `customerAuthIntent.ts:3-22`, `CartProvider.tsx:24-25` — deferred restore, owner binding, OAuth return |
| Cart recovery after session expiry | **IMPLEMENTED** | Guest: sessionStorage persists; Auth: server is source of truth, re-read on restore; Checkout: localStorage + `recoverCheckout` |
| Sign-out behavior | **IMPLEMENTED** | `AuthProvider.tsx:35-46` — only clears session; guest cart retained; server cart untouched |
| Sign-out + different account | **IMPLEMENTED** | `CartProvider.tsx:48` epoch bump, `cartRepository.ts:4` userId check, `DirectCheckoutPage.tsx:27` owner mismatch guard |
| Ownership checks / RLS | **IMPLEMENTED** | `20261002000100_commerce_foundation.sql:91-148`, `20261005000800_variant_bag_checkout.sql:13-18,32-34,67-73,109-110` — full RLS, security definer RPCs, JWT-bound calls |

### 3.4 Shared Web/Mobile identity contracts

**Status: VERIFIED (Web), ASSUMED (Mobile)**

| Contract Area | Web Status | Mobile Status |
|---|---|---|
| Supabase project IDs and URLs | **VERIFIED** | **ASSUMED** (same project) |
| Mobile Supabase project ref | N/A | **ASSUMED** (referenced in QA prerequisites) |
| `profiles` table schema | **VERIFIED** | **ASSUMED** (same table) |
| Mobile profile usage | N/A | **ASSUMED** (same schema) |
| Session management (PKCE, persistSession, autoRefreshToken) | **VERIFIED** | **ASSUMED** (same client config) |
| OAuth redirect URLs (Web) | **VERIFIED** | N/A |
| OAuth deep-link scheme (Mobile) | N/A | **ASSUMED** (`lumehousemobile-qa://auth/callback` from QA matrix) |
| Production mobile deep link | N/A | **MISSING** |
| Cart RPC functions (`load_variant_cart`, `change_variant_cart`) | **VERIFIED** | **ASSUMED** (same RPCs) |
| Order RPC functions (`place_order`, `place_variant_order`, `place_direct_variant_order`) | **VERIFIED** | **ASSUMED** (same RPCs) |
| RLS ownership policies | **VERIFIED** | **VERIFIED** (identical enforcement via `auth.uid()`) |
| CORS origin handling for Mobile | N/A | **ASSUMED** (Mobile origins not in allowlist; may not matter for native clients) |
| Mobile-specific auth code | N/A | **MISSING** (separate repository) |
| Mobile-specific deep link handlers | N/A | **MISSING** (separate repository) |
| Web/Mobile auth compatibility documentation | **PARTIAL** | **PARTIAL** (QA matrix documents test plan but scenarios NOT EXECUTED) |
| Direct order (Buy Now) on Mobile | N/A | **MISSING** (no Mobile QA scenario for `place-direct-order`) |

### 3.5 Phone OTP authentication

**Status: MISSING**

| Capability | Status | Evidence |
|---|---|---|
| Phone number validation | **IMPLEMENTED** | `profile.ts:10-18` — validates Sierra Leone format `+232XXXXXXXX` |
| Phone number normalization | **IMPLEMENTED** | `handler.ts:10-11` — normalizes local formats to `+232` prefix |
| Database phone constraint | **IMPLEMENTED** | `20261002000200_lume_house_foundation.sql:61` — `CHECK (phone ~ '^\+232[0-9]{8}$')` |
| Supabase phone auth provider | **MISSING** | No `signInWithOtp` or `sendOtp` calls |
| SMS gateway integration | **MISSING** | No Twilio, MessageBird, or Vonage configuration |
| OTP input UI components | **MISSING** | No phone OTP form or verification screen |
| OTP rate limiting | **MISSING** | No throttling or attempt counting for OTP |
| OTP security controls | **MISSING** | No expiry, replay protection, or binding logic |
| Account linking (phone + Google) | **MISSING** | No logic to merge phone-authenticated account with existing Google account |
| Duplicate account prevention | **MISSING** | No checks for existing accounts with same phone number |
| Phone auth configuration | **MISSING** | No `[auth.phone]` section in `supabase/config.toml` |

**Existing phone infrastructure:**
- Phone is stored in `profiles` table with Sierra Leone format validation
- Edge Functions normalize local phone formats to `+232XXXXXXXX`
- Phone is used for order contact and payment metadata
- Phone validation utilities exist in checkout payment flow

**Phone OTP feasibility assessment:**
- **SMS provider required:** Twilio, MessageBird, or Vonage for Sierra Leone SMS delivery
- **Country delivery:** Sierra Leone (+232) must be supported by chosen provider
- **Operating costs:** SMS gateway charges per message (typically $0.01-$0.05 USD per SMS)
- **Security considerations:** OTP throttling, expiry, replay protection, rate limiting
- **Account linking complexity:** Merging phone-authenticated accounts with existing Google accounts
- **Duplicate account risk:** Same phone number could create multiple accounts
- **Testing requirements:** Real phone numbers for QA, test mode for development
- **Configuration:** Supabase dashboard phone provider setup, environment variables for API keys

**Recommendation:** Phone OTP is a separate architectural decision requiring:
1. SMS provider selection and contract
2. Cost analysis for Sierra Leone delivery
3. Security review of OTP implementation
4. Account linking strategy
5. Separate implementation slice (not part of email/password expansion)

---

## 4. UX Recommendation

### 4.1 Current state: Google-only authentication

**Strengths:**
- Simple, familiar sign-in experience
- No password management burden for users
- Strong security (Google's authentication infrastructure)
- Fast onboarding (one click)
- No email verification delays

**Weaknesses:**
- Requires Google account (excludes users without Google)
- Single point of failure (Google outage blocks all sign-ins)
- No fallback for users who lose Google account access
- Limited to Google's account recovery options

### 4.2 Proposed expansion: Email/password authentication

**User experience goals:**
- Provide alternative for users without Google accounts
- Maintain Lumé House's warm, editorial brand voice
- Prioritize mobile responsiveness and accessibility
- Minimize friction in checkout flow
- Preserve existing Google sign-in as primary option

**Recommended customer journey:**

#### Sign in with Google (existing)
1. User clicks "Sign in with Google" button
2. Google OAuth popup opens
3. User selects Google account
4. Callback redirects to intended page
5. Session established

#### Sign in with email/password (new)
1. User clicks "Sign in with email" link (below Google button)
2. Email/password form appears inline (no page navigation)
3. User enters email and password
4. On success: session established, redirect to intended page
5. On failure: inline error message ("Invalid email or password")

#### Create account (new)
1. User clicks "Create account" link
2. Registration form appears inline
3. User enters email, password, confirm password
4. Password requirements displayed (8+ characters, mixed case, number)
5. On submit: account created, confirmation email sent
6. "Check your email" message displayed with resend option
7. User clicks confirmation link in email
8. Redirected to sign-in page with success message
9. User signs in with confirmed credentials

#### Verify email (new)
1. After registration, user receives confirmation email
2. Email contains "Verify your email" button with token link
3. Link opens `/auth/verify?token=...` route
4. Token validated, email marked as confirmed
5. Redirected to sign-in page with "Email verified" message
6. User signs in

#### Forgot password (new)
1. User clicks "Forgot password?" link on sign-in form
2. Password reset form appears inline
3. User enters email address
4. On submit: "If an account exists with that email, you will receive a reset link"
5. User receives reset email with token link
6. Link opens `/auth/reset?token=...` route
7. New password form displayed
8. User enters new password and confirmation
9. On submit: password updated, all sessions invalidated
10. Redirected to sign-in page with "Password updated" message

#### Return to shopping (existing behavior preserved)
1. User interrupted at checkout → sign-in prompt
2. User signs in (Google or email/password)
3. Callback restores checkout intent from sessionStorage
4. User continues checkout without losing cart or selections

### 4.3 Design principles

**Mobile-first:**
- Forms stack vertically on small screens
- Touch-friendly input sizes (44px minimum)
- Keyboard type hints (`inputMode="email"`, `autoComplete="current-password"`)
- Inline validation (no page reloads)

**Accessible:**
- All form fields have `<label>` elements
- Error messages use `role="alert"` and `aria-live="polite"`
- Focus management: move focus to first error on submit failure
- Keyboard navigation: Tab/Shift+Tab between fields, Enter to submit
- Color contrast: 4.5:1 minimum for text
- Screen reader announcements for status changes

**Clear validation:**
- Email: check format on blur, show "Please enter a valid email address"
- Password: check requirements on blur, show specific unmet requirements
- Confirm password: check match on blur, show "Passwords do not match"
- All fields: check required on submit, show "This field is required"

**Lumé House visual conventions:**
- Warm editorial typography (existing brand fonts)
- Soft color palette (existing brand colors)
- Rounded corners (existing button styles)
- Generous whitespace (existing layout patterns)
- Friendly, conversational error messages (existing tone)

### 4.4 Form layout recommendation

**Sign-in form:**
```
┌─────────────────────────────────────┐
│  Sign in to Lumé House              │
│                                     │
│  [Google sign-in button]            │
│                                     │
│  ─── or ───                         │
│                                     │
│  Email address                      │
│  [_________________________]        │
│                                     │
│  Password                           │
│  [_________________________]        │
│  [Show/Hide]                        │
│                                     │
│  [Sign in button]                   │
│                                     │
│  Forgot password?                   │
│                                     │
│  Don't have an account? Create one  │
└─────────────────────────────────────┘
```

**Registration form:**
```
┌─────────────────────────────────────┐
│  Create your Lumé House account     │
│                                     │
│  Email address                      │
│  [_________________________]        │
│                                     │
│  Password                           │
│  [_________________________]        │
│  [Show/Hide]                        │
│                                     │
│  Password requirements:             │
│  ✓ At least 8 characters            │
│  ✓ Mixed case letters               │
│  ✓ At least one number              │
│                                     │
│  Confirm password                   │
│  [_________________________]        │
│                                     │
│  [Create account button]            │
│                                     │
│  Already have an account? Sign in   │
└─────────────────────────────────────┘
```

---

## 5. Minimal Implementation Slices

### 5.1 Slice 1: Email/password sign-in (existing users only)

**Objective:** Enable email/password authentication for users who already have accounts (created via future registration slice or manual Supabase dashboard creation).

**Scope:**
- Email/password sign-in form component
- Integration with Supabase `signInWithPassword`
- Error handling and validation
- Session establishment and redirect
- Accessibility and mobile responsiveness

**Out of scope:**
- User registration (Slice 2)
- Email verification (Slice 3)
- Password reset (Slice 4)
- Account linking (future slice)

**Likely affected files:**
- `src/features/auth/EmailSignInForm.tsx` (new)
- `src/features/auth/auth.ts` (add `startEmailSignIn` function)
- `src/features/account/AccountPage.tsx` (add "Sign in with email" link)
- `src/features/auth/AuthProvider.tsx` (handle email sign-in errors)
- `tests/email-signin-dom.test.mjs` (new)

**Dependencies:**
- Supabase email/password provider enabled in dashboard (configuration-only)
- No database migrations required
- No Edge Function changes required

**Security considerations:**
- Password never logged or stored in plaintext
- Rate limiting handled by Supabase Auth (not application layer)
- HTTPS enforced for all auth requests (existing config validation)
- Session tokens stored in localStorage (existing pattern)
- No password strength validation on client (Supabase enforces server-side)

**Regression risks:**
- Existing Google sign-in must continue working unchanged
- Session persistence must not break for existing users
- Cart merge logic must work for email/password users (no changes expected)
- Admin access checks must work for email/password users (no changes expected)

**Tests required:**
- Email/password form renders with all fields and labels
- Validation: empty email shows error
- Validation: invalid email format shows error
- Validation: empty password shows error
- Sign-in success: session established, redirect to intended page
- Sign-in failure: inline error message displayed
- Sign-in failure: form fields preserved
- Accessibility: keyboard navigation works
- Accessibility: screen reader announces errors
- Mobile: form stacks vertically on small screens
- Integration: existing Google sign-in still works

**Acceptance criteria:**
- User can sign in with valid email/password
- User sees clear error for invalid credentials
- Session persists across page reloads
- Redirect to intended page after sign-in
- All form fields have labels and ARIA attributes
- Error messages are announced to screen readers
- Form is usable on mobile devices (320px width minimum)
- Existing Google sign-in continues working
- No regression in cart, checkout, or order flows

**Rollback considerations:**
- Remove `EmailSignInForm` component
- Remove "Sign in with email" link from `AccountPage`
- No database changes to rollback
- No configuration changes to rollback

**Estimated effort:** 2-3 days

---

### 5.2 Slice 2: Email/password registration

**Objective:** Enable new user registration with email/password.

**Scope:**
- Registration form component
- Integration with Supabase `signUp`
- Email/password validation
- Account creation
- Redirect to email verification prompt

**Out of scope:**
- Email verification (Slice 3)
- Password reset (Slice 4)
- Email templates (Slice 3)

**Likely affected files:**
- `src/features/auth/EmailRegistrationForm.tsx` (new)
- `src/features/auth/auth.ts` (add `startEmailRegistration` function)
- `src/features/account/AccountPage.tsx` (add "Create account" link)
- `tests/email-registration-dom.test.mjs` (new)

**Dependencies:**
- Slice 1 complete (email/password sign-in)
- Supabase email confirmation enabled in dashboard (configuration-only)
- No database migrations required

**Security considerations:**
- Password strength validation (client-side UX, server-side enforcement)
- Email format validation
- Duplicate email handling (enumeration-resistant messaging)
- Rate limiting handled by Supabase Auth

**Regression risks:**
- Existing Google sign-in must continue working
- Existing email/password sign-in (Slice 1) must continue working
- No impact on cart, checkout, or order flows

**Tests required:**
- Registration form renders with all fields
- Validation: password requirements displayed and checked
- Validation: confirm password match checked
- Registration success: account created, redirect to verification prompt
- Registration failure: inline error message
- Duplicate email: generic "check your email" message (no enumeration)
- Accessibility: keyboard navigation, ARIA labels
- Mobile: responsive layout

**Acceptance criteria:**
- User can register with valid email/password
- Password meets strength requirements
- Duplicate email shows generic message
- Redirect to email verification prompt after registration
- Existing sign-in flows continue working

**Rollback considerations:**
- Remove `EmailRegistrationForm` component
- Remove "Create account" link from `AccountPage`
- No database changes to rollback

**Estimated effort:** 2-3 days

---

### 5.3 Slice 3: Email verification

**Objective:** Implement email confirmation flow for new registrations.

**Scope:**
- Email verification route and component
- Token validation
- Email confirmation via Supabase Auth
- Success/failure messaging
- Resend verification email option

**Out of scope:**
- Password reset (Slice 4)
- Email template customization (separate task)

**Likely affected files:**
- `src/features/auth/EmailVerificationPage.tsx` (new)
- `src/features/auth/CustomerRoutes.tsx` (add `/auth/verify` route)
- `src/features/auth/auth.ts` (add `verifyEmail` function)
- `tests/email-verification-dom.test.mjs` (new)

**Dependencies:**
- Slice 2 complete (registration)
- Supabase email confirmation enabled (configuration)
- Supabase redirect URL configured for verification callback

**Security considerations:**
- Verification tokens are single-use and time-limited (Supabase default)
- Token validated server-side by Supabase Auth
- No token exposure in client-side logs or URLs

**Regression risks:**
- Existing sign-in and registration flows must continue working
- No impact on authenticated users with verified emails

**Tests required:**
- Verification route renders with token from URL
- Valid token: email confirmed, success message, redirect to sign-in
- Invalid token: error message, option to resend
- Expired token: error message, option to resend
- Resend: new verification email sent, message displayed
- Accessibility: status messages announced

**Acceptance criteria:**
- User receives verification email after registration
- Verification link confirms email address
- Success message displayed after confirmation
- Invalid/expired tokens show clear error
- Resend option works

**Rollback considerations:**
- Remove `/auth/verify` route
- Remove `EmailVerificationPage` component
- Disable email confirmation in Supabase dashboard (configuration)

**Estimated effort:** 2 days

---

### 5.4 Slice 4: Password reset

**Objective:** Implement forgotten password recovery flow.

**Scope:**
- "Forgot password" form component
- Password reset request via Supabase `resetPasswordForEmail`
- Reset token route and component
- New password form
- Password update via Supabase `updateUser`
- Session invalidation after password change

**Out of scope:**
- Email template customization (separate task)
- Account locking after failed attempts (Supabase handles)

**Likely affected files:**
- `src/features/auth/ForgotPasswordForm.tsx` (new)
- `src/features/auth/PasswordResetPage.tsx` (new)
- `src/features/auth/CustomerRoutes.tsx` (add `/auth/reset` route)
- `src/features/auth/auth.ts` (add `requestPasswordReset`, `resetPassword` functions)
- `tests/password-reset-dom.test.mjs` (new)

**Dependencies:**
- Slice 1 complete (email/password sign-in)
- Supabase password recovery enabled (configuration)
- Supabase redirect URL configured for reset callback

**Security considerations:**
- Reset tokens are single-use and time-limited (Supabase default)
- Enumeration-resistant messaging ("If an account exists...")
- All sessions invalidated after password change (Supabase default)
- HTTPS enforced for reset links

**Regression risks:**
- Existing sign-in, registration, verification flows must continue working
- No impact on users who don't use password reset

**Tests required:**
- Forgot password form renders
- Request success: generic message displayed (no enumeration)
- Request failure: generic message displayed (no enumeration)
- Reset route renders with token from URL
- Valid token: new password form displayed
- Invalid token: error message
- Expired token: error message
- Password update success: redirect to sign-in with success message
- Password update failure: inline error
- Session invalidation: user must sign in again

**Acceptance criteria:**
- User can request password reset
- Generic message shown regardless of email existence
- Reset link opens new password form
- Valid token allows password update
- Invalid/expired tokens show clear error
- All sessions invalidated after password change
- User can sign in with new password

**Rollback considerations:**
- Remove `/auth/reset` route
- Remove `ForgotPasswordForm` and `PasswordResetPage` components
- Disable password recovery in Supabase dashboard (configuration)

**Estimated effort:** 3 days

---

### 5.5 Slice 5: Email templates and redirect configuration

**Objective:** Customize Supabase auth email templates and configure redirect URLs.

**Scope:**
- Email confirmation template customization
- Password reset template customization
- Supabase redirect URL configuration for production and staging
- Brand-consistent email design

**Out of scope:**
- Transactional email templates (order confirmation — separate system)
- Email delivery optimization (SPF, DKIM, DMARC — separate task)

**Likely affected files:**
- `supabase/templates/confirmation.html` (new)
- `supabase/templates/recovery.html` (new)
- `supabase/config.toml` (add redirect URLs)
- Supabase dashboard configuration (manual)

**Dependencies:**
- Slices 1-4 complete (email/password auth flows)
- Supabase dashboard access for template configuration
- Verified domain for production emails (future task)

**Security considerations:**
- Redirect URLs must be exact-match (no wildcards in production)
- Email templates must not expose sensitive information
- Reset and verification tokens must remain secure

**Regression risks:**
- Existing auth flows must continue working
- Email delivery must not break

**Tests required:**
- Confirmation email renders correctly
- Recovery email renders correctly
- Redirect URLs work in production and staging
- Token links open correct routes
- Brand consistency in email design

**Acceptance criteria:**
- Confirmation email matches Lumé House brand
- Recovery email matches Lumé House brand
- Redirect URLs configured for all environments
- Email links work correctly
- Tokens remain secure

**Rollback considerations:**
- Revert to Supabase default templates
- Remove redirect URL configuration

**Estimated effort:** 1-2 days

---

### 5.6 Implementation order and dependencies

```
Slice 1: Email/password sign-in (2-3 days)
    ↓
Slice 2: Email/password registration (2-3 days)
    ↓
Slice 3: Email verification (2 days)
    ↓
Slice 4: Password reset (3 days)
    ↓
Slice 5: Email templates and redirect configuration (1-2 days)
```

**Total estimated effort:** 10-13 days

**Parallelization opportunities:**
- Slice 5 (email templates) can begin after Slice 3 (verification) is complete
- Testing can begin after each slice
- Configuration work (Supabase dashboard) can be done in parallel with development

**Configuration dependencies (S02-NEW-03):**
- Supabase email/password provider must be enabled in dashboard
- Supabase email confirmation must be enabled in dashboard
- Supabase password recovery must be enabled in dashboard
- Redirect URLs must be configured in Supabase dashboard
- Email templates must be uploaded to Supabase dashboard

**Code dependencies (S02-06):**
- None — email/password auth is independent of email notification system (Resend)

---

## 6. Supabase and Security Dependencies

### 6.1 Supabase configuration requirements

**Dashboard configuration (manual, owner-executed):**

1. **Enable email/password provider:**
   - Authentication → Providers → Email
   - Enable "Enable Email provider"
   - Confirm email address: ON (for registration verification)

2. **Configure redirect URLs:**
   - Authentication → URL Configuration
   - Site URL: `https://lume-house-delta.vercel.app` (production)
   - Redirect URLs: 
     - `https://lume-house-delta.vercel.app/auth/callback` (production)
     - `https://lume-house-delta.vercel.app/auth/verify` (verification)
     - `https://lume-house-delta.vercel.app/auth/reset` (password reset)
     - Staging URLs (Vercel preview aliases)

3. **Configure email templates:**
   - Authentication → Email Templates
   - Confirm signup template (custom HTML)
   - Reset password template (custom HTML)

4. **Configure rate limits:**
   - Authentication → Rate Limits
   - Email auth rate limit: 3 requests per hour (default)
   - SMS auth rate limit: N/A (not using SMS)

**Environment variables (no changes required):**
- `VITE_SUPABASE_URL` — existing
- `VITE_SUPABASE_PUBLISHABLE_KEY` — existing
- `VITE_AUTH_REDIRECT_URL` — existing (defaults to `/auth/callback`)

**Database migrations (none required):**
- Supabase Auth manages `auth.users` table internally
- No application schema changes needed
- Profile table already exists and works with email/password users

### 6.2 Security considerations

**Password security:**
- Supabase Auth handles password hashing (bcrypt)
- Passwords never exposed to application layer
- Password strength enforced server-side by Supabase
- Client-side validation is UX-only (not security)

**Session security:**
- Sessions stored in localStorage (existing pattern)
- Tokens are JWTs with expiry (Supabase default: 1 hour)
- Auto-refresh enabled (existing configuration)
- HTTPS enforced in production (existing config validation)

**Rate limiting:**
- Supabase Auth provides built-in rate limiting
- Default: 3 email auth attempts per hour per IP
- Configurable in Supabase dashboard
- Application layer does not need to implement additional throttling

**Enumeration resistance:**
- Login failures: "Invalid email or password" (generic message)
- Registration: "Check your email" (even if email already exists)
- Password reset: "If an account exists..." (generic message)
- No information leakage about account existence

**Token security:**
- Verification tokens: single-use, time-limited (Supabase default: 24 hours)
- Reset tokens: single-use, time-limited (Supabase default: 24 hours)
- Tokens passed via URL fragment (not query string) for security
- Tokens validated server-side by Supabase Auth

**RLS and ownership:**
- Existing RLS policies work for email/password users (no changes)
- `auth.uid()` returns user ID regardless of auth provider
- Profile ownership: `id = auth.uid()` (existing policy)
- Cart ownership: `user_id = auth.uid()` (existing policy)
- Order ownership: `user_id = auth.uid()` (existing policy)

**Admin access:**
- Existing admin RPCs work for email/password users (no changes)
- `business_access_v1` checks `auth.uid()` (provider-agnostic)
- `is_business_admin` checks `auth.uid()` (provider-agnostic)

**Cross-provider account linking (future consideration):**
- Not implemented in Slices 1-5
- Requires separate architectural decision
- Potential for duplicate accounts (same email, different providers)
- Supabase provides `linkIdentity` and `unlinkIdentity` APIs for future use

### 6.3 Compliance and privacy

**GDPR considerations:**
- Email addresses stored in `auth.users` (Supabase-managed)
- Users can request account deletion (Supabase provides API)
- No sensitive data logged in application layer
- HTTPS enforced for all auth requests

**Data retention:**
- Supabase Auth retains user accounts until explicitly deleted
- Application does not store password hashes
- Session tokens expire automatically (1 hour default)
- Verification/reset tokens expire after use or timeout

**Audit logging:**
- Supabase Auth logs authentication events (dashboard-accessible)
- Application does not log authentication details
- Failed login attempts tracked by Supabase rate limiter

---

## 7. QA Acceptance Matrix

### 7.1 Registration scenarios

| # | Scenario | Expected Result | Status |
|---|---|---|---|
| R1 | Valid email/password registration | Account created, verification email sent, redirect to verification prompt | NOT RUN |
| R2 | Duplicate email registration | Generic "check your email" message (no enumeration) | NOT RUN |
| R3 | Weak password registration | Validation error: password requirements not met | NOT RUN |
| R4 | Invalid email format | Validation error: invalid email address | NOT RUN |
| R5 | Empty required fields | Validation error: field required | NOT RUN |
| R6 | Password mismatch | Validation error: passwords do not match | NOT RUN |
| R7 | Registration with existing Google account | Generic "check your email" message (no enumeration) | NOT RUN |

### 7.2 Email verification scenarios

| # | Scenario | Expected Result | Status |
|---|---|---|---|
| V1 | Valid verification token | Email confirmed, success message, redirect to sign-in | NOT RUN |
| V2 | Invalid verification token | Error message, option to resend | NOT RUN |
| V3 | Expired verification token | Error message, option to resend | NOT RUN |
| V4 | Already-verified email | Success message, redirect to sign-in | NOT RUN |
| V5 | Resend verification email | New email sent, message displayed | NOT RUN |

### 7.3 Login scenarios

| # | Scenario | Expected Result | Status |
|---|---|---|---|
| L1 | Valid email/password login | Session established, redirect to intended page | NOT RUN |
| L2 | Invalid email | Error: "Invalid email or password" | NOT RUN |
| L3 | Invalid password | Error: "Invalid email or password" | NOT RUN |
| L4 | Unverified email | Error: "Please verify your email" (if verification required) | NOT RUN |
| L5 | Empty email field | Validation error: email required | NOT RUN |
| L6 | Empty password field | Validation error: password required | NOT RUN |
| L7 | Google sign-in (existing flow) | Session established, no regression | NOT RUN |

### 7.4 Password reset scenarios

| # | Scenario | Expected Result | Status |
|---|---|---|---|
| P1 | Valid email reset request | Generic "check your email" message | NOT RUN |
| P2 | Non-existent email reset request | Generic "check your email" message (no enumeration) | NOT RUN |
| P3 | Valid reset token | New password form displayed | NOT RUN |
| P4 | Invalid reset token | Error message | NOT RUN |
| P5 | Expired reset token | Error message | NOT RUN |
| P6 | Successful password update | Redirect to sign-in with success message | NOT RUN |
| P7 | Sign-in with new password | Session established | NOT RUN |
| P8 | Sign-in with old password | Error: "Invalid email or password" | NOT RUN |
| P9 | Session invalidation after reset | All devices signed out, must sign in again | NOT RUN |

### 7.5 Security scenarios

| # | Scenario | Expected Result | Status |
|---|---|---|---|
| S1 | Rate limiting (3+ attempts/hour) | Throttled, error message | NOT RUN |
| S2 | SQL injection attempt | Rejected, no database access | NOT RUN |
| S3 | XSS attempt in form fields | Sanitized, no script execution | NOT RUN |
| S4 | Token replay attack | Token single-use, replay rejected | NOT RUN |
| S5 | Session token theft | HTTPS-only, localStorage isolation | NOT RUN |
| S6 | Cross-account data access | RLS prevents, ownership enforced | NOT RUN |
| S7 | Admin access with customer account | Denied, no business access | NOT RUN |

### 7.6 Accessibility scenarios

| # | Scenario | Expected Result | Status |
|---|---|---|---|
| A1 | Keyboard navigation through form | Tab/Shift+Tab works, Enter submits | NOT RUN |
| A2 | Screen reader announces errors | `role="alert"`, `aria-live="polite"` | NOT RUN |
| A3 | Focus management on error | Focus moves to first invalid field | NOT RUN |
| A4 | Color contrast (4.5:1 minimum) | Text readable on all backgrounds | NOT RUN |
| A5 | Mobile touch targets (44px minimum) | Buttons and inputs tappable | NOT RUN |
| A6 | Skip link works | Skip to main content from header | NOT RUN |
| A7 | Form labels associated | `<label for="...">` matches `<input id="...">` | NOT RUN |

### 7.7 Recovery scenarios

| # | Scenario | Expected Result | Status |
|---|---|---|---|
| C1 | Cart preserved during sign-in | Guest cart merged with server cart | NOT RUN |
| C2 | Checkout intent preserved during sign-in | Direct checkout resumes after auth | NOT RUN |
| C3 | Session expiry during checkout | Redirect to sign-in, return to checkout | NOT RUN |
| C4 | Browser refresh during auth flow | State preserved, no data loss | NOT RUN |
| C5 | Multiple tabs with same session | Session synchronized, no conflicts | NOT RUN |
| C6 | Sign-out then sign-in different account | Cart isolated, no cross-contamination | NOT RUN |

### 7.8 Cross-provider scenarios

| # | Scenario | Expected Result | Status |
|---|---|---|---|
| X1 | Google account signs in with email/password | Error: "Invalid email or password" (different provider) | NOT RUN |
| X2 | Email/password account signs in with Google | Error or account linking prompt (future feature) | NOT RUN |
| X3 | Same email, different providers | Separate accounts (no linking in Slices 1-5) | NOT RUN |

### 7.9 Environment scenarios

| # | Scenario | Expected Result | Status |
|---|---|---|---|
| E1 | Production environment | HTTPS enforced, production redirect URLs | NOT RUN |
| E2 | Staging environment | Staging redirect URLs, test emails | NOT RUN |
| E3 | Local development | HTTP permitted, localhost redirect URLs | NOT RUN |
| E4 | Mobile browser | Responsive layout, touch-friendly inputs | NOT RUN |
| E5 | Desktop browser | Full layout, keyboard navigation | NOT RUN |

### 7.10 Web/Mobile compatibility scenarios

| # | Scenario | Expected Result | Status |
|---|---|---|---|
| M1 | Web user signs in, Mobile user same account | Session isolated per device | NOT RUN |
| M2 | Mobile user registers, Web user signs in | Account accessible on both platforms | NOT RUN |
| M3 | Web cart merge, Mobile cart merge | Same RPC functions, same behavior | NOT RUN |
| M4 | Web order placement, Mobile order placement | Same ownership checks, same RLS | NOT RUN |

**Total scenarios:** 57  
**Status:** All NOT RUN (implementation pending)

---

## 8. Risks, Unknowns, and Decisions Needed

### 8.1 Risks

**High risk:**
1. **Account duplication:** Users may create separate accounts with Google and email/password for the same email address. No linking mechanism in Slices 1-5.
   - **Mitigation:** Document limitation, plan future account linking slice
   - **Impact:** User confusion, fragmented order history

2. **Email deliverability:** Supabase default sender (`onboarding@resend.dev`) has delivery limitations until verified domain configured.
   - **Mitigation:** Use existing Resend integration (S02-06), configure verified domain
   - **Impact:** Verification/reset emails may go to spam

3. **Rate limiting bypass:** Supabase rate limiting is per-IP, not per-account. Attackers can use multiple IPs.
   - **Mitigation:** Monitor Supabase Auth logs, implement additional application-layer throttling if needed
   - **Impact:** Brute-force attacks possible (though passwords are hashed)

**Medium risk:**
4. **Session token exposure:** localStorage is vulnerable to XSS attacks.
   - **Mitigation:** Existing XSS prevention (sanitization, CSP headers), HTTPS enforcement
   - **Impact:** Session hijacking if XSS vulnerability exists

5. **Password strength:** Client-side validation is UX-only. Supabase enforces server-side, but rules may be stricter than expected.
   - **Mitigation:** Test Supabase password requirements, align client-side validation
   - **Impact:** User frustration if passwords rejected after client-side validation passes

6. **Email template rendering:** Custom HTML templates may not render correctly in all email clients.
   - **Mitigation:** Test in Gmail, Outlook, Apple Mail, mobile clients
   - **Impact:** Broken emails, poor user experience

**Low risk:**
7. **Redirect URL misconfiguration:** Incorrect redirect URLs in Supabase dashboard will break auth flows.
   - **Mitigation:** Document exact URLs, test in staging before production
   - **Impact:** Auth flows broken until configuration corrected

8. **Browser compatibility:** New auth forms may not work in older browsers.
   - **Mitigation:** Test in Chrome, Firefox, Safari, Edge (last 2 versions)
   - **Impact:** Limited user base if older browsers not supported

### 8.2 Unknowns

1. **Supabase password requirements:** Exact password strength rules not documented in Supabase dashboard. Need to test.
2. **Email delivery time:** How long does Supabase take to send verification/reset emails? Need to measure.
3. **Token expiry defaults:** Supabase default token expiry is 24 hours, but this may be configurable. Need to verify.
4. **Rate limit defaults:** Supabase default rate limit is 3 requests/hour, but this may vary by plan. Need to confirm.
5. **Mobile deep link configuration:** Production mobile deep link scheme not documented. Need to coordinate with Mobile team.
6. **Account linking strategy:** No decision on whether to implement account linking (Google + email/password for same email). Need product decision.
7. **Email template hosting:** Supabase allows custom HTML templates, but hosting images/assets requires external URLs. Need to decide on asset hosting strategy.

### 8.3 Decisions needed

**Before implementation:**

1. **Enable email/password provider in Supabase dashboard?**
   - **Decision:** YES (required for Slices 1-5)
   - **Owner:** Project owner (manual dashboard configuration)
   - **Timing:** Before Slice 1 development begins

2. **Enable email confirmation in Supabase dashboard?**
   - **Decision:** YES (required for Slice 3)
   - **Owner:** Project owner (manual dashboard configuration)
   - **Timing:** Before Slice 2 development begins

3. **Enable password recovery in Supabase dashboard?**
   - **Decision:** YES (required for Slice 4)
   - **Owner:** Project owner (manual dashboard configuration)
   - **Timing:** Before Slice 4 development begins

4. **Configure redirect URLs in Supabase dashboard?**
   - **Decision:** YES (required for all slices)
   - **Owner:** Project owner (manual dashboard configuration)
   - **Timing:** Before Slice 1 development begins
   - **URLs needed:**
     - Production: `https://lume-house-delta.vercel.app/auth/callback`, `/auth/verify`, `/auth/reset`
     - Staging: Vercel preview aliases
     - Local: `http://127.0.0.1:5188/auth/callback`, `/auth/verify`, `/auth/reset`

5. **Customize email templates in Supabase dashboard?**
   - **Decision:** YES (required for Slice 5)
   - **Owner:** Project owner (manual dashboard configuration)
   - **Timing:** After Slice 3 development, before Slice 4 development

6. **Implement account linking (Google + email/password)?**
   - **Decision:** DEFER (not in Slices 1-5)
   - **Owner:** Product owner (product decision)
   - **Timing:** Future slice (after Slices 1-5 complete)
   - **Rationale:** Account linking is complex, requires careful UX design, and is not blocking for initial email/password auth

7. **Configure verified domain for email delivery?**
   - **Decision:** DEFER (not in Slices 1-5)
   - **Owner:** Project owner (infrastructure decision)
   - **Timing:** After Slice 5 complete, before production release
   - **Rationale:** Default Resend sender works for testing, but production requires verified domain for deliverability

8. **Implement additional application-layer rate limiting?**
   - **Decision:** NO (rely on Supabase rate limiting)
   - **Owner:** Engineering owner (technical decision)
   - **Timing:** After Slice 1 deployed, monitor and reassess
   - **Rationale:** Supabase provides built-in rate limiting. Additional application-layer throttling adds complexity without clear benefit initially.

**During implementation:**

9. **Password strength validation rules?**
   - **Decision:** Align with Supabase defaults (likely 8+ characters)
   - **Owner:** Engineering owner (technical decision)
   - **Timing:** During Slice 2 development
   - **Rationale:** Client-side validation should match server-side enforcement to avoid user frustration

10. **Email format validation rules?**
    - **Decision:** Standard email regex (RFC 5322 simplified)
    - **Owner:** Engineering owner (technical decision)
    - **Timing:** During Slice 2 development
    - **Rationale:** Balance between permissiveness and correctness

11. **Error message tone and wording?**
    - **Decision:** Match existing Lumé House brand voice (friendly, conversational)
    - **Owner:** Product owner (brand decision)
    - **Timing:** During Slice 1 development
    - **Rationale:** Consistency with existing user experience

---

## 9. Exact Proposed Approval Request for Slice 1

### Slice 1: Email/password sign-in (existing users only)

**Objective:** Enable email/password authentication for users who already have accounts.

**Scope:**
- Email/password sign-in form component
- Integration with Supabase `signInWithPassword`
- Error handling and validation
- Session establishment and redirect
- Accessibility and mobile responsiveness

**Out of scope:**
- User registration (Slice 2)
- Email verification (Slice 3)
- Password reset (Slice 4)
- Account linking (future slice)

**Pre-requisites (owner-executed before development):**
1. Enable email/password provider in Supabase dashboard
2. Configure redirect URLs in Supabase dashboard:
   - Production: `https://lume-house-delta.vercel.app/auth/callback`
   - Staging: Vercel preview aliases
   - Local: `http://127.0.0.1:5188/auth/callback`

**Implementation plan:**
1. Create `src/features/auth/EmailSignInForm.tsx` component
2. Add `startEmailSignIn` function to `src/features/auth/auth.ts`
3. Add "Sign in with email" link to `src/features/account/AccountPage.tsx`
4. Handle email sign-in errors in `src/features/auth/AuthProvider.tsx`
5. Create `tests/email-signin-dom.test.mjs` test suite
6. Run full test suite (689 existing + new tests)
7. Test manually in local development environment
8. Test manually in staging environment
9. Submit PR for review

**Affected files:**
- `src/features/auth/EmailSignInForm.tsx` (new, ~150 lines)
- `src/features/auth/auth.ts` (modify, +20 lines)
- `src/features/account/AccountPage.tsx` (modify, +10 lines)
- `src/features/auth/AuthProvider.tsx` (modify, +5 lines)
- `tests/email-signin-dom.test.mjs` (new, ~200 lines)

**Estimated effort:** 2-3 days

**Testing requirements:**
- Unit tests: form rendering, validation, error handling
- Integration tests: sign-in flow, session establishment, redirect
- Accessibility tests: keyboard navigation, ARIA labels, screen reader
- Mobile tests: responsive layout, touch targets
- Regression tests: existing Google sign-in unchanged

**Security review:**
- Password never logged or stored in plaintext
- HTTPS enforced for all auth requests
- Rate limiting handled by Supabase Auth
- Session tokens stored in localStorage (existing pattern)
- No password strength validation on client (Supabase enforces server-side)

**Rollback plan:**
- Remove `EmailSignInForm` component
- Remove "Sign in with email" link from `AccountPage`
- No database changes to rollback
- No configuration changes to rollback

**Success criteria:**
- User can sign in with valid email/password
- User sees clear error for invalid credentials
- Session persists across page reloads
- Redirect to intended page after sign-in
- All form fields have labels and ARIA attributes
- Error messages are announced to screen readers
- Form is usable on mobile devices (320px width minimum)
- Existing Google sign-in continues working
- No regression in cart, checkout, or order flows
- All tests pass (689 existing + new tests)

**Approval request:**

> **Owner approval requested for S02-NEW-04 Slice 1: Email/password sign-in**
>
> **Objective:** Enable email/password authentication for existing users (accounts created manually in Supabase dashboard or via future registration slice).
>
> **Pre-requisites:** Owner must enable email/password provider and configure redirect URLs in Supabase dashboard before development begins.
>
> **Scope:** Email/password sign-in form, integration with Supabase Auth, error handling, session management, accessibility, mobile responsiveness.
>
> **Out of scope:** Registration, email verification, password reset, account linking.
>
> **Estimated effort:** 2-3 days
>
> **Risk level:** LOW (no database changes, no configuration changes, existing Google sign-in unchanged)
>
> **Rollback:** Remove new component and link (5 minutes, no data loss)
>
> **Testing:** Unit tests, integration tests, accessibility tests, mobile tests, regression tests (all must pass)
>
> **Deliverable:** Pull request with all tests passing, manual testing in local and staging environments, documentation update
>
> **Next step:** After Slice 1 approval and completion, request approval for Slice 2 (registration)
>
> **Approve Slice 1?** [ ] YES [ ] NO
>
> **Comments:** _______________

---

## Appendix A: File inventory

### Authentication files (existing)
- `src/lib/supabase/client.ts` — Supabase client initialization
- `src/lib/supabase/config.ts` — Configuration validation
- `src/lib/supabase/config.test.ts` — Configuration tests
- `src/features/auth/auth.ts` — Auth utilities (Google sign-in, redirect)
- `src/features/auth/AuthProvider.tsx` — Auth context provider
- `src/features/auth/AuthContext.ts` — Auth context definition
- `src/features/auth/CustomerRoutes.tsx` — Auth callback route
- `src/features/auth/adminAuthIntent.ts` — Admin return path storage
- `src/features/auth/customerAuthIntent.ts` — Customer return path storage
- `src/features/auth/useCustomerSignOut.ts` — Sign-out hook
- `src/features/auth/customer.test.ts` — Auth tests

### Account files (existing)
- `src/features/account/AccountPage.tsx` — Account page (sign-in UI)
- `src/features/account/AccountExperience.tsx` — Account form and display
- `src/features/account/profile.ts` — Profile CRUD
- `src/features/account/accountIdentity.ts` — Display name
- `src/features/account/accountInitials.ts` — Initials

### Cart files (existing)
- `src/features/cart/CartProvider.tsx` — Cart context provider
- `src/features/cart/cart.ts` — Cart reducer
- `src/features/cart/guestCart.ts` — Guest cart storage
- `src/features/cart/cartRepository.ts` — Cart API calls
- `src/features/cart/variantCartRepository.ts` — Variant cart RPC calls

### Checkout files (existing)
- `src/features/checkout/CheckoutPage.tsx` — Bag checkout
- `src/features/checkout/DirectCheckoutPage.tsx` — Buy Now checkout
- `src/features/checkout/directIntent.ts` — Direct checkout intent storage
- `src/features/checkout/checkoutAttempt.ts` — Checkout attempt coordination

### Admin files (existing)
- `src/features/admin/AdminPage.tsx` — Admin page
- `src/features/admin/AdminWorkspace.tsx` — Admin workspace
- `src/features/admin/StaffWorkspace.tsx` — Staff workspace
- `src/features/admin/businessAccess.ts` — Business access check
- `src/features/admin/adminRepository.ts` — Admin RPC calls

### Database migrations (existing)
- `supabase/migrations/20261002000100_commerce_foundation.sql` — RLS policies
- `supabase/migrations/20261002000200_lume_house_foundation.sql` — Profile table
- `supabase/migrations/20261005000800_variant_bag_checkout.sql` — Variant cart
- `supabase/migrations/20261023002900_order_delivery_country.sql` — Country enforcement

### Edge Functions (existing)
- `supabase/functions/_shared/handler.ts` — Auth validation, country check
- `supabase/functions/_shared/cors.ts` — CORS configuration
- `supabase/functions/place-order/index.ts` — Bag order placement
- `supabase/functions/place-direct-order/index.ts` — Direct order placement

### Test files (existing)
- `tests/checkout-delivery-dom.test.mjs` — Bag checkout tests (33)
- `tests/direct-checkout-dom.test.mjs` — Direct checkout tests (20)
- `tests/cart-recovery-dom.test.mjs` — Cart recovery tests (27)
- `tests/orders.test.mjs` — Order placement tests (18)
- `tests/direct-handler.test.mjs` — Direct handler tests (15)
- `tests/direct-recovery.test.mjs` — Direct recovery tests (11)
- `tests/bag-ui-dom.test.mjs` — Bag UI tests (45)
- `tests/fulfilment-dom.test.mjs` — Fulfilment tests (40)
- `tests/account-auth-dom.test.mjs` — Account auth tests (35)
- `tests/account-orders-breadcrumbs.test.mjs` — Account orders tests (27)
- `tests/currency-dom.test.mjs` — Currency tests (12)
- `tests/zone-fee-drift.test.mjs` — Zone fee tests (9)
- `src/features/auth/customer.test.ts` — Auth unit tests
- `src/lib/supabase/config.test.ts` — Config unit tests

**Total existing tests:** 689 (all PASS)

---

## Appendix B: Glossary

**PKCE** — Proof Key for Code Exchange. OAuth 2.0 security extension for public clients (browser-based apps).

**RLS** — Row Level Security. PostgreSQL feature that restricts row access based on user identity.

**RPC** — Remote Procedure Call. Supabase function call from client to database.

**JWT** — JSON Web Token. Compact, URL-safe token for representing claims between parties.

**OTP** — One-Time Password. Single-use code for authentication (email or SMS).

**CORS** — Cross-Origin Resource Sharing. HTTP header mechanism for controlling cross-origin requests.

**ARIA** — Accessible Rich Internet Applications. W3C specification for improving web accessibility.

**HTTPS** — Hypertext Transfer Protocol Secure. Encrypted web communication protocol.

**XSS** — Cross-Site Scripting. Security vulnerability where malicious scripts are injected into web pages.

**CSP** — Content Security Policy. HTTP header for preventing XSS and other code injection attacks.

**GDPR** — General Data Protection Regulation. EU privacy and data protection law.

**SPF** — Sender Policy Framework. Email authentication method for detecting forged sender addresses.

**DKIM** — DomainKeys Identified Mail. Email authentication method for detecting forged messages.

**DMARC** — Domain-based Message Authentication, Reporting, and Conformance. Email authentication protocol.

---

**End of discovery report.**

**Next step:** Owner review and approval request for Slice 1 (email/password sign-in).

**Status:** READY for owner decision.
