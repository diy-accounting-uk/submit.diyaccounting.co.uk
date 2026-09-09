<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Billing Hardening Plan

**Created**: 26 February 2026
**Status**: Not started — pre-implementation planning
**Depends on**: PLAN_PAYMENT_LIFECYCLE.md Phase 1 (DONE)

---

## User Assertions (verbatim)

> For 7 and 8 check the current scripts both in package.json and ./scripts these may exist if not create in both and similarly both should be executed by a github actions workflow but there shouldn't be a lambda for GDPR delete, we'll get a request, then run the workflow.

---

## Summary

Eight hardening items identified from billing maturity assessment. Prioritised by risk to customers and legal compliance. Some items already partially exist.

---

## H1: Webhook Idempotency — HIGH

**Problem**: Stripe replays webhooks on retries (network timeout, 5xx response). If `checkout.session.completed` replays, `putBundleByHashedSub` overwrites the bundle — resetting `tokensConsumed` to 0. A user who consumed 95/100 tokens gets a free reset.

Similarly, `invoice.paid` replays call `resetTokensByHashedSub` which resets `tokensConsumed` unconditionally.

**Files**: `app/functions/billing/billingWebhookPost.js`

**Fix**:
- `handleCheckoutComplete`: Use conditional put — only create bundle if no active bundle exists for this hashedSub+bundleId, or if existing bundle has a different subscriptionId
- `handleInvoicePaid`: Only reset tokens if `tokenResetAt` has actually advanced (compare incoming `currentPeriodEnd` with stored `tokenResetAt`)
- Both: Store `lastProcessedEventId` on the subscription record and skip if already seen

**Tests**: Add unit tests for replay scenarios (same event ID, same period).

---

## H2: Token Enforcement Checks Subscription Status — HIGH

**Problem**: `app/services/tokenEnforcement.js` only checks `tokensGranted - tokensConsumed`. It ignores `subscriptionStatus` and `expiry`. A user whose subscription is `canceled` or `past_due` can keep consuming tokens until numerically exhausted, even though their subscription ended.

**Files**: `app/services/tokenEnforcement.js`, `app/data/dynamoDbBundleRepository.js`

**Fix**:
- In token enforcement, after finding the bundle record, check:
  - If `subscriptionStatus === "canceled"` AND `expiry < now` → reject (subscription ended and grace period over)
  - If `subscriptionStatus === "past_due"` → allow but log warning (Stripe may recover payment)
  - `cancelAtPeriodEnd === true` with `expiry > now` → allow (paid until period end)
- Do NOT block `past_due` immediately — Stripe Smart Retries may recover the payment within days

**Tests**: Unit tests for each status scenario.

---

## H3: UK Distance Selling Compliance — MEDIUM

**Problem**: No `consent_collection` in Stripe Checkout session creation. UK Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 require explicit consent for digital services and acknowledgement that the 14-day cooling-off right is waived upon immediate access.

**Files**: `app/functions/billing/billingCheckoutPost.js`

**Fix**:
- Add `consent_collection: { terms_of_service: "required" }` to checkout session creation
- Create a Terms of Service page at `/terms.html`
- Add `terms_of_service` URL to Stripe Checkout session config
- Add cancellation policy/refund information to the terms page

**Tests**: Behaviour test verifies checkout still completes with consent step.

---

## H4: Frontend Subscription Status Display — HIGH

**Problem**: The UI doesn't show `subscriptionStatus`, `cancelAtPeriodEnd`, or `past_due` states. Users can't see that their payment failed or that cancellation is pending.

**Files**: `web/public/bundles.html` (or equivalent billing UI), `app/functions/account/bundleGet.js`

**Fix**:
- Return `subscriptionStatus`, `cancelAtPeriodEnd`, `currentPeriodEnd` from the bundle API
- Display in the UI:
  - `active` → "Active" (green)
  - `past_due` → "Payment issue — update your payment method" (amber) with link to Stripe portal
  - `canceled` with `expiry > now` → "Cancels on {date}" (amber)
  - `canceled` with `expiry < now` → "Expired" (grey)
  - `cancelAtPeriodEnd === true` → "Cancelling at period end ({date})"

