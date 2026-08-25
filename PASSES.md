# Passes and Bundles System

This document explains how passes, bundles, and tokens work together in DIY Accounting Submit.

```
When you get all this stabilised again and you have run the behaviour tests that have been changed against the simulator, re-test submitVatBehaviours test the payment behaviour test in
  proxy mode, which would ideally be invoking the real stripe apis using the stripe tes
```

## Overview

The system uses a three-tier model:

1. **Passes** - Invitation codes (four-word passphrases) that unlock access to bundles
2. **Bundles** - Access tiers that grant tokens and enable HMRC API activities
3. **Tokens** - Consumable credits for metered activities (e.g. submitting a VAT return costs 1 token)

## How It Works

Bundles marked `enable = "always"` in the catalogue (currently `day-guest`) are self-service: an
authenticated user clicks "Request" on the bundles page and gets the bundle immediately, no pass
needed. The steps below cover bundles that are pass-gated (`enable = "on-pass"`).

1. An admin generates a pass via GitHub Actions (`generate-pass.yml`) or the pass admin API
2. The pass is a four-word code (e.g. `tiger-happy-mountain-silver`) with a URL and QR code
3. User visits the URL or enters the code on the bundles page
4. The pass is validated (not expired, not exhausted, email matches if restricted)
5. The bundle card appears in the catalogue (even if normally hidden) — user clicks "Request" to add it
6. The bundle provides tokens for metered activities

## Pass Types

Defined in `submit.passes.toml`. Each pass type is a template with defaults.

| Pass Type | Bundle Granted | Max Uses | Validity | Email Required | Payment |
|-----------|---------------|----------|----------|---------------|---------|
| `day-guest-test-pass` | day-guest | 1 | 1 day | No | Free (admin, sandbox) |
| `invited-guest` | invited-guest | 1 | 1 month | Yes | Free (admin) |
| `resident-guest` | resident-guest | 1 | Unlimited | Yes | Free (admin) |
| `resident-pro-comp` | resident-pro-comp | 1 | 1 year | Yes | Free (admin) |
| `resident-pro-test-pass` | resident-pro | 1 | 1 day | No | Free (admin, sandbox) |
| `resident-pro-pass` | resident-pro | 1 | 1 day | No | Free (admin, production) |
| `campaign` | invited-guest | 1 | 3 days | No | 10 tokens (user-issued, Phase 6) |
| `digital-pass` | day-guest | 100 | 7 days | No | 10 tokens (user-issued, Phase 6) |
| `physical-pass` | day-guest | 10 | Unlimited | No | 10 tokens (user-issued, Phase 6) |

### Test vs production pass types

Pass types ending in `-test-pass` have `test = true` in `submit.passes.toml`. This sets `testPass: true` on the pass record, which routes HMRC API calls to the sandbox. Use these for automated tests and CI. Use the non-test variants (e.g. `day-guest-pass`) for real users with production HMRC access.

### When is payment required?

- **Admin-issued passes** (day-guest-test-pass, day-guest-pass, invited-guest, resident-guest, resident-pro-comp, resident-pro-test-pass, resident-pro-pass): **No payment** - created by admins via GitHub Actions workflow
- **User-issued passes** (campaign, digital-pass, physical-pass): **10 tokens** from the issuing user's bundle (Phase 6, not yet implemented)
- **Subscription** (resident-pro): Pass gates visibility, Stripe Checkout creates subscription, webhook grants bundle. Includes renewal token refresh, cancellation, and Customer Portal management.

## Bundles

Defined in `web/public/submit.catalogue.toml`. Each bundle is an access tier.

| Bundle | Level | Tokens | Refresh | Timeout | Allocation | Unlocked By |
|--------|-------|--------|---------|---------|------------|-------------|
| `default` | - | - | - | - | Automatic | All authenticated users |
| `day-guest` | Guest | 3 | None | 1 day | On-Request | None — self-service (`enable = "always"`); day-guest-test-pass, digital-pass, physical-pass optional |
| `invited-guest` | Guest | 3 | Monthly | 1 month | On-Email-Match | invited-guest, campaign |
| `resident-guest` | Guest | 3 | Monthly | Unlimited | On-Email-Match | resident-guest |
| `resident-pro-comp` | Pro | 100 | Monthly | Unlimited | On-Email-Match | resident-pro-comp |
| `resident-pro` | Pro | 100 | Monthly | - | On-Pass-On-Subscription | resident-pro-test-pass, resident-pro-pass, Stripe subscription |

