// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/ct600-fields.js
// The CT600 entry form as data: one row per box the figures model can emit (label, whether the
// customer types it or the page works it out, the rule, the Company Tax Return guide anchor),
// the typed fields that feed those boxes, the accounts section's fields, and the pure functions
// that read the form's values into the figures model and check what the model does not.
// The form, the review and the help read this one table, so a box has one label everywhere.

export const COMPANY_TAX_RETURN_GUIDE_URL = "https://www.gov.uk/guidance/the-company-tax-return-guide";
export const COMPUTATIONS_GUIDE_ANCHOR = "and-90-accounts-and-computations";

// HMRC's own box names from the CT600 (2026) Version 3 form and the Company Tax Return guide.
export const CT600_BOX_ROWS = [
  { box: 1, label: "Company name", kind: "worked", section: "company", rule: "The company lookup gives the name", anchor: "company-name" },
  {
    box: 2,
    label: "Company registration number",
    kind: "worked",
    section: "company",
    rule: "The company lookup gives the number",
    anchor: "company-registration-number",
  },
  { box: 3, label: "Tax reference (Unique Taxpayer Reference)", kind: "typed", section: "company", field: "utr", anchor: "tax-reference" },
  { box: 4, label: "Type of company", kind: "typed", section: "company", field: "companyType", anchor: "type-of-company" },
  {
    box: 30,
    label: "Start of the period covered by the return",
    kind: "typed",
    section: "period",
    field: "periodStart",
    anchor: "and-35-period-of-the-return",
  },
  {
    box: 35,
    label: "End of the period covered by the return",
    kind: "typed",
    section: "period",
    field: "periodEnd",
    anchor: "and-35-period-of-the-return",
  },
  {
    box: 145,
    label: "Total turnover from trade",
    kind: "worked",
    section: "accounts",
    rule: "Box 145 is the turnover in the profit and loss account",
    anchor: "turnover",
  },
  {
    box: 155,
    label: "Trading profits",
    kind: "worked",
    section: "tax",
    rule: "Box 155 equals the computation's adjusted profit",
    anchor: "trading-profits",
  },
  {
    box: 160,
    label: "Trading losses brought forward set against trading profits",
    kind: "typed",
    section: "reliefs",
    field: "lossesBroughtForward",
    anchor: "trading-losses-brought-forward-set-against-trading-profits",
  },
  {
    box: 275,
    label: "Trading losses of this or a later accounting period",
    kind: "typed",
    section: "reliefs",
    field: "lossAgainstTotalProfits",
    anchor: "trading-losses-of-this-or-a-later-accounting-period",
  },
  {
    box: 285,
    label: "Trading losses carried forward and claimed against total profits",
    kind: "typed",
    section: "reliefs",
    field: "lossesBroughtForwardAgainstTotalProfits",
    anchor: "trading-losses-carried-forward-and-claimed-against-total-profits",
  },
  {
    box: 295,
    label: "Total of deductions and reliefs",
    kind: "worked",
    section: "tax",
    rule: "Box 295 is boxes 275 and 285",
    anchor: "total-of-deductions-and-reliefs",
  },
  {
    box: 305,
    label: "Qualifying donations",
    kind: "worked",
    section: "tax",
    rule: "The donations added back are claimed here, up to the profits in box 300",
    anchor: "qualifying-donations",
  },
  {
    box: 780,
    label: "Losses of trades carried on wholly or partly in the UK: amount arising",
    kind: "worked",
    section: "tax",
    rule: "Box 780 is the computation's adjusted loss",
    anchor: "and-790-losses-of-trades",
  },
  {
    box: 790,
    label: "Losses of trades carried on wholly outside the UK: amount arising",
    kind: "worked",
    section: "tax",
    rule: "Box 790 is the computation's adjusted loss",
    anchor: "and-790-losses-of-trades",
  },
  {
    box: 165,
    label: "Net trading profits",
    kind: "worked",
    section: "tax",
    rule: "Box 165 is box 155 less box 160",
    anchor: "net-trading-profits",
  },
  {
    box: 170,
    label: "Bank, building society or other interest, and profits from non-trading loan relationships",
    kind: "typed",
    section: "computation",
    field: "nonTradingLoanRelationshipCredits",
    anchor: "and-172-bank-building-society-or-other-interest-and-profits-from-non-trading-loan-relationships",
  },
  {
    box: 235,
    label: "Profits before other deductions and reliefs",
    kind: "worked",
    section: "tax",
    rule: "Box 235 is box 165 plus box 170",
    anchor: "profits-before-other-deductions-and-reliefs-1",
  },
  {
    box: 300,
    label: "Profits before qualifying donations and group relief",
    kind: "worked",
    section: "tax",
    rule: "Box 300 is box 235 less box 295",
    anchor: "profits-before-qualifying-donations-and-group-relief",
  },
  {
    box: 315,
    label: "Profits chargeable to Corporation Tax",
    kind: "worked",
    section: "tax",
    rule: "Box 315 is box 300 less box 305",
    anchor: "profits-chargeable-to-corporation-tax",
  },
  {
    box: 326,
    label: "Number of associated companies in this period",
    kind: "typed",
    section: "company",
    field: "associatedCompanies",
    anchor: "number-of-associated-companies-in-this-period",
  },
  {
    box: 327,
    label: "Number of associated companies in the first financial year",
    kind: "typed",
    section: "company",
    field: "associatedCompanies",
    anchor: "and-328-number-of-associated-companies-in-the-first-and-second-financial-years",
  },
  {
    box: 328,
    label: "Number of associated companies in the second financial year",
    kind: "typed",
    section: "company",
    field: "associatedCompanies",
    anchor: "and-328-number-of-associated-companies-in-the-first-and-second-financial-years",
  },
  {
    box: 329,
    label: "Small profit rate or marginal relief entitlement",
    kind: "worked",
    section: "tax",
    rule: "Box 329 is X when a share meets the small profits rate or marginal relief",
    anchor: "small-profit-rate-or-marginal-relief-entitlement",
  },
  {
    box: 330,
    label: "Financial year of the first tax rate",
    kind: "worked",
    section: "tax",
    rule: "Rule 9198: the profit is split between financial years by days",
    anchor: "boxes-330-to-425",
  },
  {
    box: 335,
    label: "Amount of profit chargeable at the first rate",
    kind: "worked",
    section: "tax",
    rule: "Rule 9198: the profit is split between financial years by days",
    anchor: "boxes-330-to-425",
  },
  {
    box: 340,
    label: "First rate of tax",
    kind: "worked",
    section: "tax",
    rule: "Rule 9204: each share is charged at its year's rate",
    anchor: "boxes-330-to-425",
  },
  {
    box: 345,
    label: "Tax at the first rate",
    kind: "worked",
    section: "tax",
    rule: "Rules 9204 and 9213: each share is charged at its year's rate, to the penny",
    anchor: "boxes-330-to-425",
  },
  {
    box: 380,
    label: "Financial year of the second tax rate",
    kind: "worked",
    section: "tax",
    rule: "Rule 9198: the profit is split between financial years by days",
    anchor: "boxes-330-to-425",
  },
  {
    box: 385,
    label: "Amount of profit chargeable at the second rate",
    kind: "worked",
    section: "tax",
    rule: "Rule 9198: the profit is split between financial years by days",
    anchor: "boxes-330-to-425",
  },
  {
    box: 390,
    label: "Second rate of tax",
    kind: "worked",
    section: "tax",
    rule: "Rule 9204: each share is charged at its year's rate",
    anchor: "boxes-330-to-425",
  },
  {
    box: 395,
    label: "Tax at the second rate",
    kind: "worked",
    section: "tax",
    rule: "Rules 9204 and 9213: each share is charged at its year's rate, to the penny",
    anchor: "boxes-330-to-425",
  },
  {
    box: 430,
    label: "Corporation Tax",
    kind: "worked",
    section: "tax",
    rule: "Box 430 is box 345 plus box 395",
    anchor: "corporation-tax",
  },
  {
    box: 435,
    label: "Marginal relief",
    kind: "worked",
    section: "tax",
    rule: "Box 435 is marginal relief on box 315, after associated companies and box 620",
    anchor: "marginal-relief",
  },
  {
    box: 440,
    label: "Corporation Tax chargeable",
    kind: "worked",
    section: "tax",
    rule: "Box 440 is box 430 less box 435",
    anchor: "corporation-tax-chargeable",
  },
  {
    box: 475,
    label: "Net Corporation Tax liability",
    kind: "worked",
    section: "tax",
    rule: "Box 475 is box 430 less box 435",
    anchor: "net-corporation-tax-liability",
  },
  { box: 510, label: "Tax chargeable", kind: "worked", section: "tax", rule: "Box 510 is box 430 less box 435", anchor: "tax-chargeable" },
  {
    box: 515,
    label: "Income Tax deducted from gross income included in profits",
    kind: "typed",
    section: "reliefs",
    field: "incomeTaxDeducted",
    anchor: "income-tax-deducted-from-gross-income-included-in-profits",
  },
  {
    box: 525,
    label: "Self-assessment of tax payable before restitution tax and coronavirus support scheme overpayments",
    kind: "worked",
    section: "tax",
    rule: "Box 525 is box 440 less box 515",
    anchor: "self-assessment-of-tax-payable-before-restitution-tax-and-coronavirus-support-scheme-overpayments",
  },
  {
    box: 528,
    label: "Self-assessment of tax payable",
    kind: "worked",
    section: "tax",
    rule: "Box 528 is box 440 less box 515",
    anchor: "self-assessment-of-tax-payable",
  },
  {
    box: 595,
    label: "Tax already paid (and not already repaid)",
    kind: "typed",
    section: "payments",
    field: "taxAlreadyPaid",
    anchor: "tax-already-paid-and-not-already-repaid",
  },
  {
    box: 600,
    label: "Tax outstanding",
    kind: "worked",
    section: "tax",
    rule: "Box 600 is box 525 less box 595",
    anchor: "tax-outstanding",
  },
  {
    box: 620,
    label: "Franked investment income or exempt ABGH distributions",
    kind: "typed",
    section: "reliefs",
    field: "frankedInvestmentIncome",
    anchor: "franked-investment-income-or-exempt-abgh-distributions",
  },
  {
    box: 690,
    label: "Annual investment allowance",
    kind: "typed",
    section: "allowances",
    field: "annualInvestmentAllowance",
    anchor: "annual-investment-allowance",
  },
  {
    box: 705,
    label: "Machinery and plant, main pool: allowances",
    kind: "typed",
    section: "allowances",
    field: "mainPoolAllowances",
    rule: "Box 705 includes the annual investment allowance in box 690",
    anchor: "and-710-machinery-and-plant--main-pool",
  },
  {
    box: 710,
    label: "Machinery and plant, main pool: balancing charges",
    kind: "typed",
    section: "allowances",
    field: "mainPoolBalancingCharges",
    anchor: "and-710-machinery-and-plant--main-pool",
  },
  {
    box: 975,
    label: "Name of the person signing the declaration",
    kind: "typed",
    section: "declaration",
    field: "declarantName",
    anchor: "declaration",
  },
  {
    box: 985,
    label: "Status of the person signing the declaration",
    kind: "typed",
    section: "declaration",
    field: "declarantStatus",
    anchor: "declaration",
  },
];