**Tests**: Unit tests for status rendering logic. Browser tests for UI display.

---

## H5: Duplicate Subscription Prevention — MEDIUM

**Problem**: Nothing stops a user from going through checkout twice. The second `checkout.session.completed` overwrites the bundle record (compounded by H1 idempotency issue).

**Files**: `app/functions/billing/billingCheckoutPost.js`, `app/functions/billing/billingWebhookPost.js`

**Fix**:
- In `billingCheckoutPost` (checkout session creation): check if user already has an active subscription for this bundleId. If so, redirect to Stripe portal instead of creating a new checkout session.
- In `handleCheckoutComplete`: if bundle already exists with a different active subscriptionId, log a warning and don't overwrite.

**Tests**: Unit test for duplicate checkout attempt. Behaviour test for "already subscribed" redirect.

---

## H6: Remove billingRecoverPost.js Stub — MEDIUM

**Problem**: `billingRecoverPost.js` is a 501 stub that was never implemented. It has deep CDK integration — a full Lambda deployment, API Gateway route, IAM policies, and a BillingStack construct. Dead code that deploys infrastructure and confuses developers.

**Files to modify**:
- Delete: `app/functions/billing/billingRecoverPost.js`
- Modify: `infra/main/java/co/uk/diyaccounting/submit/stacks/BillingStack.java` (remove ~30 lines of Lambda/API construct)
- Modify: `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` (remove ~20 lines of naming fields)
- Modify: `app/bin/server.js` (remove import + `billingRecoverPostApiEndpoint(app)`)
- Update: `infra/test/java/co/uk/diyaccounting/submit/SubmitApplicationCdkResourceTest.java` (adjust Lambda count comment)
- Delete: `app/system-tests/billingInfrastructure.system.test.js` reference (if it only tests recover)

**Risk**: CDK change — requires deployment. The Lambda deletion is safe because it's never called (501 stub). But removal changes the API Gateway resource tree, which needs careful deployment ordering.

**Tests**: Verify `./mvnw clean verify` passes after CDK changes. Verify `npm test` passes.

---

## H7: Stripe↔DynamoDB Subscription Reconciliation — MEDIUM

**Problem**: No mechanism to detect drift between Stripe subscription states and DynamoDB bundle/subscription records. If a webhook is missed (network issue, bug, deployment gap), records diverge silently. The existing `bundleCapacityReconcile.js` Lambda counts active capped bundles — it does NOT compare Stripe subscription status with local records.

**Existing**:
- `app/functions/account/bundleCapacityReconcile.js` — Lambda, hourly, counts capped bundles (unrelated)
- No Stripe reconciliation script exists in `scripts/`
- No npm script or workflow for reconciliation

**Create**:
- `scripts/stripe-reconcile.js` — Script that:
  1. Lists active Stripe subscriptions (via Stripe API)
  2. For each, looks up the corresponding DynamoDB subscription record (`stripe#sub_xxx`)
  3. Compares `status`, `currentPeriodEnd`, `cancelAtPeriodEnd`
  4. Reports mismatches
  5. Optionally fixes mismatches with `--fix` flag (dry-run by default)
- npm script: `"stripe:reconcile"` in package.json
- GitHub Actions workflow: `.github/workflows/stripe-reconcile.yml`
  - Manual trigger (`workflow_dispatch`) with environment selector (ci/prod)
  - Scheduled weekly (e.g., Sundays 06:00 UTC)
  - Uses AWS SSO role for DynamoDB access + Stripe secret from Secrets Manager
  - Reports summary as workflow output

**Tests**: Unit test for comparison logic (extracted to a testable function).

---

## H8: GDPR Deletion — Subscriptions Table Gap — LOW

**Problem**: GDPR deletion scripts and workflows already exist and work well:
- `scripts/delete-user-data.js` — covers 8 DynamoDB tables
- `scripts/export-user-data.js` — GDPR Right of Access
- `.github/workflows/delete-user-data.yml` — manual workflow by hashed-sub
- `.github/workflows/delete-user-data-by-email.yml` — email-based workflow

