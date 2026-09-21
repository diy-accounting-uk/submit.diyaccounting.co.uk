<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# ITSA phase 2: the sandbox year

`scripts/itsa-sandbox-year.js` files a whole tax year against the HMRC sandbox with one test
user, for a self-employment business and a UK property business: a quarterly update for each
business, an annual submission and a triggered/adjusted business source adjustable summary for
each, a loss claim and a tax liability adjustment on the self-employment business, an
intent-to-finalise calculation and a final declaration covering both businesses. It proves the
phase 2 endpoints work end to end against real sandbox behaviour, the way
`_developers/hmrc/ITSA_SPIKE.md` proved the phase 1 read.

`resolveItsaSubmissionModel` (`app/lib/hmrcValidation.js`) decides how the quarterly updates are
filed, the same way the production handlers decide it: a year up to 2024-25 POSTs four dated
periods to each business; a year from 2025-26 PUTs four running totals to each business's
cumulative resource. The annual submissions, adjustable summaries, losses/tax-liability calls and
the calculation carry no branch of their own.

The script drives the sandbox directly with Playwright and `fetch`, the way the spike did. It
does not call this application's own deployed API, so it needs no ci deployment to run - only
the sandbox application's own credentials and a sandbox test user.

## What it proves

- A `204` from the final declaration.
- The fraud prevention header validator clean on the same header set every other call in the
  run used.

Both print at the end of the run and are written into the transcript.

## Prerequisites

- An AWS SSO session for the `submit-ci` profile: `aws sso login --sso-session diyaccounting`.
- `.env.proxy` at the repo root, with `HMRC_SANDBOX_BASE_URI`, `HMRC_SANDBOX_CLIENT_ID` and
  `DIY_SUBMIT_BASE_URL` set (already there for the proxy variant).
- Playwright's browsers installed: `npm run playwright:install`.
- A sandbox test user enrolled in `mtd-income-tax`, with a NINO:
  ```bash
  HMRC_TEST_USER_SERVICE_NAMES=mtd-income-tax scripts/proxy-secrets.sh node scripts/create-hmrc-test-user.js
  ```
  This writes `hmrc-test-user.json` (`userId`, `password`, `nino`) at the repo root. Point
  `ITSA_SANDBOX_TEST_USER_FILE` at it directly, or reuse an existing test user file that has
  the same three fields.
- The sandbox application (client id ending `v4tV`) subscribed, on the HMRC Developer Hub, to
  every API this script calls: Self Assessment Test Support, Obligations, Self Employment
  Business, Property Business, Business Source Adjustable Summary, Individual Calculations,
  Individual Losses, Individuals Tax Liability Adjustments and Self Assessment Individual
  Details, alongside the Business Details subscription the phase 1 spike already proved. Only
  the Developer Hub account holder can add a subscription; a script cannot.

## The command

```bash
ITSA_SANDBOX_TEST_USER_FILE=./hmrc-test-user.json \
ITSA_SANDBOX_TAX_YEAR=2023-24 \
scripts/proxy-secrets.sh node scripts/itsa-sandbox-year.js
```

`ITSA_SANDBOX_TAX_YEAR` can be a year on either quarterly filing model - a year up to 2024-25
(dated) or from 2025-26 (cumulative). Run each once against a fresh `ITSA_SANDBOX_OUT_DIR` to
cover both.

Add `ITSA_SANDBOX_HEADFUL=true` to watch the sign-in browser, and `ITSA_SANDBOX_OUT_DIR` to
change where the transcript and checkpoint id land (default `./target/itsa-sandbox-year`).

## What each phase should return

