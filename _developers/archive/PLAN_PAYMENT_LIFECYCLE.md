<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Payment Lifecycle Plan

**Created**: 17 February 2026
**Updated**: 26 February 2026
**Status**: In progress — Phase 1 DONE (code + tests), Phase 3 DONE, Phase 4.1 DONE. Next: deploy + validate, then Phase 4 hardening
**Supersedes**: Phases 2, 4-7 of PLAN_PAYMENT_GOLIVE.md (Phase 1 and 3 are COMPLETE)

---

## User Assertions (verbatim)

> I can cancel the subscription but a month was bought already so I can't tell if the lifecycle events are working but I don't think we implemented that.

> Also done enough for this (I generated passes using the workflow): Pass Generation Activity in the main UI will be a later task while the tests run.

> I have just manually subscribed to the resident pro bundle and submitted VAT: request-id 84120054-197a-4ce1-8f60-9f36a3a62614

---

## Current State (26 Feb 2026)

### What Works

- **Checkout flow**: User subscribes via Stripe Checkout, `checkout.session.completed` webhook grants bundle with subscription fields
- **Renewal handling**: `invoice.paid` webhook resets tokens, updates `currentPeriodEnd`, updates subscription record, sends Telegram "subscription-renewed"
- **Cancellation intent**: `customer.subscription.updated` webhook writes `cancelAtPeriodEnd` and `subscriptionStatus` to both bundle and subscription records
- **Cancellation complete**: `customer.subscription.deleted` webhook marks `subscriptionStatus = "canceled"`, sends Telegram "subscription-canceled"
- **Payment failure**: `invoice.payment_failed` webhook updates bundle/subscription to `past_due`, sends Telegram "payment-failed"
- **Audit events**: `charge.refunded` and `charge.dispute.created` logged + Telegram notification
- **Bundle persistence**: Bundles stored in DynamoDB with `subscriptionId`, `subscriptionStatus`, `currentPeriodEnd`, `tokensGranted`, `tokenResetAt`
- **Stripe portal**: "Manage Subscription" navigates to Stripe billing portal for cancellation/payment method update
- **Salt versioning**: Multi-version salt registry, read-path fallback, 5-minute TTL cache (Scenario K fix)
- **Telegram alerting**: All webhook events route based on Stripe `livemode` flag — live Stripe → diy-{env}-live channel, test Stripe → diy-{env}-test channel
- **Behaviour tests**: `paymentBehaviour` covers full funnel including portal cancellation (proxy + CI passing)
- **Synthetic tests**: `paymentBehaviour` in `synthetic-test.yml` choices and `deploy.yml` post-deployment matrix

### Manual Test Results (17 Feb 2026, prod)

- User `f6e2c2a4-50b1-70ea-fbd2-fa5b43edca7d` (Google-federated, prod Cognito)
- Active `resident-pro` subscription: `sub_1T1cF2FdFHdRoTOj6E7qXDye`
- 100 tokens granted, period ends 2026-03-17
- Successfully submitted VAT to sandbox HMRC (request-id `84120054-197a-4ce1-8f60-9f36a3a62614`)
- First renewal due **17 March 2026** — will validate `invoice.paid` handler on real renewal

### Stripe Webhook Delivery Issue (25 Feb 2026)

Stripe emailed about delivery failures to `https://ci-submit.diyaccounting.co.uk/api/v1/billing/webhook`:
- 21 "could not connect" + 1 "other error" since 22 Feb 2026 22:07 UTC
- Stripe will stop attempting by 3 March 2026

**Root cause**: CI is ephemeral. On 22 Feb there were 9+ commits/deploys. Between teardown of old CI deployments (SelfDestruct/sweeper) and `set-origins` completing for new ones, the custom domain mapping points to a deleted API Gateway — causing TCP connection refused.

**Impact on CI**: Expected — CI goes up and down with every push. No real subscriptions exist in CI.

