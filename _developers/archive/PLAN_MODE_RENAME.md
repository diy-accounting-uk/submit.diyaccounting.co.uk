# Plan: rename the HMRC routing mode to synthetic

The HMRC routing mode `hmrcAccount` takes the values `synthetic` and `live`. The value `sandbox`
goes away. The Stripe test-mode flag, which the billing webhook currently folds into the same
`qualifiers.sandbox` bundle field, gets a field of its own. The monitoring vocabulary that owns
the word "synthetic" today moves to "probe" so the two never collide.

Four pull requests, in the order below. Each one deploys and passes on its own.

---

## The two names

**Monitoring vocabulary becomes `probe`.** It is the standard word for an outside-in check
(liveness probe, blackbox probe), it is unused as a domain term in this repo, and it stays clear
of AWS CloudWatch Synthetics, whose canary vocabulary we keep.

**The Stripe test flag becomes `qualifiers.stripeTestMode`.** It names Stripe's own mode, so it
can never be read as the HMRC routing mode.

---

## Where the line falls on HMRC's own word

HMRC calls its test environment the sandbox. That word stays wherever it names HMRC's thing:

- `HMRC_SANDBOX_BASE_URI`, `HMRC_SANDBOX_CLIENT_ID`, `HMRC_SANDBOX_CLIENT_SECRET`,
  `HMRC_SANDBOX_CLIENT_SECRET_ARN` and their CDK props (`hmrcSandboxBaseUri()`,
  `hmrcSandboxClientId()`, `hmrcSandboxClientSecretArn()`).
- The `Gov-Test-Scenario` header and its OpenAPI description "HMRC sandbox test scenario".
- `scripts/create-hmrc-test-user.js` and `.github/workflows/create-hmrc-test-user.yml`, which
  drive HMRC's own test-user API.
- Page copy that tells a user their calls reach HMRC's sandbox.

Everything else is ours and moves: the mode value, the header, the qualifier, the element ids,
the CSS class, the variable names, the npm script suffixes.

Two unrelated homographs also stay: the `sandbox="..."` iframe attribute in
`web/public/simulator.html`, and `--no-sandbox` in the Lighthouse Chrome flags in `package.json`.

---

## Stored data: one-off migrations, no read-both window

`qualifiers.sandbox` lives on bundle records in `ci-env-bundles` and `prod-env-bundles`
(partition key `hashedSub`, sort key `bundleId`). The repo forbids compatibility adaptors, so
nothing in `app/` or `web/` ever reads two field names. The data moves through the existing
migration runner instead: numbered scripts in `scripts/migrations/`, dispatched by
`.github/workflows/run-migrations.yml`, recorded once under `hashedSub = "system#migrations"`.

Dry run: every migration honours `MIGRATION_DRY_RUN=true`, counting matched items and logging the
first ten keys without writing. Run it against `ci` with the flag, then against `ci` for real,
then against `prod` the same way.

**`scripts/migrations/004-backfill-stripe-test-mode.js`** — phase `pre-deploy`, ships with the
Stripe PR.

```
Scan   ci-env-bundles / prod-env-bundles
Filter attribute_exists(stripeSubscriptionId)
   AND attribute_exists(qualifiers.sandbox)
   AND attribute_not_exists(qualifiers.stripeTestMode)
   AND NOT begins_with(hashedSub, "system#")
Update SET qualifiers.stripeTestMode = qualifiers.sandbox
Key    { hashedSub, bundleId }
```

Only Stripe-created bundles get the field. A record with no `stripeSubscriptionId` was never a
subscription, so the portal never reads it.

**`scripts/migrations/005-copy-sandbox-qualifier-to-synthetic.js`** — phase `pre-deploy`, ships
with the HMRC mode PR.

```
Filter attribute_exists(qualifiers.sandbox)
   AND attribute_not_exists(qualifiers.synthetic)
   AND NOT begins_with(hashedSub, "system#")
Update SET qualifiers.synthetic = qualifiers.sandbox
```

It leaves `qualifiers.sandbox` in place, so the code running at that moment keeps working.

**`scripts/migrations/006-drop-sandbox-qualifier.js`** — phase `post-deploy`, ships in the same
PR, run after the deploy lands.