export function boxRow(box) {
  return CT600_BOX_ROWS.find((row) => row.box === Number(box));
}

export function guideUrl(anchor) {
  return `${COMPANY_TAX_RETURN_GUIDE_URL}#${anchor}`;
}

// Boxes the review shows as typed or coded text; every other box is an amount in pounds.
export const TEXT_BOXES = new Set([1, 2, 3, 4, 30, 35, 326, 327, 328, 329, 330, 340, 380, 390, 975, 985]);

export const SECTIONS = [
  { id: "company", title: "Company" },
  { id: "period", title: "Period" },
  { id: "accounts", title: "Accounts" },
  { id: "computation", title: "Computation" },
  { id: "allowances", title: "Capital allowances" },
  { id: "reliefs", title: "Income and reliefs" },
  { id: "payments", title: "Payments" },
  { id: "loans", title: "Loans" },
  { id: "declaration", title: "Declaration" },
];

const MONEY_HINT = "For example, £600 or £1,200";
const WHOLE = "whole-pounds";

function boxLabel(box) {
  return `Box ${box}: ${boxRow(box).label}`;
}

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
    hint: "The 10 digits on the company's HMRC Corporation Tax letters.",
    inputmode: "numeric",
    maxlength: 10,
  },
  {
    id: "companyType",
    section: "company",
    figure: "companyType",
    box: 4,
    type: "choice",
    label: "Is the company one of the types listed for box 4?",
    hint: "Box 4 lists co-operatives, community amateur sports clubs, housing associations and similar types. Most companies answer No.",
    focus: "companyTypeNo",
  },
  {
    id: "associatedCompanies",
    section: "company",
    figure: "associatedCompanies",
    box: 326,
    type: "count",
    label: "Box 326: Number of associated companies in this period",
    hint: "Companies under common control with this one. Enter 0 for none. A period that straddles 1 April files the same number in boxes 327 and 328.",
    default: "0",
  },
  {
    id: "period",
    section: "period",
    figure: "period",
    figureKeys: ["periodStart", "periodEnd"],
    box: 30,
    type: "dates",
    label: "Period of account",
    hint: "The accounts, the return and the computations all cover this one period. It starts on or after 1 April 2015, lasts no more than 12 months and ends before today.",
    focus: "periodStart",
  },
  {
    id: "tradeName",
    section: "computation",
    figure: "tradeName",
    type: "text",
    label: "Trade name",
    hint: "The name of the trade, shown in the computations. It starts as the principal activity.",
  },
  {
    id: "nonTradingLoanRelationshipCredits",
    section: "computation",
    figure: "nonTradingLoanRelationshipCredits",
    box: 170,
    type: WHOLE,
    label: boxLabel(170),
    hint: `${MONEY_HINT}. It starts as the accounts' interest receivable.`,
    default: "0",
  },
  {
    id: "depreciation",
    section: "computation",
    figure: "depreciation",
    type: WHOLE,
    label: "Depreciation added back",
    hint: `${MONEY_HINT}. It starts as the note's charge for the year, when a note is given.`,
    default: "0",
  },
  {
    id: "amortisation",
    section: "computation",
    figure: "amortisation",
    type: WHOLE,
    label: "Amortisation added back",
    hint: MONEY_HINT,
    default: "0",
  },
  {
    id: "entertaining",
    section: "computation",
    figure: "entertaining",
    type: WHOLE,
    label: "Entertaining added back",
    hint: `${MONEY_HINT}. No more than the cost of sales plus administrative expenses.`,
    default: "0",
  },
  {
    id: "donations",
    section: "computation",
    figure: "donations",
    box: 305,
    type: WHOLE,
    label: "Box 305: Donations added back and claimed",
    hint: `${MONEY_HINT}. Qualifying donations to charity. They are added back to the trading profit and claimed against total profits. No more than the cost of sales plus administrative expenses.`,
    default: "0",
  },
  {
    id: "annualInvestmentAllowance",
    section: "allowances",
    figure: "annualInvestmentAllowance",
    box: 690,
    type: WHOLE,
    label: boxLabel(690),
    hint: MONEY_HINT,
    default: "0",
  },
  {
    id: "mainPoolAllowances",
    section: "allowances",
    figure: "mainPoolAllowances",
    box: 705,
    type: WHOLE,
    label: "Box 705: Main pool writing down and balancing allowances",
    hint: `${MONEY_HINT}. Leave out the annual investment allowance: box 705 includes it.`,
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
    id: "lossesBroughtForward",
    section: "reliefs",
    figure: "lossesBroughtForward",
    box: 160,
    type: WHOLE,
    label: "Box 160: Trading losses brought forward",
    hint: `${MONEY_HINT}. The losses available. The trading profit takes as much as it can in box 160 and the rest is carried forward.`,
    default: "0",
  },
  {
    id: "lossAgainstTotalProfits",
    section: "reliefs",
    figure: "lossAgainstTotalProfits",
    box: 275,
    type: WHOLE,
    label: boxLabel(275),
    hint: `${MONEY_HINT}. A trading loss of this period set against this period's other profits, such as bank interest. Leave at 0 to carry the whole loss forward.`,
    default: "0",
  },
  {
    id: "lossesBroughtForwardAgainstTotalProfits",
    section: "reliefs",
    figure: "lossesBroughtForwardAgainstTotalProfits",
    box: 285,
    type: WHOLE,
    label: boxLabel(285),
    hint: `${MONEY_HINT}. Losses brought forward that the trading profit did not take, claimed against the period's other profits.`,
    default: "0",
  },
  {
    id: "lossCarriedBack",
    section: "reliefs",
    figure: "lossCarriedBack",
    type: WHOLE,
    label: "Trading loss carried back to the previous period",
    hint: `${MONEY_HINT}. A claim against the profits of the 12 months before this period. It gives a repayment of Corporation Tax shown with the tax worked out. Leave at 0 to carry the loss forward.`,
    default: "0",
  },
  {
    id: "priorPeriodChargeableProfits",
    section: "reliefs",
    figure: "priorPeriodChargeableProfits",
    type: WHOLE,
    label: "Previous period's chargeable profits (box 315 of its return)",
    hint: `${MONEY_HINT}. Needed only for a carry-back claim.`,
    default: "0",
  },
  {
    id: "lossOutsideUk",
    section: "reliefs",
    figure: "lossOutsideUk",
    type: "checkbox",
    label: "The trade is carried on wholly outside the UK (a loss goes in box 790, not box 780)",
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
    hint: "For example, £600 or £193.54. No more than the Corporation Tax in box 440.",
    default: "0",
  },
  {
    id: "taxAlreadyPaid",
    section: "payments",
    figure: "taxAlreadyPaid",
    box: 595,
    type: "pounds-and-pence",
    label: boxLabel(595),
    hint: "For example, £600 or £193.54. No more than the tax payable in box 525.",
    default: "0",
  },
  {
    id: "ownCorporationTax",
    section: "payments",
    figure: "ownCorporationTax",
    type: "pounds-and-pence",
    label: "Corporation Tax per your own working (optional)",
    hint: "A check only. If it differs from box 440 by more than £5, the review stops and names both figures.",
    optional: true,
  },
  {
    id: "loanOverdrawn",
    section: "loans",
    figure: "loanOverdrawn",
    type: "choice",
    label: "Was a director's loan account overdrawn at the end of the period?",
    focus: "loanOverdrawnNo",
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
    label:
      "I declare that the information in this return and the attached accounts and computations is correct and complete to the best of my knowledge and belief.",
  },
];

