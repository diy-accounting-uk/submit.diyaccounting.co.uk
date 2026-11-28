<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_WAVE_SET_BRAMBLE: company reports, the due list, operator tokens and diya-gl distribution

## Operator assertions (verbatim)

> Please build a /wave-set out of plans: agent credentials, PLAN_COMPANY_REPORTS, PLAN_DUE_LIST,  and PLAN_DIYA_GL_DISTRIBUTION.

(operator, 2026-11-25.) Answers to the questions that finalised the set (2026-11-25): CR14 is held for the next set, so the operator looks at the reports on ci first; AC3 to AC5 join waves 3 and 4 if the operator approves AC2's permission set before wave 3 starts, otherwise they start the next set.

> the vat payments plan should be included in PLAN_WAVE_SET_BRAMBLE.md

(operator, 2026-11-26: the rows of `PLAN_VAT_PAYMENTS.md` join this set.)

(operator, 2026-11-26: the rows of `PLAN_FILING_FEE_PROTECTION.md` join this set too.)

(operator, 2026-11-28: `PLAN_DIYA_GL_DISTRIBUTION.md` is archived to `../private.diyaccounting.co.uk/engineering/submit/archive/`, so its DIST rows and the spreadsheets waves leave this set.)

## Status

defined 2026-11-25; its rows are off `NEXT.md`, and both plans have passed `/plan-review-loop`. Bramble starts only when the operator asks for it; comet's merge does not start it (operator, 2026-11-27). On that request its rows go on the board and wave 1 branches from `origin/main`.

## The goal

Use what is paid for (the laptop, the subscriptions, the cloud workers) and spend least on what is billed by use. All the work is built and gated in local waves by the cloud workers (`/collab-loop`), then each repository pays for one ci deployment and one prod deployment.

## The set