```
Filter attribute_exists(qualifiers.sandbox) AND NOT begins_with(hashedSub, "system#")
Update SET qualifiers.synthetic = if_not_exists(qualifiers.synthetic, qualifiers.sandbox)
       REMOVE qualifiers.sandbox
```

It picks up anything the old code wrote between 005 and the deploy, then removes the old field.

Deploy-window exposure, both stated so the operator can time the runs:

- Between 004 and its deploy, a Stripe **test-mode** checkout that completes writes a record with
  no `stripeTestMode`. Live-mode checkouts are unaffected, because absent and `false` mean the
  same thing to the reader. Test-mode checkouts only come from our own test passes, so hold the
  payment behaviour lane across the deploy.
- Between 005 and its deploy, `qualifiers.sandbox` is still authoritative and still present, so
  there is no gap. 006 closes the tail.

---

## Cognito users stay `synthetic-<lane>@test.diyaccounting.co.uk`

The local part does not change, now or later.

`classifyActor` in `app/lib/activityAlert.js` tests the `@test.diyaccounting.co.uk` domain before
it tests the email prefix, so these users already classify as `test-user`, never as the monitoring
class. The prefix decides nothing.

Against that, a rename mints a second durable user per lane across about twenty lanes in ci and
prod, and each is a monthly active user Cognito bills for. The durable-user design exists
precisely to stop that churn: a lane keeps one identity and rotates its password and TOTP device
per run. It would also orphan the old users, because `scripts/cleanup-test-users.js` protects the
`synthetic-` prefix from deletion, so the rename would need its own delete pass.

The classifier's other branch does move: the prefix it matches on becomes `probe-` / `+probe`,
and the value it returns becomes `"probe"`. No producer in this repo emits an address on that
branch, so nothing changes behaviour.

---

## PR one: monitoring vocabulary moves to probe

**Rename map**

| old | new |
| --- | --- |
| `.github/workflows/synthetic-test.yml` | `.github/workflows/probe-test.yml` |
| workflow `name: synthetic-test` | `name: probe-test` |
| `run-name: "synthetic test of …"` | `run-name: "probe test of …"` |
| job name `'… via synthetic test'` (×20) | `'… via probe test'` |
| `classifyActor` returns `"synthetic"` | returns `"probe"` |
| `email.startsWith("synthetic-")`, `email.includes("+synthetic")` | `"probe-"`, `"+probe"` |
| `Alarm` field `githubSyntheticAlarm` | `githubProbeAlarm` |
| construct id `"GithubSyntheticAlarm"` | `"GithubProbeAlarm"` |
| alarm name `<prefix>-github-synthetic-failed` | `<prefix>-github-probe-failed` |
| output `GithubSyntheticAlarmArn` | `GithubProbeAlarmArn` |
| dashboard widget `"GitHub Synthetic Tests"` | `"GitHub Probe Tests"` |
| `SYNTHETIC_USER_AGENT_MARKER = "DIYAccountingSynthetic"` | `PROBE_USER_AGENT_MARKER = "DIYAccountingProbe"` |
| Playwright UA suffix `DIYAccountingSynthetic/1` | `DIYAccountingProbe/1` |
| canary UA `DIYAccounting-Synthetic-Monitor/1.0` | `DIYAccounting-Probe-Monitor/1.0` |
| drawio label `githubsyntheticalarm: "GitHub Synthetic Alarm"` | `githubprobealarm: "GitHub Probe Alarm"` |

The `behaviour-test` CloudWatch metric name and the apex-domain namespace keep their names. They
already say what they measure.

The Glue Data Quality ruleset in `DataQuality.java` gains `"probe"` and keeps `"synthetic"` in
`ColumnValues "actor" in [...]`. The lake is append-only and its older partitions hold rows
written with the old value; the rule describes what the table legitimately contains.

**Files**

Workflows: `.github/workflows/probe-test.yml` (git mv from `synthetic-test.yml`),
`.github/workflows/deploy.yml`, `.github/workflows/deploy-environment.yml`.

Infra: `infra/main/java/co/uk/diyaccounting/submit/stacks/OpsStack.java`,
`infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java`,
`infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/DataQuality.java`,
`infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/DataQualityTest.java`.

