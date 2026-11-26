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

- **Initiate payment API** (`third-party-payments-external-api` 1.0, spec version 1.0.3): https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/third-party-payments-external-api/1.0. A copy of the OpenAPI file is `../private.diyaccounting.co.uk/hmrc/developer/apis/initpay.yaml`.
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
| PAY2 | The payment routes, Lambdas and journey store | Claude Code | Sonnet | ~10 files | PAY1 |
| PAY3 | The ways-to-pay panel | Claude Code | Sonnet | ~8 files | PAY2 |
| PAY4 | The panel on the receipt, the liabilities and the payments pages | Claude Code | Sonnet | ~8 files | PAY3 |
| PAY5 | The MCP payment tool | Claude Code | Sonnet | ~6 files | PAY2 |
| PAY6 | The proofs on the simulator, the proxy and the sandbox | Claude Code | Sonnet | ~4 files | PAY4, PAY5 |
| PAY7 | The launch: privacy, availability, guide, listing text | Claude Code | Sonnet | ~8 files | PAY6, OPAY1 |
| OPAY1 | The operator adds Initiate payment to the production application | Operator | — | 0 files | none |

### PAY1. The payment client and simulator

`app/services/hmrcPaymentClient.js` (new): `startPayment({ vrn, amountInPence, backURL })` calls `POST /pay` with an application-restricted token (the same client-credentials flow and secrets Submit's other application-restricted HMRC calls use; find it with `grep -rn client_credentials app/`), and `paymentStatus(clientJourneyId)` calls `GET /status`. It sends `friendlyName` "DIY Accounting Submit" and the receipt URL as `backURL`, omits absent fields, and maps HMRC's 400 `errors` to one named error. The fraud prevention headers go on these calls only if HMRC's spec or the validator asks for them on application-restricted calls (check `../private.diyaccounting.co.uk/hmrc/developer/fraud-prevention/`; say which in the report). The simulator gets `/payments/make-payment/pay` and `/status` with the three outcomes, selectable as the sandbox's `Gov-Test-Scenario` is. Unit tests for the client against the simulator. Gates: `npm test`.

### PAY2. The payment routes, Lambdas and journey store

Two routes: `POST /api/v1/hmrc/vat/payment` (starts a journey for the signed-in customer's VRN and an amount; the VRN must be one the customer has filed or read obligations for in Submit, so no customer starts a journey for another business) and `GET /api/v1/hmrc/vat/payment/{clientJourneyId}` (reads the status, only for the customer who started it). A journey record (customer, VRN, period key when known, amount, `clientJourneyId`, created time, last status) in a DynamoDB table with a TTL, queried by key, never scanned; the receipt links to it by period key. Activity events `hmrc-vat-payment-started` and `hmrc-vat-payment-status` (amount banded, no VRN in the event) into the lake's `activity_events`. Lambdas in `HmrcStack.java`, names in `HmrcNames.java`, the routes in `ApiRoutes.java` and `app/bin/server.js`, the table in `DataStack.java` with its names in `DataNames.java`; the counts in `infra/test/java` named "from -> to". `scripts/delete-user-data.js` deletes a customer's journeys. Gates: `npm test`, `./mvnw clean verify`.

### PAY3. The ways-to-pay panel

One shared widget (`web/public/widgets/vat-ways-to-pay.js`, new) that, given a VRN, an amount and a due date, shows in this order:

1. **Pay now through HMRC**: a button that calls PAY2's start route and sends the browser to `redirectURL`; on return (the `backURL`) it reads the status and shows "Paid £X on <date>", "Payment failed" or "Payment in progress".
2. **Bank transfer**: HMRC's VAT account name, sort code and account number, and the payment reference (the VRN), each with a copy button. The bank details are read once from GOV.UK's "Pay your VAT bill: bank details" page by the builder of this row, written into one constant with the page's URL beside it, and checked by a test against that constant only.
3. **Direct Debit**: a link to GOV.UK's Direct Debit page for VAT and a sentence on the lead time HMRC states there.
4. **Due date and help**: the due date, links to GOV.UK's "Pay your VAT bill", "How late payment penalties work" and interest pages.

Every GOV.UK link opens in a new tab and is a constant in one module with its title. Welsh strings in `i18n/cy.toml`. A browser test for each state, with the routes stubbed. Gates: `npm test`, `npm run test:browser` for the new test file, ESLint and Prettier on the files.

### PAY4. The panel on the receipt, the liabilities and the payments pages

The receipt after a VAT filing shows the panel when box 5 (net VAT) is due to HMRC, with the box 5 amount and the period's due date; a repayment return shows "HMRC owes you £X" and no panel. `vatLiabilities.page.js` shows the panel for each outstanding liability with its own amount and due date; `vatPayments.page.js` links each payment HMRC has received to its journey when the amounts match. A filed return's receipt keeps the payment outcome. The submit page's own flow is unchanged. Gates: the pages' browser tests, `npm test`, `npm run test:submitVatBehaviour-simulator` with a step that pays from the receipt on the simulator.

### PAY5. The MCP payment tool

A hosted MCP tool `prepare_vat_payment` in `mcp/lib/handoff-tools.js` beside `prepare_vat_return`: for a VRN and a period (or an amount), it answers the amount due, the due date, a link to Submit's receipt or liabilities page that opens the panel (the customer presses "Pay now" there, so the payment journey always starts from the customer's own browser session), the bank details and reference, and the Direct Debit and guidance links. It never calls `POST /pay` itself and never says a payment was made. Annotate it as a read (`READS` in `mcp/lib/tool-annotations.js`), add it to `HOSTED_TOOL_NAMES`, and add it to `PROD_HOSTED_TOOL_NAMES` in PAY7. The skill text of the published plugin (`file-a-uk-vat-return`) gains one step "pay it"; the listing change itself is PAY7's. Tests in `mcp/test/`. Gates: `cd mcp && npm test`, `npm run test:mcpPrepareVatReturnBehaviour-simulator` extended with the payment step.

### PAY6. The proofs on the simulator, the proxy and the sandbox

`npm run test:submitVatBehaviour-proxy` against HMRC's sandbox with a payment through the Coutts sandbox bank and the three `Gov-Test-Scenario` outcomes; the receipt shows each. The ci proof list of the set gains: a sandbox payment journey started from the ci receipt reaches HMRC's sandbox journey and its status reads back on the receipt; the journey record is queryable by key; the activity events are in the ci lake. Gates: the behaviour suites named.

### PAY7. The launch: privacy, availability, guide, listing text

Held until PAY6 passes on ci and OPAY1 is done: `web/public/privacy.html` gains the payment journey record (what, why, how long, recipient HMRC); `AVAILABILITY` in `scripts/build-mtd-calendar.mjs` and `web/public/mtd-calendar.html` gain "Pay your VAT through HMRC"; the guide journey and screenshots for paying from the receipt; FAQs; `prepare_vat_payment` joins `PROD_HOSTED_TOOL_NAMES`; the plugin listing text for the next directory submission says "and pay it through HMRC" (the submission itself is the operator's, in `PLAN_ORGANIC_SEARCH.md`). Gates: `npm test`, the Welsh proof, `visual-review` on the panel.

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