- **submit, 18 rows**: CR4, CR5, CR6, CR7, CR8, CR9 (`PLAN_COMPANY_REPORTS.md`); CL4, DUE5 to DUE13 (`PLAN_DUE_LIST.md`); AC6, AC7 (`PLAN_AGENT_CREDENTIALS.md`). AC3, AC4, AC5 join waves 3 and 4 when AC2 is approved before wave 3 starts.
- **submit, VAT payments, 6 rows**: PAY1, PAY2, PAY3, PAY4, PAY5, PAY6 (`PLAN_VAT_PAYMENTS.md`).
- **submit, filing fee protection, 4 rows**: FFP1, FFP2, FFP3, FFP4 (`PLAN_FILING_FEE_PROTECTION.md`).
- **Beside**: AC1 (the inventory, private repository; not yet written, and AC2 follows it, so AC1 runs in wave 1 for AC3 to AC5 to join), AC2 (the permission set; the operator approves it), GLX1 (design rounds with the operator; `PLAN_DIYA_GL_PRODUCT.md` at the workspace root). OPAY1 (the operator adds Initiate payment to the sandbox application before W5, and to the production application; `PLAN_VAT_PAYMENTS.md`).
- **Left out, with the test that removed each**:
  - CR14 (test 4, the operator's answer): the reports launch in the next set, after the operator's look on ci.
  - ODUE2 (test 4): the operator tries the due list on this set's ci deploy; DUE14 (the launch) follows it in the next set.
  - AC8, AC10 (test 1): they follow AC5 and AC7 live. AC9 (test 4): the operator's settings file.
  - PAY7 (test 1): the payments launch (privacy text, availability, the prod MCP tool set, the listing text) waits on PAY6 on ci and OPAY1; it goes in the next set, as CR14 and DUE14 do.
  - OCR1 (test 4): the operator posts the licence question.

## Rules for this set

- **Append-only shared files.** In the company reports rows, `web/public/companies-house/companyReports.page.js`, the `REPORT_MODULES` map in `app/functions/companies-house/companiesHouseCompanyReportGet.js`, `app/lib/companyReports/wording.js` and the simulator files `app/http-simulator/routes/companies-house.js`, `app/http-simulator/scenarios/companies.js` and `app/http-simulator/scenarios/filing-history.js` are treated as registries: each row adds its own render function, its own map entry and its own route or scenario block, and edits no other row's lines. The integrator merges them by keeping both sides. `i18n/cy.toml`, `web/public/submit.catalogue.toml`, `app/bin/server.js`, `REPORT_CAPABILITIES.md`, the Java names classes and the counts in `infra/test/java` are registries as always. In spreadsheets, `diya-gl/README.md` is append-only per task.
- **Nothing unlaunched shows on prod.** DUE10's change to `web/public/privacy.html` moves to DUE14, the launch, so the prod privacy page describes no processing before the due list is live. DUE13's entry links on `company-filing-deadlines.html`, `get-started.html` and the home page render only where the `due-list` activity is listed (`isActivityListedInEnvironment`), so prod shows none before DUE14. PAY2 adds the activity `vat-payment` with no `prod`; the PAY3 panel renders only where it is listed, and PAY5's "pay it" step in the published plugin skill moves to PAY7, so prod shows no payment feature before PAY7.
- **A new route comes from its Lambda's props.** `ApiStack` and `ApiRoutesStack` make each route from the `lambdaFunctionProps` of the stack that owns the Lambda (`SubmitApplication.java`, the list near line 768), with the path and method in that stack's names class (`AccountNames.java`, `HmrcNames.java`, `AuthNames.java`). No row edits `infra/main/java/co/uk/diyaccounting/submit/stacks/ApiRoutes.java`.
- **`AccountStack.java` belongs to the due list rows.** DUE5 (W1), DUE10 (W2), DUE11 (W3), DUE9 (W5) and DUE12 (W6) each add their Lambda there, one batch per wave. Its Lambda count is 41 (`SubmitApplicationCdkResourceTest.java` line 306): DUE5, DUE10 and DUE9 add one each, DUE11 none and DUE12 two, so 46 at the end of the set.
- **DUE12's routes.** Its two Lambdas go in `AccountStack.java` beside the other due-list Lambdas, and the public feed path `/api/v1/public/due-calendar/` joins the `due-list` activity's `paths` in the catalogue. The feed answers only to a hashed token, so the route on prod exposes no data before DUE14.
- **AC6's Lambda** goes in `AuthStack.java`, beside `customAuthorizer`, which AC7 changes to read the same signing secret. `AccountStack.java`, which holds `operatorSnapshotGet`, belongs to the due list rows, and `IdentityStack.java` to AC3 and AC4. The JWT signing key is a secret `AuthStack` generates; no console step.
- **HMRC sandbox and Companies House.** DUE7, DUE8 and PAY6 prove on the proxy lane against the HMRC sandbox from a worker given ci credentials (`.claude/skills/new-cloud-session/new-cloud-session.sh creds <codename>`). CR9's real documents are the five `register-*.xhtml` files in `app/unit-tests/fixtures/filed-accounts/`.

## Waves (submit)

| Wave | Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|---|
| W1 | cr4 | CR4 | Sonnet | `app/lib/companyReports/filings.js`, its tests |
| W1 | cr5 | CR5 | Sonnet | `app/lib/companyReports/people.js`, its tests |
| W1 | cr7 | CR7 | Sonnet | `app/lib/companyReports/charges.js`, its tests |
| W1 | cr9 | CR9 | Sonnet | `app/lib/companyReports/accounts.js`, `app/services/companiesHouseCache.js` (`cachedAccountsFigures`, the `figures` trim), their tests |
| W1 | due5 | DUE5 | Sonnet | `app/services/dueListCompaniesHouse.js`, `app/functions/account/dueListRefresh.js`, `app/functions/companies-house/companiesHouseCompanyGet.js`, `AccountStack.java`, `SubmitApplication.java` (the Companies House key for `AccountStack`) |
| W1 | cl4 | CL4 | Sonnet | `web/public/companies-house/companySearch.page.js` and `companySearch.html` |
| W1 | ac6 | AC6 (Opus design, then Sonnet build) | Opus, Sonnet | `operator-keys/`, `app/functions/auth/operatorTokenPost.js` (new), `AuthStack.java` (the Lambda and the signing secret) |
| W1 | pay-client | PAY1 | Sonnet | `app/services/hmrcPaymentClient.js` (new), `app/http-simulator/routes/hmrc-make-payment.js` (new) and its line in `app/http-simulator/server.js`, their tests |
| W1 | fee-disputes | FFP1 | Opus, Sonnet | `app/functions/billing/billingWebhookPost.js` (the dispute and early fraud warning cases), `app/services/disputeEvidence.js` (new), `app/services/activityCharges.js`, `app/data/dynamoDbActivityChargeRepository.js`, `app/services/companiesHouseSubmissionStatus.js`, `BillingWebhookStack.java`, `infra/stripe/stripe.toml`, `scripts/fee-hold-lift.mjs` (new), their tests |
| W2 | cr8 | CR8 | Sonnet | `app/lib/companyReports/history.js`, the `profile` trim in `app/services/companiesHouseCache.js`, their tests |
| W2 | cr6 | CR6 | Sonnet | `app/lib/companyReports/capital.js`, its tests |
| W2 | due-page | DUE6 | Sonnet | `web/public/due.html`, its page script, `web/browser-tests/dueList.browser.test.js` |
| W2 | due-mail | DUE10 | Sonnet | `app/functions/account/dueListReminders.js`, `app/lib/accountSettings.js`, `web/public/settings.html`, `app/lib/customerEmailTemplates.js`, `app/lib/customerEmailRequest.js`, `app/data/dynamoDbDueListRepository.js`, `AccountStack.java` |
| W2 | ac7 | AC7 | Sonnet | `app/functions/auth/customAuthorizer.js`, `AuthStack.java` (the authorizer's read of the secret), `scripts/operator-api.mjs`, `app/functions/analytics/operatorSnapshotGet.js` and the other `GET /api/v1/operator/*` Lambdas |
| W2 | pay-routes | PAY2 | Sonnet | the two payment Lambdas, `HmrcStack.java`, `HmrcNames.java`, `DataStack.java`, `DataNames.java`, `scripts/salt-rotation-tables.json`, the `vat-payment` activity, `app/bin/server.js`, the counts in `infra/test/java`, `scripts/delete-user-data.js` |
| W3 | due-page | DUE7 | Sonnet | the due page and its script |
| W3 | due-mail | DUE11 | Sonnet | `app/functions/account/accountSettingsPut.js`, `dueListRefresh.js`, `AccountStack.java`, the settings and email files |
| W3 | ac3 | AC3 (if AC2 approved) | Sonnet | `.github/workflows/coordinator-credentials.yml`, `IdentityStack.java` |
| W3 | pay-panel | PAY3 | Sonnet | `web/public/widgets/vat-ways-to-pay.js` (new), its links module and browser test; `i18n/cy.toml` by union |
| W3 | fee-gate | FFP2 | Opus, Sonnet | `app/services/filingFeeGate.js` (new), `billingActivityCheckoutPost.js`, `billingWebhookPost.js` (`handleActivityChargeComplete`, `handleCheckoutComplete`, `invoice.paid`), `activityCharges.js`, `dynamoDbActivityChargeRepository.js`, `dynamoDbBundleRepository.js`, `companiesHouseConfirmationStatementPost.js` and `companiesHouseFormFiling.js` (the hold check and refund at filing, the refusal code), `mockBilling.js`, the filing fees table in `DataStack.java` and `DataNames.java`, `BillingStack.java`, `BillingWebhookStack.java`, `CompaniesHouseStack.java` (the Stripe keys and Query for the two fee Lambdas), `SubmitApplication.java`, `SubmitEnvironment.java`, `.env.ci`, `.env.prod`, `.env.proxy`, `.env.test`, `scripts/salt-rotation-tables.json`, `app/bin/dynamodb.js`, `LambdaEnvironmentWiringCdkResourceTest.java`, the counts in `infra/test/java` |
| W4 | due-page | DUE8 | Sonnet | the due page and its script |
| W4 | ac4 | AC4, then AC5 (if AC2 approved) | Sonnet | `.github/workflows/prod-proof.yml`, `IdentityStack.java`, `scripts/aws-session.sh` |
| W4 | pay-pages | PAY4 | Sonnet | `web/public/hmrc/vat/submitVat.page.js` (`displayReceipt`), `web/public/hmrc/receipt/receipts.page.js`, `web/public/hmrc/vat/vatLiabilities.page.js`, `vatPayments.page.js`, their browser tests, the getVatLiabilities simulator step (`behaviour-tests/getVatLiabilities.behaviour.test.js`) |
| W4 | pay-mcp | PAY5 (after PAY3 in W3) | Sonnet | `mcp/lib/handoff-tools.js`, `mcp/lib/hosted-tools.js` (`HOSTED_TOOL_NAMES` only), `mcp/lib/tool-annotations.js`, `mcp/lib/server.js`, `mcp/lib/vat-payment-links.js` (new), `mcp/test/`, `web/developer/mcp-api.html`, on comet's versions of them |
| W4 | fee-ops | FFP3 | Sonnet | `app/functions/analytics/operatorSnapshotPublish.js` (the `filingFees` block), `OperatorSnapshotPublish.java`, `AnalyticsStack.java`, `SubmitEnvironment.java`, `web/public/operator/dashboard.page.js`, `customerEmailSend.js`, `customerEmailTemplates.js` (the operator kinds), the email requests in `billingWebhookPost.js` |
| W5 | due-page | DUE9 | Sonnet | `app/functions/account/dueListUserRowPut.js`, `AccountStack.java`, the due page |
| W5 | pay-proof | PAY6 | Sonnet | the getVatLiabilities proxy suite and the mcpPrepareVatReturn simulator suite (a worker with ci credentials for the HMRC sandbox) |
| W5 | fee-ui | FFP4 | Sonnet | `web/public/companies-house/fileConfirmationStatement.page.js`, `changeCompanyName.page.js`, `terms.html` section 10, `privacy.html`, `faqs.toml`, `i18n/cy.toml` by union |
| W6 | due-page | DUE12 | Sonnet | `app/functions/account/dueListCalendarFeedPost.js`, `dueListCalendarGet.js`, `app/lib/dueListIcs.js`, `AccountStack.java`, `EdgeStack.java`, `scripts/delete-user-data.js`, the due page |
| W7 | look | DUE13, then the look pass | Sonnet | `web/public/company-filing-deadlines.html`, `get-started.html`, `index.html`, `web/public/lib/guide-journeys.js`; the guide screenshots (`npm run video:walkthrough`), `visual-review` and `ui-ux-pro-max` on the reports views, the due page and the drill-down |

The due page chain (DUE6, DUE7, DUE8, DUE9, DUE12) and the email chain (DUE10, DUE11) each stay on one worker across waves, as a queue. AC4 and AC5 run in one batch because AC5 follows AC3 and both read the coordinator key.

W1 state: pending.

## Gates

- **Each wave branch** (by the integrator worker, "The integrator" in `.claude/skills/collab-loop/SKILL.md`): the merge checks and gates of `scripts/batch-check.sh` without the docker build, `npm run build:welsh` with the Welsh proof, and the simulator suites the wave touches (`companiesHouse` for the CR rows and CL4, `dueList` from DUE6 on, `auth` and `submitVat` for AC6 and AC7, `getVatLiabilities` and `mcpPrepareVatReturn` for the PAY rows, `fileConfirmationStatement` for FFP2). PAY5 adds `npm ci` and `npm test` in `mcp/`, which the root `npm test` does not run. DUE7 and DUE8 add their proxy-lane journeys on a worker with ci credentials. A wave with a stack change runs `./mvnw clean verify` and names the stack resource totals against 500.
- **The set branch** (`claude/bramble-set`): every gate split across the idle workers (unit, java, browser, lint, all simulator suites), and the docker build on the laptop.

## The push

1. Rebase the set branch on `origin/main` (with comet merged, which lands first) and gate it again.
2. Push `claude/bramble-set`, open one PR whose body lists the rows by wave, and `/watch` it. The push makes the ci set.
3. ci proofs, inside the set's self-destruct delay:
   - CR4 to CR9: the drill-down page of a test company shows the reports index and each of the six views.
   - CL4: the accounts list shows the due filings as rows.
   - DUE5: one invoke of the refresh Lambda writes the Companies House rows of a watched test company.
   - DUE6 to DUE9, DUE12: the due page lists rows, a user row saves, the feed URL answers an iCalendar file.
   - DUE10, DUE11: the reminder job runs with the setting off and sends nothing; with it on, one email reaches the synthetic test user.
   - AC6, AC7: a token from a listed key reads `/api/v1/operator/snapshot` on ci; an unlisted key gets 401, and an expired token gets 401 once the authorizer's 5-minute result cache has passed.
   - ODUE2: the operator tries the due list on the ci set (`PLAN_DUE_LIST.md` ODUE2).
   - PAY6: a sandbox payment journey started from the ci liabilities page reaches HMRC's sandbox journey, its status reads back on the liabilities page, the journey record reads by key, and the `hmrc-vat-payment-*` events are in the ci lake.
   - FFP1 to FFP4: the Proof in `PLAN_FILING_FEE_PROTECTION.md`. A subscriber within ci's 1-hour cooling-off is refused (`fee-cooling-off`); a pass-only account is refused (`fee-needs-paid-subscription`); a fee paid with another card is refunded (`fee-card-not-subscription`); a second fee is refused (`fee-subscriber-cap`); a test-card dispute and an early fraud warning on the subscription hold the account; the dashboard panel and the operator emails show them. The contest path and the refund at filing are proved by unit tests.
4. `/auto-merge` with `--merge`; `/watch` over `main`; `deploy-finish.yml` destroys the outgoing prod set.
5. prod proofs: the deploy is healthy and no new activity is listed (`company-reports` and `due-list` list no `prod`); AC7's `scripts/operator-api.mjs /api/v1/operator/snapshot` returns the prod snapshot with the operator's key.

## After the deploy

- The next set: PAY7 (the payments launch, after PAY6 on ci and OPAY1), CR14 (reports launch), DUE14 (due list launch, after ODUE2, with DUE10's privacy text), AC8 and AC10 (after AC5 and AC7 are live), and AC3 to AC5 if AC2 was approved after wave 3 started.
- AC9 is the operator's: the ask rule in `.claude/settings.json`.

## When the set branch fails

Push a prefix: the tip of the last wave whose gates passed and whose rows need nothing from the waves after it. Wave 2 is a valid prefix (the reports, CL4, the due list's first page and emails, the operator token). The waves after it start the next set, rebased on the new `main`.