### Key bundle concepts

- **Tokens**: Credits consumed by metered activities. Only VAT submission costs tokens (1 per submission). Viewing obligations and returns is free.
- **Token refresh**: Bundles with `tokenRefreshInterval` replenish tokens periodically (lazy evaluation on API call).
- **Timeout**: How long the bundle stays active after allocation. `day-guest` expires after 1 day; `resident-guest` never expires.
- **Capacity cap**: `day-guest` has a global cap of 100 limiting concurrent allocations across all users.

## Activities

Activities define what users can do and which bundles they need.

| Activity | Token Cost | Bundles Required | Display |
|----------|-----------|-----------------|---------|
| Submit VAT | 1 | day-guest, invited-guest, resident-guest, resident-pro-comp, resident-pro | Always (with upsell) |
| VAT Obligations | 0 (free) | day-guest, invited-guest, resident-guest, resident-pro-comp, resident-pro | Always (with upsell) |
| View VAT Return | 0 (free) | day-guest, invited-guest, resident-guest, resident-pro-comp, resident-pro | Always (with upsell) |
| View Receipts | 0 (free) | default | On-Entitlement |
| Generate Digital Pass | 10 | resident-pro-comp, resident-pro | On-Entitlement |
| Generate Physical Pass | 10 | resident-pro-comp, resident-pro | On-Entitlement |
| Help | 0 (free) | default | Always |

## Generating Passes

### Via GitHub Actions (recommended)

The `generate-pass.yml` workflow creates passes and stores them in DynamoDB.

**Manual dispatch**: Go to Actions > Generate Pass > Run workflow, then select:
- **pass-type**: Which template to use (from the table above)
- **environment**: `ci` (testing) or `prod` (production)
- **email**: Required for email-restricted pass types
- **quantity**: How many passes to generate (default 1)
- **generate-hmrc-user**: Creates an HMRC sandbox test user for end-to-end testing
- **generate-cognito-user**: Creates a Cognito native login user for debugging

**Automatic triggers**:
- Daily at 09:00 UTC: Generates a `day-guest-test-pass` pass for CI
- On push to `submit.passes.toml` or related files: Generates a test pass

**Output**: The workflow produces:
- Pass codes and URLs in the GitHub Actions step summary
- QR code PNGs and annotated SVGs as downloadable artifacts (30-day retention)
- HMRC sandbox credentials (if requested)

### Via API

`POST /api/v1/pass/admin` - Admin endpoint for programmatic pass creation.

## Pass Redemption Flow

1. User receives pass URL: `https://submit.diyaccounting.co.uk/bundles.html?pass=tiger-happy-mountain-silver`
2. If not logged in, redirected to login, then back to pass URL
3. Pass validation checks: not revoked, not expired, uses remaining, email matches
4. Bundle card appears in catalogue (even if normally hidden) — user clicks "Request" to add it
5. Pass `useCount` atomically incremented
6. Bundle granted to user with tokens

### Validation failure reasons

| Code | Meaning |
|------|---------|
| `valid` | Pass redeemed successfully |
| `not_found` | Pass code doesn't exist |
| `revoked` | Pass was revoked by admin |
| `expired` | Pass validity window has passed |
| `exhausted` | All uses consumed (useCount >= maxUses) |
| `wrong_email` | User's email doesn't match restriction |
| `email_required` | Pass requires email but none available |

## Using a pass with `npm start` (simulator)

The simulator environment runs entirely locally with dynalite, a mock OAuth server, and HMRC sandbox simulator. The pass admin API is available at `/api/v1/pass/admin`.

### Day Guest example

```bash
# 1. Start the simulator
#npm start

# 2. Create a day-guest pass
PASS_CODE=$(curl -s -X POST http://localhost:3000/api/v1/pass/admin \
  -H "Content-Type: application/json" \
  -d '{
    "passTypeId": "day-guest-test-pass",
    "bundleId": "day-guest",
    "validityPeriod": "P1D",
    "maxUses": 1,
    "createdBy": "manual"
  }' | jq '.code' --raw-output) \
&& echo "Generated pass code: $PASS_CODE" \
&& open "http://localhost:3000/bundles.html?pass=$PASS_CODE" \
;
# Returns: {"code":"tiger-happy-mountain-silver", "bundleId":"day-guest", ...}

# 3. Open the bundles page with the pass code
#open "http://localhost:3000/bundles.html?pass=tiger-happy-mountain-silver"
```

