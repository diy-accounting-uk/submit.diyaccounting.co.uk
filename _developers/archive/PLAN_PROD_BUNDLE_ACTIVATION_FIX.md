<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Plan: Per-Environment Dual Webhook Secrets for Stripe

**Created**: 15 February 2026
**Status**: Implementation needed
**Related**: PLAN_PAYMENT_GOLIVE.md Phase 4 (Human Test in Prod with Test Passes)
**Branch**: TBD (new branch from `main`)

---

## Problem Statement

User (Antony) completed a test payment flow on prod (submit.diyaccounting.co.uk):
1. Had a day-guest bundle (from test pass) with 2 tokens remaining
2. Redeemed a resident-pro test pass
3. Clicked Subscribe, was directed to Stripe test checkout
4. Paid with test card, redirected back to `bundles.html?checkout=success`
5. Saw success banner: "Subscription activated! Your bundle has been added."
6. **But resident-pro bundle never appeared** — even after 3s auto-refresh and manual refresh

### User-provided correlation IDs
- Traceparent: `00-2a5776821e22a67c11382ee799a472c1-e974f499ed86ccef-01`
- Request ID: `1c691655-7689-4255-bfba-2fc6d14579c7`
- Actual checkout request ID (from logs): `5d2c271f-20fa-4d82-8122-ec7a27f7ffa6`

---

## Root Cause: Webhook Signature Verification Failure

**ALL Stripe webhook events to prod are failing signature verification.**

### Evidence from CloudWatch Logs

Lambda: `prod-71edf71-app-billing-webhook-post`
Time window: 19:23:31–19:23:34 UTC, 15 Feb 2026

| Time | Event Type | Event ID | Result |
|------|-----------|----------|--------|
| 19:23:32 | `checkout.session.completed` | `evt_1T1AulFdFHdRoTOjVA8VQ0Xc` | **FAILED** |
| 19:23:33 | `customer.subscription.created` | `evt_1T1AulFdFHdRoTOjLqRqbyRe` | **FAILED** |
| 19:23:33 | `customer.subscription.updated` | `evt_1T1AulFdFHdRoTOj4CXxBlv3` | **FAILED** |
| 19:23:34 | `invoice.payment_succeeded` | `evt_1T1AumFdFHdRoTOjPei9QyfY` | **FAILED** |

All four returned: `"No signatures found matching the expected signature for payload."`

### Why the bundle wasn't activated

The `?checkout=success` URL parameter triggers an optimistic success message on the frontend. But the actual bundle creation happens in the webhook handler (`putBundleByHashedSub`), which never executed. DynamoDB confirms no `resident-pro` bundle exists for Antony's hashedSub.

### Two interrelated problems

**Problem 1: Shared webhook secret across environments**
`deploy-environment.yml` stores a single GitHub Actions secret `STRIPE_WEBHOOK_SECRET` into both `ci/submit/stripe/webhook_secret` and `prod/submit/stripe/webhook_secret`. But Stripe assigns a unique signing secret per webhook endpoint URL. The CI endpoint (`ci-submit.diyaccounting.co.uk`) and prod endpoint (`submit.diyaccounting.co.uk`) have different signing secrets.

**Problem 2: No test-mode webhook secret for prod**
Stripe has separate test-mode and live-mode webhook endpoints, each with its own signing secret. Prod needs to handle both test-mode webhooks (from test passes, now) and live-mode webhooks (from real customers, Phase 7). Currently only one `STRIPE_WEBHOOK_SECRET_ARN` exists — no separation.

---

## Goal

Per-environment `STRIPE_WEBHOOK_SECRET_ARN` and `STRIPE_TEST_WEBHOOK_SECRET_ARN` with separate Stripe endpoints across all 3 environments (proxy, CI, prod). This enables:

- **Now (Phase 4)**: Test payments work in prod via test-mode webhook secret
- **Future (Phase 7)**: Live payments work in prod via live-mode webhook secret, coexisting with test passes
- **Always**: CI webhook verification works with the correct per-endpoint secret

---

## Current State

### Stripe Webhook Endpoints (created by `scripts/stripe-setup.js`)

The script creates 3 endpoints when run with `sk_test_...`:

| Environment | URL | Mode | Signing Secret |
|-------------|-----|------|----------------|
| Proxy | `https://wanted-finally-anteater.ngrok-free.app/api/v1/billing/webhook` | Test | `whsec_FqELpW...` (in `.env`) |
| CI | `https://ci-submit.diyaccounting.co.uk/api/v1/billing/webhook` | Test | Unknown (Stripe Dashboard) |
| Prod | `https://submit.diyaccounting.co.uk/api/v1/billing/webhook` | Test | Unknown (Stripe Dashboard) |

When run with `sk_live_...`, it would create the same 3 URLs as live-mode endpoints (different signing secrets).

### Secrets Manager (current)

| Secret Path | Source | Used By |
|-------------|--------|---------|
| `ci/submit/stripe/webhook_secret` | `${{ secrets.STRIPE_WEBHOOK_SECRET }}` | CI webhook Lambda |
| `prod/submit/stripe/webhook_secret` | `${{ secrets.STRIPE_WEBHOOK_SECRET }}` | Prod webhook Lambda |

Both populated from the **same** GitHub Actions secret — which can only match ONE endpoint.

### Lambda Environment Variables (current)

The webhook Lambda has:
```
STRIPE_WEBHOOK_SECRET_ARN  → {env}/submit/stripe/webhook_secret
STRIPE_SECRET_KEY_ARN      → {env}/submit/stripe/secret_key
STRIPE_TEST_SECRET_KEY_ARN → {env}/submit/stripe/test_secret_key
```

Note: There is no `STRIPE_TEST_WEBHOOK_SECRET_ARN`.

### Code (`billingWebhookPost.js` — `resolveWebhookSecret()`)

```javascript
async function resolveWebhookSecret() {
  // 1. Direct env var (non-ARN) → local dev
  // 2. ARN (STRIPE_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET_ARN) → Secrets Manager
  // 3. STRIPE_TEST_WEBHOOK_SECRET fallback
}
```

Uses a single cached secret. Cannot distinguish test vs live mode.

### CDK (`BillingStack.java`)

Has `stripeWebhookSecretArn` property (singular). Passes to Lambda as `STRIPE_WEBHOOK_SECRET_ARN`. No `stripeTestWebhookSecretArn` property exists.

---

## Target State

### Stripe Webhook Endpoints

6 endpoints total (3 URLs x 2 modes):

| Environment | URL | Mode | Signing Secret | Secrets Manager Path |
|-------------|-----|------|----------------|---------------------|
| Proxy | ngrok URL | Test | In `.env` as `STRIPE_WEBHOOK_SECRET` | N/A (local) |
| Proxy | ngrok URL | Live | In `.env` as `STRIPE_LIVE_WEBHOOK_SECRET` (future) | N/A (local) |
| CI | `ci-submit.diyaccounting.co.uk/...` | Test | From Stripe Dashboard | `ci/submit/stripe/test_webhook_secret` |
| CI | `ci-submit.diyaccounting.co.uk/...` | Live | Not needed yet | `ci/submit/stripe/webhook_secret` (future) |
| Prod | `submit.diyaccounting.co.uk/...` | Test | From Stripe Dashboard | `prod/submit/stripe/test_webhook_secret` |
| Prod | `submit.diyaccounting.co.uk/...` | Live | From Stripe Dashboard | `prod/submit/stripe/webhook_secret` |

**Immediate need**: Prod test-mode, CI test-mode. Live-mode endpoints are future work (Phase 7).

### Secrets Manager (target)

| Secret Path | Content | When Needed |
|-------------|---------|-------------|
| `ci/submit/stripe/test_webhook_secret` | CI test-mode endpoint signing secret | Now |
| `ci/submit/stripe/webhook_secret` | CI live-mode endpoint signing secret | Phase 7 |
| `prod/submit/stripe/test_webhook_secret` | Prod test-mode endpoint signing secret | Now |
| `prod/submit/stripe/webhook_secret` | Prod live-mode endpoint signing secret | Phase 7 |

### Lambda Environment Variables (target)

```
STRIPE_WEBHOOK_SECRET_ARN       → {env}/submit/stripe/webhook_secret         (live-mode)
STRIPE_TEST_WEBHOOK_SECRET_ARN  → {env}/submit/stripe/test_webhook_secret    (test-mode)
```

### GitHub Actions Secrets (target)

| GitHub Secret | Description |
|---------------|-------------|
| `STRIPE_WEBHOOK_SECRET_CI` | CI test-mode endpoint signing secret |
| `STRIPE_WEBHOOK_SECRET_PROD` | Prod live-mode endpoint signing secret (populate in Phase 7) |
| `STRIPE_TEST_WEBHOOK_SECRET_CI` | Same as `STRIPE_WEBHOOK_SECRET_CI` (CI only uses test) |
| `STRIPE_TEST_WEBHOOK_SECRET_PROD` | Prod test-mode endpoint signing secret |