export const STATEMENT_FIELDS = [
  {
    id: "statementSection477Exemption",
    label: "The company is entitled to exemption from audit under section 477 of the Companies Act 2006 relating to small companies.",
  },
  {
    id: "statementMembersNotRequiredAudit",
    label: "The members have not required the company to obtain an audit for the year in question.",
  },
  {
    id: "statementDirectorsResponsibilities",
    label:
      "The directors acknowledge their responsibilities for complying with the requirements of the Companies Act 2006 with respect to accounting records and the preparation of accounts.",
  },
  {
    id: "statementSmallCompaniesRegime",
    label:
      "These accounts have been prepared in accordance with the provisions applicable to companies subject to the small companies regime.",
  },
];

// The fourth statement of a micro-entity's accounts, in place of the small companies regime statement.
export const MICRO_STATEMENT_FIELD = {
  id: "statementMicroEntityProvisions",
  label:
    "These accounts have been prepared in accordance with the provisions applicable to companies subject to the small companies regime and in accordance with the provisions available to micro-entities.",
};

// The two sets of accounts the return can carry: FRS 102 section 1A small company accounts, or
// FRS 105 micro-entity accounts with the profit and loss account HMRC takes with the return.
export const ACCOUNTS_REGIMES = [
  { value: "small", id: "regimeSmall", label: "Small company accounts (FRS 102 section 1A)" },
  { value: "micro", id: "regimeMicro", label: "Micro-entity accounts (FRS 105)" },
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
  ["turnover", "Turnover"],
  ["otherIncome", "Other income"],
  ["rawMaterials", "Raw materials and consumables"],
  ["staffCosts", "Staff costs"],
  ["depreciation", "Depreciation and other amounts written off assets"],
  ["otherCharges", "Other charges"],
  ["tax", "Tax"],
];