**Impact on prod**: None — prod uses a separate, stable endpoint and account (`acct_1SyN2kFdFHdRoTOj`). The failing account is `acct_1SyN2kCD0Ld2ukzI` (CI/proxy Stripe account).

**Resolution options**:
1. Accept CI failures as expected — disable Stripe alerting for the CI webhook endpoint (configure in Stripe Dashboard → Webhooks → CI endpoint → disable failure emails)
2. Remove the CI webhook from `stripe-setup.js` entirely and rely on behaviour tests for CI verification
3. Keep as-is and treat the emails as informational

**Recommendation**: Option 1 — suppress alerts for the CI endpoint. The `paymentBehaviour-ci` synthetic test validates the webhook path on every CI deployment; Stripe's own retry mechanism is redundant for CI.

### Gaps and Risks

| # | Gap | Severity | Status | Detail |
|---|-----|----------|--------|--------|
| G1 | `handlePaymentFailed` doesn't update bundle status | Medium | **FIXED** | Now sets `subscriptionStatus = "past_due"` on bundle and subscription records |
| G2 | `handleSubscriptionUpdated` has no Telegram notification | Low | **FIXED** | Now sends "subscription-cancellation-scheduled" when `cancel_at_period_end` is true |
| G3 | `charge.dispute.created` has no Telegram | Medium | **FIXED** | Both `charge.refunded` and `charge.dispute.created` now send Telegram via `publishActivityEvent` |
| G4 | No unit tests for lifecycle handlers | Medium | **FIXED** | 7 new tests added to `billingWebhookPost.test.js` (payment_failed ×3, cancellation intent, refund, dispute, no-sub skip) |
| G5 | No system tests for lifecycle handlers | Medium | Deferred | Unit tests with mocked repos provide handler-level coverage; behaviour tests cover E2E. System test against dynalite deferred to Phase 4. |
| G6 | Stripe event name mismatch in `stripe-setup.js` | High | **FIXED** | Changed `invoice.payment_succeeded` → `invoice.paid` in `stripe-setup.js` |
| G7 | `charge.refunded` and `charge.dispute.created` not registered | Medium | **FIXED** | Added to `enabled_events` in `stripe-setup.js` |
| G8 | No CloudWatch EMF billing metrics | Low | Open | Plan Phase 4.5 — none implemented yet |
| G9 | CI Stripe webhook delivery failures | Low | **Documented** | CI is ephemeral. Comment added to `stripe-setup.js`. Manual action needed: suppress alerts in Stripe Dashboard → Webhooks → CI endpoint settings. |
| G10 | Webhook Telegram routing ignored livemode | Medium | **FIXED** | All `publishActivityEvent` calls now set `actor: test ? "test-user" : "customer"` — live Stripe events → live channel, test Stripe → test channel. `{ test }` passed to all handlers. |
| G11 | Expired Stripe test API key in CI Secrets Manager | High | **FIXED** | `sk_test_...Y8wHEj` expired. New key provisioned via `deploy-environment.yml` (run 22462437990). `paymentBehaviour-ci` passes (run 22462538116). |

---

## Phase 1: Subscription Lifecycle Handlers — DONE

**Goal**: Handle Stripe renewal, cancellation, and payment failure events so subscriptions work beyond the first billing cycle.

### 1.1 handleInvoicePaid (renewal) — DONE

Implemented in `billingWebhookPost.js:169-223`. On `invoice.paid`:
- Looks up subscription record by `stripe#${subscriptionId}`
- Resets tokens via `resetTokensByHashedSub()`
- Updates `currentPeriodEnd` and `expiry` on bundle
- Updates subscription record status to `active`
- Sends Telegram "subscription-renewed"

### 1.2 handleSubscriptionUpdated — DONE

Implemented in `billingWebhookPost.js:225-263`. On `customer.subscription.updated`:
- Updates `subscriptionStatus` and `cancelAtPeriodEnd` on bundle record
- Updates subscription record
- Sends Telegram "subscription-cancellation-scheduled" when `cancel_at_period_end` is true

