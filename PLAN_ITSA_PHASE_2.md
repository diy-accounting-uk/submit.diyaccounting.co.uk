# PLAN: ITSA phase 2 (annual submission, adjustments, tax calculation, final declaration)

Phase 1 put the self-employment quarterly update on the sandbox: Business Details, Obligations
and the five period-summary endpoints. Phase 2 finishes the tax year. It adds the annual
submission, the business source adjustable summary, the tax calculation and the final
declaration, then the pages that carry a sole trader from four quarterly updates to a filed
return. The recognition application and the software finder listing follow the build as their
own track.

## Operator assertions (verbatim)

> the hand-rolled `hmrcApi.js` client stays, and a quarterly update costs one token like a VAT
> return

> ITSA build, phase 2: annual summaries, final declaration, then the ITSA recognition
> application and finder listing.

> The recognition questionnaire and HMRC's production-window answer (11a) come after that, by
> operator decision.

> **Parked by operator decision 2026-09-05**: build against the test APIs and have something
> running before making the case; the two emails to HMRC then go out together.

> the annual summary carries the whole year's figures and the DIYA-GL import
> (`PLAN_SUBMISSION_MCP.md`) is the natural source

> Every new activity here must carry `environments = ["local", "proxy", "ci"]`.

## The specs

Present in `_developers/reference/`:

| Spec | Version | Covers |
|---|---|---|
| `hmrc-mtd-obligations-api-3.0.yaml` | 3.0 | Income and expenditure obligations, final declaration (crystallisation) obligations |
| `hmrc-mtd-self-employment-business-api-5.0.yaml` | 5.0 | Period summaries in full. The annual submission operations are stubs. |
| `hmrc-txm-fph-validator-api-1.0.yaml` | 1.0 | The fraud header validator phase 1 already calls |

Missing, and where to get each. HMRC serves a resolved OpenAPI document at
`https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/{service}/{version}/oas/resolved`.

| Spec to fetch | Service and version | Why phase 2 needs it |
|---|---|---|
| Business Source Adjustable Summary (MTD) | `self-assessment-bsas-api/7.0` | Trigger, retrieve and adjust the year-end summary |
| Individual Calculations (MTD) | `individual-calculations-api/8.0` | Trigger and retrieve the calculation, submit the final declaration |
| Self Assessment Individual Details (MTD) | `self-assessment-individual-details-api/2.0` | The customer's ITSA status for the tax year |
| Business Details (MTD) | `business-details-api/2.0` | Phase 1 built against the rendered docs; the spec belongs beside the others |
| MTD Self Assessment Test Support | `mtd-sa-test-support-api/1.0` | Sandbox business creation, ITSA status, and vendor-state checkpoints |
| Individual Losses (MTD) | `individual-losses-api/7.0` | A minimum functionality standard with no build in this phase |
| Individuals Tax Liability Adjustments (MTD) | `individuals-tax-liability-adjustments-api/1.0` | A minimum functionality standard with no build in this phase |

One gap the resolved document does not close. HMRC's published OpenAPI for Self Employment
Business 5.0 carries only `summary` and `security` for the annual submission operations, for
retrieve-one-period-summary, and for the cumulative period summary. The full operation, the
request schema and the `Gov-Test-Scenario` table live in HMRC's own repository:

- `https://github.com/hmrc/self-employment-business-api`, under
  `resources/public/api/conf/5.0/` (`create_and_amend_annual_submission.yaml`,
  `retrieve_annual_submission.yaml`, `schemas/createAmendAnnualSubmission/def3/request.json`,
  `examples/createAmendAnnualSubmission/def3/`).

Fetch the annual submission detail from there. Every other HMRC repository follows the same
layout when a published spec turns out to be thin.

## The endpoints phase 2 adds

Every path below is appended to `HMRC_BASE_URI` or `HMRC_SANDBOX_BASE_URI`, exactly as phase 1
does. Each carries the fraud prevention headers `buildFraudHeaders` produces and the
`Accept: application/vnd.hmrc.{version}+json` header `buildHmrcHeaders` builds from the version
argument.

### Self Employment Business (MTD) 5.0: the annual submission

`GET|PUT /individuals/business/self-employment/{nino}/{businessId}/annual/{taxYear}`

The PUT creates and amends in one call and answers `204` with no body. The request body has
three optional objects and must not be empty:

- `adjustments`: `includedNonTaxableProfits`, `basisAdjustment`, `accountingAdjustment`,
  `outstandingBusinessIncome`, `balancingChargeBpra`, `balancingChargeOther`,
  `goodsAndServicesOwnUse`, `transitionProfitAmount`, `transitionProfitAccelerationAmount`.