| Phase | Call | Expected |
|---|---|---|
| Reset (later runs) | `POST .../checkpoints/{id}/restore` | `200`/`201`/`204`, reusing the saved `businessId` |
| Reset (first run) | `DELETE .../vendor-state` | `204`/`404` |
| Setup (first run) | `POST .../test-support/business/{nino}` (self-employment) | `201` with `businessId` |
| Setup (first run) | `POST .../test-support/business/{nino}` (uk-property) | `201` with a second `businessId` |
| Setup (first run) | `POST .../test-support/itsa-status/{nino}/{taxYear}` | `204` |
| Reset (first run) | `POST .../vendor-state/checkpoints?nino={nino}` | `201` with a checkpoint id, taken after both businesses and the status above exist |
| Verify | `GET .../individuals/business/details/{nino}/list`, `Gov-Test-Scenario: STATEFUL` | `200`, both businesses this script created |
| Verify | `GET .../individuals/person/itsa-status/{nino}/{taxYear}`, `Gov-Test-Scenario: STATEFUL` | `200`, the status this script set |
| Quarterly x4, dated model | `POST .../self-employment/{nino}/{businessId}/period`, `Gov-Test-Scenario: STATEFUL` | `200`/`201`, once per one of the four standard quarterly periods this script derives from the tax year - self-employment only |
| Quarterly x4, cumulative model | `PUT .../self-employment/{nino}/{businessId}/cumulative/{taxYear}`, `Gov-Test-Scenario: STATEFUL` | `204`, the running total from the tax year's start to each standard quarter's end |
| Quarterly x4, cumulative model | `PUT .../property/uk/{nino}/{propertyBusinessId}/cumulative/{taxYear}`, `Gov-Test-Scenario: STATEFUL` | `204`, the property business's own running total (`periodAmount`, not `turnover` - Property Business v6.0's field name) |
| Annual | `PUT .../self-employment/{nino}/{businessId}/annual/{taxYear}` | `204` |
| BSAS trigger | `POST .../adjustable-summary/{nino}/trigger` | `200` with `calculationId` |
| BSAS retrieve | `GET .../adjustable-summary/{nino}/self-employment/{calculationId}/{taxYear}`, `Gov-Test-Scenario: SELF_EMPLOYMENT_PROFIT` | `200`, HMRC's own canned example - not this run's figures, see below |
| BSAS adjust | `POST .../adjustable-summary/{nino}/self-employment/{calculationId}/adjust/{taxYear}` | `200`/`204` |
| Property period x4, dated model only | `POST .../business/property/uk/{nino}/{propertyBusinessId}/period/{taxYear}`, `Gov-Test-Scenario: STATEFUL` | `200`/`201`, once per standard quarterly period - the cumulative model already filed the property business's running totals earlier |
| Property annual | `PUT .../business/property/uk/{nino}/{propertyBusinessId}/annual/{taxYear}` | `200` with an empty body - unlike the self-employment annual submission's `204` |
| Property BSAS trigger | `POST .../adjustable-summary/{nino}/trigger` (`typeOfBusiness: "uk-property"`) | `200` with `calculationId` |
| Property BSAS retrieve | `GET .../adjustable-summary/{nino}/uk-property/{calculationId}/{taxYear}`, `Gov-Test-Scenario: UK_PROPERTY_PROFIT` | `200`, HMRC's own canned example |
| Property BSAS adjust | `POST .../adjustable-summary/{nino}/uk-property/{calculationId}/adjust/{taxYear}` | `200`/`204` |
| Calculation trigger | `POST .../calculations/{nino}/self-assessment/{taxYear}/trigger/intent-to-finalise` | `202` with `calculationId` |
| Calculation retrieve | `GET .../calculations/{nino}/self-assessment/{taxYear}/{calculationId}`, `Gov-Test-Scenario: DYNAMIC` | `404` while HMRC is still calculating, then `200` with `metadata.calculationType` of `"final-declaration"` - HMRC's own canned value, see below |
| Calculation retrieve, income sources | read from the same response, no extra call | `inputs.incomeSources.businessIncomeSources` - checked for both business ids, not asserted on, since HMRC's canned `DYNAMIC` calculation is known to answer fixture-only ids |
| Loss claim put, self-employment | `PUT .../losses/{nino}/businesses/{businessId}/loss-claims/{taxYear}`, `Gov-Test-Scenario: STATEFUL`, `suspend-temporal-validations: true` | `200`/`204` |
| Loss claim get, self-employment | `GET .../losses/{nino}/businesses/{businessId}/loss-claims/{taxYear}`, `Gov-Test-Scenario: STATEFUL` | `200`, `claims.carryBack` present |
| Tax liability adjustments put | `PUT .../tax-liability/adjustments/{nino}/{taxYear}`, `Gov-Test-Scenario: STATEFUL`, `suspend-temporal-validations: true` | `200`/`204` |
| Tax liability adjustments get | `GET .../tax-liability/adjustments/{nino}/{taxYear}`, `Gov-Test-Scenario: STATEFUL` | `200` |
| Minimum supported tax year, both APIs | n/a | `2026-27` - HMRC's own hard-coded minimum for Individual Losses 7.0 and Individuals Tax Liability Adjustments 1.0, below `resolveItsaSubmissionModel`'s own boundary, so run A (2023-24) and run B (2025-26) cannot exercise these two endpoints; proven separately against `2026-27` |
| Loss claim put, UK property, cumulative model only | `PUT .../losses/{nino}/businesses/{propertyBusinessId}/loss-claims/{taxYear}`, `Gov-Test-Scenario: STATEFUL`, `suspend-temporal-validations: true` | `200`/`204` |
| Loss claim get, UK property | `GET .../losses/{nino}/businesses/{propertyBusinessId}/loss-claims/{taxYear}`, `Gov-Test-Scenario: STATEFUL` | `200`, `claims.carryForward` present |
| Property carry-back, refused locally | `buildLossesAndClaimsRequestBody`, no call | throws `LossesAndClaimsValidationError` code `CARRY_BACK_CLAIM` |
| Property carry-back, rejected by HMRC | `PUT .../losses/{nino}/businesses/{propertyBusinessId}/loss-claims/{taxYear}`, `Gov-Test-Scenario: CARRY_BACK_CLAIM` | `400` `RULE_CARRY_BACK_CLAIM` - the real sandbox's own code, which differs from `itsa-losses-and-claims.js`'s simulated `RULE_TYPE_OF_CLAIM_INVALID`, see below |
| Final declaration | `POST .../calculations/{nino}/self-assessment/{taxYear}/{calculationId}/final-declaration` | `204` |
| Validator | `GET .../test/fraud-prevention-headers/validate` | no errors; the only acceptable warning names `gov-client-multi-factor` |