Old `STRIPE_WEBHOOK_SECRET` can be removed after migration.

---

## Implementation

### Step 1: Retrieve signing secrets from Stripe Dashboard

Manual step. For each endpoint URL, get the signing secret from Stripe Dashboard → Developers → Webhooks. Need to check both test-mode and live-mode tabs.

Record:
- CI test-mode: `whsec_...`
- Prod test-mode: `whsec_...`
- Prod live-mode: `whsec_...` (if endpoint exists; create if not)

If any endpoints are missing, run `stripe-setup.js` with the appropriate key:
```bash
# Test-mode endpoints
STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.js

# Live-mode endpoints (for Phase 7)
STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.js
```

### Step 2: Create GitHub Actions Secrets

Set 4 new secrets in GitHub repo settings:
- `STRIPE_WEBHOOK_SECRET_CI` → CI test-mode signing secret
- `STRIPE_WEBHOOK_SECRET_PROD` → Prod live-mode signing secret (or placeholder until Phase 7)
- `STRIPE_TEST_WEBHOOK_SECRET_CI` → CI test-mode signing secret (same as above for CI)
- `STRIPE_TEST_WEBHOOK_SECRET_PROD` → Prod test-mode signing secret

### Step 3: Update `deploy-environment.yml`

**Current** (lines 212–221): One step creating `{env}/submit/stripe/webhook_secret` from `secrets.STRIPE_WEBHOOK_SECRET`.

**Change to**: Two steps, per-environment:

```yaml
- name: Create Stripe webhook secret (live mode)
  run: |
    SECRET_NAME="${{ needs.names.outputs.environment-name }}/submit/stripe/webhook_secret"
    # Select per-environment secret
    if [ "${{ needs.names.outputs.environment-name }}" = "prod" ]; then
      SECRET_VALUE="${{ secrets.STRIPE_WEBHOOK_SECRET_PROD }}"
    else
      SECRET_VALUE="${{ secrets.STRIPE_WEBHOOK_SECRET_CI }}"
    fi
    if [ -z "$SECRET_VALUE" ]; then
      echo "No webhook secret configured for this environment, skipping"
      exit 0
    fi
    if ! aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region ${{ env.AWS_REGION }} 2>/dev/null; then
      aws secretsmanager create-secret --name "$SECRET_NAME" --secret-string "$SECRET_VALUE" --region ${{ env.AWS_REGION }}
    else
      aws secretsmanager update-secret --secret-id "$SECRET_NAME" --secret-string "$SECRET_VALUE" --region ${{ env.AWS_REGION }}
    fi

- name: Create Stripe test webhook secret
  run: |
    SECRET_NAME="${{ needs.names.outputs.environment-name }}/submit/stripe/test_webhook_secret"
    if [ "${{ needs.names.outputs.environment-name }}" = "prod" ]; then
      SECRET_VALUE="${{ secrets.STRIPE_TEST_WEBHOOK_SECRET_PROD }}"
    else
      SECRET_VALUE="${{ secrets.STRIPE_TEST_WEBHOOK_SECRET_CI }}"
    fi
    if [ -z "$SECRET_VALUE" ]; then
      echo "No test webhook secret configured for this environment, skipping"
      exit 0
    fi
    if ! aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region ${{ env.AWS_REGION }} 2>/dev/null; then
      aws secretsmanager create-secret --name "$SECRET_NAME" --secret-string "$SECRET_VALUE" --region ${{ env.AWS_REGION }}
    else
      aws secretsmanager update-secret --secret-id "$SECRET_NAME" --secret-string "$SECRET_VALUE" --region ${{ env.AWS_REGION }}
    fi
```

### Step 4: Update `.env.ci` and `.env.prod`

**`.env.ci`** — add test webhook secret ARN:
```
STRIPE_TEST_WEBHOOK_SECRET_ARN=arn:aws:secretsmanager:eu-west-2:887764105431:secret:ci/submit/stripe/test_webhook_secret
```
CI currently uses test Stripe for everything. The existing `STRIPE_WEBHOOK_SECRET_ARN` can remain pointed at `ci/submit/stripe/webhook_secret` for future live-mode use.