App: `app/lib/activityAlert.js`, `app/functions/ops/activityTelegramForwarder.js`,
`app/functions/security/scanRate404Detect.js`, `app/data/dynamoDbReceiptRepository.js`.

Scripts and config: `playwright.config.js`, `scripts/verify-analytics-pipeline.sh`,
`scripts/verify-waf-false-positives.sh`, `scripts/clean-drawio.cjs`.

Tests to update: `app/unit-tests/lib/activityAlert.test.js` (the classifier cases and
`resolveActorClass`), `app/unit-tests/functions/activityTelegramForwarder.test.js` (routing case
and the `prod-app-github-synthetic-failed` fixture),
`app/unit-tests/functions/scanRate404Detect.test.js` (the `NOT LIKE` assertion),
`app/unit-tests/functions/bundleGet.handler.test.js` (test description).

Docs: `REPORT_ALARM_AUDIT.md`, `REPORT_REPOSITORY_CONTENTS.md`, `AWS_ARCHITECTURE.md`,
`RUNBOOK_INFORMATION_SECURITY.md`, `CLAUDE.md`, `.claude/skills/site-video-capture/SKILL.md`,
`_developers/ALARM_AUDIT_2026-09.md`, `_developers/PIPELINE_PROFILE_2026-09.md`,
`_developers/backlog/ALARM_VALIDATION_STRATEGY.md`, `_developers/design/vat-read-endpoints.md`,
`_developers/design/site-video-capture.md`. Files under `_developers/archive/` stay as written.

Leave every AWS-owned name alone: the `software.amazon.awscdk.services.synthetics.*` imports,
`Runtime.SYNTHETICS_NODEJS_PUPPETEER_11_0`, the `CloudWatchSynthetics` metric namespace, the
`CloudWatchSyntheticsFullAccess` managed policy, `require('Synthetics')` and `SyntheticsLogger`
inside the canary bodies, and `AWS::Synthetics::Canary` in the `diagram:*` npm scripts.

**Verification**

- `npm run test:unit` — the four unit test files above.
- `./mvnw clean verify` — the CDK build and `DataQualityTest`.
- `npm run test:submitVatBehaviour-proxy` — proves the renamed Playwright user agent still drives
  a full journey.
- `npm run test:system` is not reached by this change.

**What the operator sees change**

- The workflow list loses `synthetic-test` and gains `probe-test`; every `deploy.yml` child job
  reads "via probe test".
- CloudWatch replaces `ci-*-app-github-synthetic-failed` and `prod-*-app-github-synthetic-failed`
  with `-github-probe-failed`. The construct id changes, so CloudFormation deletes the old alarm
  and creates the new one. Alarm history does not carry over.
- The consolidated dashboard's row-two widget is titled "GitHub Probe Tests". Its data is
  continuous, because the metric name and namespace are unchanged.
- New Telegram alarm messages carry the new alarm name.

---

## PR two: the Stripe test flag gets its own qualifier

After this PR the two flags are separate. `qualifiers.sandbox` still means the HMRC routing mode.
`qualifiers.stripeTestMode` records the Stripe mode a subscription was bought in.

**Rename map**

| old | new |
| --- | --- |
| `qualifiers: { sandbox: test }` (webhook) | `qualifiers: { sandbox: test, stripeTestMode: test }` |
| `subscriptionBundle.qualifiers?.sandbox === true` (portal) | `subscriptionBundle.qualifiers?.stripeTestMode === true` |
| `const isSandbox` in `billingPortalGet.js` | `const isStripeTestMode` |
| `known.add("sandbox")` in `bundlePost.js` | also `known.add("stripeTestMode")` |

`billingCheckoutPost.js` keeps reading `qualifiers.sandbox`. Checkout picks Stripe's test mode
from the HMRC routing mode on purpose: a user in synthetic mode must never be charged for real.
The portal picks it from `stripeTestMode`, because a subscription must be managed in the mode it
was bought in. That difference is why the two fields exist.

**Files**