BUT the `subscriptions` table (`{deployment}-subscriptions`) is NOT covered. It was added after the deletion script was written. The subscriptions table uses `pk` as partition key (format: `stripe#sub_xxx`) with `hashedSub` as an attribute — so it can't be queried by hashedSub without a scan or GSI.

**Files to modify**:
- `scripts/delete-user-data.js` — add subscriptions table handling
- Potentially: CDK to add a GSI on `hashedSub` to the subscriptions table (avoids full table scan)

**Fix options**:
1. **Scan with filter** (simplest): Add a 9th table to TABLE_DEFS with a scan-based approach since deletions are rare and the table will be small
2. **GSI on hashedSub** (scalable): Add a GSI in DataStack.java, then query by hashedSub like the other tables

**Recommendation**: Option 1 for now — GDPR deletion is infrequent, table is small, scan is acceptable. Add GSI later if table grows.

**Tests**: Verify deletion script covers subscriptions table in dry-run mode.

---

## H9: Webhook Callback Testing — Manual Cancellation and Lifecycle Verification — HIGH

**Status**: DONE (26 Feb 2026) — H9.1, H9.2, H9.4A implemented. H9.6 (pipeline integration) implemented. H9.7 (policy configuration) implemented.

**Problem**: The existing behaviour test (`payment.behaviour.test.js` Step 10) exercises `customer.subscription.updated` via portal cancellation, but it only verifies that `cancelAtPeriodEnd` was written — it doesn't test the full lifecycle chain (cancellation → period expiry → subscription deletion → access revocation). The `charge.refunded` and `charge.dispute.created` handlers are audit-only (Telegram + log) with no DynamoDB write, so chargebacks and refunds don't affect the user's subscription status — a customer who disputes a charge retains full access.

### H9.1: Stripe CLI Webhook Forwarding for Local Testing — MEDIUM

**What exists**: Unit tests mock webhook events. Behaviour tests exercise `checkout.session.completed` and `customer.subscription.updated` via real Stripe test checkout and portal cancellation. But `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `charge.refunded`, and `charge.dispute.created` are only tested via unit mocks — never against the running app with real Stripe event payloads.

**Proposal**: Use `stripe trigger` CLI to fire synthetic Stripe events against the local proxy or CI endpoint.

**Script**: `scripts/stripe-trigger-lifecycle.sh`
```bash
# Usage: STRIPE_WEBHOOK_ENDPOINT=https://... ./scripts/stripe-trigger-lifecycle.sh
# Requires: stripe CLI authenticated (`stripe login`)
# Fires each lifecycle event in order against the specified endpoint.
# After each event, polls the bundles API to verify the DynamoDB state changed.
```

Events to trigger (in lifecycle order):
1. `checkout.session.completed` — verify bundle created with `subscriptionStatus: "active"`
2. `invoice.paid` — verify `tokensConsumed` reset to 0 and `currentPeriodEnd` advanced
3. `customer.subscription.updated` (with `cancel_at_period_end: true`) — verify `cancelAtPeriodEnd: true`
4. `invoice.payment_failed` — verify `subscriptionStatus: "past_due"`
5. `customer.subscription.deleted` — verify `subscriptionStatus: "canceled"`
6. `charge.refunded` — verify Telegram notification sent (no DynamoDB change currently)
7. `charge.dispute.created` — verify Telegram notification sent (no DynamoDB change currently)

**npm scripts**:
- `"stripe:trigger-lifecycle"` — full lifecycle sequence
- `"stripe:trigger"` — single event (e.g., `npm run stripe:trigger -- invoice.payment_failed`)

**Limitation**: `stripe trigger` creates synthetic fixture events — `subscriptionId` and `customerId` won't match real records in DynamoDB. Two options:
1. **Fixture-seeded approach**: Script pre-seeds a subscription record in DynamoDB before triggering, then verifies the record was updated
2. **Real subscription approach**: Script creates a real test subscription first (`stripe subscriptions create`), then triggers events against it

Recommend option 2 for proxy/CI (real Stripe test account), option 1 for simulator.

### H9.2: Manual Subscription Cancellation Script — HIGH

**What exists**: The only way to cancel is via the Stripe billing portal UI (behaviour test Step 10 automates this with Playwright). No programmatic way to cancel a subscription for admin/support purposes.

**Proposal**: `scripts/stripe-cancel-subscription.js`

```
Usage:
  node scripts/stripe-cancel-subscription.js <subscription_id> [--immediate | --at-period-end]
  node scripts/stripe-cancel-subscription.js --by-email <email> [--immediate | --at-period-end]

