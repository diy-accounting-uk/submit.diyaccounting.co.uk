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
| Property Business (MTD) | `property-business-api/6.0` | UK property period summaries and the property annual submission |
| Individual Losses (MTD) | `individual-losses-api/7.0` | Brought-forward losses and loss claims, per business per tax year |
| Individuals Tax Liability Adjustments (MTD) | `individuals-tax-liability-adjustments-api/1.0` | The liability decrease a carry-back claim produces |

One gap the resolved document does not close. HMRC's published OpenAPI for Self Employment
Business 5.0 carries only `summary` and `security` for the annual submission operations, for
retrieve-one-period-summary, and for the cumulative period summary. The full operation, the
request schema and the `Gov-Test-Scenario` table live in HMRC's own repository:

- `https://github.com/hmrc/self-employment-business-api`, under
  `resources/public/api/conf/5.0/` (`create_and_amend_annual_submission.yaml`,
  `retrieve_annual_submission.yaml`, `schemas/createAmendAnnualSubmission/def3/request.json`,
  `examples/createAmendAnnualSubmission/def3/`, and for the cumulative period summary
  `create_amend_cumulative_period_summary.yaml`, `retrieve_cumulative_period_summary.yaml`,
  `schemas/createAmendCumulativePeriodSummary/request.json`,
  `examples/createAmendCumulativePeriodSummary/`).

Property Business 6.0 is thin in the same way, and in more places. Its published OpenAPI
carries only `summary` and `security` for the UK property annual submission (both the GET and
the PUT), for retrieve-and-amend-one-period-summary, and for the whole cumulative period
summary. Only create-a-period-summary and list-period-summaries come through resolved. The
detail lives at:

- `https://github.com/hmrc/property-business-api`, under `resources/public/api/conf/6.0/`
  (`uk_property_annual_submission_create_and_amend.yaml`,
  `uk_property_annual_submission_retrieve.yaml`, `uk_property_period_summary_amend.yaml`,
  `uk_property_period_summary_retrieve.yaml`,
  `uk_property_cumulative_summary_create_or_amend.yaml`,
  `uk_property_cumulative_summary_retrieve.yaml`,
  `schemas/uk_property_cumulative_summary_create_and_amend/def1/request.json`, and the matching
  trees under `schemas/` and `examples/`).

Individual Losses 7.0 and Individuals Tax Liability Adjustments 1.0 are the thinnest of all.
Their resolved documents are three and a half kilobytes each. Every operation carries only its
`security` block: no summary, no request body, no response, no scenarios. Version 7.0 of
Individual Losses is also a redesign. Version 6.0 published eleven operations over separate
brought-forward-loss and loss-claim resources; 7.0 collapses them into one resource per
business per tax year, so anything written against the 6.0 shape no longer describes the API.
The detail for both lives at:

- `https://github.com/hmrc/individual-losses-api`, under `resources/public/api/conf/7.0/`
  (`losses_and_claims_create_amend.yaml`, `losses_and_claims_retrieve.yaml`,
  `losses_and_claims_delete.yaml`, `schemas/lossesAndClaims/createAmend/request.json`,
  `examples/lossesAndClaims/createAmend/`).
- `https://github.com/hmrc/individuals-tax-liability-adjustments-api`, under
  `resources/public/api/conf/1.0/` (`tax_liability_adjustments_create_or_amend.yaml`,
  `tax_liability_adjustments_retrieve.yaml`, `tax_liability_adjustments_delete.yaml`,
  `schemas/tax_liability_adjustments_create_or_amend/def1/request.json`,
  `examples/tax_liability_adjustments_create_or_amend/def1/`).

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

### Property Business (MTD) 6.0: UK property

A UK property business runs the same shape of year as a sole trader. Quarterly period
summaries, then one annual submission of adjustments and allowances, then the same adjustable
summary, calculation and final declaration the self-employment journey already uses. Only the
period and annual endpoints are new, and every field name differs.

**Business Details needs nothing new.** `GET /individuals/business/details/{nino}/list` already
answers every business the customer has, each with its `businessId` and a `typeOfBusiness` of
`self-employment`, `uk-property` or `foreign-property`. Phase 1's handler passes the list
through untouched. What grows is what the rest of the journey does with it: every later call is
typed, so a business the customer picks has to travel as a pair, the `businessId` and the
`typeOfBusiness`, never the id alone.

**Obligations needs nothing new either.** `hmrcItsaObligationsGet.js` already validates
`typeOfBusiness` against `self-employment`, `uk-property` and `foreign-property` and already
passes `businessId` through, and `obligations.html` already offers the three in its filter.
HMRC answers one entry per business, each carrying its own `obligationDetails`. What grows is
the results table: it groups by business so a customer with two of them can see which
obligation belongs to which.

**Period summaries, up to and including 2024-25.**

`POST /individuals/business/property/uk/{nino}/{businessId}/period/{taxYear}` creates one and
answers `submissionId`. The same path plus `/{submissionId}` retrieves it on a `GET` and amends
it on a `PUT`. `GET /individuals/business/property/{nino}/{businessId}/period/{taxYear}` lists
them, on an untyped path that serves UK and foreign property alike.

The body is `fromDate`, `toDate` and one property object holding `income` and `expenses`. For
2024-25 and earlier that object is `ukFhlProperty`, `ukNonFhlProperty`, or both. Furnished
holiday lettings ended on 5 April 2025, so from 2025-26 the body carries `ukProperty` alone.

- `income`: `premiumsOfLeaseGrant`, `reversePremiums`, `periodAmount`, `taxDeducted`,
  `otherIncome`, `rentARoom.rentsReceived`.
- `expenses`: `premisesRunningCosts`, `repairsAndMaintenance`, `financialCosts`,
  `professionalFees`, `costOfServices`, `other`, `residentialFinancialCost`, `travelCosts`,
  `residentialFinancialCostsCarriedForward`, `rentARoom.amountClaimed`. Or
  `consolidatedExpenses` on its own. The two forms are mutually exclusive, the same rule
  `buildSelfEmploymentPeriodRequestBody` already implements.

Create scenarios: `NOT_FOUND`, `OVERLAPPING`, `MISALIGNED`, `NOT_CONTIGUOUS`,
`DUPLICATE_SUBMISSION`, `TYPE_OF_BUSINESS_INCORRECT`, `STATEFUL`. Amend scenarios: `NOT_FOUND`,
`TYPE_OF_BUSINESS_INCORRECT`, `STATEFUL`. Retrieve scenarios: `UK_PROPERTY`,
`UK_NON_FHL_FULL_EXPENSES`, `UK_NON_FHL_CONSOLIDATED`, `UK_FHL_FULL_EXPENSES`,
`UK_FHL_CONSOLIDATED`, `FOREIGN_PROPERTY`, `NOT_FOUND`, `STATEFUL`. The retrieve's default is
not-found, so every call sends a scenario, the same trap the adjustable summary's retrieve has.

**Period summaries, 2025-26 onwards.**

`GET|PUT /individuals/business/property/uk/{nino}/{businessId}/cumulative/{taxYear}`. One
running total for the year to date replaces the four dated submissions. The PUT answers `204`.
The body is `fromDate`, `toDate` and `ukProperty` with the same `income` and `expenses` field
names as above.

Scenarios worth building: `TAX_YEAR_NOT_SUPPORTED`,
`START_DATE_NOT_ALIGNED_TO_COMMENCEMENT_DATE`, `END_DATE_NOT_ALIGNED_WITH_REPORTING_TYPE`,
`MISSING_SUBMISSION_DATES`, `START_AND_END_DATE_NOT_ALLOWED`,
`EARLY_DATA_SUBMISSION_NOT_ACCEPTED`, `SUBMISSION_END_DATE_CANNOT_MOVE_BACKWARDS`,
`OUTSIDE_AMENDMENT_WINDOW`, `NOT_FOUND`, `STATEFUL`. `STATEFUL` needs a UK test business made
through the test support API first.

Self Employment Business 5.0 carries the same split: its dated period summaries stop at 2024-25
and a cumulative endpoint takes over from 2025-26. Phase 1 built the dated ones, so both income
types reach the same fork at the same tax year. This phase builds both models for both types
(D7); the cumulative endpoints have their own section below.

**The annual submission.**

`GET|PUT /individuals/business/property/uk/{nino}/{businessId}/annual/{taxYear}`. The PUT
creates and amends in one call. It answers `200`, where the self-employment annual submission
answers `204`, so the two handlers cannot share a response check.

The body requires `ukProperty`, holding `adjustments`, `allowances`, or both:

- `adjustments`: `balancingCharge`, `privateUseAdjustment`,
  `businessPremisesRenovationAllowanceBalancingCharges`, `nonResidentLandlord` (boolean),
  `rentARoom.jointlyLet` (boolean).
- `allowances`: either `propertyIncomeAllowance` on its own, or the itemised set
  (`annualInvestmentAllowance`, `businessPremisesRenovationAllowance`, `otherCapitalAllowance`,
  `costOfReplacingDomesticItems`, `zeroEmissionsCarAllowance`, and the
  `structuredBuildingAllowance` and `enhancedStructuredBuildingAllowance` arrays, each entry
  carrying `amount`, `firstYear.qualifyingDate`, `firstYear.qualifyingAmountExpenditure` and a
  `building` name, number and postcode).

Two rules bite here. `propertyIncomeAllowance` cannot sit beside the itemised allowances
(`RULE_BOTH_ALLOWANCES_SUPPLIED`), and it cannot sit beside `privateUseAdjustment` either
(`RULE_PROPERTY_INCOME_ALLOWANCE`). The page enforces both before the call, so the customer
reads our sentence rather than HMRC's code.

