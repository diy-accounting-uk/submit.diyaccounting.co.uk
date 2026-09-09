<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Human Test of Payment Integration with Alerting

**Created**: 12 February 2026
**Branch**: `eventandpayment`
**Goal**: Establish a test path close to production where a human tester can use passes to access day-guest and resident-pro bundles, exhaust tokens, upgrade, pay via test Stripe, and submit VAT to sandbox HMRC — all while receiving real-time Telegram alerts.

**Supersedes/consolidates remaining work from**:
- `PLAN_PAYMENT_INTEGRATION.md` (Phases 5+ remaining)
- `PLAN_TELEGRAM_ALERTING.md` (Phases 2-3 deployment + config update)
- `PLAN_HUMAN_TEST.md` (requirements captured below)

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

## Immediate Fix: Current CI Failure on `eventandpayment` Branch

The `paymentBehaviour-ci` test currently fails at Step 7 (VAT submission) because:

1. `resident-pro` maps to the "Submit VAT (HMRC)" activity (live, no `?hmrcAccount=sandbox`)
2. The page navigates to `submitVat.html` without `?hmrcAccount=sandbox`
3. `sessionStorage.hmrcAccount` never gets set
4. The token exchange request to `/api/v1/hmrc/token` has no `hmrcAccount` header
5. The Lambda uses `ci/submit/hmrc/client_secret` (live) instead of `ci/submit/hmrc/sandbox_client_secret`
6. Live credentials fail against sandbox HMRC API → 401 `invalid_client`

Additionally, a naive fix of injecting `?hmrcAccount=sandbox` into the URL causes a secondary failure:
- `hmrcVatReturnPost.js` line 401: `const activityId = hmrcAccount === "sandbox" ? "submit-vat-sandbox" : "submit-vat"`
- This selects the `submit-vat-sandbox` activity for token enforcement, which requires the `test` bundle
- `resident-pro` isn't in `submit-vat-sandbox`'s bundle list → `tokens_exhausted` → 403

**Root cause**: HMRC credential selection and activity-based token metering are coupled via the `hmrcAccount` header. They need to be independent.

**Resolution**: This is fixed properly by the architectural changes below (unified catalogue, pass qualifier-based routing). The immediate fix is not needed once the rework is complete.

---

## Architecture: Decoupling Credentials from Activities

### Current Model (broken for cross-cutting test/live)

```
test bundle → sandbox activities → ?hmrcAccount=sandbox → sandbox HMRC + test Stripe
resident-pro → live activities    → no hmrcAccount       → live HMRC + live Stripe
```

Three things are tightly coupled: bundle selection, activity selection, and credential routing.

### Target Model

```
Any bundle → unified activities → credential routing from bundle qualifier
```

| Concern | Driven by |
|---------|-----------|
| Which activity to show/meter | User's bundle (day-guest, resident-pro) |
| Which HMRC credentials to use | Bundle grant qualifier (`sandbox: true/false`) |
| Which Stripe key to use | Bundle grant qualifier (`sandbox: true/false`) |
| Which Telegram channel | Actor classification (native = test, social = live) |

### Pass Test Type

Passes gain a `testPass` boolean field (default: `false`):

```javascript
// Test pass — grants real bundle with sandbox routing
{
  code: "XXXX-XXXX",
  bundleId: "day-guest",    // Real bundle, not "test"
  testPass: true,           // Signals sandbox routing
  validUntil: null,         // Test passes can have longer/unlimited validity
  maxUses: 10,              // Test passes can have more uses
  // ...existing fields
}

// Live pass — grants real bundle with live routing
{
  code: "YYYY-YYYY",
  bundleId: "day-guest",
  testPass: false,          // Default: live routing
  maxUses: 1,
  // ...existing fields
}
```

### Bundle Grant Qualifier

When a test pass is redeemed, the bundle grant stores `sandbox: true` in qualifiers:

```javascript
// In passPost.js, after redeemPass():
const qualifiers = result.testPass ? { sandbox: true } : {};
await grantBundle(userId, { bundleId: result.bundleId, qualifiers }, ...);
```

The bundle record in DynamoDB:
```javascript
{
  bundleId: "resident-pro",
  tokensGranted: 100,
  qualifiers: { sandbox: true },  // NEW — drives credential routing
  // ...existing fields
}
```

### Frontend: Reading the Qualifier

The `GET /api/v1/bundle` response already returns qualifiers. The frontend reads them:

1. When loading an activity page (e.g., `submitVat.html`), fetch the user's bundles
2. Find the qualifying bundle for this activity
3. If `qualifiers.sandbox === true`, set `sessionStorage.hmrcAccount = "sandbox"`
4. This flows through to the HMRC OAuth URL builder and API headers as today

