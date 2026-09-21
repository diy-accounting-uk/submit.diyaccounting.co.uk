<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# ITSA Production Approvals Checklist

Answers for HMRC's minimum functionality standards for Making Tax Digital for Income Tax, taken
from the code on `main`. One application covers both approval stages (in-year and end of year), so
every standard is answered here in one pass. Each row names the handler, page or test that proves
it. A row that says "not evidenced" names the file that would evidence it; nothing below claims a
proof that does not exist.

The standards come from HMRC's "How to integrate with HMRC APIs" guide for Income Tax (MTD),
summarised in `ITSA_MINIMUM_FUNCTIONALITY_STANDARDS.md`. The sandbox proof is
`ITSA_PHASE_2_SANDBOX.md`: `scripts/itsa-sandbox-year.js` files a whole self-employment tax year
against the HMRC sandbox and ends with a `204` from the final declaration and a clean fraud
prevention header validator (the run record at the end of that file; commit `17698550`,
2026-09-14).

## The application

| Field | Value |
|---|---|
| Product | DIY Accounting Submit, https://submit.diyaccounting.co.uk |
| Sandbox application id | `uqMHA6RsDGGa7h8EG2VqfqAmv4tV` |
| Connection method | `WEB_APP_VIA_SERVER` |
| Income types covered | Self-employment and UK property |
| Quarterly models | Dated period summaries up to 2024-25; cumulative period summaries from 2025-26 |
| Entry page | `web/public/hmrc/itsa/dashboard.html` (the business picker and the ten steps of the year) |

## The standards

