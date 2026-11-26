// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/accounts-page-lines.js
// The lines of the micro-entity and small company accounts pages, each with its register entry. A
// line the CT600 also has takes its entry from ct600-fields.js; the lines only these pages have are
// defined here from the formats of Schedule 1 to the Small Companies Regulations. It imports nothing
// but ct600-fields.js, so ct600-source-cells.js can read the lines' cells and accounts-line-detail.js
// can render them without either importing the other.

import { BALANCE_SHEET_FIELDS, MICRO_BALANCE_SHEET_FIELDS, PROFIT_AND_LOSS_FIELDS, REGULATIONS_URL, sheetCell } from "./ct600-fields.js";

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

const byId = (fields) => Object.fromEntries(fields.map((field) => [field.id, field]));

function line(id, label, hint, reference, source) {
  return { id, label, hint, reference, termSource: REGULATIONS_URL, ...(source ? { source } : {}) };
}

export const MICRO_PAGE_LINES = {
  ...byId(MICRO_BALANCE_SHEET_FIELDS),
  calledUpShareCapitalNotPaid: line(
    "calledUpShareCapitalNotPaid",
    siteText("accounts-line.called-up-share-capital-not-paid", "Called up share capital not paid"),
    siteText(
      "accounts-line.called-up-share-capital-not-paid-hint",
      "Share capital the company has called up and the members have not yet paid.",
    ),
    "μBS1 A",
  ),
  prepaymentsAccruedIncome: line(
    "prepaymentsAccruedIncome",
    siteText("accounts-line.prepayments-accrued-income", "Prepayments and accrued income"),
    siteText(
      "accounts-line.prepayments-accrued-income-hint",
      "Costs paid in this period for a later one, and income earned in this period and not yet invoiced.",
    ),
    "μBS1 D",
  ),
  provisionsForLiabilities: line(
    "provisionsForLiabilities",
    siteText("accounts-line.provisions-for-liabilities", "Provisions for liabilities"),
    siteText(
      "accounts-line.provisions-for-liabilities-hint",
      "Amounts set aside for a liability whose amount or date is not yet certain, such as deferred tax.",
    ),
    "μBS1 I",
  ),
  accrualsDeferredIncome: line(
    "accrualsDeferredIncome",
    siteText("accounts-line.accruals-deferred-income", "Accruals and deferred income"),
    siteText(
      "accounts-line.accruals-deferred-income-hint",
      "Costs of this period not yet invoiced, and income received in this period for a later one.",
    ),
    "μBS1 J",
  ),
  capitalAndReserves: line(
    "capitalAndReserves",
    siteText("accounts-line.capital-and-reserves", "Capital and reserves"),
    siteText(
      "accounts-line.capital-and-reserves-hint",
      "Called up share capital plus the profit and loss account. It equals the net assets.",
    ),
    "μBS1 K",
    { thisYear: sheetCell("PubBalSht!F39"), lastYear: sheetCell("PubBalSht!B39"), workbookLabel: "Shareholders' Funds" },
  ),
};

const smallProfitAndLoss = byId(PROFIT_AND_LOSS_FIELDS);