### 1.3 handleSubscriptionDeleted — DONE

Implemented in `billingWebhookPost.js:255-290`. On `customer.subscription.deleted`:
- Marks bundle `subscriptionStatus = "canceled"`
- Updates subscription record with `canceledAt` timestamp
- Sends Telegram "subscription-canceled"
- Bundle remains usable until `currentPeriodEnd` (Stripe grace behaviour)

### 1.4 handlePaymentFailed — DONE

Implemented in `billingWebhookPost.js:292-327`. On `invoice.payment_failed`:
- Updates `subscriptionStatus = "past_due"` on bundle and subscription records
- Sends Telegram "payment-failed" notification
- Stripe handles retry automatically (Smart Retries)

### 1.5 handleRefund and handleDispute — DONE

Implemented in `billingWebhookPost.js` switch statement:
- `charge.refunded`: Audit log + Telegram "charge-refunded" ops notification
- `charge.dispute.created`: Warning log + Telegram "dispute-created" ops notification
- Both events now registered in `stripe-setup.js` `enabled_events`

### 1.6 Tests — DONE (unit), Deferred (system)

Unit tests in `app/unit-tests/functions/billingWebhookPost.test.js` (19 total tests):
- `invoice.paid` token refresh + skip when no subscription record (pre-existing)
- `customer.subscription.updated` status change + cancellation intent with `cancel_at_period_end` (pre-existing + new)
- `customer.subscription.deleted` marks canceled (pre-existing)
- `invoice.payment_failed` updates status to `past_due` + skip when no record + skip when no subscription ID (new)
- `charge.refunded` returns 200 (new)
- `charge.dispute.created` returns 200 (new)

**Behaviour test coverage**: `payment.behaviour.test.js` Step 10 exercises portal cancellation and waits for `customer.subscription.updated` webhook via `waitForCancellationWebhook()`.

System tests against dynalite deferred — unit tests with mocked repos provide sufficient handler-level coverage.

### 1.7 Fix stripe-setup.js event registration — DONE

Updated `scripts/stripe-setup.js` enabled_events:
- Changed `invoice.payment_succeeded` → `invoice.paid` (match current API version `2024-12-18.acacia`)
- Added `charge.refunded` and `charge.dispute.created`
- Added comment about CI webhook expected delivery failures

Script also adds an update path: when an endpoint already exists, it compares `enabled_events` and calls `stripe.webhookEndpoints.update()` if they differ. Signing secrets are preserved on update.

### Validation

All lifecycle events handled correctly. `npm test` passes (941 tests, 89 files). `./mvnw clean verify` passes.

**Done (26 Feb 2026)**:
- [x] Re-run `stripe-setup.js` against test and live Stripe accounts — all 6 endpoints updated (3 test + 3 live), `invoice.payment_succeeded` → `invoice.paid`, added `charge.refunded` + `charge.dispute.created`
- [x] Stripe API keys rotated after use
- [x] Committed on `mfatotp` branch (`9289615c`), pushed and deployed to CI
- [x] Expired Stripe test API key diagnosed via CloudWatch: `Expired API Key provided: sk_test_...Y8wHEj`
- [x] Updated `STRIPE_SECRET_KEY` and `STRIPE_TEST_SECRET_KEY` GitHub Actions secrets in CI environment
- [x] Triggered `deploy-environment.yml` to push new keys to Secrets Manager (run 22462437990)

**Remaining**:
- [x] Verify `deploy-environment.yml` completes successfully (Stripe secret provisioning) — run 22462437990 succeeded
- [x] Re-deploy app stacks to pick up new Stripe key from Secrets Manager — run 22462538116 succeeded
- [x] Verify `paymentBehaviour-ci` passes with valid Stripe key — PASS (run 22462538116)
- [ ] Suppress CI webhook failure emails in Stripe Dashboard (G9)
- [ ] Observe 17 March renewal for real `invoice.paid` handler validation (Phase 2)