This means the `?hmrcAccount=sandbox` URL parameter is no longer the source of truth — the bundle qualifier is. The URL parameter becomes a fallback for direct navigation.

### Backend: Decoupled Token Enforcement

In `hmrcVatReturnPost.js`, change line 401:

```javascript
// BEFORE (coupled):
const activityId = hmrcAccount === "sandbox" ? "submit-vat-sandbox" : "submit-vat";

// AFTER (decoupled):
const activityId = "submit-vat";  // Always the live activity — no more sandbox activity
```

The `hmrcAccount` header still controls which HMRC credentials are used — it just doesn't affect which activity is metered.

---

## Catalogue Simplification: Remove `test` Bundle and Sandbox Activities

### Remove from `submit.catalogue.toml`

**Delete these activities**:
- `submit-vat-sandbox` (id: `submit-vat-sandbox`)
- `vat-obligations-sandbox` (id: `vat-obligations-sandbox`)
- `view-vat-return-sandbox` (id: `view-vat-return-sandbox`)

**Delete this bundle**:
- `test` bundle

**Update these activities** — add all real bundles:
- `submit-vat`: bundles already include `["day-guest", "invited-guest", "resident-guest", "resident-pro-comp", "resident-pro"]` — no change needed
- `vat-obligations`: same
- `view-vat-return`: same

### Impact on Tests

The `submitVatBehaviour` test currently uses `isSandboxMode()` to choose between "Submit VAT (HMRC Sandbox)" and "Submit VAT (HMRC)" buttons. After this change:

- There is only one button: "Submit VAT (HMRC)"
- `isSandboxMode()` is no longer needed for button selection
- Tests grant bundles via test passes → bundle has `sandbox: true` qualifier → sandbox HMRC credentials used automatically
- The `HMRC_ACCOUNT=sandbox` env var and `isSandboxMode()` function can be deprecated (but not urgently removed)

### Impact on Behaviour Test Setup

Currently, `submitVatBehaviour` grants a `test` bundle. After this change:
- Grant `day-guest` (via test pass) instead of `test`
- The `ensureBundlePresent` / `ensureBundleViaPassApi` helpers need updating to create test passes
- All behaviour tests that currently use `test` bundle switch to real bundles

---

## Telegram Config Simplification

### Current: JSON Blob

```
TELEGRAM_CHAT_IDS={"ci-test":"-5250521947","ci-live":"-5278650420",...}
```

Single JSON object, stored as GH variable, passed to Lambda, routing logic parses it.

### Target: Three Individual Env Vars with Channel Names

```ini
# .env.ci
TELEGRAM_TEST_CHAT_ID=@diy_ci_test
TELEGRAM_LIVE_CHAT_ID=@diy_ci_live
TELEGRAM_OPS_CHAT_ID=@diy_ci_ops

# .env.prod
TELEGRAM_TEST_CHAT_ID=@diy_prod_test
TELEGRAM_LIVE_CHAT_ID=@diy_prod_live
TELEGRAM_OPS_CHAT_ID=@diy_prod_ops

# .env.proxy / .env.simulator
# (empty — just log, no Telegram)
TELEGRAM_TEST_CHAT_ID=
TELEGRAM_LIVE_CHAT_ID=
TELEGRAM_OPS_CHAT_ID=
```

Using Telegram `@channel_name` format (public channels) instead of numeric IDs.

### Routing Update

| Event type | Target env var |
|-----------|---------------|
| `flow=user-journey` + `actor=customer/visitor` | `TELEGRAM_LIVE_CHAT_ID` |
| `flow=user-journey` + `actor=test-user/synthetic` | `TELEGRAM_TEST_CHAT_ID` |
| `flow=infrastructure/operational` (all actors) | `TELEGRAM_OPS_CHAT_ID` |

### Ops Channel Purpose

System events, not user activity:
- CloudFormation stack status changes (deployments)
- CloudWatch alarm state changes
- Lambda errors / webhook failures
- Capacity alerts
- Any `flow=infrastructure` or `flow=operational` event

### Changes to Telegram Forwarder

`activityTelegramForwarder.js`:
- Read three env vars instead of parsing JSON blob
- `resolveTargetChatIds()` returns the appropriate env var value based on `(actor, flow)` tuple
- Graceful no-op when env var is empty (proxy/simulator environments)
- Remove `TELEGRAM_CHAT_IDS` support (or keep as deprecated fallback for one deploy cycle)

### CDK Changes