The script throws on any other status, with HMRC's response body in the error, rather than
skip a step or fall back to a guess - except a `429 MESSAGE_THROTTLED_OUT`, which it retries
with backoff, since that is HMRC's sandbox rate limit and not a rejection of anything sent.

## Where the responses go

Every call's request and response lands in
`${ITSA_SANDBOX_OUT_DIR:-./target/itsa-sandbox-year}/itsa-sandbox-year-transcript.json`, in call
order, with the NINO masked and the bearer token redacted. A run that fails partway still writes
what it has so far.

Use the transcript to correct the phase 2 simulator scenarios the way `_developers/hmrc/
ITSA_SPIKE.md`'s transcript corrected the phase 1 ones: for each new endpoint's route file under
`app/http-simulator/routes/itsa-*.js` and scenario file under `app/http-simulator/scenarios/
itsa-*.js`, compare the canned response against what the transcript recorded for the same call,
and fix any field name, status code or error shape that differs. The checkpoint-create response
is the one shape this script does not know in advance - `extractCheckpointId` in the script
tries several likely field names and fails loudly with the raw body if none match, so the first
real run either confirms the guess or tells you which field name to add.

## Idempotency

The script is safe to run repeatedly. A checkpoint can only be taken of a NINO that already has
test-support data, so the first run ever wipes the test user's sandbox data with `DELETE
.../vendor-state`, creates both businesses and sets the ITSA status, and only then checkpoints
that as the baseline, saving `{checkpointId, businessId, propertyBusinessId}` to
`${ITSA_SANDBOX_OUT_DIR}/checkpoint-id.txt`. Every later run restores that checkpoint and reuses
the same two business ids rather than creating them again, which undoes whatever the previous
run filed against them since. Delete the checkpoint file to force a fresh wipe-and-checkpoint on
the next run.

## Assumptions taken from the plan's open questions

`PLAN_ITSA_PHASE_2.md`'s "Open questions" names five open points. Three affect what this script
does:

- **Q3, which approval stage to apply for.** The plan assumes in-year first. This script exists
  to test that stage's endpoints (Business Details, Obligations, Self-Employment Business,
  Individual Calculations) plus the end-of-year ones (BSAS, ITSA status, Individual Losses,
  Individuals Tax Liability Adjustments).
- **Q4, property income.** The plan assumes self-employment only. This script creates and sets
  up a UK property business alongside the self-employment one, files quarterly updates against
  it on both filing models, and carries it through its own annual submission and adjustable
  summary.
- **Q5, whether the sandbox test user carries the year.** The plan assumes the existing test
  user plus test-support data, rather than a second test user. This script follows that: it
  takes any sandbox test user with a NINO and creates the business and ITSA status itself,
  rather than expecting a pre-configured one.

Two more choices are this script's own test data, not the plan's:

- The ITSA status it sets is `"MTD Mandated"` with reason `"Sign up - return available"`
  (`buildItsaStatusRequestBody` in the script). Change the constants there for a different
  status.
- The quarterly income and expense figures are fixed fixtures (`buildQuarterlyTestFigures`),
  turnover and a single `consolidatedExpenses` total rising slightly each quarter. They exist to
  give HMRC valid numbers, not to model a particular trader.

## Run record

With the application subscribed to Self Assessment Test Support, Obligations, Self Employment
Business, Business Source Adjustable Summary and Individual Calculations, a run got past the
first call and uncovered two script defects, both fixed:

- The checkpoint-create call answered `400 FORMAT_NINO` with no `nino` query parameter, and
  `404 MATCHING_RESOURCE_NOT_FOUND` once the parameter was added, because a checkpoint can only
  be taken of a NINO that already has test-support data - HMRC's resolved OpenAPI for
  `mtd-sa-test-support-api/1.0` documents `nino` as a required query parameter on `POST
  .../vendor-state/checkpoints`, and its 404 example reads "No records were found for the passed
  NINO to create a checkpoint." The script now creates the business and sets its ITSA status
  first, then checkpoints that as the baseline; a restore run reuses the same `businessId`
  instead of creating a second business.
- The test-support "create a business" call answered `400 MISSING_POSTCODE`. HMRC's schema for
  that endpoint marks `businessAddressPostcode` mandatory for a self-employment business whose
  `businessAddressCountryCode` is `"GB"`. The script now sends one.

With both fixed, the run reached `GET .../individuals/person/itsa-status/{nino}/{taxYear}` and
stopped:

```
GET .../individuals/person/itsa-status/*******4A/2023-24 -> 403
{"code":"RESOURCE_FORBIDDEN","message":"The application is not subscribed to the API which it is attempting to invoke"}
```

That call (`app/functions/hmrc/hmrcItsaStatusGet.js`) is on the Self Assessment Individual
Details (MTD) API, v2.0 - a subscription not in the list above. With the Developer Hub account
holder subscribing the application, the run got past it and reached two more script defects,
both fixed:

- Both `GET .../individuals/business/details/{nino}/list` and
  `GET .../individuals/person/itsa-status/{nino}/{taxYear}` answered `200`, but with a static
  canned example (`businessId XBIS12345678901`, `"tradingName": "Company X"`, `taxYear 2019-20`,
  `status "No Status"`) rather than the business and status this script had just created and set
  through the test-support API. Sending `Gov-Test-Scenario: STATEFUL` on both calls fixes it:
  Business Details then answers the real `businessId` and `tradingName`, and ITSA status answers
  the real tax year and `"MTD Mandated"`. `STATEFUL` is documented for Business Details in
  `_developers/hmrc/ITSA_SPIKE.md` and for ITSA status in `PLAN_ITSA_PHASE_2.md`'s ITSA status
  section; neither the runbook's table nor the script had been sending it.
- `GET .../obligations/details/{nino}/income-and-expenditure` answered
  `404 NO_OBLIGATIONS_FOUND` for the real `businessId`, with or without a `Gov-Test-Scenario`
  header, and `400 RULE_INCORRECT_GOV_TEST_SCENARIO` for `STATEFUL` specifically. HMRC's
  resolved OpenAPI for this call
  (`hmrc/obligations-api`, `resources/public/api/conf/3.0/retrieve_income_tax_income_expenditure.yaml`)
  lists no `STATEFUL` scenario, only `N/A - DEFAULT`, `OPEN`, `FULFILLED`, `INSOLVENT_TRADER`,
  `NOT_FOUND`, `NO_OBLIGATIONS_FOUND`, `DYNAMIC` and `CUMULATIVE`; `DYNAMIC` answers only for
  three fixed example `businessId`s (`XBIS12345678901`, `XPIS12345678901`, `XFIS12345678901`),
  confirmed by calling it directly with one of them. Recreating the business with
  `firstAccountingPeriodStartDate`, `firstAccountingPeriodEndDate`, `commencementDate` and
  `accountingType` set made no difference. This endpoint's sandbox implementation does not read
  a business created through the test-support API at all - a gap in HMRC's own sandbox, not in
  this script. The run stops here:

```
GET .../obligations/details/*******5B/income-and-expenditure?typeOfBusiness=self-employment&businessId=XCIS67805247634&status=open -> 404
{"code":"NO_OBLIGATIONS_FOUND","message":"No obligations found using this filter"}
```

**Way on: file without reading obligations, over the canned businessId.** Two ways past the gap
above: file the quarterly periods, the accounting period and the crystallisation check without
reading obligations at all - the period-summary endpoints take dates, not an obligation, and the
Self Employment Business 5.0 spec publishes the four standard quarterly period dates for every
tax year - or run the obligations-dependent calls against the canned `XBIS12345678901` under
`DYNAMIC` and everything else against the created business. Took the first: it exercises the
business this script's own test-support calls created, throughout, where the second would have
switched to HMRC's fixture business partway through the run. `buildStandardQuarterlyPeriods` in
the script derives the four periods directly from `ITSA_SANDBOX_TAX_YEAR`; the obligations read
before filing and the crystallisation-obligations read before the calculation trigger are both
dropped, since both are the same obligations-api gap. The four quarterly periods are then filed
with `Gov-Test-Scenario: STATEFUL`, since the endpoint's own default does not persist a create
for a later stateful read.

With that change the run reached the BSAS trigger and found one more script defect, fixed:

- `POST .../adjustable-summary/{nino}/trigger` answered
  `400 RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED` on `/typeOfBusiness` - the script's call to
  `buildBsasTriggerRequestBody` never set `typeOfBusiness`. Fixed by passing
  `typeOfBusiness: "self-employment"`.

The run then reached the BSAS adjust call and found a second, in this script's own body choice
rather than a defect in the imported builder:

- `POST .../adjustable-summary/{nino}/self-employment/{calculationId}/adjust/{taxYear}`
  answered `400 RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED` for `{"zeroAdjustments": true}`. HMRC's
  resolved OpenAPI for this call carries two request schemas, chosen by tax year: `zeroAdjustments`
  exists only on the "For TY 2024-25 and after" schema. `ITSA_SANDBOX_TAX_YEAR` must be 2024-25
  or earlier, so the "For TY 2023-24 and before" schema applies, which has no `zeroAdjustments`
  field at all - only `income`, `expenses` and `additions`. The script now sends a real
  adjustment, `{ income: { other: 1 } }`, for this tax year.

The run then reached the calculation retrieve and found a further sandbox gap, not a script
defect:

- `GET .../calculations/{nino}/self-assessment/{taxYear}/{calculationId}` answered `200` with
  `metadata.calculationType` of `"final-declaration"`, for a calculation this run had itself
  triggered as `intent-to-finalise` moments earlier - with no `Gov-Test-Scenario` header, the
  response was a fully static canned example (a different `calculationId`, `taxYear 2024-25`,
  HMRC's own example dates). Adding `Gov-Test-Scenario: DYNAMIC` made the response track this
  run's own `calculationId`, tax year and period dates, but `metadata.calculationType` still
  answered `"final-declaration"`. Individual Calculations 8.0's Gov-Test-Scenario table for this
  call has no scenario that reflects a trigger's own `calculationType` back - only named canned
  examples and `DYNAMIC`, which only affects dates. The script now warns and continues to the
  final declaration call rather than treating this as a stop, since it is HMRC's sandbox that
  cannot answer the question, not a defect this script can fix.

Throughout this run and every one before it, calls landed on HMRC's sandbox rate limit at
unpredictable points - `bsas-trigger`, `bsas-adjust`, `calculation-trigger` on different runs,
each `429 MESSAGE_THROTTLED_OUT`, and waiting minutes between whole-script runs did not avoid
it. `callHmrc` now retries a 429 with a fixed 20-second backoff (or HMRC's own `Retry-After`
when it sends one) before treating it as a failure.

With all of the above, the run completed:

```
POST .../calculations/*******2D/self-assessment/2023-24/03d6a9b4-f27a-1307-ae18-bf2510a8b034/final-declaration -> 204
GET .../test/fraud-prevention-headers/validate -> 200 {"code":"POTENTIALLY_INVALID_HEADERS","warnings":[{"headers":["gov-client-multi-factor"]}]}
```

Final declaration `204`: true. Fraud header validator clean: true. The BSAS retrieve
(`Gov-Test-Scenario: SELF_EMPLOYMENT_PROFIT`) and the calculation retrieve
(`Gov-Test-Scenario: DYNAMIC`) both still answer HMRC's own canned figures and calculation
type rather than this run's own submitted numbers - documented gaps, not blockers, since
neither call's body is this script's to assert on.

### The property leg (run A, 2023-24, dated model)

The property annual submission answered `200` with an empty body on the first attempt - the
script only accepted `204`, matching the self-employment annual submission, and stopped:

```
PUT .../business/property/uk/*******1D/X5IS60924830827/annual/2023-24 -> 200 {}
```

With the script accepting `[200, 204]` there, a full run filed all four property period
updates, the property annual submission and the property BSAS trigger/retrieve/adjust, every
one `ok: true`, then declared. `inputs.incomeSources.businessIncomeSources` on the calculation
retrieve came back `[null]` - the same `DYNAMIC` canned-response gap that already affects
`metadata.calculationType`, not a defect in the businesses this run created. Final declaration
`204`: true.

### The loss claim and tax liability adjustment sequence

Individual Losses 7.0 and Individuals Tax Liability Adjustments 1.0 both hard-code a minimum
supported tax year - `TaxYear.ending(2027)` in `individual-losses-api`'s
`v7/lossesAndClaims/package.scala`, `TaxYear.fromMtd("2026-27")` in
`individuals-tax-liability-adjustments-api`'s `CreateAmendTaxLiabilityAdjustmentsSchema.scala`
(both confirmed from HMRC's own public source). Neither run A (2023-24) nor run B (2025-26)
meets it:

```
PUT .../individuals/losses/*******1D/businesses/X8IS18555003583/loss-claims/2023-24 -> 400
{"code":"RULE_TAX_YEAR_NOT_SUPPORTED","message":"The tax year specified does not lie within the supported range"}
```

Proven instead against `2026-27` - today's live tax year, which resolves to the cumulative
quarterly model. The first attempt there answered `RULE_TAX_YEAR_NOT_ENDED` even with
`suspendTemporalValidations: "true"` sent: HMRC's own header spec for both APIs names the
header `suspend-temporal-validations` (kebab-case), and both handlers in this repository were
sending the camelCase field name as the header key, which the sandbox does not recognise as the
one it documents. Fixed in `hmrcItsaLossesAndClaimsPut.js` and
`hmrcItsaTaxLiabilityAdjustmentsPut.js` (production code, not just this script), with their own
unit tests corrected alongside.

With the header fixed, the write succeeded but its read-back answered
`404 MATCHING_RESOURCE_NOT_FOUND`: both create-or-amend endpoints' own scenario tables need
`Gov-Test-Scenario: STATEFUL` to persist, the same requirement the period and property period
writes already carry. With `STATEFUL` added to both PUTs, a full run against `2026-27` filed the
loss claim, read back `claims.carryBack` and `claims.carryForward`, filed the tax liability
adjustment, read back `carryBackLossesDecrease`, then declared. Final declaration `204`: true.

### The property leg under the cumulative model, and the property loss claim (run B, 2025-26 and 2026-27)

A run against `2025-26` reached the same `RULE_TAX_YEAR_NOT_SUPPORTED` as run A once it hit
`self-employment-loss-claim-put`, confirming the minimum-tax-year finding applies regardless of
quarterly filing model - but not before proving the property annual submission and the property
BSAS trigger/retrieve/adjust all `ok: true` under the cumulative model too, alongside the
property business's own cumulative period updates already covered.

The property loss claim and its carry-back refusal, gated on the cumulative model, needed the
same `2026-27` run as the self-employment loss sequence to clear the minimum-tax-year gate. With
that run: the property carry-forward claim filed (`204`) and read back
(`claims.carryForward: {currentYearLosses: 300}`); `buildLossesAndClaimsRequestBody` refused a
property carry-back claim locally with `CARRY_BACK_CLAIM`, as designed; and the same raw body
sent to HMRC under `Gov-Test-Scenario: CARRY_BACK_CLAIM` came back `400` with
`RULE_CARRY_BACK_CLAIM` - not `RULE_TYPE_OF_CLAIM_INVALID`, the code
`app/http-simulator/scenarios/itsa-losses-and-claims.js`'s `CARRY_BACK_CLAIM` scenario currently
answers. That simulator scenario is a finding for a future pass, not corrected here. Final
declaration `204`: true.