`app/functions/billing/billingWebhookPost.js` (the `bundleRecord` qualifiers around line 142),
`app/functions/billing/billingPortalGet.js`,
`app/functions/billing/billingCheckoutSessionGet.js` (comment naming the "sandbox client"),
`app/functions/account/bundlePost.js` (the known-qualifier allowlist around line 107),
`app/lib/stripeClient.js` (the two comments describing the `test` option),
`app/functions/non-lambda-mocks/mockBilling.js`,
`app/bin/simulator-server.js` (the seeded subscription bundles),
`scripts/migrations/004-backfill-stripe-test-mode.js` (new).

Tests to update: `app/unit-tests/functions/billingWebhookPost.test.js` (assert both fields on the
granted bundle), `app/unit-tests/functions/billingPortalGet.test.js` (drive the Stripe client
choice from `stripeTestMode`), `app/unit-tests/functions/billingCheckoutPost.test.js` (unchanged
behaviour, add a case where `stripeTestMode` is present and must not affect checkout),
`app/system-tests/billingCheckout.system.test.js`, `behaviour-tests/payment.behaviour.test.js`.

`web/public/docs/api/openapi.json` needs no change: `OpenApiGenerator.java` only documents
`qualifiers.transactionId`.

**Verification**

- `npm run test:unit` — the four billing unit test files.
- `npm run test:system` — `billingCheckout.system.test.js`.
- `./mvnw clean verify` — no infra change, run it because the PR merges to main.
- `npm run test:paymentBehaviour-proxy` — the suite that exercises checkout, webhook and portal
  end to end.

**What the operator sees change**

Nothing in CloudWatch or GitHub. One extra `run migrations` dispatch per environment, phase
`pre-deploy`, before the deploy.

---

## PR three: the HMRC mode value becomes synthetic

The biggest PR and the one that cannot be split. The mode value crosses the wire between
`web/public` and the Lambdas as the `hmrcAccount` header, so the front end, the handlers, the env
files and the behaviour tests move together.

The header name and the sessionStorage key stay `hmrcAccount`. Only the value changes.

**Rename map**

| old | new |
| --- | --- |
| header and sessionStorage value `"sandbox"` | `"synthetic"` |
| `HMRC_ACCOUNT=sandbox` | `HMRC_ACCOUNT=synthetic` |
| validation message "Must be either 'sandbox' or 'live'" | "Must be either 'synthetic' or 'live'" |
| `qualifiers.sandbox` | `qualifiers.synthetic` |
| `allowSandboxObligations` (body field, query param, checkbox id) | `allowSyntheticObligations` |
| element id `sandboxObligationsOption` | `syntheticObligationsOption` |
| element id `sandboxIndicator`, CSS class `.sandbox-indicator` | `syntheticIndicator`, `.synthetic-indicator` |
| banner text "⚠️ SANDBOX MODE - Using HMRC Test API" | "⚠️ SYNTHETIC MODE - calls go to HMRC's sandbox API" |
| `isSandbox`, `hasSandboxBundle`, `sandboxSource`, `__sandboxBundleIds` | `isSynthetic`, `hasSyntheticBundle`, `syntheticSource`, `__syntheticBundleIds` |
| `userHasSandboxBundle()` | `userHasSyntheticBundle()` |
| `isSandboxMode()` (behaviour helper) | `isSyntheticMode()` |
| `periodKeyFromAnySandboxObligation()` | `periodKeyFromAnySyntheticObligation()` |
| `getHmrcBaseUrl`'s `const isSandbox` | `const isSynthetic` |
| npm scripts `test:*Behaviour-proxy-sandbox` | `test:*Behaviour-proxy-synthetic` |
| log files `*-proxy-sandbox.log` | `*-proxy-synthetic.log` |
| simulator bundle id `hmrc-vat-sandbox` | `hmrc-vat-synthetic` |

`hmrcApi.js` and `hmrcTokenPost.js` are the boundary. They take `hmrcAccount === "synthetic"` and
read `HMRC_SANDBOX_BASE_URI`, `HMRC_SANDBOX_CLIENT_ID` and `HMRC_SANDBOX_CLIENT_SECRET_ARN`,
which keep HMRC's names.