export const MICRO_BALANCE_SHEET_FIELDS = [
  ["fixedAssets", "Fixed assets"],
  ["currentAssets", "Current assets"],
  ["creditorsWithinOneYear", "Creditors: amounts falling due within one year"],
  ["creditorsAfterOneYear", "Creditors: amounts falling due after more than one year"],
  ["calledUpShareCapital", "Called up share capital"],
  ["profitAndLossAccount", "Profit and loss account reserve"],
];

export function microId(year, field) {
  return `micro${upperFirst(year)}${upperFirst(field)}`;
}

// The accounts section. Ids are `current<Field>`, `prior<Field>` and `note<Class><Field>`.
export const PROFIT_AND_LOSS_FIELDS = [
  ["turnover", "Turnover"],
  ["costOfSales", "Cost of sales"],
  ["administrativeExpenses", "Administrative expenses"],
  ["interestReceivable", "Interest receivable and similar income"],
  ["tax", "Tax on profit on ordinary activities"],
];

export const BALANCE_SHEET_FIELDS = [
  ["fixedAssets", "Fixed assets"],
  ["stocks", "Stocks"],
  ["debtors", "Debtors"],
  ["cashAtBank", "Cash at bank and in hand"],
  ["bankLoansOverdrafts", "Bank loans and overdrafts (due within one year)"],
  ["tradeCreditors", "Trade creditors (due within one year)"],
  ["corporationTax", "Corporation tax (due within one year)"],
  ["taxationSocialSecurity", "Taxation and social security (due within one year)"],
  ["otherCreditors", "Other creditors (due within one year)"],
  ["creditorsAfterOneYear", "Creditors: amounts falling due after more than one year"],
  ["bankLoansAfterOneYear", "Of which, bank loans"],
  ["calledUpShareCapital", "Called up share capital"],
  ["profitAndLossAccount", "Profit and loss account reserve"],
];

