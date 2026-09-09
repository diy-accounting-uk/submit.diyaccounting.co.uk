<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Resident Pro Test Pass Must Enter Test Mode

**Created**: 15 February 2026
**Status**: Implemented, all tests passing (unit + tokenEnforcement behaviour)
**Branch**: `qaprep` (current)

---

## User Assertion (verbatim)

> Make the resident-pro-test-pass trigger the same test mode as day-guest-test-pass when resident-pro-test-pass is redeemed to obtain resident-pro (which currently does not enter test mode and I do not see the wrench icon and payments do go to the live stripe, but I want it to go into test mode and payments do go to the sandbox stripe) but day-guest-test-pass redeemed by request the day-guest bundle do display the wrench icon (although they don't have payments so I can't see that part).

---

## Root Cause Analysis

The `testPass` flag is **lost** during the `on-pass-on-subscription` flow because the pass is validated but the bundle is NOT granted until the Stripe webhook fires.

### day-guest-test-pass flow (works correctly):
1. Pass redeemed → `allocation = "on-request"` → bundle granted immediately with `qualifiers.sandbox = true`
2. `developer-mode.js` checks bundles → finds sandbox bundle → shows wrench icon
3. `sessionStorage.hmrcAccount = "sandbox"` is set
4. All downstream uses sandbox/test mode

### resident-pro-test-pass flow (broken):
1. Pass redeemed → `allocation = "on-pass-on-subscription"` → returns `requiresSubscription: true`, **no bundle granted**
2. Response at `passPost.js:90-95` does NOT include the `testPass` flag
3. Frontend stores `passValidation` in sessionStorage but without `testPass` info
4. No sandbox bundle exists → wrench icon does NOT show → `sessionStorage.hmrcAccount` NOT set
5. User clicks "Subscribe" → checkout POST sends `sandbox: false` (or omits it)
6. `billingCheckoutPost.js` sees no sandbox signals → uses **live Stripe key**
7. Live Stripe checkout → webhook with `livemode: true` → `test = false`
8. Bundle granted with `qualifiers.sandbox = false` → stays in production mode

---

## Fix

Two code changes, both small:

### 1. Backend: `passPost.js` — return `testPass` in the `requiresSubscription` response

**File**: `app/functions/account/passPost.js` line 90-95

**Current**:
```javascript
if (catBundle?.allocation === "on-pass-on-subscription") {
  return http200OkResponse({
    request,
    headers: responseHeaders,
    data: { redeemed: false, valid: true, bundleId: result.bundleId, requiresSubscription: true },
  });
}
```

**Fixed**:
```javascript
if (catBundle?.allocation === "on-pass-on-subscription") {
  const testPass = result.pass?.testPass || false;
  return http200OkResponse({
    request,
    headers: responseHeaders,
    data: { redeemed: false, valid: true, bundleId: result.bundleId, requiresSubscription: true, testPass },
  });
}
```

### 2. Frontend: `bundles.html` — store `testPass` and set sandbox mode

**File**: `web/public/bundles.html` line 852-859

**Current**:
```javascript
if (body.requiresSubscription) {
  try {
    sessionStorage.setItem("passValidation", JSON.stringify({ code, bundleId: body.bundleId, valid: true }));
  } catch {}
  showPassStatus(`Pass valid! Click "Subscribe" to start your subscription.`, "success");
  renderCatalogueBundles();
  return true;
}
```

**Fixed**:
```javascript
if (body.requiresSubscription) {
  try {
    sessionStorage.setItem("passValidation", JSON.stringify({ code, bundleId: body.bundleId, valid: true, testPass: body.testPass || false }));
  } catch {}
  // If test pass, activate sandbox mode so checkout uses test Stripe
  if (body.testPass) {
    sessionStorage.setItem("hmrcAccount", "sandbox");
    window.dispatchEvent(new CustomEvent("bundle-changed"));
  }
  showPassStatus(`Pass valid! Click "Subscribe" to start your subscription.`, "success");
  renderCatalogueBundles();
  return true;
}
```

### Why this works (end-to-end):

1. `passPost.js` now returns `testPass: true` in the response
2. Frontend sets `sessionStorage.hmrcAccount = "sandbox"`
3. `bundle-changed` event fires → `developer-mode.js` re-checks → wrench icon appears (once sandbox bundle exists after checkout, for now it triggers a re-check)
4. User clicks "Subscribe" → checkout reads `sessionStorage.hmrcAccount === "sandbox"` → sends `sandbox: true` in body
5. `billingCheckoutPost.js` sees `body.sandbox === true` → uses test Stripe key and test price ID
6. Stripe checkout is in test mode → webhook receives `livemode: false` → `test = true`
7. Bundle granted with `qualifiers.sandbox = true` → wrench icon appears after refresh

### Wrench icon before bundle is granted

The wrench icon currently only appears if the user has a sandbox bundle (`developer-mode.js:32`). After step 2 above, `sessionStorage.hmrcAccount` is set to `"sandbox"`, but `developer-mode.js` checks bundles via API, not sessionStorage. The wrench icon will appear after the subscription is complete and the sandbox bundle is granted via webhook. This is acceptable — the critical fix is ensuring Stripe uses test mode.

---

## Verification

1. Run `npm test` — existing unit tests pass
2. Run `npm run test:paymentBehaviour-simulator` — payment behaviour test passes (uses test passes for resident-pro)
3. Manual verification: Create a `resident-pro-test-pass`, redeem it, confirm checkout uses test Stripe

---

## Files Changed

| File | Change |
|------|--------|
| `app/functions/account/passPost.js` | Add `testPass` to both `requiresSubscription` and `redeemed` response paths |
| `web/public/bundles.html` | Store `testPass`, set sandbox mode on redemption, retry bundle refresh after checkout return |
| `app/functions/account/bundlePost.js` | Recognize `sandbox` as system qualifier; apply request body qualifiers when `grantQualifiers` not provided |
| `behaviour-tests/steps/behaviour-bundle-steps.js` | Pass `sandbox: true` in qualifiers when granting directly for test passes |
| `app/unit-tests/functions/passPost.test.js` | 2 new tests for `testPass` in responses |

## Tests Verified

- `npm test` — 913 passed, 2 skipped
- `npm run test:paymentBehaviour-simulator` — passed
- `npm run test:paymentBehaviour-proxy` — passed (real Stripe test APIs)
- `npm run test:tokenEnforcementBehaviour-simulator` — 2 passed (day-guest + resident-pro)
