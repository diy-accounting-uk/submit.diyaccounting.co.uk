<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Move Stripe Billing Webhook to Environment Level

## User Assertions (verbatim)

1. Make the Stripe callback endpoints always available by moving them to the "environment" application
2. The environment doesn't get torn down so the Lambda needs to be optimised for low cold start rather than provisioned concurrency
3. Moving the Lambda still needs to work when deploying different applications that share the environment

## Problem

**Issue**: [#749](https://github.com/antonycc/submit.diyaccounting.co.uk/issues/749)

Stripe webhook endpoint `https://ci-submit.diyaccounting.co.uk/api/v1/billing/webhook` fails when
the CI app stack is torn down (self-destruct). The webhook Lambda, API Gateway, and CloudFront are
all in the **application stack** (per-deployment, ephemeral). When the deployment is destroyed:

- CloudFront distribution deleted
- API Gateway deleted
- Route53 record for `ci-submit.diyaccounting.co.uk` removed
- Stripe webhook deliveries fail (16+ failures reported)
- Stripe eventually auto-disables the webhook endpoint

This affects subscription lifecycle events (invoice.paid, customer.subscription.updated, etc.)
which could delay invoice processing by up to 3 days.

## Current Architecture

```
Stripe --webhook--> ci-submit.diyaccounting.co.uk/api/v1/billing/webhook
                        |
                    [Route53] ── points to app-level CloudFront (DESTROYED when app torn down)
                        |
                    [CloudFront] /api/v1/* ── app-level (DESTROYED)
                        |
                    [API Gateway v2] ── app-level (DESTROYED)
                        |
                    [billingWebhookPost Lambda] ── app-level (DESTROYED)
                        |
                    [DynamoDB: bundles, subscriptions] ── env-level (PERSISTS)
```

**Key files currently involved**:
- `infra/.../stacks/BillingStack.java` — creates webhook Lambda (app-level)
- `infra/.../stacks/ApiStack.java` — creates API Gateway + routes (app-level)
- `infra/.../stacks/EdgeStack.java` — creates CloudFront + Route53 (app-level)
- `infra/.../SubmitApplication.java` — wires app stacks together
- `app/functions/billing/billingWebhookPost.js` — Lambda handler (unchanged)

## Proposed Architecture

```
Stripe --webhook--> ci-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook
                        |
                    [Route53] ── env-level (PERSISTS)
                        |
                    [API Gateway v2] ── env-level (PERSISTS)
                        |
                    [billingWebhookPost Lambda] ── env-level (PERSISTS, 0 PC, fast cold start)
                        |
                    [DynamoDB: bundles, subscriptions] ── env-level (PERSISTS)
```

### Domain Naming

Following the existing pattern (`{env}-auth`, `{env}-holding`, `{env}-simulator`):

| Environment | Webhook Domain | Current (will be removed) |
|------------|---------------|--------------------------|
| CI | `ci-billing.submit.diyaccounting.co.uk` | `ci-submit.diyaccounting.co.uk/api/v1/billing/webhook` |
| Prod | `prod-billing.submit.diyaccounting.co.uk` | `submit.diyaccounting.co.uk/api/v1/billing/webhook` |

### Why a Separate Domain (Not the App Domain)

- `ci-submit.diyaccounting.co.uk` is owned by the app-level EdgeStack (CloudFront)
- Two CloudFront distributions cannot share the same domain name
- A separate domain avoids coupling the webhook to any specific deployment
- Follows precedent: `{env}-auth`, `{env}-holding`, `{env}-simulator` are all env-level domains

## Design Details

### 1. New CDK Stack: `BillingWebhookStack` (env-level, eu-west-2)

**Location**: `infra/main/java/co/uk/diyaccounting/submit/stacks/BillingWebhookStack.java`

**Creates**:
- **Lambda function** (Docker image from ECR, same image as app Lambdas)
  - 0 provisioned concurrency (no PC alias needed)
  - 512MB memory (optimised for cold start — webhook payload is small)
  - 29s timeout (matches API Gateway max integration timeout)
  - ARM64 architecture (cost-efficient, fast boot)
  - Environment variables: table names, Stripe secret ARNs, activity bus, ENVIRONMENT_NAME
- **API Gateway HTTP API v2**
  - Single route: `POST /api/v1/billing/webhook`
  - No authorizer (Stripe signature verification in Lambda)
  - Custom domain: `{env}-billing.{subDomainName}.{hostedZoneName}` (e.g. `ci-billing.submit.diyaccounting.co.uk`)
  - Regional ACM certificate (covered by `*.submit.diyaccounting.co.uk` wildcard)
- **Route53 A/AAAA alias records** pointing domain to API Gateway
- **IAM permissions**:
  - DynamoDB read/write on `{env}-env-bundles` and `{env}-env-subscriptions`
  - Secrets Manager read for Stripe secret ARNs
  - EventBridge putEvents for activity bus
  - KMS decrypt via SubHashSaltHelper

### 2. Cold Start Optimisation (No Provisioned Concurrency)

Since the env stack is permanent, Stripe retries handle occasional cold starts. Optimisations:

- **512MB memory** — sufficient for webhook processing, reduces cost
- **ARM64** — faster startup than x86
- **0 provisioned concurrency** — Stripe has built-in retry with exponential backoff (up to 3 days)
- **No Lambda Version/Alias** — skip the `pc` alias pattern entirely (avoids RETAIN version
  accumulation); use `$LATEST` directly via the Function URL or API Gateway default integration
- **29s timeout** — plenty for DynamoDB + Secrets Manager calls

Cold start for a Docker-based Node.js Lambda on ARM64 at 512MB is typically 1-3 seconds.
Stripe's 20-second webhook timeout easily accommodates this.

### 3. Multiple Deployments Sharing the Environment

The webhook Lambda is **deployment-agnostic** by design:
- It reads/writes to **shared env-level DynamoDB tables** (bundles, subscriptions)
- It doesn't reference any deployment-specific resources
- It uses hashed user sub (`hashedSub`) as the DynamoDB key — same across all deployments
- Multiple app deployments can read the data the webhook writes (eventual consistency is fine)

**No routing/dispatch needed**: Stripe sends one event, the env-level Lambda processes it,
updates shared tables. Any deployment reading those tables sees the updated state.

### 4. Stripe Webhook URL Update

Update `scripts/stripe-setup.js` to use the new env-level domains:
- CI: `https://ci-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook`
- Prod: `https://prod-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook`

### 5. Transition Plan

**Phase 1: Add env-level webhook (no breaking changes)** — DONE (2026-03-24, merged PR #752)
1. [x] Create `BillingWebhookStack` in `SubmitEnvironment.java`
2. [x] Add `billingDomainName` to `SubmitSharedNames.java`
3. [x] Pass Stripe secret ARNs to environment CDK context
4. [x] Add `deploy-billing-webhook` job to `deploy-environment.yml`
5. [x] Deploy environment stacks
6. [ ] Verify webhook Lambda responds on new domain

**Phase 2: Update Stripe configuration** — DONE (2026-03-25, PR #753)
1. [x] Update `stripe-setup.js` with new webhook URLs
2. [x] Run stripe-setup to register new endpoints in Stripe Dashboard (both test and live keys)
3. [x] Store new webhook signing secrets in GitHub Environment secrets
4. [x] Re-run deploy-environment.yml for ci and prod (pushes secrets to Secrets Manager)
5. [x] Disable old Stripe webhook endpoints in Stripe Dashboard

**Phase 3: Remove from app stack** — DONE (2026-03-25)
1. [x] Remove `billingWebhookPostLambda` from `BillingStack.java`
2. [x] Remove webhook route from `ApiStack.java` (automatic — driven by `lambdaFunctionProps` list)
3. [x] Remove webhook secret props from `BillingStackProps` and `SubmitApplication`
4. [x] Update CDK test (4 → 3 Lambdas in BillingStack)
5. App-level BillingStack still handles checkout, portal, and recover (these need the app domain)

### 6. What Stays in the App-Level BillingStack

Only the **webhook** moves. These remain app-level because they require the app's JWT authorizer
and are accessed by the browser through the app's CloudFront:

- `billingCheckoutPostLambda` — creates Stripe checkout sessions (needs JWT auth)
- `billingPortalGetLambda` — creates Stripe customer portal sessions (needs JWT auth)
- `billingRecoverPostLambda` — recovers orphaned subscriptions (needs JWT auth)

## Files to Create/Modify

### Phase 1 files (DONE)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/BillingWebhookStack.java` — **created**
- `infra/main/java/co/uk/diyaccounting/submit/SubmitEnvironment.java` — **modified** (add BillingWebhookStack + Stripe/cert/image props)
- `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` — **modified** (add billingDomainName, billingWebhookStackId, env Lambda names)
- `.github/workflows/deploy-environment.yml` — **modified** (add deploy-billing-webhook job)

### Phase 2 files (TODO)
- `scripts/stripe-setup.js` — update webhook URLs

### Phase 3 files (TODO)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/BillingStack.java` — remove webhook Lambda
- `infra/main/java/co/uk/diyaccounting/submit/stacks/ApiStack.java` — remove webhook route (auto via lambdaFunctions list)

## Verification

- [x] `./mvnw clean verify` passes (CDK synthesis)
- [x] `npm test` passes (947 tests)
- [x] `npm run cdk-ci` environment synth succeeds (stack skipped locally as expected)
- [ ] Environment deploy creates BillingWebhookStack
- [ ] `curl -X POST https://ci-billing.submit.diyaccounting.co.uk/api/v1/billing/webhook` returns 400 (missing Stripe signature, not 503/404)
- [ ] Stripe test webhook delivery succeeds to new URL
- [ ] App teardown does NOT affect webhook endpoint
- [ ] Synthetic test still passes (submitVatBehaviour uses app-level billing checkout, not webhook)

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Certificate doesn't cover `ci-billing.submit.diyaccounting.co.uk` | Existing wildcard cert `*.diyaccounting.co.uk` should cover it — verify |
| API Gateway needs **regional** certificate (eu-west-2) | Currently only used by app-level ApiStack via `REGIONAL_CERTIFICATE_ARN` / `SUBMIT_REGIONAL_CERTIFICATE_ARN`. Must also pass to `deploy-environment.yml` and `SubmitEnvironment.java` |
| Docker image not available during env deploy | EcrStack already creates ECR repos at env level; images pushed during app deploy. First env deploy must be after at least one app image is pushed to ECR |
| Cold start exceeds Stripe timeout (20s) | Docker ARM64 cold start is ~1-3s; Stripe retries automatically |
| Stripe webhook secret rotation | Secrets are in AWS Secrets Manager; Lambda reads at runtime, same as today |
| Prod webhook temporarily down during migration | Add new endpoint first, verify, then remove old one — no downtime |