**`.env.prod`** — add test webhook secret ARN:
```
STRIPE_TEST_WEBHOOK_SECRET_ARN=arn:aws:secretsmanager:eu-west-2:887764105431:secret:prod/submit/stripe/test_webhook_secret
```

**`.env.proxy`** — no change needed. Proxy uses direct env vars from `.env` (not ARNs). The webhook secret is `STRIPE_WEBHOOK_SECRET` in `.env` (gitignored), resolved directly.

### Step 5: Update CDK — `BillingStackProps` and `BillingStack.java`

**`BillingStack.java`** — add `stripeTestWebhookSecretArn` to props interface:

```java
// In BillingStackProps interface, add:
@Value.Default
default String stripeTestWebhookSecretArn() {
    return "";
}
```

**`BillingStack.java`** — webhook Lambda env and IAM, add alongside existing `stripeWebhookSecretArn` wiring:

```java
// Webhook Lambda env — add test webhook secret ARN
if (props.stripeTestWebhookSecretArn() != null
        && !props.stripeTestWebhookSecretArn().isBlank()) {
    billingWebhookPostLambdaEnv.with("STRIPE_TEST_WEBHOOK_SECRET_ARN", props.stripeTestWebhookSecretArn());
}

// Webhook Lambda IAM — grant read access to test webhook secret
if (props.stripeTestWebhookSecretArn() != null
        && !props.stripeTestWebhookSecretArn().isBlank()) {
    var testWebhookSecretArnWithWildcard = props.stripeTestWebhookSecretArn().endsWith("*")
            ? props.stripeTestWebhookSecretArn()
            : props.stripeTestWebhookSecretArn() + "-*";
    this.billingWebhookPostLambda.addToRolePolicy(PolicyStatement.Builder.create()
            .effect(Effect.ALLOW)
            .actions(List.of("secretsmanager:GetSecretValue"))
            .resources(List.of(testWebhookSecretArnWithWildcard))
            .build());
}
```

### Step 6: Update CDK — `SubmitApplication.java`

**Add env var resolution** (around line 173, alongside existing `stripeWebhookSecretArn`):

```java
var stripeTestWebhookSecretArn = envOr(
        "STRIPE_TEST_WEBHOOK_SECRET_ARN",
        appProps.stripeTestWebhookSecretArn,
        "(from stripeTestWebhookSecretArn in cdk.json)");
```

**Add `AppProps` field** (around line 72):

```java
public String stripeTestWebhookSecretArn;
```

**Pass to BillingStack builder** (around line 278):

```java
.stripeTestWebhookSecretArn(stripeTestWebhookSecretArn != null ? stripeTestWebhookSecretArn : "")
```

### Step 7: Update Lambda code — `billingWebhookPost.js`

The webhook handler needs to select the correct signing secret based on whether the incoming event is test-mode or live-mode. Since signature verification happens BEFORE the event body is trusted, we peek at the raw body to detect `livemode`:

```javascript
let cachedWebhookSecret = null;      // live-mode
let cachedTestWebhookSecret = null;  // test-mode

async function resolveWebhookSecret({ test = false } = {}) {
  if (test) {
    if (cachedTestWebhookSecret) return cachedTestWebhookSecret;

    // Local dev: direct env var
    const testSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET;
    if (testSecret && !testSecret.startsWith("arn:")) {
      cachedTestWebhookSecret = testSecret;
      return testSecret;
    }

    // AWS: resolve from Secrets Manager ARN
    const testArn = testSecret || process.env.STRIPE_TEST_WEBHOOK_SECRET_ARN;
    if (testArn && testArn.startsWith("arn:")) {
      const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
      const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
      const result = await smClient.send(new GetSecretValueCommand({ SecretId: testArn }));
      cachedTestWebhookSecret = result.SecretString;
      return cachedTestWebhookSecret;
    }

    // Fall through to live secret if no test secret configured
    logger.warn({ message: "No test webhook secret configured, falling through to live secret" });
  }

  // Live mode (or fallback)
  if (cachedWebhookSecret) return cachedWebhookSecret;

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (secret && !secret.startsWith("arn:")) {
    cachedWebhookSecret = secret;
    return secret;
  }

  const arn = secret || process.env.STRIPE_WEBHOOK_SECRET_ARN;
  if (arn && arn.startsWith("arn:")) {
    const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    const smClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
    const result = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
    cachedWebhookSecret = result.SecretString;
    return cachedWebhookSecret;
  }

  throw new Error("No Stripe webhook secret configured");
}
```