`nonResidentLandlord` and `rentARoom.jointlyLet` are the first booleans any ITSA request body
in this repository carries. `buildMoneySection` drops a field with no entered value, and `false`
looks like no value to it. The property body builder needs a boolean-aware pass: `false` is an
answer and goes in the body, only an unanswered field is dropped.

PUT scenarios: `NOT_FOUND`, `TYPE_OF_BUSINESS_INCORRECT`, `PROPERTY_INCOME_ALLOWANCE`,
`OUTSIDE_AMENDMENT_WINDOW`, `STATEFUL`. GET scenarios: `UK_PROPERTY`,
`UK_ALL_OTHER_ALLOWANCES`, `UK_PROPERTY_ALLOWANCE`, `UK_FHL_ALL_OTHER_ALLOWANCES`,
`UK_FHL_PROPERTY_ALLOWANCE`, `FOREIGN_PROPERTY`, `STATEFUL`, and its default is not-found
again.

Errors to simulate: `RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED`, `RULE_BOTH_ALLOWANCES_SUPPLIED`,
`RULE_PROPERTY_INCOME_ALLOWANCE`, `RULE_TYPE_OF_BUSINESS_INCORRECT`, `RULE_BUILDING_NAME_NUMBER`,
`RULE_TAX_YEAR_NOT_SUPPORTED`, `RULE_OUTSIDE_AMENDMENT_WINDOW`, `FORMAT_VALUE`,
`FORMAT_BUSINESS_ID`, `FORMAT_DATE`, `FORMAT_STRING`, `MATCHING_RESOURCE_NOT_FOUND`.

### The cumulative period summary, 2025-26 onwards

HMRC changes the quarterly model at 2025-26, and changes it the same way for both income types.
Up to 2024-25 a customer sends four dated period summaries, each holding one quarter's figures.
From 2025-26 they send a cumulative period summary. That is one running total for the year so
far, resent each time there is more to report.

- `GET|PUT /individuals/business/self-employment/{nino}/{businessId}/cumulative/{taxYear}`
- `GET|PUT /individuals/business/property/uk/{nino}/{businessId}/cumulative/{taxYear}`

Both PUTs create and amend in one call and answer `204`. Both refuse a tax year before 2025-26.

**The self-employment body** carries the field names the dated period summary already uses, so
`buildSelfEmploymentPeriodRequestBody` builds it unchanged:

- `periodDates`: `periodStartDate` and `periodEndDate`. The object is optional; when it is
  there, both dates are required.
- `periodIncome`: `turnover`, `other`, `taxTakenOffTradingIncome`.
- `periodExpenses`: `costOfGoods`, `paymentsToSubcontractors`, `wagesAndStaffCosts`,
  `carVanTravelExpenses`, `premisesRunningCosts`, `maintenanceCosts`, `adminCosts`,
  `businessEntertainmentCosts`, `advertisingCosts`, `interestOnBankOtherLoans`,
  `financeCharges`, `irrecoverableDebts`, `professionalFees`, `depreciation`, `otherExpenses`.
  Or `consolidatedExpenses` on its own.
- `periodDisallowableExpenses`: the `...Disallowable` twin of each expense name.

HMRC adds a rule here that the dated endpoint does not have. A cumulative submission must carry
values for income and expenses even when they are zero. A business with no income so far sends
`turnover: 0` and `other: 0` rather than leaving them out.

**The UK property body** carries the field names the property period summary already uses,
wrapped in `ukProperty`:

- `fromDate` and `toDate`, at the top level rather than nested. Both are optional.
- `ukProperty`, which is required, holding `income` and `expenses` exactly as the property
  period summary defines them, including `rentARoom` and the `consolidatedExpenses` alternative.

The two APIs name their dates differently, `periodDates.periodStartDate` against `fromDate`,
and each cumulative body matches its own API's dated body. So each income type keeps one body
builder across both models.

**The reporting type decides whether dates go in the body at all.** From 2025-26 a business
reports on standard quarters, calendar quarters, or annually. A quarterly submission carries
the dates. An annual or latent submission carries none, and HMRC answers
`RULE_START_AND_END_DATE_NOT_ALLOWED` if it finds them. A quarterly submission with the dates
missing answers `RULE_MISSING_SUBMISSION_DATES`.

We work none of this out. The obligation the customer picked says it. One obligation spanning
the tax year is an annual reporting type and the submission carries no dates. A shorter one is
a quarter and the submission carries that obligation's own start and end dates. No date in any
request is calculated, and no quarter boundary appears anywhere in this repository.

Scenarios, shared by both PUTs: `TAX_YEAR_NOT_SUPPORTED`,
`START_DATE_NOT_ALIGNED_TO_COMMENCEMENT_DATE`, `START_DATE_NOT_ALIGNED_WITH_REPORTING_TYPE`,
`END_DATE_NOT_ALIGNED_WITH_REPORTING_TYPE`, `MISSING_SUBMISSION_DATES`,
`START_AND_END_DATE_NOT_ALLOWED`, `EARLY_DATA_SUBMISSION_NOT_ACCEPTED`,
`ADVANCE_SUBMISSION_REQUIRES_PERIOD_END_DATE`, `SUBMISSION_END_DATE_CANNOT_MOVE_BACKWARDS`,
`OUTSIDE_AMENDMENT_WINDOW`, `NOT_FOUND`, `STATEFUL`. Self-employment adds
`BOTH_EXPENSES_SUPPLIED`.

Retrieve scenarios: self-employment takes `CONSOLIDATED_EXPENSES`, `NOT_FOUND`,
`TAX_YEAR_NOT_SUPPORTED` and `STATEFUL`. UK property takes `UK_PROPERTY_FULL_EXPENSES`,
`UK_PROPERTY_CONSOLIDATED`, `FOREIGN_PROPERTY`, `NOT_FOUND`, `TAX_YEAR_NOT_SUPPORTED` and
`STATEFUL`.

`STATEFUL` on either needs a test business created through the test support API first, and an
annual or latent submission also needs a test ITSA status set through the same API.

### Where the tax year decides the endpoint

Every ITSA write already takes `taxYear` as a request parameter in HMRC's `YYYY-YY` form. It
comes from the obligation the customer picked or the year they chose on screen. It is never
worked out from today's date, because a customer filing in June may be filing last year's
figures.

One function turns that year into a choice. `resolveItsaSubmissionModel(taxYear)` goes in
`app/lib/hmrcValidation.js`, beside `isValidNino` and the rest. It answers `"dated"` for
2024-25 and earlier and `"cumulative"` for 2025-26 and later, and it throws on anything that is
not a tax year. Nothing else in the repository compares a tax year to that boundary. Eleven
ITSA handlers each carry their own `TAX_YEAR_PATTERN` constant today; they take a shared
`isValidTaxYear` from the same module at the same time, so the format rule lives in one place
too.

**The handler picks the endpoint, not the page.** There is one route per operation. The page
sends the tax year, the business and the figures, and never chooses a path. Inside the handler,
`resolveItsaSubmissionModel` chooses the HMRC URL and which body builder runs. That keeps the
choice in one function called from one place per operation, and it means a page cannot send a
customer to the wrong family.

Two consequences follow, and both are real rather than cosmetic:

- The two models answer differently. The dated create is a `POST` answering `200` with a
  `periodId`, and the cumulative create is a `PUT` answering `204` with nothing. Our own
  response says which model it used and carries the `periodId` or `submissionId` only when HMRC
  gave one.
- In a cumulative year there is no separate amend call and nothing to list. Correcting a figure
  means sending a corrected running total to the same endpoint, and the year holds one total
  rather than a set of submissions.

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

Three operations, in the order the journey uses them. Each self-employment operation below has
a UK property twin; the property additions follow them.

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

**The same three operations, for UK property.** The trigger is one endpoint for every income
type; `typeOfBusiness` in its body chooses. `hmrcItsaBsasTriggerPost.js` fixes that field to
`self-employment` in a constant today, and it becomes a validated request field. For tax years
up to 2024-25 HMRC accepts `self-employment`, `uk-property`, `uk-property-fhl`,
`foreign-property` and `foreign-property-fhl-eea`. From 2025-26 the two FHL values go and three
remain: `self-employment`, `uk-property`, `foreign-property`.

The retrieve and the adjust are separate endpoints per type:

`GET /individuals/self-assessment/adjustable-summary/{nino}/uk-property/{calculationId}/{taxYear}`

Scenarios: `UK_PROPERTY_PROFIT`, `UK_PROPERTY_LOSS`, `UK_PROPERTY_CONSOLIDATED`,
`UK_PROPERTY_ALLOWANCE`, `UK_PROPERTY_ZERO_ADJUSTMENTS`, `UK_PROPERTY_STATUS_INVALID`,
`UK_PROPERTY_STATUS_SUPERSEDED`, the FHL twins for years up to 2024-25, `NOT_UK_PROPERTY`,
`TAX_YEAR_NOT_SUPPORTED`, `REQUEST_CANNOT_BE_FULFILLED`, their `DYNAMIC_` twins, and
`STATEFUL`. The default is not-found, exactly as for self-employment.

`POST /individuals/self-assessment/adjustable-summary/{nino}/uk-property/{calculationId}/adjust/{taxYear}`

Body: `{ "ukProperty": { income, expenses } }`, or `{ "ukProperty": { "zeroAdjustments": true } }`.
Scenarios add `UK_PROPERTY_OVER_CONSOLIDATED_EXPENSES_THRESHOLD` and
`UK_PROPERTY_INCOME_ALLOWANCE_CLAIMED` to the self-employment set.