| # | Standard | Build | Proof in the repository | Sandbox proof |
|---|---|---|---|---|
| 1 | Fraud prevention header data on every call | `app/lib/buildFraudHeaders.js`, imported by all 30 `app/functions/hmrc/hmrcItsa*.js` handlers | `app/unit-tests/` fraud header tests; the monthly HMRC report parser `app/lib/fraudPreventionHeaderReport.js` | The sandbox year ends with `GET .../test/fraud-prevention-headers/validate` answering no errors; its one warning is `gov-client-multi-factor`, which NEXT.md O28 closes by mandating MFA in the user pool |
| 2 | Obtain a business id for each of the customer's businesses | `hmrcItsaBusinessDetailsGet.js`; `businessDetails.html`; the business picker on `dashboard.html` | `behaviour-tests/itsaBusinessDetails.behaviour.test.js`; `web/browser-tests/businessDetails.browser.test.js` | `GET .../individuals/business/details/{nino}/list` with `Gov-Test-Scenario: STATEFUL` answers the business the run created |
| 3 | Create and maintain digital records, or link digitally to software that does | Bridging. The annual submission form imports a book's derived figures (`annualSubmission.html`, the "Import from a book" control); the MCP tools `derive_itsa_quarterly_update` and `derive_itsa_annual_submission` in `mcp/lib/itsa-tools.js` derive the figures from a DIYA-GL book | `web/browser-tests/annualSubmission.import.browser.test.js`; `mcp/test/itsa-tools.test.js` | Not a sandbox matter |
| 4 | Submit quarterly updates for each mandated income source | Self-employment: `hmrcItsaSelfEmploymentPeriodPost.js`, `Put.js`, `Get.js`, `sGet.js`; `selfEmploymentPeriod.html`, `selfEmploymentPeriodAmend.html`, `selfEmploymentPeriods.html`, `selfEmploymentPeriodView.html`. UK property: `hmrcItsaUkPropertyPeriodPost.js`, `Put.js`, `Get.js`, `sGet.js`; `ukPropertyPeriod.html` and its three siblings. Both handle the dated and the cumulative model by tax year (simulator routes `itsa-self-employment-cumulative.js`, `itsa-uk-property-cumulative.js`) | `behaviour-tests/itsaSelfEmploymentPeriod.behaviour.test.js`, `itsaUkPropertyPeriod.behaviour.test.js`; `web/browser-tests/selfEmploymentPeriod.browser.test.js`, `itsaCumulativeModel.browser.test.js` | Self-employment: four dated quarters filed for 2023-24 with `Gov-Test-Scenario: STATEFUL`. UK property: four dated quarters for 2023-24, four cumulative updates for both 2025-26 and 2026-27. Cumulative model: four cumulative updates for both 2025-26 and 2026-27, both businesses |
| 5 | Show an estimate of the income tax liability, with HMRC's disclaimer shown first | `hmrcItsaCalculationTriggerPost.js`, `hmrcItsaCalculationGet.js`; `taxCalculation.html` labels an in-year result as an estimate (lines 72 to 77) and shows the disclaimer above the figures (`#calculationDisclaimer`, line 107) | `web/browser-tests/taxCalculation.browser.test.js` | Trigger `202`, retrieve `200` with `Gov-Test-Scenario: DYNAMIC` |
| 6 | Make the required adjustments and finalise business income for the year | Business source adjustable summary: `hmrcItsaBsasTriggerPost.js`, `hmrcItsaBsasSelfEmploymentGet.js`, `...AdjustPost.js`, `hmrcItsaBsasUkPropertyGet.js`, `...AdjustPost.js`; `adjustments.html`, `ukPropertyAdjustments.html`. Tax liability adjustments: `hmrcItsaTaxLiabilityAdjustmentsPut.js`, `Get.js`, `Delete.js`; `taxLiabilityAdjustments.html`. Annual submissions: `hmrcItsaSelfEmploymentAnnualPut.js`, `Get.js`, `hmrcItsaUkPropertyAnnualPut.js`, `Get.js`; `annualSubmission.html`, `ukPropertyAnnualSubmission.html` | `behaviour-tests/itsaAnnualSubmission.behaviour.test.js`, `itsaUkPropertyAnnualSubmission.behaviour.test.js`; `web/browser-tests/annualSubmission.browser.test.js` | Self-employment annual `204`; BSAS trigger `200`, retrieve `200`, adjust `200` for both businesses on 2023-24. Tax liability adjustments: `200`/`204` on 2026-27. UK property annual: `200` on 2023-24, `204` on 2025-26 and 2026-27 |
| 7 | Carry losses forward, back or sideways | `hmrcItsaLossesAndClaimsPut.js`, `Get.js`, `Delete.js`; `lossesAndClaims.html`; `finalDeclaration.html` warns before declaring when a business shows a loss with no claim (line 128) | `behaviour-tests/itsaLossesAndClaims.behaviour.test.js`; `web/browser-tests/itsaLossesAndClaims.browser.test.js` | Self-employment loss claim `200`/`204` on 2026-27, read back `claims.carryBack` and `claims.carryForward`. UK property loss claim `204` on 2026-27, read back `claims.carryForward`, carry-back claim refused with `400 RULE_CARRY_BACK_CLAIM`. Every loss write carried `suspend-temporal-validations: true` |
| 8 | Submit non-mandated income sources, or divert the customer to software that can | UK property is built (rows 4 and 6). Foreign property and other income are outside the build; `businessDetails.html` carries a "foreign property business only" sandbox scenario (line 86) | None | Not evidenced. `web/public/hmrc/itsa/dashboard.html` would evidence the diversion with a note telling a customer with foreign property or other income where to finish their return |
| 9 | Submit the final declaration, or divert the customer to software that can | `hmrcItsaCrystallisationObligationsGet.js`, `hmrcItsaFinalDeclarationPost.js`; `finalDeclaration.html` shows the declaration ("I confirm this information is correct and complete to the best of my knowledge...", line 138) before the button | `behaviour-tests/itsaFinalDeclaration.behaviour.test.js`; `web/browser-tests/finalDeclaration.browser.test.js` | `POST .../final-declaration` answers `204` |
| 10 | Read the customer's ITSA status | `hmrcItsaStatusGet.js` (route `/api/v1/hmrc/itsa/status`) | `app/http-simulator/routes/itsa-status.js` and its scenarios | `GET .../individuals/person/itsa-status/{nino}/{taxYear}` with `STATEFUL` answers the status the run set |
| 11 | Read the customer's obligations | `hmrcItsaObligationsGet.js`; `obligations.html` | `behaviour-tests/itsaObligations.behaviour.test.js`; `web/browser-tests/obligations.browser.test.js` | Not evidenced against a created business: HMRC's sandbox obligations endpoint answers `NO_OBLIGATIONS_FOUND` for a business made through the test-support API and `DYNAMIC` only for three fixture ids (`ITSA_PHASE_2_SANDBOX.md`). The sandbox year files without reading obligations |
| 12 | The customer sees what a submission costs before sending | `web/public/widgets/submission-cost.js` on every page that writes (`selfEmploymentPeriod.html` line 159 and its siblings) | `web/browser-tests/submissionCost.browser.test.js`, `usageItsaYearCost.browser.test.js` | Not a sandbox matter |
| 13 | WCAG 2.1 AA on every page in the journey | The 19 pages under `web/public/hmrc/itsa/` use the shared header, footer and form styles the VAT pages passed with | Not evidenced for the ITSA pages: `scripts/axe-quickscan.mjs`'s page list carries the VAT pages and none of the ITSA pages, and `REPORT_ACCESSIBILITY_PENETRATION.md` names no ITSA page. Adding the 19 pages to that list and re-running the scan is what would evidence it | Not a sandbox matter |