**Update `ingestHandler`** to peek at `livemode` before verification:

```javascript
export async function ingestHandler(event) {
  const { request } = extractRequest(event);
  const rawBody = event.body || "";
  const sig = event.headers?.["stripe-signature"] || event.headers?.["Stripe-Signature"] || "";

  if (!sig) {
    logger.warn({ message: "Missing stripe-signature header" });
    return jsonResponse(400, { error: "Missing stripe-signature header" });
  }

  // Peek at raw body to determine test/live mode BEFORE signature verification.
  // This is safe: we don't trust the body until after constructEvent succeeds.
  let isTestMode = false;
  try {
    const parsed = JSON.parse(rawBody);
    isTestMode = parsed.livemode === false;
  } catch {
    // If body isn't valid JSON, Stripe verification will fail anyway
  }

  let stripeEvent;
  try {
    const webhookSecret = await resolveWebhookSecret({ test: isTestMode });
    const stripe = await getStripeClient();
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (error) {
    logger.warn({ message: "Webhook signature verification failed", error: error.message, isTestMode });
    return jsonResponse(400, { error: "Invalid webhook signature" });
  }

  // ... rest unchanged ...
}
```

**Key design decision**: We peek at `livemode` from the unverified body to select the correct signing secret. The body is NOT trusted until `constructEvent` succeeds with the correct secret. An attacker who spoofs `livemode: false` would still need to know the test webhook secret to pass verification.

### Step 8: Update unit tests — `billingWebhookPost.test.js`

Add tests for:
- Test-mode event selects test webhook secret
- Live-mode event selects live webhook secret
- Missing test webhook secret falls through to live secret
- Signature verification with correct test-mode secret succeeds
- Signature verification with wrong secret (e.g., live secret for test event) fails

### Step 9: Update `stripe-setup.js`

Update the output to clearly label test-mode vs live-mode:

```javascript
const mode = STRIPE_SECRET_KEY.startsWith("sk_live_") ? "LIVE" : "TEST";
console.log(`\n=== Stripe Setup Complete (${mode} mode) ===`);
console.log("Product ID:", product.id);
console.log("Price ID:", price.id);
console.log(`Proxy Webhook (${mode}):`);
console.log(`  ID: ${proxyWebhook.id}`);
console.log(`  Secret: ${proxyWebhook.secret || "(already exists — retrieve from Stripe Dashboard)"}`);
console.log(`CI Webhook (${mode}):`);
console.log(`  ID: ${ciWebhook.id}`);
console.log(`  Secret: ${ciWebhook.secret || "(already exists — retrieve from Stripe Dashboard)"}`);
console.log(`Prod Webhook (${mode}):`);
console.log(`  ID: ${prodWebhook.id}`);
console.log(`  Secret: ${prodWebhook.secret || "(already exists — retrieve from Stripe Dashboard)"}`);
console.log(`\nStore these as ${mode === "TEST" ? "STRIPE_TEST_WEBHOOK_SECRET" : "STRIPE_WEBHOOK_SECRET"} per environment.`);
```

### Step 10: Verify and test

1. `npm test` — unit + system tests pass
2. `./mvnw clean verify` — CDK build succeeds
3. Set GitHub Actions secrets (Step 2)
4. Push branch, deploy to CI
5. Run `npm run test:paymentBehaviour-ci` — verify webhook processes correctly
6. Deploy to prod
7. Repeat human test: redeem resident-pro test pass → Stripe checkout → verify bundle appears

---

## Files to Change

| File | Change |
|------|--------|
| `app/functions/billing/billingWebhookPost.js` | Dual webhook secret resolution with livemode peek |
| `app/unit-tests/functions/billingWebhookPost.test.js` | Tests for dual-secret selection |
| `infra/main/java/co/uk/diyaccounting/submit/stacks/BillingStack.java` | Add `stripeTestWebhookSecretArn` prop + env var + IAM |
| `infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java` | Add `stripeTestWebhookSecretArn` to AppProps + BillingStack wiring |
| `.env.ci` | Add `STRIPE_TEST_WEBHOOK_SECRET_ARN` |
| `.env.prod` | Add `STRIPE_TEST_WEBHOOK_SECRET_ARN` |
| `.github/workflows/deploy-environment.yml` | Per-environment webhook secret creation + test webhook secret step |
| `scripts/stripe-setup.js` | Clearer test/live mode labelling in output |