The property summary body is not the self-employment one with different labels. Its
`adjustableSummaryCalculation.income` carries `totalRentsReceived`, `premiumsOfLeaseGrant`,
`reversePremiums` and `otherPropertyIncome`, and its `deductions` carries `propertyAllowance`,
`costOfReplacingDomesticItems`, `structuredBuildingAllowance` and the rest. The adjust body
takes the same four income names.

Those four are not the names the property period summary uses. The period summary calls the
same money `periodAmount` and `otherIncome`; the adjustable summary calls it
`totalRentsReceived` and `otherPropertyIncome`. A page that reuses one set of labels across
both screens will put the right number under the wrong words, so the property adjustments page
keeps its own labels and its own field list.


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
The page reads `metadata.calculationType`, `metadata.calculationTimestamp`,
`metadata.finalDeclaration`, `calculation.taxCalculation` (`incomeTax`, `nics`,
`totalTaxDeducted`, `totalIncomeTaxAndNicsDue`), `calculation.endOfYearEstimate`,
`calculation.allowancesAndDeductions`, `calculation.businessProfitAndLoss` and
`inputs.incomeSources.businessIncomeSources`. A calculation that has not finished answers
`404`, so the page retries rather than reporting a failure. Scenarios: `NOT_FOUND`,
`ERROR_MESSAGES_EXIST`, `UK_SE_SAVINGS_EXAMPLE`, `UK_SE_GIFTAID_EXAMPLE`,
`SCOT_SE_DIVIDENDS_EXAMPLE`, `DYNAMIC`.

The handler passes HMRC's body through whole. It picks no fields out and it rewrites none, so a
field HMRC adds reaches the page without a code change.

One calculation covers the whole return. It is keyed on the NINO and the tax year, never on a
business, so a customer with a sole trade and a rental property triggers one calculation, not
two. Two objects say what went into it:

- `calculation.businessProfitAndLoss` is an array with one entry per income source, each
  carrying `incomeSourceId`, `incomeSourceType` (`self-employment`, `uk-property` or
  `foreign-property`), `incomeSourceName`, `totalIncome`, `totalExpenses`, `netProfit` or
  `netLoss`, and `taxableProfit`.
- `inputs.incomeSources.businessIncomeSources` lists every source HMRC used, with each one's
  `latestPeriodEndDate` and `latestReceivedDateTime`.

The second is what tells a customer their property figures actually reached the calculation. A
business missing from that list has nothing filed against it, and the page says so before the
customer declares rather than after.

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

### Individual Losses (MTD) 7.0

One resource holds everything for one business in one tax year:

`GET|PUT|DELETE /individuals/losses/{nino}/businesses/{businessId}/loss-claims/{taxYear}`

HMRC allows it only after the tax year has ended, so it is a year-end step and never an in-year
one. The PUT creates and amends together. The create and amend also accepts HMRC's
`suspendTemporalValidations` header, which the sandbox needs when a test year has not really
ended.

The body has two objects, both optional, neither empty:

- `losses.broughtForwardLosses`: the amount of earlier losses applied in this tax year.
- `claims.carryForward`: `currentYearLosses`, `previousYearsLosses`.
- `claims.carrySideways.currentYearGeneralIncome`: this year's trading loss set against this
  year's other income.
- `claims.carryBack`: `previousYearGeneralIncome`, `earlyYearLosses`, `terminalLosses`.
- `claims.preferenceOrder.applyFirst`: `carry-sideways` or `carry-back`.

**The journeys, and who actually hits them.**

| Journey | Fields | Who hits it |
|---|---|---|
| Carry this year's loss forward | `claims.carryForward.currentYearLosses` | Common. The ordinary first-year-of-trading case, and any bad year. A landlord's rental loss goes the same way. |
| Use a loss brought forward | `losses.broughtForwardLosses`, `claims.carryForward.previousYearsLosses` | Common. The other half of the same journey, a year later. |
| Set a loss sideways against other income | `claims.carrySideways.currentYearGeneralIncome` | Occasional. Real for a sole trader who also has a job. |
| Carry a loss back to an earlier year | `claims.carryBack.previousYearGeneralIncome`, `earlyYearLosses` | Occasional, and the one that pulls in the adjustments API. |
| Terminal loss on ceasing to trade | `claims.carryBack.terminalLosses` | Rare. Once per business, at the end of it. |
| Choose which claim applies first | `claims.preferenceOrder.applyFirst` | Rare. Only meaningful when a sideways and a carry-back claim exist in the same year. |
| Delete a year's losses and claims | the DELETE | Rare. A correction path. |

The first two carry the weight. A sole trader who loses money in year one and profits in year
two hits both, and a product without them leaves that customer stranded at the final
declaration.

**Carry-back does not apply to property.** The sandbox's `CARRY_BACK_CLAIM` scenario simulates a
carry-back claim type supplied for a property income source, as a rejection. So the page offers
carry-back only when the picked business is a sole trade, and a landlord's loss carries forward.

Scenarios. PUT: `NOT_FOUND`, `CARRY_BACK_CLAIM`, `OUTSIDE_AMENDMENT_WINDOW`, `STATEFUL`. GET:
`TERMINAL_LOSS_CLAIM`, `NOT_FOUND`, `STATEFUL`. DELETE: `NOT_FOUND`,
`OUTSIDE_AMENDMENT_WINDOW`, `STATEFUL`.

### Individuals Tax Liability Adjustments (MTD) 1.0

`GET|PUT|DELETE /individuals/tax-liability/adjustments/{nino}/{taxYear}`

Per person per tax year, not per business, and again only after the tax year has ended. It
takes the same `suspendTemporalValidations` header.

The API is narrower than its name. Its whole request body is two objects:

- `carryBackLossesDecrease`: `incomeTax`, `class4`, `capitalGainsTax`. Each is the amount by
  which a carry-back claim decreases this year's liability, worked out against an earlier tax
  year's liability and credited against this one.
- `taxRefundedOrSetOff.amount`: Income Tax refunded or set off by HMRC or Jobcentre Plus during
  the tax year.

`taxRefundedOrSetOff` sits behind HMRC's own `r22_cl289_docs` release flag and their schema
marks it test-only until it goes live. The page gains the field when HMRC releases it. Until
then the endpoint carries `carryBackLossesDecrease` alone.

**The journeys.**

| Journey | Who hits it |
|---|---|
| Tell HMRC what a carry-back claim saves, so this year's liability is credited | Occasional, exactly as often as a carry-back claim |
| Declare Income Tax refunded or set off during the year | Waiting on HMRC's release flag |
| Delete the year's adjustments | Rare. A correction path. |

So this API serves one live journey, and it is the second half of the carry-back journey rather
than a general adjustments surface.

Scenarios. PUT: `OUTSIDE_AMENDMENT_WINDOW`, `STATEFUL`. GET: `NOT_FOUND`, `STATEFUL`. DELETE:
`NOT_FOUND`, `OUTSIDE_AMENDMENT_WINDOW`, `STATEFUL`.

**The two APIs are ordered, and HMRC says so in both directions.** A carry-back loss must reach
Individual Losses, and its matching decrease must reach the adjustments endpoint, before the
final declaration. So the year-end runs: annual submission, adjustable summary, losses and
claims, tax liability adjustments, calculation, final declaration. The losses step comes before
the calculation because the calculation has to see the claims.

**What we cannot work out, and what the customer does instead.** The three
`carryBackLossesDecrease` figures are amounts of tax, computed by applying the loss to an
earlier year's liability. HMRC exposes no endpoint that recomputes an earlier year for us, and
we do not compute tax (D2). So the customer supplies those three numbers, from their own or
their accountant's computation.

What the page can do without computing anything: retrieve the earlier year's calculation with
the endpoint we already have and show its `totalIncomeTaxAndNicsDue` beside the field, so the
customer has HMRC's own figure for that year in front of them while they enter the decrease. The
page shows both years and subtracts nothing. An endpoint that recalculates an earlier year with
a loss applied is the open problem here; if HMRC publishes one, the page fills the figures
instead of asking for them.

## The customer journey

The dashboard at `web/public/hmrc/itsa/dashboard.html` lists six numbered steps today. Phase 2
appends six, and puts a divider between the in-year half and the year-end half.

| Step | Page | What the customer does |
|---|---|---|
| 7 | `annualSubmission.html` | Loads the year's annual submission for a business, enters adjustments and allowances, saves them to HMRC |
| 8 | `adjustments.html` | Triggers the adjustable summary for the accounting period, reads the net profit HMRC computed, changes a figure if it is wrong |
| 9 | `lossesAndClaims.html` | For a business that made a loss, says what happens to it: carried forward, set sideways, or carried back |
| 10 | `taxLiabilityAdjustments.html` | For a carry-back claim, enters what it saves against this year's liability |
| 11 | `taxCalculation.html` | Triggers a calculation and reads what the year owes |
| 12 | `finalDeclaration.html` | Reads the calculation again, confirms it is complete and correct, files the return |

Steps 9 and 10 appear only when they apply. A business with no loss skips step 9, and a
customer with no carry-back claim skips step 10. Neither is hidden: the dashboard says what
each is for and why it does not apply, so a customer with a loss cannot walk past it.

Order matters and the pages enforce it. The adjustments page refuses to trigger while any
quarterly obligation for the year is open, because HMRC answers `RULE_OBLIGATIONS_NOT_MET`. The
losses page comes before the calculation, because the calculation has to see the claims. The
adjustments endpoint and the carry-back claim behind it must both land before the final
declaration, which is HMRC's own rule stated in both API guides. The final declaration page
refuses to submit against a calculation whose `metadata.calculationType` is not
`intent-to-finalise`.

### The property pages and the business picker

