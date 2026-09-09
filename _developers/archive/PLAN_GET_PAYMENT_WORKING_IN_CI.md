<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Get the Payment Stuff Working in This Branch and Deployed to CI

## Non-Negotiable Assertions (from the user, Feb 14 2026)

> "We have just deployed the current branch to ci, this should be obvious."

The active branch is `claude/ux-fixes-jane-feedback`. It deploys to `https://ci-submit.diyaccounting.co.uk/`. Do not ask which URL. Do not talk about merging to main. Fix it here.

> "I just redeemed a resident-pro-test-pass and was, as expected, shown the request bundle button, prompted to authenticate, then able to see the price on the button and click it. I wasn't challenged to subscribe and I don't see any sort of billing admin page in the bundles page or the usage page."

The Subscribe flow is broken. The user sees a Request button instead of Subscribe. Clicking it does not trigger Stripe Checkout. There is no billing admin / subscription management visible.

> "The payment behaviour test is failing and I need to know why you keep fucking up and deploying a site without the payment feature we are working on."

The `paymentBehaviour-ci` test fails at STEP 6: Stripe Checkout loads, card is filled, payment submitted, but the redirect back to `bundles.html` times out after 120 seconds. This has failed on EVERY deploy from this branch.

> "I dont know why claude is circling around this issue we must get this working in ci."

Three days of compactions have caused the payment feature to be forgotten repeatedly. Stop fixing side issues. The ONLY priority is: payment works in CI.

---

## The Human Test Journey

This is the target experience — a human tester in either CI or prod:

1. **Login** via Cognito (native in CI, Google in prod)
2. **Redeem a test pass for day-guest** — gets 3 tokens despite `cap = 0` (pass bypasses cap)
3. **Use all 3 tokens** — submit VAT to sandbox HMRC (not live)
4. **See activities disabled** — "Insufficient tokens", upsell link to bundles page
5. **Redeem a test pass for resident-pro** — gets 100 tokens
6. **Pay via test Stripe** — checkout session uses test price ID, no real charges
7. **Submit VAT return** — goes to sandbox HMRC, consumes 1 resident-pro token
8. **Check token usage page** — `/usage.html` shows correct sources and consumption
9. **Verify Telegram alerts** — each step above generates a message in the correct channel

Throughout this journey:
- **HMRC** always uses sandbox credentials (because the pass is a test pass)
- **Stripe** always uses test mode (because the pass is a test pass)
- **Telegram** routes to the **test** channel (because the user is classified as `test-user`)
- The **same catalogue, activities, and bundles** as production — no separate sandbox activities

---

## Current State (Feb 14 2026)

**Branch**: `claude/ux-fixes-jane-feedback`
**CI URL**: `https://ci-submit.diyaccounting.co.uk/bundles.html`
**Deployment name**: `ci-claudeuxf`

### What the user sees manually in CI

1. Redeem `resident-pro-test-pass` on bundles page
2. See a button with price but labelled as "Request", not "Subscribe"
3. Click it — no Stripe Checkout redirect happens
4. No subscription management or billing admin anywhere

### What the CI test (`paymentBehaviour-ci`) shows

1. Steps 1-5 pass (login, day-guest pass, drain tokens, verify disabled, upsell)
2. Step 6 fails: checkout session created successfully (real `cs_test_*` Stripe URL returned), Stripe page loads, card filled, payment submitted — **timeout waiting for redirect to `bundles.html`**

---

## Problems to Fix

### Problem 1: Subscribe button not rendering

`bundles.html` line 364 checks `allocation === "on-pass-on-subscription" && passCode`. If the user sees "Request" instead of "Subscribe", either:
- The `passValidation` sessionStorage is not being set with the correct `bundleId` matching `resident-pro`
- The catalogue `allocation` field is not reaching the browser
- The check at line 355 (`enable === "on-pass" && !passCode`) is consuming the render before line 364 runs

**Action**: Trace the exact flow in the deployed CI site. Check what `sessionStorage.getItem("passValidation")` contains after entering a resident-pro pass. Check what `allocation` value the catalogue TOML returns for resident-pro.

