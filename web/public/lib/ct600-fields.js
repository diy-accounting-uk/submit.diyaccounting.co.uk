// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/ct600-fields.js
// The CT600 entry form as data: one row per box the figures model can emit (label, whether the
// customer types it or the page works it out, the rule, the Company Tax Return guide anchor),
// the typed fields that feed those boxes, the accounts section's fields, and the pure functions
// that read the form's values into the figures model and check what the model does not.
// The form, the review and the help read this one table, so a box has one label everywhere.

import { accountingPeriodDates } from "./long-period.js";

// page-chrome.js gives the text in the chosen language; without it (under Node, or a test that stubs
// the chrome) the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

export const COMPANY_TAX_RETURN_GUIDE_URL = "https://www.gov.uk/guidance/the-company-tax-return-guide";
export const COMPUTATIONS_GUIDE_ANCHOR = "and-90-accounts-and-computations";

// HMRC's own box names from the CT600 (2026) Version 3 form and the Company Tax Return guide.
export const CT600_BOX_ROWS = [
  {
    box: 1,
    label: siteText("ch.ct600.box-1", "Company name"),
    kind: "worked",
    section: "company",
    rule: siteText("ch.ct600.box-1-rule", "The company lookup gives the name"),
    anchor: "company-name",
  },
  {
    box: 2,
    label: siteText("ch.ct600.box-2", "Company registration number"),
    kind: "worked",
    section: "company",
    rule: siteText("ch.ct600.box-2-rule", "The company lookup gives the number"),
    anchor: "company-registration-number",
  },
  {
    box: 3,
    label: siteText("ch.ct600.box-3", "Tax reference (Unique Taxpayer Reference)"),
    kind: "typed",
    section: "company",
    field: "utr",
    anchor: "tax-reference",
  },
  {
    box: 4,
    label: siteText("ch.ct600.box-4", "Type of company"),
    kind: "typed",
    section: "company",
    field: "companyType",
    anchor: "type-of-company",
  },
  {
    box: 30,
    label: siteText("ch.ct600.box-30", "Start of the period covered by the return"),
    kind: "typed",
    section: "period",
    field: "periodStart",
    anchor: "and-35-period-of-the-return",
  },
  {
    box: 35,
    label: siteText("ch.ct600.box-35", "End of the period covered by the return"),
    kind: "typed",
    section: "period",
    field: "periodEnd",
    anchor: "and-35-period-of-the-return",
  },
  {
    box: 50,
    label: siteText("ch.ct600.box-50", "Making more than one return for this company now"),
    kind: "worked",
    section: "period",
    rule: siteText("ch.ct600.box-50-rule", "Box 50 is ticked on each return of a period of account longer than 12 months"),
    anchor: "making-more-than-one-return-now",
  },
  {
    box: "85A",
    label: siteText("ch.ct600.box-85-a", "Accounts attached are for a different period"),
    kind: "worked",
    section: "accounts",
    rule: siteText(
      "ch.ct600.box-85-a-rule",
      "Box 85A is ticked on each return of a period of account longer than 12 months, because the attached accounts cover the whole period of account",
    ),
    anchor: COMPUTATIONS_GUIDE_ANCHOR,
  },
  {
    box: 95,
    label: siteText("ch.ct600.box-95", "Supplementary page CT600A, loans to participators"),
    kind: "worked",
    section: "tax",
    rule: siteText(
      "ch.ct600.box-95-rule",
      "Box 95 is ticked when the company lent to participators and the return carries supplementary page CT600A",
    ),
    anchor: "supplementary-pages",
  },
  {
    box: 145,
    label: siteText("ch.ct600.box-145", "Total turnover from trade"),
    kind: "worked",
    section: "accounts",
    rule: siteText("ch.ct600.box-145-rule", "Box 145 is the turnover in the profit and loss account"),
    anchor: "turnover",
  },
  {
    box: 155,
    label: siteText("ch.ct600.box-155", "Trading profits"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-155-rule", "Box 155 equals the computation's adjusted profit"),
    anchor: "trading-profits",
  },
  {
    box: 160,
    label: siteText("ch.ct600.box-160", "Trading losses brought forward set against trading profits"),
    kind: "typed",
    section: "reliefs",
    field: "lossesBroughtForward",
    anchor: "trading-losses-brought-forward-set-against-trading-profits",
  },
  {
    box: 275,
    label: siteText("ch.ct600.box-275", "Trading losses of this or a later accounting period"),
    kind: "typed",
    section: "reliefs",
    field: "lossAgainstTotalProfits",
    anchor: "trading-losses-of-this-or-a-later-accounting-period",
  },
  {
    box: 280,
    label: siteText("ch.ct600.box-280", "Amounts carried back from later accounting periods are included in box 275"),
    kind: "worked",
    section: "reliefs",
    rule: siteText("ch.ct600.box-280-rule", "Box 280 is ticked when the next accounting period's loss is carried back into box 275"),
    anchor: "amounts-carried-back-from-later-accounting-periods",
  },
  {
    box: 285,
    label: siteText("ch.ct600.box-285", "Trading losses carried forward and claimed against total profits"),
    kind: "typed",
    section: "reliefs",
    field: "lossesBroughtForwardAgainstTotalProfits",
    anchor: "trading-losses-carried-forward-and-claimed-against-total-profits",
  },
  {
    box: 295,
    label: siteText("ch.ct600.box-295", "Total of deductions and reliefs"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-295-rule", "Box 295 is boxes 275 and 285"),
    anchor: "total-of-deductions-and-reliefs",
  },
  {
    box: 305,
    label: siteText("ch.ct600.box-305", "Qualifying donations"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-305-rule", "The donations added back are claimed here, up to the profits in box 300"),
    anchor: "qualifying-donations",
  },
  {
    box: 780,
    label: siteText("ch.ct600.box-780", "Losses of trades carried on wholly or partly in the UK: amount arising"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-780-rule", "Box 780 is the computation's adjusted loss"),
    anchor: "and-790-losses-of-trades",
  },
  {
    box: 790,
    label: siteText("ch.ct600.box-790", "Losses of trades carried on wholly outside the UK: amount arising"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-790-rule", "Box 790 is the computation's adjusted loss"),
    anchor: "and-790-losses-of-trades",
  },
  {
    box: 165,
    label: siteText("ch.ct600.box-165", "Net trading profits"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-165-rule", "Box 165 is box 155 less box 160"),
    anchor: "net-trading-profits",
  },
  {
    box: 170,
    label: siteText("ch.ct600.box-170", "Bank, building society or other interest, and profits from non-trading loan relationships"),
    kind: "typed",
    section: "computation",
    field: "nonTradingLoanRelationshipCredits",
    anchor: "and-172-bank-building-society-or-other-interest-and-profits-from-non-trading-loan-relationships",
  },
  {
    box: 235,
    label: siteText("ch.ct600.box-235", "Profits before other deductions and reliefs"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-235-rule", "Box 235 is box 165 plus box 170"),
    anchor: "profits-before-other-deductions-and-reliefs-1",
  },
  {
    box: 300,
    label: siteText("ch.ct600.box-300", "Profits before qualifying donations and group relief"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-300-rule", "Box 300 is box 235 less box 295"),
    anchor: "profits-before-qualifying-donations-and-group-relief",
  },
  {
    box: 315,
    label: siteText("ch.ct600.box-315", "Profits chargeable to Corporation Tax"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-315-rule", "Box 315 is box 300 less box 305"),
    anchor: "profits-chargeable-to-corporation-tax",
  },
  {
    box: 326,
    label: siteText("ch.ct600.box-326", "Number of associated companies in this period"),
    kind: "typed",
    section: "company",
    field: "associatedCompanies",
    anchor: "number-of-associated-companies-in-this-period",
  },
  {
    box: 327,
    label: siteText("ch.ct600.box-327", "Number of associated companies in the first financial year"),
    kind: "typed",
    section: "company",
    field: "associatedCompanies",
    anchor: "and-328-number-of-associated-companies-in-the-first-and-second-financial-years",
  },
  {
    box: 328,
    label: siteText("ch.ct600.box-328", "Number of associated companies in the second financial year"),
    kind: "typed",
    section: "company",
    field: "associatedCompanies",
    anchor: "and-328-number-of-associated-companies-in-the-first-and-second-financial-years",
  },
  {
    box: 329,
    label: siteText("ch.ct600.box-329", "Small profit rate or marginal relief entitlement"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-329-rule", "Box 329 is X when a share meets the small profits rate or marginal relief"),
    anchor: "small-profit-rate-or-marginal-relief-entitlement",
  },
  {
    box: 330,
    label: siteText("ch.ct600.box-330", "Financial year of the first tax rate"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-330-rule", "Rule 9198: the profit is split between financial years by days"),
    anchor: "boxes-330-to-425",
  },
  {
    box: 335,
    label: siteText("ch.ct600.box-335", "Amount of profit chargeable at the first rate"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-335-rule", "Rule 9198: the profit is split between financial years by days"),
    anchor: "boxes-330-to-425",
  },
  {
    box: 340,
    label: siteText("ch.ct600.box-340", "First rate of tax"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-340-rule", "Rule 9204: each share is charged at its year's rate"),
    anchor: "boxes-330-to-425",
  },
  {
    box: 345,
    label: siteText("ch.ct600.box-345", "Tax at the first rate"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-345-rule", "Rules 9204 and 9213: each share is charged at its year's rate, to the penny"),
    anchor: "boxes-330-to-425",
  },
  {
    box: 380,
    label: siteText("ch.ct600.box-380", "Financial year of the second tax rate"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-380-rule", "Rule 9198: the profit is split between financial years by days"),
    anchor: "boxes-330-to-425",
  },
  {
    box: 385,
    label: siteText("ch.ct600.box-385", "Amount of profit chargeable at the second rate"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-385-rule", "Rule 9198: the profit is split between financial years by days"),
    anchor: "boxes-330-to-425",
  },
  {
    box: 390,
    label: siteText("ch.ct600.box-390", "Second rate of tax"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-390-rule", "Rule 9204: each share is charged at its year's rate"),
    anchor: "boxes-330-to-425",
  },
  {
    box: 395,
    label: siteText("ch.ct600.box-395", "Tax at the second rate"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-395-rule", "Rules 9204 and 9213: each share is charged at its year's rate, to the penny"),
    anchor: "boxes-330-to-425",
  },
  {
    box: 430,
    label: siteText("ch.ct600.box-430", "Corporation Tax"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-430-rule", "Box 430 is box 345 plus box 395"),
    anchor: "corporation-tax",
  },
  {
    box: 435,
    label: siteText("ch.ct600.box-435", "Marginal relief"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-435-rule", "Box 435 is marginal relief on box 315, after associated companies and box 620"),
    anchor: "marginal-relief",
  },
  {
    box: 440,
    label: siteText("ch.ct600.box-440", "Corporation Tax chargeable"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-440-rule", "Box 440 is box 430 less box 435"),
    anchor: "corporation-tax-chargeable",
  },
  {
    box: 475,
    label: siteText("ch.ct600.box-475", "Net Corporation Tax liability"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-475-rule", "Box 475 is box 430 less box 435"),
    anchor: "net-corporation-tax-liability",
  },
  {
    box: 480,
    label: siteText("ch.ct600.box-480", "Tax payable on loans to participators"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-480-rule", "Box 480 is the tax in box A80 of supplementary page CT600A"),
    anchor: "loans-and-arrangements-to-confer-benefits-on-participators",
  },
  {
    box: 485,
    label: siteText("ch.ct600.box-485", "Relief due on loans repaid after the CT600A period"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-485-rule", "Box 485 is ticked when box A70 of supplementary page CT600A is completed"),
    anchor: "loans-and-arrangements-to-confer-benefits-on-participators",
  },
  {
    box: 510,
    label: siteText("ch.ct600.box-510", "Tax chargeable"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-510-rule", "Box 510 is box 475 plus box 480"),
    anchor: "tax-chargeable",
  },
  {
    box: 515,
    label: siteText("ch.ct600.box-515", "Income Tax deducted from gross income included in profits"),
    kind: "typed",
    section: "reliefs",
    field: "incomeTaxDeducted",
    anchor: "income-tax-deducted-from-gross-income-included-in-profits",
  },
  {
    box: 525,
    label: siteText(
      "ch.ct600.box-525",
      "Self-assessment of tax payable before restitution tax and coronavirus support scheme overpayments",
    ),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-525-rule", "Box 525 is box 440 less box 515"),
    anchor: "self-assessment-of-tax-payable-before-restitution-tax-and-coronavirus-support-scheme-overpayments",
  },
  {
    box: 528,
    label: siteText("ch.ct600.box-528", "Self-assessment of tax payable"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-528-rule", "Box 528 is box 440 less box 515"),
    anchor: "self-assessment-of-tax-payable",
  },
  {
    box: 595,
    label: siteText("ch.ct600.box-595", "Tax already paid (and not already repaid)"),
    kind: "typed",
    section: "payments",
    field: "taxAlreadyPaid",
    anchor: "tax-already-paid-and-not-already-repaid",
  },
  {
    box: 600,
    label: siteText("ch.ct600.box-600", "Tax outstanding"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-600-rule", "Box 600 is box 525 less box 595"),
    anchor: "tax-outstanding",
  },
  {
    box: 620,
    label: siteText("ch.ct600.box-620", "Franked investment income or exempt ABGH distributions"),
    kind: "typed",
    section: "reliefs",
    field: "frankedInvestmentIncome",
    anchor: "franked-investment-income-or-exempt-abgh-distributions",
  },
  {
    box: 690,
    label: siteText("ch.ct600.box-690", "Annual investment allowance"),
    kind: "typed",
    section: "allowances",
    field: "annualInvestmentAllowance",
    anchor: "annual-investment-allowance",
  },
  {
    box: 705,
    label: siteText("ch.ct600.box-705", "Machinery and plant, main pool: allowances"),
    kind: "typed",
    section: "allowances",
    field: "mainPoolAllowances",
    rule: siteText("ch.ct600.box-705-rule", "Box 705 includes the annual investment allowance in box 690"),
    anchor: "and-710-machinery-and-plant--main-pool",
  },
  {
    box: 710,
    label: siteText("ch.ct600.box-710", "Machinery and plant, main pool: balancing charges"),
    kind: "typed",
    section: "allowances",
    field: "mainPoolBalancingCharges",
    anchor: "and-710-machinery-and-plant--main-pool",
  },
  {
    box: 688,
    label: siteText("ch.ct600.box-688", "Full expensing: allowances"),
    kind: "typed",
    section: "allowances",
    field: "fullExpensingAllowances",
    anchor: "and-689-full-expensing",
  },
  {
    box: 689,
    label: siteText("ch.ct600.box-689", "Full expensing: balancing charges"),
    kind: "typed",
    section: "allowances",
    field: "fullExpensingBalancingCharges",
    anchor: "and-689-full-expensing",
  },
  {
    box: 693,
    label: siteText("ch.ct600.box-693", "Machinery and plant, special rate allowance: allowances"),
    kind: "typed",
    section: "allowances",
    field: "specialRateAllowances",
    anchor: "and-694-machinery-and-plant--special-rate-allowance",
  },
  {
    box: 694,
    label: siteText("ch.ct600.box-694", "Machinery and plant, special rate allowance: balancing charges"),
    kind: "typed",
    section: "allowances",
    field: "specialRateBalancingCharges",
    anchor: "and-694-machinery-and-plant--special-rate-allowance",
  },
  {
    box: 695,
    label: siteText("ch.ct600.box-695", "Machinery and plant, special rate pool: allowances"),
    kind: "typed",
    section: "allowances",
    field: "specialRatePoolAllowances",
    rule: siteText("ch.ct600.box-695-rule", "Box 695 includes the annual investment allowance claimed on the special rate pool"),
    anchor: "and-700-machinery-and-plant--special-rate-pool",
  },
  {
    box: 700,
    label: siteText("ch.ct600.box-700", "Machinery and plant, special rate pool: balancing charges"),
    kind: "typed",
    section: "allowances",
    field: "specialRatePoolBalancingCharges",
    anchor: "and-700-machinery-and-plant--special-rate-pool",
  },
  {
    box: 735,
    label: siteText("ch.ct600.box-735", "Annual investment allowance outside the calculation of trading profits"),
    kind: "typed",
    section: "allowances",
    field: "annualInvestmentAllowanceOutsideTrade",
    anchor: "annual-investment-allowance-not-included-in-trading-profits",
  },
  {
    box: 760,
    label: siteText("ch.ct600.box-760", "Machinery and plant on which first year allowance is claimed"),
    kind: "typed",
    section: "allowances",
    field: "firstYearAllowanceExpenditure",
    anchor: "machinery-and-plant-on-which-first-year-allowance-is-claimed",
  },
  {
    box: 773,
    label: siteText("ch.ct600.box-773", "Machinery and plant, special rate allowance: qualifying expenditure"),
    kind: "typed",
    section: "allowances",
    field: "specialRateAllowanceExpenditure",
    anchor: "machinery-and-plant-special-rate-allowance",
  },
  {
    box: 775,
    label: siteText("ch.ct600.box-775", "Other machinery and plant: qualifying expenditure"),
    kind: "typed",
    section: "allowances",
    field: "otherMachineryAndPlantExpenditure",
    anchor: "other-machinery-and-plant",
  },
  {
    box: 975,
    label: siteText("ch.ct600.box-975", "Name of the person signing the declaration"),
    kind: "typed",
    section: "declaration",
    field: "declarantName",
    anchor: "declaration",
  },
  {
    box: 985,
    label: siteText("ch.ct600.box-985", "Status of the person signing the declaration"),
    kind: "typed",
    section: "declaration",
    field: "declarantStatus",
    anchor: "declaration",
  },
];

export function boxRow(box) {
  return CT600_BOX_ROWS.find((row) => String(row.box) === String(box));
}

export function guideUrl(anchor) {
  return `${COMPANY_TAX_RETURN_GUIDE_URL}#${anchor}`;
}

// Boxes the review shows as typed or coded text; every other box is an amount in pounds.
export const TEXT_BOXES = new Set([1, 2, 3, 4, 30, 35, 50, "85A", 95, 280, 326, 327, 328, 329, 330, 340, 380, 390, 485, 975, 985]);

export const SECTIONS = [
  { id: "company", title: siteText("ch.ct600.section-company", "Company") },
  { id: "period", title: siteText("ch.ct600.section-period", "Period") },
  { id: "accounts", title: siteText("ch.ct600.section-accounts", "Accounts") },
  { id: "computation", title: siteText("ch.ct600.section-computation", "Computation") },
  { id: "allowances", title: siteText("ch.ct600.section-allowances", "Capital allowances") },
  { id: "reliefs", title: siteText("ch.ct600.section-reliefs", "Income and reliefs") },
  { id: "payments", title: siteText("ch.ct600.section-payments", "Payments") },
  { id: "loans", title: siteText("ch.ct600.section-loans", "Loans") },
  { id: "declaration", title: siteText("ch.ct600.section-declaration", "Declaration") },
];

const MONEY_HINT = siteText("ch.ct600.money-hint", "For example, £600 or £1,200");
const WHOLE = "whole-pounds";

function boxLabel(box) {
  return siteText("ch.ct600.box-label", "Box {box}: {label}", { box, label: boxRow(box).label });
}

// The fields that hold one answer for each accounting period when a period of account is longer than
// 12 months. The first column keeps the field's own id; the second adds this suffix.
export const SECOND_PERIOD_SUFFIX = "Ap2";

export const PER_PERIOD_FIELD_IDS = [
  "associatedCompanies",
  "annualInvestmentAllowance",
  "mainPoolAllowances",
  "mainPoolBalancingCharges",
  "fullExpensingAllowances",
  "fullExpensingBalancingCharges",
  "specialRateAllowances",
  "specialRateBalancingCharges",
  "specialRateAllowanceExpenditure",
  "specialRatePoolAllowances",
  "specialRatePoolAnnualInvestmentAllowance",
  "specialRatePoolBalancingCharges",
  "annualInvestmentAllowanceOutsideTrade",
  "firstYearAllowanceExpenditure",
  "otherMachineryAndPlantExpenditure",
  "lossAgainstTotalProfits",
  "lossesBroughtForwardAgainstTotalProfits",
  "lossCarriedBack",
  "frankedInvestmentIncome",
  "incomeTaxDeducted",
  "taxAlreadyPaid",
  "ownCorporationTax",
];

// The questions about loans to participators are asked for each accounting period too.
export const PER_PERIOD_LOAN_QUESTION_IDS = ["loansMade", "releasedBeforeEnd", "repaidSince"];

export const LONG_PERIOD_DONATIONS_LABEL = siteText("ch.ct600.long-period-donations", "Donations added back (whole period of account)");

/** Whether a field has a second column for a period of account longer than 12 months. */
export function isPerPeriodField(id) {
  return PER_PERIOD_FIELD_IDS.includes(id) || PER_PERIOD_LOAN_QUESTION_IDS.includes(id);
}

/** The element id of a per-period field for return 1 or return 2. */
export function periodFieldId(id, part) {
  return part === 2 ? `${id}${SECOND_PERIOD_SUFFIX}` : id;
}

/** The question that confirms the first accounting period starts on the first day of the accounts. */
export const FIRST_PERIOD_START_FIELD = "firstPeriodStart";

export const FIRST_PERIOD_START_REFUSAL = siteText(
  "ch.ct600.first-period-start-refusal",
  "Submit files a long period when the first accounting period starts on the first day of the accounts.",
);

// The typed fields. type: text, date, count, whole-pounds, pounds-and-pence, choice, checkbox.
// figure is the key in the figures model; target is the id the model's problems for that key show beside.
export const CT600_FORM_FIELDS = [
  {
    id: "utr",
    section: "company",
    figure: "utr",
    box: 3,
    type: "text",
    label: boxLabel(3),
    hint: siteText("ch.ct600.utr-hint", "The 10 digits on the company's HMRC Corporation Tax letters."),
    inputmode: "numeric",
    maxlength: 10,
  },
  {
    id: "companyType",
    section: "company",
    figure: "companyType",
    box: 4,
    type: "choice",
    label: siteText("ch.ct600.company-type", "Is the company one of the types listed for box 4?"),
    hint: siteText(
      "ch.ct600.company-type-hint",
      "Box 4 lists co-operatives, community amateur sports clubs, housing associations and similar types. Most companies answer No.",
    ),
    focus: "companyTypeNo",
  },
  {
    id: "associatedCompanies",
    section: "company",
    figure: "associatedCompanies",
    box: 326,
    type: "count",
    label: siteText("ch.ct600.associated-companies", "Box 326: Number of associated companies in this period"),
    hint: siteText(
      "ch.ct600.associated-companies-hint",
      "Companies under common control with this one. Enter 0 for none. A period that straddles 1 April files the same number in boxes 327 and 328.",
    ),
    default: "0",
  },
  {
    id: "period",
    section: "period",
    figure: "period",
    figureKeys: ["periodStart", "periodEnd"],
    box: 30,
    type: "dates",
    label: siteText("ch.ct600.period", "Period of account"),
    hint: siteText(
      "ch.ct600.period-hint",
      "The accounts cover this period. It starts on or after 1 April 2015, ends before today and lasts up to 18 months. A period over 12 months files as two returns.",
    ),
    focus: "periodStart",
  },
  {
    id: "tradeName",
    section: "computation",
    figure: "tradeName",
    type: "text",
    label: siteText("ch.ct600.trade-name", "Trade name"),
    hint: siteText("ch.ct600.trade-name-hint", "The name of the trade, shown in the computations. It starts as the principal activity."),
  },
  {
    id: "nonTradingLoanRelationshipCredits",
    section: "computation",
    figure: "nonTradingLoanRelationshipCredits",
    box: 170,
    type: WHOLE,
    label: boxLabel(170),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.non-trading-loan-relationship-credits-hint", "It starts as the accounts' interest receivable.")}`,
    default: "0",
  },
  {
    id: "depreciation",
    section: "computation",
    figure: "depreciation",
    type: WHOLE,
    label: siteText("ch.ct600.depreciation", "Depreciation added back"),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.depreciation-hint", "It starts as the note's charge for the year, when a note is given.")}`,
    default: "0",
  },
  {
    id: "amortisation",
    section: "computation",
    figure: "amortisation",
    type: WHOLE,
    label: siteText("ch.ct600.amortisation", "Amortisation added back"),
    hint: MONEY_HINT,
    default: "0",
  },
  {
    id: "entertaining",
    section: "computation",
    figure: "entertaining",
    type: WHOLE,
    label: siteText("ch.ct600.entertaining", "Entertaining added back"),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.entertaining-hint", "No more than the cost of sales plus administrative expenses.")}`,
    default: "0",
  },
  {
    id: "donations",
    section: "computation",
    figure: "donations",
    box: 305,
    type: WHOLE,
    label: siteText("ch.ct600.donations", "Box 305: Donations added back and claimed"),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.donations-hint", "Qualifying donations to charity. They are added back to the trading profit and claimed against total profits. No more than the cost of sales plus administrative expenses.")}`,
    default: "0",
  },
  {
    id: "annualInvestmentAllowance",
    section: "allowances",
    figure: "annualInvestmentAllowance",
    box: 690,
    type: WHOLE,
    label: boxLabel(690),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.annual-investment-allowance-hint", "The most is 1,000,000 for 12 months, reduced in proportion for a shorter period.")}`,
    default: "0",
  },
  {
    id: "mainPoolAllowances",
    section: "allowances",
    figure: "mainPoolAllowances",
    box: 705,
    type: WHOLE,
    label: siteText("ch.ct600.main-pool-allowances", "Box 705: Main pool writing down and balancing allowances"),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.main-pool-allowances-hint", "Leave out the annual investment allowance: box 705 includes it.")}`,
    default: "0",
  },
  {
    id: "mainPoolBalancingCharges",
    section: "allowances",
    figure: "mainPoolBalancingCharges",
    box: 710,
    type: WHOLE,
    label: boxLabel(710),
    hint: MONEY_HINT,
    default: "0",
  },
  {
    id: "fullExpensingAllowances",
    section: "allowances",
    figure: "fullExpensingAllowances",
    box: 688,
    type: WHOLE,
    label: siteText("ch.ct600.full-expensing-allowances", "Box 688: Full expensing allowances"),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.full-expensing-allowances-hint", "Allowances claimed in full under full expensing. Keep them out of the main pool figure.")}`,
    default: "0",
  },
  {
    id: "fullExpensingBalancingCharges",
    section: "allowances",
    figure: "fullExpensingBalancingCharges",
    box: 689,
    type: WHOLE,
    label: boxLabel(689),
    hint: MONEY_HINT,
    default: "0",
  },
  {
    id: "specialRateAllowances",
    section: "allowances",
    figure: "specialRateAllowances",
    box: 693,
    type: WHOLE,
    label: boxLabel(693),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.special-rate-allowances-hint", "The special rate allowance on new special rate assets.")}`,
    default: "0",
  },
  {
    id: "specialRateBalancingCharges",
    section: "allowances",
    figure: "specialRateBalancingCharges",
    box: 694,
    type: WHOLE,
    label: boxLabel(694),
    hint: MONEY_HINT,
    default: "0",
  },
  {
    id: "specialRateAllowanceExpenditure",
    section: "allowances",
    figure: "specialRateAllowanceExpenditure",
    box: 773,
    type: WHOLE,
    label: boxLabel(773),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.special-rate-allowance-expenditure-hint", "Needed whenever box 693 is completed.")}`,
    default: "0",
  },
  {
    id: "specialRatePoolAllowances",
    section: "allowances",
    figure: "specialRatePoolAllowances",
    box: 695,
    type: WHOLE,
    label: siteText("ch.ct600.special-rate-pool-allowances", "Box 695: Special rate pool writing down allowances"),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.special-rate-pool-allowances-hint", "Leave out the annual investment allowance claimed on this pool; give it below.")}`,
    default: "0",
  },
  {
    id: "specialRatePoolAnnualInvestmentAllowance",
    section: "allowances",
    figure: "specialRatePoolAnnualInvestmentAllowance",
    type: WHOLE,
    label: siteText(
      "ch.ct600.special-rate-pool-annual-investment-allowance",
      "Annual investment allowance claimed on the special rate pool",
    ),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.special-rate-pool-annual-investment-allowance-hint", "Part of the annual investment allowance in box 690. Box 695 includes it and box 705 leaves it out.")}`,
    default: "0",
  },
  {
    id: "specialRatePoolBalancingCharges",
    section: "allowances",
    figure: "specialRatePoolBalancingCharges",
    box: 700,
    type: WHOLE,
    label: boxLabel(700),
    hint: MONEY_HINT,
    default: "0",
  },
  {
    id: "annualInvestmentAllowanceOutsideTrade",
    section: "allowances",
    figure: "annualInvestmentAllowanceOutsideTrade",
    box: 735,
    type: WHOLE,
    label: boxLabel(735),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.annual-investment-allowance-outside-trade-hint", "Annual investment allowance claimed outside the calculation of trading profits. It does not change the trading profit.")}`,
    default: "0",
  },
  {
    id: "firstYearAllowanceExpenditure",
    section: "allowances",
    figure: "firstYearAllowanceExpenditure",
    box: 760,
    type: WHOLE,
    label: boxLabel(760),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.first-year-allowance-expenditure-hint", "Qualifying expenditure. It does not change the trading profit.")}`,
    default: "0",
  },
  {
    id: "otherMachineryAndPlantExpenditure",
    section: "allowances",
    figure: "otherMachineryAndPlantExpenditure",
    box: 775,
    type: WHOLE,
    label: boxLabel(775),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.other-machinery-and-plant-expenditure-hint", "Qualifying expenditure. It does not change the trading profit.")}`,
    default: "0",
  },
  {
    id: "lossesBroughtForward",
    section: "reliefs",
    figure: "lossesBroughtForward",
    box: 160,
    type: WHOLE,
    label: siteText("ch.ct600.losses-brought-forward", "Box 160: Trading losses brought forward"),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.losses-brought-forward-hint", "The losses available. The trading profit takes as much as it can in box 160 and the rest is carried forward.")}`,
    default: "0",
  },
  {
    id: "lossAgainstTotalProfits",
    section: "reliefs",
    figure: "lossAgainstTotalProfits",
    box: 275,
    type: WHOLE,
    label: boxLabel(275),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.loss-against-total-profits-hint", "A trading loss of this period set against this period's other profits, such as bank interest. Leave at 0 to carry the whole loss forward.")}`,
    default: "0",
  },
  {
    id: "lossesBroughtForwardAgainstTotalProfits",
    section: "reliefs",
    figure: "lossesBroughtForwardAgainstTotalProfits",
    box: 285,
    type: WHOLE,
    label: boxLabel(285),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.losses-brought-forward-against-total-profits-hint", "Losses brought forward that the trading profit did not take, claimed against the period's other profits.")}`,
    default: "0",
  },
  {
    id: "lossCarriedBack",
    section: "reliefs",
    figure: "lossCarriedBack",
    type: WHOLE,
    label: siteText("ch.ct600.loss-carried-back", "Trading loss carried back to the previous period"),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.loss-carried-back-hint", "A claim against the profits of the 12 months before this period. It gives a repayment of Corporation Tax shown with the tax worked out. Leave at 0 to carry the loss forward.")}`,
    default: "0",
  },
  {
    id: "priorPeriodChargeableProfits",
    section: "reliefs",
    figure: "priorPeriodChargeableProfits",
    type: WHOLE,
    label: siteText("ch.ct600.prior-period-chargeable-profits", "Previous period's chargeable profits (box 315 of its return)"),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.prior-period-chargeable-profits-hint", "Needed only for a carry-back claim.")}`,
    default: "0",
  },
  {
    id: "lossOutsideUk",
    section: "reliefs",
    figure: "lossOutsideUk",
    type: "checkbox",
    label: siteText("ch.ct600.loss-outside-uk", "The trade is carried on wholly outside the UK (a loss goes in box 790, not box 780)"),
  },
  {
    id: "frankedInvestmentIncome",
    section: "reliefs",
    figure: "frankedInvestmentIncome",
    box: 620,
    type: WHOLE,
    label: boxLabel(620),
    hint: MONEY_HINT,
    default: "0",
  },
  {
    id: "incomeTaxDeducted",
    section: "reliefs",
    figure: "incomeTaxDeducted",
    box: 515,
    type: "pounds-and-pence",
    label: boxLabel(515),
    hint: siteText("ch.ct600.income-tax-deducted-hint", "For example, £600 or £193.54. No more than the Corporation Tax in box 440."),
    default: "0",
  },
  {
    id: "taxAlreadyPaid",
    section: "payments",
    figure: "taxAlreadyPaid",
    box: 595,
    type: "pounds-and-pence",
    label: boxLabel(595),
    hint: siteText("ch.ct600.tax-already-paid-hint", "For example, £600 or £193.54. No more than the tax payable in box 525."),
    default: "0",
  },
  {
    id: "ownCorporationTax",
    section: "payments",
    figure: "ownCorporationTax",
    type: "pounds-and-pence",
    label: siteText("ch.ct600.own-corporation-tax", "Corporation Tax per your own working (optional)"),
    hint: siteText(
      "ch.ct600.own-corporation-tax-hint",
      "A check only. If it differs from box 440 by more than £5, the review stops and names both figures.",
    ),
    optional: true,
  },
  {
    id: "loansMade",
    section: "loans",
    figure: "loansMade",
    type: "choice",
    label: siteText(
      "ch.ct600.loans-made",
      "Did the company lend money to a director, shareholder or their associate in this period that was still owed at the end of it?",
    ),
    focus: "loansMadeNo",
  },
  {
    id: "releasedBeforeEnd",
    section: "loans",
    figure: "releasedBeforeEnd",
    type: "choice",
    label: siteText(
      "ch.ct600.released-before-end",
      "Were any loans made in the period repaid, released or written off before the end of the period?",
    ),
    focus: "releasedBeforeEndNo",
  },
  {
    id: "repaidSince",
    section: "loans",
    figure: "repaidSince",
    type: "choice",
    label: siteText("ch.ct600.repaid-since", "Has any of it been repaid, released or written off since the end of the period?"),
    focus: "repaidSinceNo",
  },
  {
    id: "declarantName",
    section: "declaration",
    figure: "declarantName",
    box: 975,
    type: "text",
    label: boxLabel(975),
  },
  {
    id: "declarantStatus",
    section: "declaration",
    figure: "declarantStatus",
    box: 985,
    type: "text",
    label: boxLabel(985),
    default: "Director",
  },
  {
    id: "declarationAccepted",
    section: "declaration",
    figure: "declarationAccepted",
    type: "checkbox",
    label: siteText(
      "ch.ct600.declaration-accepted",
      "I declare that the information in this return and the attached accounts and computations is correct and complete to the best of my knowledge and belief.",
    ),
  },
];

// The donations claimed in box 305 are the donations paid in each accounting period. A period of
// account of 12 months or less claims what it adds back, so only a long one asks for them.
export const DONATIONS_PAID_FIELD = {
  id: "donationsPaid",
  section: "reliefs",
  figure: "donationsPaid",
  box: 305,
  type: WHOLE,
  label: siteText("ch.ct600.donations-paid", "Box 305: Qualifying donations paid in the accounting period"),
  hint: `${MONEY_HINT}. ${siteText("ch.ct600.donations-paid-hint", "Qualifying donations to charity paid in this accounting period. They are claimed against total profits in this return's box 305.")}`,
  default: "0",
};

export const STATEMENT_FIELDS = [
  {
    id: "statementSection477Exemption",
    label: siteText(
      "ch.ct600.statement-section477-exemption",
      "The company is entitled to exemption from audit under section 477 of the Companies Act 2006 relating to small companies.",
    ),
  },
  {
    id: "statementMembersNotRequiredAudit",
    label: siteText(
      "ch.ct600.statement-members-not-required-audit",
      "The members have not required the company to obtain an audit for the year in question.",
    ),
  },
  {
    id: "statementDirectorsResponsibilities",
    label: siteText(
      "ch.ct600.statement-directors-responsibilities",
      "The directors acknowledge their responsibilities for complying with the requirements of the Companies Act 2006 with respect to accounting records and the preparation of accounts.",
    ),
  },
  {
    id: "statementSmallCompaniesRegime",
    label: siteText(
      "ch.ct600.statement-small-companies-regime",
      "These accounts have been prepared in accordance with the provisions applicable to companies subject to the small companies regime.",
    ),
  },
];

// The fourth statement of a micro-entity's accounts, in place of the small companies regime statement.
export const MICRO_STATEMENT_FIELD = {
  id: "statementMicroEntityProvisions",
  label: siteText(
    "ch.ct600.statement-micro-entity-provisions",
    "These accounts have been prepared in accordance with the provisions applicable to companies subject to the small companies regime and in accordance with the provisions available to micro-entities.",
  ),
};

// The two sets of accounts the return can carry: FRS 102 section 1A small company accounts, or
// FRS 105 micro-entity accounts with the profit and loss account HMRC takes with the return.
export const ACCOUNTS_REGIMES = [
  { value: "small", id: "regimeSmall", label: siteText("ch.ct600.regime-small", "Small company accounts (FRS 102 section 1A)") },
  { value: "micro", id: "regimeMicro", label: siteText("ch.ct600.regime-micro", "Micro-entity accounts (FRS 105)") },
];

export function regimeOf(values) {
  return values.accountsRegime === "micro" ? "micro" : "small";
}

/** The four statements the accounts carry for the regime the form holds. */
export function statementFieldsFor(values) {
  return regimeOf(values) === "micro" ? [...STATEMENT_FIELDS.slice(0, 3), MICRO_STATEMENT_FIELD] : STATEMENT_FIELDS;
}

// A company is a micro-entity when it meets two of the three limits (Companies Act 2006 s384A, the
// limits for financial years starting on or after 6 April 2025).
const MICRO_LIMITS = { turnover: 1_000_000, balanceSheetTotal: 500_000, employees: 10 };

export function qualifiesAsMicroEntity({ turnover, balanceSheetTotal, employees }) {
  const met = [turnover <= MICRO_LIMITS.turnover, balanceSheetTotal <= MICRO_LIMITS.balanceSheetTotal, employees <= MICRO_LIMITS.employees];
  return met.filter(Boolean).length >= 2;
}

// The micro-entity accounts. Ids are `microCurrent<Field>` and `microPrior<Field>`. Profit before tax,
// profit and capital and reserves are worked from these lines.
export const MICRO_PROFIT_AND_LOSS_FIELDS = [
  ["turnover", siteText("ch.ct600.micro-pl-turnover", "Turnover")],
  ["otherIncome", siteText("ch.ct600.micro-pl-other-income", "Other income")],
  ["rawMaterials", siteText("ch.ct600.micro-pl-raw-materials", "Raw materials and consumables")],
  ["staffCosts", siteText("ch.ct600.micro-pl-staff-costs", "Staff costs")],
  ["depreciation", siteText("ch.ct600.micro-pl-depreciation", "Depreciation and other amounts written off assets")],
  ["otherCharges", siteText("ch.ct600.micro-pl-other-charges", "Other charges")],
  ["tax", siteText("ch.ct600.micro-pl-tax", "Tax")],
];

export const MICRO_BALANCE_SHEET_FIELDS = [
  ["fixedAssets", siteText("ch.ct600.micro-bs-fixed-assets", "Fixed assets")],
  ["currentAssets", siteText("ch.ct600.micro-bs-current-assets", "Current assets")],
  ["creditorsWithinOneYear", siteText("ch.ct600.micro-bs-creditors-within-one-year", "Creditors: amounts falling due within one year")],
  [
    "creditorsAfterOneYear",
    siteText("ch.ct600.micro-bs-creditors-after-one-year", "Creditors: amounts falling due after more than one year"),
  ],
  ["calledUpShareCapital", siteText("ch.ct600.micro-bs-called-up-share-capital", "Called up share capital")],
  ["profitAndLossAccount", siteText("ch.ct600.micro-bs-profit-and-loss-account", "Profit and loss account reserve")],
];

export function microId(year, field) {
  return `micro${upperFirst(year)}${upperFirst(field)}`;
}

// The accounts section. Ids are `current<Field>`, `prior<Field>` and `note<Class><Field>`.
export const PROFIT_AND_LOSS_FIELDS = [
  ["turnover", siteText("ch.ct600.pl-turnover", "Turnover")],
  ["costOfSales", siteText("ch.ct600.pl-cost-of-sales", "Cost of sales")],
  ["administrativeExpenses", siteText("ch.ct600.pl-administrative-expenses", "Administrative expenses")],
  ["interestReceivable", siteText("ch.ct600.pl-interest-receivable", "Interest receivable and similar income")],
  ["tax", siteText("ch.ct600.pl-tax", "Tax on profit on ordinary activities")],
];

export const BALANCE_SHEET_FIELDS = [
  ["fixedAssets", siteText("ch.ct600.bs-fixed-assets", "Fixed assets")],
  ["stocks", siteText("ch.ct600.bs-stocks", "Stocks")],
  ["debtors", siteText("ch.ct600.bs-debtors", "Debtors")],
  ["amountsOwedByDirectors", siteText("ch.ct600.bs-amounts-owed-by-directors", "Of which, amounts owed by directors")],
  ["cashAtBank", siteText("ch.ct600.bs-cash-at-bank", "Cash at bank and in hand")],
  ["bankLoansOverdrafts", siteText("ch.ct600.bs-bank-loans-overdrafts", "Bank loans and overdrafts (due within one year)")],
  ["tradeCreditors", siteText("ch.ct600.bs-trade-creditors", "Trade creditors (due within one year)")],
  ["corporationTax", siteText("ch.ct600.bs-corporation-tax", "Corporation tax (due within one year)")],
  ["taxationSocialSecurity", siteText("ch.ct600.bs-taxation-social-security", "Taxation and social security (due within one year)")],
  ["otherCreditors", siteText("ch.ct600.bs-other-creditors", "Other creditors (due within one year)")],
  ["creditorsAfterOneYear", siteText("ch.ct600.bs-creditors-after-one-year", "Creditors: amounts falling due after more than one year")],
  ["bankLoansAfterOneYear", siteText("ch.ct600.bs-bank-loans-after-one-year", "Of which, bank loans")],
  ["calledUpShareCapital", siteText("ch.ct600.bs-called-up-share-capital", "Called up share capital")],
  ["profitAndLossAccount", siteText("ch.ct600.bs-profit-and-loss-account", "Profit and loss account reserve")],
];

export const FIXED_ASSET_CLASSES = [
  ["landBuildings", siteText("ch.ct600.asset-class-land-buildings", "Land and buildings")],
  ["plantMachinery", siteText("ch.ct600.asset-class-plant-machinery", "Plant and machinery")],
  ["furnitureFittings", siteText("ch.ct600.asset-class-furniture-fittings", "Fixtures and fittings")],
  ["computerEquipment", siteText("ch.ct600.asset-class-computer-equipment", "Computer equipment")],
  ["motorVehicles", siteText("ch.ct600.asset-class-motor-vehicles", "Motor vehicles")],
];

export const FIXED_ASSET_FIELDS = [
  ["costAtStart", siteText("ch.ct600.asset-cost-at-start", "Cost at the start of the period")],
  ["additions", siteText("ch.ct600.asset-additions", "Additions")],
  ["disposals", siteText("ch.ct600.asset-disposals", "Disposals (cost)")],
  ["depreciationAtStart", siteText("ch.ct600.asset-depreciation-at-start", "Depreciation at the start of the period")],
  ["depreciationCharge", siteText("ch.ct600.asset-depreciation-charge", "Depreciation charge for the period")],
  ["depreciationOnDisposals", siteText("ch.ct600.asset-depreciation-on-disposals", "Depreciation on disposals")],
];

export const ACCOUNTS_TEXT_FIELDS = [
  { id: "principalActivity", label: siteText("ch.ct600.principal-activity", "Principal activity"), type: "text", smallOnly: true },
  { id: "accountingPolicies", label: siteText("ch.ct600.accounting-policies", "Accounting policies"), type: "textarea", smallOnly: true },
  {
    id: "directors",
    label: siteText("ch.ct600.directors", "Directors who held office during the period (one name per line)"),
    reviewLabel: siteText("ch.ct600.directors-review", "Directors who held office during the period"),
    type: "textarea",
    smallOnly: true,
  },
  {
    id: "directorsAdvanceName",
    label: siteText(
      "ch.ct600.directors-advance-name",
      "Director who owes the company money (when the balance sheet shows amounts owed by directors)",
    ),
    type: "text",
    smallOnly: true,
  },
  {
    id: "directorsAdvanceTerms",
    label: siteText("ch.ct600.directors-advance-terms", "Interest rate and main conditions of that director's advance"),
    type: "text",
    smallOnly: true,
  },
  {
    id: "directorsAdvanceAtStart",
    label: siteText("ch.ct600.directors-advance-at-start", "Owed by that director at the start of the period, in whole pounds"),
    type: "count",
    smallOnly: true,
  },
  {
    id: "directorsAdvanceMade",
    label: siteText("ch.ct600.directors-advance-made", "Advanced to that director in the period, in whole pounds"),
    type: "count",
    smallOnly: true,
  },
  {
    id: "directorsAdvanceRepaid",
    label: siteText("ch.ct600.directors-advance-repaid", "Repaid by that director in the period, in whole pounds"),
    type: "count",
    smallOnly: true,
  },
  { id: "averageEmployees", label: siteText("ch.ct600.average-employees", "Average number of employees during the period"), type: "count" },
  { id: "directorName", label: siteText("ch.ct600.director-name", "Director approving the accounts"), type: "text" },
  { id: "directorDateApproved", label: siteText("ch.ct600.director-date-approved", "Date approved"), type: "date" },
];

// The ids of the micro-entity accounts' amounts, in the order the form shows them.
export function microAmountIds() {
  const ids = [];
  for (const year of ["current", "prior"]) {
    for (const [field] of MICRO_PROFIT_AND_LOSS_FIELDS) ids.push(microId(year, field));
    for (const [field] of MICRO_BALANCE_SHEET_FIELDS) ids.push(microId(year, field));
  }
  return ids;
}

export function upperFirst(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function profitAndLossId(year, field) {
  return `${year}${upperFirst(field)}`;
}

export function balanceSheetId(year, field) {
  return `${year}${upperFirst(field)}`;
}

export function noteId(className, field) {
  return `note${upperFirst(className)}${upperFirst(field)}`;
}

// The ids of the accounts section's amounts, in the order the form shows them.
export function accountAmountIds() {
  const ids = [];
  for (const year of ["current", "prior"]) {
    for (const [field] of PROFIT_AND_LOSS_FIELDS) ids.push(profitAndLossId(year, field));
    for (const [field] of BALANCE_SHEET_FIELDS) ids.push(balanceSheetId(year, field));
  }
  for (const [className] of FIXED_ASSET_CLASSES) for (const [field] of FIXED_ASSET_FIELDS) ids.push(noteId(className, field));
  return ids;
}

// --- Reading what the customer typed -------------------------------------------------------

function digitsOf(whole) {
  if (/^\d+$/.test(whole)) return whole;
  const groups = whole.split(",");
  const grouped = groups.length > 1 && /^\d{1,3}$/.test(groups[0]) && groups.slice(1).every((group) => /^\d{3}$/.test(group));
  return grouped ? groups.join("") : null;
}

/**
 * Pounds typed into a box: "£1,200.50", "1200.5" or " 1,200 ". null for anything else.
 * @param {string} text
 * @param {boolean} [wholePounds]
 */
export function parsePounds(text, wholePounds = false) {
  let rest = String(text ?? "").trim();
  let negative = false;
  for (const mark of ["-", "£", "-"]) {
    if (mark === "£" && rest.startsWith("£")) rest = rest.slice(1);
    else if (mark === "-" && rest.startsWith("-")) {
      if (negative) return null;
      negative = true;
      rest = rest.slice(1);
    }
  }
  const [whole, pence, ...extra] = rest.split(".");
  const digits = digitsOf(whole);
  if (digits === null || extra.length > 0) return null;
  if (pence !== undefined && (wholePounds || !/^\d{1,2}$/.test(pence))) return null;
  const magnitude = Number(pence === undefined ? digits : `${digits}.${pence}`);
  return negative ? -magnitude : magnitude;
}

function isBlank(text) {
  return String(text ?? "").trim() === "";
}

// A typed amount for the model: blank is 0, text that is not an amount is NaN so the model refuses it.
function amountOf(values, id, wholePounds) {
  if (isBlank(values[id])) return 0;
  const parsed = parsePounds(values[id], wholePounds);
  return parsed === null ? Number.NaN : parsed;
}

function profitAndLossOf(values, year) {
  const figures = {};
  for (const [field] of PROFIT_AND_LOSS_FIELDS) figures[field] = amountOf(values, profitAndLossId(year, field), true);
  figures.grossProfit = figures.turnover - figures.costOfSales;
  figures.operatingProfit = figures.grossProfit - figures.administrativeExpenses;
  figures.profitBeforeTax = figures.operatingProfit + figures.interestReceivable;
  figures.profit = figures.profitBeforeTax - figures.tax;
  return figures;
}

function balanceSheetOf(values, year) {
  const figures = {};
  for (const [field] of BALANCE_SHEET_FIELDS) figures[field] = amountOf(values, balanceSheetId(year, field), true);
  figures.capitalAndReserves = figures.calledUpShareCapital + figures.profitAndLossAccount;
  // The form asks for the director's loan as a part of the debtors; the rest is trade debtors.
  if (figures.amountsOwedByDirectors > 0) figures.tradeDebtors = figures.debtors - figures.amountsOwedByDirectors;
  return figures;
}

function directorsAdvancesOf(values, currentSheet) {
  if (!currentSheet.amountsOwedByDirectors && String(values.directorsAdvanceName ?? "").trim() === "") return undefined;
  const whole = (id) => Number(String(values[id] ?? "").trim() || 0);
  return [
    {
      name: String(values.directorsAdvanceName ?? "").trim(),
      terms: String(values.directorsAdvanceTerms ?? "").trim(),
      balanceAtStart: whole("directorsAdvanceAtStart"),
      advanced: whole("directorsAdvanceMade"),
      repaid: whole("directorsAdvanceRepaid"),
      balanceAtEnd: currentSheet.amountsOwedByDirectors || 0,
    },
  ];
}

function microProfitAndLossOf(values, year) {
  const lines = {};
  for (const [field] of MICRO_PROFIT_AND_LOSS_FIELDS) lines[field] = amountOf(values, microId(year, field), true);
  const profitBeforeTax =
    lines.turnover + lines.otherIncome - lines.rawMaterials - lines.staffCosts - lines.depreciation - lines.otherCharges;
  return {
    turnover: lines.turnover,
    otherIncome: lines.otherIncome,
    rawMaterials: lines.rawMaterials,
    staffCosts: lines.staffCosts,
    depreciation: lines.depreciation,
    otherCharges: lines.otherCharges,
    profitBeforeTax,
    tax: lines.tax,
    profit: profitBeforeTax - lines.tax,
  };
}

// Last year's micro profit and loss account goes with the return only when the customer typed it:
// a book carries last year's balance sheet but not last year's profit and loss.
function hasMicroPriorProfitAndLoss(values) {
  return MICRO_PROFIT_AND_LOSS_FIELDS.some(([field]) => !isBlank(values[microId("prior", field)]));
}

function microBalanceSheetOf(values, year) {
  const sheet = {};
  for (const [field] of MICRO_BALANCE_SHEET_FIELDS) sheet[field] = amountOf(values, microId(year, field), true);
  sheet.capitalAndReserves = sheet.calledUpShareCapital + sheet.profitAndLossAccount;
  return sheet;
}

export function microNetAssetsOf(sheet) {
  return sheet.fixedAssets + sheet.currentAssets - sheet.creditorsWithinOneYear - sheet.creditorsAfterOneYear;
}

/**
 * A micro-entity's profit and loss account from a small company's: interest receivable is other
 * income, and the costs less the depreciation are other charges.
 * @param {object} year - the small company profit and loss lines
 * @param {number} [depreciation] - the depreciation written off in the year
 */
export function microProfitAndLossFromSmall(year, depreciation = 0) {
  return {
    turnover: year.turnover,
    otherIncome: year.interestReceivable,
    rawMaterials: 0,
    staffCosts: 0,
    depreciation,
    otherCharges: year.costOfSales + year.administrativeExpenses - depreciation,
    profitBeforeTax: year.profitBeforeTax,
    tax: year.tax,
    profit: year.profit,
  };
}

export function netAssetsOf(sheet) {
  return (
    sheet.fixedAssets +
    sheet.stocks +
    sheet.debtors +
    sheet.cashAtBank -
    sheet.bankLoansOverdrafts -
    sheet.tradeCreditors -
    sheet.corporationTax -
    sheet.taxationSocialSecurity -
    sheet.otherCreditors -
    sheet.creditorsAfterOneYear
  );
}

function fixedAssetNoteOf(values) {
  const note = {};
  for (const [className] of FIXED_ASSET_CLASSES) {
    const figures = {};
    for (const [field] of FIXED_ASSET_FIELDS) figures[field] = amountOf(values, noteId(className, field), true);
    if (Object.values(figures).some((value) => value !== 0)) note[className] = figures;
  }
  return note;
}

export function netBookValueOf(note) {
  return Object.values(note).reduce(
    (total, f) =>
      total + (f.costAtStart + f.additions - f.disposals) - (f.depreciationAtStart + f.depreciationCharge - f.depreciationOnDisposals),
    0,
  );
}

export function depreciationChargeOf(note) {
  return Object.values(note).reduce((total, f) => total + f.depreciationCharge, 0);
}

/**
 * The accounts the form holds, in the request's shape.
 * @param {Record<string, string|boolean>} values - the form's values by element id
 */
export function accountsFromValues(values) {
  const includePrior = values.includeComparatives === true;
  if (regimeOf(values) === "micro") {
    return {
      periodStart: values.periodStart,
      periodEnd: values.periodEnd,
      averageEmployees: Number(values.averageEmployees),
      director: { name: String(values.directorName ?? "").trim(), dateApproved: values.directorDateApproved },
      balanceSheet: { currentYear: microBalanceSheetOf(values, "current"), priorYear: microBalanceSheetOf(values, "prior") },
      profitAndLoss: {
        currentYear: microProfitAndLossOf(values, "current"),
        ...(includePrior && hasMicroPriorProfitAndLoss(values) ? { priorYear: microProfitAndLossOf(values, "prior") } : {}),
      },
    };
  }
  const note = values.includeFixedAssetNote === true ? fixedAssetNoteOf(values) : undefined;
  const currentSheet = balanceSheetOf(values, "current");
  const directorsAdvances = directorsAdvancesOf(values, currentSheet);
  return {
    periodStart: values.periodStart,
    periodEnd: values.periodEnd,
    averageEmployees: Number(values.averageEmployees),
    director: { name: String(values.directorName ?? "").trim(), dateApproved: values.directorDateApproved },
    smallCompany: {
      filleted: false,
      principalActivity: String(values.principalActivity ?? "").trim(),
      accountingPolicies: String(values.accountingPolicies ?? "").trim(),
      directors: String(values.directors ?? "")
        .split("\n")
        .map((name) => name.trim())
        .filter((name) => name),
      balanceSheet: {
        currentYear: currentSheet,
        ...(includePrior ? { priorYear: balanceSheetOf(values, "prior") } : {}),
      },
      ...(directorsAdvances ? { directorsAdvances } : {}),
      profitAndLoss: {
        currentYear: profitAndLossOf(values, "current"),
        ...(includePrior ? { priorYear: profitAndLossOf(values, "prior") } : {}),
      },
      ...(note ? { fixedAssetNote: note } : {}),
    },
  };
}

/**
 * The accounting periods of the period the form holds, or undefined when it is 12 months or less or
 * its dates are not both dates.
 * @param {Record<string, string|boolean>} values
 */
export function longPeriodOf(values) {
  return accountingPeriodDates(values.periodStart, values.periodEnd);
}

const FIELD_BY_ID = new Map([...CT600_FORM_FIELDS, DONATIONS_PAID_FIELD].map((field) => [field.id, field]));

// What one accounting period of a long period of account holds: the answers of its column.
function accountingPeriodFigures(values, part) {
  const figures = {};
  for (const id of [...PER_PERIOD_FIELD_IDS, DONATIONS_PAID_FIELD.id]) {
    const field = FIELD_BY_ID.get(id);
    const key = periodFieldId(id, part);
    if (field.id === "associatedCompanies") {
      figures[field.figure] = isBlank(values[key]) ? 0 : Number(String(values[key]).trim());
    } else if (field.type === WHOLE) {
      figures[field.figure] = amountOf(values, key, true);
    } else if (field.optional) {
      if (!isBlank(values[key])) figures[field.figure] = amountOf(values, key, false);
    } else {
      figures[field.figure] = amountOf(values, key, false);
    }
  }
  if (values[periodFieldId("loansMade", part)] === "yes") figures.loansToParticipators = loansFromValues(values, part);
  return figures;
}

/**
 * The figures model from the form's values. The company's name and number come from the lookup. A
 * period of account longer than 12 months carries the answers of its two accounting periods in
 * accountingPeriods, and no working sheet: a book covers 12 months.
 * @param {Record<string, string|boolean>} values
 * @param {{companyName: string, companyNumber: string}} company
 * @param {object} [workingSheet] - the book's own trading profit and Corporation Tax, when a book filled the form
 */
export function figuresFromValues(values, company, workingSheet) {
  const accounts = accountsFromValues(values);
  const profitAndLoss = accounts.smallCompany?.profitAndLoss ?? accounts.profitAndLoss;
  const long = longPeriodOf(values);
  const figures = {
    companyName: company.companyName,
    companyNumber: company.companyNumber,
    utr: String(values.utr ?? "").trim(),
    companyType: values.companyType === "yes" ? 1 : 0,
    periodStart: values.periodStart,
    periodEnd: values.periodEnd,
    profitAndLoss: profitAndLoss.priorYear
      ? { current: profitAndLoss.currentYear, prior: profitAndLoss.priorYear }
      : { current: profitAndLoss.currentYear },
    declarantName: String(values.declarantName ?? "").trim(),
    declarantStatus: String(values.declarantStatus ?? "").trim(),
  };
  if (!long) figures.associatedCompanies = isBlank(values.associatedCompanies) ? 0 : Number(String(values.associatedCompanies).trim());
  for (const field of CT600_FORM_FIELDS) {
    if (long && PER_PERIOD_FIELD_IDS.includes(field.id)) continue;
    if (field.type === WHOLE) figures[field.figure] = amountOf(values, field.id, true);
    if (field.type === "pounds-and-pence" && !field.optional) figures[field.figure] = amountOf(values, field.id, false);
  }
  if (values.lossOutsideUk === true) figures.lossOutsideUk = true;
  if (long) {
    figures.accountingPeriods = [accountingPeriodFigures(values, 1), accountingPeriodFigures(values, 2)];
    return figures;
  }
  if (!isBlank(values.ownCorporationTax)) figures.ownCorporationTax = amountOf(values, "ownCorporationTax", false);
  if (workingSheet) figures.workingSheet = workingSheet;
  if (values.loansMade === "yes") figures.loansToParticipators = loansFromValues(values);
  return figures;
}

/**
 * The figures the model takes that the request carries in its own body: everything but the
 * facts the request names elsewhere (company, UTR, declarant, accounts).
 */
export function requestFigures(figures) {
  const named = new Set([
    "companyName",
    "companyNumber",
    "utr",
    "declarantName",
    "declarantStatus",
    "profitAndLoss",
    "tradeName",
    "declarationAccepted",
    "loansMade",
    "releasedBeforeEnd",
    "repaidSince",
  ]);
  return Object.fromEntries(Object.entries(figures).filter(([key, value]) => !named.has(key) && value !== undefined));
}

/**
 * The preview and submit request body for the form's values.
 * @param {Record<string, string|boolean>} values
 * @param {{companyName: string, companyNumber: string}} company
 * @param {object} [workingSheet]
 */
export function ct600RequestFromValues(values, company, workingSheet) {
  const figures = figuresFromValues(values, company, workingSheet);
  return {
    companyNumber: company.companyNumber,
    companyName: company.companyName,
    registeredOffice: company.registeredOffice,
    ...accountsFromValues(values),
    statementsAccepted: {
      section477Exemption: values.statementSection477Exemption,
      membersNotRequiredAudit: values.statementMembersNotRequiredAudit,
      directorsResponsibilities: values.statementDirectorsResponsibilities,
      ...(regimeOf(values) === "micro"
        ? { microEntityProvisions: values.statementMicroEntityProvisions }
        : { smallCompaniesRegime: values.statementSmallCompaniesRegime }),
    },
    tradeName: String(values.tradeName ?? "").trim(),
    figures: requestFigures(figures),
    utr: figures.utr,
    declarant: { name: figures.declarantName, status: figures.declarantStatus },
    declarationAccepted: values.declarationAccepted === true,
  };
}

// --- Loans to participators ------------------------------------------------------------------
// The rows are added and removed on the page, so their element ids carry a row number from 1.

export const LOAN_ROW_FIELDS = ["Name", "Amount", "Lent", "Rate"];
export const REPAYMENT_ROW_FIELDS = ["Name", "Date", "Repaid", "Released"];

export function loanId(field, row, part = 1) {
  return periodFieldId(`loan${field}${row}`, part);
}

export function repaymentId(field, row, part = 1) {
  return periodFieldId(`repayment${field}${row}`, part);
}

function rowNumbers(values, idOf, field, part) {
  const numbers = [];
  for (let row = 1; row <= 999; row += 1) if (idOf(field, row, part) in values) numbers.push(row);
  return numbers;
}

export function loanRowNumbers(values, part = 1) {
  return rowNumbers(values, loanId, "Name", part);
}

export function repaymentRowNumbers(values, part = 1) {
  return rowNumbers(values, repaymentId, "Name", part);
}

/** A rate typed as a percentage ("35.75" or "35.75%") as a fraction (0.3575); null when it is not one. */
export function rateFromPercent(typed) {
  const text = String(typed ?? "")
    .trim()
    .replace(/%$/, "")
    .trim();
  const [whole, decimals = ""] = text.split(".");
  if (!/^\d{1,3}$/.test(whole) || !/^\d{0,2}$/.test(decimals) || (text.includes(".") && decimals === "")) return null;
  const rate = Number(text) / 100;
  return rate > 0 && rate < 1 ? Math.round(rate * 10_000) / 10_000 : null;
}

function wholeOrBlank(values, id) {
  return isBlank(values[id]) ? 0 : amountOf(values, id, true);
}

/**
 * The loans to participators answers the form holds, in the figures model's shape: the loans, the
 * repayments up to today and the answer to whether any were repaid before the period end.
 * @param {Record<string, string|boolean>} values
 */
export function loansFromValues(values, part = 1) {
  const rows = loanRowNumbers(values, part).map((row) => {
    const lent = wholeOrBlank(values, loanId("Lent", row, part));
    const rate = rateFromPercent(values[loanId("Rate", row, part)]);
    return {
      name: String(values[loanId("Name", row, part)] ?? "").trim(),
      amount: amountOf(values, loanId("Amount", row, part), true),
      ...(lent > 0 ? { lentFromRateChange: lent } : {}),
      ...(rate === null ? {} : { rate }),
    };
  });
  const repayments =
    values[periodFieldId("repaidSince", part)] === "yes"
      ? repaymentRowNumbers(values, part).map((row) => ({
          name: String(values[repaymentId("Name", row, part)] ?? "").trim(),
          date: String(values[repaymentId("Date", row, part)] ?? ""),
          repaid: wholeOrBlank(values, repaymentId("Repaid", row, part)),
          releasedOrWrittenOff: wholeOrBlank(values, repaymentId("Released", row, part)),
        }))
      : [];
  return { releasedBeforeEnd: values[periodFieldId("releasedBeforeEnd", part)] === "yes", loans: rows, repayments };
}

function loanRowProblems(values, problem, today, part = 1) {
  const names = new Set();
  for (const row of loanRowNumbers(values, part)) {
    const name = String(values[loanId("Name", row, part)] ?? "").trim();
    if (name.length < 2 || name.length > 56 || /[<>|"\\]/.test(name) || [...name].some((character) => character < " ")) {
      problem(loanId("Name", row, part), siteText("ch.ct600.problem-loan-name", "Enter the participator's name, 2 to 56 characters"));
    } else if (names.has(name)) {
      problem(
        loanId("Name", row, part),
        siteText("ch.ct600.problem-loan-name-twice", "{name} is already in the list; enter one loan for each participator", { name }),
      );
    }
    names.add(name);
    const amount = amountOf(values, loanId("Amount", row, part), true);
    if (!Number.isInteger(amount) || amount <= 0) {
      problem(
        loanId("Amount", row, part),
        siteText("ch.ct600.problem-loan-amount", "Enter the amount still owed in whole pounds, above 0"),
      );
    }
    const lent = wholeOrBlank(values, loanId("Lent", row, part));
    if (!Number.isInteger(lent) || lent < 0 || lent > amount) {
      problem(
        loanId("Lent", row, part),
        siteText(
          "ch.ct600.problem-loan-lent",
          "Enter the part lent on or after the rate change in whole pounds, no more than the amount owed",
        ),
      );
    }
    if (!isBlank(values[loanId("Rate", row, part)]) && rateFromPercent(values[loanId("Rate", row, part)]) === null) {
      problem(
        loanId("Rate", row, part),
        siteText("ch.ct600.problem-loan-rate", "Enter the rate as a percentage with at most two decimal places, like 33.75"),
      );
    }
  }
  repaymentRowProblems(values, problem, today, part);
}

function repaymentRowProblems(values, problem, today, part) {
  if (values[periodFieldId("repaidSince", part)] !== "yes") return;
  const names = new Set(loanRowNumbers(values, part).map((row) => String(values[loanId("Name", row, part)] ?? "").trim()));
  const periodEnd = longPeriodOf(values)?.periods[part - 1].periodEnd ?? values.periodEnd;
  for (const row of repaymentRowNumbers(values, part)) {
    if (!names.has(String(values[repaymentId("Name", row, part)] ?? "").trim())) {
      problem(repaymentId("Name", row, part), siteText("ch.ct600.problem-repayment-name", "Choose a participator from the loans"));
    }
    const date = String(values[repaymentId("Date", row, part)] ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      problem(repaymentId("Date", row, part), siteText("ch.ct600.problem-repayment-date", "Enter the date of the repayment"));
    } else if (periodEnd && date <= periodEnd) {
      problem(
        repaymentId("Date", row, part),
        siteText(
          "ch.ct600.problem-repayment-in-period",
          "A repayment on or before the end of the period belongs in the period's own books",
        ),
      );
    } else if (date > today) {
      problem(repaymentId("Date", row, part), siteText("ch.ct600.problem-repayment-future", "A repayment cannot be dated after today"));
    }
    const repaid = wholeOrBlank(values, repaymentId("Repaid", row, part));
    const released = wholeOrBlank(values, repaymentId("Released", row, part));
    if (!Number.isInteger(repaid) || repaid < 0 || !Number.isInteger(released) || released < 0) {
      problem(
        repaymentId("Repaid", row, part),
        siteText("ch.ct600.problem-repayment-whole", "Enter whole pounds, or leave it empty for none"),
      );
    } else if (repaid + released === 0) {
      problem(
        repaymentId("Repaid", row, part),
        siteText("ch.ct600.problem-repayment-none", "Enter the amount repaid, or the amount released or written off"),
      );
    }
  }
}

// --- Checks the model does not run ---------------------------------------------------------

const AMOUNT_PROBLEM = siteText("ch.ct600.problem-amount", "Enter an amount in pounds, like £600 or £1,200");

/** The second column of a per-period field: its own id and a label that names the return. */
export function secondPeriodField(field) {
  return {
    ...field,
    id: periodFieldId(field.id, 2),
    label: siteText("ch.ct600.return-2-label", "{label} (return 2)", { label: field.label }),
  };
}

// The typed amounts to check: every field, and for a period over 12 months the donations paid and the second column.
function typedAmountFields(values) {
  if (!longPeriodOf(values)) return CT600_FORM_FIELDS;
  const perPeriod = CT600_FORM_FIELDS.filter((field) => PER_PERIOD_FIELD_IDS.includes(field.id));
  return [...CT600_FORM_FIELDS, DONATIONS_PAID_FIELD, secondPeriodField(DONATIONS_PAID_FIELD), ...perPeriod.map(secondPeriodField)];
}

function amountProblems(values, problem) {
  const micro = regimeOf(values) === "micro";
  for (const id of micro ? microAmountIds() : accountAmountIds()) {
    if (isBlank(values[id])) continue;
    if ((id.startsWith("prior") || id.startsWith("microPrior")) && values.includeComparatives !== true && !isMicroBalanceSheetId(id)) {
      continue;
    }
    if (id.startsWith("note") && values.includeFixedAssetNote !== true) continue;
    if (parsePounds(values[id], true) === null) problem(id, AMOUNT_PROBLEM);
  }
  for (const { id, label, type } of typedAmountFields(values)) {
    if ((type !== WHOLE && type !== "pounds-and-pence") || isBlank(values[id])) continue;
    if (parsePounds(values[id], type === WHOLE) === null) {
      const message =
        type === WHOLE ? AMOUNT_PROBLEM : siteText("ch.ct600.problem-pence", "Enter an amount in pounds and pence, like £600 or £193.54");
      problem(id, siteText("ch.ct600.problem-labelled", "{label}: {message}", { label, message }));
    }
  }
}

const MICRO_BALANCE_SHEET_IDS = new Set(
  ["current", "prior"].flatMap((year) => MICRO_BALANCE_SHEET_FIELDS.map(([field]) => microId(year, field))),
);

function isMicroBalanceSheetId(id) {
  return MICRO_BALANCE_SHEET_IDS.has(id);
}

// A micro-entity's accounts always show last year's balance sheet beside this year's.
function microBalanceSheetProblems(values, problem) {
  for (const year of ["current", "prior"]) {
    const sheet = microBalanceSheetOf(values, year);
    if (!Object.values(sheet).every(Number.isFinite)) continue;
    if (microNetAssetsOf(sheet) !== sheet.capitalAndReserves) {
      problem(
        microId(year, "profitAndLossAccount"),
        year === "current"
          ? siteText(
              "ch.ct600.problem-micro-unbalanced-this",
              "The balance sheet for this year does not balance: net assets {net}, share capital plus the profit and loss reserve {reserves}",
              { net: microNetAssetsOf(sheet), reserves: sheet.capitalAndReserves },
            )
          : siteText(
              "ch.ct600.problem-micro-unbalanced-last",
              "The balance sheet for last year does not balance: net assets {net}, share capital plus the profit and loss reserve {reserves}",
              { net: microNetAssetsOf(sheet), reserves: sheet.capitalAndReserves },
            ),
      );
    }
  }
}

function balanceSheetProblems(values, problem) {
  const years = values.includeComparatives === true ? ["current", "prior"] : ["current"];
  for (const year of years) {
    const sheet = balanceSheetOf(values, year);
    if (Object.values(sheet).every(Number.isFinite) && netAssetsOf(sheet) !== sheet.capitalAndReserves) {
      problem(
        `${year}ProfitAndLossAccount`,
        year === "current"
          ? siteText(
              "ch.ct600.problem-unbalanced-current",
              "The current year's balance sheet does not balance: net assets {net}, share capital plus the profit and loss reserve {reserves}",
              { net: netAssetsOf(sheet), reserves: sheet.capitalAndReserves },
            )
          : siteText(
              "ch.ct600.problem-unbalanced-prior",
              "The prior year's balance sheet does not balance: net assets {net}, share capital plus the profit and loss reserve {reserves}",
              { net: netAssetsOf(sheet), reserves: sheet.capitalAndReserves },
            ),
      );
    }
  }
}

function directorsAdvancesProblems(values, problem) {
  const years = values.includeComparatives === true ? ["current", "prior"] : ["current"];
  const owed = years.some((year) => amountOf(values, balanceSheetId(year, "amountsOwedByDirectors"), true) > 0);
  if (!owed) return;
  if (String(values.directorsAdvanceName ?? "").trim() === "")
    problem("directorsAdvanceName", siteText("ch.ct600.problem-advance-name", "Name the director who owes the company money"));
  if (String(values.directorsAdvanceTerms ?? "").trim() === "") {
    problem(
      "directorsAdvanceTerms",
      siteText("ch.ct600.problem-advance-terms", "State the interest rate and the main conditions of the advance"),
    );
  }
  for (const id of ["directorsAdvanceAtStart", "directorsAdvanceMade", "directorsAdvanceRepaid"]) {
    if (!/^\d*$/.test(String(values[id] ?? "").trim()))
      problem(id, siteText("ch.ct600.problem-advance-whole", "Enter a whole number of pounds, or leave it empty for none"));
  }
  const sheet = accountsFromValues(values).smallCompany?.directorsAdvances?.[0];
  if (sheet && sheet.balanceAtStart + sheet.advanced - sheet.repaid !== sheet.balanceAtEnd) {
    problem(
      "directorsAdvanceMade",
      siteText(
        "ch.ct600.problem-advance-sum",
        "Owed at the start {start} plus advanced {advanced} less repaid {repaid} must equal the {end} owed by directors at the end",
        { start: sheet.balanceAtStart, advanced: sheet.advanced, repaid: sheet.repaid, end: sheet.balanceAtEnd },
      ),
    );
  }
}

function fixedAssetNoteProblems(values, problem) {
  if (values.includeFixedAssetNote !== true) return;
  const note = fixedAssetNoteOf(values);
  const fixedAssets = amountOf(values, "currentFixedAssets", true);
  if (!Object.values(note).flatMap(Object.values).every(Number.isFinite) || !Number.isFinite(fixedAssets)) return;
  if (netBookValueOf(note) !== fixedAssets) {
    problem(
      "includeFixedAssetNote",
      siteText("ch.ct600.problem-note-value", "The note's net book value {value} does not equal the fixed assets {assets}", {
        value: netBookValueOf(note),
        assets: fixedAssets,
      }),
    );
  }
  const charge = depreciationChargeOf(note);
  if (amountOf(values, "depreciation", true) !== charge) {
    problem(
      "depreciation",
      siteText("ch.ct600.problem-note-depreciation", "Depreciation added back must equal the note's charge for the year, {charge}", {
        charge,
      }),
    );
  }
}

const SMALL_ONLY_TEXT = new Set(ACCOUNTS_TEXT_FIELDS.filter((field) => field.smallOnly).map((field) => field.id));

const REQUIRED_TEXT = [
  ["principalActivity", siteText("ch.ct600.problem-required-principal-activity", "Enter the principal activity")],
  ["accountingPolicies", siteText("ch.ct600.problem-required-accounting-policies", "Enter the accounting policies")],
  ["directors", siteText("ch.ct600.problem-required-directors", "Enter the directors")],
  ["directorName", siteText("ch.ct600.problem-required-director-name", "Enter the director approving the accounts")],
];

function answerProblems(values, problem) {
  const micro = regimeOf(values) === "micro";
  const turnoverId = micro ? microId("current", "turnover") : "currentTurnover";
  if (isBlank(values[turnoverId]))
    problem(turnoverId, siteText("ch.ct600.problem-turnover", "Enter the turnover from the profit and loss account"));
  if (String(values.tradeName ?? "").trim().length < 2)
    problem("tradeName", siteText("ch.ct600.problem-trade-name", "Enter the trade name (at least 2 characters)"));
  for (const [required, message] of REQUIRED_TEXT) {
    if (micro && SMALL_ONLY_TEXT.has(required)) continue;
    if (isBlank(values[required])) problem(required, message);
  }
  if (!/^\d+$/.test(String(values.averageEmployees ?? "").trim())) {
    problem("averageEmployees", siteText("ch.ct600.problem-employees", "Enter the average number of employees as a whole number"));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(values.directorDateApproved ?? ""))) {
    problem("directorDateApproved", siteText("ch.ct600.problem-date-approved", "Enter the date the accounts were approved"));
  }
  const unaccepted = statementFieldsFor(values).find(({ id }) => values[id] !== true);
  if (unaccepted)
    problem(unaccepted.id, siteText("ch.ct600.problem-statements", "Accept all four statements before you preview the return"));
  if (values.declarationAccepted !== true)
    problem("declarationAccepted", siteText("ch.ct600.problem-declaration", "Accept the declaration before you preview the return"));
}

/**
 * The checks on the form's own answers: the accounts, the signing and the questions the model
 * does not ask. A refusal is an answer this service cannot file.
 * @param {Record<string, string|boolean>} values
 * @returns {Array<{target: string, message: string, refusal: boolean}>}
 */
export function formProblems(values, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const problems = [];
  const problem = (target, message, refusal = false) => problems.push({ target, message, refusal });
  amountProblems(values, problem);
  if (regimeOf(values) === "micro") {
    microBalanceSheetProblems(values, problem);
  } else {
    balanceSheetProblems(values, problem);
    directorsAdvancesProblems(values, problem);
    fixedAssetNoteProblems(values, problem);
  }
  if (values.loansMade === "yes") loanRowProblems(values, problem, today);
  if (longPeriodOf(values)) {
    if (values.loansMadeAp2 === "yes") loanRowProblems(values, problem, today, 2);
    if (values[FIRST_PERIOD_START_FIELD] === "no") problem(FIRST_PERIOD_START_FIELD, FIRST_PERIOD_START_REFUSAL, true);
  }
  answerProblems(values, problem);
  return problems;
}

// Where each of the model's problems shows. A key the form has no field for shows at the worked tax.
const MODEL_TARGETS = {
  period: "period",
  profitAndLoss: "workedTax",
  corporationTax: "workedTax",
  figures: "workedTax",
  loansToParticipators: "loansMade",
};

/**
 * The element id a model problem shows beside.
 * @param {string} field - the problem's field
 * @param {Set<string>} knownIds - the ids the form has
 */
export function targetOfModelProblem(field, knownIds) {
  if (field === "companyNumber" || field === "companyName") return "workedTax";
  if (MODEL_TARGETS[field]) return MODEL_TARGETS[field];
  return knownIds.has(field) ? field : "workedTax";
}

/** The financial year an ISO date falls in: financial year 2025 runs 1 April 2025 to 31 March 2026. */
export function financialYearOf(isoDate) {
  const [year, month] = isoDate.split("-").map(Number);
  return month >= 4 ? year : year - 1;
}

// --- Filling the form ----------------------------------------------------------------------

function text(value) {
  return value === undefined || value === null ? "" : String(value);
}

function accountsEntries(accounts) {
  const entries = [];
  const sheetEntries = (prefix, sheet) => {
    for (const [field] of BALANCE_SHEET_FIELDS) entries.push([balanceSheetId(prefix, field), text(sheet[field])]);
  };
  const plEntries = (prefix, pl) => {
    for (const [field] of PROFIT_AND_LOSS_FIELDS) entries.push([profitAndLossId(prefix, field), text(pl[field])]);
  };
  const smallCompany = accounts.smallCompany;
  if (accounts.periodStart && accounts.periodEnd) entries.push(["periodStart", accounts.periodStart], ["periodEnd", accounts.periodEnd]);
  if (smallCompany?.profitAndLoss?.currentYear) plEntries("current", smallCompany.profitAndLoss.currentYear);
  if (smallCompany?.balanceSheet?.currentYear) sheetEntries("current", smallCompany.balanceSheet.currentYear);
  const prior = smallCompany?.balanceSheet?.priorYear;
  entries.push(["includeComparatives", Boolean(prior)]);
  if (prior) {
    sheetEntries("prior", prior);
    if (smallCompany.profitAndLoss.priorYear) plEntries("prior", smallCompany.profitAndLoss.priorYear);
  }
  const note = smallCompany?.fixedAssetNote;
  entries.push(["includeFixedAssetNote", Boolean(note)]);
  if (note) {
    for (const [className] of FIXED_ASSET_CLASSES) {
      for (const [field] of FIXED_ASSET_FIELDS) entries.push([noteId(className, field), text(note[className]?.[field] ?? 0)]);
    }
  }
  if (smallCompany?.principalActivity) entries.push(["principalActivity", smallCompany.principalActivity]);
  if (smallCompany?.accountingPolicies) entries.push(["accountingPolicies", smallCompany.accountingPolicies]);
  if (smallCompany?.directors) entries.push(["directors", smallCompany.directors.join("\n")]);
  const advance = smallCompany?.directorsAdvances?.[0];
  if (advance) {
    entries.push(
      ["directorsAdvanceName", advance.name],
      ["directorsAdvanceAtStart", text(advance.balanceAtStart)],
      ["directorsAdvanceMade", text(advance.advanced)],
      ["directorsAdvanceRepaid", text(advance.repaid)],
    );
  }
  if (accounts.averageEmployees !== undefined) entries.push(["averageEmployees", text(accounts.averageEmployees)]);
  if (accounts.director?.name) entries.push(["directorName", accounts.director.name]);
  if (accounts.director?.dateApproved) entries.push(["directorDateApproved", accounts.director.dateApproved]);
  return entries;
}

/**
 * Every form value a book supplies, as [element id, value] pairs: the figures the model reads
 * from the book, the accounts, the trade name and the signer. The company's UTR, the date the
 * accounts were approved, and the statements and declaration stay the customer's to give.
 * The book's micro-entity accounts fill the micro fields too, and the size of the company picks the
 * regime the form opens on.
 * @param {object} figures - ct600FiguresFromBook output
 * @param {object} accounts - smallCompanyAccountsFromBook output
 * @param {object} [microAccounts] - microEntityAccountsFromBook output
 */
export function formEntriesFromBook(figures, accounts, microAccounts) {
  const entries = [
    ["periodStart", figures.periodStart],
    ["periodEnd", figures.periodEnd],
    ["associatedCompanies", text(figures.associatedCompanies ?? 0)],
    ["tradeName", accounts.tradeName],
  ];
  for (const field of CT600_FORM_FIELDS) {
    if (!field.figure || !(field.type === WHOLE || field.type === "pounds-and-pence")) continue;
    if (field.optional) continue;
    entries.push([field.id, text(figures[field.figure] ?? 0)]);
  }
  entries.push(
    ...accountsEntries({
      periodStart: accounts.periodStart,
      periodEnd: accounts.periodEnd,
      averageEmployees: accounts.averageNumberOfEmployees,
      // A book holds no approval date, so the field stays empty and the form's check asks for it.
      director: { name: accounts.directorName },
      smallCompany: {
        principalActivity: accounts.tradeName,
        accountingPolicies: "The accounts are prepared under FRS 102 section 1A.",
        directors: accounts.directors?.length ? accounts.directors : [accounts.directorName].filter(Boolean),
        balanceSheet: accounts.balanceSheet,
        directorsAdvances: accounts.directorsAdvances,
        profitAndLoss: { currentYear: accounts.profitAndLoss.currentYear },
        fixedAssetNote: Object.keys(accounts.fixedAssetNote ?? {}).length > 0 ? accounts.fixedAssetNote : undefined,
      },
    }),
  );
  if (accounts.directorName) entries.push(["declarantName", accounts.directorName]);
  if (microAccounts) entries.push(...microEntries(figures, accounts, microAccounts));
  entries.push(...loanEntries(figures, accounts));
  return entries;
}

// The book's director's loan account: lent in the period when it is more overdrawn at the end than at the start.
function loanEntries(figures, accounts) {
  const overdrawn = figures.directorsLoanOverdrawn ?? 0;
  const opening = figures.directorsLoanOpeningOverdrawn ?? 0;
  const entries = [
    [
      "loansBookNote",
      siteText(
        "ch.ct600.book-loan-note",
        "Your book shows the director's loan account overdrawn by £{end} at the end and £{start} at the start.",
        { end: overdrawn.toLocaleString("en-GB"), start: opening.toLocaleString("en-GB") },
      ),
    ],
  ];
  if (overdrawn <= opening) return entries;
  const director = accounts.directorName ?? "";
  return [
    ...entries,
    ["loansMadeYes", true],
    ["loansMadeNo", false],
    [loanId("Name", 1), director],
    [loanId("Amount", 1), text(overdrawn - opening)],
  ];
}

function microEntries(figures, accounts, microAccounts) {
  const entries = [];
  const pl = microProfitAndLossFromSmall(accounts.profitAndLoss.currentYear, figures.depreciation ?? 0);
  for (const [field] of MICRO_PROFIT_AND_LOSS_FIELDS) entries.push([microId("current", field), text(pl[field])]);
  for (const [year, key] of [
    ["current", "currentYear"],
    ["prior", "priorYear"],
  ]) {
    const sheet = microAccounts.balanceSheet?.[key];
    if (sheet) for (const [field] of MICRO_BALANCE_SHEET_FIELDS) entries.push([microId(year, field), text(sheet[field])]);
  }
  const current = microAccounts.balanceSheet?.currentYear ?? {};
  const micro = qualifiesAsMicroEntity({
    turnover: accounts.profitAndLoss.currentYear.turnover,
    balanceSheetTotal: (current.fixedAssets ?? 0) + (current.currentAssets ?? 0),
    employees: microAccounts.averageNumberOfEmployees ?? accounts.averageNumberOfEmployees ?? 0,
  });
  entries.push([micro ? "regimeMicro" : "regimeSmall", true]);
  return entries;
}

const FIXED_ASSET_CLASS_NAMES = FIXED_ASSET_CLASSES.map(([className]) => className);

function figureEntries(idOf, year, fields, figures) {
  return fields.filter(([field]) => Number.isFinite(figures?.[field])).map(([field]) => [idOf(year, field), text(figures[field])]);
}

/**
 * The accounts section's values from an iXBRL accounts document the diya-gl reader mapped, as
 * [element id, value] pairs. The regime the document is for is the regime the form opens on, and the
 * depreciation added back starts as the fixed asset note's charge for the year.
 * @param {object} mapped - mapIxbrlAccounts output
 */
export function formEntriesFromIxbrl(mapped) {
  const micro = mapped.regime === "micro";
  const { currentYear, priorYear } = mapped.balanceSheet;
  const entries = [
    ["periodStart", mapped.period.start],
    ["periodEnd", mapped.period.end],
    [micro ? "regimeMicro" : "regimeSmall", true],
  ];
  if (micro) {
    entries.push(...figureEntries(microId, "current", MICRO_BALANCE_SHEET_FIELDS, currentYear));
    entries.push(...figureEntries(microId, "prior", MICRO_BALANCE_SHEET_FIELDS, priorYear));
  } else {
    entries.push(...figureEntries(profitAndLossId, "current", PROFIT_AND_LOSS_FIELDS, mapped.profitAndLoss?.currentYear));
    entries.push(...figureEntries(balanceSheetId, "current", BALANCE_SHEET_FIELDS, currentYear));
    const hasPrior = Object.keys(priorYear).length > 0;
    entries.push(["includeComparatives", hasPrior]);
    if (hasPrior) {
      entries.push(...figureEntries(balanceSheetId, "prior", BALANCE_SHEET_FIELDS, priorYear));
      entries.push(...figureEntries(profitAndLossId, "prior", PROFIT_AND_LOSS_FIELDS, mapped.profitAndLoss?.priorYear));
    }
    const note = mapped.fixedAssetNote ?? {};
    const noteClasses = FIXED_ASSET_CLASS_NAMES.filter((className) => note[className]);
    entries.push(["includeFixedAssetNote", noteClasses.length > 0]);
    for (const className of noteClasses) {
      for (const [field] of FIXED_ASSET_FIELDS) entries.push([noteId(className, field), text(note[className][field] ?? 0)]);
    }
    if (noteClasses.length > 0) {
      entries.push(["depreciation", text(noteClasses.reduce((total, className) => total + (note[className].depreciationCharge ?? 0), 0))]);
    }
    if (mapped.principalActivity) entries.push(["principalActivity", mapped.principalActivity]);
    if (mapped.directors.length > 0) entries.push(["directors", mapped.directors.join("\n")]);
  }
  const tradeName = micro ? mapped.company?.name : mapped.principalActivity || mapped.company?.name;
  if (tradeName) entries.push(["tradeName", tradeName]);
  if (typeof mapped.averageEmployees === "number") entries.push(["averageEmployees", text(mapped.averageEmployees)]);
  const directorName = mapped.signer || mapped.directors[0];
  if (directorName) entries.push(["directorName", directorName], ["declarantName", directorName]);
  if (mapped.approvalDate) entries.push(["directorDateApproved", mapped.approvalDate]);
  return entries;
}

/**
 * Set the form's elements from [element id, value] pairs: text for a box, true or false for a
 * checkbox. Each element hears an input and a change event, so the page checks what it holds.
 * Returns how many elements took a non-empty value.
 * @param {Array<[string, string|boolean]>} entries
 */
export function applyFormEntries(entries) {
  const filled = new Set();
  document.getElementById("returnForm")?.dispatchEvent(new CustomEvent("entriesapplying", { detail: { entries } }));
  for (const [id, value] of entries) {
    const element = document.getElementById(id);
    if (!element) continue;
    if (element.tagName === "P") {
      element.textContent = value;
      element.hidden = value === "";
      continue;
    }
    if (typeof value === "boolean") {
      element.checked = value;
    } else {
      element.value = value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
    if (value !== "" && value !== false) filled.add(id);
  }
  return filled.size;
}

/**
 * The form values the figures model alone supplies (the JSON the diya-gl MCP tool writes).
 * @param {object} figures
 */
export function formEntriesFromFigures(figures) {
  const entries = [
    ["periodStart", text(figures.periodStart)],
    ["periodEnd", text(figures.periodEnd)],
    ["associatedCompanies", text(figures.associatedCompanies ?? 0)],
  ];
  for (const field of CT600_FORM_FIELDS) {
    if (!field.figure || field.optional || !(field.type === WHOLE || field.type === "pounds-and-pence")) continue;
    if (figures[field.figure] !== undefined) entries.push([field.id, text(figures[field.figure])]);
  }
  const current = figures.profitAndLoss?.current;
  if (current) for (const [field] of PROFIT_AND_LOSS_FIELDS) entries.push([profitAndLossId("current", field), text(current[field])]);
  if (figures.utr) entries.push(["utr", figures.utr]);
  if (figures.declarantName) entries.push(["declarantName", figures.declarantName]);
  if (figures.declarantStatus) entries.push(["declarantStatus", figures.declarantStatus]);
  return entries;
}

// --- The review ------------------------------------------------------------------------------

// The first field a review row's Change link opens. A worked box points at its first source field.
const TURNOVER_FIELD = profitAndLossId("current", "turnover");
const MICRO_TURNOVER_FIELD = microId("current", "turnover");

/** The field a Change link opens for the regime the form holds: a micro-entity's turnover is its own field. */
export function changeTargetFor(fieldId, values) {
  return fieldId === TURNOVER_FIELD && regimeOf(values) === "micro" ? MICRO_TURNOVER_FIELD : fieldId;
}

const SECOND_COLUMN_SOURCES = new Set([...PER_PERIOD_FIELD_IDS, DONATIONS_PAID_FIELD.id, ...PER_PERIOD_LOAN_QUESTION_IDS]);

export const BOX_SOURCE_FIELD = {
  3: "utr",
  4: "companyType",
  30: "period",
  35: "period",
  50: "period",
  95: "loansMade",
  145: TURNOVER_FIELD,
  155: TURNOVER_FIELD,
  160: "lossesBroughtForward",
  165: TURNOVER_FIELD,
  170: "nonTradingLoanRelationshipCredits",
  235: TURNOVER_FIELD,
  275: "lossAgainstTotalProfits",
  280: "lossAgainstTotalProfits",
  285: "lossesBroughtForwardAgainstTotalProfits",
  295: "lossAgainstTotalProfits",
  300: TURNOVER_FIELD,
  305: "donations",
  315: TURNOVER_FIELD,
  326: "associatedCompanies",
  327: "associatedCompanies",
  328: "associatedCompanies",
  329: "period",
  330: "period",
  335: "period",
  340: "period",
  345: "period",
  380: "period",
  385: "period",
  390: "period",
  395: "period",
  430: "period",
  435: "associatedCompanies",
  440: "period",
  475: "period",
  480: "loansMade",
  485: "loansMade",
  510: "period",
  515: "incomeTaxDeducted",
  525: "incomeTaxDeducted",
  528: "incomeTaxDeducted",
  595: "taxAlreadyPaid",
  600: "taxAlreadyPaid",
  620: "frankedInvestmentIncome",
  690: "annualInvestmentAllowance",
  688: "fullExpensingAllowances",
  689: "fullExpensingBalancingCharges",
  693: "specialRateAllowances",
  694: "specialRateBalancingCharges",
  695: "specialRatePoolAllowances",
  700: "specialRatePoolBalancingCharges",
  735: "annualInvestmentAllowanceOutsideTrade",
  760: "firstYearAllowanceExpenditure",
  773: "specialRateAllowanceExpenditure",
  775: "otherMachineryAndPlantExpenditure",
  705: "mainPoolAllowances",
  710: "mainPoolBalancingCharges",
  780: TURNOVER_FIELD,
  790: TURNOVER_FIELD,
  975: "declarantName",
  985: "declarantStatus",
};

export const COMPUTATION_SOURCE_FIELD = {
  profitLossPerAccounts: TURNOVER_FIELD,
  nonTradingLoanRelationshipCredits: "nonTradingLoanRelationshipCredits",
  depreciation: "depreciation",
  amortisation: "amortisation",
  entertaining: "entertaining",
  donations: "donations",
  adjustedProfitBeforeAccountingPeriodAdjustments: TURNOVER_FIELD,
  timeApportionment: "period",
  adjustedProfitBeforeCapitalAllowances: TURNOVER_FIELD,
  totalCapitalAllowances: "annualInvestmentAllowance",
  adjustedProfit: TURNOVER_FIELD,
};

function partTarget(field, values, part) {
  return longPeriodOf(values) && part === 2 && SECOND_COLUMN_SOURCES.has(field) ? periodFieldId(field, 2) : field;
}

/**
 * The field a Change link for a box opens in return `part`. A period of account over 12 months
 * claims box 305 from the donations paid, and return 2's per-period boxes come from the second column.
 * @param {string|number} box
 * @param {Record<string, string|boolean>} values
 * @param {1|2} [part]
 */
export function boxChangeTarget(box, values, part = 1) {
  const source = BOX_SOURCE_FIELD[box] ?? LETTERED_BOX_SOURCE_FIELD[box];
  if (!source) return undefined;
  const field = longPeriodOf(values) && Number(box) === 305 ? DONATIONS_PAID_FIELD.id : source;
  return changeTargetFor(partTarget(field, values, part), values);
}

/** The field a Change link for a computation line opens in return `part`. */
export function lineChangeTarget(line, values, part = 1) {
  return changeTargetFor(partTarget(COMPUTATION_SOURCE_FIELD[line], values, part), values);
}

// Boxes whose number carries a letter, which a numeric key cannot hold.
export const LETTERED_BOX_SOURCE_FIELD = { "85A": "period" };

const NOT_GIVEN = siteText("ch.ct600.not-given", "Not given");
const YES = siteText("ch.ct600.yes", "Yes");
const NO = siteText("ch.ct600.no", "No");
const THIS_YEAR = siteText("ch.ct600.this-year", "this year");
const LAST_YEAR = siteText("ch.ct600.last-year", "last year");

// A review row's label for one year of the accounts: "Turnover, this year".
function yearLabel(label, when) {
  return siteText("ch.ct600.year-label", "{label}, {when}", { label, when });
}

function answerText(field, values) {
  if (field.type === "dates")
    return values.periodStart || values.periodEnd
      ? siteText("ch.ct600.dates-answer", "{start} to {end}", { start: values.periodStart, end: values.periodEnd })
      : NOT_GIVEN;
  if (field.type === "choice") return values[field.id] === "yes" ? YES : NO;
  if (field.type === "checkbox") return values[field.id] === true ? YES : NO;
  const typed = String(values[field.id] ?? "").trim();
  if (typed === "") return NOT_GIVEN;
  return field.type === WHOLE || field.type === "pounds-and-pence" ? poundsAnswer(typed) : typed;
}

// An amount as the review prints it: £1,200 or £193.54, with a minus sign before the £. Text
// that is not an amount shows as typed, so the customer sees what the checks refused.
function poundsAnswer(typed) {
  const amount = parsePounds(typed);
  if (amount === null) return `£${typed.replace(/^£/, "")}`;
  const digits = Number.isInteger(amount) ? 0 : 2;
  const text = Math.abs(amount).toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${amount < 0 ? "-" : ""}£${text}`;
}

function amountRows(ids, values) {
  return ids.map(({ id, label }) => ({ id, label, value: answerText({ id, type: WHOLE }, values) }));
}

function microAccountsRows(values) {
  const rows = [];
  const years = values.includeComparatives === true && hasMicroPriorProfitAndLoss(values) ? ["current", "prior"] : ["current"];
  for (const year of years) {
    const when = year === "current" ? THIS_YEAR : LAST_YEAR;
    rows.push(
      ...amountRows(
        MICRO_PROFIT_AND_LOSS_FIELDS.map(([field, label]) => ({ id: microId(year, field), label: yearLabel(label, when) })),
        values,
      ),
    );
  }
  for (const year of ["current", "prior"]) {
    const when = year === "current" ? THIS_YEAR : LAST_YEAR;
    rows.push(
      ...amountRows(
        MICRO_BALANCE_SHEET_FIELDS.map(([field, label]) => ({ id: microId(year, field), label: yearLabel(label, when) })),
        values,
      ),
    );
  }
  return rows;
}

function regimeRow(values) {
  const regime = ACCOUNTS_REGIMES.find((candidate) => candidate.value === regimeOf(values));
  return { id: "accountsRegime", label: siteText("ch.ct600.review-accounts", "The accounts"), value: regime.label };
}

function accountsTextRows(values) {
  const micro = regimeOf(values) === "micro";
  return ACCOUNTS_TEXT_FIELDS.filter((field) => !(micro && field.smallOnly)).map((field) => {
    const typed = String(values[field.id] ?? "").trim();
    return {
      id: field.id,
      label: field.reviewLabel ?? field.label,
      value: typed === "" ? NOT_GIVEN : typed.replaceAll("\n", ", "),
    };
  });
}

// A loan row's label, after "Return 1, " for a period of account longer than 12 months.
function loanRowLabel(returnNumber, label) {
  return returnNumber ? siteText("ch.ct600.return-row-label", "Return {part}, {label}", { part: returnNumber, label }) : label;
}

function loanRows(values, part = 1, returnNumber = 0) {
  if (values[periodFieldId("loansMade", part)] !== "yes") return [];
  const rows = [];
  for (const row of loanRowNumbers(values, part)) {
    const name = String(values[loanId("Name", row, part)] ?? "").trim() || NOT_GIVEN;
    rows.push({
      id: loanId("Name", row, part),
      label: loanRowLabel(returnNumber, siteText("ch.ct600.loan-participator", "Loan {row}: participator", { row })),
      value: name,
    });
    rows.push({
      id: loanId("Amount", row, part),
      label: loanRowLabel(returnNumber, siteText("ch.ct600.loan-amount", "Loan {row}: amount still owed", { row })),
      value: answerText({ id: loanId("Amount", row, part), type: WHOLE }, values),
    });
    if (!isBlank(values[loanId("Lent", row, part)])) {
      rows.push({
        id: loanId("Lent", row, part),
        label: loanRowLabel(returnNumber, siteText("ch.ct600.loan-lent", "Loan {row}: lent on or after the rate change", { row })),
        value: answerText({ id: loanId("Lent", row, part), type: WHOLE }, values),
      });
    }
    if (!isBlank(values[loanId("Rate", row, part)])) {
      rows.push({
        id: loanId("Rate", row, part),
        label: loanRowLabel(returnNumber, siteText("ch.ct600.loan-rate", "Loan {row}: section 455 rate you entered", { row })),
        value: `${String(values[loanId("Rate", row, part)])
          .trim()
          .replace(/%$/, "")}%`,
      });
    }
  }
  if (values[periodFieldId("repaidSince", part)] === "yes") {
    for (const row of repaymentRowNumbers(values, part)) {
      const name = String(values[repaymentId("Name", row, part)] ?? "").trim() || NOT_GIVEN;
      rows.push({
        id: repaymentId("Name", row, part),
        label: loanRowLabel(returnNumber, siteText("ch.ct600.repayment-participator", "Repayment {row}: participator", { row })),
        value: name,
      });
      rows.push({
        id: repaymentId("Date", row, part),
        label: loanRowLabel(returnNumber, siteText("ch.ct600.repayment-date", "Repayment {row}: date", { row })),
        value: String(values[repaymentId("Date", row, part)] || NOT_GIVEN),
      });
      rows.push({
        id: repaymentId("Repaid", row, part),
        label: loanRowLabel(returnNumber, siteText("ch.ct600.repayment-repaid", "Repayment {row}: amount repaid", { row })),
        value: answerText({ id: repaymentId("Repaid", row, part), type: WHOLE }, values),
      });
      rows.push({
        id: repaymentId("Released", row, part),
        label: loanRowLabel(
          returnNumber,
          siteText("ch.ct600.repayment-released", "Repayment {row}: amount released or written off", { row }),
        ),
        value: answerText({ id: repaymentId("Released", row, part), type: WHOLE }, values),
      });
    }
  }
  return rows;
}

function accountsRows(values) {
  if (regimeOf(values) === "micro") return [regimeRow(values), ...microAccountsRows(values), ...accountsTextRows(values)];
  const years =
    values.includeComparatives === true
      ? [
          ["current", THIS_YEAR],
          ["prior", LAST_YEAR],
        ]
      : [["current", THIS_YEAR]];
  const rows = [];
  for (const [prefix, when] of years) {
    rows.push(
      ...amountRows(
        PROFIT_AND_LOSS_FIELDS.map(([field, label]) => ({ id: profitAndLossId(prefix, field), label: yearLabel(label, when) })),
        values,
      ),
      ...amountRows(
        BALANCE_SHEET_FIELDS.map(([field, label]) => ({ id: balanceSheetId(prefix, field), label: yearLabel(label, when) })),
        values,
      ),
    );
  }
  if (values.includeFixedAssetNote === true) {
    for (const [className, title] of FIXED_ASSET_CLASSES) {
      rows.push(
        ...amountRows(
          FIXED_ASSET_FIELDS.map(([field, label]) => ({
            id: noteId(className, field),
            label: siteText("ch.ct600.note-label", "{title}: {label}", { title, label }),
          })),
          values,
        ),
      );
    }
  }
  return [regimeRow(values), ...rows, ...accountsTextRows(values)];
}

/**
 * The review's answers in the form's section order: every typed field and every accounts figure
 * with the element id its Change link opens.
 * @param {Record<string, string|boolean>} values - the form's values
 * @returns {Array<{id: string, title: string, rows: Array<{id: string, label: string, value: string}>}>}
 */
function returnOneLabel(label) {
  return siteText("ch.ct600.return-1-label", "{label} (return 1)", { label });
}

export function reviewAnswers(values) {
  const long = Boolean(longPeriodOf(values));
  return SECTIONS.map(({ id, title }) => {
    const rows = CT600_FORM_FIELDS.filter((field) => field.section === id).flatMap((field) => {
      if (!long || !isPerPeriodField(field.id)) {
        const label = long && field.id === "donations" ? LONG_PERIOD_DONATIONS_LABEL : field.label;
        return [{ id: field.id, label, value: answerText(field, values) }];
      }
      const second = secondPeriodField(field);
      return [
        { id: field.id, label: returnOneLabel(field.label), value: answerText(field, values) },
        { id: second.id, label: second.label, value: answerText(second, values) },
      ];
    });
    if (long && id === "period") {
      rows.push({
        id: FIRST_PERIOD_START_FIELD,
        label: siteText("ch.ct600.first-period-start-question", "Does the first accounting period start on {start}?", {
          start: values.periodStart,
        }),
        value: values[FIRST_PERIOD_START_FIELD] === "no" ? NO : YES,
      });
    }
    if (long && id === "reliefs") {
      for (const field of [DONATIONS_PAID_FIELD, secondPeriodField(DONATIONS_PAID_FIELD)]) {
        const part = field.id === DONATIONS_PAID_FIELD.id ? 1 : 2;
        rows.push({ id: field.id, label: part === 1 ? returnOneLabel(field.label) : field.label, value: answerText(field, values) });
      }
    }
    if (id === "accounts") rows.push(...accountsRows(values));
    if (id === "loans") {
      if (long) rows.push(...loanRows(values, 1, 1), ...loanRows(values, 2, 2));
      else rows.push(...loanRows(values));
    }
    if (id === "declaration") {
      rows.push(
        ...statementFieldsFor(values).map((statement) => ({
          id: statement.id,
          label: statement.label,
          value: answerText({ id: statement.id, type: "checkbox" }, values),
        })),
      );
    }
    return { id, title, rows };
  });
}