export const FIXED_ASSET_CLASSES = [
  ["landBuildings", "Land and buildings"],
  ["plantMachinery", "Plant and machinery"],
  ["furnitureFittings", "Fixtures and fittings"],
  ["computerEquipment", "Computer equipment"],
  ["motorVehicles", "Motor vehicles"],
];

export const FIXED_ASSET_FIELDS = [
  ["costAtStart", "Cost at the start of the period"],
  ["additions", "Additions"],
  ["disposals", "Disposals (cost)"],
  ["depreciationAtStart", "Depreciation at the start of the period"],
  ["depreciationCharge", "Depreciation charge for the period"],
  ["depreciationOnDisposals", "Depreciation on disposals"],
];

export const ACCOUNTS_TEXT_FIELDS = [
  { id: "principalActivity", label: "Principal activity", type: "text", smallOnly: true },
  { id: "accountingPolicies", label: "Accounting policies", type: "textarea", smallOnly: true },
  { id: "directors", label: "Directors who held office during the period (one name per line)", type: "textarea", smallOnly: true },
  { id: "averageEmployees", label: "Average number of employees during the period", type: "count" },
  { id: "directorName", label: "Director approving the accounts", type: "text" },
  { id: "directorDateApproved", label: "Date approved", type: "date" },
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
  return figures;
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
        currentYear: balanceSheetOf(values, "current"),
        ...(includePrior ? { priorYear: balanceSheetOf(values, "prior") } : {}),
      },
      profitAndLoss: {
        currentYear: profitAndLossOf(values, "current"),
        ...(includePrior ? { priorYear: profitAndLossOf(values, "prior") } : {}),
      },
      ...(note ? { fixedAssetNote: note } : {}),
    },
  };
}