Options:
  --at-period-end  Cancel at end of billing period (default, customer keeps access)
  --immediate      Cancel immediately (refund proration, revoke access now)
  --by-email       Look up subscription by customer email
  --dry-run        Show what would happen without making changes
```

**What it does**:
1. Resolve subscription: either from CLI arg `sub_xxx` or by looking up Stripe customer by email
2. Display subscription details (status, current period, plan, customer email) for confirmation
3. Call `stripe.subscriptions.update(id, { cancel_at_period_end: true })` or `stripe.subscriptions.cancel(id)` depending on flag
4. Wait up to 30s for webhook to fire and update DynamoDB (poll subscription record)
5. Report final state: DynamoDB subscription status, bundle status, tokens remaining

**npm scripts**:
- `"stripe:cancel"` — cancel a subscription
- `"stripe:cancel-immediate"` — cancel immediately (convenience wrapper)

**GitHub Actions workflow**: `.github/workflows/stripe-cancel-subscription.yml`
- Manual trigger (`workflow_dispatch`) with inputs: `subscription_id`, `mode` (at-period-end/immediate), `environment` (ci/prod)
- Uses AWS SSO role for DynamoDB verification + Stripe secret from Secrets Manager

### H9.3: Expiry Detection — Subscription Period End Enforcement — HIGH

**Problem**: When a user cancels "at period end", Stripe eventually fires `customer.subscription.deleted` when the period expires. But if this webhook is missed (deployment gap, network issue, Stripe retry exhaustion), the bundle record keeps `subscriptionStatus: "active"` with `cancelAtPeriodEnd: true` forever — the user never loses access.

**Current state**: `tokenEnforcement.js` does NOT check `expiry` or `currentPeriodEnd`. Even if the bundle record had `subscriptionStatus: "canceled"`, tokens would still be usable (this is H2 above).

**Proposal** (two layers):

**Layer 1 — Token enforcement expiry check (already in H2)**:
- When `expiry < now` AND `cancelAtPeriodEnd === true` → reject token consumption
- When `subscriptionStatus === "canceled"` AND `expiry < now` → reject
- This is the primary safety net — works even if the webhook is missed entirely

**Layer 2 — Reconciliation catches missed deletions (already in H7)**:
- `scripts/stripe-reconcile.js` compares Stripe subscription status with DynamoDB
- If Stripe says `canceled` but DynamoDB says `active`, fixes the record
- Scheduled weekly via GitHub Actions

**Layer 3 (NEW) — Active expiry sweep Lambda**:
- A scheduled Lambda (daily, 06:00 UTC) scans the bundles table for records where:
  - `cancelAtPeriodEnd === true` AND `currentPeriodEnd < now` AND `subscriptionStatus !== "canceled"`
- For each match, calls Stripe to check actual subscription status
- If Stripe confirms deleted/canceled, updates DynamoDB to match
- Sends Telegram summary: "Expiry sweep: N subscriptions expired, M already correct"

**Files**:
- `app/functions/billing/billingExpirySweep.js` — new Lambda
- `infra/main/java/.../stacks/BillingStack.java` — add EventBridge scheduled rule
- `app/unit-tests/functions/billingExpirySweep.test.js` — unit tests

**Alternative (simpler, no new Lambda)**: Skip Layer 3 and rely on H2 (token enforcement checks expiry) + H7 (weekly reconciliation). The Lambda is only needed if we want proactive status correction rather than lazy enforcement.

**Recommendation**: Implement H2 + H7 first. Only add the sweep Lambda if monitoring shows missed webhooks are a real problem.

### H9.4: Chargeback (Dispute) Handling — MEDIUM

**Problem**: `charge.dispute.created` currently only logs and sends a Telegram notification. The customer retains full access. For a £9.99/month subscription this isn't a financial disaster, but repeated disputes indicate abuse and Stripe penalises merchants with high dispute rates (>0.75% triggers review, >1% risks account closure).

**Current handler** (`billingWebhookPost.js:413-422`):
```javascript
case "charge.dispute.created":
  logger.warn({ ... });
  await publishActivityEvent({ event: "dispute-created", ... });
  break;