---

## Phase 2: Human Test in Prod

**Status**: Partially done. User manually subscribed, submitted VAT, verified Telegram.

**Timeline**: First renewal due **17 March 2026** (19 days from now). Lifecycle handlers are deployed but untested against a real Stripe renewal.

**Remaining**:
- Observe Telegram notification on 17 March renewal (`invoice.paid` → "subscription-renewed")
- Verify tokens reset to 100 and `currentPeriodEnd` advances by 1 month
- Walk through cancellation flow via Stripe portal, verify `cancelAtPeriodEnd = true` in DynamoDB
- After cancellation: verify bundle remains usable until `currentPeriodEnd`
- After `currentPeriodEnd`: verify bundle expires and access is revoked

### Validation

Human tester completes full lifecycle: subscribe → use → cancel → verify access until period end → verify no access after expiry. Telegram channels show correct activity.

---

## Phase 3: Synthetic Tests in Prod — DONE

`paymentBehaviour` is already configured in both workflows:

- `synthetic-test.yml:48` — available as a manual choice
- `deploy.yml:1709-1725` — runs automatically post-deployment

Cognito native auth enable/disable scripts (`npm run test:enableCognitoNative`, `npm run test:disableCognitoNative`) are available for prod.

### Validation

`npm run test:paymentBehaviour-prod` passes. Runs automatically on prod deployment. ✅

---

## Phase 4: Compliance and Abuse Protection

### 4.1 Accessibility scanning — DONE

`/usage.html` and `/bundles.html` are already in:
- `.pa11yci.prod.json` (lines 18-19)
- `.pa11yci.proxy.json` (lines 18-19)
- `.pa11yci.ci.json` (lines 18-19)

### 4.2 Security scanning

- Verify OWASP ZAP baseline covers `/api/v1/billing/*` paths
- Verify ESLint security scan covers billing Lambdas

### 4.3 Documentation updates

- FAQ entries in `faqs.toml`: subscription lifecycle, cancellation, token refresh
  - Current `faqs.toml` has entries for HMRC payment but NOT for Stripe subscription lifecycle
  - Need: "How do I cancel my subscription?", "What happens when my subscription renews?", "What if my payment fails?"
- Update guide page with subscription section
- Update about page with Resident Pro pricing
- Update accessibility statement

### 4.4 Stripe hardening

- Verify Stripe Radar enabled
- Configure 3D Secure
- Set weekly payout schedule (7-10 day chargeback buffer)
- UK Distance Selling compliance: consent collection on Checkout (14-day cooling-off period)

### 4.5 CloudWatch billing metrics — NOT DONE (Gap G8)

Emit EMF metrics from billing Lambdas:
- `BillingCheckoutCreated`, `BillingBundleGranted`, `BillingPaymentFailed`, `BillingSubscriptionCanceled`, `BillingDisputeCreated`

CloudWatch alarms: payment failure rate spike, any dispute, webhook delivery failures.

Currently: no EMF metrics are emitted from any billing handler. All observability is via structured logging and Telegram activity events.

### Validation

Pa11y, axe, Lighthouse pass. ZAP no new issues. FAQ pages complete. Stripe Radar active. CloudWatch metrics visible.

---

## Phase 5: Production Go-Live

### 5.1 Verify dual-credential routing

- Test pass → sandbox HMRC + test Stripe (already verified)
- Live pass → live HMRC + live Stripe (verify this path)

### 5.2 End-to-end live validation

Issue a non-test pass, walk through full journey with real HMRC and real Stripe (GBP 9.99). Refund afterwards.

### 5.3 Catalogue visibility

Add `resident-pro` to `listedInEnvironments` for production.

Currently both `day-guest` and `resident-pro` have `listedInEnvironments` commented out in `submit.catalogue.toml` (closed beta). Uncommenting makes the bundles visible to all users in the given environments.

### 5.4 Synthetic test coexistence