- `allowances`: either `tradingIncomeAllowance` on its own, or the itemised set
  (`annualInvestmentAllowance`, `capitalAllowanceMainPool`, `capitalAllowanceSpecialRatePool`,
  `businessPremisesRenovationAllowance`, `enhancedCapitalAllowance`, `allowanceOnSales`,
  `capitalAllowanceSingleAssetPool`, `zeroEmissionsCarAllowance`, and the two structured
  building allowance arrays). The two forms are mutually exclusive.
- `nonFinancials`: `class4NicsExemptionReason`.

Money values take up to two decimal places, so `roundToTwoDecimalPlaces` from
`hmrcItsaSelfEmploymentPeriodPost.js` applies unchanged. An object with no entered values must
be left out of the body, the same rule `buildMoneySection` already implements.

The GET answers `200` with the same three objects.

| Operation | `Gov-Test-Scenario` values |
|---|---|
| PUT | `ALLOWANCE_NOT_SUPPORTED`, `NOT_FOUND`, `STATEFUL`, `WRONG_TPA_AMOUNT_SUBMITTED`, `OUTSIDE_AMENDMENT_WINDOW` |
| GET | `TRADING_ALLOWANCE`, `NOT_FOUND`, `STATEFUL` |

Errors to simulate: `RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED`, `RULE_ALLOWANCE_NOT_SUPPORTED`,
`RULE_BOTH_ALLOWANCES_SUPPLIED`, `RULE_TAX_YEAR_NOT_SUPPORTED`, `RULE_OUTSIDE_AMENDMENT_WINDOW`,
`FORMAT_VALUE`, `FORMAT_BUSINESS_ID`, `MATCHING_RESOURCE_NOT_FOUND`.

### Obligations (MTD) 3.0: the final declaration obligation

`GET /obligations/details/{nino}/crystallisation?taxYear={taxYear}&status={open|fulfilled}`

Answers the obligations that say when the return is due. Scenarios: `MULTIPLE`,
`INSOLVENT_TRADER`, `NOT_FOUND`, `DYNAMIC`. The default returns one open obligation.

Phase 1's `hmrcItsaObligationsGet.js` hardcodes the `income-and-expenditure` path, so this is a
second handler rather than a parameter on the first.

### Self Assessment Individual Details (MTD) 2.0: ITSA status

`GET /individuals/person/itsa-status/{nino}/{taxYear}?futureYears={bool}`

Tells the page whether the customer is mandated, voluntary, annual or exempt for the year. It
is what explains the quarterly update's `RULE_BUSINESS_INCOME_PERIOD_RESTRICTION` rejection to
a customer, rather than showing them HMRC's raw code. Scenarios: `NOT_FOUND`, `NOT_ENROLLED`,
`STATEFUL`.

### Business Source Adjustable Summary (MTD) 7.0

Three operations, in the order the journey uses them.

`POST /individuals/self-assessment/adjustable-summary/{nino}/trigger`

Body: `{ "accountingPeriod": { "startDate", "endDate" }, "typeOfBusiness": "self-employment",
"businessId" }`. Answers `calculationId`. HMRC requires the year's obligations to be met first.
Scenarios: `NO_ACCOUNTING_PERIOD`, `OBLIGATIONS_NOT_MET`, `ACCOUNTING_PERIOD_NOT_ENDED`,
`OUTSIDE_AMENDMENT_WINDOW`, `NOT_FOUND`, `TAX_YEAR_NOT_SUPPORTED`,
`REQUEST_CANNOT_BE_FULFILLED`, `STATEFUL`.

`GET /individuals/self-assessment/adjustable-summary/{nino}/self-employment/{calculationId}/{taxYear}`

Returns the summary's income, expenses, additions and the resulting net profit or loss. Watch
the default: with no `Gov-Test-Scenario` header the sandbox answers not-found, so the simulator
and every sandbox call must send one of `SELF_EMPLOYMENT_PROFIT`, `SELF_EMPLOYMENT_LOSS`,
`SELF_EMPLOYMENT_CONSOLIDATED`, `TRADING_ALLOWANCE`, `SELF_EMPLOYMENT_UNADJUSTED`,
`SELF_EMPLOYMENT_STATUS_INVALID`, `SELF_EMPLOYMENT_STATUS_SUPERSEDED`, their `DYNAMIC_` twins,
or `STATEFUL`.

`POST /individuals/self-assessment/adjustable-summary/{nino}/self-employment/{calculationId}/adjust/{taxYear}`

Body: `{ income, expenses, additions }`, or `{ "zeroAdjustments": true }` to state that nothing
changes. A summary can be adjusted once. Scenarios: `TYPE_OF_BUSINESS_INCORRECT`,
`SUMMARY_STATUS_INVALID`, `SUMMARY_STATUS_SUPERSEDED`, `ALREADY_ADJUSTED`,
`RESULTING_VALUE_NOT_PERMITTED`, `OUTSIDE_AMENDMENT_WINDOW`, `NOT_FOUND`, `STATEFUL`.

