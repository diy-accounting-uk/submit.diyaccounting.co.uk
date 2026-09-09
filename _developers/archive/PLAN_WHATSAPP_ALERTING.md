<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# WhatsApp Activity Alerting — Phased Delivery Plan

**Document Version**: 3.1
**Created**: 10 February 2026
**Updated**: 10 February 2026
**Owner**: Development Team
**Issue**: [#578](https://github.com/antonycc/submit.diyaccounting.co.uk/issues/578) - Alerting in WhatsApp

---

## Overview

Build a central EventBridge event bus for business activity across the DIY Accounting estate, with WhatsApp as the first delivery channel.

The architecture uses EventBridge custom bus with declarative rule-based routing in CDK. This provides enough indirection that additional consumers (Slack, email, etc.) can be added later by creating new rules and forwarder Lambdas — without touching event producers or existing consumers.

**Sites covered**:
- **submit.diyaccounting.co.uk** — new web sessions, logins, token refreshes, bundle requests, VAT queries, VAT submissions, support tickets, pass activity
- **spreadsheets.diyaccounting.co.uk** — new web sessions, donations (Stripe and PayPal Payment Links)
- **gateway.diyaccounting.co.uk** — new web sessions

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

### WhatsApp: 4 groups

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
         WhatsApp     Email Proof   (future
         Forwarder    Lambda        consumers)
         Lambda
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
  prod-live  prod-test  ci-*
  WhatsApp   WhatsApp   WhatsApp
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

### WhatsApp Business API Setup (one-time, outside CDK)

1. Create Meta Business account at business.facebook.com
2. Add WhatsApp Business product
3. Register a phone number (can be a dedicated number or existing)
4. Create a WhatsApp Business app in Meta Developer console
5. Generate a permanent access token
6. Create message templates for approval (e.g. "Activity alert: {{1}}")
7. Store the access token in AWS Secrets Manager
8. Create 4 WhatsApp groups and store their group IDs in Secrets Manager

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

> **Note**: CloudFormation state change events and CloudWatch alarm state changes are **free** on the default EventBridge bus. We can create rules on the default bus that forward to our custom bus, or target the WhatsApp forwarder directly.

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

### Phase 2: WhatsApp Delivery

**Goal**: Add EventBridge rules for the 4 WhatsApp channels, each targeting a forwarder Lambda that posts to the WhatsApp Business API.

**Infrastructure** (`OpsStack.java`):
- 6 EventBridge rules (see Channel Routing table above): ci-test, ci-live, ci-both, prod-test, prod-live, prod-both
- Each rule targets a single WhatsApp forwarder Lambda
- The Lambda reads the matched rule name or event attributes to select the target group
- Secrets Manager ARN for WhatsApp API token + 4 group IDs

**New Lambda** (`app/functions/ops/activityWhatsAppForwarder.js`):
```
EventBridge event
  → extract (actor, flow, env, summary) from detail
  → determine target group(s) from the rule's input transformer or event attributes
  → format text: "[site/env] summary"
  → POST to WhatsApp Cloud API
```

**Message format**:
```
[submit/prod] New session: human from GB, /hmrc/vat/submitVat.html
[submit/prod] New session: ai-agent from US, /
[submit/prod] Login: u***@example.com
[submit/prod] VAT return submitted
[spreadsheets/prod] Stripe donation: GBP 5.00
[spreadsheets/prod] PayPal donation: GBP 10.00
[ci] Deployed: ci-app-ApiStack
[prod] Synthetic test: PASSED
```

**Testing**:
- Unit test: mock `fetch` to WhatsApp API, verify routing for all `(actor, flow, env)` combinations
- System test: verify Lambda processes EventBridge event correctly
- Manual test: trigger in CI, verify WhatsApp message in correct group

**Success criteria**: WhatsApp messages arrive in the correct group within 5 seconds.

---

### Phase 3: Deployment and Synthetic Test Events

**Goal**: Wire CloudFormation state changes and CloudWatch alarm transitions into the activity bus.

**Deployment alerts** (option A — EventBridge native):
- Rule on the **default** EventBridge bus matching CloudFormation `Resource Status Change` events for stacks matching `{env}-*`
- Target: the custom activity bus (cross-bus forwarding) or directly the WhatsApp forwarder
- Free (AWS service events on default bus are free)

**Deployment alerts** (option B — GitHub Actions step):
- Add a workflow step after successful CDK deploy: `aws events put-events` to the custom bus
- More explicit, tagged with `actor=ci-pipeline, flow=infrastructure`

**Synthetic test results**:
- Rule on default bus matching CloudWatch alarm state changes for canary alarms
- Tagged with `actor=system, flow=operational`
- Routes to both test + live channels

**Success criteria**: WhatsApp messages for deployments and synthetic results in both groups per environment.

---

### Phase 4: Spreadsheets Donation Webhooks (Stripe + PayPal)

**Goal**: Add webhook endpoints to the spreadsheets site that publish donation events to the activity bus from both payment providers.

> **Note**: Depends on webhook infrastructure from `PLAN_PAYMENT_INTEGRATION.md`.

**Stripe webhook handler**:
- New Lambda: `stripeDonationWebhook.js`
- Verifies Stripe webhook signature
- On `checkout.session.completed` with `mode: 'payment'`: publish to activity bus with `actor=customer, flow=user-journey`
- CDK: API Gateway route + Lambda + Stripe webhook secret from Secrets Manager

**PayPal webhook handler**:
- New Lambda: `paypalDonationWebhook.js`
- Verifies PayPal webhook signature (or IPN validation)
- On `CHECKOUT.ORDER.APPROVED`: publish to activity bus with `actor=customer, flow=user-journey`
- CDK: API Gateway route + Lambda + PayPal webhook verification secret from Secrets Manager

**Testing**:
- Unit test: mock Stripe/PayPal events, verify EventBridge publish
- System test: Stripe CLI `stripe trigger checkout.session.completed`; PayPal sandbox webhook

**Success criteria**: WhatsApp message in prod-live when a donation is completed via either provider.

---

## Privacy and Data Minimisation

All consumers receive the same masked data. PII masking happens at the source (in `activityAlert.js`), not in the consumers:

- Full email addresses → `u***@example.com` via `maskEmail()`
- VAT registration numbers → `***1234`
- No HMRC credentials, tokens, or financial amounts from VAT returns
- Donation amounts are acceptable (merchant's own revenue, not customer PII)

Each WhatsApp group should be restricted to authorised business operators.

---

## Rollback

Each phase is independently removable:
- **Phase 1**: Delete custom bus + rules. Lambdas no-op gracefully (missing `ACTIVITY_BUS_NAME`).
- **Phase 2**: Delete WhatsApp rules + forwarder. Bus still works, email proof still delivers.
- **Phase 3**: Delete CloudFormation/alarm rules. Deployments and canaries unaffected.
- **Phase 4**: Delete webhook endpoint. Stripe retries fail silently after 3 days.

---

## Cost Estimate

| Component | Monthly Cost (all envs) |
|-----------|----------------------|
| EventBridge custom events (~2000/month) | < $0.01 |
| EventBridge AWS service events (CloudFormation, alarms) | Free |
| Lambda invocations (forwarders, ~2000/month) | Free tier |
| WhatsApp Business API (2000 messages across 4 groups) | Free tier (1000 conversations/month) |
| Secrets Manager (5 secrets: WA token + 4 group IDs) | $2.00 |
| **Total** | **< $3/month** |

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
| **Phase 2** | **Not started** | Requires human actions below |
| **Phase 3** | **Not started** | |
| **Phase 4** | **Not started** | |

---

## Human Actions Required Before Phase 2

Phase 2 (WhatsApp Delivery) requires a Meta Business / WhatsApp Business API setup that cannot be automated with code. Complete these steps before starting Phase 2:

### 1. Meta Business Account

- [ ] Create or verify Meta Business account at [business.facebook.com](https://business.facebook.com)
- [ ] Complete business verification (may take 1-3 days)

### 2. WhatsApp Business API

- [ ] Add WhatsApp Business product in Meta Business Suite
- [ ] Register a phone number (dedicated or existing) for WhatsApp Business
- [ ] Create a WhatsApp Business app in [Meta Developer Console](https://developers.facebook.com)
- [ ] Generate a **permanent access token** (System User token with `whatsapp_business_messaging` permission)

### 3. Message Template

- [ ] Create a message template for approval (template review takes ~24h):
  - Template name: `activity_alert`
  - Body: `{{1}}` (single variable — the formatted alert text)
  - Category: `UTILITY`
- [ ] Wait for template approval before proceeding

### 4. WhatsApp Groups

- [ ] Create 4 WhatsApp groups:
  - `diy-ci-test` — CI test activity
  - `diy-ci-live` — Unexpected real usage against CI
  - `diy-prod-test` — Test runs against prod
  - `diy-prod-live` — **The business channel** — real customer activity
- [ ] Record the Group ID for each (visible in WhatsApp Business API group management)

### 5. Store Secrets in AWS Secrets Manager

- [ ] Store WhatsApp access token:
  ```bash
  . ./scripts/aws-assume-submit-deployment-role.sh 2>/dev/null && \
    aws secretsmanager create-secret --name "prod/submit/whatsapp/access_token" --secret-string "EAAG..."
  ```
- [ ] Store group IDs (JSON map):
  ```bash
  . ./scripts/aws-assume-submit-deployment-role.sh 2>/dev/null && \
    aws secretsmanager create-secret --name "prod/submit/whatsapp/group_ids" \
    --secret-string '{"ci-test":"GROUP_ID","ci-live":"GROUP_ID","prod-test":"GROUP_ID","prod-live":"GROUP_ID"}'
  ```

### 6. Verify Email Proof (Optional but Recommended)

Before building the WhatsApp forwarder, verify the Phase 1 email proof rule is working:
- [ ] Subscribe an email address to the `alertTopic` SNS topic in OpsStack
- [ ] Trigger a login in CI environment
- [ ] Confirm email arrives with the activity event JSON

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| Meta Business account | Not started | Required before Phase 2 |
| WhatsApp Business API approval | Not started | Message template review ~24h |
| Phone number for WhatsApp | Not started | Dedicated or existing number |
| 4 WhatsApp groups created | Not started | ci-test, ci-live, prod-test, prod-live |
| Stripe webhook (for donations) | Not started | See `PLAN_PAYMENT_INTEGRATION.md` |
| PayPal webhook (for donations) | Not started | PayPal Developer account + webhook URL registration |
| EventBridge custom bus | **Done** | `OpsStack.java` — Phase 1 complete |
| EventBridge patterns in CDK | Exists | `ObservabilityStack.java` has EventBridge rules for GuardDuty/SecurityHub |
| SNS publish pattern | Exists | `interestPost.js` lines 72-80 — similar but we use EventBridge instead |
| Test user classification signals | Exists | Cognito native auth, `@test.diyaccounting.co.uk`, `hmrcAccount` header |

---

## References

- `PLAN_PAYMENT_INTEGRATION.md` — Stripe subscription plan (webhook pattern)
- `PLAN_SECURITY_DETECTION_UPLIFT.md` — Security alerting (EventBridge rules for GuardDuty/SecurityHub)
- `_developers/archive/PLAN_STRIPE_1.md` — Completed Stripe donations on spreadsheets
- `scripts/enable-cognito-native-test.js` — Test user creation (Cognito native auth)
- `infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java` — Existing EventBridge rule patterns
- `infra/main/java/co/uk/diyaccounting/submit/stacks/OpsStack.java` — Existing alertTopic + canary alarms
- [Amazon EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/) — $1/million custom events, AWS service events free
- [WhatsApp Cloud API docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Meta Business account setup](https://business.facebook.com)