```

**Proposal** (graduated response):

**Phase A — Automated flagging (low effort)**:
- On `charge.dispute.created`: write `disputed: true` and `disputeId` to the subscription record
- Telegram notification includes the subscription ID and customer email for easy admin lookup
- No automated access revocation — admin manually decides via `stripe:cancel` script (H9.2)

**Phase B — Automated suspension on dispute (medium effort, implement later if needed)**:
- On `charge.dispute.created`: set `subscriptionStatus: "disputed"` on the bundle
- Token enforcement (H2) blocks access for `disputed` status
- On `charge.dispute.closed` (won): restore `subscriptionStatus: "active"`
- On `charge.dispute.closed` (lost): cancel subscription via Stripe API
- Requires adding `charge.dispute.closed` to `stripe-setup.js` enabled_events

**Recommendation**: Phase A first. At £9.99/month with low volume, manual review is appropriate. Phase B if dispute rate exceeds 0.5% or volume exceeds 100 subscriptions.

**Files**:
- `app/functions/billing/billingWebhookPost.js` — add DynamoDB write to dispute handler
- `app/data/dynamoDbSubscriptionRepository.js` — `updateSubscription` already supports arbitrary field updates
- `scripts/stripe-setup.js` — add `charge.dispute.closed` to enabled_events (Phase B)
- `app/unit-tests/functions/billingWebhookPost.test.js` — update dispute test to verify DynamoDB write

### H9.5: Refund Handling — LOW

**Problem**: `charge.refunded` currently only logs and sends a Telegram notification. Like disputes, the customer retains full access after a refund.

**Current state**: Refunds are admin-initiated (via Stripe Dashboard or API). If we refund a customer, we presumably also want to cancel their subscription — but currently these are two separate manual actions.

**Proposal**:

**Option A — Keep audit-only (recommended for now)**:
- Refunds are rare and admin-initiated — the admin who issues the refund can also cancel via `stripe:cancel` (H9.2)
- Add a note to the admin runbook: "After refunding, cancel the subscription using `npm run stripe:cancel`"

**Option B — Auto-cancel on full refund (later)**:
- On `charge.refunded`: check if `amount_refunded === amount` (full refund)
- If full refund, call `stripe.subscriptions.cancel(subscriptionId)`
- This triggers `customer.subscription.deleted` webhook → marks bundle as canceled
- Partial refunds: log only (the subscription continues)

**Recommendation**: Option A for now. Refunds at this scale are infrequent and admin-controlled. Automation can be added when operational volume justifies it.

### H9.6: Pipeline Integration — Webhook Lifecycle in Behaviour Tests — DONE

**Problem**: Webhook testing via `stripe trigger` CLI is useful for local development but doesn't run in the CI/CD pipeline. The payment behaviour test only verifies `checkout.session.completed` and `customer.subscription.updated` webhooks — `customer.subscription.deleted` is never tested end-to-end.

**Implemented**: Added Step 10b to `payment.behaviour.test.js`:
- After the portal cancellation (Step 10, which verifies `cancelAtPeriodEnd=true` via `customer.subscription.updated`)
- Calls `stripe.subscriptions.cancel()` directly via the Stripe Node SDK to trigger immediate deletion
- Polls the bundle API until `subscriptionStatus === "canceled"` — verifying the `customer.subscription.deleted` webhook handler
- Skipped automatically on simulator (no Stripe secret key available)
- Runs in proxy, CI, and prod behaviour tests

**Files**:
- `behaviour-tests/steps/behaviour-bundle-steps.js` — new `verifySubscriptionDeletionWebhook()` function
- `behaviour-tests/payment.behaviour.test.js` — new Step 10b

**Webhook events now verified in the pipeline**:
| Event | Behaviour test step | Verification |
|-------|-------------------|--------------|
| `checkout.session.completed` | Step 6 | `waitForBundleWebhookActivation` — polls until `stripeSubscriptionId` set |
| `customer.subscription.updated` | Step 10 | `waitForCancellationWebhook` — polls until `cancelAtPeriodEnd=true` |
| `customer.subscription.deleted` | Step 10b | `verifySubscriptionDeletionWebhook` — polls until `subscriptionStatus=canceled` |

**Not yet in pipeline** (require synthetic events, not triggerable via normal API):
- `invoice.paid` — tested manually on 17 March 2026 renewal, unit tested, can be tested via `stripe trigger`
- `invoice.payment_failed` — unit tested, can be tested via `stripe trigger`
- `charge.refunded` — unit tested, audit-only handler
- `charge.dispute.created` — unit tested, flags `disputed: true` in DynamoDB

### H9.7: Stripe Account Policy Configuration — DONE

**Script**: `scripts/stripe-configure-policies.js`

Configures the Stripe account for a no-quibble, customer-first approach:

1. **Payout schedule**: Weekly on Wednesdays — holds funds ~2-8 days, giving Early Fraud Warnings and pre-dispute alerts time to arrive while funds are still in Stripe balance
2. **Dispute prevention guidance**: Verifi RDR + Ethoca Alerts (Dashboard manual config) — auto-resolves disputes before they become chargebacks, doesn't count against dispute rate
3. **Dispute handling guidance**: Accept all disputes at £9.99/month — fighting costs £20-40 in fees, always more than the charge
4. **Refund safety**: Stripe natively bounds refunds to original charge amount — no draw-down risk

**npm script**: `stripe:configure-policies`

**Economics at £9.99/month**:
| Scenario | Cost | Action |
|----------|------|--------|
| Customer cancels | £0 | Self-serve portal |
| EFW / pre-dispute alert | £0 | Auto-refund £9.99 |
| Dispute (prevented by Verifi/Ethoca) | ~$0.40-$15 | Auto-resolved |
| Dispute (not prevented) | £20 + £9.99 | Accept, don't fight |
| Dispute (contested) | £40 + £9.99 | NEVER do this |

---

## Implementation Order

| Priority | Item | Effort | Risk | Dependencies |
|----------|------|--------|------|-------------|
| 1 | H1: Webhook idempotency | Medium | HIGH — data integrity | None |
| 2 | H2: Token enforcement status | Medium | HIGH — authorization bypass | None |
| 3 | H4: Frontend status display | Medium | HIGH — user experience | H2 (enforcement logic informs display) |
| 4 | H9.2: Manual cancellation script | Low | HIGH — admin tooling gap | None |
| 5 | H3: UK consent collection | Low | MEDIUM — legal compliance | None |
| 6 | H5: Duplicate subscription prevention | Low | MEDIUM — edge case | H1 (idempotency makes this safer) |
| 7 | H9.4A: Dispute flagging | Low | MEDIUM — abuse detection | None |
| 8 | H6: Remove billingRecoverPost stub | Medium | MEDIUM — CDK change | None (but needs deployment) |
| 9 | H7: Stripe reconciliation script | Medium | MEDIUM — operational | None |
| 10 | H9.1: Stripe CLI lifecycle testing | Medium | MEDIUM — test coverage | H9.2 (uses cancel script) |
| 11 | H8: GDPR subscriptions table | Low | LOW — gap in existing coverage | None |
| 12 | H9.3: Expiry sweep Lambda | Medium | LOW — defence in depth | H2 + H7 (primary layers) |
| 13 | H9.5: Refund auto-cancel | Low | LOW — rare scenario | H9.2 (manual path first) |
| 14 | H9.4B: Dispute auto-suspension | Medium | LOW — volume dependent | H9.4A + H2 |

Items H1 and H2 can be implemented in parallel (no file overlap). H9.2 is quick and immediately useful for admin operations. H3, H7, H8, H9.4A are independent. H6 is a CDK change that should be deployed on its own.

---

## Relationship to Other Plans

- **PLAN_PAYMENT_LIFECYCLE.md**: This plan is the "Phase 4 hardening" referenced there. Phase 1 (lifecycle handlers) is prerequisite — DONE.
- **PLAN_PAYMENT_LIFECYCLE.md Phase 4.4**: "Stripe hardening" — H3 (consent collection) belongs here.
- **PLAN_PAYMENT_LIFECYCLE.md Phase 4.5**: "CloudWatch billing metrics" — NOT covered in this plan (deferred, lower priority than these items).
- **PLAN_COGNITO_TOTP_MFA.md**: No file overlap. Can be implemented concurrently.

---

## What Already Exists (reference)

Before H9 was added, the following webhook callback testing already existed:

| Layer | What's tested | Events covered | Gaps |
|-------|---------------|----------------|------|
| Unit tests (`billingWebhookPost.test.js`) | All 7 event handlers with mocked DynamoDB/Stripe | All 7 events | No real Stripe payloads, no integration |
| System tests (`billingInfrastructure.system.test.js`) | Module loads, auth/signature rejection | None (structural only) | No event processing |
| System tests (`billingCheckout.system.test.js`) | Checkout session creation against Stripe simulator | `checkout.session.completed` (indirectly) | Simulator only |
| Behaviour tests (`payment.behaviour.test.js`) | Full checkout + portal cancellation | `checkout.session.completed`, `customer.subscription.updated` | No renewal, payment failure, dispute, refund, deletion |
| Stripe simulator (`stripeSimulator.js`) | Checkout sessions, subscription retrieval, portal sessions | N/A (API stubs, not event simulation) | No webhook event simulation |

H9.1 fills the gap: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created` have never been tested end-to-end against the running app.