The flow needs the trigger and the retrieve. It needs the adjust only when the customer changes
a figure at the year end, which is what the adjustments page is for.

### Individual Calculations (MTD) 8.0

`POST /individuals/calculations/{nino}/self-assessment/{taxYear}/trigger/{calculationType}`

`calculationType` is `in-year` for an estimate, `intent-to-finalise` before a final declaration,
and `intent-to-amend` for tax years from 2025-26 when amending a filed return. Answers `202`
with `calculationId`. HMRC's calculation runs asynchronously, so wait at least five seconds
before retrieving. Scenarios: `NO_INCOME_SUBMISSIONS_EXIST`, `FINAL_DECLARATION_RECEIVED`,
`INCOME_SOURCES_CHANGED`, `RECENT_SUBMISSIONS_EXIST`, `RESIDENCY_CHANGED`,
`CALCULATION_IN_PROGRESS`, `BUSINESS_VALIDATION_FAILURE`, `TAX_YEAR_NOT_ENDED`.

`GET /individuals/calculations/{nino}/self-assessment/{taxYear}/{calculationId}`

Answers `200` with four top-level objects: `metadata`, `inputs`, `calculation` and `messages`.
The page reads `metadata.calculationType`, `metadata.finalDeclaration`,
`calculation.taxCalculation` (`incomeTax`, `nics`, `totalTaxDeducted`,
`totalIncomeTaxAndNicsDue`), `calculation.endOfYearEstimate` and
`calculation.allowancesAndDeductions`. A calculation that has not finished answers `404`, so the
page retries rather than reporting a failure. Scenarios: `NOT_FOUND`, `ERROR_MESSAGES_EXIST`,
`UK_SE_SAVINGS_EXAMPLE`, `UK_SE_GIFTAID_EXAMPLE`, `SCOT_SE_DIVIDENDS_EXAMPLE`, `DYNAMIC`.

`ERROR_MESSAGES_EXIST` is the case worth building carefully: HMRC returns `messages` with
errors and no calculation, and the customer needs to know which figure to fix.

`POST /individuals/calculations/{nino}/self-assessment/{taxYear}/{calculationId}/{calculationType}`

`calculationType` is `final-declaration`, or `confirm-amendment` for tax years from 2025-26.
Answers `204`. This is the call that files the return. Scenarios: `OUTSIDE_AMENDMENT_WINDOW`,
`FINAL_DECLARATION_IN_PROGRESS`, `FINAL_DECLARATION_RECEIVED`, `FINAL_DECLARATION_TAX_YEAR`,
`INCOME_SOURCES_CHANGED`, `INCOME_SOURCES_INVALID`, `NO_INCOME_SUBMISSIONS_EXIST`,
`RECENT_SUBMISSIONS_EXIST`, `RESIDENCY_CHANGED`, `SUBMISSION_FAILED`, `NOT_FOUND`.

`RULE_FINAL_DECLARATION_RECEIVED` and `RULE_RECENT_SUBMISSIONS_EXIST` are the two a customer
will actually hit. The first means the year is already filed. The second means a figure changed
after the calculation they confirmed, so the page has to trigger a fresh calculation and ask
again.

## The customer journey

The dashboard at `web/public/hmrc/itsa/dashboard.html` lists six numbered steps today. Phase 2
appends four, and puts a divider between the in-year half and the year-end half.

| Step | Page | What the customer does |
|---|---|---|
| 7 | `annualSubmission.html` | Loads the year's annual submission for a business, enters adjustments and allowances, saves them to HMRC |
| 8 | `adjustments.html` | Triggers the adjustable summary for the accounting period, reads the net profit HMRC computed, changes a figure if it is wrong |
| 9 | `taxCalculation.html` | Triggers a calculation and reads what the year owes |
| 10 | `finalDeclaration.html` | Reads the calculation again, confirms it is complete and correct, files the return |

Order matters and the pages enforce it. The adjustments page refuses to trigger while any
quarterly obligation for the year is open, because HMRC answers `RULE_OBLIGATIONS_NOT_MET`. The
final declaration page refuses to submit against a calculation whose
`metadata.calculationType` is not `intent-to-finalise`.

### What the customer sees before a final declaration

HMRC's minimum functionality standards let software either signpost the customer to their HMRC
account or display the estimate itself. We display it, so the standard binds: the estimate must
carry a disclaimer as to its accuracy, shown with the figure and not behind a link.

`taxCalculation.html` shows, in this order:

1. The disclaimer, above the figures. It says the calculation is an estimate based on the
   information submitted so far, that HMRC produced it, and that it can change when more
   information is submitted.
2. `calculation.taxCalculation.totalIncomeTaxAndNicsDue`, as the headline.
3. Income tax, National Insurance and tax already deducted, as the three lines under it.
4. Allowances and deductions applied.
5. Every entry in `messages`, errors first, each naming the figure it refers to.

`finalDeclaration.html` shows the same figures, retrieved fresh from the `intent-to-finalise`
calculation, plus the declaration wording the customer ticks: that the information given is
correct and complete to the best of their knowledge, and that they understand they may have to
pay financial penalties and face prosecution if they give false information. The submit button
stays disabled until the tick. The page shows the `calculationId` it is about to confirm, so
what the customer agreed to and what we send are the same thing on screen.

### Tokens

The catalogue's `self-employed` activity already carries `tokenCost = 1` and `metered = true`.
No ITSA handler charges it yet, so phase 2 wires the charge the way `hmrcVatReturnPost.js`
does: `consumeTokenForActivity(userSub, "self-employed", catalog)` on the initial request only,
before the HMRC call, answering `403` with `reason: "tokens_exhausted"` when the allowance is
used up.

| Call | Tokens |
|---|---|
| Quarterly update, created or amended | 1 |
| Annual submission, created or amended | 0 |
| Adjustable summary trigger, retrieve, adjust | 0 |
| Tax calculation trigger and retrieve | 0 |
| Final declaration | 1 |
| Every read (business details, obligations, ITSA status, period summaries) | 0 |

A sole trader's year is five tokens: four quarterly updates and one declaration. The annual
submission is free because it is a working step inside a year end the declaration charges for,
and a customer who corrects an allowance twice should not pay twice. See D1.

## The data

**Receipts.** Every ITSA write stores a receipt through `putReceipt` from
`app/data/dynamoDbReceiptRepository.js`, into the same receipts table the VAT path uses, with
the same seven-year TTL from `calculateHmrcTaxRecordTtl` and the same point-in-time recovery.
Phase 1 does not store one for the quarterly update. Phase 2 adds it.

| Write | Receipt id | Receipt body |
|---|---|---|
| Quarterly update | `{timestamp}-{periodId}` | HMRC's `periodId`, the business id, the period dates, the correlation id |
| Annual submission | `{timestamp}-{businessId}-{taxYear}` | The business id, the tax year, the adjustments and allowances sent, the correlation id |
| Final declaration | `{timestamp}-{calculationId}` | The calculation id, the tax year, `calculationType`, `totalIncomeTaxAndNicsDue` as confirmed, the correlation id |

The annual submission and the final declaration answer `204` with no body, so the receipt is
built from what we sent plus HMRC's `X-CorrelationId`. That correlation id is the only thing
tying our record to HMRC's, which is why it goes in every receipt.

**Async requests.** Each new endpoint gets its own async-requests table, following phase 1
exactly: `ensureTable(this, prefix + "-Hmrc...AsyncRequestsTable", name, "hashedSub",
"requestId")` and `ensureTimeToLive(..., "ttl")` in `DataStack.java`, a name field in
`SubmitSharedNames.java`, and an `AsyncApiLambda` in `HmrcStack.java` giving an ingest Lambda, a
worker Lambda, a queue and a dead letter queue. The handler reads the table name from a
`HMRC_ITSA_..._ASYNC_REQUESTS_TABLE_NAME` environment variable and lists it in `validateEnv`.

The calculation trigger is the one place where the async pattern earns its keep beyond
consistency. HMRC answers `202` and the calculation takes seconds, so the worker triggers,
waits, retrieves, and completes the request with the calculation body. The page polls our own
request id rather than HMRC's.

**Activity events.** `publishActivityEvent` from `app/lib/activityAlert.js`, named the way
phase 1 names them:

`itsa-annual-submission-queried`, `itsa-annual-submission-filed`,
`itsa-crystallisation-obligations-queried`, `itsa-status-queried`, `itsa-bsas-triggered`,
`itsa-bsas-queried`, `itsa-bsas-adjusted`, `itsa-calculation-triggered`,
`itsa-calculation-queried`, `itsa-final-declaration-submitted`.

**Failures.** The final declaration reports failures the way the VAT return does:
`publishActivityFailureEvent` with `event: "itsa-final-declaration-failed"` and a failure
category, plus `emitSubmissionMetric("ItsaSubmissionFailure", actor)`. That metric needs an
alarm in `ObservabilityStack.java` beside the `VatSubmissionFailure` one, so the existing
alarm-to-issue triage covers ITSA with no new mechanism. The event carries the failure category
and the hashed sub only. No NINO, no business id, no HMRC payload.