`OpsStack.java`:
- Pass `TELEGRAM_TEST_CHAT_ID`, `TELEGRAM_LIVE_CHAT_ID`, `TELEGRAM_OPS_CHAT_ID` as Lambda env vars (instead of `TELEGRAM_CHAT_IDS`)
- Remove `TELEGRAM_CHAT_IDS` from OpsStackProps (or deprecate)

### GitHub Actions Changes

- Remove `TELEGRAM_CHAT_IDS` GitHub Actions Variable
- The three `TELEGRAM_*_CHAT_ID` values are in `.env.ci` / `.env.prod` (committed to repo), so they don't need GitHub Actions variables — they flow through CDK at deploy time

---

## Stripe Routing from Bundle Qualifier

### Current: Environment-Level

CI always uses test Stripe, prod always uses live Stripe. The Stripe key ARN in env config determines which key the Lambda fetches.

### Target: Bundle-Qualifier-Driven

When creating a checkout session (`billingCheckoutPost.js`):
1. Read the user's bundles
2. If the qualifying bundle has `qualifiers.sandbox === true`, use `STRIPE_TEST_PRICE_ID` and test Stripe key
3. Otherwise, use `STRIPE_PRICE_ID` and live Stripe key

This allows prod to have both test and live Stripe sessions — test pass holders get test Stripe, paying customers get live Stripe.

### Environment Setup

Both keys available in all environments (from `.env.*` files):
```ini
STRIPE_PRICE_ID=price_1SzkPBCD0Ld2ukzIqbEweRSk       # live price
STRIPE_TEST_PRICE_ID=price_1Szjt0FdFHdRoTOjHDXcuuq8   # test price
STRIPE_SECRET_KEY_ARN=arn:...secret_key                 # live key in Secrets Manager
STRIPE_TEST_SECRET_KEY_ARN=arn:...test_secret_key       # test key in Secrets Manager
```

In CI, `STRIPE_SECRET_KEY_ARN` can point to the test key (safety net — even "live" requests use test Stripe).

---

## HMRC Routing from Bundle Qualifier

### Current

The `hmrcAccount` header (set from `?hmrcAccount=sandbox` URL parameter via sessionStorage) selects:
- HMRC base URI (sandbox vs live)
- HMRC client ID (sandbox vs live)
- HMRC client secret ARN (sandbox vs live)

### Target (IMPLEMENTED)

The source of truth is the bundle qualifier, transported via `sessionStorage` (not URL parameters):

1. `index.html` fetches user's bundles and checks for `qualifiers.sandbox === true`
2. If any allocated bundle has the sandbox qualifier → sets `sessionStorage.hmrcAccount = "sandbox"`
3. HMRC pages (`submitVat.html`, `vatObligations.html`, `viewVatReturn.html`) read from `sessionStorage` only
4. Inter-page navigation (obligations → submitVat, viewVatReturn → obligations) relies on `sessionStorage`, no URL propagation
5. `correlation-utils.js` `fetchWithId` reads from `sessionStorage` only
6. `submitVatCallback.html` redirects without `?hmrcAccount=sandbox` in the URL
7. The `?hmrcAccount=sandbox` URL parameter has been fully removed — there are no external incoming links

### Environment Safety Net

In CI, `HMRC_CLIENT_SECRET_ARN` and `HMRC_SANDBOX_CLIENT_SECRET_ARN` can point to the same sandbox secret. This means even if the qualifier is missing, CI never accidentally uses live HMRC credentials.

In prod, `HMRC_CLIENT_SECRET_ARN` points to the real live secret. Only test-pass holders (with `sandbox: true` qualifier) get routed to sandbox.

---

## Implementation Phases

### Phase A: Telegram Config Update — **COMPLETE** (commit `00f4f3b8`)

**Prerequisite**: Create Telegram ops channels (`diy-ci-ops`, `diy-prod-ops`). **DONE**

1. ~~Update `activityTelegramForwarder.js`~~ — `resolveChatConfig()` reads 3 env vars, `resolveTargetChatIds()` routes by `(actor, flow)`, `[[TELEGRAM_*_CHAT]]` logging when empty
2. ~~Update `activityTelegramForwarder.test.js` unit tests~~ — full rewrite for new routing
3. ~~Update CDK `OpsStack.java`~~ — 3 individual props + env vars
4. ~~Update CDK `OpsStackProps`~~ — `telegramTestChatId()`, `telegramLiveChatId()`, `telegramOpsChatId()`
5. ~~Update CDK `SubmitApplication.java`~~ — wire new props via `envOr()`
6. ~~Remove `TELEGRAM_CHAT_IDS` from `.env.*` files~~ — all 7 env files cleaned
7. Remove `TELEGRAM_CHAT_IDS` GitHub Actions Variable — **deferred** (no longer read by code, can be removed manually)