Every ITSA call after Business Details is typed. The endpoint path, the request body and the
field names all follow the business's `typeOfBusiness`, and none of them overlap between a sole
trade and a rental. So the property pages sit beside the self-employment ones rather than
inside them, and each page holds exactly one request shape.

| Page | What the customer does |
|---|---|
| `ukPropertyPeriod.html` | Files a quarterly update for a UK property business |
| `ukPropertyPeriods.html` | Lists the year's property period summaries |
| `ukPropertyPeriodView.html` | Reads one property period summary |
| `ukPropertyPeriodAmend.html` | Corrects one property period summary |
| `ukPropertyAnnualSubmission.html` | Enters the property adjustments and allowances for the year |
| `ukPropertyAdjustments.html` | Triggers and reads the property adjustable summary, changes a figure if it is wrong |

The dashboard gains a business picker above the numbered steps. It calls Business Details,
lists what HMRC returned, and the customer picks one. The picked business travels as a pair,
the `businessId` and its `typeOfBusiness`, and the numbered steps then link to the page family
that type names. A customer with one sole trade sees the journey phase 1 and phase 2 already
built. A customer with a rental as well picks it and walks the same ten steps against the
property pages.

Nothing in the picker is guessed. The type comes from HMRC's own answer to Business Details,
never from a customer choice or a stored default.

### What a customer with both income types needs

The four in-year steps and the first two year-end steps run once per business. The last two run
once for the year, because HMRC calculates and files a whole return, never a business.

**Obligations.** One page, one call, grouped output. HMRC answers one entry per business, each
carrying its own `obligationDetails`, so the table groups by business and shows the type, the
business id, the period and the due date on every row. Every date on that page is read from
what HMRC returned. None is computed, and no period key is ever built by us. Until every open
quarterly obligation for the year is met, on every business, the adjustable summary trigger
answers `RULE_OBLIGATIONS_NOT_MET`, so the page states plainly which business still owes an
update.

**The year-end pages.** The annual submission and the adjustable summary are per business, so
the customer runs each once for the sole trade and once for the rental. The dashboard tracks
which businesses are done from what HMRC returns for each. It stores no progress of its own.

**The tax calculation.** One calculation, one page. Under the headline the page renders one row
per entry in `calculation.businessProfitAndLoss`, naming the source and its taxable profit. A
customer with one business sees one row.

**The final declaration.** One call for the whole return. The page lists every business in
`inputs.incomeSources.businessIncomeSources`, with the latest period end date HMRC holds for
each. This page exists to catch a business the customer has that HMRC did not count. The
customer sees the gap before they tick the declaration, while they can still fix it.

The same list carries the loss position. Against each business the page shows what the losses
and claims retrieve answered for that business and tax year, and whether the tax liability
adjustments retrieve holds anything for the year. A business whose calculation shows a loss with
no claim recorded against it is the second gap this page catches, and a customer who ticks
without deciding what happens to a loss has given away a claim they could have made.

### What a cumulative year changes for the customer

The dashboard's numbered steps do not change. Step 3 files an update either way. What changes
is what the form asks for and what the page can show.

**The figures are totals, not a quarter's.** A page that labels a field "turnover this quarter"
over a cumulative endpoint shows the wrong number. In a cumulative year every money label reads
as the total for the year so far, up to the end date of the obligation the customer picked. The
page names that date in the label, taken from the obligation.

**The page loads what HMRC holds first.** The cumulative retrieve answers the running total
HMRC currently has. The update page loads it, shows it as the starting point, and the customer
edits it to the new total. In a dated year a new quarter starts from an empty form, because
there is nothing yet for that quarter.

**A "this period" figure is a display, never a payload.** Showing the difference between the
new total and the one HMRC holds helps a customer check their own arithmetic. What we send is
the total. The difference never reaches a request body.

**Amending.** In a cumulative year, `selfEmploymentPeriodAmend.html` and
`ukPropertyPeriodAmend.html` load the current total and send a new one. There is no `periodId`
or `submissionId` to address, so the page asks for no id and shows none.

**Listing.** In a cumulative year, `selfEmploymentPeriods.html` and `ukPropertyPeriods.html`
show the year's obligations with the one current total against them, from the obligations call
and the cumulative retrieve. There is no list of submissions to render.

### The obligations page and the reporting type

An obligation detail HMRC returns carries `periodStartDate`, `periodEndDate`, `dueDate`,
`status` and `receivedDate`. Nothing in it names a reporting type, and nothing names a quarter.

So the page renders the rows it was given and counts nothing. It never labels a row "Q1", never
assumes four rows, and never assumes a start date. A business reporting annually answers with
one obligation covering the tax year. A business on calendar quarters answers with four whose
boundaries differ from the standard ones. Both render as rows.

Whatever the page shows, the dates a submission carries come from the row the customer picked,
and only from there.

Obligations (MTD) 3.0 has a `CUMULATIVE` scenario that answers cumulative quarterly updates, so
the simulator serves it and the pages are built against the shape HMRC actually returns.

### What the customer sees before a final declaration

HMRC's minimum functionality standards let software either signpost the customer to their HMRC
account or display the estimate itself. We display it, so the standard binds: the estimate must
carry a disclaimer as to its accuracy, shown with the figure and not behind a link.

Every figure on both pages is HMRC's own, returned by the Individual Calculations API. We
render, we do not compute. No total on either page is added up in our code.

`taxCalculation.html` shows, in this order:

1. Which kind of calculation this is, from `metadata.calculationType`, in the customer's words
   above the figures. An `in-year` result reads as an estimate for the year so far. An
   `intent-to-finalise` result reads as the figures the return will be filed on. The two look
   different on screen, so a customer cannot mistake one for the other.
2. The disclaimer, above the figures. It says the calculation is an estimate based on the
   information submitted so far, that HMRC produced it, and that it can change when more
   information is submitted. It shows for every calculation type; an `intent-to-finalise`
   result is still a calculation of what has been submitted so far.
3. `calculation.taxCalculation.totalIncomeTaxAndNicsDue`, as the headline.
4. Income tax, National Insurance and tax already deducted, as the three lines under it, from
   `incomeTax`, `nics` and `totalTaxDeducted`.
5. `calculation.allowancesAndDeductions`, each entry named and shown.
6. One row per entry in `calculation.businessProfitAndLoss`, naming the source and its taxable
   profit. Where that entry carries `totalBroughtForwardIncomeTaxLosses`,
   `broughtForwardIncomeTaxLossesUsed`, `adjustedIncomeTaxLoss` or
   `taxableProfitAfterIncomeTaxLossesDeduction`, the row shows them, so a customer can see the
   loss they claimed being used.
7. Every entry in `messages`, whenever the array holds anything. Errors first, then warnings,
   then info, each labelled with its level and each naming the figure it refers to. Info and
   warning messages are HMRC telling the customer something about their own return, so they
   show; only an empty array shows nothing.
8. `metadata.calculationTimestamp` and the `calculationId`, so the customer can see when HMRC
   produced these figures and which calculation they belong to.

**The page does not cache.** It triggers a fresh calculation and fetches the result on every
page load. A calculation belongs to one `calculationId`, and anything submitted after HMRC ran
it makes it stale, so a figure held from a previous visit is a figure that may already be
wrong. The retrieve handler stores nothing between requests and the page keeps nothing in
`sessionStorage` beyond the sign-in state it already carries. `request-cache.js` stays on the
page for the bundle and auth widgets that use it; no ITSA calculation call goes through it.

`finalDeclaration.html` shows the same figures, retrieved fresh from the `intent-to-finalise`
calculation on every page load, plus the businesses HMRC counted and the declaration wording
the customer ticks. That wording says the information given is correct and complete to the best
of their knowledge, and that they understand they may have to pay financial penalties and face
prosecution if they give false information. The submit button
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
| Quarterly update, created or amended, self-employment or property | 1 |
| Annual submission, created or amended | 0 |
| Adjustable summary trigger, retrieve, adjust | 0 |
| Losses and claims, created, amended or deleted | 0 |
| Tax liability adjustments, created, amended or deleted | 0 |
| Tax calculation trigger and retrieve | 0 |
| Final declaration | 1 |
| Every read (business details, obligations, ITSA status, period summaries) | 0 |

The charge is per submission, and HMRC issues obligations per business, so a year costs what
the customer's businesses cost:

| Customer | Quarterly updates | Annual submissions | Final declaration | Year |
|---|---|---|---|---|
| One sole trade | 4 | 1, free | 1 | 5 tokens |
| One rental | 4 | 1, free | 1 | 5 tokens |
| A sole trade and a rental | 8 | 2, free | 1 | 9 tokens |

A sole trader's year is five tokens: four quarterly updates and one declaration. The year-end
working steps are free because they sit inside a year end the declaration charges for, and a
customer who corrects an allowance twice should not pay twice. See D1.

Losses and claims and tax liability adjustments follow that rule. Both are year-end steps
before the declaration, and a customer working out how to use a loss will save the page more
than once. The adjustments endpoint also sits outside D6's per-business metering, because HMRC
scopes it to the person and the tax year rather than to a business, so there is nothing per
business to meter. Neither API needed a change to the token model.

The `resident-itsa` bundle grants 100 tokens a month, so nine in a year sits well inside the
allowance. The number still shows before the customer spends it. The dashboard's business
picker names what a year costs for the businesses HMRC listed, `usage.html` carries the same
figures beside the running total it already shows (D6), and every page that writes says what
that write costs (D8).

Every write charges through `consumeTokenForActivity` on the initial request, before the HMRC
call, on one submission for one business. Two rules keep that honest. No handler ever batches
two businesses into one request, so one charge is always one business's submission. And the
async worker never charges: the ingest Lambda charges once and the worker replays the payload,
so a retry cannot spend a second token.