## The DIYA-GL import

The annual submission is the first ITSA call that wants a whole year of figures at once, and a
customer's books are where those figures already are.

**What the engine has.** `../spreadsheets.diyaccounting.co.uk/app/lib/calculators/se.js` is the
self-employed product's calculator. `calculateSeCells` builds the whole workbook, including a
capital allowances schedule (`buildSchedule`, carrying cost, accumulated depreciation, tax
written down value, and the AIA and WDA rates from the tax data) and the sales and purchases
analysis columns that give turnover and each expense category.
`app/lib/books-interchange.js` reads a customer's upload into a book and lines with no
spreadsheet application involved.

**What is missing.** `se.js` answers in spreadsheet cells, scoped to what the reconciliation
reads. The Ltd product has named derivations on top of its cells
(`buildPublishedBalanceSheet`, `buildVatReturns`); the self-employed product has none. Phase 2
needs two named functions in the diya-gl package, beside the Ltd ones:

- `buildSelfEmploymentQuarterlyUpdates(book, lines, taxData)`: for each of HMRC's four standard
  quarters (6 April to 5 July, 6 July to 5 October, 6 October to 5 January, 6 January to 5
  April), the `periodIncome`, `periodExpenses` and `periodDisallowableExpenses` objects the
  period summary endpoint takes.
- `buildSelfEmploymentAnnualSubmission(book, lines, taxData)`: the `adjustments` and
  `allowances` objects the annual endpoint takes. `annualInvestmentAllowance`,
  `capitalAllowanceMainPool`, `capitalAllowanceSpecialRatePool` and
  `capitalAllowanceSingleAssetPool` come from the capital allowances schedule.
  `goodsAndServicesOwnUse` and `basisAdjustment` come from the journal. The trading income
  allowance is a customer choice the page offers, not a derivation.

Both belong in the spreadsheets repository, where the engine lives. `PLAN_SUBMISSION_MCP.md`
decision 1 stands: the engine is imported, never copied.

**The interface with the MCP plan.** That plan's M1 row builds the derivation mapping for VAT
and micro-entity accounts. These two functions are the same kind of work on the same book, so
they land as a third derivation in M1's scope, and this phase depends on M1 the way M2 does.
Two more MCP tools fall out of them once they exist: `derive_itsa_quarterly_update` and
`derive_itsa_annual_submission`, each returning figures for the user to confirm before a submit
tool files them, following that plan's decision 6.

Until the derivations land, the phase 2 pages take typed figures, as the phase 1 quarterly
update page does. Nothing in this phase's build sequence waits on the DIYA-GL import.

## The recognition application and the finder listing

This track starts when the build runs against the sandbox and not before, which is the
operator's parked decision. HMRC's how-to-integrate guide sets out what it takes.

HMRC recognises three product shapes. Ours is a **full end-to-end product**, built in two
stages, and the guide allows the stages to be approved one at a time:

| Stage | APIs HMRC requires |
|---|---|
| In-year (quarterly updates) | Business Details, Obligations, Self-Employment Business, Individual Calculations |
| End-of-year | Business Details, Self-Employment Business, Business Source Adjustable Summary, Individual Losses, Individuals Tax Liability Adjustments, Obligations, Individual Calculations |

Individual Losses and Individuals Tax Liability Adjustments have no build in this phase. That
gap decides which stage we apply for first, and it is the open question the checklist forces.

The steps, in order:

1. Register a production application on the Developer Hub, or add the ITSA API subscriptions to
   the existing one. Accept the terms of use.
2. Test every endpoint of every API in the minimum functionality standards, in the sandbox,
   with fraud prevention headers on every call. HMRC's specialist team reads the logs, so the
   testing has to be real traffic from the deployed application, not a local harness.
3. Send the sandbox application id used for testing to SDST, as soon as testing finishes, so
   they can find the calls in their logs.
4. Ask SDST for the Production Approvals Checklist, complete it, return it.
5. HMRC reviews the testing, the fraud header accuracy and the checklist, then grants
   production access or says what to fix.
6. Ask about the software finder listing at the same time. The gov.uk page that lists
   compatible software is HMRC's, and vendors get on it through the software vendor team, who
   want the product name, what it supports, its pricing and its accessibility position.

The evidence HMRC asks for, and where it already exists:

| Evidence | Where |
|---|---|
| Fraud prevention headers, validated | `_developers/hmrc/ITSA_SPIKE.md` records a clean validator run, one warning for a header the sandbox test user cannot supply |
| A completed developer checklist | `_developers/hmrc/hmrc_questionnaire_1_software_developer_checklist_diy_accounting_limited_v2.md`, from the VAT approval, needs an ITSA pass |
| WCAG 2.1 AA evidence | `_developers/hmrc/hmrc_questionnaire_2_WCAG_2.1_AA_diy_accounting_limited_v2.md` and `_developers/hmrc/WCAG_2.2_AA_EVIDENCE.md` |
| Endpoint test logs | The behaviour suites, run against the ci deployment with the sandbox test user |