### Phase B: Pass Test Type + Bundle Qualifier — **COMPLETE** (commit `c8e2217f`)

1. ~~Add `testPass` field to pass data model~~ — `passService.js` stores `testPass: true` on record
2. ~~Update pass creation API (`passAdminPost.js`)~~ — accepts `testPass` from request, includes in response
3. ~~Update pass service (`passService.js`)~~ — `buildPassRecord()` accepts `testPass` parameter
4. ~~Update pass redemption (`passPost.js`)~~ — passes `grantQualifiers: { sandbox: true }` when `testPass === true`
5. ~~Update `grantBundle` in `bundlePost.js`~~ — stores `grantQualifiers` on DynamoDB record as `qualifiers`
6. ~~`bundleGet.js` already returns qualifiers~~ — spread operator passes all fields through
7. ~~Update unit/system tests~~ — added test pass + sandbox qualifier tests in passService and passRedemption

### Phase C+D: Catalogue Simplification + Frontend Sandbox Routing — **COMPLETE** (commit `83790b1c`)

Phases C and D were combined because they're coupled — removing sandbox activities (C) breaks the sandbox flow unless the frontend reads bundle qualifiers (D).

1. ~~Remove `test` bundle from `submit.catalogue.toml`~~
2. ~~Remove `submit-vat-sandbox`, `vat-obligations-sandbox`, `view-vat-return-sandbox` activities~~
3. ~~Update `hmrcVatReturnPost.js`~~ — always use `"submit-vat"` activity ID (decoupled from `hmrcAccount`)
4. ~~Update all 12+ test files~~ — replace `bundleId: "test"` with `"day-guest"` or `"invited-guest"`
5. ~~Fix `bundleCapacity.system.test.js`~~ — uncapped tests use `invited-guest` (no cap), cap tests keep `day-guest` (cap=0)
6. ~~Update `index.html`~~ — track `__sandboxBundleIds` from bundle qualifiers, set `sessionStorage.hmrcAccount` directly (no URL param)
7. ~~Update `behaviour-hmrc-vat-steps.js`~~ — remove sandbox activity name ternaries (always "Submit VAT (HMRC)")
8. ~~Update `behaviour-bundle-steps.js`~~ — `ensureBundleViaPassApi` accepts `testPass` option
9. ~~Update `submitVat.behaviour.test.js`~~ — use `day-guest` via test pass with `testPass: true`
10. ~~Remove `tokenEnforcement.test.js` sandbox activity test~~ — `submit-vat-sandbox` no longer exists

### Phase E: Remaining Behaviour Test Updates — **DONE**

1. ~~Update `paymentBehaviour` test~~ — use test passes for both day-guest and resident-pro, removed `isSandboxMode()` injection workaround
2. ~~Remove `?hmrcAccount=sandbox` URL parameter transport~~ — replaced with sessionStorage throughout: `index.html`, `correlation-utils.js`, `submitVat.html`, `vatObligations.html`, `viewVatReturn.html`, `submitVatCallback.html`, browser tests
3. ~~Update other behaviour tests referencing `"test"` bundle~~ — updated `passRedemption`, `tokenEnforcement`, `simulator`, `captureDemo`, `generatePassActivity`, `bundles`, `postVatReturn`, `postVatReturnFraudPreventionHeaders`, `getVatObligations`, `getVatReturn`, `vatSchemes` to use `"Day Guest"` with `{ testPass: true }` instead of `"Test"` bundle
4. Verify `paymentBehaviour-ci` passes (the original failing test)

### Phase F: Deploy and Validate

1. Run `npm test` — all unit + system tests pass
2. Run `./mvnw clean verify` — CDK builds
3. Run `npm run test:paymentBehaviour-simulator` — simulator passes
4. Commit, push to `eventandpayment` branch
5. Monitor deployment
6. Run `paymentBehaviour-ci` — verify it passes
7. Run `submitVatBehaviour-ci` — verify it still passes
8. Verify Telegram messages arrive in correct channels

---

## Remaining Items from PLAN_PAYMENT_INTEGRATION.md