### What a submission costs, before the customer sends

One component, on every page that writes. `web/public/widgets/submission-cost.js` sits beside
the other widgets and each page includes it once, directly above its submit control, in
document order rather than positioned there. Ten pages use it: the four period pages that
write, the two annual submission pages, the two adjustment pages and the final declaration
page, across both income types and both quarterly models. None of them holds a copy of the
logic.

**What it reads.** The activity's `tokenCost` and `metered` flag come from the catalogue the
page already loads for its entitlement check. The remaining allowance comes from
`GET /api/v1/bundle`, which answers `tokensRemaining` for the account and for each bundle,
fetched through `window.requestCache` so several widgets on one page share one call. The reset
date comes from that same response's `tokenResetAt`. No date and no balance is calculated here.

**Three states, and it never blocks a submission.**

| State | What the customer reads |
|---|---|
| Cost and balance both known | "This submission costs 1 token. You have 87 left." |
| Cost known, balance not | "This submission costs 1 token." No number, no guess. |
| The write is free | "This submission is free. It does not use a token." |

The second state covers a slow, failed or not-yet-signed-in balance read. The submit button
stays enabled. The server is the authority: `consumeTokenForActivity` runs before the HMRC call
and answers `403` with `reason: "tokens_exhausted"` when the allowance is gone. The line
informs, and never becomes a second gate that a network hiccup can close.

**It shows nothing stale.** The number belongs to the page load that fetched it. After a
successful write the page invalidates `/api/v1/bundle` in the request cache, the way
`auth-status.js` already does after a bundle change, and the widget re-reads so the figure
matches the charge just made. If that re-read fails the widget clears the number and drops to
the second state. An old figure is never left on screen looking current.

**When the next write would exceed the allowance.** This is the case worth getting right,
because telling the customer at the end of a form is telling them too late.

With a balance of zero, or less than the write costs, the line says so and says what to do:
"You have no tokens left. Your allowance refreshes on 6 October 2026, or you can add a bundle,"
with the date read from `tokenResetAt` and a link to `bundles.html`. The submit button is
disabled and the reason sits next to it in text, not in a colour or a tooltip. Everything the
customer typed stays on the form, so they can add a bundle in another tab and come back to it.

When the balance read failed and the allowance turns out to be exhausted, the server's `403`
carries the customer to the same sentence in the same place. One message, whichever path found
the problem.

**The free writes say they are free.** The annual submission costs nothing (D1) and the
adjustable summary trigger, retrieve and adjust cost nothing either. A page that stays silent
about cost on a free write teaches the customer nothing about which steps spend their
allowance. Saying "this one is free" tells them something, so those pages carry the line too.
The final declaration costs a token and says so, beside the calculation id it is about to
confirm.

## The data

**Receipts.** Every ITSA write stores a receipt through `putReceipt` from
`app/data/dynamoDbReceiptRepository.js`, into the same receipts table the VAT path uses, with
the same seven-year TTL from `calculateHmrcTaxRecordTtl` and the same point-in-time recovery.
Phase 1 does not store one for the quarterly update. Phase 2 adds it.

| Write | Receipt id | Receipt body |
|---|---|---|
| Quarterly update, self-employment | `{timestamp}-{periodId}` | HMRC's `periodId`, the business id, the period dates, the correlation id |
| Quarterly update, UK property | `{timestamp}-{submissionId}` | HMRC's `submissionId`, the business id, the period dates, the correlation id |
| Annual submission | `{timestamp}-{businessId}-{taxYear}` | The business id, the tax year, `typeOfBusiness`, the adjustments and allowances sent, the correlation id |
| Final declaration | `{timestamp}-{calculationId}` | The calculation id, the tax year, `calculationType`, `totalIncomeTaxAndNicsDue` as confirmed, the correlation id |

The self-employment annual submission and the final declaration answer `204` with no body, and
the property annual submission answers `200` with none either, so those receipts are built from
what we sent plus HMRC's `X-CorrelationId`. The property quarterly update is the one property
write that answers a body: a `submissionId`, which the receipt carries the way the
self-employment receipt carries `periodId`. That correlation id is the only thing
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

The property writes and reads take their own names, so a query can tell the two income types
apart without reading a payload: `itsa-uk-property-period-filed`,
`itsa-uk-property-period-amended`, `itsa-uk-property-period-queried`,
`itsa-uk-property-periods-queried`, `itsa-uk-property-annual-submission-queried`,
`itsa-uk-property-annual-submission-filed`, `itsa-uk-property-bsas-queried` and
`itsa-uk-property-bsas-adjusted`. The trigger keeps its single name, `itsa-bsas-triggered`,
because one endpoint serves both types.

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

- `buildSelfEmploymentQuarterlyUpdates(book, lines, obligations, taxData)`: for each obligation
  period HMRC returned, the `periodIncome`, `periodExpenses` and `periodDisallowableExpenses`
  objects the period summary endpoint takes. The periods come from the obligations response, so
  a business on calendar quarters or reporting annually gets the periods it actually has.
- `buildSelfEmploymentCumulativeUpdate(book, lines, taxData, upToDate)`: the same three objects,
  totalled from the start of the tax year to `upToDate`. A cumulative year wants a running
  total rather than a quarter's figures, and a running total is the same book cut differently,
  so this is a second form of the existing mapping rather than a second mapping. `upToDate` is
  the end date of the obligation the customer picked, never a date we calculate.
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

**What the template can reach.** The spreadsheets side's own T8 design measured it: the shipped
self-employed template can source 24 of the 55 ITSA field slots. It cannot source the other 31.
The derivations omit those fields. They never send a zero for a figure the book does not carry,
because a zero is a claim about the customer's business and an omission is not.

HMRC's cumulative rule and that omission rule meet without colliding, because they are about
different fields. HMRC requires a cumulative self-employment submission to carry values for
income and expenses even when they are zero. A field the book carries whose running total is
genuinely nil is a zero, and it goes. A field the book cannot source is not a zero, and the
page asks the customer for it before anything is sent. We never turn "we do not know" into "it
was nothing". That shapes two
things here. The annual submission request keeps its "drop an empty section" rule, so a
derivation that fills nothing in `adjustments` leaves `adjustments` out of the body altogether.
And the year-end pages prefill only the slots the book reaches; the rest stay empty for the
customer to type, marked as fields the import could not fill rather than left looking answered.
The same 31 slots are unreachable in a cumulative year, so the same marking applies there.

**Property has no source at all.** The shipped self-employed template models a trade, not a
rental. It carries no rents-received column, no property expense analysis and no property
capital allowances schedule, so no derivation can produce a property period summary or a
property annual submission from it today. A property book in the engine is the open problem;
until one exists, the property pages take typed figures. That is work for the spreadsheets
repository to scope, and it does not hold up anything in this phase.

Until the derivations land, the phase 2 pages take typed figures, as the phase 1 quarterly
update page does. Nothing in this phase's build sequence waits on the DIYA-GL import.

## The recognition application and the finder listing

This track starts when the build runs against the sandbox and not before, which is the
operator's parked decision. HMRC's how-to-integrate guide sets out what it takes.

HMRC recognises three product shapes. Ours is a **full end-to-end product**, built in two
stages. The guide allows the stages to be approved one at a time, and we apply for both at once
(D3), as one submission covering the whole journey from a quarterly update to a filed return:

| Stage | APIs HMRC requires |
|---|---|
| In-year (quarterly updates) | Business Details, Obligations, Self-Employment Business, Property Business, Individual Calculations |
| End-of-year | Business Details, Self-Employment Business, Property Business, Business Source Adjustable Summary, Individual Losses, Individuals Tax Liability Adjustments, Obligations, Individual Calculations |

Applying for both stages at once means the checklist has to answer for every API in both rows
before anything is sent. All nine have a build in this phase (D9), Individual Losses and
Individuals Tax Liability Adjustments included, so the checklist answers each with working
endpoints and a customer journey behind it.

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

Twenty-two tracks. Each is one sub-agent's work. The ten endpoint tracks share a spine of files
every new Lambda has to touch, so they hold that spine one at a time, in order, each rebasing on
the previous merge. That is the pattern `PLAN_COMPANIES_HOUSE_REST_FILING.md` used for
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

`hmrcItsaCalculationGet.js` returns HMRC's body whole. It picks out no fields, so `messages`,
`metadata.calculationTimestamp`, `metadata.calculationType`,
`calculation.businessProfitAndLoss` and `inputs.incomeSources` all reach the page. It stores
nothing between requests, and the async request row is read once and then done, so a second
page load runs a second trigger and a second retrieve rather than replaying the first (D2).

Proves: unit tests including the retry on the calculation's `404`, the `ERROR_MESSAGES_EXIST`
body and the `RULE_RECENT_SUBMISSIONS_EXIST` rejection; a unit test pinning that the retrieve's
response carries `messages`, `metadata.calculationTimestamp` and `businessProfitAndLoss`
unaltered; a system test against the simulator; `./mvnw clean verify`.

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

`taxCalculation.html` renders what D2 sets out: the calculation type in the customer's words,
the disclaimer above the figures, the headline, the three-line breakdown, allowances and
deductions, a row per entry in `businessProfitAndLoss`, every `messages` entry at all three
levels, and the timestamp with the calculation id. An `in-year` result reads visibly as an
estimate and an `intent-to-finalise` one visibly as the figures the return will be filed on.
The page triggers and fetches on every load and holds no calculation between loads.

