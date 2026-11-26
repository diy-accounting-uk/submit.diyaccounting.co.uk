<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_VAT_PAYMENTS: pay the VAT from Submit, beside the VAT return

## Operator assertions (verbatim)

> Create a plan to fully support initiating payments with options including the payment API, links to HMRC services, links to HMRC payment documentation and account details and integration into MCPs alongside teh VAT submission.

> the vat payments plan should be included in PLAN_WAVE_SET_BRAMBLE.md

(operator, 2026-11-26.)

## Status

defined 2026-11-26; PAY1 to PAY6 are in wave set bramble (`PLAN_WAVE_SET_BRAMBLE.md`, waves 1 to 5) and PAY7 is in the set after it; bramble is off `NEXT.md` until the operator boards it. Run `/plan-review-loop` on this plan before the rows are boarded.

## The goal

After a VAT return is filed, and on the VAT liabilities and payments pages, the customer can pay what they owe in the way that suits them, without leaving Submit to find out how:

1. **Pay now through HMRC.** Submit starts HMRC's own payment journey with the VAT registration number and the amount filled in (HMRC's Initiate payment API), the customer pays on GOV.UK, and Submit shows the outcome on the receipt.
2. **Pay by bank transfer.** Submit shows HMRC's VAT bank details and the customer's payment reference, with a copy button for each.
3. **Pay by Direct Debit.** Submit links to the place where the customer sets one up in their HMRC online account, and says how far ahead of the due date it must be in place. No HMRC API sets up a Direct Debit (checked 2026-11-26: the Developer Hub's only payment API is Initiate payment).
4. **Read HMRC's own guidance.** Links to GOV.UK's "Pay your VAT bill" pages, the due dates, and late payment penalties and interest.
5. **From an AI assistant.** The hosted MCP gains a tool that gives the payment link and the other ways to pay, alongside `prepare_vat_return`, so a person who prepares the return in ChatGPT or Claude can pay it the same way.

Submit never takes, holds or forwards money, and never sees card or bank details: the payment happens on HMRC's pages. Submit takes no fee for a payment and a payment costs no token.

## The facts the rows rely on

- **Initiate payment API** (`third-party-payments-external-api` 1.0, spec version 1.0.3): https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/third-party-payments-external-api/1.0. A copy of the OpenAPI file is `../private.diyaccounting.co.uk/hmrc/developer/apis/third-party-payments-external-api-1.0/openapi.yaml`.
  - Base paths: sandbox `https://test-api.service.hmrc.gov.uk/payments/make-payment`, production `https://api.service.hmrc.gov.uk/payments/make-payment`. Header `Accept: application/vnd.hmrc.1.0+json`.
  - `POST /pay` is **application-restricted** (an OAuth client-credentials token, no customer sign-in to HMRC). Body: `taxRegime` (`Vat` or `SelfAssessment`), `reference` (for VAT the 9-digit VRN), `amountInPence` (0 lets the customer type the amount), optional `backURL` and `friendlyName` (omit them, never send null). Answer 201: `redirectURL` and `clientJourneyId` (a UUID).
  - `GET /status` with the `clientJourneyId`: `taxRegime`, `amountInPence` paid, `paymentStatus` (`Completed`, `Failed`, `InProgress`). The sandbox takes a `Gov-Test-Scenario` header for the outcomes.
  - The sandbox journey pays by open banking through "Coutts sandbox".
  - HMRC announced it to developers on 2025-12-09 (SDST email "Initiate Payments API - VAT MTD", in the mail mirror). The same email says the government will consult on making Direct Debit compulsory for VAT; the rows build so that the Direct Debit option can become the lead option without a rework.
- **What Submit has today**: the VAT liabilities and payments pages (`web/public/hmrc/vat/vatLiabilities.page.js`, `vatPayments.page.js`) read HMRC's VAT API through `app/functions/hmrc/hmrcVatLiabilitiesGet.js` and `hmrcVatPaymentsGet.js`; the receipt after a filing (`web/public/hmrc/receipt/receipts.page.js`); the VAT Lambdas in `infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcStack.java` with their names in `names/HmrcNames.java`; the HMRC simulator `app/http-simulator/server.js`; the hosted MCP tools `PROD_HOSTED_TOOL_NAMES` in `mcp/lib/hosted-tools.js` (line 69) and the hand-off tool `prepare_vat_return` in `mcp/lib/handoff-tools.js`.
- **Production access**: the API is public in sandbox and production with no restricted marking. Submit's production application (CMQAA-531) must have the API added in the Developer Hub; whether HMRC reviews that subscription is not documented. That is OPAY1.

## Tasks

| Id | Task | Who | Model | Size | Follows |
|---|---|---|---|---|---|
| PAY1 | The payment client and simulator | Claude Code | Sonnet | ~6 files | none |
| PAY2 | The payment routes, Lambdas, activity and journey store | Claude Code | Sonnet | ~16 files | PAY1 |
| PAY3 | The ways-to-pay panel | Claude Code | Sonnet | ~8 files | PAY2 |
| PAY4 | The panel on the receipt, the liabilities and the payments pages | Claude Code | Sonnet | ~8 files | PAY3 |
| PAY5 | The MCP payment tool | Claude Code | Sonnet | ~6 files | PAY2 |
| PAY6 | The proofs on the simulator, the proxy and the sandbox | Claude Code | Sonnet | ~4 files | PAY4, PAY5 |
| PAY7 | The launch: privacy, availability, guide, listing text | Claude Code | Sonnet | ~8 files | PAY6, OPAY1 |
| OPAY1 | The operator adds Initiate payment to the production application | Operator | — | 0 files | none |

### PAY1. The payment client and simulator

`app/services/hmrcPaymentClient.js` (new): `startPayment({ taxRegime, reference, amountInPence, backURL, hmrcAccount })` (`taxRegime` `Vat` or `SelfAssessment`, `reference` the VRN or the UTR, so the Income Tax follow-on, `PLAN_ITSA_APPROVAL.md` ISA6, needs no refactor) calls `POST /pay` with an application-restricted token, and `paymentStatus(clientJourneyId, { hmrcAccount })` calls `GET /status`. It sends `friendlyName` "DIY Accounting Submit" and the receipt URL as `backURL`, omits absent fields, and maps HMRC's 400 `errors` to one named error.

- **The token.** The only client-credentials flow today is `sandboxAccessToken` in `app/functions/hmrc/hmrcFphCheckWorker.js` (line 77): sandbox only (`HMRC_SANDBOX_CLIENT_ID`, `HMRC_SANDBOX_CLIENT_SECRET_ARN`, `HMRC_SANDBOX_BASE_URI`), a cached token, and one re-read of a rolled secret through `refreshAfterAuthFailure`. Copy that pattern into the client and pick the application as `getHmrcBaseUrl` in `app/services/hmrcApi.js` (line 57) picks the base: `hmrcAccount` `synthetic` gives the sandbox values, anything else `HMRC_BASE_URI`, `HMRC_CLIENT_ID` and `HMRC_CLIENT_SECRET_ARN`. Keep one cached token per application. Call through `recordedFetch` with `org: "hmrc"` and `actor: "system"`, as the worker does.
- **Fraud prevention headers.** They go on these calls only if HMRC's spec or the validator asks for them on application-restricted calls (check `../private.diyaccounting.co.uk/hmrc/developer/fraud-prevention/` and `../private.diyaccounting.co.uk/hmrc/developer/apis/third-party-payments-external-api-1.0/openapi.yaml`; say which in the report).
- **Simulator.** A new route file `app/http-simulator/routes/hmrc-make-payment.js` (the name `vat-payments.js` is taken by the VAT payments read) with `POST /payments/make-payment/pay` and `GET /payments/make-payment/status`, the three outcomes selectable as the sandbox's `Gov-Test-Scenario` is, registered with one import and one call in `app/http-simulator/server.js`. The simulator's token route answers `client_credentials` already (`app/http-simulator/routes/hmrc-oauth.js` line 368).
- **Tests and gates.** Unit tests of the client against the simulator: each outcome, a 400, a rolled secret, absent fields omitted. `npm run bundle` first in a worktree; `npx vitest run` on the new tests; `npx eslint` and `npx prettier --check` on each changed file; `npm test` before the batch lands.

### PAY2. The payment routes, Lambdas and journey store

Two routes: `POST /api/v1/hmrc/vat/payment` (starts a journey for the signed-in customer's VRN and an amount) and `GET /api/v1/hmrc/vat/payment/{clientJourneyId}` (reads the status, only for the customer who started it).

- **The VRN check.** Submit keeps no record of which VRNs a customer read obligations for (the page keeps the VRN in `sessionStorage`). So the start route takes the customer's HMRC access token as the VAT reads do (`extractHmrcAccessTokenFromLambdaEvent`, `app/functions/hmrc/hmrcVatLiabilitiesGet.js` line 163) and reads the VRN's liabilities with it before it starts the journey. HMRC's 200 proves the customer's grant covers the VRN; a 403 refuses the start. No customer starts a journey for another business.
- **The activity.** A new activity `vat-payment` in `web/public/submit.catalogue.toml`, with `vat-obligations`'s bundles, `metered = false`, the paths `^/api/v1/hmrc/vat/payment.*`, and `environments` without `prod` until PAY7. `vat-obligations`'s path `^/api/v1/hmrc/vat.*` matches these routes too, so each Lambda calls `enforceBundles(event, { activityId: "vat-payment" })` (the option at `app/services/bundleManagement.js` line 152), which applies the environment list. Update `app/unit-tests/services/prodSurface.test.js`, `app/unit-tests/services/productCatalog.test.js`, `web/unit-tests/catalogue-names.test.js` and `web/unit-tests/catalog-paths.test.js`, and the Welsh name in `i18n/cy.toml`.
- **The journey store.** A record (customer, VRN, period key when known, amount, `clientJourneyId`, created time, last status) in a new env table, `{env}-env-vat-payment-journeys`, made with `ensureTable` in `DataStack.java` as `dueListTable` is (line 1192): partition key `hashedSub`, sort key `clientJourneyId`, PITR, TTL on `ttl`, names in `DataNames.java`. A table keyed by `hashedSub` joins `scripts/salt-rotation-tables.json`, which `SaltRotationTablesTest.java` checks. Queried by key, never scanned; the receipt links to it by period key.
- **Events.** `hmrc-vat-payment-started` and `hmrc-vat-payment-status` through `publishActivityEvent` (`app/lib/activityAlert.js` line 59), amount banded, no VRN in the event, into the lake's `activity_events`.
- **The stack.** Lambdas in `HmrcStack.java` with their names, paths and methods in `HmrcNames.java`. The routes come from `HmrcStack`'s `lambdaFunctionProps`; no edit of `ApiRoutes.java`. Express routes in `app/bin/server.js`. Give the Lambdas the table and the HMRC client secrets PAY1 reads.
- **Counts, from -> to.** `hmrcStackTemplate.resourceCountIs("AWS::Lambda::Function", 47)` -> 49 (`infra/test/java/co/uk/diyaccounting/submit/SubmitApplicationCdkResourceTest.java` line 91) and the HMRC `assertGroupedStackHealthAlarm` list; `assertApiRoute` for the two routes; `apiStackTemplate` stays under `assertResourceTotalUnder` 450; `Custom::AWS` 157 and `Custom::EnsurePitr` 68 in `SubmitEnvironmentCdkResourceTest.java` (lines 145 and 146) rise by what the new table adds. Name each new value in the report.
- **Deletion.** `scripts/delete-user-data.js` deletes a customer's journeys (DUE12 edits the same file in wave 6).
- **Gates.** `npm run bundle` first in a worktree; the route tests (start with a 403 from HMRC refused, status for another customer refused, the environment list); `npx eslint` and `npx prettier --check` on each changed file; `./mvnw clean verify`; `npm test` before the batch lands.

### PAY3. The ways-to-pay panel

One shared widget (`web/public/widgets/vat-ways-to-pay.js`, new) that, given a tax regime, a reference (the VRN for VAT), an amount and a due date, shows in this order (it is built and tested for VAT here; ISA6 adds Self Assessment's bank details and links):

1. **Pay now through HMRC**: a button that calls PAY2's start route and sends the browser to `redirectURL`; on return (the `backURL`) it reads the status and shows "Paid £X on <date>", "Payment failed" or "Payment in progress".
2. **Bank transfer**: HMRC's VAT account name, sort code and account number, and the payment reference (the VRN), each with a copy button. The bank details are read once from GOV.UK's "Pay your VAT bill: bank details" page by the builder of this row, written into one constant with the page's URL beside it, and checked by a test against that constant only.
3. **Direct Debit**: a link to GOV.UK's Direct Debit page for VAT and a sentence on the lead time HMRC states there.
4. **Due date and help**: the due date, links to GOV.UK's "Pay your VAT bill", "How late payment penalties work" and interest pages.

Every GOV.UK link opens in a new tab and is a constant in one module with its title (`web/public/lib/vat-payment-links.js`, new). The panel renders only where the `vat-payment` activity is listed (`isActivityListedInEnvironment` through `web/public/lib/services/catalog-service.js`), so prod shows nothing before PAY7. Welsh strings in `i18n/cy.toml`. A browser test for each state, with the routes stubbed, and one that the panel is absent where the activity is not listed. Gates: `npm run bundle` first in a worktree; `npx playwright test` on the new browser test; `npx eslint` and `npx prettier --check` on each changed file; `npm run build:welsh`; `npm test` before the batch lands.

### PAY4. The panel on the receipt, the liabilities and the payments pages

The receipt after a VAT filing shows the panel when the return pays HMRC, with the box 5 amount and the period's due date; a repayment return shows "HMRC owes you £X" and no panel. Box 5 is always the size of the difference (`calculateNetVatDue`, `web/public/hmrc/vat/submitVat.page.js` line 24: `Math.abs(box3 - box4)`), so the direction comes from box 3 (`totalVatDue`) against box 4 (`vatReclaimedCurrPeriod`). The receipt after a filing is drawn by `displayReceipt` in `submitVat.page.js` (line 627, figures in `RECEIPT_FIGURES` at line 572); the stored receipts page is `web/public/hmrc/receipt/receipts.page.js`. Both show the panel. `vatLiabilities.page.js` shows the panel for each outstanding liability with its own amount and due date; `vatPayments.page.js` links each payment HMRC has received to its journey when the amounts match. A filed return's receipt keeps the payment outcome. The filing form's own steps are unchanged; the panel is added after the receipt. The panel's environment rule (PAY3) holds on every page. Gates: `npm run bundle` first in a worktree; `web/browser-tests/receipts.browser.test.js`, `vatReadPages.browser.test.js` and `submitVatStatus.browser.test.js` with the panel's cases; `npx eslint` and `npx prettier --check` on each changed file; `npm test`; `npm run test:submitVatBehaviour-simulator` with a step that pays from the receipt on the simulator.

### PAY5. The MCP payment tool

A hosted MCP tool `prepare_vat_payment` in `mcp/lib/handoff-tools.js` beside `prepare_vat_return`: for a VRN and a period (or an amount), it answers the amount due, the due date, a link to Submit's receipt or liabilities page that opens the panel (the customer presses "Pay now" there, so the payment journey always starts from the customer's own browser session), the bank details and reference, and the Direct Debit and guidance links. It never calls `POST /pay` itself and never says a payment was made. Annotate it as a read (`READS`, `mcp/lib/tool-annotations.js` line 10) and add it to `HOSTED_TOOL_NAMES` (`mcp/lib/hosted-tools.js` line 24). It joins `PROD_HOSTED_TOOL_NAMES` in PAY7, and so does the "pay it" step in both copies of the plugin skill (`plugins/diya-submit/skills/file-a-uk-vat-return/SKILL.md`, `plugins/diya-submit-chatgpt/skills/file-a-uk-vat-return/SKILL.md`), because `mcp/test/plugin.test.js` holds the ChatGPT skill to prod's tools and the published skill is on prod.

- **Comet first.** Wave set comet lands before this set and changes the same files: DSC5 adds `?utm_source=<client>&utm_medium=mcp` to `vatHandoffLink` and a `client` on the session object in `handoff-tools.js`; DSC4 rewrites the prod tool descriptions and `PROD_HOSTED_INSTRUCTIONS`, and DSC6 may widen `PROD_HOSTED_TOOL_NAMES` from 6 to 11, in `hosted-tools.js`. Build on comet's versions, and use its link builder for the receipt and liabilities links.
- **Tests.** `mcp/test/handoff-tools.test.js` (the answer, no `POST /pay`), `mcp/test/hosted-tools.test.js` (the tool in `HOSTED_TOOL_NAMES`, absent from prod's set), `mcp/test/prod-tool-answers.test.js` and `mcp/test/plugin.test.js` unchanged and passing.
- **Gates.** `npm ci` in `mcp/` in a fresh worktree, then `npm test` there (the root `npm test` does not run the `mcp/` tests); `npx eslint` and `npx prettier --check` on each changed file; `npm run test:mcpPrepareVatReturnBehaviour-simulator` extended with the payment step.

### PAY6. The proofs on the simulator, the proxy and the sandbox

`npm run test:submitVatBehaviour-proxy` against HMRC's sandbox with a payment through the Coutts sandbox bank and the three `Gov-Test-Scenario` outcomes; the receipt shows each. The proxy lane needs ci credentials for the sandbox: a cloud worker gets them with `.claude/skills/new-cloud-session/new-cloud-session.sh creds <codename>`; on the laptop `scripts/proxy-secrets.sh` reads them. Run one suite at a time under `lockf -k /tmp/submit-simulator.lock` for the simulator suites. The ci proof list of the set gains: a sandbox payment journey started from the ci receipt reaches HMRC's sandbox journey and its status reads back on the receipt; the journey record is queryable by key; the activity events are in the ci lake. Gates: the behaviour suites named.

### PAY7. The launch: privacy, availability, guide, listing text

Held until PAY6 passes on ci and OPAY1 is done: `web/public/privacy.html` gains the payment journey record (what, why, how long, recipient HMRC); `AVAILABILITY` in `scripts/build-mtd-calendar.mjs` and `web/public/mtd-calendar.html` gain "Pay your VAT through HMRC"; the guide journey and screenshots for paying from the receipt; FAQs; `vat-payment` lists `prod` (with `prodSurface.test.js`); `prepare_vat_payment` joins `PROD_HOSTED_TOOL_NAMES`; the "pay it" step joins both copies of the `file-a-uk-vat-return` plugin skill; the plugin listing text for the next directory submission says "and pay it through HMRC" (the submission itself is the operator's, in `PLAN_ORGANIC_SEARCH.md`). Gates: `npm test`, the Welsh proof, `visual-review` on the panel.

### OPAY1. The operator adds Initiate payment to the production application

Steps 1 to 3 are the operator's:

1. Sign in to https://developer.service.hmrc.gov.uk/developer/applications and open the production application of DIY Accounting Submit (CMQAA-531).
2. Under the application's APIs, add "Initiate payment" version 1.0.
3. If HMRC asks for a review, answer it; the session drafts the answer from this plan by the email-draft skill.

The session checks the subscription from the application's API list afterwards (Claude in Chrome, read only) and records the date here.

## Proof on prod

After the set's prod deploy and PAY7: a VAT filing with tax due shows the panel on the receipt; "Pay now through HMRC" opens HMRC's payment page with the VRN and amount filled in (the operator stops before paying, or pays DIY Accounting Limited's own VAT if one is due; DIY Accounting Limited is not VAT registered, so a prod payment proof needs a customer's consent or waits for a real one); the status reads back. `prepare_vat_payment` answers on prod's hosted MCP.

## Follow-on

Self Assessment is the API's other regime: the same panel for Income Tax under MTD when that journey is on prod's public list (`taxRegime` `SelfAssessment`, reference the UTR).
