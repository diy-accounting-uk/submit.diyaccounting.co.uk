<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Payment Go-Live Plan

**Created**: 14 February 2026
**Updated**: 15 February 2026
**Status**: Phase 1 complete. Phases 2-3 partially done. See gap analysis below.
**Branch**: `activate` (merged via PR #705/#706), `nvsubhash` (merged via PR #710), `stability-fixes` (salt cache TTL fix)

**Consolidates remaining work from**:
- `PLAN_PAYMENT_INTEGRATION.md` (Phases 5, 7, 8, 9, 10)
- `_developers/PLAN_HUMAN_TEST_OF_PAYMENT_INTEGRATION_WITH_ALERTING.md` (Phase F + Human Test Journey)

**Prerequisite work already complete**:
- Phases 1-4 + 11 of `PLAN_PAYMENT_INTEGRATION.md` (token usage, Stripe SDK, checkout session, webhook handler, payment funnel behaviour test)
- Phases A-E of `PLAN_HUMAN_TEST_OF_PAYMENT_INTEGRATION_WITH_ALERTING.md` (Telegram config, testPass field, catalogue simplification, sandbox routing via bundle qualifiers, all behaviour tests updated)
- Architecture: credential routing (HMRC + Stripe) decoupled from activities, driven by bundle qualifier (`sandbox: true/false`) set by test vs non-test passes

---

## The Human Test Journey

```
Please suggest a test plan for my nephew who is going to doing some manual qa. I want him to ease into this with iterative journeys of complexity with some endorphen
   feedback. This would start by trying to find some information on the site 'how will existing customers be able to submit vat', then there is trying to access and
  joining the early access list, and comming in via a guest pass and querying obligations, and submitting vat and viewing their return, and running out of tokens, and
  upgrading to pro and issuing a pass and trying the qr code for themselves, plus for all this it should be for both mobile and desktop, and it should match the
  telegram feed, and any incidents on the ops channel should be noted. Perhaps each one, is just a section to go through building on top of the other.

```

This is the target experience for a human tester — the same journey that synthetic tests will automate. It works in both CI and prod because credential routing is driven by the pass type, not the environment.

**Full human test plan**: See `PLAN_HUMAN_TEST.md` for the 8-section iterative QA plan with checklists, mobile/desktop coverage, and Telegram monitoring.

**Synthetic test coverage**: The `paymentBehaviour` test covers steps 1-9 below plus Stripe portal navigation and subscription cancellation. Steps marked with * have additional coverage needed for the full human test (see Gap Analysis below).

1. **Login** via Cognito (native in CI, Google in prod)
2. **Redeem a test pass for day-guest** — gets 3 tokens despite `cap = 0` (pass bypasses cap)
3. **Use all 3 tokens** — submit VAT to sandbox HMRC (not live)
4. **See activities disabled** — "Insufficient tokens", upsell link to bundles page
5. **Redeem a test pass for resident-pro** — gets 100 tokens
6. **Pay via test Stripe** — checkout session uses test price ID, no real charges
7. **Submit VAT return** — goes to sandbox HMRC, consumes 1 resident-pro token
8. **Check token usage page** — `/usage.html` shows correct sources and consumption
9. **Verify Telegram alerts** — each step generates a message in the correct channel
10. * **Generate a digital pass** — Pro subscriber creates a shareable pass with QR code (10 tokens)
11. * **Manage subscription** — Navigate to Stripe billing portal, view subscription details

**Routing rules** (same code path, different credentials):

| Concern | Test pass (`testPass: true`) | Live pass (`testPass: false`) |
|---------|------------------------------|-------------------------------|
| HMRC credentials | Sandbox | Production |
| Stripe key + price ID | Test | Live |
| Telegram channel | Test channel | Live channel |
| Bundle + activity | Same real bundles and activities | Same real bundles and activities |

**Test pass issuance**:

```bash
# Synthetic tests — automatic via admin API
const pass = await createTestPass({ bundleId: "day-guest" });
# pass.testPass = true automatically

# Human testers — admin creates via API
curl -X POST /api/v1/admin/pass \
  -d '{"bundleId":"day-guest","testPass":true,"maxUses":5,"notes":"Manual tester"}'

# Real customers — non-test pass (live HMRC + live Stripe)
curl -X POST /api/v1/admin/pass \
  -d '{"bundleId":"day-guest","testPass":false,"maxUses":1,"notes":"Beta customer"}'
```

---

## Phase 1: CI Validation Before Merge

**Goal**: Verify the current deployment (Phases A-E architectural rework) works on CI. Gate for merging `eventandpayment` branch to `main`.

| Step | Description | Status |
|------|-------------|--------|
| 1.1 | `npm test` — all unit + system tests pass | Done |
| 1.2 | `./mvnw clean verify` — CDK builds | Done |
| 1.3 | `npm run test:paymentBehaviour-simulator` — simulator passes | Done |
| 1.4 | Commit, push to feature branch | Done |
| 1.5 | Monitor CI deployment | Done |
| 1.6 | Run `paymentBehaviour-ci` — verify full conversion funnel | Done (4m36s, run #22043787833) |
| 1.7 | Run `submitVatBehaviour-ci` — verify VAT submission still works | Done (confirmed locally) |
| 1.8 | Verify Telegram messages arrive in correct channels (test channel for synthetic user) | Done — manually verified 17 Feb 2026 |
| 1.9 | Merge to `main` | PR #705 merged. PR #706 (`activate`) merged. |

### Additional Phase 1 work completed (15 Feb 2026)

- **Payment behaviour test uplift**: Full Stripe lifecycle coverage — webhook activation wait, portal navigation, subscription cancellation. Test passes in proxy (3 consecutive passes) and CI (pipeline).
- **Dual webhook secret fix**: Per-environment webhook signing secrets with livemode peek. See `PLAN_PROD_BUNDLE_ACTIVATION_FIX.md`.
- **Human QA test plan**: `PLAN_HUMAN_TEST.md` — 8-section iterative manual test plan.
- **Cognito password fix**: `#` instead of `!` in generated test passwords to avoid shell escaping.

### Validation criteria

- `paymentBehaviour-ci` passes: day-guest pass → exhaust tokens → resident-pro pass → VAT submission → usage page — **DONE**
- `submitVatBehaviour-ci` passes: day-guest via test pass → sandbox HMRC submission → obligations → view return — **DONE**
- Telegram test channel receives messages for synthetic user activity — **DONE** (manually verified 17 Feb 2026)
- No regressions in other CI synthetic tests — **DONE** (run 22078976502 — all tests passed)

---

## Phase 2: Subscription Lifecycle Handlers

**Status**: Partially done. `checkout.session.completed` and `customer.subscription.updated` handlers exist. Portal cancellation verified in behaviour test (soft timeout on webhook in proxy — no subscription table). Remaining: invoice.paid renewal, payment failure, refund/dispute handlers.

**Goal**: Handle Stripe renewal, cancellation, and payment failure events. Currently only `checkout.session.completed` is handled — the webhook ignores all other events.

### 2.1 handleInvoicePaid (renewal)

On `invoice.paid`:
- Retrieve subscription from Stripe
- Extract hashedSub from subscription metadata
- Refresh tokens: reset `tokensConsumed = 0`, update `tokenResetAt`
- Update `currentPeriodEnd` on bundle record
- Update subscription record in subscriptions table

### 2.2 handleSubscriptionUpdated

On `customer.subscription.updated`:
- Update `subscriptionStatus` on bundle record
- Update `cancelAtPeriodEnd` if user requested cancellation
- Handle `past_due` status (log, emit CloudWatch metric)

### 2.3 handleSubscriptionDeleted (cancellation complete)

On `customer.subscription.deleted`:
- Mark bundle `subscriptionStatus = "canceled"`
- Bundle remains usable until `currentPeriodEnd`
- After `currentPeriodEnd`, standard expiry logic handles removal

### 2.4 handlePaymentFailed

On `invoice.payment_failed`:
- Update `subscriptionStatus = "past_due"` on bundle record
- Emit CloudWatch metric for alerting
- Stripe handles retry automatically

### 2.5 handleRefund and handleDispute

- On `charge.refunded`: log for audit, don't revoke access (subscription status drives access)
- On `charge.dispute.created`: log and emit CloudWatch alarm metric

### 2.6 Tests

- Unit tests: `app/unit-tests/functions/billingWebhookLifecycle.test.js` — token refresh, status transitions, payment failure logging
- System tests: `app/system-tests/billing/billingLifecycle.system.test.js` — full lifecycle against Stripe simulator + dynalite (checkout → invoice.paid → subscription.deleted)

### Validation

Deploy to CI. All lifecycle events handled correctly. Token refresh on renewal verified. Cancellation preserves access until period end. `npm test` and `./mvnw clean verify` pass.

---

## Phase 3: Frontend Subscribe Button

**Status**: Mostly done. Checkout flow works end-to-end (pass redemption → checkout redirect → payment → bundle granted). "Manage Subscription" button works and navigates to Stripe billing portal. Behaviour test covers the full journey including portal.

**Goal**: Users can subscribe to resident-pro from `bundles.html` via Stripe Checkout. Full end-to-end from button click through payment to active bundle.

### 3.1 bundles.html subscription UI

- "Subscribe" button for `resident-pro` bundle
  - Only shown when user is authenticated and does not hold resident-pro
  - Calls `POST /api/v1/billing/checkout-session`
  - Redirects to Stripe Checkout URL
- Handle `?checkout=success` URL parameter — show success message, refresh bundle list
- Handle `?checkout=canceled` URL parameter — show info message
- "Manage Subscription" link for active resident-pro subscribers (links to usage page initially, Stripe Portal later)

### 3.2 Catalogue update

Update `submit.catalogue.toml` for resident-pro:
- `allocation = "on-subscription-with-pass"` — accepts both pass-based and subscription-based grants
- `price = "9.99/month"` (display only)

### 3.3 Bundle display logic

Update `bundles.html` to handle `allocation = "on-subscription-with-pass"`:
- Show price and "Subscribe" button (not "Request")
- Show "Active" badge for current subscribers
- Show subscription status (active, canceling, past_due)

### 3.4 Behaviour tests

- Extend `paymentBehaviour` test to verify "Subscribe" button appears, checkout redirect works
- Verify success/cancel URL handling after Stripe redirect

### Validation

Deploy to CI. "Subscribe" button visible on bundles page. Checkout redirect works. Success/cancel handling correct. `paymentBehaviour-ci` passes.

---

## Phase 4: Human Test in Prod with Test Passes

**Goal**: A human tester walks through the full journey on the production site using test passes. This validates the real prod environment (Cognito Google login, real CloudFront, real Lambda) without touching live HMRC or charging real money.

**Test plan**: `PLAN_HUMAN_TEST.md` — 8 iterative sections, building in complexity with early endorphin feedback. Covers mobile + desktop, Telegram feed matching, and ops incident recording.

### Prerequisites

- Phases 1-3.5 merged to `main` and deployed to prod
- Dual webhook secrets configured (see `PLAN_PROD_BUNDLE_ACTIVATION_FIX.md`)
- Pass generation activity working (Phase 3.5)
- Prod environment has both live and sandbox HMRC secrets
- Prod environment has both live and test Stripe secrets

### Environment configuration (already planned in `.env.prod`)

```ini
# HMRC — separate live and sandbox
HMRC_CLIENT_SECRET_ARN=arn:...prod/submit/hmrc/client_secret       # real live
HMRC_SANDBOX_CLIENT_SECRET_ARN=arn:...prod/submit/hmrc/sandbox_client_secret

# Stripe — separate live and test
STRIPE_SECRET_KEY_ARN=arn:...prod/submit/stripe/secret_key         # real live
STRIPE_TEST_SECRET_KEY_ARN=arn:...prod/submit/stripe/test_secret_key
STRIPE_PRICE_ID=price_1SzkPBCD0Ld2ukzIqbEweRSk
STRIPE_TEST_PRICE_ID=price_1Szjt0FdFHdRoTOjHDXcuuq8

# Telegram
TELEGRAM_TEST_CHAT_ID=@diy_prod_test
TELEGRAM_LIVE_CHAT_ID=@diy_prod_live
TELEGRAM_OPS_CHAT_ID=@diy_prod_ops
```

### 4.1 Admin creates test passes

```bash
# Day-guest test pass (sandbox HMRC, test Stripe)
curl -X POST https://submit.diyaccounting.co.uk/api/v1/admin/pass \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"bundleId":"day-guest","testPass":true,"maxUses":10,"notes":"Human test - prod validation"}'

# Resident-pro test pass (sandbox HMRC, test Stripe)
curl -X POST https://submit.diyaccounting.co.uk/api/v1/admin/pass \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"bundleId":"resident-pro","testPass":true,"maxUses":10,"notes":"Human test - prod validation"}'
```

### 4.2 Human tester walks through the journey

Execute `PLAN_HUMAN_TEST.md` Sections 1-8 on `submit.diyaccounting.co.uk`:

1. **Section 1**: Browse gateway + submit sites without login — information discovery
2. **Section 2**: Login via Google, explore authenticated experience, check bundles + usage
3. **Section 3**: Redeem day-guest test pass → 3 tokens → query HMRC obligations (sandbox)
4. **Section 4**: Submit VAT to sandbox HMRC → view receipt → check token count
5. **Section 5**: Exhaust tokens → see disabled activities → see upsell
6. **Section 6**: Redeem resident-pro test pass → Stripe checkout (card `4242 4242 4242 4242`) → verify bundle
7. **Section 7**: Generate digital pass → QR code → test redemption in incognito
8. **Section 8**: Manage subscription via Stripe portal → check usage page
9. **Throughout**: Verify Telegram `@diy_prod_test` channel → messages for each step

### 4.3 Verify isolation

- Confirm sandbox HMRC was used (no submissions to live HMRC)
- Confirm test Stripe was used (no real charges in Stripe live dashboard)
- Confirm Telegram messages went to test channel, not live channel

### Validation

Human tester completes all 9 steps successfully. No live HMRC submissions. No real Stripe charges. Telegram test channel has full audit trail.

---

## Phase 5: Synthetic Tests in Prod with Test Passes

**Goal**: Automate the human test journey as a synthetic test that runs in prod on every deployment. Uses test passes exclusively — sandbox HMRC, test Stripe, test Telegram channel.

### 5.1 Prod synthetic test configuration

The existing `paymentBehaviour` test already uses test passes via `ensureBundleViaPassApi({ testPass: true })`. It works against any environment:

```bash
# Run against prod
npm run test:paymentBehaviour-prod
```

This test:
- Creates test passes via admin API → `testPass: true` → `sandbox: true` qualifier
- All HMRC calls go to sandbox (bundle qualifier drives routing)
- All Stripe calls use test mode (bundle qualifier drives routing)
- Telegram messages go to `@diy_prod_test` (synthetic actor classification)

### 5.2 Add paymentBehaviour to prod synthetic test workflow

Add `paymentBehaviour` to `synthetic-test.yml` choices and to the `deploy.yml` post-deployment test matrix:

```yaml
# In deploy.yml — add web-test-payment job
web-test-payment:
  uses: ./.github/workflows/synthetic-test.yml
  with:
    behaviour-test-suite: 'paymentBehaviour'
    environment-name: ${{ needs.names.outputs.environment-name }}
```

### 5.3 Enable Cognito native auth for prod synthetic tests

Prod synthetic tests need native auth (email/password) since Google OAuth can't be automated:
- `npm run test:enableCognitoNative -- prod` before test run
- `npm run test:disableCognitoNative -- prod` after test run
- Same pattern already used for CI synthetic tests in `deploy.yml`

### 5.4 Monitoring

- Synthetic test results visible in GitHub Actions
- Failed synthetic tests → Telegram ops channel alert
- Prod test passes create no live side effects (sandbox HMRC, test Stripe)

### Validation

`npm run test:paymentBehaviour-prod` passes. Synthetic test runs automatically on prod deployment. No live HMRC submissions or real Stripe charges from synthetic tests.

---

## Phase 6: Compliance and Abuse Protection

**Goal**: Accessibility scanning, security scanning, documentation updates, and Stripe hardening before opening payments to real customers.

### 6.1 Accessibility scanning

- Add `/usage.html` and `/bundles.html` (with subscribe button) to `.pa11yci.prod.json`
- Verify axe-core WCAG 2.1 and 2.2 scans include billing paths
- Verify Lighthouse scan includes billing paths
- Run: `npm run accessibility:pa11y-prod`

### 6.2 Security scanning

- Verify OWASP ZAP baseline scan covers billing API paths (`/api/v1/billing/*`)
- Verify ESLint security scan covers billing Lambda files
- Verify npm audit includes `stripe` dependency

### 6.3 Documentation updates

- Add FAQ entries for payments in `faqs.toml`:
  - "How do I subscribe to Resident Pro?"
  - "How do I cancel my subscription?"
  - "What happens if my payment fails?"
  - "How do tokens relate to my subscription?"
- Update guide page with subscription section
- Update about page with Resident Pro benefit card and pricing
- Update accessibility statement with new pages

### 6.4 Stripe hardening

- Stripe Radar: verify enabled (on by default)
- Configure 3D Secure for transactions
- Set weekly payout schedule (7-10 day chargeback buffer)
- UK Distance Selling compliance: consent collection on Checkout (terms of service required, 14-day cooling-off waiver for immediate digital access)

### 6.5 CloudWatch billing metrics

Emit EMF metrics from billing Lambdas:
- `BillingCheckoutCreated` (count per bundleId)
- `BillingBundleGranted` (count per bundleId)
- `BillingPaymentFailed` (count)
- `BillingSubscriptionCanceled` (count)
- `BillingDisputeCreated` (count)

CloudWatch alarms:
- Payment failure rate spike
- Any dispute created
- Webhook delivery failures

### Validation

Pa11y, axe, Lighthouse pass for all billing paths. ZAP finds no new issues. FAQ and guide pages include payment information. Stripe Radar active. CloudWatch metrics visible.

---

## Phase 7: Production Go-Live with Live Passes

**Goal**: Issue non-test passes that route to live HMRC and live Stripe. Real customers can subscribe and submit VAT returns for real.

### 7.1 Verify dual-credential routing in prod

Before issuing any live passes, confirm the routing works correctly:
- Test pass holder → sandbox HMRC + test Stripe (already verified in Phases 4-5)
- Non-test pass holder → live HMRC + live Stripe (verify this path)

### 7.2 End-to-end live validation

Issue a non-test pass for a known test user:

```bash
# Live pass — real HMRC, real Stripe
curl -X POST https://submit.diyaccounting.co.uk/api/v1/admin/pass \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"bundleId":"day-guest","testPass":false,"maxUses":1,"notes":"Live validation"}'
```

Walk through the journey manually:
1. Login via Google
2. Redeem the live pass → bundle has no sandbox qualifier
3. Click "Subscribe" → **live** Stripe checkout (use a real card, GBP 9.99 charge)
4. Verify bundle granted with `subscriptionStatus: "active"`
5. Submit VAT → **live** HMRC (sandbox header NOT set)
6. Verify Telegram `@diy_prod_live` channel receives messages
7. Cancel subscription via Stripe → verify access until period end
8. Refund the GBP 9.99 test charge in Stripe dashboard

### 7.3 Catalogue visibility

Update `submit.catalogue.toml`:
- Add `resident-pro` to `listedInEnvironments` for production
- Verify resident-pro appears on `bundles.html` in production with "Subscribe" button

### 7.4 Synthetic test coexistence

After go-live, both test and live passes coexist in prod:

| Actor | Pass type | HMRC | Stripe | Telegram |
|-------|-----------|------|--------|----------|
| Synthetic test (deploy.yml) | Test pass | Sandbox | Test | `@diy_prod_test` |
| Human tester (manual) | Test pass | Sandbox | Test | `@diy_prod_test` |
| Real customer | Live pass / subscription | Production | Live | `@diy_prod_live` |

Synthetic tests never create live side effects. Real customer activity is isolated to the live channel.

### 7.5 Monitoring first real transactions

- Watch CloudWatch dashboard for billing metrics
- Watch Stripe dashboard for webhook delivery success
- Watch Telegram `@diy_prod_live` for real customer activity
- Verify Stripe Radar is scoring transactions

### Validation

One real GBP 9.99 charge processed and refunded. Live HMRC submission succeeds. Subscription lifecycle (create → cancel → period end) works end-to-end. Synthetic tests continue passing alongside live traffic. Telegram channels correctly separate test and live activity.

---

## Gap Analysis: PLAN_HUMAN_TEST.md vs Go-Live Phases

Cross-referencing the 8-section human QA plan (`PLAN_HUMAN_TEST.md`) against the go-live phases to identify features not yet covered.

### Already covered (no gaps)

| Human Test Section | Go-Live Phase | Status |
|-------------------|---------------|--------|
| Section 2: Login/logout | Phase 1 | Working (Google + Cognito native) |
| Section 3: Guest pass + obligations | Phase 1 | Working (pass redemption + HMRC sandbox) |
| Section 4: Submit VAT + receipt | Phase 1 | Working (submission + receipt display) |
| Section 5: Token exhaustion + upsell | Phase 1 | Working (disabled state + upsell link) |
| Section 6: Stripe checkout + subscribe | Phase 3 | Working (checkout + webhook + Manage Subscription) |
| Section 8: Billing portal + usage page | Phase 2/3 | Partially working (portal works, cancellation webhook needs Phase 2) |
| Throughout: Telegram monitoring | Phase 1 | Architecture in place, needs manual verification |

### Gaps requiring new work

| Human Test Section | Missing Feature | Priority | Notes |
|-------------------|----------------|----------|-------|
| **Section 1**: Information discovery | **Site content quality review** | Medium | Gateway, submit, and spreadsheets sites must be informative without login. Footer links (Privacy, Terms, Accessibility, Guide) must all work. Not a code feature — content/UX review. |
| **Section 2**: Early access list | **Early access registration** | Low | "Register for Early Access" banner and functionality. May already exist or may not be needed if go-live happens first. |
| **Section 7**: Generate digital pass | **Pass generation activity** | **Deferred** | Passes generated via admin workflow for now. UI-based generation (activity on home page, QR code, 10 tokens) deferred to post-go-live. See `_developers/backlog/PLAN_GENERATE_PASS_ACTIVITY.md` for full design. |
| **Section 7**: QR code scanning | **QR code links to bundles page with pre-filled pass** | **High** | The URL `bundles.html?pass=tiger-happy-mountain-silver` must auto-populate the pass input field. Part of the pass generation feature. |
| **Section 8**: Subscription cancellation | **Cancellation webhook processing** | Medium | `customer.subscription.updated` handler must write `cancelAtPeriodEnd: true` to the bundle. Phase 2.2 covers this. |
| **Section 8**: Subscription renewal | **Invoice.paid token refresh** | Medium | Phase 2.1 — reset tokens on renewal. Not needed for initial human test (one billing cycle away). |

### Recommended phase updates

**Phase 3.5 (NEW): Pass Generation Activity** — Promote from backlog to go-live. Required for PLAN_HUMAN_TEST.md Section 7.

This is the only **new feature** required to deliver the full human test journey. Everything else is either already working or is an enhancement to existing functionality (subscription lifecycle handlers).

| Sub-step | Description | Source |
|----------|-------------|--------|
| 3.5.1 | `POST /api/v1/pass/generate` — authenticated, entitlement-checked, token-consuming | `PLAN_GENERATE_PASS_ACTIVITY.md` Phase B |
| 3.5.2 | `passes/generate-digital.html` — UI with QR code (client-side generation) | Phase C |
| 3.5.3 | `bundles.html?pass=` URL parameter auto-fill | Phase C |
| 3.5.4 | Behaviour test: `generatePassActivity.behaviour.test.js` (already scaffolded) | Phase A |

Physical pass generation (t-shirts, mugs) is NOT required for the human test — only digital passes.

**Phase 0 (NEW): Pre-Flight Content Review** — Before the human test, verify:

- Gateway site clearly explains what DIY Accounting does
- Submit site home page is informative without login
- Footer links all work (Privacy, Terms, Accessibility, Guide)
- Spreadsheets site navigation works
- No broken images or layout issues on mobile and desktop

This is a manual review, not code work.

## Phase Dependencies (Updated)

```
Phase 0: Pre-Flight Content Review (manual)
    |
Phase 1: CI Validation ← COMPLETE
    |
    v
Phase 2: Subscription Lifecycle Handlers (cancellation + renewal)
    |
    v
Phase 3: Frontend Subscribe Button ← MOSTLY DONE
    |
    v
Phase 3.5: Pass Generation Activity (deferred — passes generated via workflow for now)
    |
    v
Phase 4: Human Test in Prod (PLAN_HUMAN_TEST.md Sections 1-8)
    |
    v
Phase 5: Synthetic Tests in Prod (test passes)
    |
    v
Phase 6: Compliance & Abuse Protection
    |
    v
Phase 7: Production Go-Live (live passes)
```

Phases are strictly sequential. Each phase validates before proceeding.

---

## Safety Net Summary

| Environment | HMRC "live" key | Stripe "live" key | Risk if qualifier missing |
|-------------|-----------------|-------------------|---------------------------|
| CI | Points to sandbox | Points to test | Zero — can't hit real services |
| Prod | Points to real live | Points to real live | Live HMRC + live Stripe charges |

The qualifier-based routing is critical in prod. CI is safe by design (both "live" and "sandbox" secrets point to sandbox/test). In prod, only non-test passes trigger live credentials.

---

*Document created: 14 February 2026. Updated 15 February 2026 with gap analysis against PLAN_HUMAN_TEST.md, Phase 3.5 (Pass Generation), Phase 0 (Content Review), and current completion status. Consolidates remaining work from PLAN_PAYMENT_INTEGRATION.md (Phases 5, 7-10) and the Human Test Journey from PLAN_HUMAN_TEST_OF_PAYMENT_INTEGRATION_WITH_ALERTING.md.*