Test and live passes coexist. Synthetic tests never create live side effects.

### 5.5 Monitor first real transactions

CloudWatch dashboard, Stripe dashboard, Telegram live channel, Stripe Radar scoring.

### Validation

One real charge processed and refunded. Live HMRC submission succeeds. Subscription lifecycle works end-to-end. Synthetic tests pass alongside live traffic.

---

## Cleanup Items (from PLAN_SUB_HASH_VERSIONING.md)

| Item | Priority | Status | Notes |
|------|----------|--------|-------|
| Delete GitHub Actions run 22079622301 | High | Unknown | Contains prod v2 passphrase in logs — verify if still accessible |
| Clean up unused prod Cognito GitHub variables | Low | Open | COGNITO_CLIENT_ID, COGNITO_USER_POOL_ARN, COGNITO_USER_POOL_ID |
| Path 3: KMS-encrypted salt in DynamoDB | Low | Open | Script needed to encrypt and write item; Path 1+2 already available |
| CI behaviour tests post-migration | Medium | Open | Need fresh deploy to verify |

---

## Completed Work (reference)

These items are DONE and do not need further action:

- **PLAN_PAYMENT_BEHAVIOUR_CI_FIX.md**: Archived. All Stripe checkout CI failures resolved.
- **PLAN_PAYMENT_GOLIVE.md Phase 1**: CI validation complete. paymentBehaviour-ci passing.
- **PLAN_PAYMENT_GOLIVE.md Phase 3**: Frontend subscribe button working. Checkout + webhook + portal.
- **PLAN_SUB_HASH_VERSIONING.md Phases A-I**: All code, migrations, CI+prod migrations done.
- **Salt cache TTL fix**: 5-minute TTL in subHasher.js (commit af2ec076).
- **Lean deploy DEPLOYMENT_NAME fix**: Commented out in .env.prod and .env.ci.
- **Pass generation**: Done via admin workflow (UI-based generation deferred).
- **Phase 1 lifecycle handlers**: All seven event types handled in `billingWebhookPost.js` with DynamoDB updates + Telegram notifications routed by Stripe livemode (live → live channel, test → test channel).
- **Phase 1 lifecycle tests**: 7 new unit tests added to `billingWebhookPost.test.js` (19 total).
- **Phase 1 stripe-setup.js**: Event registration fixed (`invoice.paid`, `charge.refunded`, `charge.dispute.created` added). Update path added to reconcile events on existing endpoints.
- **Phase 1 Stripe endpoints updated**: All 6 webhook endpoints (3 test + 3 live) updated via `stripe-setup.js` on 26 Feb 2026. API keys rotated.
- **Phase 3 synthetic tests**: `paymentBehaviour` in `synthetic-test.yml` and `deploy.yml`.
- **Phase 4.1 accessibility**: Pa11y configs include `usage.html` and `bundles.html`.

---

## Phase Dependencies (updated)

```
Phase 1: Subscription Lifecycle Handlers — DONE (G1-G7,G10 fixed, G8 deferred to Phase 4)
    |
    v
Phase 2: Human Test in Prod — IN PROGRESS (first renewal 17 March 2026)
    |
    |--- Phase 3: Synthetic Tests in Prod — DONE
    |
    v
Phase 4: Compliance & Abuse Protection (4.1 DONE, rest pending)
    |
    v
Phase 5: Production Go-Live (live passes, real HMRC, real Stripe)
```

Phase 3 no longer blocks Phase 4 (it's complete). Phase 2 observation of the 17 March renewal is a time-gated dependency — code work in Phase 4 can proceed in parallel.

---

*Created 17 February 2026. Updated 26 February 2026. Consolidates remaining work from PLAN_PAYMENT_GOLIVE.md (Phases 2, 4-7), cleanup items from PLAN_SUB_HASH_VERSIONING.md, and verified status from PLAN_PAYMENT_BEHAVIOUR_CI_FIX.md (archived).*