What a workflow can do: assemble the checklist answers from the repository, run the sandbox
endpoint sweep and produce the log, refresh the WCAG evidence, and draft both emails. What only
the operator can do: hold the Developer Hub account, accept the terms of use, press send on the
emails to SDST and to the software vendor team, and answer HMRC when they reply.

The two emails go out together, per the parked decision: the recognition application, and the
question about whether a production window opens for the 2027-28 tax year. Addresses are
`SDSTeam@hmrc.gov.uk` and `makingtaxdigital-softwarevendors@hmrc.gov.uk`.

## The build sequence

Ten tracks. Each is one sub-agent's work. The four endpoint tracks share a spine of files every
new Lambda has to touch, so they hold that spine one at a time, in order, each rebasing on the
previous merge. That is the pattern `PLAN_COMPANIES_HOUSE_REST_FILING.md` used for
`SubmitSharedNames.java`, and it works here for the same reason.

The shared spine: `infra/main/java/co/uk/diyaccounting/submit/SubmitSharedNames.java`,
`infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java`,
`infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java`,
`infra/main/java/co/uk/diyaccounting/submit/stacks/HmrcStack.java`,
`infra/test/java/co/uk/diyaccounting/submit/stacks/DataStackTest.java`,
`infra/test/java/co/uk/diyaccounting/submit/SubmitEnvironmentCdkResourceTest.java`,
`app/bin/server.js`, `app/http-simulator/server.js`, `cdk.json` and the `.env.*` files.

### T1. The quarterly update's missing half (Sonnet)

Copies from `app/functions/hmrc/hmrcVatReturnPost.js`: the token charge in its initial-request
block, `putReceipt`, `recordSubmissionFailure` and `emitSubmissionMetric`.

Owns `app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPost.js`,
`hmrcItsaSelfEmploymentPeriodPut.js`, their unit tests, and the `ItsaSubmissionFailure` alarm in
`infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java`.

Adds the token charge, the receipt and the failure reporting to the two existing write handlers.
Runs first because every later write handler copies the result.

Proves: unit tests over the charge, the receipt write and the exhausted-allowance `403`;
`npm run test:itsaSelfEmploymentPeriodBehaviour-simulator`; `./mvnw clean verify`.

### T2. The annual submission (Sonnet)

Copies from `hmrcItsaSelfEmploymentPeriodGet.js` for the GET and
`hmrcItsaSelfEmploymentPeriodPut.js` for the PUT.

Owns `app/functions/hmrc/hmrcItsaSelfEmploymentAnnualGet.js`,
`hmrcItsaSelfEmploymentAnnualPut.js`, their unit tests,
`app/http-simulator/routes/itsa-self-employment-annual.js`,
`app/http-simulator/scenarios/itsa-self-employment-annual.js`, and the spine.

Routes `/api/v1/hmrc/itsa/self-employment/annual`. Exports
`buildAnnualSubmissionRequestBody`, shaped like `buildSelfEmploymentPeriodRequestBody`: it drops
empty sections and rejects a body that would be entirely empty.

Proves: unit tests over the body builder including both allowance forms; a system test against
the simulator; `./mvnw clean verify`.

### T3. Final declaration obligations and ITSA status (Sonnet)

Copies from `hmrcItsaObligationsGet.js` for the first and `hmrcItsaBusinessDetailsGet.js` for
the second.

Owns `app/functions/hmrc/hmrcItsaCrystallisationObligationsGet.js`, `hmrcItsaStatusGet.js`,
their unit tests, `app/http-simulator/routes/itsa-crystallisation-obligations.js`,
`app/http-simulator/routes/itsa-status.js`, the two matching scenario files, and the spine.

Routes `/api/v1/hmrc/itsa/obligations/crystallisation` and `/api/v1/hmrc/itsa/status`. ITSA
status is Self Assessment Individual Details 2.0, a different `Accept` version from everything
else in the batch, so the version argument to `buildHmrcHeaders` earns a test.

Proves: unit tests; a system test against the simulator; `./mvnw clean verify`.

### T4. The adjustable summary (Sonnet)

Copies from `hmrcItsaSelfEmploymentPeriodPost.js` for the two POSTs and
`hmrcItsaSelfEmploymentPeriodsGet.js` for the GET.