Or log in first, then enter the code manually in the pass input field.

The flow: enter code → "Redeem Pass" → pass validated → "Request Day Guest" button appears → click it → bundle granted.

### Resident Pro example

```bash
# Create a resident-pro pass
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
&& open "http://localhost:3000/bundles.html?pass=$PASS_CODE" \
;

# Open with the returned code
#open "http://localhost:3000/bundles.html?pass=<returned-code>"
```

The flow is the same: enter code → validate → "Request Resident Pro" button appears → click → bundle granted with 100 tokens.

### Notes

- The simulator uses `testPass: true` passes which route to the HMRC sandbox
- Passes are stored in local dynalite (port 9001), not real DynamoDB
- Mock OAuth means no real login — the simulator auto-authenticates
- Pass codes are four random words (e.g. `tiger-happy-mountain-silver`)

## Architecture

### Configuration files

| File | Purpose |
|------|---------|
| `submit.passes.toml` | Pass type templates (defaults for generation) |
| `web/public/submit.catalogue.toml` | Bundle and activity definitions (runtime catalogue) |

### Key source files

| File | Purpose |
|------|---------|
| `app/services/passService.js` | Pass creation, validation, redemption |
| `app/services/productCatalog.js` | Parse catalogue TOML, filter bundles/activities |
| `app/services/tokenEnforcement.js` | Token consumption and enforcement |
| `app/functions/account/passPost.js` | POST /api/v1/pass (user pass redemption) |
| `app/functions/account/passAdminPost.js` | POST /api/v1/pass/admin (admin pass creation) |
| `app/functions/account/bundlePost.js` | POST /api/v1/bundle (grant bundle) |
| `app/functions/account/bundleGet.js` | GET /api/v1/bundle (list user bundles with capacity) |
| `app/data/dynamoDbPassRepository.js` | Pass CRUD with atomic useCount increment |
| `app/data/dynamoDbBundleRepository.js` | Bundle CRUD and token tracking |
| `app/lib/passphrase.js` | Four-word passphrase generation |
| `app/lib/emailHash.js` | Deterministic HMAC-SHA256 email hashing |
| `app/lib/qrCodeGenerator.js` | QR code generation (PNG, SVG, annotated) |
| `scripts/generate-pass-with-qr.js` | CLI script for pass generation with QR codes |

### DynamoDB tables

| Table | Purpose |
|-------|---------|
| `{env}-env-passes` | Pass records (four-word code, bundleId, maxUses, useCount, validity) |
| `{env}-env-bundles` | User bundle allocations and token tracking |

### Workflow

| Workflow | Purpose |
|----------|---------|
| `.github/workflows/generate-pass.yml` | Generate passes via GitHub Actions |

## Current Status (Public Beta)

- `day-guest` is self-service (`enable = "always"`) with a global capacity cap of 100
- `resident-pro` requires a pass then subscription (`allocation = "on-pass-on-subscription"`)
- All pass generation is admin-only via GitHub Actions
- User-issued passes (campaign, digital, physical) are defined but Phase 6 is deferred

### Subscription status

