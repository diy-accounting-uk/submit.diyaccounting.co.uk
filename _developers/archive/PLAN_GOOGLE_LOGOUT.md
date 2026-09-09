<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Auth Fixes and Simulator Subscription Emulation

## Non-Negotiable Assertions

> "YOU MUST direct out to Google's logout. We need to logout to Google's own endpoint to address Google's own session. This local session clearance bullshit has not worked several times."

When a user clicks "Sign Out", they MUST end up at `https://accounts.google.com/Logout` so that their Google session is terminated. The next time they click "Login using your Google account", they MUST see Google's credential prompt. No silent re-authentication.

> The local simulator environment when run from `npm start` must accurately emulate the Stripe webhook when a subscription-based bundle is purchased.

When a user completes a mock Stripe checkout in the simulator, the resulting bundle record MUST have `stripeSubscriptionId`, `stripeCustomerId`, and `subscriptionStatus` set — just like a real Stripe webhook would produce. The "Manage Subscription" button must appear. This reduces test-fix-test time by removing the deployment loop.

---

## Three Fixes

### Fix 1: `auth-status.js` must reach Cognito `/logout` from every page

#### Problem — proven by Playwright exploration of CI site (Feb 14 2026)

The `logout()` function in `auth-status.js:218-233` checks `window.__env.COGNITO_BASE_URI` and `window.__env.COGNITO_CLIENT_ID`. If either is undefined, it falls through to `window.location.reload()` — which clears the page but **does NOT contact Cognito's `/logout` endpoint**. The Cognito session cookie persists.

`env-loader.js` is only included on **4 pages**: `login.html`, `submitVat.html`, `viewVatReturn.html`, `vatObligations.html`.

Pages with a "Logout" button that do **NOT** load the env: `index.html`, `bundles.html`, `usage.html`, `about.html`, `guide.html`, `help.html`, `privacy.html`, `terms.html`, `accessibility.html`, `spreadsheets.html`, etc.

**Observed redirect chain when clicking Logout on `index.html` in CI:**
```
1. index.html → auth-status.js clears localStorage, window.__env is undefined
2. Falls through to window.location.reload()
3. Page reloads, no tokens → shows "Login" link
4. Cognito session cookie STILL ALIVE
```

**Observed re-login after this "logout":**
```
1. Click "Login using your Google account"
2. Cognito authorize URL hit → Cognito has active session → auto-issues code
3. Callback page processes code → user authenticated without ANY prompt
```

The Cognito Hosted UI was never shown. The Cognito session cookie was never cleared.

#### Fix

Have `auth-status.js` load the env itself before attempting the Cognito redirect. The `logout()` function must ensure `window.__env` is populated before using it.

**Option A (preferred):** Add `env-loader.js` as a script tag to every HTML page that includes `auth-status.js`. This is the simplest, most visible fix. Every page that shows a Logout button needs the env loaded.

**Option B:** Make `auth-status.js` async-load the env inside `logout()` if `window.__env` is not set. This is self-contained but makes logout async.

#### Files to change (Option A)

Every HTML page that includes `<script src="...auth-status.js">` but not `<script src="...env-loader.js">` needs the env-loader added before auth-status.

---

### Fix 2: `signed-out.html` must unconditionally redirect to Google's logout

#### Problem

`signed-out.html:28` checks `if (loginProvider === "Google")`. For native auth users, `loginProvider` is `"cognito"`, so the Google redirect never fires. But Google's session persists independently of how the user last logged into our app.

#### Fix

Remove the `loginProvider` conditional. Always redirect to `accounts.google.com/Logout`. Remove the `loginProvider` localStorage read since it's no longer needed for the redirect decision.

**Current code (broken):**
```javascript
var loginProvider = localStorage.getItem("loginProvider");
localStorage.removeItem("loginProvider");
// ...clear other localStorage...
if (loginProvider === "Google") {
  window.location.href = "https://accounts.google.com/Logout";
} else {
  window.location.href = "/";
}
```

**New code:**
```javascript
// Clear all auth-related localStorage
localStorage.removeItem("loginProvider");
localStorage.removeItem("cognitoAccessToken");
localStorage.removeItem("cognitoIdToken");
localStorage.removeItem("cognitoRefreshToken");
localStorage.removeItem("userInfo");
localStorage.removeItem("authState");

// ALWAYS redirect to Google logout to terminate any active Google session.
// This prevents silent re-authentication when clicking "Login using your Google account".
// For users without a Google session, Google just shows its signed-out page.
document.getElementById("status-message").textContent =
  "Redirecting to Google to complete sign-out...";
window.location.href = "https://accounts.google.com/Logout";
```

#### Files to change

| File | Change |
|------|--------|
| `web/public/auth/signed-out.html` | Remove `loginProvider` conditional. Always redirect to `accounts.google.com/Logout`. |

---

### Fix 3: Simulator subscription flow must work end-to-end from the UI

