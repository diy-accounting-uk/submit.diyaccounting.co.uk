<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Payment Integration - Phased Delivery Plan

> **Prerequisite**: `PLAN_PASSES_V2.md` (passes, tokens, bundles, capacity) must be stable before starting.
> **Provider**: Stripe (see [Provider Decision](#provider-decision) below)
> **Target bundle**: `resident-pro` subscription via Stripe Checkout
> **Branch strategy**: Feature branch deployed to CI environment, validated per phase before merging.
> **Stripe donations (completed)**: `_developers/archive/PLAN_STRIPE_1.md` — Stripe Payment Links live on spreadsheets.diyaccounting.co.uk for donations. No backend/webhook infrastructure needed for that. This plan is for the submit site's subscription model.
> **Stripe configuration approach**: All Stripe products, prices, and webhooks are defined as code in `scripts/stripe-setup.js` — see [Stripe Configuration as Code](#stripe-configuration-as-code) below.

## Overview

This plan delivers Stripe-based subscription payments in layered phases, building from infrastructure outward so each phase provides a testable, deployable increment without breaking changes.

Each phase is a checkpoint: deploy to CI, validate, then proceed. No phase introduces breaking changes to existing functionality.

### Testing philosophy: early and deep

Lessons from PLAN_PASSES_V2: phasing without behaviour tests only catches regressions and deployment problems. Real integration issues surface late and are expensive to fix. This plan addresses that by:

1. **Stripe simulator** — A local Stripe API simulator (based on the Stripe OpenAPI spec at `_developers/reference/stripe-api-spec3.json`) that our system tests and behaviour tests can hit without a real Stripe account. This lets us test the full checkout → webhook → bundle-grant flow locally and in CI from Phase 2 onward.
2. **Skeletal behaviour tests from the first UI-visible feature** — As soon as a feature is exposed on the web (a button, a page, a link), a behaviour test exists to verify it. Initially these may hit mocked or simulated APIs, graduating to real CI APIs as infrastructure arrives.
3. **System tests at every backend phase** — Every Lambda gets system tests running against dynalite + Stripe simulator before any CI deployment.
4. **Local → simulator → CI → prod** — Failures are cheapest to fix locally, then against the simulator, then deployed to CI. Each phase validates at all available levels before proceeding.

| Feature | Purpose |
|---------|---------|
| **Token usage page** | Replace header token count with full usage tables (sources + consumption) |
| **Stripe Checkout** | Redirect users to Stripe for card payment, zero PII on our servers |
| **Webhook handling** | Stripe notifies us of payment events, we grant/manage bundles |
| **Customer Portal** | Self-service billing management via Stripe's hosted portal |
| **Subscription recovery** | Recover paid subscriptions after database loss using Stripe metadata |
| **Compliance uplift** | Scan new paths, update help/guide/about for payment features |

---

## Provider Decision

**Recommended: Stripe**

| Criterion | Stripe | GoCardless | Paddle | LemonSqueezy |
|-----------|--------|------------|--------|--------------|
| API-first, no sales call | Yes | Yes | No (MoR complexity) | Yes |
| UK trust/presence | High | High | Yes | US-based |
| Webhook reliability | Excellent | Good | Good | Good |
| Customer portal (self-serve) | Built-in | No | Limited | Limited |
| Fraud/abuse detection | Radar AI | DD only | Yes | Basic |
| Subscription management | Full | DD focused | MoR | Yes |
| Payout delay control | Configurable | N/A (DD) | No (MoR) | No (MoR) |
| No PCI burden | Checkout/Elements | Yes | Yes | Yes |

**Why not Paddle/LemonSqueezy (Merchant of Record)?** They handle VAT, but DIY Accounting is already VAT-registered and wants merchant control for audit trail clarity. Less flexibility on refund policies and payout timing.

**Why not GoCardless?** No card payments, slower setup, less fraud protection. Consider as secondary option for annual subscriptions later.

**Why not PayPal?** Poor API quality, inconsistent webhook delivery, higher dispute rates.

---

## Stripe API Reference

The Stripe OpenAPI v3 specification is stored at `_developers/reference/stripe-api-spec3.json` and `_developers/reference/stripe-api-spec3.yaml` (source: [stripe/openapi](https://github.com/stripe/openapi)). The YAML version renders in IntelliJ's Swagger viewer. This spec is used to:

- Build a local Stripe API simulator for system tests and behaviour tests
- Validate request/response shapes in unit tests
- Generate TypeScript types or JSDoc annotations if needed

The simulator needs to support only the endpoints we use:

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/checkout/sessions` | Create checkout session |
| `GET /v1/subscriptions/:id` | Retrieve subscription details |
| `GET /v1/subscriptions` | List/search subscriptions (for recovery) |
| `POST /v1/billing_portal/sessions` | Create portal session |
| `POST /v1/webhooks` | (simulated event delivery) |

---

## Stripe Configuration as Code

### Principle

All Stripe resources (products, prices, webhook endpoints) are defined declaratively in a single script: `scripts/stripe-setup.js`. This script is:

- **Human-readable**: The configuration object at the top reads like a spec
- **Machine-executable**: Run by either the developer or Claude Code
- **Idempotent**: Safe to re-run — looks up existing resources by metadata before creating
- **Environment-aware**: Works against Stripe test mode or live mode based on the API key provided

### How to run

**Option A — Developer runs it (shell variable or .env):**
```bash
# Via environment variable (recommended for one-off runs)
STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js

# Via .env file (add to .env.proxy or create .env.stripe)
echo "STRIPE_SECRET_KEY=sk_test_..." >> .env.stripe
npx dotenv -e .env.stripe -- node scripts/stripe-setup.js
```

**Option B — Claude Code runs it (one-off restricted key):**
1. Generate a restricted API key in Stripe Dashboard with only these permissions:
   - Products: Write
   - Prices: Write
   - Webhook Endpoints: Write
2. Pass the key to Claude Code in the conversation
3. Claude runs: `STRIPE_SECRET_KEY=rk_test_... node scripts/stripe-setup.js`
4. Delete the restricted key after setup completes

### Script design (`scripts/stripe-setup.js`)

```javascript
// scripts/stripe-setup.js — Stripe subscription configuration as code
//
// Defines all Stripe resources needed for submit.diyaccounting.co.uk subscriptions.
// Idempotent: safe to re-run. Looks up existing resources before creating.
//
// Usage: STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js
//        STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.js --live

import Stripe from 'stripe';

const config = {
  product: {
    name: 'Resident Pro',
    description: 'Monthly subscription for UK VAT submission via DIY Accounting Submit',
    metadata: { bundleId: 'resident-pro', site: 'submit.diyaccounting.co.uk' }
  },
  prices: [
    {
      nickname: 'Resident Pro Monthly',
      unit_amount: 999,       // £9.99 in pence
      currency: 'gbp',
      recurring: { interval: 'month' },
      metadata: { bundleId: 'resident-pro', interval: 'monthly' }
    }
    // Future: annual price at £99.00 (2 months free)
    // {
    //   nickname: 'Resident Pro Annual',
    //   unit_amount: 9900,
    //   currency: 'gbp',
    //   recurring: { interval: 'year' },
    //   metadata: { bundleId: 'resident-pro', interval: 'annual' }
    // }
  ],
  webhookEndpoints: {
    ci: {
      url: 'https://ci-submit.diyaccounting.co.uk/api/v1/billing/webhook',
      description: 'CI environment webhook'
    },
    prod: {
      url: 'https://submit.diyaccounting.co.uk/api/v1/billing/webhook',
      description: 'Production webhook'
    }
  },
  webhookEvents: [
    'checkout.session.completed',
    'invoice.paid',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_failed',
    'charge.refunded',
    'charge.dispute.created'
  ],
  portalConfiguration: {
    business_profile: {
      headline: 'DIY Accounting Submit — Manage your subscription'
    },
    features: {
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true }
    }
  }
};

// Implementation: find-or-create each resource, print IDs at end
// (actual implementation will be authored during Phase 2)
```

### What the script creates

| Resource | Stripe API | Lookup key |
|----------|-----------|------------|
| Product | `POST /v1/products` | `metadata.bundleId = resident-pro` |
| Monthly Price | `POST /v1/prices` | `metadata.bundleId + metadata.interval` |
| Webhook (CI) | `POST /v1/webhook_endpoints` | URL match |
| Webhook (Prod) | `POST /v1/webhook_endpoints` | URL match |
| Customer Portal config | `POST /v1/billing_portal/configurations` | Active config check |

### Output

The script prints all created/found resource IDs:

```
Stripe Setup Complete (test mode)
  Product:          prod_ResidentPro123
  Monthly Price:    price_Monthly456
  Webhook (CI):     we_ci789
  Webhook (Prod):   we_prod012
  Portal Config:    bpc_345

Store these in AWS Secrets Manager:
  {env}/submit/stripe/price_id = price_Monthly456
```

### Secrets workflow

After running `stripe-setup.js`, store secrets in **GitHub Actions** (not directly in AWS). The `deploy-environment.yml` workflow propagates them to AWS Secrets Manager during deployment.

**Secrets** (GitHub Actions Secrets — sensitive credentials):
```
STRIPE_SECRET_KEY         — Live API key (repo-level)
STRIPE_TEST_SECRET_KEY    — Test API key (repo-level)
STRIPE_WEBHOOK_SECRET     — Live webhook signing secret (environment-level: ci, prod)
STRIPE_TEST_WEBHOOK_SECRET — Test webhook signing secret (repo-level)
```

**Variables** (GitHub Actions Variables — non-sensitive public IDs):
```
STRIPE_PRICE_ID           — Live price ID (repo-level)
STRIPE_TEST_PRICE_ID      — Test price ID (repo-level)
```

Price IDs and chat IDs are public identifiers, not credentials. Exposing them without the corresponding API key is harmless.

---

## Architecture Overview

```
User Journey:

  bundles.html                    Stripe Checkout
  +---------------+               +---------------------+
  | "Subscribe"   |-- redirect -->| stripe.com/checkout  |
  | button        |               |                      |
  | (must be      |               | - Card entry         |
  |  logged in)   |               | - Name/email         |
  +---------------+               | - All PII here       |
                                  +----------+-----------+
                                             |
                                             | success
                                             v
                                  +---------------------+
                                  | Stripe Webhook       |
                                  | (fires BEFORE user   |
                                  |  returns to site)    |
                                  +----------+----------+
                                             |
                                             v
                                  +---------------------+
                                  | billingWebhookPost   |
                                  | Lambda               |
                                  |                      |
                                  | 1. Verify signature  |
                                  | 2. Extract hashedSub |
                                  |    from metadata     |
                                  | 3. Allocate bundle   |
                                  | 4. Store subscription|
                                  |    reference         |
                                  +----------+----------+
                                             |
                                             v
                                  +---------------------+
                                  | DynamoDB: bundles    |
                                  |                      |
                                  | bundleId: resident-  |
                                  |   pro                |
                                  | stripeSubscriptionId |
                                  | stripeCustomerId     |
                                  +---------------------+

  User returns to bundles.html (bundle already active!)
```

---

## Data Model Changes

### Bundle Record (Extended)

Existing bundle records gain Stripe integration fields when allocated via subscription:

```
hashedSub               String   (existing)
bundleId                String   (existing) "resident-pro"
expiry                  String   (existing) null for active subscriptions
tokensGranted           Number   (existing) 100
tokensConsumed          Number   (existing) 0
tokenResetAt            String   (existing) ISO8601

stripeSubscriptionId    String   NEW - "sub_1ABC..." for status checks
stripeCustomerId        String   NEW - "cus_XYZ..." for portal access
subscriptionStatus      String   NEW - active|past_due|canceled|unpaid
currentPeriodEnd        String   NEW - ISO8601 when tokens next refresh
cancelAtPeriodEnd       Boolean  NEW - user requested cancellation
```

### Subscriptions Table (New - for audit trail and recovery)

```
Table: {env}-submit-subscriptions
PK: pk = "stripe#sub_1ABC..."

Fields:
  hashedSub               String
  stripeCustomerId        String   "cus_XYZ..."
  productId               String   "prod_ResidentPro"
  priceId                 String   "price_Monthly"
  status                  String   active|past_due|canceled|unpaid
  currentPeriodStart      String   ISO8601
  currentPeriodEnd        String   ISO8601
  canceledAt              String   ISO8601 or null
  createdAt               String   ISO8601
  updatedAt               String   ISO8601
```

---

## Webhook Events to Handle

| Event | Handler | Purpose |
|-------|---------|---------|
| `checkout.session.completed` | `handleCheckoutComplete` | Initial purchase - grant bundle |
| `invoice.paid` | `handleInvoicePaid` | Renewal - refresh tokens |
| `customer.subscription.updated` | `handleSubscriptionUpdated` | Status changes (past_due, etc.) |
| `customer.subscription.deleted` | `handleSubscriptionDeleted` | Cancellation complete |
| `invoice.payment_failed` | `handlePaymentFailed` | Card declined |
| `charge.refunded` | `handleRefund` | Refund issued - log for audit |
| `charge.dispute.created` | `handleDispute` | Chargeback - log and alert |

---

## API Endpoints (New)

| Endpoint | Method | Lambda | Auth | Purpose |
|----------|--------|--------|------|---------|
| `/api/v1/billing/checkout-session` | POST | billingCheckoutPost | JWT | Create Stripe Checkout session |
| `/api/v1/billing/portal` | GET | billingPortalGet | JWT | Get Customer Portal URL |
| `/api/v1/billing/recover` | POST | billingRecoverPost | JWT | Recover subscription after DB loss |
| `/api/v1/billing/webhook` | POST | billingWebhookPost | Stripe signature | Handle Stripe webhooks |

---

## New Frontend Paths

| Path | Purpose | Phase |
|------|---------|-------|
| `/usage.html` | Token usage page (sources + consumption tables) | 1 |

Note: Stripe Checkout and Customer Portal are hosted on stripe.com (no new DIY Accounting pages for payment entry).

---

## Phase 1: Token Usage Page

**Goal**: Replace the header token count + refresh button with a dedicated token usage page showing tabulated sources and consumption.

**Risk mitigated**: Is the token data structure sufficient for a detailed usage view? Does the existing bundle API return enough information?

### 1.1 Token usage page

- [ ] Create `web/public/usage.html`
  - **Token sources table** (top of page): bundles providing tokens
    - Columns: Bundle Name, Tokens Granted, Tokens Remaining, Expiry/Refresh Date
    - Most users will have 1-2 rows
  - **Token consumption table** (below): activities that consumed tokens
    - Columns: Activity, Date/Time, Tokens Used
    - Populated from a new API field or dedicated endpoint
  - Reload button to invalidate bundles cache and re-fetch
  - Navigation link from header token count to this page
  - Standard header/footer/navigation consistent with other pages

### 1.2 Token consumption tracking (backend)

- [ ] Extend bundle/token data to record consumption events
  - Option A: Add `tokenEvents` array to bundle record (simple, limited history)
  - Option B: Separate token events table (scalable, queryable)
  - Decision: Option A for initial implementation (last N events), migrate to Option B if needed
- [ ] Update `tokenEnforcement.js` to record consumption event when a token is consumed
  - Event: `{ activity, timestamp, tokensUsed: 1 }`
- [ ] Update `GET /api/v1/bundle` response to include token consumption events

### 1.3 Header token count link

- [ ] Update `web/public/widgets/auth-status.js`
  - Token count in header becomes a link to `/usage.html`
  - Remove the temporary refresh button from header (refresh lives on usage page now)

### 1.4 Unit tests

- [ ] `web/unit-tests/billing/usage.test.js` - token usage page rendering
- [ ] `app/unit-tests/services/tokenEnforcement.test.js` - consumption event recording

### 1.5 Compliance scanning uplift (usage page)

- [ ] Add `/usage.html` to `.pa11yci.proxy.json`, `.pa11yci.ci.json`, `.pa11yci.prod.json`
- [ ] Add `/usage.html` to axe-core scan URL lists in `package.json`
- [ ] Add `/usage.html` to Lighthouse scan in `package.json`
- [ ] Add `/usage.html` to text-spacing test in `scripts/text-spacing-test.js`

### Validation

Deploy to CI. `npm test` passes. Token usage page loads at `/usage.html` with sources and consumption tables. Pa11y, axe, Lighthouse pass for the new path.

---

## Phase 2: Stripe SDK & Infrastructure Foundation

**Goal**: CDK infrastructure for billing Lambdas, Stripe SDK available, secrets wired. No API endpoints yet.

**Risk mitigated**: Can we deploy the billing infrastructure without breaking existing stacks? Are secrets accessible from Lambda?

### 2.1 Stripe npm dependency

- [ ] Add `stripe` package to `package.json` dependencies (note: not yet present — `PLAN_STRIPE_1` used Payment Links which need no SDK)
- [ ] Verify `npm test` passes with new dependency

### 2.2 Stripe Configuration as Code (products, prices, webhooks)

All Stripe resources are created via `scripts/stripe-setup.js` (see [Stripe Configuration as Code](#stripe-configuration-as-code) above).

- [ ] Implement `scripts/stripe-setup.js` — idempotent script that creates/finds:
  - Product: "Resident Pro" with `metadata.bundleId=resident-pro`
  - Monthly price: GBP 9.99/month with metadata
  - Webhook endpoints for CI and prod URLs
  - Customer Portal configuration
- [ ] Run `scripts/stripe-setup.js` against Stripe test mode
- [ ] Verify all resources created correctly in Stripe Dashboard

### 2.3 Secrets Manager entries

- [ ] Create `scripts/stripe-setup-secrets.sh` — stores Stripe IDs in AWS Secrets Manager
- [ ] Run secrets script for CI environment:
  - `{env}/submit/stripe/secret_key` — Stripe API secret key
  - `{env}/submit/stripe/webhook_secret` — Webhook signing secret
  - `{env}/submit/stripe/price_id` — Monthly price ID from stripe-setup.js output

### 2.4 CDK infrastructure (BillingStack)

- [ ] Create `infra/main/java/.../BillingStack.java` (or extend AccountStack)
  - Placeholder Lambdas for: billingCheckoutPost, billingPortalGet, billingRecoverPost, billingWebhookPost
  - Environment variables: STRIPE_SECRET_KEY_ARN, STRIPE_WEBHOOK_SECRET_ARN, STRIPE_PRICE_ID, BUNDLES_TABLE_NAME, SUBSCRIPTIONS_TABLE_NAME
  - Grant Secrets Manager read to all billing Lambdas
  - Grant DynamoDB read/write on bundles table and subscriptions table
  - billingWebhookPost: skip JWT authorizer (uses Stripe signature verification)
- [ ] Add subscriptions DynamoDB table to DataStack.java
  - Table name: `{env}-submit-subscriptions`
  - PK: `pk` (String)
  - PITR enabled
  - RemovalPolicy.DESTROY
- [ ] Wire API Gateway routes for billing endpoints
- [ ] Update `SubmitSharedNames.java` with billing Lambda configuration

### 2.5 Stripe SDK helper

- [ ] Create `app/lib/stripeClient.js`
  - Initialise Stripe client from Secrets Manager ARN
  - Lazy initialisation (create client on first use, cache for Lambda warm starts)
  - Export: `getStripeClient()`

### 2.6 Stripe API simulator

- [ ] Create `app/test-support/stripeSimulator.js`
  - Lightweight Express server implementing the Stripe endpoints we use (see Stripe API Reference above)
  - Based on `_developers/reference/stripe-api-spec3.json` for response shapes
  - Supports: `POST /v1/checkout/sessions`, `GET /v1/subscriptions/:id`, `GET /v1/subscriptions`, `POST /v1/billing_portal/sessions`
  - Supports: simulated webhook delivery (call a local endpoint with a signed event)
  - Returns realistic test data (Stripe object IDs, metadata passthrough, timestamps)
  - Configurable: can inject failures, delays, specific responses
  - Used by system tests and behaviour tests (replaces real Stripe in local/simulator environments)
- [ ] Wire simulator into `.env.test` and `.env.proxy` configurations
  - `STRIPE_API_BASE_URL` points to simulator when running locally
  - `stripeClient.js` respects this override for test/proxy environments

### 2.7 Express server routes (local dev)

- [ ] Add billing API routes to local Express server
  - `POST /api/v1/billing/checkout-session`
  - `GET /api/v1/billing/portal`
  - `POST /api/v1/billing/recover`
  - `POST /api/v1/billing/webhook`

### 2.8 System tests (infrastructure foundation)

- [ ] `app/system-tests/billing/billingInfrastructure.system.test.js`
  - Verify billing Lambdas can be imported and invoked
  - Verify Stripe simulator starts and responds to health check
  - Verify subscription table CRUD works against dynalite
  - These tests run locally and catch wiring issues before any CI deployment

### 2.9 Maven build verification

- [ ] `./mvnw clean verify` passes with new CDK constructs
- [ ] CDK synth produces expected CloudFormation templates

### Validation

Deploy to CI. All existing stacks deploy without issues. New BillingStack deploys with placeholder Lambdas. Secrets accessible from Lambda environment. Stripe simulator starts and responds. `npm test` and `./mvnw clean verify` pass.

---

## Phase 3: Checkout Session API

**Goal**: Authenticated users can create a Stripe Checkout session. Redirect URL returned for frontend use.

**Risk mitigated**: Does Stripe Checkout session creation work with our hashedSub metadata approach? Does the redirect flow work end-to-end?

### 3.1 billingCheckoutPost Lambda

- [ ] Create `app/functions/billing/billingCheckoutPost.js`
  - Extract hashedSub from JWT (via custom authorizer)
  - Extract user email from JWT
  - Create Stripe Checkout Session:
    - `mode: "subscription"`
    - `customer_email`: user's email
    - `client_reference_id`: hashedSub
    - `metadata`: `{ hashedSub, bundleId: "resident-pro" }`
    - `subscription_data.metadata`: `{ hashedSub, bundleId }`
    - `success_url`: `{baseUrl}/bundles.html?checkout=success`
    - `cancel_url`: `{baseUrl}/bundles.html?checkout=canceled`
    - `consent_collection.terms_of_service`: `"required"`
    - Custom text for UK distance selling regulations waiver
  - Return: `{ checkoutUrl: "https://checkout.stripe.com/..." }`

### 3.2 Unit tests

- [ ] `app/unit-tests/functions/billingCheckoutPost.test.js`
  - Mock Stripe SDK, verify session creation params
  - Verify hashedSub and bundleId in metadata
  - Verify error handling for missing auth

### 3.3 System tests (against Stripe simulator)

- [ ] `app/system-tests/billing/billingCheckout.system.test.js`
  - Use Stripe simulator (not real Stripe) for fast, reliable local testing
  - Create checkout session via Lambda handler, verify URL returned
  - Verify metadata contains hashedSub and bundleId
  - Verify simulator recorded the checkout session creation

### 3.4 Behaviour test: skeletal checkout flow (simulator)

- [ ] `behaviour-tests/billing/billingCheckout.behaviour.test.js`
  - Run against local proxy with Stripe simulator
  - Navigate to `bundles.html`, verify "Subscribe" button appears for `resident-pro`
  - Click "Subscribe" → verify redirect to checkout URL (intercepted, not followed to Stripe)
  - Verify the checkout session was created with correct metadata
  - This tests the full frontend → API → Stripe flow using the simulator
  - Marked as `simulator` environment initially, graduates to `ci` when deployed

### Validation

Deploy to CI. `POST /api/v1/billing/checkout-session` returns a valid Stripe Checkout URL with correct metadata. Unit tests, system tests (against simulator), and skeletal behaviour test pass locally. CI deployment verified.

---

## Phase 4: Webhook Handler & Bundle Grant

**Goal**: Stripe webhooks are received, signature-verified, and `checkout.session.completed` grants a `resident-pro` bundle with tokens.

**Risk mitigated**: Does webhook signature verification work with API Gateway's request format? Does the bundle grant flow integrate correctly with existing bundlePost logic?

### 4.1 billingWebhookPost Lambda

- [ ] Create `app/functions/billing/billingWebhookPost.js`
  - Verify Stripe webhook signature using raw request body
  - Route events to handlers based on event type
  - Return 200 for handled events, 400 for invalid signature
  - Log unhandled event types (don't fail)

### 4.2 handleCheckoutComplete

- [ ] On `checkout.session.completed`:
  - Extract `hashedSub` and `bundleId` from session metadata
  - Retrieve subscription details from Stripe
  - Grant bundle via existing `addBundles()` / bundlePost logic:
    - `bundleId`: from metadata
    - `tokensGranted`: from catalogue
    - `stripeSubscriptionId`: from session
    - `stripeCustomerId`: from session
    - `subscriptionStatus`: `"active"`
    - `currentPeriodEnd`: from subscription
  - Write subscription record to subscriptions table

### 4.3 Webhook signature verification

- [ ] Handle API Gateway request format (raw body for signature verification)
- [ ] Verify `stripe-signature` header against webhook secret
- [ ] Return 400 with JSON error for invalid signatures

### 4.4 Unit tests

- [ ] `app/unit-tests/functions/billingWebhookPost.test.js`
  - Mock Stripe SDK, verify signature check
  - Verify bundle grant on checkout.session.completed
  - Verify 400 on invalid signature
  - Verify subscription record written

### 4.5 System tests (against Stripe simulator + dynalite)

- [ ] `app/system-tests/billing/billingWebhook.system.test.js`
  - Stripe simulator delivers `checkout.session.completed` event to webhook handler
  - Verify bundle appears in DynamoDB (dynalite) with Stripe fields
  - Verify subscription record in subscriptions table
  - Verify tokens initialised from catalogue
  - Test invalid signature rejection
  - Full checkout → webhook → bundle flow against simulator

### 4.6 Behaviour test: checkout-to-bundle flow (simulator)

- [ ] Extend `behaviour-tests/billing/billingCheckout.behaviour.test.js`
  - After checkout redirect (intercepted), simulator delivers webhook to local API
  - Navigate back to `bundles.html` (simulating success return)
  - Verify `resident-pro` bundle now appears as active
  - Verify token count shows 100 tokens
  - This exercises the complete subscribe → webhook → bundle → UI flow end-to-end

### Validation

Deploy to CI. Full checkout → webhook → bundle-grant flow works end-to-end against simulator. Bundle granted on successful checkout. Subscription record stored. Unit tests, system tests, and behaviour tests pass locally and against CI.

---

## Phase 5: Subscription Lifecycle Events

**Goal**: Handle renewal, cancellation, payment failure. Tokens refresh on renewal, access continues until period end on cancellation.

**Risk mitigated**: Does token refresh work correctly on renewal? Does graceful degradation work when payment fails?

### 5.1 handleInvoicePaid (renewal)

- [ ] On `invoice.paid`:
  - Retrieve subscription from Stripe
  - Extract hashedSub from subscription metadata
  - Refresh tokens: reset `tokensConsumed = 0`, update `tokenResetAt`
  - Update `currentPeriodEnd` on bundle record
  - Update subscription record

### 5.2 handleSubscriptionUpdated

- [ ] On `customer.subscription.updated`:
  - Update `subscriptionStatus` on bundle record
  - Update `cancelAtPeriodEnd` if user requested cancellation
  - Handle `past_due` status (log, potentially alert)

### 5.3 handleSubscriptionDeleted (cancellation complete)

- [ ] On `customer.subscription.deleted`:
  - Mark bundle `subscriptionStatus = "canceled"`
  - Bundle remains usable until `currentPeriodEnd`
  - After `currentPeriodEnd`, standard expiry logic handles removal

### 5.4 handlePaymentFailed

- [ ] On `invoice.payment_failed`:
  - Update `subscriptionStatus = "past_due"` on bundle record
  - Log for monitoring (Stripe handles retry automatically)
  - Emit CloudWatch metric for alerting

### 5.5 handleRefund and handleDispute

- [ ] On `charge.refunded`: log for audit, don't revoke access (subscription status drives access)
- [ ] On `charge.dispute.created`: log and emit CloudWatch alarm metric

### 5.6 Unit tests

- [ ] `app/unit-tests/functions/billingWebhookLifecycle.test.js`
  - Verify token refresh on invoice.paid
  - Verify status update on subscription.updated
  - Verify graceful handling on subscription.deleted
  - Verify logging on payment_failed, refund, dispute

### 5.7 System tests (full lifecycle against simulator)

- [ ] `app/system-tests/billing/billingLifecycle.system.test.js`
  - Stripe simulator delivers events in sequence: checkout → invoice.paid → subscription.deleted
  - Verify token counts at each stage (100 → consumed some → refreshed to 100 → still accessible until period end)
  - Verify bundle status transitions: active → active (renewed) → canceled
  - Verify payment failure logging

### 5.8 Behaviour test: subscription lifecycle (simulator)

- [ ] `behaviour-tests/billing/billingLifecycle.behaviour.test.js`
  - Full lifecycle via the browser against local proxy + Stripe simulator:
    1. Subscribe → verify bundle active with 100 tokens
    2. Consume tokens via VAT submission
    3. Simulator delivers `invoice.paid` (renewal) → verify tokens refreshed
    4. Simulator delivers `subscription.deleted` → verify bundle shows "ending on DATE"
  - This catches UI-level integration issues that system tests miss

### Validation

Deploy to CI. Full subscription lifecycle works end-to-end against simulator. Tokens refresh on renewal. Cancellation preserves access until period end. Payment failure logged and alerted. Unit tests, system tests, and behaviour tests pass locally and against CI.

---

## Phase 6: Customer Portal & Subscription Recovery

Scrapped due to scope creep and complexity. Customer Portal and subscription recovery deferred to future phase

---

## Phase 7: Frontend Integration & Behaviour Tests

**Goal**: Users can subscribe from bundles.html, manage subscription, see checkout results. Full end-to-end behaviour tests.

**Risk mitigated**: Does the complete user journey work from bundles page through Stripe and back?

### 7.1 bundles.html subscription UI

- [ ] Add "Subscribe" button for `resident-pro` bundle
  - Only shown when user is authenticated and does not hold resident-pro
  - Calls `POST /api/v1/billing/checkout-session`
  - Redirects to Stripe Checkout URL
- [ ] Handle `?checkout=success` URL parameter
  - Show success message: "Subscription activated!"
  - Refresh bundle list (bundle should already be active from webhook)
- [ ] Handle `?checkout=canceled` URL parameter
  - Show info message: "Checkout canceled. No charges were made."
- [ ] Add "Manage Subscription" button for active resident-pro subscribers
  - Calls `GET /api/v1/billing/portal`
  - Redirects to Stripe Customer Portal

### 7.2 Catalogue update

- [ ] Update `submit.catalogue.toml` for resident-pro:
  - `allocation = "on-subscription"` (new allocation type)
  - `subscriptionRequired = true` (UI hint: show "Subscribe" not "Request")
  - `price = "9.99/month"` (display only)

### 7.3 Bundle display logic

- [ ] Update `bundles.html` to handle `allocation = "on-subscription"`:
  - Show price and "Subscribe" button instead of "Request" button
  - Show "Manage Subscription" for active subscribers
  - Show "Renew" or "Resubscribe" for canceled/expired subscriptions

### 7.4 Behaviour tests

- [ ] `behaviour-tests/billing/subscriptionCheckout.behaviour.test.js`
  - Verify "Subscribe" button appears for resident-pro
  - Verify checkout redirect (mock Stripe in test mode)
  - Verify success/cancel URL handling
- [ ] `behaviour-tests/billing/subscriptionManagement.behaviour.test.js`
  - Verify "Manage Subscription" button for active subscribers
  - Verify portal redirect

### Validation

Deploy to CI. Complete subscription flow works end-to-end in CI. Behaviour tests pass. Existing behaviour tests unaffected.

---

## Phase 8: Compliance & Documentation Uplift

**Goal**: All new frontend paths scanned for accessibility and security. Help, guide, and about pages updated to cover payments and token relationship.

**Risk mitigated**: Are new pages WCAG 2.2 AA compliant? Do help/guide pages accurately describe the payment flow?

### 8.1 Accessibility scanning configuration

- [ ] Add `/usage.html` to all Pa11y config files (`.pa11yci.proxy.json`, `.pa11yci.ci.json`, `.pa11yci.prod.json`) — if not already done in Phase 1.5
- [ ] Verify axe-core WCAG 2.1 and 2.2 scans include new path
- [ ] Verify Lighthouse scan includes new path
- [ ] Verify text-spacing test includes new path
- [ ] Run accessibility suite: `npm run accessibility:pa11y-proxy` etc.

### 8.2 Penetration testing configuration

- [ ] Verify OWASP ZAP baseline scan covers new billing API paths
- [ ] Verify ESLint security scan covers new billing Lambda files
- [ ] Verify npm audit and retire.js scan include the `stripe` dependency
- [ ] Run penetration suite and verify no new findings

### 8.3 Help page updates (faqs.toml)

- [ ] Add FAQ entries for payments:
  - "How do I subscribe to Resident Pro?" — Stripe Checkout flow, pricing
  - "How do I cancel my subscription?" — Customer Portal link, access until period end
  - "What happens if my payment fails?" — Stripe retry, past_due status
  - "How do tokens relate to my subscription?" — Monthly token allocation, refresh cycle
  - "What if I lose access to my account?" — Subscription recovery flow
- [ ] Add FAQ category: "Payments" (or extend "Bundles" category)
- [ ] Update existing token FAQs to mention subscription token refresh

### 8.4 Guide page updates (guide.html)

- [ ] Add section: "Subscribing to Resident Pro"
  - Step-by-step with screenshots of Stripe Checkout
  - Explain token allocation and monthly refresh
  - Link to manage subscription
- [ ] Update existing sections to mention token costs where relevant
  - Step 2 (Submit VAT Return): mention "This uses 1 token"

### 8.5 About page updates (about.html)

- [ ] Update "Free Guest Tier" benefit to contrast with Resident Pro
- [ ] Add "Resident Pro" benefit card:
  - 100 tokens/month
  - Monthly refresh
  - Stripe-powered secure payments
  - Self-service billing management
- [ ] Update pricing information

### 8.6 Accessibility statement update (accessibility.html)

- [ ] Add `/usage.html` to the list of tested pages
- [ ] Update page count
- [ ] Note any Stripe-hosted pages (Checkout, Portal) are outside accessibility scope

### 8.7 Compliance behaviour tests

- [ ] Update `behaviour-tests/compliance.behaviour.test.js`
  - Add check for payment-related content on help page
  - Add check for subscription info on about page
  - Verify `/usage.html` loads and is accessible

### Validation

Deploy to CI. Run `npm run test:complianceBehaviour-ci`. All accessibility tools (Pa11y, axe, Lighthouse) pass for new paths. ZAP finds no new security issues. Help and guide pages include payment information.

---

## Phase 9: Abuse Protection & Hardening

**Goal**: Stripe Radar configured, repeat refund detection active, payout delays set, CloudWatch alarms for billing events.

**Risk mitigated**: Are we protected against payment fraud, serial refunders, and billing anomalies?

### 9.1 Stripe Radar configuration

- [ ] Enable Stripe Radar (included free, enabled by default on new accounts)
- [ ] Configure Radar rules (via Dashboard or future Stripe API script):
  - Require 3D Secure for transactions over threshold
  - Block high-risk countries if applicable

### 9.2 Repeat refund detection

- [ ] In `handleRefund`: query Stripe for customer's recent refund history
- [ ] If 2+ refunds in 90 days: emit CloudWatch metric `RepeatRefunder`
- [ ] CloudWatch alarm on RepeatRefunder metric

### 9.3 Payout schedule

- [ ] Configure weekly payouts (7-10 day buffer for chargebacks) — via Dashboard or add to `stripe-setup.js`

### 9.4 UK Distance Selling compliance

- [ ] Stripe Checkout consent collection configured (terms of service required)
- [ ] Custom submit text: waiver of 14-day cooling-off period for immediate digital access

### 9.5 CloudWatch metrics and alarms

- [ ] Emit EMF metrics from billing Lambdas:
  - `BillingCheckoutCreated` (count per bundleId)
  - `BillingBundleGranted` (count per bundleId)
  - `BillingPaymentFailed` (count)
  - `BillingSubscriptionCanceled` (count)
  - `BillingDisputeCreated` (count)
- [ ] CloudWatch alarms:
  - Payment failure rate spike
  - Dispute created (any)
  - Webhook delivery failures (Stripe dashboard)
- [ ] Add billing metrics row to ObservabilityStack dashboard

### 9.6 System tests

- [ ] Verify EMF metrics are emitted correctly in system tests

### Validation

Deploy to CI. Stripe Radar active. CloudWatch metrics visible on dashboard. Alarm thresholds configured. Weekly payout schedule confirmed.

---

## Phase 10: Production Go-Live

**Goal**: Switch from Stripe test mode to live mode. End-to-end production validation.

**Risk mitigated**: Does live mode work identically to test mode? Are all secrets rotated?

### 10.1 Stripe live mode setup

- [ ] Run `scripts/stripe-setup.js` with live mode API key:
  ```bash
  STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.js --live
  ```
  This creates the same product/price/webhook/portal resources in live mode.
- [ ] Store live mode secrets in Secrets Manager:
  ```bash
  STRIPE_PRICE_ID=price_LiveXYZ \
  STRIPE_WEBHOOK_SECRET=whsec_live_... \
  STRIPE_SECRET_KEY=sk_live_... \
    scripts/stripe-setup-secrets.sh prod
  ```

### 10.2 Production deployment

- [ ] Deploy all billing infrastructure to production
- [ ] Verify webhook endpoint is reachable from Stripe
- [ ] Verify Lambda has access to live secrets

### 10.3 Production validation

- [ ] Create test subscription with a real card (use Stripe's test clock or a real low-value transaction)
- [ ] Verify bundle granted after payment
- [ ] Verify Customer Portal access
- [ ] Verify webhook events received and processed
- [ ] Cancel subscription, verify access until period end

### 10.4 Catalogue update

- [ ] Update `submit.catalogue.toml`: add `resident-pro` to `listedInEnvironments` for production
- [ ] Verify resident-pro appears on bundles.html in production

### 10.5 Monitoring

- [ ] Watch CloudWatch dashboard for first real transactions
- [ ] Verify Stripe Dashboard shows webhook deliveries succeeding
- [ ] Check Stripe Radar is scoring transactions

### Validation

Production subscription flow works end-to-end. Real payment processed, bundle granted, portal accessible. All monitoring active.

---

## User Journeys

### Journey 1: New Business (Cold Start)

1. User visits `submit.diyaccounting.co.uk`, sees "Submit VAT" activity
2. Not authenticated → redirected to login (postLoginRedirect preserves context)
3. After login, `bundles.html` loads → `GET /api/v1/bundle` returns no bundles, fetches `/submit.catalogue.toml` for available bundle types
4. UI shows `day-guest` (if capacity available) and `resident-pro` with price
5. User clicks "Subscribe to Resident Pro"
6. `POST /api/v1/billing/checkout-session` → redirect to Stripe Checkout
7. User enters card details on Stripe's domain (DIY Accounting never sees card data)
8. Payment succeeds → Stripe webhook fires → bundle granted
9. User returns to `bundles.html?checkout=success` → bundle already active, 100 tokens

### Journey 2: Upgrade from Guest

1. User has `day-guest`, tokens exhausted, tries to submit VAT
2. API returns 403 `tokens_exhausted`
3. UI shows "No tokens remaining. [View Bundles]"
4. User clicks → `bundles.html` shows `resident-pro` "Subscribe" button
5. Same flow as Journey 1, steps 5-9
6. resident-pro bundle active with 100 tokens

### Journey 3: Database Loss Recovery

1. Database wiped, Stripe data intact
2. User authenticates (Cognito/Google unchanged)
3. `bundles.html` loads → empty bundles → triggers recovery check
4. `POST /api/v1/billing/recover` → queries Stripe by hashedSub metadata
5. Finds active subscription → re-creates bundle in DynamoDB
6. User sees resident-pro restored, can submit VAT immediately

---

## Cost Analysis

| Item | Cost |
|------|------|
| Stripe fee (UK card) | 1.5% + 20p per transaction |
| Stripe Radar | Free (basic) |
| Stripe Billing | Free (included) |
| AWS Lambda | Negligible (webhook calls) |

Example: GBP 9.99/month subscription
- Stripe fee: GBP 0.15 (1.5%) + GBP 0.20 = GBP 0.35
- Net to DIY Accounting: GBP 9.64
- Annual equivalent: GBP 115.68 (vs GBP 119.88 gross)

---

## Phase Dependencies

```
Phase 1: Token Usage Page
    |
    v
Phase 2: Stripe SDK & Infrastructure Foundation
    |
    v
Phase 3: Checkout Session API
    |
    v
Phase 4: Webhook Handler & Bundle Grant
    |
    v
Phase 5: Subscription Lifecycle Events
    |
    +-------------------+
    v                   v
Phase 6: Portal &    Phase 7: Frontend
  Recovery             Integration
    |                   |
    +-------------------+
              |
              v
Phase 8: Compliance & Documentation Uplift
              |
              v
Phase 9: Abuse Protection & Hardening
              |
              v
Phase 10: Production Go-Live
```

Phases 6 and 7 can run in parallel after Phase 5 completes. Phase 8 should include all new paths from previous phases.

---

## Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `web/public/usage.html` | 1 | Token usage page with sources + consumption tables |
| `app/lib/stripeClient.js` | 2 | Stripe SDK initialisation helper |
| `app/test-support/stripeSimulator.js` | 2 | Local Stripe API simulator for tests |
| `app/functions/billing/billingCheckoutPost.js` | 3 | Create Stripe Checkout session |
| `app/functions/billing/billingWebhookPost.js` | 4 | Handle Stripe webhook events |
| `app/functions/billing/billingPortalGet.js` | 6 | Get Customer Portal URL |
| `app/functions/billing/billingRecoverPost.js` | 6 | Recover subscriptions after DB loss |
| `app/data/dynamoDbSubscriptionRepository.js` | 2 | CRUD for subscriptions table |
| `infra/main/java/.../BillingStack.java` | 2 | CDK billing infrastructure |
| `scripts/stripe-setup.js` | 2 | Idempotent Stripe config script (products, prices, webhooks, portal) |
| `scripts/stripe-setup-secrets.sh` | 2 | Store Stripe IDs in AWS Secrets Manager |
| `behaviour-tests/billing/billingCheckout.behaviour.test.js` | 3 | Skeletal checkout flow behaviour test |
| `behaviour-tests/billing/billingLifecycle.behaviour.test.js` | 5 | Subscription lifecycle behaviour test |
| `behaviour-tests/billing/billingManagement.behaviour.test.js` | 6 | Portal and recovery behaviour test |
| `app/system-tests/billing/billingInfrastructure.system.test.js` | 2 | Infrastructure wiring system tests |
| `app/system-tests/billing/billingCheckout.system.test.js` | 3 | Checkout session system tests |
| `app/system-tests/billing/billingWebhook.system.test.js` | 4 | Webhook handling system tests |
| `app/system-tests/billing/billingLifecycle.system.test.js` | 5 | Full lifecycle system tests |
| `app/system-tests/billing/billingPortal.system.test.js` | 6 | Portal session system tests |
| `app/system-tests/billing/billingRecovery.system.test.js` | 6 | Subscription recovery system tests |

## Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `web/public/widgets/auth-status.js` | 1 | Token count links to usage page, remove temp refresh button |
| `app/services/tokenEnforcement.js` | 1 | Record consumption events |
| `app/functions/account/bundleGet.js` | 1 | Return token consumption events |
| `package.json` | 2 | Add `stripe` dependency |
| `infra/.../DataStack.java` | 2 | Add subscriptions table |
| `infra/.../SubmitSharedNames.java` | 2 | Billing Lambda configuration |
| `app/functions/account/bundlePost.js` | 4 | Accept Stripe fields on bundle grant |
| `app/data/dynamoDbBundleRepository.js` | 4 | Store Stripe subscription fields |
| `web/public/bundles.html` | 7 | Subscribe button, checkout result handling, manage subscription |
| `web/public/submit.catalogue.toml` | 7, 10 | `on-subscription` allocation, listedInEnvironments |
| `.pa11yci.*.json` | 1, 8 | Add new frontend paths |
| `web/public/faqs.toml` | 8 | Payment FAQs |
| `web/public/guide.html` | 8 | Subscription guide section |
| `web/public/about.html` | 8 | Resident Pro benefit card |
| `web/public/accessibility.html` | 8 | Update tested pages list |
| `behaviour-tests/compliance.behaviour.test.js` | 8 | Payment content checks |
| `infra/.../ObservabilityStack.java` | 9 | Billing metrics dashboard row |
| `scripts/generate-compliance-report.js` | 8 | Include new paths in report |

## Implementation Progress

| Item | Status | Notes |
|------|--------|-------|
| `PLAN_STRIPE_1.md` | **COMPLETE** | Stripe Payment Links for spreadsheets donations (archived) |
| **Phase 1: Token Usage Page** | **COMPLETE** | Deployed on `eventandpayment` branch — 2026-02-11 |
| `web/public/usage.html` | Done | Token sources + consumption tables, reload button |
| `app/data/dynamoDbBundleRepository.js` — `recordTokenEvent` | Done | DynamoDB `list_append` for token consumption events |
| `app/services/tokenEnforcement.js` — consumption recording | Done | Records `{ activity, timestamp, tokensUsed }` after `consumeToken()` |
| `web/public/widgets/auth-status.js` — usage link | Done | Token count wraps in `<a href="/usage.html">` |
| `.pa11yci.*.json` — `/usage.html` | Done | Added to proxy, ci, prod configs |
| Unit tests | Done | `tokenEvent.test.js`, `tokenEnforcement.consumption.test.js` |
| **Phase 2: Stripe SDK & Infrastructure** | **COMPLETE** | Deployed on `eventandpayment` branch — 2026-02-11 |
| `package.json` — `stripe` dependency | Done | `"stripe": "^17.x.x"` |
| `scripts/stripe-setup.js` | Done | Idempotent: product, price, webhooks, find-or-create |
| `scripts/stripe-setup-secrets.sh` | Done | Stores secrets in AWS Secrets Manager |
| `app/lib/stripeClient.js` | Done | Lazy Stripe SDK init from Secrets Manager or env var |
| `app/test-support/stripeSimulator.js` | Done | Mock Stripe API: checkout, subscriptions, portal |
| `app/functions/billing/billingCheckoutPost.js` | Done | Real implementation (Phase 3 work pulled forward) |
| `app/functions/billing/billingPortalGet.js` | Done | Placeholder (501 Not Implemented) |
| `app/functions/billing/billingRecoverPost.js` | Done | Placeholder (501 Not Implemented) |
| `app/functions/billing/billingWebhookPost.js` | Done | Real implementation: signature verify, event routing, checkout→bundle grant |
| `app/data/dynamoDbSubscriptionRepository.js` | Done | CRUD for subscriptions table |
| CDK: `DataStack.java` — subscriptions table | Done | `{env}-submit-subscriptions`, PITR enabled |
| CDK: `BillingStack.java` | Done | 4 ApiLambda constructs, `ingestReservedConcurrency(1)` |
| CDK: `SubmitSharedNames.java` — billing names | Done | All billing Lambda name fields |
| CDK: `SubmitApplication.java` — BillingStack wiring | Done | BillingStack added, lambdaFunctionProps wired to ApiStack |
| Express server routes | Done | 4 billing endpoints registered in `server.js` |
| `.env.test` — billing env vars | Done | `STRIPE_*`, `SUBSCRIPTIONS_DYNAMODB_TABLE_NAME` |
| System tests | Done | `billingInfrastructure.system.test.js` |
| Maven `./mvnw clean verify` | Done | BUILD SUCCESS |
| All unit tests pass (767 tests) | Done | |
| **Phase 3: Checkout Session API** | **DEPLOYED** | All CDK wiring, Lambda code, and tests done — deployed to CI 2026-02-13 |
| `app/functions/billing/billingCheckoutPost.js` | Done | Real implementation: JWT decode, hashSub, Stripe Checkout Session create, activity event |
| `app/unit-tests/functions/billingCheckoutPost.test.js` | Done | 200 success, correct Stripe params (metadata, hashedSub, line_items, URLs), 401/500 errors, price ID fallback |
| `app/system-tests/billingInfrastructure.system.test.js` | Done | Updated: expects 401 (auth required) instead of 501 (placeholder) |
| `app/system-tests/billingCheckout.system.test.js` | Done | Handler tested against Stripe simulator: 200 with checkout URL, 401 without auth |
| CDK: `BillingStack.java` — Stripe env vars | Done | `STRIPE_SECRET_KEY_ARN`, `STRIPE_PRICE_ID`, `STRIPE_TEST_PRICE_ID`, `DIY_SUBMIT_BASE_URL` (conditionally set when non-blank) |
| CDK: `BillingStack.java` — IAM policy | Done | `secretsmanager:GetSecretValue` on Stripe secret ARN (with wildcard suffix) |
| CDK: `BillingStackProps` — new props | Done | `stripeSecretKeyArn()`, `stripePriceId()`, `stripeTestPriceId()`, `baseUrl()` with @Value.Default |
| CDK: `SubmitApplication.java` — wire Stripe props | Done | `envOr()` resolution + pass to BillingStack builder |
| `.env.ci` — `STRIPE_SECRET_KEY_ARN` | Done | Points to `ci/submit/stripe/test_secret_key` (test key for CI) |
| `.env.prod` — `STRIPE_SECRET_KEY_ARN` | Done | Points to `prod/submit/stripe/secret_key` (live key for prod) |
| `deploy-environment.yml` — Stripe secrets | Done | Creates `{env}/submit/stripe/secret_key` + `{env}/submit/stripe/test_secret_key` from GitHub Secrets |
| All unit tests pass (812 tests) | Done | |
| Maven `./mvnw clean verify` | Done | BUILD SUCCESS |
| **Phase 3: Checkout Session API** | **DEPLOYED** | Deployed to CI and validated — 2026-02-13 |
| Phase 3.4 — Behaviour test: skeletal checkout flow | Done | `paymentBehaviour` covers checkout button, Stripe redirect, success/cancel |
| Commit, push, deploy to CI | Done | Feature branch `eventandpayment` |
| **Phase 4: Webhook Handler & Bundle Grant** | **DEPLOYED** | Deployed to CI and validated — 2026-02-13 |
| `app/functions/billing/billingWebhookPost.js` | Done | Signature verification, event routing, handleCheckoutComplete with bundle grant |
| `app/data/dynamoDbBundleRepository.js` — `putBundleByHashedSub` | Done | Store bundle using hashedSub directly (webhook metadata) |
| `app/unit-tests/functions/billingWebhookPost.test.js` | Done | 12 tests: signature validation, checkout→bundle, fallbacks, error handling, lifecycle stubs |
| `app/system-tests/billingInfrastructure.system.test.js` | Done | Updated: webhook returns 400 without signature |
| All unit tests pass (831 tests) | Done | |
| **Phase 11: Payment Funnel Behaviour Test** | **DEPLOYED** | Behaviour test for full checkout flow — 2026-02-12 |
| `behaviour-tests/payment.behaviour.test.js` | Done | Tests checkout button, Stripe redirect, success/cancel flows |
| **Test Cleanup: Phases A-E** | **DEPLOYED** | Remove test bundle, use Day Guest with testPass — 2026-02-13 |
| Phase A — Telegram env var refactor | Done | `00f4f3b8` — Replace TELEGRAM_CHAT_IDS JSON blob with individual channel env vars |
| Phase B — testPass field on passes | Done | `c8e2217f` — Add testPass field to passes and sandbox qualifier on bundle grant |
| Phase C+D — Remove test bundle | Done | `83790b1c` — Remove test bundle, sandbox activities, add frontend sandbox routing |
| Phase E — Update all behaviour tests | Done | `280ac4cb` — All 11 behaviour tests use Day Guest with testPass |
| **Bug fixes during deployment validation** | **DEPLOYED** | CI-validated — 2026-02-13 |
| `web/public/bundles.html` — capacity bypass | Done | `714fca89` — Bypass capacity check when valid pass exists (`!capacityAvailable && !passCode`) |
| `behaviour-tests/postVatReturn.behaviour.test.js` — token refresh | Done | `96cc401a` — Re-grant bundle via pass when tokens run low (prevents 16-min hang) |
| **CI Validation** | **PASSED** | All simulator tests + CI synthetic tests green — 2026-02-13 |
| Test workflow `21972360703` (simulator) | Done | All tests pass including postVatReturn, passRedemption, tokenEnforcement |
| Deploy workflow `21972063355` (CI deployment) | Done | All stacks deployed, all CI synthetic tests pass |
| **Phase 4: Next steps** | **Pending** | |
| Phase 4.5 — System tests against simulator + dynalite | Not started | `billingWebhook.system.test.js` |
| Phase 4.6 — Behaviour test: checkout-to-bundle flow | Not started | Extend `billingCheckout.behaviour.test.js` |
| **Phases 5-10** | **Not started** | |

---

## Human Actions Required Before Phase 3

Phase 3 (Checkout Session API) requires a real Stripe account with resources created and secrets stored. **All steps completed 2026-02-11.**

### 1. Run `stripe-setup.js` — DONE (both modes)

```bash
# Test mode — creates test-mode resources
STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js

# Live mode — creates live-mode resources
STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.js
```

**Test mode resources created:**
- Product: `prod_TxfDUtfzb0ynWb` (Resident Pro)
- Monthly Price: `price_1Szjt0FdFHdRoTOjHDXcuuq8` (GBP 9.99/month)
- CI Webhook: `we_1Szjt0FdFHdRoTOjHvWLYhhM`
- Prod Webhook: `we_1Szjt1FdFHdRoTOj4UFdpLCG`

**Live mode resources created:**
- Product: `prod_TxfkksBPOdFYiN` (Resident Pro)
- Monthly Price: `price_1SzkPBCD0Ld2ukzIqbEweRSk` (GBP 9.99/month)
- CI Webhook: `we_1SzkPBCD0Ld2ukzIZSPYj21C`
- Prod Webhook: `we_1SzkPCCD0Ld2ukzIRQuQyccg`

### 2. GitHub Actions Secrets and Variables — DONE

Secrets and variables flow: GitHub Actions → `deploy-environment.yml` → AWS Secrets Manager → Lambda env vars. **No direct AWS writes.**

#### Dual-key pattern (mirrors HMRC live/sandbox)

Both test and live Stripe keys are available at runtime. Synthetic tests and test-users use test keys (no real charges). Real customers use live keys. Selection is based on actor classification (same as HMRC `hmrcAccount` header pattern).

**GitHub Actions Secrets** (sensitive — API credentials and signing keys):

| Secret | Scope | Purpose |
|--------|-------|---------|
| `STRIPE_SECRET_KEY` | Repo | Live Stripe API key (real charges) |
| `STRIPE_TEST_SECRET_KEY` | Repo | Test Stripe API key (no charges) |
| `STRIPE_WEBHOOK_SECRET` | Environment (ci/prod) | Live webhook signing secret (per-environment) |
| `STRIPE_TEST_WEBHOOK_SECRET` | Repo | Test webhook signing secret |

**GitHub Actions Variables** (non-sensitive — public Stripe identifiers):

| Variable | Scope | Value | Purpose |
|----------|-------|-------|---------|
| `STRIPE_PRICE_ID` | Repo | `price_1SzkPBCD0Ld2ukzIqbEweRSk` | Live monthly price ID |
| `STRIPE_TEST_PRICE_ID` | Repo | `price_1Szjt0FdFHdRoTOjHDXcuuq8` | Test monthly price ID |

### 3. Verify Webhook Endpoint Reachable

After the BillingStack deploys to CI, verify the webhook endpoint is reachable from Stripe:
- [ ] Go to Stripe Dashboard → Developers → Webhooks
- [ ] Check that the CI webhook shows a green status
- [ ] Send a test event from Stripe to verify the Lambda receives it

---

## Payment Configuration as Code (All Sites)

### Overview

All payment provider resources across all DIY Accounting sites are managed as code in `scripts/`. Each script is idempotent (safe to re-run), environment-aware, and prints the IDs needed for secret storage.

| Command | Site | Provider | What it creates |
|---------|------|----------|-----------------|
| `node scripts/stripe-setup.js --site submit` | submit | Stripe | Product, monthly price, CI+prod webhooks, portal config |
| `node scripts/stripe-setup.js --site spreadsheets` | spreadsheets | Stripe | Product, 4 Payment Links (£10/£20/£45/custom), return URLs |
| `node scripts/paypal-setup.js --site spreadsheets` | spreadsheets | PayPal | Verify button exists, print config, document manual steps |
| `scripts/payment-secrets.sh <env>` | all | all | Store all payment secrets in AWS Secrets Manager + gh secrets |

### Stripe Setup: Submit Subscriptions

```bash
# Test mode
STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js --site submit

# Live mode
STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.js --site submit --live
```

Creates:
- Product: "Resident Pro" (`metadata.site=submit, metadata.bundleId=resident-pro`)
- Monthly Price: GBP 9.99/month
- Webhook endpoints for CI and prod
- Customer Portal configuration

### Stripe Setup: Spreadsheets Donations

```bash
# Test mode
STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js --site spreadsheets

# Live mode
STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.js --site spreadsheets --live
```

Creates:
- Product: "Spreadsheet Donation" (`metadata.site=spreadsheets, metadata.type=donation`)
- 4 Payment Links: £10, £20, £45, customer-chooses-amount
  - Success URL: `https://spreadsheets.diyaccounting.co.uk/download.html?stripe=success`
- Prints the Payment Link URLs to embed in `donate.html`

> **Note**: Stripe Payment Links can be created via the API (`stripe.paymentLinks.create()`). The existing links in `donate.html` were created manually via the Dashboard — this script will find them by metadata or create new ones.

### PayPal Setup: Spreadsheets Donations

```bash
# Verify existing config
PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... node scripts/paypal-setup.js --site spreadsheets

# Live mode
PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... node scripts/paypal-setup.js --site spreadsheets --live
```

PayPal's hosted "Donate" buttons use a legacy API that doesn't support full programmatic creation. This script:
- Verifies the existing hosted button ID (`XTEQ73HM52QQW`) is still active via PayPal REST API
- Prints the current button configuration
- Documents the manual steps if a new button is needed
- Optionally sets up webhook URL for donation event notifications (for Phase 4 of `PLAN_WHATSAPP_ALERTING.md`)

> **Limitation**: PayPal "Donate" buttons are best created in the PayPal Dashboard. The script verifies and documents rather than creates. If full API creation is needed later, PayPal's Orders API v2 could replace the hosted button with a server-side integration.

### Payment Secrets: All Sites

All secrets are stored in **GitHub Actions Secrets/Variables only**. The `deploy-environment.yml` workflow propagates them to AWS Secrets Manager during deployment. **Never write directly to AWS Secrets Manager.**

**GitHub Actions Secrets** (sensitive — API credentials):

| Secret | Scope | Purpose |
|--------|-------|---------|
| `STRIPE_SECRET_KEY` | Repo | Live Stripe API key |
| `STRIPE_TEST_SECRET_KEY` | Repo | Test Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Environment (ci/prod) | Live webhook signing secret |
| `STRIPE_TEST_WEBHOOK_SECRET` | Repo | Test webhook signing secret |
| `PAYPAL_CLIENT_ID` | Repo | PayPal REST API client ID (Phase 4 — donation webhooks) |
| `PAYPAL_CLIENT_SECRET` | Repo | PayPal REST API client secret (Phase 4 — donation webhooks) |

**GitHub Actions Variables** (non-sensitive — public identifiers):

| Variable | Scope | Purpose |
|----------|-------|---------|
| `STRIPE_PRICE_ID` | Repo | Live monthly price ID |
| `STRIPE_TEST_PRICE_ID` | Repo | Test monthly price ID |
| `TELEGRAM_CHAT_IDS` | Repo | JSON map of Telegram group chat IDs |

### Config-in-Repository, Secrets-in-Vault

| What | Where | Why |
|------|-------|-----|
| Product names, prices, currencies | `scripts/stripe-setup.js` | Reviewable, version-controlled |
| Webhook URLs, event types | `scripts/stripe-setup.js` | Tied to deployment topology |
| Payment Link amounts, return URLs | `scripts/stripe-setup.js` | Tied to site configuration |
| PayPal button config | `scripts/paypal-setup.js` | Documentation + verification |
| API keys, webhook signing secrets | GitHub Actions Secrets | Propagated to AWS via `deploy-environment.yml` |
| Public identifiers (price IDs, chat IDs) | GitHub Actions Variables | Non-sensitive, visible in logs |

---

**Next step**: Phase 11 — Payment Funnel Behaviour Test (conversion funnel end-to-end).

---

## Phase 11: Payment Funnel Behaviour Test

**Goal**: A dedicated behaviour test that exercises the entire conversion funnel — the core business journey from free guest through token exhaustion to paid subscription and verified token usage.

**Why this test matters**: This is the entire point of the business. A user gets a free day-guest pass, uses their 3 tokens, finds activities disabled, navigates to bundles to upgrade, subscribes to resident-pro via Stripe, then verifies they can use activities again and that the token usage page accurately reflects their transactions.

### 11.1 Test Flow (verbatim user specification)

The `paymentBehaviour` test:

1. **Get day-guest via generated pass** — Create a day-guest pass via admin API, redeem it, verify bundle allocated with 3 tokens
2. **Drain the 3 tokens** — Use tokens (1 via VAT submission if possible, remainder via direct DynamoDB `consumeToken` calls)
3. **Verify activities are disabled** — Navigate to home page, verify activity buttons show "Insufficient tokens" and are disabled
4. **Verify button redirects to bundles page** — The disabled activity button or upsell prompt links to `/bundles.html` for upgrade
5. **Navigate to bundles page** — See the day-guest bundle with 0 tokens, see the resident-pro bundle available
6. **Get resident-pro via generated pass** — Create a resident-pro pass via admin API, redeem it, verify resident-pro bundle allocated with 100 tokens
7. **Use a token for a submission** — Navigate home, start a VAT submission, verify token consumed (99 remaining)
8. **Check the token usage page** — Navigate to `/usage.html`, verify the token sources table shows resident-pro with correct token count, verify the token consumption table shows the actual transactions matching real usage

### 11.2 Behaviour Test File

- [ ] Create `behaviour-tests/payment.behaviour.test.js`
  - Follow existing patterns from `tokenEnforcement.behaviour.test.js` and `passRedemption.behaviour.test.js`
  - Use `test.step()` for each numbered step above
  - 600s timeout (10 minutes — involves VAT submission + multiple API calls)
  - Extract `userSub` for direct DynamoDB token exhaustion
  - Use `ensureBundleViaPassApi()` from `behaviour-bundle-steps.js` for both day-guest and resident-pro
  - Use `consumeToken()` from `dynamoDbBundleRepository.js` for fast token exhaustion
  - Use `getTokensRemaining()` from `behaviour-bundle-steps.js` for token count verification
  - Steps that require DynamoDB access (direct token exhaustion) skip gracefully when `BUNDLE_DYNAMODB_TABLE_NAME` is not set

### 11.3 Playwright Configuration

- [ ] Add `paymentBehaviour` project to `playwright.config.js`:
  ```javascript
  {
    name: "paymentBehaviour",
    testDir: "behaviour-tests",
    testMatch: ["**/payment.behaviour.test.js"],
    workers: 1,
    outputDir: "./target/behaviour-test-results/",
    timeout: 600_000,  // 10 minutes (involves HMRC submission + multiple steps)
  }
  ```

### 11.4 npm Scripts

- [ ] Add to `package.json`:
  ```
  "test:paymentBehaviour": "playwright test --project=paymentBehaviour",
  "test:paymentBehaviour-simulator": "npx dotenv -e .env.simulator -- npm run test:paymentBehaviour",
  "test:paymentBehaviour-proxy": "npx dotenv -e .env.proxy -- npm run test:paymentBehaviour",
  "test:paymentBehaviour-ci": "npx dotenv -e .env.ci -- npm run test:paymentBehaviour",
  "test:paymentBehaviour-prod": "npx dotenv -e .env.prod -- npm run test:paymentBehaviour",
  ```

### 11.5 CI: Simulator Test in test.yml

- [ ] Add `behaviour-test-simulator-payment` job to `.github/workflows/test.yml`:
  - Same structure as `behaviour-test-simulator-token-enforcement`
  - Runs `npm run test:paymentBehaviour-simulator`
  - Uploads artefacts (screenshots, videos, test context)
  - Runs in Playwright container

### 11.6 CI: Synthetic Test in deploy.yml

- [ ] Add `web-test-payment` job to `.github/workflows/deploy.yml`:
  - Same structure as `web-test-token-enforcement`
  - Uses `./.github/workflows/synthetic-test.yml` with `behaviour-test-suite: 'paymentBehaviour'`
  - Depends on: `enable-native-auth`, `web-test`, stack deployments
  - Add to `disable-native-auth` needs list

### 11.7 Synthetic Test Options

- [ ] Add `'paymentBehaviour'` to the `behaviour-test-suite` choice list in `.github/workflows/synthetic-test.yml`
- [ ] Add `paymentBehaviour` to `allBehaviour` testMatch in `playwright.config.js`

### 11.8 Feature Uplift Assessment

Before this test can pass, the following features must work:

| Feature | Current State | Required State | Gap |
|---------|--------------|----------------|-----|
| Day-guest pass creation | Working (admin API) | Working | None |
| Day-guest bundle allocation | Working (on-pass via pass API) | Working | None |
| Day-guest tokens (3) | Working | Working | None |
| Token exhaustion via DynamoDB | Working (consumeToken) | Working | None |
| Activity disabled when tokens=0 | Working ("Insufficient tokens") | Working | None |
| Upsell link to bundles page | Partially — `display: "always-with-upsell"` exists in catalogue | Must show "View Bundles" link when tokens exhausted | **Small gap**: verify upsell link renders correctly |
| Resident-pro pass creation | Working (admin API) | Working | None |
| Resident-pro bundle allocation | Working (on-pass via pass API) | Working | None |
| Resident-pro tokens (100) | Working | Working | None |
| VAT submission consumes token | Working | Working | None |
| Token usage page (`/usage.html`) | Working (Phase 1) | Working | None |
| Token consumption events on usage page | Working (Phase 1) | Working | None |

**Verdict**: The app is **already capable of passing this test** in simulator mode. The pass-based allocation path works for both day-guest and resident-pro. The only potential gap is verifying the "View Bundles" upsell link renders when tokens are exhausted — this is a minor UI check that existing tests already partially cover (tokenEnforcement test step 7 verifies the disabled button).

The Stripe checkout path (Phase 7: bundles.html "Subscribe" button → Stripe Checkout → webhook → bundle grant) is a separate flow that requires the bundles.html frontend integration. This Phase 11 test uses the **pass-based** allocation path which is already fully functional, exercising the same conversion funnel journey.

### 11.9 Future: `on-subscription-with-pass` allocation mode

Currently `resident-pro` uses `allocation = "on-pass"`. For production launch, we need `allocation = "on-subscription-with-pass"` — a new allocation mode where the bundle is:
- **Visible** on the bundles page (not hidden)
- **Grantable via pass** (for testing, comps, beta testers)
- **Grantable via Stripe subscription** (for paying customers via webhook)

This lets resident-pro be live on the site while gating access via either passes (admin-controlled) or subscriptions (self-serve payment). The catalogue change is:
```toml
allocation = "on-subscription-with-pass"  # accepts both pass and subscription grants
```
Implementation: extend `bundlePost.js` allocation logic to accept both pass-based and subscription-based grants for bundles with this allocation type.

### Validation

`npm run test:paymentBehaviour-simulator` passes locally. Simulator test runs in CI via `test.yml`. Synthetic test runs against deployed CI via `deploy.yml`. All 8 steps of the conversion funnel verified: pass → tokens → exhaustion → disabled → upgrade → new bundle → submission → usage page.

---

*Document refreshed: 2026-02-12. Phases 1-4 complete (webhook handler deployed). Phase 11 added (Payment Funnel Behaviour Test). 827 tests passing. Original proposal date: 2026-02-01.*