Owns `app/functions/hmrc/hmrcItsaBsasTriggerPost.js`, `hmrcItsaBsasSelfEmploymentGet.js`,
`hmrcItsaBsasSelfEmploymentAdjustPost.js`, their unit tests,
`app/http-simulator/routes/itsa-bsas.js`, `app/http-simulator/scenarios/itsa-bsas.js`, and the
spine.

Routes `/api/v1/hmrc/itsa/bsas/trigger`, `/api/v1/hmrc/itsa/bsas/self-employment` and
`/api/v1/hmrc/itsa/bsas/self-employment/adjust`. The simulator's retrieve route mirrors HMRC's
default and answers not-found without a scenario header, so the pages are built against the
behaviour the sandbox actually has.

Proves: unit tests including the `zeroAdjustments` body and the `ALREADY_ADJUSTED` path; a
system test against the simulator; `./mvnw clean verify`.

### T5. The calculation and the final declaration (Sonnet)

Copies from `hmrcItsaSelfEmploymentPeriodPost.js` for the async ingest and worker split, and
`hmrcVatReturnPost.js` for the token charge, the receipt and the failure metric.

Owns `app/functions/hmrc/hmrcItsaCalculationTriggerPost.js`, `hmrcItsaCalculationGet.js`,
`hmrcItsaFinalDeclarationPost.js`, their unit tests,
`app/http-simulator/routes/itsa-calculations.js`,
`app/http-simulator/scenarios/itsa-calculations.js`, and the spine.

Routes `/api/v1/hmrc/itsa/calculation/trigger`, `/api/v1/hmrc/itsa/calculation` and
`/api/v1/hmrc/itsa/final-declaration`. The trigger's worker waits and retrieves, so the page
gets a finished calculation from one request id. The final declaration charges one token, stores
a receipt, and reports failures on the `ItsaSubmissionFailure` metric T1 created.

Proves: unit tests including the retry on the calculation's `404`, the `ERROR_MESSAGES_EXIST`
body and the `RULE_RECENT_SUBMISSIONS_EXIST` rejection; a system test against the simulator;
`./mvnw clean verify`.

### T6. The year-end pages (Sonnet)

Copies from `web/public/hmrc/itsa/selfEmploymentPeriod.html` for the entry pages and
`selfEmploymentPeriodView.html` for the read-only ones.

Owns `web/public/hmrc/itsa/annualSubmission.html`, `adjustments.html`, `taxCalculation.html`,
`finalDeclaration.html`, `dashboard.html`, the ITSA additions to
`web/public/lib/services/hmrc-service.js`, `web/public/submit.catalogue.toml` (the new page
paths on the `self-employed` activity), the browser tests, the behaviour tests
`behaviour-tests/itsaAnnualSubmission.behaviour.test.js` and
`behaviour-tests/itsaFinalDeclaration.behaviour.test.js`, `playwright.config.js`,
`package.json` and `scripts/bundle-for-tests.js`.

The disclaimer and the declaration wording are the design work in this track. Everything else is
the phase 1 page pattern.

Proves: `npm run test:browser`; `npm run test:itsaAnnualSubmissionBehaviour-simulator` and
`npm run test:itsaFinalDeclarationBehaviour-simulator`.

### T7. The sandbox proof (Sonnet)

Owns `scripts/itsa-sandbox-year.js` and `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`.

Files a whole tax year against the sandbox with one test user: four quarterly updates, an annual
submission, a triggered and adjusted summary, an `intent-to-finalise` calculation, and a final
declaration. Uses `mtd-sa-test-support-api/1.0` to create the business and set the ITSA status,
and its vendor-state checkpoints to reset between runs. Records each response so the simulator
scenarios match what HMRC returns, the way the phase 1 simulators were corrected against the
sandbox.

Proves: a `204` from the final declaration, and the fraud header validator clean on the same
header set.

### T8. The derivations in the engine (Opus for the mapping, Sonnet for the wiring)

Owns, in `../spreadsheets.diyaccounting.co.uk`, `app/lib/calculators/se-derivations.js` and its
unit tests. Nothing in this repository.

`buildSelfEmploymentQuarterlyUpdates` and `buildSelfEmploymentAnnualSubmission`, over the
self-employed example books. Opus for the mapping from schedule and analysis columns to HMRC's
field names, because that is the part that goes wrong quietly. Lands as a third derivation in
`PLAN_SUBMISSION_MCP.md`'s M1.

Proves: the derived figures equal the self-employed product's own report, cell by cell, for
every example book.

### T9. The DIYA-GL-to-submission path (Sonnet)

Owns the MCP tools `derive_itsa_quarterly_update` and `derive_itsa_annual_submission` in the MCP
package, and an import control on `annualSubmission.html` that fills the form from a book.

Waits on T8 and on `PLAN_SUBMISSION_MCP.md` M1.