These items are not blocked by this plan but remain on the roadmap:

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Token Usage Page | **COMPLETE** | |
| Phase 2: Stripe SDK & Infrastructure | **COMPLETE** | |
| Phase 3: Checkout Session API | **CODE COMPLETE** | Awaiting deployment |
| Phase 4: Webhook Handler & Bundle Grant | **CODE COMPLETE** | Awaiting deployment |
| Phase 5: Subscription Lifecycle | Not started | `invoice.paid`, `subscription.deleted`, etc. |
| Phase 7: Frontend Integration | Not started | `bundles.html` Subscribe button, checkout flow |
| Phase 8: Compliance & Documentation | Not started | Pa11y, FAQs, guide updates |
| Phase 9: Abuse Protection | Not started | Stripe Radar, CloudWatch alarms |
| Phase 10: Production Go-Live | Not started | Live Stripe mode |

## Remaining Items from PLAN_TELEGRAM_ALERTING.md

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: EventBridge Bus + Library | **COMPLETE** | |
| Phase 2: Telegram Delivery | **CODE COMPLETE** | Forwarder Lambda exists, needs config update (this plan Phase A) |
| Phase 3: Deployment + Synthetic Events | **CODE COMPLETE** | CloudFormation + CloudWatch rules exist, need ops channel routing |

---

## Environment Configuration Summary

### CI (`.env.ci`)

```ini
# HMRC — both point to sandbox (safety net)
HMRC_CLIENT_SECRET_ARN=arn:...ci/submit/hmrc/sandbox_client_secret  # same as sandbox
HMRC_SANDBOX_CLIENT_SECRET_ARN=arn:...ci/submit/hmrc/sandbox_client_secret

# Stripe — both point to test (safety net)
STRIPE_SECRET_KEY_ARN=arn:...ci/submit/stripe/test_secret_key  # same as test
STRIPE_PRICE_ID=price_1SzkPBCD0Ld2ukzIqbEweRSk
STRIPE_TEST_PRICE_ID=price_1Szjt0FdFHdRoTOjHDXcuuq8

# Telegram
TELEGRAM_TEST_CHAT_ID=@diy_ci_test
TELEGRAM_LIVE_CHAT_ID=@diy_ci_live
TELEGRAM_OPS_CHAT_ID=@diy_ci_ops
```

### Prod (`.env.prod`)

```ini
# HMRC — separate live and sandbox
HMRC_CLIENT_SECRET_ARN=arn:...prod/submit/hmrc/client_secret       # real live
HMRC_SANDBOX_CLIENT_SECRET_ARN=arn:...prod/submit/hmrc/sandbox_client_secret

# Stripe — separate live and test
STRIPE_SECRET_KEY_ARN=arn:...prod/submit/stripe/secret_key         # real live
STRIPE_PRICE_ID=price_1SzkPBCD0Ld2ukzIqbEweRSk
STRIPE_TEST_PRICE_ID=price_1Szjt0FdFHdRoTOjHDXcuuq8

# Telegram
TELEGRAM_TEST_CHAT_ID=@diy_prod_test
TELEGRAM_LIVE_CHAT_ID=@diy_prod_live
TELEGRAM_OPS_CHAT_ID=@diy_prod_ops
```

### Proxy / Simulator

```ini
# HMRC — local simulator, no secrets
# Stripe — local simulator
# Telegram — empty (just log)
TELEGRAM_TEST_CHAT_ID=
TELEGRAM_LIVE_CHAT_ID=
TELEGRAM_OPS_CHAT_ID=
```

---

## CI Safety Net Principle

In CI, the "live" secrets are actually sandbox/test secrets:
- `HMRC_CLIENT_SECRET_ARN` → sandbox secret
- `STRIPE_SECRET_KEY_ARN` → test secret key

This means even if a test forgets to set the sandbox qualifier, CI never accidentally hits real HMRC or charges real money. The qualifier is for **prod** where both live and sandbox credentials exist.

---

## Test Pass Issuance

### Synthetic Tests (Automated)

Behaviour tests create test passes via the admin API:
```javascript
const pass = await createTestPass({ bundleId: "day-guest" });
// pass.testPass = true automatically for synthetic tests
```

### Human Testers (Manual)

Admin issues a test pass via CLI or admin API:
```bash
# Create a test pass for day-guest (sandbox HMRC + test Stripe)
curl -X POST /api/v1/admin/pass \
  -d '{"bundleId":"day-guest","testPass":true,"maxUses":5,"notes":"Manual tester"}'

# Create a live pass for beta customer (live HMRC + live Stripe)
curl -X POST /api/v1/admin/pass \
  -d '{"bundleId":"day-guest","testPass":false,"maxUses":1,"notes":"Beta customer"}'
```

---

*Document created: 12 February 2026. Consolidates PLAN_HUMAN_TEST.md, remaining work from PLAN_TELEGRAM_ALERTING.md and PLAN_PAYMENT_INTEGRATION.md.*