/**
 * The figures model from the form's values. The company's name and number come from the lookup.
 * @param {Record<string, string|boolean>} values
 * @param {{companyName: string, companyNumber: string}} company
 * @param {object} [workingSheet] - the book's own trading profit and Corporation Tax, when a book filled the form
 */
export function figuresFromValues(values, company, workingSheet) {
  const accounts = accountsFromValues(values);
  const profitAndLoss = accounts.smallCompany?.profitAndLoss ?? accounts.profitAndLoss;
  const figures = {
    companyName: company.companyName,
    companyNumber: company.companyNumber,
    utr: String(values.utr ?? "").trim(),
    companyType: values.companyType === "yes" ? 1 : 0,
    associatedCompanies: isBlank(values.associatedCompanies) ? 0 : Number(String(values.associatedCompanies).trim()),
    periodStart: values.periodStart,
    periodEnd: values.periodEnd,
    profitAndLoss: profitAndLoss.priorYear
      ? { current: profitAndLoss.currentYear, prior: profitAndLoss.priorYear }
      : { current: profitAndLoss.currentYear },
    declarantName: String(values.declarantName ?? "").trim(),
    declarantStatus: String(values.declarantStatus ?? "").trim(),
  };
  for (const field of CT600_FORM_FIELDS) {
    if (field.type === WHOLE) figures[field.figure] = amountOf(values, field.id, true);
    if (field.type === "pounds-and-pence" && !field.optional) figures[field.figure] = amountOf(values, field.id, false);
  }
  if (values.lossOutsideUk === true) figures.lossOutsideUk = true;
  if (!isBlank(values.ownCorporationTax)) figures.ownCorporationTax = amountOf(values, "ownCorporationTax", false);
  if (workingSheet) figures.workingSheet = workingSheet;
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
    "loanOverdrawn",
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
    directorsLoanOverdrawn: false,
    declarationAccepted: values.declarationAccepted === true,
  };
}

// --- Checks the model does not run ---------------------------------------------------------