Proves: `npm run test:browser`; `npm run test:itsaAnnualSubmissionBehaviour-simulator` and
`npm run test:itsaFinalDeclarationBehaviour-simulator`; a browser test that an info-only
`messages` array still renders, and one that a second page load runs a second trigger.

### T7. The sandbox proof (Sonnet)

Owns `scripts/itsa-sandbox-year.js` and `_developers/hmrc/ITSA_PHASE_2_SANDBOX.md`.

Files a whole tax year against the sandbox with one test user, for two businesses: four
quarterly updates and an annual submission for a sole trade, the same four and one for a UK
property business, a triggered and adjusted summary for each, then one `intent-to-finalise`
calculation and one final declaration covering both. Uses `mtd-sa-test-support-api/1.0` to
create both businesses and set the ITSA status, and its vendor-state checkpoints to reset
between runs.

The property leg is what proves the mixed customer works end to end. The run reads back
`inputs.incomeSources.businessIncomeSources` from the calculation and checks both businesses
are in it before it declares.

**Two runs, not a matrix.** There are two income types and two quarterly models, and two runs
cover all four pairings:

| Run | `ITSA_SANDBOX_TAX_YEAR` | Covers |
|---|---|---|
| A | a year up to 2024-25 | Both businesses on the dated period summaries |
| B | a year from 2025-26 | Both businesses on the cumulative period summary |

The script picks the endpoint family the same way the handlers do, by calling
`resolveItsaSubmissionModel` on the year it was given. It carries no branch of its own and no
hardcoded year, so run B proves the shared function as well as the endpoints. Run B also needs
a test ITSA status set through the test support API, because a cumulative year's reporting type
comes from it.

Losses and adjustments do not multiply that. Both APIs are year-end only and scoped to a tax
year, and neither knows anything about the quarterly model, so exercising them once proves them
for both. Run A carries the whole sequence on the sole trade: a carry-forward claim, a
brought-forward loss, a carry-back claim, the matching `carryBackLossesDecrease`, then the
calculation and the declaration. That is the order HMRC's own guides require, so run A proves
the ordering as well as the endpoints. Run B adds two calls and no sequence: a carry-forward
claim on the property business, and one carry-back attempt on it that must come back rejected.

Both runs send `suspendTemporalValidations` on the losses and adjustments writes, because HMRC
allows those endpoints only after a tax year has ended and a sandbox year has not really
ended. Records each response so the simulator
scenarios match what HMRC returns, the way the phase 1 simulators were corrected against the
sandbox.

Proves, on each run: a `204` from the final declaration, both businesses present in the
calculation's income sources, and the fraud header validator clean on the same header set. Run A
also proves the calculation reflects the loss it claimed, and run B that a property carry-back
is refused.

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

`derive_itsa_quarterly_update` answers a period's figures in a dated year and a running total in
a cumulative one, from the same book, by calling whichever derivation the tax year names. It
sends an omission for any of the 31 field slots the template cannot source, never a zero.

Waits on T8, on T19 for the cumulative page shape, and on `PLAN_SUBMISSION_MCP.md` M1.

### T10. The recognition pack (Haiku to assemble, operator to send)

Owns `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md`, an ITSA pass over the two
questionnaires, and the two draft emails.

One application covers both approval stages (D3), so the checklist answers for every API in
both rows of the stage table in one pass. All nine have a build behind them (D9): Business
Details, Obligations, Self-Employment Business, Property Business, Business Source Adjustable
Summary, Self Assessment Individual Details, Individual Calculations, Individual Losses and
Individuals Tax Liability Adjustments. Nothing in the checklist rests on a reviewer agreeing
that a function is optional.

The two draft emails carry the same change. The SDST email asks for approval of the whole
end-to-end journey rather than the in-year stage alone, names the sandbox application id, and
lists both income types the journey covers. The software vendor team email describes the
product as filing quarterly updates, loss claims and a final declaration for self-employment and
UK property income.

Waits on T7. The operator sends.

### T11. The UK property period summary (Sonnet)

Copies from `hmrcItsaSelfEmploymentPeriodPost.js`, `...Put.js`, `...Get.js` and `...sGet.js`.
The four handlers differ from their self-employment twins only in the path, the body field
names and the scenario set, all of which this document lists.

Owns `app/functions/hmrc/hmrcItsaUkPropertyPeriodPost.js`, `hmrcItsaUkPropertyPeriodPut.js`,
`hmrcItsaUkPropertyPeriodGet.js`, `hmrcItsaUkPropertyPeriodsGet.js`, their unit tests,
`app/http-simulator/routes/itsa-uk-property-period.js`,
`app/http-simulator/scenarios/itsa-uk-property-period.js`, and the spine.

Routes `/api/v1/hmrc/itsa/uk-property/period` and `/api/v1/hmrc/itsa/uk-property/periods`.
Exports `buildUkPropertyPeriodRequestBody`, shaped like `buildSelfEmploymentPeriodRequestBody`:
it drops empty sections, refuses `consolidatedExpenses` beside the itemised expenses, and
rejects a body that would be entirely empty. The POST charges one token, stores a receipt
carrying HMRC's `submissionId`, and reports failures on the `ItsaSubmissionFailure` metric T1
created. So does the PUT, the way the self-employment amend does. One request carries one
business, so one charge is one business's submission (D6).

Every date in the request comes from the obligation the customer picked on screen. No period
key, date range or quarter is computed here or anywhere else.

Proves: unit tests over the body builder including the consolidated and itemised forms and the
`rentARoom` nesting; unit tests over the token charge and the receipt; a system test against
the simulator; `./mvnw clean verify`.

### T12. The UK property annual submission (Sonnet)

Copies from `hmrcItsaSelfEmploymentAnnualGet.js` and `hmrcItsaSelfEmploymentAnnualPut.js`.

Owns `app/functions/hmrc/hmrcItsaUkPropertyAnnualGet.js`, `hmrcItsaUkPropertyAnnualPut.js`,
their unit tests, `app/http-simulator/routes/itsa-uk-property-annual.js`,
`app/http-simulator/scenarios/itsa-uk-property-annual.js`, and the spine.

Route `/api/v1/hmrc/itsa/uk-property/annual`. Exports `buildUkPropertyAnnualRequestBody`, which
wraps everything in `ukProperty`, refuses `propertyIncomeAllowance` beside the itemised
allowances, refuses it beside `privateUseAdjustment`, and keeps a `false` for
`nonResidentLandlord` or `rentARoom.jointlyLet` in the body while still dropping a field the
customer left unanswered. That boolean rule is the part of this track that goes wrong quietly,
so it earns its own tests.

The PUT answers `200`, not the `204` the self-employment annual submission answers. It costs no
token (D1) and stores a receipt.

Proves: unit tests over both allowance forms, both mutual-exclusion rules, a `false` boolean
surviving into the body and an unanswered boolean staying out, and the structured building
allowance arrays; a system test against the simulator; `./mvnw clean verify`.

### T13. The property adjustable summary (Sonnet)

Copies from `hmrcItsaBsasSelfEmploymentGet.js` and `hmrcItsaBsasSelfEmploymentAdjustPost.js`.

Owns `app/functions/hmrc/hmrcItsaBsasUkPropertyGet.js`,
`hmrcItsaBsasUkPropertyAdjustPost.js`, their unit tests, and, alongside those, the change to
`hmrcItsaBsasTriggerPost.js` that turns its fixed `typeOfBusiness` constant into a validated
request field. Also `app/http-simulator/routes/itsa-bsas.js` and
`app/http-simulator/scenarios/itsa-bsas.js`, extended with the uk-property routes and their
scenarios, and the spine.

Routes `/api/v1/hmrc/itsa/bsas/uk-property` and `/api/v1/hmrc/itsa/bsas/uk-property/adjust`.
The adjust body wraps `income` and `expenses` in `ukProperty`, or carries
`{ "ukProperty": { "zeroAdjustments": true } }`. The simulator's retrieve route answers
not-found without a scenario header, matching HMRC and matching the self-employment route T4
already built.

Proves: unit tests over the trigger's `typeOfBusiness` validation, the `zeroAdjustments` body,
the `ALREADY_ADJUSTED` path and the two property-only rejections; a unit test that the trigger
still sends `self-employment` when a self-employment business is picked; a system test against
the simulator; `./mvnw clean verify`.

### T14. The property pages (Sonnet)

Copies from the self-employment pages the same step builds: `selfEmploymentPeriod.html` for the
entry pages, `selfEmploymentPeriodView.html` for the read-only ones, `annualSubmission.html`
for the annual page and `adjustments.html` for the summary page.

Owns `web/public/hmrc/itsa/ukPropertyPeriod.html`, `ukPropertyPeriods.html`,
`ukPropertyPeriodView.html`, `ukPropertyPeriodAmend.html`, `ukPropertyAnnualSubmission.html`,
`ukPropertyAdjustments.html`, the property additions to
`web/public/lib/services/hmrc-service.js`, `web/public/submit.catalogue.toml` (the new page
paths on the `self-employed` activity, which keeps its `environments = ["local", "proxy",
"ci"]` and gains nothing else), the browser tests, the behaviour tests
`behaviour-tests/itsaUkPropertyPeriod.behaviour.test.js` and
`behaviour-tests/itsaUkPropertyAnnualSubmission.behaviour.test.js`, `playwright.config.js`,
`package.json` and `scripts/bundle-for-tests.js`.

The design work in this track is the labels. The property period summary and the property
adjustable summary name the same money differently, so each page uses the field names of the
endpoint it calls and never borrows the other's.

Every page here that writes includes `submission-cost.js` above its submit control (T20, D8).
That is one script tag and one container per page; the widget holds the logic.