## The nine APIs

| API | Handlers | Proof |
|---|---|---|
| Business Details | `hmrcItsaBusinessDetailsGet.js` | Sandbox: STATEFUL read of the created business |
| Obligations | `hmrcItsaObligationsGet.js`, `hmrcItsaCrystallisationObligationsGet.js` | Simulator; sandbox read not evidenced (row 11) |
| Self Employment Business | `hmrcItsaSelfEmploymentPeriod*.js` (4), `hmrcItsaSelfEmploymentAnnual*.js` (2) | Sandbox: four quarters and the annual submission for 2023-24 |
| Property Business | `hmrcItsaUkPropertyPeriod*.js` (4), `hmrcItsaUkPropertyAnnual*.js` (2) | Sandbox: four dated quarters for 2023-24; four cumulative updates for 2025-26 and 2026-27; annual submission for all three years |
| Business Source Adjustable Summary | `hmrcItsaBsasTriggerPost.js`, `hmrcItsaBsasSelfEmployment*.js` (2), `hmrcItsaBsasUkProperty*.js` (2) | Sandbox: trigger, retrieve and adjust for self-employment |
| Self Assessment Individual Details | `hmrcItsaStatusGet.js` | Sandbox: STATEFUL read of the status the run set |
| Individual Calculations | `hmrcItsaCalculationTriggerPost.js`, `hmrcItsaCalculationGet.js`, `hmrcItsaFinalDeclarationPost.js` | Sandbox: trigger, retrieve and the final declaration `204` |
| Individual Losses | `hmrcItsaLossesAndClaims*.js` (3) | Sandbox: self-employment and UK property loss claims on 2026-27, read-backs, carry-back rejection; `suspend-temporal-validations` on all writes |
| Individuals Tax Liability Adjustments | `hmrcItsaTaxLiabilityAdjustments*.js` (3) | Sandbox: tax liability adjustments on 2026-27, read-back of `carryBackLossesDecrease`, `suspend-temporal-validations` on write |

## What a reviewer will ask that this file cannot answer yet

- An accessibility scan over the ITSA pages (row 13).
- The diversion note for income the build does not cover (row 8).
- Whether HMRC accepts a new production application for the 2027-28 quarterly update window.
  `ITSA_MINIMUM_FUNCTIONALITY_STANDARDS.md` records the 2026-27 closure notice; the recognition
  email asks the question.