const AMOUNT_PROBLEM = "Enter an amount in pounds, like £600 or £1,200";

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
  for (const { id, label, type } of CT600_FORM_FIELDS) {
    if ((type !== WHOLE && type !== "pounds-and-pence") || isBlank(values[id])) continue;
    if (parsePounds(values[id], type === WHOLE) === null) {
      problem(id, `${label}: ${type === WHOLE ? AMOUNT_PROBLEM : "Enter an amount in pounds and pence, like £600 or £193.54"}`);
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
  for (const [year, when] of [
    ["current", "this"],
    ["prior", "last"],
  ]) {
    const sheet = microBalanceSheetOf(values, year);
    if (!Object.values(sheet).every(Number.isFinite)) continue;
    if (microNetAssetsOf(sheet) !== sheet.capitalAndReserves) {
      problem(
        microId(year, "profitAndLossAccount"),
        `The balance sheet for ${when} year does not balance: net assets ${microNetAssetsOf(sheet)}, share capital plus the profit and loss reserve ${sheet.capitalAndReserves}`,
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
        `The ${year} year's balance sheet does not balance: net assets ${netAssetsOf(sheet)}, share capital plus the profit and loss reserve ${sheet.capitalAndReserves}`,
      );
    }
  }
}

function fixedAssetNoteProblems(values, problem) {
  if (values.includeFixedAssetNote !== true) return;
  const note = fixedAssetNoteOf(values);
  const fixedAssets = amountOf(values, "currentFixedAssets", true);
  if (!Object.values(note).flatMap(Object.values).every(Number.isFinite) || !Number.isFinite(fixedAssets)) return;
  if (netBookValueOf(note) !== fixedAssets) {
    problem("includeFixedAssetNote", `The note's net book value ${netBookValueOf(note)} does not equal the fixed assets ${fixedAssets}`);
  }
  const charge = depreciationChargeOf(note);
  if (amountOf(values, "depreciation", true) !== charge) {
    problem("depreciation", `Depreciation added back must equal the note's charge for the year, ${charge}`);
  }
}

const SMALL_ONLY_TEXT = new Set(ACCOUNTS_TEXT_FIELDS.filter((field) => field.smallOnly).map((field) => field.id));

const REQUIRED_TEXT = [
  ["principalActivity", "the principal activity"],
  ["accountingPolicies", "the accounting policies"],
  ["directors", "the directors"],
  ["directorName", "the director approving the accounts"],
];

function answerProblems(values, problem) {
  const micro = regimeOf(values) === "micro";
  const turnoverId = micro ? microId("current", "turnover") : "currentTurnover";
  if (isBlank(values[turnoverId])) problem(turnoverId, "Enter the turnover from the profit and loss account");
  if (String(values.tradeName ?? "").trim().length < 2) problem("tradeName", "Enter the trade name (at least 2 characters)");
  if (values.loanOverdrawn === "yes") {
    problem(
      "loanOverdrawn",
      "A director's loan account overdrawn at the end of the period needs supplementary page CT600A, which this service does not file. This return cannot be filed here.",
      true,
    );
  }
  for (const [required, label] of REQUIRED_TEXT) {
    if (micro && SMALL_ONLY_TEXT.has(required)) continue;
    if (isBlank(values[required])) problem(required, `Enter ${label}`);
  }
  if (!/^\d+$/.test(String(values.averageEmployees ?? "").trim())) {
    problem("averageEmployees", "Enter the average number of employees as a whole number");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(values.directorDateApproved ?? ""))) {
    problem("directorDateApproved", "Enter the date the accounts were approved");
  }
  const unaccepted = statementFieldsFor(values).find(({ id }) => values[id] !== true);
  if (unaccepted) problem(unaccepted.id, "Accept all four statements before you preview the return");
  if (values.declarationAccepted !== true) problem("declarationAccepted", "Accept the declaration before you preview the return");
}

/**
 * The checks on the form's own answers: the accounts, the signing and the questions the model
 * does not ask. A refusal is an answer this service cannot file.
 * @param {Record<string, string|boolean>} values
 * @returns {Array<{target: string, message: string, refusal: boolean}>}
 */
export function formProblems(values) {
  const problems = [];
  const problem = (target, message, refusal = false) => problems.push({ target, message, refusal });
  amountProblems(values, problem);
  if (regimeOf(values) === "micro") {
    microBalanceSheetProblems(values, problem);
  } else {
    balanceSheetProblems(values, problem);
    fixedAssetNoteProblems(values, problem);
  }
  answerProblems(values, problem);
  return problems;
}

// Where each of the model's problems shows. A key the form has no field for shows at the worked tax.
const MODEL_TARGETS = { period: "period", profitAndLoss: "workedTax", corporationTax: "workedTax", figures: "workedTax" };

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
  if (accounts.averageEmployees !== undefined) entries.push(["averageEmployees", text(accounts.averageEmployees)]);
  if (accounts.director?.name) entries.push(["directorName", accounts.director.name]);
  if (accounts.director?.dateApproved) entries.push(["directorDateApproved", accounts.director.dateApproved]);
  return entries;
}

/**
 * The accounts section's values from accounts a filing took (the accounts just accepted by
 * Companies House), as [element id, value] pairs.
 */
export function accountsFormEntries(accounts) {
  return accountsEntries(accounts);
}