### Problem 2: Stripe card filling fails — form not rendered when selectors fire

**ROOT CAUSE FOUND (Feb 14 16:00)**: The Stripe Checkout hosted page is a JS SPA. `waitForLoadState("load")` fires on the skeleton before the form renders. All card input selectors fail silently. The test then "submits" an empty form and times out waiting for a redirect that never happens.

**FIX APPLIED**: Replaced the Stripe card filling code in `behaviour-bundle-steps.js`:
- Wait for submit button to be visible (proves form has rendered) instead of `waitForLoadState("load")`
- Use placeholder-based selectors (`input[placeholder*="1234"]`, `input[placeholder*="MM"]`, `input[placeholder="CVC" i]`) which match the Stripe Checkout hosted page
- Fall back to name/id selectors and iframe selectors for broader compatibility
- Throw a fatal error (not silent failure) if card can't be filled
- Dump page structure (all inputs and iframes) for diagnostics

**STATUS**: Fix written, needs Docker running to test with proxy environment.

### Problem 2b: Stripe success_url after payment

The `success_url` in `billingCheckoutPost.js` line 107 uses `process.env.DIY_SUBMIT_BASE_URL`. For proxy this is the ngrok URL. For CI this is the CI deployment URL. This should be correct IF `DIY_SUBMIT_BASE_URL` is set correctly in the deployed environment.

**Action**: Verify after card filling works. The redirect timeout may have been entirely caused by the card not being filled (no payment = no redirect).

### Problem 3: No billing admin / subscription management page

The user expects to see subscription management somewhere in the UI (bundles page or usage page).

**Action**: Check if `billingPortalGet.js` is deployed and accessible. Check if the "Manage Subscription" button appears for users with active subscriptions. Check if usage.html has any billing section.

---

## Fix Order

1. **Fix the Subscribe button rendering** — this is what the user sees first
2. **Fix the Stripe success_url** — so checkout actually redirects back
3. **Verify billing admin / management is accessible** — so users can manage subscriptions
4. **Get paymentBehaviour-ci test passing** — proves the full flow works end-to-end
5. **Deploy and verify manually at CI URL**

---

## Verification Criteria

- [x] User redeems `resident-pro-test-pass` at `https://ci-submit.diyaccounting.co.uk/bundles.html` and sees "Subscribe £9.99/mo" button (not "Request")
- [x] Clicking Subscribe redirects to Stripe Checkout
- [x] Completing Stripe test payment redirects back to bundles page
- [x] Bundle is granted with 100 tokens
- [x] Subscription management / billing admin is visible
- [x] `paymentBehaviour-ci` test passes in GitHub Actions — https://github.com/antonycc/submit.diyaccounting.co.uk/actions/runs/22020533533

## Fixes Applied (Feb 14 2026)

1. **Stripe card filling**: Stripe Checkout uses accordion UI — click Card radio first (`#payment-method-accordion-item-title-card`), then fill direct `#cardNumber`/`#cardExpiry`/`#cardCvc`/`#billingName` inputs with `force: true`. Skip email (Stripe Link intercepts it).
2. **Stripe webhook for proxy**: Added ngrok webhook endpoint to `scripts/stripe-setup.js` and created it in Stripe test mode (`we_1T0l81FdFHdRoTOj5kIK00IC`).
3. **Raw body for webhook signature**: Added `verify` callback to `express.json()` in `server.js` to preserve raw body for `/api/v1/billing/webhook`. Updated `httpServerToLambdaAdaptor.js` to prefer `req.rawBody` over `JSON.stringify(req.body)`.
4. **Stripe test/live mode for portal and webhooks**: `billingPortalGet.js` now uses `qualifiers.sandbox` to select test vs live Stripe client. `billingWebhookPost.js` uses `stripeEvent.livemode` to select the correct client and stores `qualifiers.sandbox` in the bundle record. Added Step 6b test in `payment.behaviour.test.js` that verifies "Manage Subscription" button visibility and billing portal API.