`testPass` on the pass record and the `*-test-pass` pass type ids stay. Both are written into
issued passes, and passes in circulation carry `passTypeId` and are matched on it, so renaming
either invalidates passes that have been handed out but not redeemed. `passPost.js` maps
`result.pass?.testPass` to `qualifiers: { synthetic: true }`. Renaming the pass-side vocabulary is
separate work with its own data migration on the passes table.

**Files — handlers and services**

`app/services/hmrcApi.js`, `app/functions/hmrc/hmrcTokenPost.js`,
`app/functions/hmrc/hmrcVatReturnPost.js`, `app/functions/hmrc/hmrcVatReturnGet.js`,
`app/functions/hmrc/hmrcVatObligationGet.js`, `app/functions/hmrc/hmrcVatLiabilitiesGet.js`,
`app/functions/hmrc/hmrcVatPaymentsGet.js`, `app/functions/hmrc/hmrcVatPenaltiesGet.js`,
`app/functions/account/passPost.js`,
`app/functions/account/bundlePost.js` (the known-qualifier allowlist, `sandbox` to `synthetic`),
`app/functions/billing/billingCheckoutPost.js`, `app/functions/billing/billingWebhookPost.js`,
`app/functions/non-lambda-mocks/mockBilling.js`, `app/bin/simulator-server.js`,
`app/test-helpers/mockHelpers.js`.

**Files — web**

`web/public/developer-mode.js`, `web/public/index.html`, `web/public/bundles.html`,
`web/public/submit.js`, `web/public/submit.css`, `web/public/lib/utils/correlation-utils.js`,
`web/public/lib/auth-url-builder.js`, `web/public/lib/services/hmrc-service.js`,
`web/public/lib/test-data-generator.js`, `web/public/widgets/pass-redeemer.js`,
`web/public/widgets/auth-status.js`, `web/public/widgets/simulator-journeys.js`,
`web/public/activities/submitVatCallback.html`, `web/public/hmrc/vat/submitVat.html`,
`web/public/hmrc/vat/viewVatReturn.html`, `web/public/hmrc/vat/vatObligations.html`,
`web/public/hmrc/vat/vatLiabilities.html`, `web/public/hmrc/vat/vatPayments.html`,
`web/public/hmrc/vat/vatPenalties.html`.

Do not touch `web/public-simulator/`. It is regenerated by `scripts/build-simulator.js`.
`web/public/submit.env` holds only `HMRC_SANDBOX_*` values and stays as it is.

**Files — env, scripts, workflow env values**

`.env.proxy`, `.env.simulator`, `scripts/proxy-secrets.sh`, `scripts/build-simulator.js`
(the injected `sessionStorage.setItem('hmrcAccount', …)`),
`package.json` (fourteen `HMRC_ACCOUNT=sandbox` prefixes and the `-proxy-sandbox` script names),
`.github/workflows/probe-test.yml` (two `HMRC_ACCOUNT:` values),
`.github/workflows/deploy-app.yml`, `.github/workflows/test.yml`,
`.github/workflows/video-capture.yml`.

These move in this PR, not a later one. `behaviour-helpers.js` reads `HMRC_ACCOUNT` and compares
it to the mode value, so the env files and the code have to change together.

**Files — migrations**

`scripts/migrations/005-copy-sandbox-qualifier-to-synthetic.js`,
`scripts/migrations/006-drop-sandbox-qualifier.js`.

**Tests to update**

Unit: `app/unit-tests/functions/hmrcTokenPost.test.js`,
`app/unit-tests/functions/hmrcVatReturnPost.test.js`,
`app/unit-tests/functions/hmrcVatReturnGet.test.js`,
`app/unit-tests/functions/hmrcVatObligationGet.test.js`,
`app/unit-tests/functions/hmrcVatLiabilitiesGet.test.js`,
`app/unit-tests/functions/hmrcVatPaymentsGet.test.js`,
`app/unit-tests/functions/hmrcVatPenaltiesGet.test.js`,
`app/unit-tests/services/hmrcApi.test.js`,
`app/unit-tests/services/bundleManagement.test.js`,
`app/unit-tests/functions/billingCheckoutPost.test.js`,
`app/unit-tests/scripts/create-hmrc-test-user.test.js` (comment only),
`web/unit-tests/auth-url-generation.test.js`.