### T10. The recognition pack (Haiku to assemble, operator to send)

Owns `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
questionnaires, and the two draft emails.

Waits on T7. The operator sends.

### Order

T1, then T2, T3, T4, T5 in that order for the spine, then T6. T7 after T6. T8 runs alongside
from the start, in the other repository. T9 after T8 and T6. T10 after T7.

## Verification

- Every new endpoint has a unit test pinning the HMRC URL it builds, the `Accept` version it
  sends, and its error mapping, the way the phase 1 handlers' tests do.
- The simulator answers every `Gov-Test-Scenario` value listed in this document for the
  endpoints it serves, with HMRC's own error code and message.
- `npm run test:unit`, `npm run test:system`, `npm run test:browser` and `./mvnw clean verify`
  pass on every track.
- The behaviour suites file a quarterly update, an annual submission and a final declaration
  against the simulator, and the same three against ci with the sandbox test user.
- A final declaration filed in the sandbox leaves a receipt carrying the confirming
  `calculationId`, HMRC's correlation id, and a TTL seven years out.
- Filing a quarterly update and a final declaration each decrement the bundle's tokens by one.
  Filing an annual submission decrements nothing. A user with no tokens gets `403` with
  `reason: "tokens_exhausted"` and no HMRC call happens.
- `taxCalculation.html` shows the disclaimer above the figures with the page's stylesheet
  disabled, so it sits in the document order rather than being positioned there.
- `finalDeclaration.html` will not submit until the declaration is ticked, and shows the
  `calculationId` it submits.
- The fraud header validator answers with no errors for the ITSA write endpoints, called from
  the deployed ci application rather than a local harness.

## Decisions

The operator answered all five open questions on 2026-09-09. Two of them change the build.

**D1. An annual submission costs no token.** A sole trader's year is five tokens: one for each
of the four quarterly updates, one for the final declaration, nothing for the annual submission.
The annual submission is a working step inside a year end the declaration already charges for,
and a customer who corrects an allowance twice should not pay twice. The token table above
stands.

**D2. The site displays the calculation, and displays more than the headline.** We render
HMRC's figures rather than sending the customer to their HMRC account. The page shows
`totalIncomeTaxAndNicsDue` as the headline, the `incomeTax`, `nics` and `totalTaxDeducted`
breakdown and `allowancesAndDeductions` beneath it, and every entry in HMRC's `messages` array,
info and warnings as well as errors. An `in-year` result is labelled plainly as an estimate and
kept visibly distinct from an `intent-to-finalise` one. The page shows the calculation's
timestamp and its `calculationType`. It does not cache: it re-triggers and re-fetches on every
page load, because a calculation belongs to one `calculationId` and anything submitted after it
makes it stale. Every figure is HMRC's own, returned by the Individual Calculations API. We
render, we do not compute. This changes T5 and T6.

**D3. Apply for both approval stages together.** One submission covers the in-year and the
end-of-year stages, as a single end-to-end journey. That means Individual Losses and
Individuals Tax Liability Adjustments have to be answered in the checklist before anything is
sent. This changes T10.

**D4. UK property income is in this phase.** UK property joins self-employment, so a customer
with both can file a complete return. This is the substantial new work and it adds tracks T11
to T14. Foreign property is a later surface.

**D5. The sandbox proof reuses the phase 1 test user.** That user has both VAT and Income Tax
enrolments. The businesses, accounting periods and ITSA status the proof needs come from the
test support API, and its vendor-state checkpoints reset the user between runs.

## Sources

- `BACKLOG.md` rows 10, 11 and 11a. `NEXT.md` B10.4 and B11.
- `_developers/hmrc/ITSA_SPIKE.md`, `_developers/hmrc/ITSA_MINIMUM_FUNCTIONALITY_STANDARDS.md`.
- `PLAN_SUBMISSION_MCP.md`, `PLAN_COMPANIES_HOUSE_REST_FILING.md`.
- Making Tax Digital for Income Tax end-to-end service guide, "How to integrate with HMRC APIs":
  <https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/documentation/how-to-integrate.html>
- Self Employment Business (MTD) 5.0, and the annual submission detail its published spec omits:
  <https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-employment-business-api/5.0>
  and <https://github.com/hmrc/self-employment-business-api> under
  `resources/public/api/conf/5.0/`.
- Individual Calculations (MTD) 8.0, Business Source Adjustable Summary (MTD) 7.0, Obligations
  (MTD) 3.0, Self Assessment Individual Details (MTD) 2.0, Business Details (MTD) 2.0,
  Individual Losses (MTD) 7.0, Individuals Tax Liability Adjustments (MTD) 1.0 and MTD Self
  Assessment Test Support 1.0, all at
  `https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/{service}/{version}/oas/resolved`.