export const SMALL_PAGE_LINES = {
  ...smallProfitAndLoss,
  ...byId(BALANCE_SHEET_FIELDS),
  interestReceivable: { ...smallProfitAndLoss.interestReceivable, referenceInFormat2: "PL2 12" },
  tax: { ...smallProfitAndLoss.tax, referenceInFormat2: "PL2 15" },
  changeInStocks: line(
    "changeInStocks",
    siteText("accounts-line.change-in-stocks", "Change in stocks of finished goods and in work in progress"),
    siteText(
      "accounts-line.change-in-stocks-hint",
      "Closing stocks of finished goods and work in progress less opening stocks. A fall is a minus figure.",
    ),
    "PL2 2",
    { thisYear: sheetCell("PubP&L!E14-E12"), lastYear: sheetCell("PubP&L!A14-A12"), workbookLabel: "Less Closing Stock at" },
  ),
  ownWorkCapitalised: line(
    "ownWorkCapitalised",
    siteText("accounts-line.own-work-capitalised", "Own work capitalised"),
    siteText("accounts-line.own-work-capitalised-hint", "The cost of work the company did on its own fixed assets, added to their cost."),
    "PL2 3",
  ),
  otherOperatingIncome: line(
    "otherOperatingIncome",
    siteText("accounts-line.other-operating-income", "Other operating income"),
    siteText(
      "accounts-line.other-operating-income-hint",
      "Income from the company's operations other than its sales, such as rent received or grants.",
    ),
    "PL2 4",
    { thisYear: sheetCell("PubP&L!F8"), lastYear: sheetCell("PubP&L!B8"), workbookLabel: "Investment Grants received" },
  ),
  rawMaterialsConsumables: line(
    "rawMaterialsConsumables",
    siteText("accounts-line.raw-materials-consumables", "Raw materials and consumables"),
    siteText("accounts-line.raw-materials-consumables-hint", "The cost of materials and consumables used in the period."),
    "PL2 5(a)",
    { thisYear: sheetCell("PubP&L!E13+E29"), lastYear: sheetCell("PubP&L!A13+A29"), workbookLabel: "Purchases" },
  ),
  otherExternalCharges: line(
    "otherExternalCharges",
    siteText("accounts-line.other-external-charges", "Other external charges"),
    siteText(
      "accounts-line.other-external-charges-hint",
      "Other costs bought in from outside the company, such as subcontractors and rent.",
    ),
    "PL2 5(b)",
    { thisYear: sheetCell("PubP&L!F15"), lastYear: sheetCell("PubP&L!B15"), workbookLabel: "Sub contractors" },
  ),
  staffCosts: line(
    "staffCosts",
    siteText("accounts-line.staff-costs", "Staff costs"),
    siteText("accounts-line.staff-costs-hint", "Wages and salaries, employer's National Insurance and pension contributions."),
    "PL2 6",
    { thisYear: sheetCell("PubP&L!E21+E22+E23"), lastYear: sheetCell("PubP&L!A21+A22+A23"), workbookLabel: "Wages and Salaries" },
  ),
  depreciation: line(
    "depreciation",
    siteText("accounts-line.depreciation", "Depreciation and other amounts written off tangible and intangible fixed assets"),
    siteText("accounts-line.depreciation-hint", "The depreciation and amortisation charged on the company's fixed assets in the period."),
    "PL2 7(a)",
    { thisYear: sheetCell("PubP&L!E43"), lastYear: sheetCell("PubP&L!A43"), workbookLabel: "Depreciation" },
  ),
  otherOperatingExpenses: line(
    "otherOperatingExpenses",
    siteText("accounts-line.other-operating-expenses", "Other operating expenses"),
    siteText("accounts-line.other-operating-expenses-hint", "Every other cost of running the company in the period."),
    "PL2 8",
  ),
  interestPayable: line(
    "interestPayable",
    siteText("accounts-line.interest-payable", "Interest payable and similar expenses"),
    siteText("accounts-line.interest-payable-hint", "Interest the company paid on loans and overdrafts."),
    "PL2 14",
    { thisYear: sheetCell("PubP&L!E38"), lastYear: sheetCell("PubP&L!A38"), workbookLabel: "Bank Interest Paid" },
  ),
  tradeDebtors: line(
    "tradeDebtors",
    siteText("accounts-line.trade-debtors", "Of which, trade debtors"),
    siteText("accounts-line.trade-debtors-hint", "The part of debtors that customers owe for sales."),
    "BS1 C.II.1",
    { thisYear: sheetCell("PubBalSht!E11"), lastYear: sheetCell("PubBalSht!A11"), workbookLabel: "Trade Debtors" },
  ),
  otherDebtors: line(
    "otherDebtors",
    siteText("accounts-line.other-debtors", "Of which, other debtors"),
    siteText("accounts-line.other-debtors-hint", "Any other amount owed to the company."),
    "BS1 C.II.3",
  ),
  prepayments: line(
    "prepayments",
    siteText("accounts-line.prepayments", "Of which, prepayments and accrued income"),
    siteText(
      "accounts-line.prepayments-hint",
      "Costs paid in this period for a later one, and income earned and not yet invoiced, shown within debtors.",
    ),
    "BS1 D",
  ),
  accruals: line(
    "accruals",
    siteText("accounts-line.accruals", "Accruals (due within one year)"),
    siteText("accounts-line.accruals-hint", "Costs of this period not yet invoiced, shown within the creditors due within 12 months."),
    "BS1 E.4",
  ),
  amountsOwedToDirectors: line(
    "amountsOwedToDirectors",
    siteText("accounts-line.amounts-owed-to-directors", "Of which, amounts owed to directors"),
    siteText("accounts-line.amounts-owed-to-directors-hint", "The part of those amounts the company owes its directors."),
    "BS1 H.4",
    {
      thisYear: sheetCell("PubBalSht!E29"),
      lastYear: sheetCell("PubBalSht!A29"),
      workbookLabel: "Directors Loan Account",
      differenceNote: "A figure above 0 is owed to a director. A figure below 0 is owed by a director, and goes in debtors.",
    },
  ),
  amountsOwedToGroupUndertakings: line(
    "amountsOwedToGroupUndertakings",
    siteText("accounts-line.amounts-owed-to-group-undertakings", "Of which, amounts owed to group undertakings"),
    siteText(
      "accounts-line.amounts-owed-to-group-undertakings-hint",
      "The part of those amounts the company owes to companies in its group.",
    ),
    "BS1 H.3",
  ),
  provisionsForLiabilities: line(
    "provisionsForLiabilities",
    siteText("accounts-line.provisions-for-liabilities", "Provisions for liabilities"),
    siteText(
      "accounts-line.provisions-for-liabilities-hint",
      "Amounts set aside for a liability whose amount or date is not yet certain, such as deferred tax.",
    ),
    "BS1 I",
  ),
};