Proves: `npm run test:browser`; `npm run test:itsaUkPropertyPeriodBehaviour-simulator` and
`npm run test:itsaUkPropertyAnnualSubmissionBehaviour-simulator`.

### T15. The business picker and the mixed-customer year end (Sonnet)

Owns `web/public/hmrc/itsa/dashboard.html`, `businessDetails.html`, `obligations.html`,
`taxCalculation.html`, `finalDeclaration.html` and `web/public/usage.html`.

Adds the business picker above the dashboard's numbered steps, so a picked business travels as
a `businessId` and `typeOfBusiness` pair and the steps link to the page family that type names.
Groups the obligations table by business. Renders one `businessProfitAndLoss` row per income
source on the calculation page, with the brought-forward and adjusted loss figures that entry
carries. Lists every business in `inputs.incomeSources` on the declaration page, with the latest
period end date HMRC holds for each, the loss position the losses retrieve answered for it, and
whether the year holds any tax liability adjustment.

The dashboard grows from ten numbered steps to twelve, and shows steps 9 and 10 as applicable or
not rather than hiding them, so a customer with a loss cannot walk past the claim.

Puts the year's token cost beside the picker, counted from the businesses HMRC listed, and the
same figures on `usage.html` (D6).

Runs after T14, because the dashboard's steps link to pages T14 creates.

Proves: `npm run test:browser`, including a mixed-business fixture where the obligations table
groups two businesses, the calculation page shows two profit rows, and the picker names nine
tokens for the year; a fixture where a business shows a loss with no claim recorded and the
declaration page says so above the tick; the two existing ITSA behaviour suites still pass
against the simulator.

### T16. The tax year model and the shared validator (Haiku)

Owns `app/lib/hmrcValidation.js` and its unit tests, plus the sweep that removes the
`TAX_YEAR_PATTERN` constant from every ITSA handler that carries one.

Adds `isValidTaxYear(taxYear)` and `resolveItsaSubmissionModel(taxYear)`. The second answers
`"dated"` for 2024-25 and earlier and `"cumulative"` for 2025-26 and later, and throws on
anything that is not a tax year in `YYYY-YY` form. It reads no clock and takes no default.

Runs first of the tracks still to come, because T17 and T18 both call it and every handler
after it uses the shared format check.

Proves: unit tests over the boundary in both directions, including 2024-25, 2025-26 and a
malformed year; `npm run test:unit` across every ITSA handler the sweep touched;
`./mvnw clean verify`.

### T17. The self-employment cumulative period summary (Sonnet)

Owns `app/functions/hmrc/hmrcItsaSelfEmploymentPeriodPost.js`,
`hmrcItsaSelfEmploymentPeriodPut.js`, `hmrcItsaSelfEmploymentPeriodGet.js`,
`hmrcItsaSelfEmploymentPeriodsGet.js`, their unit tests,
`app/http-simulator/routes/itsa-self-employment-cumulative.js`,
`app/http-simulator/scenarios/itsa-self-employment-cumulative.js`, and the spine.

Keeps the routes it has. Inside each handler `resolveItsaSubmissionModel(taxYear)` chooses the
HMRC path and the response shape. `buildSelfEmploymentPeriodRequestBody` builds both bodies
unchanged, with one addition: in a cumulative year `periodIncome` and `periodExpenses` carry a
value for every field the page collected, zeros included, because HMRC requires that. The
period dates go in the body only when the picked obligation is shorter than the tax year.

The token charge does not move. One request is one business's submission either way, so the
charge stays where T1 put it (D6).

Proves: unit tests pinning the dated URL for a 2024-25 year and the cumulative URL for a
2025-26 year on the same handler; a unit test that a zero survives into a cumulative body and
that an unanswered field does not; unit tests over the missing-dates and dates-not-allowed
rejections; a system test against the simulator; `./mvnw clean verify`.

### T18. The UK property cumulative period summary (Sonnet)

Owns the four `hmrcItsaUkPropertyPeriod*.js` handlers T11 created, their unit tests,
`app/http-simulator/routes/itsa-uk-property-cumulative.js`,
`app/http-simulator/scenarios/itsa-uk-property-cumulative.js`, and the spine. Runs after T11.

The same shape as T17. `buildUkPropertyPeriodRequestBody` gains the cumulative form, which
wraps `income` and `expenses` in `ukProperty` and carries `fromDate` and `toDate` at the top
level. HMRC states no required-zeros rule for property, so the property body keeps the rule it
already has and leaves an unanswered field out.

Proves: unit tests pinning both URLs from the same handler; unit tests over the `ukProperty`
wrapper, the missing-dates and dates-not-allowed rejections, and the consolidated alternative;
a system test against the simulator; `./mvnw clean verify`.

### T19. The cumulative pages (Sonnet)

Owns `web/public/hmrc/itsa/selfEmploymentPeriod.html`, `selfEmploymentPeriodAmend.html`,
`selfEmploymentPeriods.html`, `selfEmploymentPeriodView.html`, and the four `ukProperty`
twins T14 created. Runs after T14.

Makes each page read the picked obligation and the tax year, then present the right form. In a
cumulative year the money labels read as totals for the year so far and name the date they run
to, the page loads what HMRC currently holds before the customer edits it, the amend pages ask
for no submission id, and the list pages show the year's obligations with the one current total
against them. In a dated year every page behaves as it does today.

The labels are the design work in this track. A cumulative figure under a per-quarter label is
a wrong number on screen, and no test catches a wrong word.

The cost line stays where T20 put it on each page, above the submit control, and says the same
thing in both models. A cumulative resend costs a token like any other write (D8).

Proves: `npm run test:browser` with a dated year and a cumulative year over the same pages;
`npm run test:itsaSelfEmploymentPeriodBehaviour-simulator` and the property twin, each run
against both models.

### T20. The submission cost line (Sonnet)

Owns `web/public/widgets/submission-cost.js`, its browser tests, and the include on the four
writing pages that already exist: `selfEmploymentPeriod.html`,
`selfEmploymentPeriodAmend.html`, `annualSubmission.html` and `finalDeclaration.html`.

It earns its own track. Ten pages across four page tracks use it, so parking it inside any one
of them would make the other three wait. It touches no handler, no spine and no HMRC call, and
it is small enough to land early.

Runs alongside T16 and merges before T14, so every page T14 and T19 create includes it as it is
written. Those tracks add one script tag each and no logic.

Proves: browser tests over all three states, including a failed balance read leaving the submit
button enabled with no number on screen; a test that a zero balance disables the button, names
the reset date from `tokenResetAt` and keeps the typed form intact; a test that a successful
write refreshes the figure rather than leaving the pre-write one.

### T21. Losses, claims and tax liability adjustments (Sonnet)

Copies from `hmrcItsaSelfEmploymentAnnualGet.js` and `hmrcItsaSelfEmploymentAnnualPut.js`. Both
APIs are one resource with a GET, a PUT and a DELETE, so all six handlers are the same thin
shape over a different body.

Owns `app/functions/hmrc/hmrcItsaLossesAndClaimsGet.js`, `hmrcItsaLossesAndClaimsPut.js`,
`hmrcItsaLossesAndClaimsDelete.js`, `hmrcItsaTaxLiabilityAdjustmentsGet.js`,
`hmrcItsaTaxLiabilityAdjustmentsPut.js`, `hmrcItsaTaxLiabilityAdjustmentsDelete.js`, their unit
tests, `app/http-simulator/routes/itsa-losses-and-claims.js`,
`app/http-simulator/routes/itsa-tax-liability-adjustments.js`, the two matching scenario files,
and the spine.

The two APIs travel together because HMRC's own guides make them one journey: a carry-back
claim is not finished until its matching decrease is submitted, and neither can be exercised end
to end without the other. They are also two `Accept` versions, Individual Losses 7.0 and
Individuals Tax Liability Adjustments 1.0, so the version argument to `buildHmrcHeaders` earns a
test on each, the way T3's pair did.

Routes `/api/v1/hmrc/itsa/losses-and-claims` and `/api/v1/hmrc/itsa/tax-liability-adjustments`.
Exports `buildLossesAndClaimsRequestBody` and `buildTaxLiabilityAdjustmentsRequestBody`, both
following `buildAnnualSubmissionRequestBody`: drop an empty section, refuse a body that would be
entirely empty.

Two rules the handlers enforce before the HMRC call. A carry-back claim against a property
business is refused with our own sentence rather than HMRC's `CARRY_BACK_CLAIM` code. And
`claims.preferenceOrder` is refused unless both a sideways and a carry-back claim are present,
because it means nothing on its own.

Both are free writes (D1, D8), so neither charges a token and neither takes the token-charge
block.

Proves: unit tests over both body builders, the property carry-back refusal, the preference
order rule, and the `Accept` version each handler sends; unit tests over the DELETE paths; a
system test against the simulator; `./mvnw clean verify`.

### T22. The losses and adjustments pages (Sonnet)

Copies from `web/public/hmrc/itsa/annualSubmission.html`.

Owns `web/public/hmrc/itsa/lossesAndClaims.html`,
`web/public/hmrc/itsa/taxLiabilityAdjustments.html`, the two service functions in
`web/public/lib/services/hmrc-service.js`, the new page paths on the `self-employed` activity in
`web/public/submit.catalogue.toml`, the browser tests, and
`behaviour-tests/itsaLossesAndClaims.behaviour.test.js` with its `playwright.config.js`,
`package.json` and `scripts/bundle-for-tests.js` entries.

`lossesAndClaims.html` takes the picked business and tax year, loads what HMRC already holds,
and offers carry-forward, sideways and carry-back for a sole trade and carry-forward alone for a
rental. It says which claim it is about to make in a sentence before the customer saves.