> WHEN I RUN `npm start`, GENERATE A PASS VIA THE ADMIN API, OPEN `bundles.html?pass=CODE`, CLICK TO GET THE PRO BUNDLE, THE PRO BUNDLE IS ADDED, AND I CAN SEE THE MANAGE SUBSCRIPTION BUTTON.

#### Verification command
```bash
npm start
# then in another terminal:
PASS_CODE=$(curl -s -X POST http://localhost:3000/api/v1/pass/admin \
  -H "Content-Type: application/json" \
  -d '{
    "passTypeId": "resident-pro-test-pass",
    "bundleId": "resident-pro",
    "validityPeriod": "P1D",
    "maxUses": 1,
    "createdBy": "manual"
  }' | jq '.code' --raw-output) \
&& echo "Generated pass code: $PASS_CODE" \
&& open "http://localhost:3000/bundles.html?pass=$PASS_CODE"
```
Then click Subscribe, bundle is added, "Manage Subscription" button is visible.

#### Problem 3a: Subscribe button triggers the wrong click handler

`bundles.html` has two click handlers:
1. **General handler (line 431):** matches `button[data-bundle-id]` → calls `requestBundle()` directly
2. **Subscribe handler (line 480):** matches `button[data-subscribe]` → calls checkout API

The "Subscribe £9.99/mo" button has BOTH `data-bundle-id` AND `data-subscribe`. The general handler fires first, calls `requestBundle()` which grants the bundle directly without subscription fields and disables the button. The subscribe handler never runs.

**Fix 3a:** In the general click handler (line 431-477), add an early return for buttons that have `data-subscribe` or `data-manage-subscription` attributes. This lets the dedicated subscribe handler route through the mock checkout flow.

#### Problem 3b: mockBilling.js didn't store subscription fields

**Status: DONE.** `mockBilling.js` now uses `putBundle()` with all subscription fields (`stripeSubscriptionId`, `stripeCustomerId`, `subscriptionStatus`, `currentPeriodEnd`, `cancelAtPeriodEnd`).

#### Problem 3c: bundleCache short-circuits __fullBundleData

**Status: DONE.** `fetchUserBundles()` no longer returns early when cache is warm — it falls through to the API fetch so `__fullBundleData` is always populated.

#### Files to change

| File | Change | Status |
|------|--------|--------|
| `web/public/bundles.html` (line 431) | General click handler must skip `data-subscribe` and `data-manage-subscription` buttons | TODO |
| `app/functions/non-lambda-mocks/mockBilling.js` | Store subscription fields on bundle record | DONE |
| `web/public/bundles.html` (line 204-210) | Don't return early from cache path — always populate `__fullBundleData` | DONE |

---

## Correct Redirect Chain (after all 3 fixes)

```
1. User clicks "Logout" on ANY page
2. auth-status.js clears localStorage/sessionStorage
3. auth-status.js reads window.__env (NOW ALWAYS LOADED)
4. Browser → {COGNITO_BASE_URI}/logout?client_id=...&logout_uri=.../signed-out.html
5. Cognito clears session cookie → redirects to signed-out.html
6. signed-out.html clears remaining localStorage
7. signed-out.html → accounts.google.com/Logout (UNCONDITIONAL)
8. Google clears session → shows signed-out page
```

---

## Verification

### Fix 1 + Fix 2 — Logout actually works:

**Playwright exploration against CI (after deploy):**
1. Login with Cognito native auth → click Logout on index.html
2. Redirect chain MUST include `{env}-auth.diyaccounting.co.uk/logout` (proves Cognito contacted)
3. Redirect chain MUST include `/auth/signed-out.html` (proves intermediate page reached)
4. Redirect chain MUST include `accounts.google.com/Logout` (proves Google contacted)
5. Click "Login using your Google account" → MUST see Cognito Hosted UI (proves Cognito session cleared)

### Fix 3 — Simulator subscription emulation:

**Manual test from `npm start`:**
1. Login → go to bundles page → complete mock Stripe checkout for a subscription bundle
2. "Manage Subscription" button MUST be visible next to the bundle
3. Clicking "Manage Subscription" MUST return a portal URL (mock)
4. Usage page MUST show the Subscription management section

---

## Anti-Pattern Registry

1. **Do NOT use `loginProvider` to conditionally decide whether to contact Google** — Google's session exists independently of how the user last logged into our app
2. **Do NOT replace Google logout with local session/cookie clearing** — clearing local state does not clear Google's session at `accounts.google.com`
3. **Do NOT remove the `signed-out.html` intermediate page** — it's the bridge between Cognito's redirect and Google's logout
4. **Do NOT add "smart" re-authentication after logout** — if the user logged out, they logged out
5. **Do NOT skip the Google redirect for non-Google logins** — a user who logged in with native auth may still have a Google session that will auto-authenticate them
6. **Do NOT assume `window.__env` is loaded** — always verify or ensure the env-loader script is included on any page that needs Cognito/HMRC configuration
7. **Do NOT bypass webhook simulation in the mock** — the mock must produce bundle records identical in shape to what real webhooks produce, including subscription fields