System: `app/system-tests/hmrcAuth.system.test.js`,
`app/system-tests/hmrcVatJourney.system.test.js`,
`app/system-tests/hmrcVatObligationJourney.system.test.js`,
`app/system-tests/hmrcVatScenarios.system.test.js`,
`app/system-tests/passRedemption.system.test.js`,
`app/system-tests/provisionUser.system.test.js`.

Browser: `web/browser-tests/test-data-link.browser.test.js`.

Behaviour: `behaviour-tests/helpers/behaviour-helpers.js`,
`behaviour-tests/helpers/dynamodb-assertions.js`,
`behaviour-tests/steps/behaviour-hmrc-vat-steps.js`,
`behaviour-tests/steps/behaviour-bundle-steps.js`,
`behaviour-tests/submitVat.behaviour.test.js`,
`behaviour-tests/postVatReturn.behaviour.test.js`,
`behaviour-tests/postVatReturnFraudPreventionHeaders.behaviour.test.js`,
`behaviour-tests/getVatReturn.behaviour.test.js`,
`behaviour-tests/getVatObligations.behaviour.test.js`,
`behaviour-tests/getVatLiabilities.behaviour.test.js`,
`behaviour-tests/getVatPayments.behaviour.test.js`,
`behaviour-tests/getVatPenalties.behaviour.test.js`,
`behaviour-tests/tokenEnforcement.behaviour.test.js`,
`behaviour-tests/tokenRefresh.behaviour.test.js`,
`behaviour-tests/vatSchemes.behaviour.test.js`,
`behaviour-tests/vatValidation.behaviour.test.js`,
`behaviour-tests/payment.behaviour.test.js`,
`behaviour-tests/passRedemption.behaviour.test.js`,
`behaviour-tests/bundles.behaviour.test.js`, `behaviour-tests/auth.behaviour.test.js`,
`behaviour-tests/simulator.behaviour.test.js`, `behaviour-tests/captureDemo.behaviour.test.js`.

**Verification**

- `npm run test:unit` — the twelve unit files.
- `npm run test:system` — the six system tests.
- `npm run test:browser` — `test-data-link.browser.test.js`.
- `./mvnw clean verify` — no infra change in this PR, run it because the PR merges to main.
- `npm run test:submitVatBehaviour-proxy` is the suite that proves it. The proxy variant runs
  against HMRC's real test API with `HMRC_ACCOUNT=synthetic`, so it exercises the header, the
  base-URI choice, the obligations option and the banner in one pass. Run
  `npm run test:passRedemptionBehaviour-proxy` alongside it for the qualifier grant, and
  `npm run test:getVatObligationsBehaviour-proxy` for the read endpoints.

**What the operator sees change**

- The developer banner reads "SYNTHETIC MODE" instead of "SANDBOX MODE".
- Log lines change from "Sandbox mode resolved" to "Synthetic mode resolved".
- Two `run migrations` dispatches per environment: phase `pre-deploy` before the deploy, phase
  `post-deploy` after it.
- A browser tab left open across the deploy holds `hmrcAccount=sandbox` in sessionStorage and
  gets a 400 from the handlers until the page reloads. `developer-mode.js` rewrites the key from
  the bundle qualifiers on every load, so one reload fixes it. Only test-pass holders are
  affected.
- No CloudWatch or GitHub name changes.

---

## PR four: documentation and user-facing copy

No code. Sweep the mode vocabulary through the prose so the docs match the shipped names.

**Files**

`PASSES.md`, `CLAUDE.md`, `REPORT_REPOSITORY_CONTENTS.md`, `STRATEGY.md`,
`.junie/guidelines.md`, `.github/copilot-instructions.md`, `web/public/faqs.toml` (the
`sandbox-vs-production` entry and the two mentions in the getting-started answer),
`web/public/submit.catalogue.toml` (the `resident-pro` comment),
`web/public/terms.html` (the current-status paragraph), `scripts/generate-pass.js` (the usage
comment), `_developers/design/vat-read-endpoints.md`.

`NEXT.md` and `BACKLOG.md` are the coordinator's to edit.