`taxLiabilityAdjustments.html` takes the three `carryBackLossesDecrease` figures. Beside them it
shows the earlier year's `totalIncomeTaxAndNicsDue`, retrieved with the calculation endpoint the
product already has, so the customer has HMRC's own figure for that year while they enter the
decrease. The page subtracts nothing and computes nothing.

Both pages include `submission-cost.js` (T20) and both say the write is free.

Runs after T14, which owns `hmrc-service.js` and the catalogue.

Proves: `npm run test:browser`, including the property carry-back option being absent for a
rental and present for a sole trade; `npm run test:itsaLossesAndClaimsBehaviour-simulator`.

### Order

T1, then T2, T3, T4, T5 in that order for the spine, then T6. Those six have landed.

The rest run in this order:

T16 and T20 first, alongside each other. T16 because everything after it uses the tax year
model, T20 because four page tracks include the widget it builds.
Then the endpoint tracks take the spine in turn: T17, T11, T18, T12, T13, T21.
Then the pages: T14, T19, T22, T15.
Then T7, the sandbox proof, which needs every endpoint and every page in place.
T8 runs alongside from the start, in the other repository. T9 after T8 and T19. T10 after T7.

Four ordering rules behind that. T18 grows the handlers T11 creates, so it follows T11. T13
changes `hmrcItsaBsasTriggerPost.js`, which T4 owns, so it runs once no other track holds that
file. T19 and T15 both touch the ITSA page set, and T19 grows pages T14 creates, so the page
tracks run T14, then T19, then T22, then T15. T20 merges before T14 so every page carries the
cost line from the moment it is written. T22 follows T14 because T14 owns `hmrc-service.js` and
the catalogue, and it precedes T15 because the final declaration page reads the loss position
T22's service functions fetch.

## Verification

- Every new endpoint has a unit test pinning the HMRC URL it builds, the `Accept` version it
  sends, and its error mapping, the way the phase 1 handlers' tests do.
- The simulator answers every `Gov-Test-Scenario` value listed in this document for the
  endpoints it serves, with HMRC's own error code and message.
- `npm run test:unit`, `npm run test:system`, `npm run test:browser` and `./mvnw clean verify`
  pass on every track.
- The behaviour suites file a quarterly update, an annual submission and a final declaration
  against the simulator, for a self-employment business and for a UK property business, and the
  same set against ci with the sandbox test user.
- No handler, page or test carries a period key, a date range, a quarter boundary or a specific
  obligation as a literal. Every date a request sends came out of an obligations response.
- `resolveItsaSubmissionModel` is the only place in the repository that compares a tax year to
  the 2025-26 boundary, and no ITSA code reads a clock to decide a tax year.
- The same handler builds the dated HMRC URL for a 2024-25 tax year and the cumulative one for
  a 2025-26 tax year, proved by a unit test on each side of the boundary for both income types.
- A cumulative self-employment body carries a zero for a field the customer entered as nil, and
  omits a field the customer never answered.
- The obligations page renders a one-row annual obligation and a four-row quarterly one from
  the same code, with no row labelled by quarter number.
- In a cumulative year the update page shows the total HMRC currently holds before the customer
  edits it, and the amend page asks for no submission id.
- A final declaration filed in the sandbox leaves a receipt carrying the confirming
  `calculationId`, HMRC's correlation id, and a TTL seven years out.
- Filing a quarterly update and a final declaration each decrement the bundle's tokens by one,
  for both income types. Filing an annual submission decrements nothing, for both income types.
  A user with no tokens gets `403` with `reason: "tokens_exhausted"` and no HMRC call happens.
- A customer with two businesses spends nine tokens over a year, and the dashboard said nine
  before they spent the first one.
- Every page that writes states what the write costs above its submit control, and the two
  annual submission pages state that theirs is free.
- A failed balance read leaves the submit button enabled and shows no number. A submission still
  goes through, and an exhausted allowance is still refused by the server's `403`.
- A zero balance disables the submit button, names the reset date from `tokenResetAt`, and
  leaves everything the customer typed on the form.
- A losses and claims write and a tax liability adjustments write each decrement nothing, and
  each page says the write is free.
- A carry-back claim against a property business is refused by our own handler, in our own
  words, before any HMRC call happens.
- The declaration page names a business whose calculation shows a loss with no claim recorded
  against it, above the tick rather than after it.
- The checklist in `_developers/hmrc/ITSA_PRODUCTION_APPROVALS_CHECKLIST.md` answers for all
  nine APIs in the minimum functionality standards, each with a working endpoint behind it.
- An async worker retry of a quarterly update spends no second token.
- `taxCalculation.html` shows the disclaimer above the figures with the page's stylesheet
  disabled, so it sits in the document order rather than being positioned there.
- `finalDeclaration.html` will not submit until the declaration is ticked, and shows the
  `calculationId` it submits.
- `taxCalculation.html` renders an `in-year` result and an `intent-to-finalise` result so a
  reader can tell them apart without reading a field name, and renders a `messages` array that
  holds only info entries.
- Loading `taxCalculation.html` twice runs two triggers and two retrieves. No calculation
  survives a page load.
- A customer with a self-employment business and a UK property business sees both in the
  obligations table, both as rows under the calculation headline, and both in the income
  sources the final declaration page lists.
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
to T15. Foreign property is a later surface.

**D6. Metering is per business.** A customer with a sole trade and a rental files two sets of
quarterly updates, so their year is nine tokens: four for each business plus one final
declaration. A token is charged per submission to HMRC, and a second business genuinely doubles
what we do. The alternative, a flat charge per tax year, would price two businesses as one.
The pricing surface says plainly what a customer with two businesses pays, so nine tokens is
never a surprise at the year end.

**D7. This phase builds both quarterly models, dated and cumulative.** HMRC splits at 2025-26:
dated period summaries up to 2024-25, a cumulative period summary from 2025-26, on a different
path with a different body, for both income types. Mandation starts on 6 April 2026, which is
the 2026-27 tax year, so a mandated customer's first real filing lands on the cumulative
endpoints. A product that files only sandbox-era years is not a product. This adds tracks T16
to T19.

**D8. Every quarterly update costs a token however often it is sent, and the page says so
before the customer sends.** One rule covers the dated and the cumulative model, and nothing has
to remember which obligation a write met. The year-end working steps stay free, as D1 sets out:
the annual submission, the adjustable summary, the losses and claims, and the tax liability
adjustments. The quarterly update and the final declaration are what a token buys. A cumulative year invites more sends than a dated one, so a customer who reports monthly
and corrects twice can spend fifteen tokens on one business rather than four. That is a
possible and acceptable outcome, not a fault: they sent fifteen submissions to HMRC and each
one cost what a submission costs. `resident-itsa` grants 100 tokens a month, so a heavy
cumulative year stays well inside the allowance. The condition is that the customer sees the
cost and their remaining allowance before they press the button, on every page that writes.
This adds track T20.

**D9. Individual Losses and Individuals Tax Liability Adjustments are built before the
application goes in.** Every one of the nine APIs in the minimum functionality standards has a
build behind it, so the checklist answers for all nine and nothing in T10 is left for a
reviewer to reject. Two reasons. The first is that it removes the only cost D3 created by
applying for both approval stages at once. The second stands on its own: a sole trader making a
loss is the ordinary first-year-of-trading case, and without Individual Losses that customer
files quarterly updates with us all year, reaches the final declaration, and has to finish in
their HMRC account. This adds tracks T21 and T22.

**D5. The sandbox proof reuses the phase 1 test user.** That user has both VAT and Income Tax
enrolments. The businesses, accounting periods and ITSA status the proof needs come from the
test support API, and its vendor-state checkpoints reset the user between runs.

## Sources

- `BACKLOG.md` rows 10, 11 and 11a. `NEXT.md` B10.4 and B11.
- `_developers/hmrc/ITSA_SPIKE.md`, `_developers/hmrc/ITSA_MINIMUM_FUNCTIONALITY_STANDARDS.md`.
- `PLAN_SUBMISSION_MCP.md`, `PLAN_COMPANIES_HOUSE_REST_FILING.md`.
- Making Tax Digital for Income Tax end-to-end service guide, "How to integrate with HMRC APIs":
  <https://developer.service.hmrc.gov.uk/guides/income-tax-mtd-end-to-end-service-guide/documentation/how-to-integrate.html>
- Individual Losses (MTD) 7.0 and Individuals Tax Liability Adjustments (MTD) 1.0, whose
  published specs carry no operation detail at all:
  <https://github.com/hmrc/individual-losses-api> under `resources/public/api/conf/7.0/`, and
  <https://github.com/hmrc/individuals-tax-liability-adjustments-api> under
  `resources/public/api/conf/1.0/`.
- Property Business (MTD) 6.0, and the UK property detail its published spec omits:
  <https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/property-business-api/6.0>
  and <https://github.com/hmrc/property-business-api> under
  `resources/public/api/conf/6.0/`.
- Self Employment Business (MTD) 5.0, and the annual submission detail its published spec omits:
  <https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/self-employment-business-api/5.0>
  and <https://github.com/hmrc/self-employment-business-api> under
  `resources/public/api/conf/5.0/`.
- Individual Calculations (MTD) 8.0, Business Source Adjustable Summary (MTD) 7.0, Property
  Business (MTD) 6.0, Obligations (MTD) 3.0, Self Assessment Individual Details (MTD) 2.0,
  Business Details (MTD) 2.0, Individual Losses (MTD) 7.0, Individuals Tax Liability
  Adjustments (MTD) 1.0 and MTD Self Assessment Test Support 1.0, all at
  `https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/{service}/{version}/oas/resolved`.