**Implemented (Phases 1-5, 7):**
- Token usage page (`/usage.html`)
- Stripe SDK integration (`scripts/stripe-setup.js`)
- BillingStack CDK infrastructure (checkout, portal, webhook, recover Lambdas)
- `billingCheckoutPost.js` — creates Stripe Checkout sessions
- `billingWebhookPost.js` — handles `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- `billingPortalGet.js` — creates Stripe Customer Portal sessions for subscription management
- Subscription DynamoDB table and repository
- `on-pass-on-subscription` allocation mode — pass gates visibility, subscription grants access
- "Subscribe £9.99/mo" button on `bundles.html` for pass-holders
- "Manage Subscription" button for users with active subscriptions
- Checkout success/canceled URL handling on bundles page
- `invoice.paid` handler (token refresh on renewal)
- `customer.subscription.updated/deleted` handlers (status changes, cancellation)
- `invoice.payment_failed` handler (activity alert)
- Developer tools: sandbox bundle detection via `qualifiers.sandbox`

### To reach Public Beta

1. ~~Set `day-guest` `enable = "always"` and `cap = 10`~~ — Done (cap is 100)
2. ~~Remove `listedInEnvironments` restrictions~~ — Done
3. ~~Requires production HMRC credentials validated by a trial user~~ — Done (granted March 2026)

### To reach Launch

1. ~~Implement `on-pass-on-subscription` allocation for `resident-pro`~~ — Done
2. ~~Implement subscription lifecycle (renewal, cancellation, payment failure)~~ — Done
3. Enable user-issued passes (campaign, digital, physical) — Phase 6

## Human Behaviour Tests

The behaviour test suite exercises passes, bundles, tokens, and payment across both day-guest and resident-pro bundles. These tests constitute "The Human Test Journey" — the path a real user follows from first login through to subscription.

### The Human Test Journey

Implemented in `behaviour-tests/payment.behaviour.test.js`:

1. **Login** via Cognito (native in CI, Google in prod, mock in proxy/simulator)
2. **Redeem a test pass for day-guest** — gets 3 tokens (pass bypasses capacity cap)
3. **Use all 3 tokens** — submit VAT to sandbox HMRC (test pass → sandbox routing)
4. **See activities disabled** — "Insufficient tokens", upsell link to bundles page
5. **Redeem a test pass for resident-pro** — pass validation shows Subscribe button
6. **Pay via test Stripe** — checkout session uses test price ID, no real charges
7. **Submit VAT return** — goes to sandbox HMRC, consumes 1 resident-pro token
8. **Check token usage page** — `/usage.html` shows correct sources and consumption
9. **Verify Telegram alerts** — each step generates a message in the correct channel

### Payment across environments

| Environment | Stripe Behaviour | How it works |
|-------------|-----------------|--------------|
| **Simulator** | Auto-completes (fakes Stripe) | Mock billing endpoints in `mockBilling.js` redirect to `/simulator/checkout` which grants the bundle and redirects to `bundles.html?checkout=success` |
| **Proxy** | Real Stripe test mode | Express server calls Stripe test API; test fills in card `4242 4242 4242 4242` |
| **CI** | Real Stripe test mode | Deployed Lambda calls Stripe test API; test fills in test card |
| **Prod** | Stripe test when `testPass`, live otherwise | Bundle `qualifiers.sandbox` determines test vs live Stripe key |

### Behaviour test files

| Test file | Bundles tested | What it tests |
|-----------|---------------|---------------|
| `payment.behaviour.test.js` | day-guest (3 tokens), resident-pro (100 tokens) | Full conversion funnel: guest → exhaustion → checkout → submission → usage |
| `passRedemption.behaviour.test.js` | day-guest (direct grant), resident-pro (Subscribe button) | Pass create → validate → redeem → verify bundle granted, and subscription flow |
| `tokenEnforcement.behaviour.test.js` | day-guest (3 tokens → exhaust → disabled), resident-pro (100 tokens → consume 1 → verify 99) | Token consumption, exhaustion, activity disabling, different token limits |
| `generatePassActivity.behaviour.test.js` | resident-pro (100 tokens) | Generate digital/physical passes (requires resident-pro entitlement) |

### Running behaviour tests

```bash
# Simulator (local, fakes payment)
npm run test:paymentBehaviour-simulator

# Proxy (local + ngrok, real Stripe test)
npm run test:paymentBehaviour-proxy

# CI (deployed to AWS)
npm run test:paymentBehaviour-ci

# Production
npm run test:paymentBehaviour-prod
```

### Test pass routing

All behaviour tests use test passes (`testPass: true`), which set `qualifiers.sandbox = true` on the granted bundle. This drives:
- **HMRC**: Sandbox API (not live) — controlled by `sessionStorage.hmrcAccount`
- **Stripe**: Test mode (not live) — controlled by `STRIPE_TEST_PRICE_ID`
- **Telegram**: Test channel (not live) — controlled by actor classification
- **Developer tools**: Wrench icon appears (sandbox bundle detected)