In the FAQ and the terms page the answer is about HMRC's environment, so the copy keeps HMRC's
word and gains ours: our mode is called synthetic, and in synthetic mode calls go to HMRC's
sandbox. Do not rename the `sandbox-vs-production` FAQ id; it is linked by anchor.

`web/public/docs/api/openapi.json` is generated by `./mvnw clean verify` from
`SubmitSharedNames.java`, and its only sandbox mentions are HMRC's `Gov-Test-Scenario`
descriptions. Leave both alone.

**Verification**

- `npm run test:unit` — the FAQ loader parses `faqs.toml`.
- `npm run test:helpBehaviour-proxy` — renders the FAQ page.
- `npm run test:complianceBehaviour-proxy` — renders the terms page.

**What the operator sees change**

Nothing deployed beyond the site copy on the FAQ and terms pages.

---

## What must not change

- HMRC's own names: `HMRC_SANDBOX_BASE_URI`, `HMRC_SANDBOX_CLIENT_ID`,
  `HMRC_SANDBOX_CLIENT_SECRET`, `HMRC_SANDBOX_CLIENT_SECRET_ARN`, the CDK props that carry them,
  the `Gov-Test-Scenario` header, and the test-user API in `scripts/create-hmrc-test-user.js` and
  `.github/workflows/create-hmrc-test-user.yml`. The same names in `app/bin/server.js`,
  `scripts/deploy-app.js`, `web/public/submit.env` and the `.env.*` files stay too, along with
  the comments in `app/http-simulator/routes/hmrc-oauth.js` and
  `app/http-simulator/scenarios/{liabilities,payments,penalties}.js` that name HMRC's scenarios.
- HMRC request and response payloads. Nothing we send HMRC carries our mode value.
- Stripe's names: `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_PRICE_ID_*`,
  `STRIPE_TEST_WEBHOOK_SECRET`, the `sk_test_` / `sk_live_` prefixes, and `event.livemode`.
  Stripe webhook payloads are Stripe's; we only read them.
- Cognito attribute names, the user pool client ids, and the durable test-user addresses.
- AWS CloudWatch Synthetics vocabulary: the CDK `synthetics` package, `SYNTHETICS_NODEJS_*`
  runtimes, the `CloudWatchSynthetics` namespace, `CloudWatchSyntheticsFullAccess`,
  `require('Synthetics')`, `SyntheticsLogger`, `AWS::Synthetics::Canary`.
- The `behaviour-test` CloudWatch metric name and the apex-domain namespace it sits in.
- The `sandbox` iframe attribute in `web/public/simulator.html` and `--no-sandbox` in the
  Lighthouse npm scripts.
- Pass type ids (`day-guest-test-pass`, `resident-pro-test-pass`, `resident-vat-test-pass`) and
  the `testPass` field on pass records.
- `web/public-simulator/`, which is generated.

---

## Coordinator checklist, per PR

Before merge:

- [ ] `git status --short` in the worktree is clean and every changed file is in the PR's list.
- [ ] `grep -rn` for each old identifier across `app/ web/public/ infra/ .github/ behaviour-tests/ scripts/ package.json .env.*` returns only the entries named under "What must not change".
- [ ] No compatibility shim: no function or branch reads both the old and the new name.
- [ ] `npm run test:unit`, `npm run test:system` and `./mvnw clean verify` pass locally.
- [ ] The PR's named behaviour suite passes on the proxy variant.

After the branch deploys:

- [ ] The GitHub Actions run for the branch is green, including its probe-test children.
- [ ] For the migration PRs: `run migrations` dispatched with `MIGRATION_DRY_RUN=true` against
      `ci`, counts read and sane, then for real against `ci`, then the same pair against `prod`.
- [ ] For the migration PRs: a spot scan of `ci-env-bundles` and `prod-env-bundles` shows zero
      items with the old field and the expected count with the new one.
- [ ] `npm run test:submitVatBehaviour-ci` passes against the deployment.
- [ ] For PR one: both `-github-probe-failed` alarms exist and sit in OK, both
      `-github-synthetic-failed` alarms are gone, and the ops dashboard's probe widget still
      plots data either side of the deploy.