/**
 * Every form value a book supplies, as [element id, value] pairs: the figures the model reads
 * from the book, the accounts, the trade name and the signer. The company's UTR and the
 * statements and declaration stay the customer's to give.
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
      director: { name: accounts.directorName, dateApproved: accounts.periodEnd },
      smallCompany: {
        principalActivity: accounts.tradeName,
        accountingPolicies: "The accounts are prepared under FRS 102 section 1A.",
        directors: accounts.directors?.length ? accounts.directors : [accounts.directorName].filter(Boolean),
        balanceSheet: accounts.balanceSheet,
        profitAndLoss: { currentYear: accounts.profitAndLoss.currentYear },
        fixedAssetNote: Object.keys(accounts.fixedAssetNote ?? {}).length > 0 ? accounts.fixedAssetNote : undefined,
      },
    }),
  );
  if (accounts.directorName) entries.push(["declarantName", accounts.directorName]);
  if (microAccounts) entries.push(...microEntries(figures, accounts, microAccounts));
  return entries;
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
  for (const [id, value] of entries) {
    const element = document.getElementById(id);
    if (!element) continue;
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

export const BOX_SOURCE_FIELD = {
  3: "utr",
  4: "companyType",
  30: "period",
  35: "period",
  145: TURNOVER_FIELD,
  155: TURNOVER_FIELD,
  160: "lossesBroughtForward",
  165: TURNOVER_FIELD,
  170: "nonTradingLoanRelationshipCredits",
  235: TURNOVER_FIELD,
  275: "lossAgainstTotalProfits",
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
  510: "period",
  515: "incomeTaxDeducted",
  525: "incomeTaxDeducted",
  528: "incomeTaxDeducted",
  595: "taxAlreadyPaid",
  600: "taxAlreadyPaid",
  620: "frankedInvestmentIncome",
  690: "annualInvestmentAllowance",
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
  adjustedProfitBeforeCapitalAllowances: TURNOVER_FIELD,
  totalCapitalAllowances: "annualInvestmentAllowance",
  adjustedProfit: TURNOVER_FIELD,
};

const NOT_GIVEN = "Not given";

function answerText(field, values) {
  if (field.type === "dates") return values.periodStart || values.periodEnd ? `${values.periodStart} to ${values.periodEnd}` : NOT_GIVEN;
  if (field.type === "choice") return values[field.id] === "yes" ? "Yes" : "No";
  if (field.type === "checkbox") return values[field.id] === true ? "Yes" : "No";
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
    const when = year === "current" ? "this year" : "last year";
    rows.push(
      ...amountRows(
        MICRO_PROFIT_AND_LOSS_FIELDS.map(([field, label]) => ({ id: microId(year, field), label: `${label}, ${when}` })),
        values,
      ),
    );
  }
  for (const year of ["current", "prior"]) {
    const when = year === "current" ? "this year" : "last year";
    rows.push(
      ...amountRows(
        MICRO_BALANCE_SHEET_FIELDS.map(([field, label]) => ({ id: microId(year, field), label: `${label}, ${when}` })),
        values,
      ),
    );
  }
  return rows;
}

function regimeRow(values) {
  const regime = ACCOUNTS_REGIMES.find((candidate) => candidate.value === regimeOf(values));
  return { id: "accountsRegime", label: "The accounts", value: regime.label };
}

function accountsTextRows(values) {
  const micro = regimeOf(values) === "micro";
  return ACCOUNTS_TEXT_FIELDS.filter((field) => !(micro && field.smallOnly)).map((field) => {
    const typed = String(values[field.id] ?? "").trim();
    return {
      id: field.id,
      label: field.label.replace(/ \(one name per line\)$/, ""),
      value: typed === "" ? NOT_GIVEN : typed.replaceAll("\n", ", "),
    };
  });
}

function accountsRows(values) {
  if (regimeOf(values) === "micro") return [regimeRow(values), ...microAccountsRows(values), ...accountsTextRows(values)];
  const years =
    values.includeComparatives === true
      ? [
          ["current", "this year"],
          ["prior", "last year"],
        ]
      : [["current", "this year"]];
  const rows = [];
  for (const [prefix, when] of years) {
    rows.push(
      ...amountRows(
        PROFIT_AND_LOSS_FIELDS.map(([field, label]) => ({ id: profitAndLossId(prefix, field), label: `${label}, ${when}` })),
        values,
      ),
      ...amountRows(
        BALANCE_SHEET_FIELDS.map(([field, label]) => ({ id: balanceSheetId(prefix, field), label: `${label}, ${when}` })),
        values,
      ),
    );
  }
  if (values.includeFixedAssetNote === true) {
    for (const [className, title] of FIXED_ASSET_CLASSES) {
      rows.push(
        ...amountRows(
          FIXED_ASSET_FIELDS.map(([field, label]) => ({ id: noteId(className, field), label: `${title}: ${label}` })),
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
export function reviewAnswers(values) {
  return SECTIONS.map(({ id, title }) => {
    const rows = CT600_FORM_FIELDS.filter((field) => field.section === id).map((field) => ({
      id: field.id,
      label: field.label,
      value: answerText(field, values),
    }));
    if (id === "accounts") rows.push(...accountsRows(values));
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