---

## Environment Matrix (After Implementation)

### CI (test Stripe only)

| Secret | Secrets Manager Path | GitHub Actions Source |
|--------|---------------------|---------------------|
| Live webhook secret | `ci/submit/stripe/webhook_secret` | `STRIPE_WEBHOOK_SECRET_CI` |
| Test webhook secret | `ci/submit/stripe/test_webhook_secret` | `STRIPE_TEST_WEBHOOK_SECRET_CI` |
| Live API key | `ci/submit/stripe/secret_key` | Points to test key (CI has no live Stripe) |
| Test API key | `ci/submit/stripe/test_secret_key` | `STRIPE_TEST_SECRET_KEY` |

CI's "live" secrets all point to test Stripe since CI has no live Stripe account. Both webhook secrets may be the same value for CI.

### Prod (test + live Stripe coexist)

| Secret | Secrets Manager Path | GitHub Actions Source |
|--------|---------------------|---------------------|
| Live webhook secret | `prod/submit/stripe/webhook_secret` | `STRIPE_WEBHOOK_SECRET_PROD` |
| Test webhook secret | `prod/submit/stripe/test_webhook_secret` | `STRIPE_TEST_WEBHOOK_SECRET_PROD` |
| Live API key | `prod/submit/stripe/secret_key` | `STRIPE_SECRET_KEY` |
| Test API key | `prod/submit/stripe/test_secret_key` | `STRIPE_TEST_SECRET_KEY` |

### Proxy (local)

| Secret | Source |
|--------|--------|
| Webhook secret | `STRIPE_WEBHOOK_SECRET` in `.env` (direct value) |
| Test webhook secret | Same as above (proxy only runs test mode) |
| API key | `STRIPE_SECRET_KEY` in `.env` (direct value) |

No changes needed for proxy — it uses `.env` direct values, not ARNs.

---

## Webhook Secret Selection Logic

```
Incoming Stripe webhook event
         │
         ▼
  Peek at raw body: livemode?
         │
    ┌────┴────┐
    │         │
 false       true
 (test)     (live)
    │         │
    ▼         ▼
Resolve      Resolve
STRIPE_TEST_ STRIPE_
WEBHOOK_     WEBHOOK_
SECRET_ARN   SECRET_ARN
    │         │
    ▼         ▼
constructEvent(rawBody, sig, secret)
         │
    ┌────┴────┐
    │         │
 SUCCESS    FAIL → 400
    │
    ▼
Route event to handler
(checkout.session.completed → grant bundle)
```

---

## Relationship to PLAN_PAYMENT_GOLIVE.md

This plan addresses the blocking issue in **Phase 4.2** (Human tester walks through the journey). The webhook secret misconfiguration prevents bundle activation after Stripe payment.

Once this is implemented:
- Phase 4.2 can be re-attempted (human test of payment flow on prod)
- Phase 5 (synthetic tests in prod) will also benefit from the correct webhook configuration
- Phase 7 (production go-live with live passes) is pre-wired — just populate the live-mode webhook secrets

---

## Actions

- [ ] **Manual**: Retrieve test-mode signing secrets from Stripe Dashboard for CI and prod endpoints
- [ ] **Manual**: Retrieve (or create) live-mode signing secrets from Stripe Dashboard for prod endpoint
- [ ] **Manual**: Set GitHub Actions secrets (`STRIPE_WEBHOOK_SECRET_CI`, `STRIPE_TEST_WEBHOOK_SECRET_CI`, `STRIPE_WEBHOOK_SECRET_PROD`, `STRIPE_TEST_WEBHOOK_SECRET_PROD`)
- [ ] **Code**: Update `billingWebhookPost.js` with dual-secret resolution
- [ ] **Code**: Update `BillingStack.java` and `SubmitApplication.java` with `stripeTestWebhookSecretArn`
- [ ] **Code**: Update `.env.ci` and `.env.prod` with `STRIPE_TEST_WEBHOOK_SECRET_ARN`
- [ ] **Code**: Update `deploy-environment.yml` with per-environment secret creation
- [ ] **Code**: Update `stripe-setup.js` output labelling
- [ ] **Code**: Update unit tests for dual-secret logic
- [ ] **Verify**: `npm test` + `./mvnw clean verify`
- [ ] **Verify**: Deploy to CI, run `paymentBehaviour-ci`
- [ ] **Verify**: Deploy to prod, re-attempt human test (Phase 4.2)
