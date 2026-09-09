<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Telegram Activity Alerting — Phased Delivery Plan

**Document Version**: 1.0
**Created**: 11 February 2026
**Updated**: 12 February 2026
**Owner**: Development Team
**Issue**: [#578](https://github.com/antonycc/submit.diyaccounting.co.uk/issues/578) - Activity Alerting
**Replaces**: `PLAN_WHATSAPP_ALERTING.md` (abandoned — Meta Business platform setup was prohibitively complex)

---

## Overview

Build a central EventBridge event bus for business activity across the DIY Accounting estate, with Telegram as the first delivery channel.

The architecture uses EventBridge custom bus with declarative rule-based routing in CDK. This provides enough indirection that additional consumers (Slack, email, etc.) can be added later by creating new rules and forwarder Lambdas — without touching event producers or existing consumers.

**Sites covered**:
- **submit.diyaccounting.co.uk** — new web sessions, logins, token refreshes, bundle requests, VAT queries, VAT submissions, support tickets, pass activity
- **spreadsheets.diyaccounting.co.uk** — new web sessions, donations (Stripe and PayPal Payment Links)
- **gateway.diyaccounting.co.uk** — new web sessions

**Why Telegram over WhatsApp**:
- Bot creation takes 2 minutes in the Telegram app (message `@BotFather`)
- No business verification, no developer console, no template approval process
- Completely free with no message limits
- API is a single HTTP POST per message — no SDK needed
- Groups work identically to WhatsApp groups for routing
- Phone app available on all platforms

---

## Event Model: The (Actor, Flow, Environment) Tuple

Every event in the system is a point in three dimensions:

| Dimension | Values | How the Lambda knows |
|-----------|--------|---------------------|
| **Actor** | `customer`, `test-user`, `synthetic`, `ci-pipeline`, `system` | See classification table below |
| **Flow** | `user-journey`, `ci-pipeline`, `infrastructure`, `operational` | Invocation context |
| **Environment** | `ci`, `prod` | `ENV_NAME` environment variable |

### Actor classification

| Actor | Signal |
|-------|--------|
| `customer` | Federated login (Google/OIDC), real email domain |
| `visitor` | Anonymous web session (pre-auth), classified by User-Agent and GeoIP |
| `test-user` | Cognito native auth, `@test.diyaccounting.co.uk` domain, `hmrcAccount=sandbox` |
| `synthetic` | Known synthetic user sub, or `X-Synthetic-Test` header from canary |
| `ci-pipeline` | GitHub Actions context (no user session) |
| `system` | EventBridge scheduled rule, CloudWatch alarm (no user session) |

### Visitor classification (for `new-session` events)

New web session events include a `visitorType` field in the event detail, derived from User-Agent analysis:

| Visitor Type | Signal | Publish? |
|-------------|--------|----------|
| `human` | Standard browser User-Agent (Chrome, Firefox, Safari, Edge) | Yes |
| `ai-agent` | AI tool User-Agents (e.g. `ClaudeDesktop`, `ChatGPT-User`, `Perplexity-User`) | Yes |
| `crawler` | Known bot signatures (Googlebot, Bingbot, Applebot, etc.) | **No** — filtered at source |

AI agents are explicitly distinguished from crawlers. A Claude Desktop user browsing the site is interesting activity; Googlebot indexing is not.

The `new-session` event detail includes:
- `visitorType`: `human` or `ai-agent`
- `country`: ISO 3166-1 alpha-2 from CloudFront `CloudFront-Viewer-Country` header or GeoIP on source IP
- `userAgent`: truncated User-Agent string (first 100 chars)
- `page`: entry page path

### Flow classification

| Flow | Signal |
|------|--------|
| `user-journey` | Lambda invoked via API Gateway with auth token |
| `ci-pipeline` | GitHub Actions workflow step |
| `infrastructure` | CloudFormation event or deploy workflow completion |
| `operational` | CloudWatch alarm, scheduled Lambda, health check result |

### Event envelope

```json
{
  "source": "submit.diyaccounting.co.uk/auth",
  "detail-type": "ActivityEvent",
  "detail": {
    "actor": "customer",
    "flow": "user-journey",
    "env": "prod",
    "event": "login",
    "site": "submit",
    "summary": "Login: u***@example.com",
    "timestamp": "2026-02-10T22:15:00Z"
  }
}
```

New session events carry additional visitor metadata:

```json
{
  "source": "submit.diyaccounting.co.uk/session",
  "detail-type": "ActivityEvent",
  "detail": {
    "actor": "visitor",
    "flow": "user-journey",
    "env": "prod",
    "event": "new-session",
    "site": "submit",
    "summary": "New session: human from GB, /hmrc/vat/submitVat.html",
    "visitorType": "human",
    "country": "GB",
    "page": "/hmrc/vat/submitVat.html",
    "timestamp": "2026-02-10T22:14:30Z"
  }
}
```

This is a standard EventBridge event. The `detail` carries the tuple plus the event-specific payload. Consumers pattern-match on `actor`, `flow`, `env` in their EventBridge rules.

---

## Channel Routing via EventBridge Rules

Each consumer defines its own EventBridge rules. The routing logic is declarative in CDK, not buried in Lambda code.

### Telegram: 4 groups

| Channel | EventBridge Rule Pattern | Purpose |
|---------|------------------------|---------|
| **ci-test** | `env=ci AND (actor=test-user OR actor=synthetic OR actor=ci-pipeline)` | CI test activity |
| **ci-live** | `env=ci AND (actor=customer OR actor=visitor)` | Unexpected real usage against CI |
| **ci-both** | `env=ci AND flow IN (infrastructure, operational)` | Deployments + synthetic results → both ci groups |
| **prod-test** | `env=prod AND (actor=test-user OR actor=synthetic)` | Test runs against prod |
| **prod-live** | `env=prod AND (actor=customer OR actor=visitor)` | **The business channel** — real activity |
| **prod-both** | `env=prod AND flow IN (infrastructure, operational)` | Deployments + synthetic results → both prod groups |

---

## Current State Summary

| Event | Logged? | Alerted? | Where |
|-------|---------|----------|-------|
| New web session | No | No | Not yet implemented — needs client-side beacon + API endpoint |
| Login (authorization_code exchange) | Yes (Lambda logs) | No | `cognitoTokenPost.js` |
| Token refresh | Yes (Lambda logs) | No | `cognitoTokenPost.js` |
| Bundle request/grant | Yes (CloudWatch EMF metric) | CloudWatch alarm on cap only | `bundlePost.js` |
| Bundle deletion | Yes (Lambda logs) | No | `bundleDelete.js` |
| VAT obligations query | Yes (Lambda logs) | No | `hmrcVatObligationGet.js` |
| VAT return query | Yes (Lambda logs) | No | `hmrcVatReturnGet.js` |
| VAT return submission | Yes (Lambda logs + DynamoDB receipt) | No | `hmrcVatReturnPost.js` |
| HMRC token exchange | Yes (Lambda logs) | No | `hmrcTokenPost.js` |
| Support ticket | Yes (Lambda logs) | No | `supportTicketPost.js` |
| Pass generation (admin) | Yes (Lambda logs) | No | `passAdminPost.js` |
| Pass redemption | Yes (Lambda logs) | No | `passPost.js` |
| Waitlist registration | Yes (SNS publish) | SNS email (if configured) | `interestPost.js` |
| Bundle capacity reconciliation | Yes (Lambda logs) | No | `bundleCapacityReconcile.js` |
| Stripe donation | GA4 event only (client-side) | No | `donate-page.js` |
| PayPal donation | GA4 event only (client-side) | No | `donate-page.js` |
| Deployment (stack update) | GitHub Actions logs | No | `.github/workflows/deploy.yml` |
| Synthetic test result | Yes (CloudWatch alarm) | SNS email (if configured) | `OpsStack.java` |
| Security findings | Yes (EventBridge) | SNS (no subscription) | `ObservabilityStack.java` |
| Authorization failures (401) | Yes (Lambda logs) | No | `customAuthorizer.js` |

**Key gap**: Events are logged but not pushed to any human-readable channel. The existing SNS `alertTopic` in `OpsStack.java` supports email subscriptions but has no structured event bus.

---

## Architecture: EventBridge Custom Bus + Rules

```
Lambda functions ──→ Custom EventBridge Bus ──→ Rules ──→ Targets
                          │
                    (actor, flow, env)
                    pattern matching
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         Telegram     Email Proof   (future
         Forwarder    Lambda        consumers)
         Lambda
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
  prod-live  prod-test  ci-*
  Telegram   Telegram   Telegram
  group      group      groups
```

**Why EventBridge over SNS**:
- Declarative routing — rules in CDK, not code
- Native pattern matching on event attributes (no filter policy hacks)
- Fan-out to many consumers without changing producers
- AWS service events (CloudFormation, alarms) can feed the same bus for free
- Each consumer is independently deployable and removable

### Shared library: `app/lib/activityAlert.js`

All Lambda functions use this to publish events. It handles:
- Building the event envelope with the tuple
- Actor and flow classification helpers
- PII masking (`maskEmail`, `maskVrn`)
- Graceful no-op when `ACTIVITY_BUS_NAME` is not set

```javascript
export async function publishActivityEvent({ event, site, summary, actor, flow }) {
  // Reads ENV_NAME and ACTIVITY_BUS_NAME from process.env
  // Publishes to EventBridge custom bus
}
export function classifyActor(email, authMethod) { ... }  // → "customer" | "test-user" | "synthetic"
export function classifyFlow(invocationSource) { ... }     // → "user-journey" | "operational" | ...
export function maskEmail(email) { ... }                   // → "u***@example.com"
```

### Telegram Bot Setup (one-time, ~5 minutes)

1. Open Telegram → message `@BotFather` → `/newbot`
2. Choose a name (e.g. "DIY Accounting Alerts") and username (e.g. `diy_accounting_alerts_bot`)
3. Copy the bot token (`123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
4. Create 4 Telegram groups, add the bot to each
5. Get each group's chat ID (send a message in the group, then query `getUpdates`)
6. Store the bot token and chat IDs in AWS Secrets Manager

---

## Event Sources — Lambda Instrumentation Points

### New Web Session Events (all sites)

| Event | Lambda | Trigger Point | Actor Signal | Flow |
|-------|--------|---------------|-------------|------|
| New session | `sessionBeaconPost.js` (new) | Client-side beacon on page load when no `sessionStorage` marker exists | User-Agent classification + GeoIP | `user-journey` |

**How it works**: Each site includes a lightweight script that checks `sessionStorage` for a session marker on page load. If absent (new tab, expired session, first visit), the script fires a `POST /api/session/beacon` with the entry page path. The Lambda classifies the visitor from the `User-Agent` header and resolves country from CloudFront's `CloudFront-Viewer-Country` header. Crawlers are filtered at source (no event published). A session marker is written to `sessionStorage` so subsequent page loads in the same tab don't re-fire.

**Session expiry**: `sessionStorage` clears when the browser tab closes — so "new session" means "opened a fresh tab to this site". This is deliberately simple; it does not attempt to track server-side session state.

### Submit Site Events

| Event | Lambda | Trigger Point | Actor Signal | Flow |
|-------|--------|---------------|-------------|------|
| Login | `cognitoTokenPost.js` | After successful `authorization_code` exchange (line 83) | Auth method + email domain | `user-journey` |
| Token refresh | `cognitoTokenPost.js` | After successful `refresh_token` exchange (line 86) | Token user context | `user-journey` |
| Bundle granted | `bundlePost.js` | After `BundleGranted` metric emit (worker handler) | User email domain | `user-journey` |
| Bundle deleted | `bundleDelete.js` | After successful bundle deletion | User email domain | `user-journey` |
| VAT obligations query | `hmrcVatObligationGet.js` | After successful HMRC response | `hmrcAccount` header | `user-journey` |
| VAT return query | `hmrcVatReturnGet.js` | After successful HMRC response | `hmrcAccount` header | `user-journey` |
| VAT return submitted | `hmrcVatReturnPost.js` | After successful submission + receipt stored | `hmrcAccount` header | `user-journey` |
| HMRC token exchange | `hmrcTokenPost.js` | After successful HMRC OAuth token exchange | `hmrcAccount` header | `user-journey` |
| Support ticket | `supportTicketPost.js` | After successful ticket submission | User email domain | `user-journey` |
| Pass generated (admin) | `passAdminPost.js` | After pass created | Admin context | `user-journey` |
| Pass redeemed | `passPost.js` | After pass applied to bundle | User email domain | `user-journey` |
| Waitlist registration | `interestPost.js` | After SNS publish (line 72) | Email domain | `user-journey` |
| Bundle capacity reconcile | `bundleCapacityReconcile.js` | After reconciliation run | `system` | `operational` |
| Authorization denied | `customAuthorizer.js` | On 401/403 response | Request context | `user-journey` |

### Spreadsheets Site Events

| Event | Source | Trigger Point | Actor | Flow |
|-------|--------|---------------|-------|------|
| Stripe donation | Stripe webhook (new) | `checkout.session.completed` | `customer` (always real money) | `user-journey` |
| PayPal donation | PayPal webhook (new) | `CHECKOUT.ORDER.APPROVED` or IPN | `customer` (always real money) | `user-journey` |

### Infrastructure & Operational Events

| Event | Source | Actor | Flow |
|-------|--------|-------|------|
| Deployment complete | GitHub Actions step or CloudFormation EventBridge event | `ci-pipeline` | `infrastructure` |
| Synthetic test result | CloudWatch alarm state change → EventBridge (free) | `system` | `operational` |
| Synthetic test user behaviour | Canary's logins/queries hitting Lambdas | `synthetic` | `user-journey` |
| Health check result | CloudWatch Synthetics canary | `system` | `operational` |

> **Note**: CloudFormation state change events and CloudWatch alarm state changes are **free** on the default EventBridge bus. We can create rules on the default bus that forward to our custom bus, or target the Telegram forwarder directly.

---

## Phased Delivery

### Phase 1: EventBridge Custom Bus + Routing Library + Email Proof

**Goal**: Create the custom EventBridge bus, build the shared `activityAlert.js` library, instrument Lambda functions to publish events. Subscribe an email-forwarding Lambda to prove the plumbing works.

**New shared library** (`app/lib/activityAlert.js`):
- `publishActivityEvent({ event, site, summary, actor, flow })` — publishes to custom bus
- `classifyActor(email, authMethod)` — returns actor string
- `classifyFlow(invocationSource)` — returns flow string
- `maskEmail(email)` — PII masking
- Graceful no-op when `ACTIVITY_BUS_NAME` is not set

**Infrastructure** (`OpsStack.java`):
- Custom EventBridge bus: `{resourceNamePrefix}-activity-bus`
- Email-proof rule: match all `ActivityEvent` events → SNS topic → email subscription
- Export bus name and ARN as CloudFormation outputs

**Lambda changes** (each function gets a small addition):
- Add `ACTIVITY_BUS_NAME` and `ENV_NAME` environment variables via CDK
- Add `publishActivityEvent()` call after each success event
- IAM: grant `events:PutEvents` on the custom bus

**Files to create**:
- `app/lib/activityAlert.js` — shared event publishing + classification library
- `app/lib/visitorClassifier.js` — User-Agent classification (human / ai-agent / crawler)
- `app/functions/account/sessionBeaconPost.js` — new session beacon Lambda
- `app/unit-tests/lib/activityAlert.test.js` — classification and masking tests
- `app/unit-tests/lib/visitorClassifier.test.js` — visitor classification tests (known AI agents, known crawlers, browsers)

**Client-side changes** (session beacon script added to all sites):
- `web/public/lib/session-beacon.js` — lightweight script: check `sessionStorage`, fire `POST /api/session/beacon` if new session
- Include in page templates for submit, spreadsheets, and gateway sites

**Files to modify**:
- `infra/main/java/co/uk/diyaccounting/submit/stacks/OpsStack.java` — custom bus + email proof rule
- `infra/main/java/co/uk/diyaccounting/submit/stacks/ApiStack.java` — pass bus name to Lambdas, grant `events:PutEvents`
- `app/functions/auth/cognitoTokenPost.js` — publish on login + refresh
- `app/functions/account/bundlePost.js` — publish on bundle grant
- `app/functions/account/bundleDelete.js` — publish on bundle deletion
- `app/functions/hmrc/hmrcVatObligationGet.js` — publish on successful query
- `app/functions/hmrc/hmrcVatReturnGet.js` — publish on successful query
- `app/functions/hmrc/hmrcVatReturnPost.js` — publish on successful submission
- `app/functions/hmrc/hmrcTokenPost.js` — publish on HMRC token exchange
- `app/functions/account/supportTicketPost.js` — publish on ticket submission
- `app/functions/account/passAdminPost.js` — publish on pass generation
- `app/functions/account/passPost.js` — publish on pass redemption
- `app/functions/account/interestPost.js` — publish on waitlist registration
- `app/functions/account/bundleCapacityReconcile.js` — publish on reconciliation
- `app/functions/auth/customAuthorizer.js` — publish on authorization denial
- `infra/main/java/co/uk/diyaccounting/submit/stacks/AccountStack.java` — add session beacon Lambda + API Gateway route

**Testing**:
- Unit tests for `activityAlert.js`: classification logic, masking, event envelope shape
- Unit tests for `visitorClassifier.js`: known AI agents (ClaudeDesktop, ChatGPT-User), known crawlers (Googlebot, Bingbot), standard browsers
- Unit tests for each Lambda: mock EventBridge client, verify `putEvents` call
- No behaviour test changes needed (EventBridge publish is fire-and-forget)

**Success criteria**: Receive email for each event type in CI, with correct `actor`/`flow`/`env` in the body.

---

### Phase 2: Telegram Delivery

**Goal**: Add EventBridge rules for the 4 Telegram channels, each targeting a forwarder Lambda that posts to the Telegram Bot API.

**Prerequisites** (human, ~5 minutes total):
1. Create a Telegram bot via `@BotFather` → receive bot token
2. Create 4 Telegram groups, add the bot to each
3. Retrieve each group's chat ID
4. Store bot token and chat IDs in AWS Secrets Manager

See [Human Actions Required Before Phase 2](#human-actions-required-before-phase-2) for step-by-step instructions.

**Infrastructure** (`OpsStack.java`):
- Single EventBridge rule matching all `ActivityEvent` events on the custom bus → Telegram forwarder Lambda
- The Lambda handles routing internally via `resolveTargetChatIds()` based on the `(actor, flow, env)` tuple
- This avoids duplicate invocations that would occur with 6 rules (e.g., "both" events matching two rules)
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_IDS` passed as Lambda environment variables via deploy workflow

**New Lambda** (`app/functions/ops/activityTelegramForwarder.js`):
```
EventBridge event
  → extract (actor, flow, env, summary) from detail
  → determine target chat ID(s) from the rule's input transformer or event attributes
  → format text: "[site/env] summary"
  → POST https://api.telegram.org/bot{token}/sendMessage
```

The Telegram Bot API requires no SDK — it's a single `fetch()` call:
```javascript
await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    text: message,
    parse_mode: 'Markdown'
  })
});
```

**Message format** (Markdown):
```
*[submit/prod]* New session: human from GB, /hmrc/vat/submitVat.html
*[submit/prod]* New session: ai-agent from US, /
*[submit/prod]* Login: u\*\*\*@example.com
*[submit/prod]* VAT return submitted
*[spreadsheets/prod]* Stripe donation: GBP 5.00
*[spreadsheets/prod]* PayPal donation: GBP 10.00
*[ci]* Deployed: ci-app-ApiStack
*[prod]* Synthetic test: PASSED
```

**Files created**:
- `app/functions/ops/activityTelegramForwarder.js` — Telegram forwarder Lambda
- `app/unit-tests/functions/activityTelegramForwarder.test.js` — unit tests

**Files modified**:
- `infra/main/java/co/uk/diyaccounting/submit/stacks/OpsStack.java` — EventBridge rule + Telegram forwarder Lambda construct
- `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java` — Telegram forwarder Lambda naming
- `infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java` — pass `baseImageTag` to OpsStack

**Testing**:
- Unit test: mock `fetch` to Telegram API, verify routing for all `(actor, flow, env)` combinations
- Unit test: verify Markdown escaping of special characters (`*`, `_`, `` ` ``, `[`)
- System test: verify Lambda processes EventBridge event correctly
- Manual test: trigger in CI, verify Telegram message in correct group

**Success criteria**: Telegram messages arrive in the correct group within 5 seconds.

---

### Phase 3: Deployment and Synthetic Test Events

**Goal**: Wire CloudFormation state changes and CloudWatch alarm transitions into the activity bus.

**Deployment alerts** (option A — EventBridge native):
- Rule on the **default** EventBridge bus matching CloudFormation `Resource Status Change` events for stacks matching `{env}-*`
- Target: the custom activity bus (cross-bus forwarding) or directly the Telegram forwarder
- Free (AWS service events on default bus are free)

**Deployment alerts** (option B — GitHub Actions step):
- Add a workflow step after successful CDK deploy: `aws events put-events` to the custom bus
- More explicit, tagged with `actor=ci-pipeline, flow=infrastructure`

**Synthetic test results**:
- Rule on default bus matching CloudWatch alarm state changes for canary alarms
- Tagged with `actor=system, flow=operational`
- Routes to both test + live channels

**Success criteria**: Telegram messages for deployments and synthetic results in both groups per environment.

---

### Phase 4: Spreadsheets Donation Webhooks (Stripe + PayPal)

Scrapped, we get an email notification now. That's good enough for the foreseeable future, and the webhook setup is non-trivial (especially PayPal with IPN vs Webhooks, plus credential management).

---

## Privacy and Data Minimisation

All consumers receive the same masked data. PII masking happens at the source (in `activityAlert.js`), not in the consumers:

- Full email addresses → `u***@example.com` via `maskEmail()`
- VAT registration numbers → `***1234`
- No HMRC credentials, tokens, or financial amounts from VAT returns
- Donation amounts are acceptable (merchant's own revenue, not customer PII)

Each Telegram group should be restricted to authorised business operators. Telegram groups are private by default — only members added by the group creator can see messages.

---

## Rollback

Each phase is independently removable:
- **Phase 1**: Delete custom bus + rules. Lambdas no-op gracefully (missing `ACTIVITY_BUS_NAME`).
- **Phase 2**: Delete Telegram rule + forwarder Lambda. Bus still works, email proof still delivers.
- **Phase 3**: Delete CloudFormation/alarm rules. Deployments and canaries unaffected.

---

## Cost Estimate

| Component | Monthly Cost (all envs) |
|-----------|----------------------|
| EventBridge custom events (~2000/month) | < $0.01 |
| EventBridge AWS service events (CloudFormation, alarms) | Free |
| Lambda invocations (forwarders, ~2000/month) | Free tier |
| Telegram Bot API | **Free** (no message limits, no conversation fees) |
| Secrets Manager (2 secrets: bot token + chat IDs) | $0.80 |
| **Total** | **< $1/month** |

---

## Implementation Progress

| Item | Status | Notes |
|------|--------|-------|
| **Phase 1** | **COMPLETE** | Deployed on `eventandpayment` branch — 2026-02-11 |
| `app/lib/activityAlert.js` | Done | `publishActivityEvent`, `classifyActor`, `classifyFlow`, `maskEmail`, `maskVrn` |
| `app/lib/visitorClassifier.js` | Done | `classifyVisitor` — human / ai-agent / crawler |
| `app/unit-tests/lib/activityAlert.test.js` | Done | Classification logic, masking, event envelope, graceful no-op |
| `app/unit-tests/lib/visitorClassifier.test.js` | Done | AI agents, crawlers, standard browsers |
| `app/functions/account/sessionBeaconPost.js` | Done | `POST /api/session/beacon` — public, no auth |
| `web/public/lib/session-beacon.js` | Done | Client-side beacon, sessionStorage marker, fire-and-forget |
| CDK: OpsStack — EventBridge custom bus | Done | `{prefix}-activity-bus` + email proof rule → SNS alertTopic |
| CDK: SubmitSharedNames — session beacon + activityBusName | Done | All billing + session beacon Lambda names added |
| CDK: AccountStack — session beacon Lambda | Done | `ingestReservedConcurrency(1)`, `events:PutEvents` grant |
| CDK: AccountStack — `ACTIVITY_BUS_NAME` on all Lambdas | Done | + `events:PutEvents` IAM on all existing Lambdas |
| CDK: AuthStack — `ACTIVITY_BUS_NAME` on all Lambdas | Done | cognitoTokenPost, customAuthorizer |
| CDK: HmrcStack — `ACTIVITY_BUS_NAME` on all Lambdas | Done | hmrcTokenPost, hmrcVatReturnPost/Get, hmrcVatObligationGet |
| Lambda instrumentation (13 Lambdas) | Done | Fire-and-forget `publishActivityEvent().catch(() => {})` in all |
| `.env.test` — `ACTIVITY_BUS_NAME` | Done | `ACTIVITY_BUS_NAME=test-activity-bus` |
| All unit tests pass (767 tests) | Done | |
| Maven `./mvnw clean verify` | Done | BUILD SUCCESS |
| **Phase 2** | **CODE COMPLETE** | Awaiting deployment — see details below |
| `app/functions/ops/activityTelegramForwarder.js` | Done | EventBridge target Lambda: resolve secrets, route by (actor, flow, env), POST to Telegram Bot API |
| `app/unit-tests/functions/activityTelegramForwarder.test.js` | Done | Markdown escaping, message formatting, all routing combinations, handler integration, error handling |
| CDK: `OpsStack.java` — Telegram forwarder Lambda | Done | `Lambda` construct, reserved concurrency 2, 10s timeout, `ENVIRONMENT_NAME` env var |
| CDK: `OpsStack.java` — EventBridge rule | Done | Single catch-all rule matching all `ActivityEvent` → forwarder Lambda |
| CDK: `SubmitSharedNames.java` — forwarder naming | Done | `activityTelegramForwarderLambda*` fields |
| CDK: `SubmitApplication.java` — `baseImageTag` | Done | OpsStack now receives `baseImageTag` for Docker Lambda creation |
| All unit tests pass (799 tests) | Done | |
| Maven `./mvnw clean verify` | Done | BUILD SUCCESS |
| CDK: `OpsStack.java` — Telegram env vars | Done | `TELEGRAM_BOT_TOKEN_ARN` + `TELEGRAM_CHAT_IDS` (conditionally set when non-blank) |
| CDK: `OpsStack.java` — IAM policy | Done | `secretsmanager:GetSecretValue` on Telegram bot token ARN (with wildcard suffix) |
| CDK: `OpsStackProps` — new props | Done | `telegramBotTokenArn()`, `telegramChatIds()` with @Value.Default |
| CDK: `SubmitApplication.java` — wire Telegram props | Done | `envOr()` resolution + pass to OpsStack builder |
| `.env.ci` — `TELEGRAM_BOT_TOKEN_ARN` | Done | Points to `ci/submit/telegram/bot_token` |
| `.env.prod` — `TELEGRAM_BOT_TOKEN_ARN` | Done | Points to `prod/submit/telegram/bot_token` |
| `deploy-environment.yml` — Telegram secrets | Done | Creates `{env}/submit/telegram/bot_token` from GitHub Secret `TELEGRAM_BOT_TOKEN` |
| All unit tests pass (812 tests) | Done | |
| Maven `./mvnw clean verify` | Done | BUILD SUCCESS |
| **Phase 2: Next steps** | **Pending** | See below |
| Commit, push, deploy to CI | Not started | Feature branch `eventandpayment` |
| Manual verification: trigger event in CI, check Telegram groups | Not started | |
| **Phase 3: Deployment + Synthetic Events** | **CODE COMPLETE** | Awaiting deployment — see details below |
| `activityTelegramForwarder.js` — CloudFormation event handler | Done | `synthesizeFromCloudFormation()`: extracts stack name, status, env from ARN |
| `activityTelegramForwarder.js` — CloudWatch alarm handler | Done | `synthesizeFromCloudWatchAlarm()`: extracts alarm name, state transition, env |
| `activityTelegramForwarder.js` — `resolveEventDetail()` | Done | Dispatches by `event.source`: `aws.cloudformation`, `aws.cloudwatch`, or standard ActivityEvent |
| CDK: `OpsStack.java` — CloudFormation rule | Done | Default bus rule matching `CloudFormation Stack Status Change` (terminal statuses only) |
| CDK: `OpsStack.java` — CloudWatch alarm rule | Done | Default bus rule matching `CloudWatch Alarm State Change` |
| Unit tests for all Phase 3 functions | Done | Synthesizers, event detail resolver, handler integration tests |
| All unit tests pass (812 tests) | Done | |
| Maven `./mvnw clean verify` | Done | BUILD SUCCESS |
| **Phase 4** | **Scrapped** | Email notifications from Stripe/PayPal are sufficient |

---

## Human Actions Required Before Phase 2

Phase 2 (Telegram Delivery) requires a Telegram bot and groups. **All steps completed 2026-02-11.**

### 1. Create a Telegram Bot — DONE

- [x] Created bot via `@BotFather`
- [x] Bot name: `diyaccounting`, username: `@diyaccounting_bot`
- [x] Bot token received
- [x] Privacy mode disabled (so bot sees group messages for chat ID retrieval)

### 2. Create 4 Telegram Groups — DONE

- [x] `diy-ci-test` — CI test activity
- [x] `diy-ci-live` — Unexpected real usage against CI
- [x] `diy-prod-test` — Test runs against prod
- [x] `diy-prod-live` — **The business channel** — real customer activity
- [x] Bot added to all 4 groups
- [x] Test message sent to `diy-ci-test` — verified delivery

### 3. Chat IDs Retrieved — DONE

Retrieved via `getUpdates` API:

| Group | Chat ID |
|-------|---------|
| `diy-ci-test` | `-5250521947` |
| `diy-ci-live` | `-5278650420` |
| `diy-prod-test` | `-5144319944` |
| `diy-prod-live` | `-5177256260` |

### 4. GitHub Actions Secrets and Variables — DONE

Secrets and variables are stored in GitHub Actions. The `deploy-environment.yml` workflow propagates them to AWS Secrets Manager during deployment. **No direct AWS writes.**

**GitHub Actions Secrets** (sensitive — bot token is an API credential):

| Secret | Purpose |
|--------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API authentication |

**GitHub Actions Variables** (non-sensitive configuration — chat IDs are public identifiers):

| Variable | Value | Purpose |
|----------|-------|---------|
| `TELEGRAM_CHAT_IDS` | `{"ci-test":"-5250521947","ci-live":"-5278650420","prod-test":"-5144319944","prod-live":"-5177256260"}` | Routing targets |

### 5. Verify Email Proof (Optional but Recommended)

Before building the Telegram forwarder, verify the Phase 1 email proof rule is working:
- [ ] Subscribe an email address to the `alertTopic` SNS topic in OpsStack
- [ ] Trigger a login in CI environment
- [ ] Confirm email arrives with the activity event JSON

---

## Telegram Bot API Reference

The Telegram Bot API is a simple HTTPS interface. No SDK is required.

### Send a message

```
POST https://api.telegram.org/bot{token}/sendMessage
Content-Type: application/json

{
  "chat_id": "-1001234567890",
  "text": "*[submit/prod]* Login: u\\*\\*\\*@example.com",
  "parse_mode": "Markdown"
}
```

Response: `200 OK` with message details, or `4xx`/`5xx` with error description.

### Key API details

| Property | Value |
|----------|-------|
| Base URL | `https://api.telegram.org/bot{token}/` |
| Auth | Token in URL path (no headers needed) |
| Rate limit | 30 messages/second to different chats (more than enough) |
| Message limit | 4096 characters per message |
| Markdown | Supports `*bold*`, `_italic_`, `` `code` ``, `[link](url)` |
| Error handling | Returns JSON `{ ok: false, description: "..." }` on failure |
| Retry | Safe to retry on 429 (rate limit) with `retry_after` seconds |

### Markdown escaping

Characters that need escaping in Telegram Markdown v1: `_`, `*`, `` ` ``, `[`. The forwarder Lambda must escape these in dynamic content (email addresses, stack names, etc.) but not in the formatting we add ourselves.

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Telegram bot token | **Done** | `@diyaccounting_bot`, stored in GitHub Actions Secret `TELEGRAM_BOT_TOKEN` |
| 4 Telegram groups + chat IDs | **Done** | Stored in GitHub Actions Variable `TELEGRAM_CHAT_IDS` |
| Stripe webhook (for donations) | Scrapped (Phase 4) | Email notifications are sufficient |
| PayPal webhook (for donations) | Scrapped (Phase 4) | Email notifications are sufficient |
| EventBridge custom bus | **Done** | `OpsStack.java` — Phase 1 complete |
| EventBridge patterns in CDK | Exists | `ObservabilityStack.java` has EventBridge rules for GuardDuty/SecurityHub |
| SNS publish pattern | Exists | `interestPost.js` lines 72-80 — similar but we use EventBridge instead |
| Test user classification signals | Exists | Cognito native auth, `@test.diyaccounting.co.uk`, `hmrcAccount` header |

---

## References

- `PLAN_WHATSAPP_ALERTING.md` — Original plan (abandoned due to Meta Business platform complexity)
- `PLAN_PAYMENT_INTEGRATION.md` — Stripe subscription plan (webhook pattern)
- `PLAN_SECURITY_DETECTION_UPLIFT.md` — Security alerting (EventBridge rules for GuardDuty/SecurityHub)
- `_developers/archive/PLAN_STRIPE_1.md` — Completed Stripe donations on spreadsheets
- `scripts/enable-cognito-native-test.js` — Test user creation (Cognito native auth)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java` — Existing EventBridge rule patterns
- `infra/main/java/co/uk/diyaccounting/submit/stacks/OpsStack.java` — Existing alertTopic + canary alarms
- [Amazon EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/) — $1/million custom events, AWS service events free
- [Telegram Bot API docs](https://core.telegram.org/bots/api) — Full API reference
- [Telegram Bot FAQ](https://core.telegram.org/bots/faq) — Rate limits, group behaviour, privacy mode