---

## Stripe Dashboard Configuration — DONE (26 Feb 2026)

### Completed

- [x] **Radar for Fraud Teams** — enabled (free trial started)
- [x] **Payout schedule** — weekly on Wednesday (both live and test accounts)
- [x] **Radar block rules** — 3 custom block rules + 1 review rule added:
  - `Block if :dispute_count_on_card_number_all_time: > 0`
  - `Block if :total_customers_with_prior_fraud_activity_for_email_yearly: > 0`
  - `Block if :refund_count_on_card_all_time: > 1`
  - `Review if :risk_level: = 'elevated'`
- [x] **API key rotation** — both live and test keys rotated after accidental exposure
- [x] **GitHub Actions secrets updated** — new keys pushed to ci and prod environments
- [x] **deploy-environment.yml** — triggered to push new keys to Secrets Manager (run 22465017076)
- [x] **Local .env** — updated with new test key

### Deferred

- [ ] **Verifi RDR + Ethoca Alerts** — requires Stripe Dashboard → Disputes → Prevention tab (not visible — may need Stripe support to enable, or may appear after Radar for Fraud Teams trial period). Not urgent: webhook auto-accepts disputes in code.
- [ ] **Early Fraud Warning auto-refund** — same dependency on dispute prevention tab
- [ ] **CI webhook alert suppression** — skipped (low priority, informational emails only)

### Existing default Radar rules (pre-configured by Stripe)

- `Block if :risk_level: = 'highest'` (enabled)
- `Block if payment matches one or more values in default Stripe block lists` (enabled)
- `Request 3DS if 3D Secure is supported for card` (disabled)
- `Block if CVC verification fails based on risk score` (disabled)
- `Block if Postal code verification fails based on risk score` (disabled)

---

*Created 26 February 2026. Updated 26 February 2026. Expanded with H9 (webhook callback testing, manual cancellation, expiry detection, chargebacks). Stripe Dashboard config completed 26 Feb 2026.*
