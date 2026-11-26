// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/ct600-fields.js
// The CT600 entry form as data: one row per box the figures model can emit (label, whether the
// customer types it or the page works it out, the rule, the Company Tax Return guide anchor),
// the typed fields that feed those boxes, the accounts section's fields, and the pure functions
// that read the form's values into the figures model and check what the model does not.
// The form, the review and the help read this one table, so a box has one label everywhere.

import { accountingPeriodDates } from "./long-period.js";
import { dateOfIncorporationFor } from "./first-accounts.js";
import { foldBalanceSheetHeadings } from "./balance-sheet-headings.js";

// page-chrome.js gives the text in the chosen language; without it (under Node, or a test that stubs
// the chrome) the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

export const COMPANY_TAX_RETURN_GUIDE_URL = "https://www.gov.uk/guidance/the-company-tax-return-guide";
export const COMPUTATIONS_GUIDE_ANCHOR = "and-90-accounts-and-computations";

export const CT600A_GUIDE_URL =
  "https://www.gov.uk/guidance/supplementary-pages-ct600a-2015-version-3-close-company-loans-and-arrangements-to-confer-benefits-on-participators";
const LIFE_OF_A_COMPANY_ACCOUNTS_URL =
  "https://www.gov.uk/government/publications/life-of-a-company-annual-requirements/life-of-a-company-part-1-accounts";
const REGULATIONS_URL = "https://www.legislation.gov.uk/uksi/2008/409/schedule/1/part/1";

// The Small Companies and Groups (Accounts and Directors' Report) Regulations 2008, Schedule 1.
function regulationsParagraph(paragraph) {
  return `https://www.legislation.gov.uk/uksi/2008/409/schedule/1/paragraph/${paragraph}`;
}

function companiesActSection(section) {
  return `https://www.legislation.gov.uk/ukpga/2006/46/section/${section}`;
}

// Where a figure sits in the DIY Accounting limited company workbook, as file!sheet!cell; a sum or a
// difference joins the cells with + or -.
export const WORKBOOK = "Financialaccounts.xlsx";

export function sheetCell(reference) {
  return `${WORKBOOK}!${reference}`;
}

export const SEND_TO_HMRC_ONLY_HINT = siteText("ch.ct.send-hmrc-only-hint", "The accounts go to HMRC with the Company Tax Return.");

// HMRC's own box names from the CT600 (2026) Version 3 form and the Company Tax Return guide.
export const CT600_BOX_ROWS = [
  {
    box: 1,
    label: siteText("ch.ct600.box-1", "Company name"),
    kind: "worked",
    section: "company",
    rule: siteText("ch.ct600.box-1-rule", "The company lookup gives the name"),
    anchor: "company-name",
    source: {
      thisYear: sheetCell("OpenAccounts!E2"),
      workbookLabel: "Company Name (including Limited)",
      differenceNote:
        'The spreadsheet asks for the company name including "Limited". It is the same name. Submit takes it from the company lookup.',
    },
  },
  {
    box: 2,
    label: siteText("ch.ct600.box-2", "Company registration number"),
    kind: "worked",
    section: "company",
    rule: siteText("ch.ct600.box-2-rule", "The company lookup gives the number"),
    anchor: "company-registration-number",
    source: { thisYear: sheetCell("OpenAccounts!E3"), workbookLabel: "Company registration number" },
  },
  {
    box: 3,
    label: siteText("ch.ct600.box-3", "Tax reference"),
    kind: "typed",
    section: "company",
    field: "utr",
    anchor: "tax-reference",
    source: {
      thisYear: sheetCell("OpenAccounts!O3"),
      labelCell: sheetCell("OpenAccounts!O2"),
      workbookLabel: "Tax Reference per CT603 Notice",
      differenceNote:
        'The spreadsheet calls this the "Tax Reference per CT603 Notice". It is the company\'s 10-digit Unique Taxpayer Reference. A book does not fill it; type it.',
    },
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
    label: siteText("ch.ct600.box-30", "Period of the return: from"),
    kind: "typed",
    section: "period",
    field: "periodStart",
    anchor: "and-35-period-of-the-return",
    source: { thisYear: sheetCell("CT600!B33"), labelCell: sheetCell("CT600!B32"), workbookLabel: "from (dd / mm / yyyy)" },
  },
  {
    box: 35,
    label: siteText("ch.ct600.box-35", "Period of the return: to"),
    kind: "typed",
    section: "period",
    field: "periodEnd",
    anchor: "and-35-period-of-the-return",
    source: { thisYear: sheetCell("CT600!M33"), labelCell: sheetCell("CT600!M32"), workbookLabel: "to (dd / mm / yyyy)" },
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
    label: siteText("ch.ct600.box-95", "Loans and arrangements to participators by close companies – form CT600A"),
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
    source: {
      thisYear: sheetCell("CT600!AK66"),
      workbookLabel: "Total turnover from trade or profession",
      differenceNote:
        'The spreadsheet\'s box 1 says "trade or profession". HMRC\'s box 145 is "Total turnover from trade". Enter the same figure.',
    },
  },
  {
    box: 155,
    label: siteText("ch.ct600.box-155", "Trading profits"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-155-rule", "Box 155 equals the computation's adjusted profit"),
    anchor: "trading-profits",
    source: {
      thisYear: sheetCell("CT600!Z70"),
      workbookLabel: "Trading and professional profits",
      differenceNote:
        'The spreadsheet\'s box 3, "Trading and professional profits", is HMRC\'s box 155, "Trading profits". Submit works box 155 out from the computation.',
    },
  },
  {
    box: 160,
    label: siteText("ch.ct600.box-160", "Trading losses brought forward set against trading profits"),
    kind: "typed",
    section: "reliefs",
    field: "lossesBroughtForward",
    anchor: "trading-losses-brought-forward-set-against-trading-profits",
    source: {
      thisYear: sheetCell("CT600!Z72"),
      workbookLabel: "Trading losses brought forward claimed against profits",
      differenceNote:
        'The spreadsheet\'s box 4, "Trading losses brought forward claimed against profits", is HMRC\'s box 160. Its figure is OpenAccounts!Q5, "Loss brought forward".',
    },
  },
  {
    box: 275,
    label: siteText("ch.ct600.box-275", "Total trading losses of this or a later accounting period"),
    kind: "typed",
    section: "reliefs",
    field: "lossAgainstTotalProfits",
    anchor: "trading-losses-of-this-or-a-later-accounting-period",
    source: {
      thisYear: sheetCell("CT600!Z98"),
      workbookLabel: "Trading losses of this or a later accounting period",
      differenceNote:
        "The spreadsheet's box 30 sets a trading loss against bank interest by itself. A book fills Submit's box 275 with 0. Enter the spreadsheet's figure when the company makes this claim.",
    },
  },
  {
    box: 280,
    label: siteText(
      "ch.ct600.box-280",
      "Put an 'X' in box 280 if amounts carried back from later accounting periods are included in box 275",
    ),
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
    source: {
      thisYear: sheetCell("MnthP&L!B37"),
      workbookLabel: "Charitable Donations",
      differenceNote:
        'The spreadsheet calls this "Charitable Donations". HMRC\'s box 305 is "Qualifying donations"; only donations that qualify go here.',
    },
  },
  {
    box: 780,
    label: siteText("ch.ct600.box-780", "Losses of trades carried on wholly or partly in the UK: amount arising"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-780-rule", "Box 780 is the computation's adjusted loss"),
    anchor: "losses-of-trades-carried-on-wholly-or-partly-in-the-uk-amount",
    source: {
      thisYear: sheetCell("CT600!Q206"),
      labelCell: sheetCell("CT600!D205"),
      workbookLabel: "Trading losses Case 1",
      differenceNote:
        "The spreadsheet's box 122, \"Trading losses Case 1\", is HMRC's box 780. Submit works box 780 out from the computation.",
    },
  },
  {
    box: 790,
    label: siteText("ch.ct600.box-790", "Losses of trades carried on wholly outside the UK: amount arising"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-790-rule", "Box 790 is the computation's adjusted loss"),
    anchor: "losses-of-trades-carried-on-wholly-outside-the-uk-amount",
  },
  {
    box: 165,
    label: siteText("ch.ct600.box-165", "Net trading profits"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-165-rule", "Box 165 is box 155 less box 160"),
    anchor: "net-trading-profits",
    source: {
      thisYear: sheetCell("CT600!AJ74"),
      workbookLabel: "Net trading and professional profits",
      differenceNote: "The spreadsheet's box 5, \"Net trading and professional profits\", is HMRC's box 165.",
    },
  },
  {
    box: 170,
    label: siteText("ch.ct600.box-170", "Bank, building society or other interest, and profits from non-trading loan relationships"),
    kind: "typed",
    section: "computation",
    field: "nonTradingLoanRelationshipCredits",
    anchor: "and-172-bank-building-society-or-other-interest-and-profits-from-non-trading-loan-relationships",
    source: {
      thisYear: sheetCell("CorporationTax!K24"),
      workbookLabel: "Add gross bank interest received",
      differenceNote:
        'The spreadsheet calls this "Add gross bank interest received". HMRC\'s box 170 also takes other interest and profits from non-trading loan relationships.',
    },
  },
  {
    box: 235,
    label: siteText("ch.ct600.box-235", "Profits before other deductions and reliefs"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-235-rule", "Box 235 is box 165 plus box 170"),
    anchor: "profits-before-other-deductions-and-reliefs-1",
    source: { thisYear: sheetCell("CT600!AJ92"), workbookLabel: "Profits before other deductions and reliefs" },
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
    source: { thisYear: sheetCell("CT600!AJ110"), workbookLabel: "Profits chargeable to corporation tax" },
  },
  {
    box: 326,
    label: siteText("ch.ct600.box-326", "Number of associated companies in this period"),
    kind: "typed",
    section: "company",
    field: "associatedCompanies",
    anchor: "number-of-associated-companies-in-this-period",
    source: { thisYear: sheetCell("Admin!P14") },
  },
  {
    box: 327,
    label: siteText("ch.ct600.box-327", "Number of associated companies in the first financial year"),
    kind: "typed",
    section: "company",
    field: "associatedCompanies",
    anchor: "and-328-number-of-associated-companies-in-the-first-and-second-financial-years",
    source: {
      thisYear: sheetCell("CT600!Y118"),
      workbookLabel: "Associated companies in the first financial year",
      differenceNote:
        'The spreadsheet\'s boxes 40 and 41 leave out "Number of". Both show Admin!P14, the number of associated companies, which Submit reads for box 326.',
    },
  },
  {
    box: 328,
    label: siteText("ch.ct600.box-328", "Number of associated companies in the second financial year"),
    kind: "typed",
    section: "company",
    field: "associatedCompanies",
    anchor: "and-328-number-of-associated-companies-in-the-first-and-second-financial-years",
    source: {
      thisYear: sheetCell("CT600!Y120"),
      workbookLabel: "Associated companies in the second financial year",
      differenceNote:
        'The spreadsheet\'s boxes 40 and 41 leave out "Number of". Both show Admin!P14, the number of associated companies, which Submit reads for box 326.',
    },
  },
  {
    box: 329,
    label: siteText(
      "ch.ct600.box-329",
      "Put an 'X' in box 329 if the company is chargeable at the small profit rate or is entitled to marginal relief",
    ),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-329-rule", "Box 329 is X when a share meets the small profits rate or marginal relief"),
    anchor: "small-profit-rate-or-marginal-relief-entitlement",
    source: {
      thisYear: sheetCell("CT600!AI122"),
      workbookLabel: "Put an 'X' in box 22 if the company claims to be charged at the starting rate…",
      differenceNote:
        "The spreadsheet's box 42 asks about the starting rate and the small companies' rate. HMRC's box 329 asks about the small profit rate or marginal relief. Submit ticks box 329 by itself.",
    },
  },
  {
    box: 330,
    label: siteText("ch.ct600.box-330", "Financial year (yyyy), first row"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-330-rule", "Rule 9198: the profit is split between financial years by days"),
    anchor: "boxes-330-to-425",
    source: { thisYear: sheetCell("CT600!C126"), labelCell: sheetCell("CT600!B125"), workbookLabel: "Financial year (yyyy)" },
  },
  {
    box: 335,
    label: siteText("ch.ct600.box-335", "Amount of profit, first row"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-335-rule", "Rule 9198: the profit is split between financial years by days"),
    anchor: "boxes-330-to-425",
    source: { thisYear: sheetCell("CT600!N126"), labelCell: sheetCell("CT600!L125"), workbookLabel: "Amount of profit" },
  },
  {
    box: 340,
    label: siteText("ch.ct600.box-340", "Rate of tax %, first row"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-340-rule", "Rule 9204: each share is charged at its year's rate"),
    anchor: "boxes-330-to-425",
    source: { thisYear: sheetCell("CT600!AA126"), labelCell: sheetCell("CT600!Y125"), workbookLabel: "Rate of tax" },
  },
  {
    box: 345,
    label: siteText("ch.ct600.box-345", "Tax, first row"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-345-rule", "Rules 9204 and 9213: each share is charged at its year's rate, to the penny"),
    anchor: "boxes-330-to-425",
    source: { thisYear: sheetCell("CT600!AJ126"), labelCell: sheetCell("CT600!AH125"), workbookLabel: "Tax" },
  },
  {
    box: 380,
    label: siteText("ch.ct600.box-380", "Financial year (yyyy), fourth row"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-380-rule", "Rule 9198: the profit is split between financial years by days"),
    anchor: "boxes-330-to-425",
    source: { thisYear: sheetCell("CT600!C128"), labelCell: sheetCell("CT600!B125"), workbookLabel: "Financial year (yyyy)" },
  },
  {
    box: 385,
    label: siteText("ch.ct600.box-385", "Amount of profit, fourth row"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-385-rule", "Rule 9198: the profit is split between financial years by days"),
    anchor: "boxes-330-to-425",
    source: { thisYear: sheetCell("CT600!N128"), labelCell: sheetCell("CT600!L125"), workbookLabel: "Amount of profit" },
  },
  {
    box: 390,
    label: siteText("ch.ct600.box-390", "Rate of tax %, fourth row"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-390-rule", "Rule 9204: each share is charged at its year's rate"),
    anchor: "boxes-330-to-425",
    source: { thisYear: sheetCell("CT600!AA128"), labelCell: sheetCell("CT600!Y125"), workbookLabel: "Rate of tax" },
  },
  {
    box: 395,
    label: siteText("ch.ct600.box-395", "Tax, fourth row"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-395-rule", "Rules 9204 and 9213: each share is charged at its year's rate, to the penny"),
    anchor: "boxes-330-to-425",
    source: { thisYear: sheetCell("CT600!AJ128"), labelCell: sheetCell("CT600!AH125"), workbookLabel: "Tax" },
  },
  {
    box: 430,
    label: siteText("ch.ct600.box-430", "Corporation Tax"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-430-rule", "Box 430 is box 345 plus box 395"),
    anchor: "corporation-tax",
    source: { thisYear: sheetCell("CT600!AJ131"), workbookLabel: "Corporation tax" },
  },
  {
    box: 435,
    label: siteText("ch.ct600.box-435", "Marginal relief"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-435-rule", "Box 435 is marginal relief on box 315, after associated companies and box 620"),
    anchor: "marginal-relief",
    source: {
      thisYear: sheetCell("CT600!Y133"),
      workbookLabel: "Marginal rate relief",
      differenceNote: 'The spreadsheet calls this "Marginal rate relief". HMRC calls it "Marginal relief".',
    },
  },
  {
    box: 440,
    label: siteText("ch.ct600.box-440", "Corporation Tax chargeable"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-440-rule", "Box 440 is box 430 less box 435"),
    anchor: "corporation-tax-chargeable",
    source: {
      thisYear: sheetCell("CT600!Y135"),
      workbookLabel: "Corporation tax net of marginal rate relief",
      differenceNote:
        'The spreadsheet\'s box 65, "Corporation tax net of marginal rate relief", is HMRC\'s box 440, "Corporation Tax chargeable".',
    },
  },
  {
    box: 475,
    label: siteText("ch.ct600.box-475", "Net Corporation Tax liability"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-475-rule", "Box 475 is box 430 less box 435"),
    anchor: "net-corporation-tax-liability",
    source: {
      thisYear: sheetCell("CT600!AJ145"),
      workbookLabel: "Corporation tax chargeable",
      differenceNote:
        'The spreadsheet\'s box 70 is called "Corporation tax chargeable", but it is HMRC\'s box 475, "Net Corporation Tax liability". HMRC\'s "Corporation Tax chargeable" is box 440.',
    },
  },
  {
    box: 480,
    label: siteText("ch.ct600.box-480", "Tax payable on loans and arrangements to participators"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-480-rule", "Box 480 is the tax in box A80 of supplementary page CT600A"),
    anchor: "tax-payable-on-loans-and-arrangements-to-participators",
  },
  {
    box: 485,
    label: siteText("ch.ct600.box-485", "Put an 'X' in box 485 if you completed box A70 in the supplementary pages CT600A"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-485-rule", "Box 485 is ticked when box A70 of supplementary page CT600A is completed"),
    anchor: "box-a70-in-ct600a",
  },
  {
    box: 510,
    label: siteText("ch.ct600.box-510", "Tax chargeable"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-510-rule", "Box 510 is box 475 plus box 480"),
    anchor: "tax-chargeable",
    source: {
      thisYear: sheetCell("CT600!AJ145"),
      workbookLabel: "Corporation tax chargeable",
      differenceNote:
        "The spreadsheet's box 70 also gives HMRC's box 510, \"Tax chargeable\", when there is no tax on loans to participators.",
    },
  },
  {
    box: 515,
    label: siteText("ch.ct600.box-515", "Income Tax deducted from gross income included in profits"),
    kind: "typed",
    section: "reliefs",
    field: "incomeTaxDeducted",
    anchor: "income-tax-deducted-from-gross-income-included-in-profits",
    source: {
      thisYear: sheetCell("CorporationTax!K37"),
      workbookLabel: "Deduct Income tax deducted from gross bank interest",
      differenceNote:
        'The spreadsheet calls this "Deduct Income tax deducted from gross bank interest". HMRC\'s box 515 takes Income Tax deducted from any gross income in the profits.',
    },
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
    source: {
      thisYear: sheetCell("CT600!AJ159"),
      workbookLabel: "Tax payable - this is your self-assessment of tax payable",
      differenceNote:
        "The spreadsheet's box 86, \"Tax payable - this is your self-assessment of tax payable\", gives HMRC's boxes 525 and 528.",
    },
  },
  {
    box: 528,
    label: siteText("ch.ct600.box-528", "Self-assessment of tax payable"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-528-rule", "Box 528 is box 440 less box 515"),
    anchor: "self-assessment-of-tax-payable",
    source: {
      thisYear: sheetCell("CT600!AJ159"),
      workbookLabel: "Tax payable - this is your self-assessment of tax payable",
      differenceNote:
        "The spreadsheet's box 86, \"Tax payable - this is your self-assessment of tax payable\", gives HMRC's boxes 525 and 528.",
    },
  },
  {
    box: 595,
    label: siteText("ch.ct600.box-595", "Tax already paid (and not already repaid)"),
    kind: "typed",
    section: "payments",
    field: "taxAlreadyPaid",
    anchor: "tax-already-paid-and-not-already-repaid",
    source: { thisYear: sheetCell("CT600!AJ163"), workbookLabel: "Tax already paid (and not already repaid)" },
  },
  {
    box: 600,
    label: siteText("ch.ct600.box-600", "Tax outstanding"),
    kind: "worked",
    section: "tax",
    rule: siteText("ch.ct600.box-600-rule", "Box 600 is box 525 less box 595"),
    anchor: "tax-outstanding",
    source: { thisYear: sheetCell("CT600!AJ166"), labelCell: sheetCell("CT600!C165"), workbookLabel: "Tax outstanding" },
  },
  {
    box: 620,
    label: siteText("ch.ct600.box-620", "Franked investment income/Exempt ABGH distributions"),
    kind: "typed",
    section: "reliefs",
    field: "frankedInvestmentIncome",
    anchor: "franked-investment-income-or-exempt-abgh-distributions",
    source: {
      thisYear: sheetCell("CorporationTax!K29"),
      workbookLabel: "Add franked investment income (exempt distributions received)",
      differenceNote: 'The spreadsheet calls this "Add franked investment income (exempt distributions received)". It is HMRC\'s box 620.',
    },
  },
  {
    box: 690,
    label: siteText("ch.ct600.box-690", "Annual investment allowance: capital allowances"),
    kind: "typed",
    section: "allowances",
    field: "annualInvestmentAllowance",
    anchor: "annual-investment-allowance",
    source: {
      thisYear: sheetCell("CorporationTax!I15"),
      workbookLabel: "Annual Investment Allowances plant & equipment bought",
      differenceNote: 'The spreadsheet calls this "Annual Investment Allowances plant & equipment bought". It is HMRC\'s box 690.',
    },
  },
  {
    box: 705,
    label: siteText("ch.ct600.box-705", "Machinery and plant – main pool: capital allowances"),
    kind: "typed",
    section: "allowances",
    field: "mainPoolAllowances",
    rule: siteText("ch.ct600.box-705-rule", "Box 705 includes the annual investment allowance in box 690"),
    anchor: "and-710-machinery-and-plant--main-pool",
    source: {
      thisYear: sheetCell("CorporationTax!I16+I17"),
      workbookLabel: "Writing Down Allowance cars bought between; … assets purchased prior to",
      differenceNote:
        "The spreadsheet splits the writing down allowance into cars (I16) and assets bought before the period (I17). HMRC's box 705 takes both, and a balancing allowance in I18 when I18 is above 0.",
    },
  },
  {
    box: 710,
    label: siteText("ch.ct600.box-710", "Machinery and plant – main pool: balancing charges"),
    kind: "typed",
    section: "allowances",
    field: "mainPoolBalancingCharges",
    anchor: "and-710-machinery-and-plant--main-pool",
    source: {
      thisYear: sheetCell("CorporationTax!I18"),
      workbookLabel: "Balancing charges on assets disposed of between",
      differenceNote:
        "The spreadsheet's I18 is a balancing charge when it is below 0. HMRC's box 710 takes that charge as a positive figure.",
    },
  },
  {
    box: 688,
    label: siteText("ch.ct600.box-688", "Full expensing: capital allowances"),
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
    label: siteText("ch.ct600.box-693", "Machinery and plant – special rate allowance: capital allowances"),
    kind: "typed",
    section: "allowances",
    field: "specialRateAllowances",
    anchor: "and-694-machinery-and-plant--special-rate-allowance",
  },
  {
    box: 694,
    label: siteText("ch.ct600.box-694", "Machinery and plant – special rate allowance: balancing charges"),
    kind: "typed",
    section: "allowances",
    field: "specialRateBalancingCharges",
    anchor: "and-694-machinery-and-plant--special-rate-allowance",
  },
  {
    box: 695,
    label: siteText("ch.ct600.box-695", "Machinery and plant – special rate pool: capital allowances"),
    kind: "typed",
    section: "allowances",
    field: "specialRatePoolAllowances",
    rule: siteText("ch.ct600.box-695-rule", "Box 695 includes the annual investment allowance claimed on the special rate pool"),
    anchor: "and-700-machinery-and-plant--special-rate-pool",
  },
  {
    box: 700,
    label: siteText("ch.ct600.box-700", "Machinery and plant – special rate pool: balancing charges"),
    kind: "typed",
    section: "allowances",
    field: "specialRatePoolBalancingCharges",
    anchor: "and-700-machinery-and-plant--special-rate-pool",
  },
  {
    box: 735,
    label: siteText(
      "ch.ct600.box-735",
      "Annual investment allowance (allowances not included in the calculation of trading profits and losses)",
    ),
    kind: "typed",
    section: "allowances",
    field: "annualInvestmentAllowanceOutsideTrade",
    anchor: "annual-investment-allowance-1",
  },
  {
    box: 760,
    label: siteText("ch.ct600.box-760", "Machinery and plant on which first year allowance is claimed"),
    kind: "typed",
    section: "allowances",
    field: "firstYearAllowanceExpenditure",
    anchor: "machinery-and-plant-on-which-first-year-allowance-is-claimed",
    source: {
      thisYear: sheetCell("CT600!AL194"),
      workbookLabel: "Expenditure on machinery and plant on which first year allowance is claimed",
      differenceNote:
        "The spreadsheet's box 118 adds \"Expenditure on\". A book fills Submit's box 760 with 0. Enter the spreadsheet's figure.",
    },
  },
  {
    box: 773,
    label: siteText("ch.ct600.box-773", "Machinery and plant – special rate allowance (qualifying expenditure)"),
    kind: "typed",
    section: "allowances",
    field: "specialRateAllowanceExpenditure",
    anchor: "machinery-and-plant--special-rate-allowance",
  },
  {
    box: 775,
    label: siteText("ch.ct600.box-775", "Other machinery and plant (qualifying expenditure)"),
    kind: "typed",
    section: "allowances",
    field: "otherMachineryAndPlantExpenditure",
    anchor: "other-machinery-and-plant",
  },
  {
    box: 975,
    label: siteText("ch.ct600.box-975", "Name (declaration)"),
    kind: "typed",
    section: "declaration",
    field: "declarantName",
    anchor: "name",
    source: {
      thisYear: sheetCell("OpenAccounts!E5"),
      workbookLabel: "First Director's Name",
      differenceNote:
        "The spreadsheet calls this \"First Director's Name\". HMRC's box 975 is the name of the person who makes the declaration.",
    },
  },
  {
    box: 985,
    label: siteText("ch.ct600.box-985", "Status (declaration)"),
    kind: "typed",
    section: "declaration",
    field: "declarantStatus",
    anchor: "status",
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
    label: boxLabel(326),
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
    label: siteText("ch.ct600.period", "Period of the return"),
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
    reference: "Computations",
    termSource: guideUrl("and-90-accounts-and-computations"),
    source: {
      thisYear: sheetCell("OpenAccounts!E8"),
      workbookLabel: "The principal activity of the company is",
      differenceNote:
        "The spreadsheet holds the principal activity, and Submit starts the trade name from it. Change it when the trade has another name.",
    },
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
    reference: "Computation; feeds box 155",
    termSource: guideUrl("and-90-accounts-and-computations"),
    source: { thisYear: sheetCell("CorporationTax!I8"), workbookLabel: "Add back depreciation charged during the year" },
  },
  {
    id: "amortisation",
    section: "computation",
    figure: "amortisation",
    type: WHOLE,
    label: siteText("ch.ct600.amortisation", "Amortisation added back"),
    hint: MONEY_HINT,
    default: "0",
    reference: "Computation; feeds box 155",
    termSource: guideUrl("and-90-accounts-and-computations"),
    source: {
      thisYear: sheetCell("CorporationTax!I7"),
      workbookLabel: "Add back goodwill written off",
      differenceNote: "The spreadsheet adds back only goodwill written off. Add any other amortisation to the spreadsheet's figure.",
    },
  },
  {
    id: "entertaining",
    section: "computation",
    figure: "entertaining",
    type: WHOLE,
    label: siteText("ch.ct600.entertaining", "Entertaining added back"),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.entertaining-hint", "No more than the cost of sales plus administrative expenses.")}`,
    default: "0",
    reference: "Computation; feeds box 155",
    termSource: guideUrl("and-90-accounts-and-computations"),
    source: { thisYear: sheetCell("CorporationTax!I9"), workbookLabel: "Add back business entertainment" },
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
    label: boxLabel(705),
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
    label: boxLabel(688),
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
    label: boxLabel(695),
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
    reference: "Part of boxes 690 and 695",
    termSource: guideUrl("annual-investment-allowance"),
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
    reference: "Boxes 275 and 280 of the previous period's return",
    termSource: guideUrl("amounts-carried-back-from-later-accounting-periods"),
  },
  {
    id: "priorPeriodChargeableProfits",
    section: "reliefs",
    figure: "priorPeriodChargeableProfits",
    type: WHOLE,
    label: siteText("ch.ct600.prior-period-chargeable-profits", "Previous period's chargeable profits (box 315 of its return)"),
    hint: `${MONEY_HINT}. ${siteText("ch.ct600.prior-period-chargeable-profits-hint", "Needed only for a carry-back claim.")}`,
    default: "0",
    reference: "Box 315 of the previous return",
    termSource: guideUrl("profits-chargeable-to-corporation-tax"),
  },
  {
    id: "lossOutsideUk",
    section: "reliefs",
    figure: "lossOutsideUk",
    type: "checkbox",
    label: siteText("ch.ct600.loss-outside-uk", "The trade is carried on wholly outside the UK (a loss goes in box 790, not box 780)"),
    hint: siteText(
      "ch.ct600.loss-outside-uk-hint",
      "Tick it when the whole trade is carried on outside the UK. The trading loss then goes in box 790 instead of box 780.",
    ),
    reference: "Box 780 or 790",
    termSource: guideUrl("losses-of-trades-carried-on-wholly-outside-the-uk-amount"),
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
    reference: "Checks box 440",
    termSource: guideUrl("and-90-accounts-and-computations"),
    source: {
      thisYear: sheetCell("CorporationTax!K35"),
      workbookLabel: "Corporation Tax chargeable",
      differenceNote:
        "The spreadsheet's own working of the tax is \"Corporation Tax chargeable\" in CorporationTax!K35. A book does not fill this field; type K35 here to check Submit's box 440.",
    },
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
    hint: siteText(
      "ch.ct600.loans-made-hint",
      "A loan, or an arrangement that gives a benefit, to a participator in this close company or to their associate, still owed at the end of the period. It goes on the supplementary page CT600A.",
    ),
    reference: "CT600A A10; box 95",
    termSource: `${CT600A_GUIDE_URL}#a10-outstanding-loans-and-arrangements-made`,
    source: {
      thisYear: sheetCell("PubBalSht!E29"),
      workbookLabel: "Directors Loan Account",
      differenceNote:
        "The spreadsheet shows the director's loan account; a figure below 0 means the director owes the company. When the director owes more at the end than at the start (OpenAccounts!E30), a book answers Yes and fills one loan row.",
    },
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
    hint: siteText(
      "ch.ct600.released-before-end-hint",
      "A loan made in this period and repaid, released or written off before the period ended still goes on the supplementary page CT600A.",
    ),
    reference: "CT600A A5",
    termSource: `${CT600A_GUIDE_URL}#a5-loans-repaid-released-or-written-off-or-return-payments`,
  },
  {
    id: "repaidSince",
    section: "loans",
    figure: "repaidSince",
    type: "choice",
    label: siteText("ch.ct600.repaid-since", "Has any of it been repaid, released or written off since the end of the period?"),
    focus: "repaidSinceNo",
    hint: siteText(
      "ch.ct600.repaid-since-hint",
      "A repayment, release or write-off after the period ends reduces the tax on loans to participators. Give each one below with its date.",
    ),
    reference: "CT600A A25 or A50; box 485",
    termSource: CT600A_GUIDE_URL,
  },
  {
    id: "declarantName",
    section: "declaration",
    figure: "declarantName",
    box: 975,
    type: "text",
    label: boxLabel(975),
    hint: siteText("ch.ct600.declarant-name-hint", "The person making the declaration for the company, usually a director."),
  },
  {
    id: "declarantStatus",
    section: "declaration",
    figure: "declarantStatus",
    box: 985,
    type: "text",
    label: boxLabel(985),
    default: "Director",
    hint: siteText("ch.ct600.declarant-status-hint", "Their position in the company, for example Director or Company secretary."),
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
    hint: siteText(
      "ch.ct600.declaration-accepted-hint",
      "Tick it when the return, the accounts and the computations are correct and complete.",
    ),
    reference: "Declaration",
    termSource: guideUrl("declaration"),
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
  source: {
    thisYear: sheetCell("MnthP&L!B37"),
    workbookLabel: "Charitable Donations (the whole period)",
    differenceNote:
      'The spreadsheet shows "Charitable Donations" for the whole period of account. Enter the qualifying donations paid in each accounting period.',
  },
};

export const STATEMENT_FIELDS = [
  {
    id: "statementSection477Exemption",
    label: siteText(
      "ch.ct600.statement-section477-exemption",
      "The company is entitled to exemption from audit under section 477 of the Companies Act 2006 relating to small companies.",
    ),
    hint: siteText(
      "ch.ct600.statement-section477-exemption-hint",
      "The statement a small company makes on its balance sheet when it takes the exemption from audit.",
    ),
    reference: "CA 475(2); CA 477",
    termSource: companiesActSection(475),
    source: {
      thisYear: sheetCell("PubBalSht!C41"),
      workbookLabel: "the company was entitled to exemption from audit under section 477 …",
      differenceNote:
        'The spreadsheet says the company "was entitled" to the exemption "for year end" and its date. The statement on the accounts says it "is entitled".',
    },
  },
  {
    id: "statementMembersNotRequiredAudit",
    label: siteText(
      "ch.ct600.statement-members-not-required-audit",
      "The members have not required the company to obtain an audit for the year in question.",
    ),
    hint: siteText(
      "ch.ct600.statement-members-not-required-audit-hint",
      "Members holding 10% or more of the shares can ask for an audit. Tick it when none did.",
    ),
    reference: "CA 475(3)(a)",
    termSource: companiesActSection(475),
    source: { thisYear: sheetCell("PubBalSht!A44"), workbookLabel: "a) The members have not required …" },
  },
  {
    id: "statementDirectorsResponsibilities",
    label: siteText(
      "ch.ct600.statement-directors-responsibilities",
      "The directors acknowledge their responsibilities for complying with the requirements of the Companies Act 2006 with respect to accounting records and the preparation of accounts.",
    ),
    hint: siteText(
      "ch.ct600.statement-directors-responsibilities-hint",
      "The directors' statement that they keep the accounting records and prepare the accounts.",
    ),
    reference: "CA 475(3)(b)",
    termSource: companiesActSection(475),
    source: { thisYear: sheetCell("PubBalSht!A46"), workbookLabel: "b) The directors acknowledge …" },
  },
  {
    id: "statementSmallCompaniesRegime",
    label: siteText(
      "ch.ct600.statement-small-companies-regime",
      "These accounts have been prepared in accordance with the provisions applicable to companies subject to the small companies regime.",
    ),
    hint: siteText(
      "ch.ct600.statement-small-companies-regime-hint",
      "The statement small company accounts carry above the director's signature.",
    ),
    reference: "CA 414(3)(b)",
    termSource: companiesActSection(414),
    source: {
      thisYear: sheetCell("PubBalSht!A52"),
      workbookLabel: "e) … prepared in accordance with the special provisions of the Companies Act relating to small companies",
      differenceNote:
        "The spreadsheet's statement (e) says \"special provisions of the Companies Act relating to small companies\". Section 414(3)(b) asks for the words in Submit's label. The spreadsheet's statement (d) uses those words for the accounts as delivered.",
    },
  },
];

// The fourth statement of a micro-entity's accounts, in place of the small companies regime statement.
export const MICRO_STATEMENT_FIELD = {
  id: "statementMicroEntityProvisions",
  label: siteText(
    "ch.ct600.statement-micro-entity-provisions",
    "These accounts have been prepared in accordance with the provisions applicable to companies subject to the small companies regime and in accordance with the provisions available to micro-entities.",
  ),
  hint: siteText(
    "ch.ct600.statement-micro-entity-provisions-hint",
    "The statement micro-entity accounts carry above the director's signature.",
  ),
  reference: "CA 414(3)(a)",
  termSource: companiesActSection(414),
};

// The two sets of accounts the return can carry: FRS 102 section 1A small company accounts, or
// FRS 105 micro-entity accounts with the profit and loss account HMRC takes with the return.
export const ACCOUNTS_REGIMES = [
  {
    value: "small",
    id: "regimeSmall",
    label: siteText("ch.ct600.regime-small", "Small company accounts (FRS 102 section 1A)"),
    hint: siteText(
      "ch.ct600.regime-small-hint",
      "Accounts under the small companies regime, with a profit and loss account, notes and both years' figures.",
    ),
    reference: "CA 381",
    termSource: `${LIFE_OF_A_COMPANY_ACCOUNTS_URL}#small-company`,
  },
  {
    value: "micro",
    id: "regimeMicro",
    label: siteText("ch.ct600.regime-micro", "Micro-entity accounts (FRS 105)"),
    hint: siteText("ch.ct600.regime-micro-hint", "The shortest accounts, for a company within two of the three micro-entity limits."),
    reference: "CA 384A",
    termSource: `${LIFE_OF_A_COMPANY_ACCOUNTS_URL}#micro-entity`,
  },
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
  {
    id: "turnover",
    label: siteText("ch.ct600.micro-pl-turnover", "Turnover"),
    hint: siteText(
      "ch.ct600.micro-pl-turnover-hint",
      "Sales of goods and services in the period, after trade discounts and before VAT. It also gives box 145.",
    ),
    reference: "μPL A; feeds box 145",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubP&L!F9"),
      lastYear: sheetCell("PubP&L!B9"),
      workbookLabel: "Sales Turnover",
      differenceNote: 'The spreadsheet calls this "Sales Turnover". The format calls it "Turnover".',
    },
  },
  {
    id: "otherIncome",
    label: siteText("ch.ct600.micro-pl-other-income", "Other income"),
    hint: siteText("ch.ct600.micro-pl-other-income-hint", "Income outside the company's trade, such as bank interest."),
    reference: "μPL B",
    termSource: REGULATIONS_URL,
    source: { thisYear: sheetCell("PubP&L!F48"), lastYear: sheetCell("PubP&L!B48"), workbookLabel: "Other Income" },
  },
  {
    id: "rawMaterials",
    label: siteText("ch.ct600.micro-pl-raw-materials", "Cost of raw materials and consumables"),
    hint: siteText(
      "ch.ct600.micro-pl-raw-materials-hint",
      "The cost of materials and consumables used. A book fills 0 and puts this cost in other charges.",
    ),
    reference: "μPL C",
    termSource: REGULATIONS_URL,
  },
  {
    id: "staffCosts",
    label: siteText("ch.ct600.micro-pl-staff-costs", "Staff costs"),
    hint: siteText(
      "ch.ct600.micro-pl-staff-costs-hint",
      "Wages, employer's National Insurance and pension contributions. A book fills 0 and puts these in other charges.",
    ),
    reference: "μPL D",
    termSource: REGULATIONS_URL,
  },
  {
    id: "depreciation",
    label: siteText("ch.ct600.micro-pl-depreciation", "Depreciation and other amounts written off assets"),
    hint: siteText("ch.ct600.micro-pl-depreciation-hint", "The depreciation charged on the company's fixed assets in the period."),
    reference: "μPL E",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubP&L!E43"),
      lastYear: sheetCell("PubP&L!A43"),
      workbookLabel: "Depreciation",
      differenceNote:
        'The spreadsheet\'s "Depreciation" (E43) is the figure Submit reads through CorporationTax!I8. A loss on disposal of assets (E42) stays in other charges.',
    },
  },
  {
    id: "otherCharges",
    label: siteText("ch.ct600.micro-pl-other-charges", "Other charges"),
    hint: siteText(
      "ch.ct600.micro-pl-other-charges-hint",
      "Every other cost of the period, including the cost of sales and the administrative expenses.",
    ),
    reference: "μPL F",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubP&L!F16+F44-E43"),
      lastYear: sheetCell("PubP&L!B16+B44-A43"),
      workbookLabel: "Cost of Sales; Administrative Expenses; Depreciation",
      differenceNote:
        "The format's \"Other charges\" is the spreadsheet's cost of sales and administrative expenses, less the depreciation.",
    },
  },
  {
    id: "tax",
    label: siteText("ch.ct600.micro-pl-tax", "Tax"),
    hint: siteText("ch.ct600.micro-pl-tax-hint", "The Corporation Tax charged on this period's profit."),
    reference: "μPL G",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubP&L!F50"),
      lastYear: sheetCell("PubP&L!B50"),
      workbookLabel: "Corporation tax",
      differenceNote: 'The spreadsheet calls this "Corporation tax". The format calls it "Tax".',
    },
  },
];

export const MICRO_BALANCE_SHEET_FIELDS = [
  {
    id: "fixedAssets",
    label: siteText("ch.ct600.micro-bs-fixed-assets", "Fixed assets"),
    hint: siteText(
      "ch.ct600.micro-bs-fixed-assets-hint",
      "What the company owns for long-term use, such as equipment and vehicles, at cost less depreciation.",
    ),
    reference: "μBS1 B",
    termSource: REGULATIONS_URL,
    source: { thisYear: sheetCell("PubBalSht!F6"), lastYear: sheetCell("PubBalSht!B6"), workbookLabel: "Fixed Assets" },
  },
  {
    id: "currentAssets",
    label: siteText("ch.ct600.micro-bs-current-assets", "Current assets"),
    hint: siteText(
      "ch.ct600.micro-bs-current-assets-hint",
      "Stock, money owed to the company and cash at the bank, at the end of the period.",
    ),
    reference: "μBS1 C",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubBalSht!E13"),
      lastYear: sheetCell("PubBalSht!A13"),
      workbookLabel: "Current Assets",
      differenceNote:
        "Submit adds the director's loan account to the spreadsheet's figure when the director owes the company (E29 below 0).",
    },
  },
  {
    id: "creditorsWithinOneYear",
    label: siteText("ch.ct600.micro-bs-creditors-within-one-year", "Creditors: amounts falling due within one year"),
    hint: siteText("ch.ct600.micro-bs-creditors-within-one-year-hint", "Everything the company owes that falls due within 12 months."),
    reference: "μBS1 E",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubBalSht!E20"),
      lastYear: sheetCell("PubBalSht!A20"),
      workbookLabel: "Current Liabilities",
      differenceNote:
        'The spreadsheet calls this "Current Liabilities". The format calls it "Creditors: amounts falling due within one year".',
    },
  },
  {
    id: "creditorsAfterOneYear",
    label: siteText("ch.ct600.micro-bs-creditors-after-one-year", "Creditors: amounts falling due after more than one year"),
    hint: siteText(
      "ch.ct600.micro-bs-creditors-after-one-year-hint",
      "Amounts the company owes that fall due more than 12 months after the end of the period.",
    ),
    reference: "μBS1 H",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubBalSht!F31"),
      lastYear: sheetCell("PubBalSht!B31"),
      labelCell: sheetCell("PubBalSht!C30"),
      workbookLabel: "Creditors (falling due after more than one year)",
      differenceNote:
        "The spreadsheet's F31 adds the director's loan account (E29) to the creditors due after more than one year (E30). When the director owes the company, Submit moves that amount to debtors.",
    },
  },
  {
    id: "calledUpShareCapital",
    label: siteText("ch.ct600.micro-bs-called-up-share-capital", "Called up share capital"),
    hint: siteText(
      "ch.ct600.micro-bs-called-up-share-capital-hint",
      "The nominal value of the shares the company has issued and called up.",
    ),
    reference: "Part of μBS1 K; named at BS1 K.I",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubBalSht!F36"),
      lastYear: sheetCell("PubBalSht!B36"),
      workbookLabel: "Called up share capital 2 ordinary shares of £1.00 each",
    },
  },
  {
    id: "profitAndLossAccount",
    label: siteText("ch.ct600.micro-bs-profit-and-loss-account", "Profit and loss account"),
    hint: siteText(
      "ch.ct600.micro-bs-profit-and-loss-account-hint",
      "The profits kept in the company over the years, less losses and dividends paid.",
    ),
    reference: "Part of μBS1 K; named at BS1 K.V",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubBalSht!F37+F38"),
      lastYear: sheetCell("PubBalSht!B37+B38"),
      workbookLabel: "Retained Profit and Loss account; Capital Reserves",
      differenceNote:
        'The spreadsheet shows "Retained Profit and Loss account" and "Capital Reserves". The format calls the reserve "Profit and loss account". Submit takes shareholders\' funds (F39) less share capital, which is F37 and F38.',
    },
  },
];

export function microId(year, field) {
  return `micro${upperFirst(year)}${upperFirst(field)}`;
}

// The accounts section. Ids are `current<Field>`, `prior<Field>` and `note<Class><Field>`.
export const PROFIT_AND_LOSS_FIELDS = [
  {
    id: "turnover",
    label: siteText("ch.ct600.pl-turnover", "Turnover"),
    hint: siteText(
      "ch.ct600.pl-turnover-hint",
      "Sales of goods and services in the period, after trade discounts and before VAT. It also gives box 145.",
    ),
    reference: "PL1 1; feeds box 145",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubP&L!F9"),
      lastYear: sheetCell("PubP&L!B9"),
      workbookLabel: "Sales Turnover",
      differenceNote:
        'The spreadsheet calls this "Sales Turnover", and it includes investment grants received (F8). The format calls it "Turnover".',
    },
  },
  {
    id: "costOfSales",
    label: siteText("ch.ct600.pl-cost-of-sales", "Cost of sales"),
    hint: siteText("ch.ct600.pl-cost-of-sales-hint", "The direct costs of what the company sold, such as stock used and subcontractors."),
    reference: "PL1 2",
    termSource: REGULATIONS_URL,
    source: { thisYear: sheetCell("PubP&L!F16"), lastYear: sheetCell("PubP&L!B16"), workbookLabel: "Cost of Sales" },
  },
  {
    id: "administrativeExpenses",
    label: siteText("ch.ct600.pl-administrative-expenses", "Administrative expenses"),
    hint: siteText(
      "ch.ct600.pl-administrative-expenses-hint",
      "The other costs of running the company, such as rent, wages, depreciation and professional fees.",
    ),
    reference: "PL1 5",
    termSource: REGULATIONS_URL,
    source: { thisYear: sheetCell("PubP&L!F44"), lastYear: sheetCell("PubP&L!B44"), workbookLabel: "Administrative Expenses" },
  },
  {
    id: "interestReceivable",
    label: siteText("ch.ct600.pl-interest-receivable", "Other interest receivable and similar income"),
    hint: siteText("ch.ct600.pl-interest-receivable-hint", "Interest the company received, such as bank interest. It also gives box 170."),
    reference: "PL1 10; feeds box 170",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubP&L!F48"),
      lastYear: sheetCell("PubP&L!B48"),
      workbookLabel: "Other Income",
      differenceNote:
        'The spreadsheet calls this "Other Income"; it is the interest received. The format calls it "Other interest receivable and similar income". Submit works it out as profit before tax (F49) less the operating profit, which gives F48.',
    },
  },
  {
    id: "tax",
    label: siteText("ch.ct600.pl-tax", "Tax on profit or loss"),
    hint: siteText("ch.ct600.pl-tax-hint", "The Corporation Tax charged on this period's profit, as in the accounts."),
    reference: "PL1 13",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubP&L!F50"),
      lastYear: sheetCell("PubP&L!B50"),
      workbookLabel: "Corporation tax",
      differenceNote: 'The spreadsheet calls this "Corporation tax". The format calls it "Tax on profit or loss".',
    },
  },
];

export const BALANCE_SHEET_FIELDS = [
  {
    id: "fixedAssets",
    label: siteText("ch.ct600.bs-fixed-assets", "Fixed assets"),
    hint: siteText(
      "ch.ct600.bs-fixed-assets-hint",
      "What the company owns for long-term use, such as equipment and vehicles, at cost less depreciation.",
    ),
    reference: "BS1 B",
    termSource: REGULATIONS_URL,
    source: { thisYear: sheetCell("PubBalSht!F6"), lastYear: sheetCell("PubBalSht!B6"), workbookLabel: "Fixed Assets" },
  },
  {
    id: "stocks",
    label: siteText("ch.ct600.bs-stocks", "Stocks"),
    hint: siteText(
      "ch.ct600.bs-stocks-hint",
      "Goods held for sale and materials not yet used, at the lower of cost and what they would sell for.",
    ),
    reference: "BS1 C.I",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubBalSht!E10"),
      lastYear: sheetCell("PubBalSht!A10"),
      workbookLabel: "Stock at cost",
      differenceNote: 'The spreadsheet calls this "Stock at cost". The format calls it "Stocks".',
    },
  },
  {
    id: "debtors",
    label: siteText("ch.ct600.bs-debtors", "Debtors"),
    hint: siteText("ch.ct600.bs-debtors-hint", "Money owed to the company, including any amount a director owes."),
    reference: "BS1 C.II",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubBalSht!E11"),
      lastYear: sheetCell("PubBalSht!A11"),
      workbookLabel: "Trade Debtors",
      differenceNote:
        'The spreadsheet shows "Trade Debtors" only. Submit adds the director\'s loan account when the director owes the company (E29 below 0), because the format\'s "Debtors" includes it.',
    },
  },
  {
    id: "amountsOwedByDirectors",
    label: siteText("ch.ct600.bs-amounts-owed-by-directors", "Of which, amounts owed by directors"),
    hint: siteText(
      "ch.ct600.bs-amounts-owed-by-directors-hint",
      "The part of debtors that directors owe the company. The note on advances to directors gives the detail.",
    ),
    reference: "CA 413(1); part of BS1 C.II",
    termSource: companiesActSection(413),
    source: {
      thisYear: sheetCell("PubBalSht!E29"),
      lastYear: sheetCell("PubBalSht!A29"),
      workbookLabel: "Directors Loan Account",
      differenceNote:
        "The spreadsheet shows the director's loan account; a figure below 0 is owed by the director. Section 413 calls this an advance or credit to a director. Submit fills the amount owed, with the sign turned.",
    },
  },
  {
    id: "cashAtBank",
    label: siteText("ch.ct600.bs-cash-at-bank", "Cash at bank and in hand"),
    hint: siteText(
      "ch.ct600.bs-cash-at-bank-hint",
      "The balance on the company's bank accounts and any cash held at the end of the period.",
    ),
    reference: "BS1 C.IV",
    termSource: REGULATIONS_URL,
    source: { thisYear: sheetCell("PubBalSht!E12"), lastYear: sheetCell("PubBalSht!A12"), workbookLabel: "Cash at bank and in hand" },
  },
  {
    id: "bankLoansOverdrafts",
    label: siteText("ch.ct600.bs-bank-loans-overdrafts", "Bank loans and overdrafts (due within one year)"),
    hint: siteText("ch.ct600.bs-bank-loans-overdrafts-hint", "Bank loans and overdrafts the company must repay within 12 months."),
    reference: "BS1 E.1",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubBalSht!E19"),
      lastYear: sheetCell("PubBalSht!A19"),
      workbookLabel: "Bank Overdraft",
      differenceNote: 'The spreadsheet calls this "Bank Overdraft". The format calls it "Bank loans and overdrafts".',
    },
  },
  {
    id: "tradeCreditors",
    label: siteText("ch.ct600.bs-trade-creditors", "Trade creditors (due within one year)"),
    hint: siteText("ch.ct600.bs-trade-creditors-hint", "Money the company owes its suppliers, due within 12 months."),
    reference: "BS1 E.2",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubBalSht!E16"),
      lastYear: sheetCell("PubBalSht!A16"),
      workbookLabel: "Trade Creditors",
      differenceNote:
        "The spreadsheet's \"Trade Creditors\" also holds net wages, wage deductions and dividends due. A book fills Submit's other creditors with 0 this year; move those amounts to other creditors if the company shows them apart.",
    },
  },
  {
    id: "corporationTax",
    label: siteText("ch.ct600.bs-corporation-tax", "Corporation tax (due within one year)"),
    hint: siteText(
      "ch.ct600.bs-corporation-tax-hint",
      "Corporation Tax the company owes for this and earlier periods, due within 12 months.",
    ),
    reference: "Part of taxation and social security (R, note 7)",
    termSource: REGULATIONS_URL,
    source: { thisYear: sheetCell("PubBalSht!E17"), lastYear: sheetCell("PubBalSht!A17"), workbookLabel: "Corporation Tax" },
  },
  {
    id: "taxationSocialSecurity",
    label: siteText("ch.ct600.bs-taxation-social-security", "Taxation and social security (due within one year)"),
    hint: siteText("ch.ct600.bs-taxation-social-security-hint", "VAT, PAYE and National Insurance the company owes, due within 12 months."),
    reference: "R, note 7",
    termSource: REGULATIONS_URL,
    source: { thisYear: sheetCell("PubBalSht!E18"), lastYear: sheetCell("PubBalSht!A18"), workbookLabel: "Taxation and Social Security" },
  },
  {
    id: "otherCreditors",
    label: siteText("ch.ct600.bs-other-creditors", "Other creditors (due within one year)"),
    hint: siteText(
      "ch.ct600.bs-other-creditors-hint",
      "Any other amount the company owes within 12 months, such as wages and dividends due.",
    ),
    reference: "BS1 E.4",
    termSource: REGULATIONS_URL,
  },
  {
    id: "creditorsAfterOneYear",
    label: siteText("ch.ct600.bs-creditors-after-one-year", "Creditors: amounts falling due after more than one year"),
    hint: siteText(
      "ch.ct600.bs-creditors-after-one-year-hint",
      "Amounts the company owes that fall due more than 12 months after the end of the period.",
    ),
    reference: "BS1 H",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubBalSht!F31"),
      lastYear: sheetCell("PubBalSht!B31"),
      labelCell: sheetCell("PubBalSht!C30"),
      workbookLabel: "Creditors (falling due after more than one year)",
      differenceNote:
        "The spreadsheet's F31 adds the director's loan account (E29) to the creditors due after more than one year (E30). When the director owes the company, Submit moves that amount to debtors.",
    },
  },
  {
    id: "bankLoansAfterOneYear",
    label: siteText("ch.ct600.bs-bank-loans-after-one-year", "Of which, bank loans"),
    hint: siteText("ch.ct600.bs-bank-loans-after-one-year-hint", "The part of those amounts that is bank loans and overdrafts."),
    reference: "BS1 H.1",
    termSource: REGULATIONS_URL,
  },
  {
    id: "calledUpShareCapital",
    label: siteText("ch.ct600.bs-called-up-share-capital", "Called up share capital"),
    hint: siteText("ch.ct600.bs-called-up-share-capital-hint", "The nominal value of the shares the company has issued and called up."),
    reference: "BS1 K.I",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubBalSht!F36"),
      lastYear: sheetCell("PubBalSht!B36"),
      workbookLabel: "Called up share capital 2 ordinary shares of £1.00 each",
    },
  },
  {
    id: "profitAndLossAccount",
    label: siteText("ch.ct600.bs-profit-and-loss-account", "Profit and loss account"),
    hint: siteText(
      "ch.ct600.bs-profit-and-loss-account-hint",
      "The profits kept in the company over the years, less losses and dividends paid.",
    ),
    reference: "BS1 K.V",
    termSource: REGULATIONS_URL,
    source: {
      thisYear: sheetCell("PubBalSht!F37+F38"),
      lastYear: sheetCell("PubBalSht!B37+B38"),
      workbookLabel: "Retained Profit and Loss account; Capital Reserves",
      differenceNote:
        'The spreadsheet shows "Retained Profit and Loss account" and "Capital Reserves". The format calls the reserve "Profit and loss account". Submit takes shareholders\' funds (F39) less share capital, which is F37 and F38.',
    },
  },
];

export const FIXED_ASSET_CLASSES = [
  {
    id: "landBuildings",
    label: siteText("ch.ct600.asset-class-land-buildings", "Land and buildings"),
    hint: siteText("ch.ct600.asset-class-land-buildings-hint", "Land and buildings the company owns or holds on a lease."),
    reference: "BS1 B.II.1",
    termSource: regulationsParagraph(48),
    source: { workbookLabel: "Land and Buildings", column: "B" },
  },
  {
    id: "plantMachinery",
    label: siteText("ch.ct600.asset-class-plant-machinery", "Plant and machinery etc."),
    hint: siteText("ch.ct600.asset-class-plant-machinery-hint", "Machinery, tools and equipment used in the trade."),
    reference: "BS1 B.II.2",
    termSource: regulationsParagraph(48),
    source: { workbookLabel: "Plant and Machinery", column: "C" },
  },
  {
    id: "furnitureFittings",
    label: siteText("ch.ct600.asset-class-furniture-fittings", "Fixtures and fittings"),
    hint: siteText("ch.ct600.asset-class-furniture-fittings-hint", "Furniture and fittings in the company's premises."),
    reference: "Part of BS1 B.II.2",
    termSource: regulationsParagraph(48),
    source: { workbookLabel: "Fixtures & Fittings", column: "D" },
  },
  {
    id: "computerEquipment",
    label: siteText("ch.ct600.asset-class-computer-equipment", "Computer equipment"),
    hint: siteText("ch.ct600.asset-class-computer-equipment-hint", "Computers and the equipment used with them."),
    reference: "Part of BS1 B.II.2",
    termSource: regulationsParagraph(48),
    source: { workbookLabel: "Computer Equipment", column: "E" },
  },
  {
    id: "motorVehicles",
    label: siteText("ch.ct600.asset-class-motor-vehicles", "Motor vehicles"),
    hint: siteText("ch.ct600.asset-class-motor-vehicles-hint", "Cars, vans and other vehicles the company owns."),
    reference: "Part of BS1 B.II.2",
    termSource: regulationsParagraph(48),
    source: { workbookLabel: "Motor Vehicles", column: "F" },
  },
];

export const FIXED_ASSET_FIELDS = [
  {
    id: "costAtStart",
    label: siteText("ch.ct600.asset-cost-at-start", "Cost at the start of the period"),
    hint: siteText("ch.ct600.asset-cost-at-start-hint", "What the assets of this class cost, as at the start of the period."),
    reference: "R48(1)(a), 48(2)(a)",
    termSource: regulationsParagraph(48),
    source: {
      labelCell: sheetCell("PubNotes!A7"),
      workbookLabel: "Original Cost",
      differenceNote: 'The spreadsheet heads the rows "Original Cost" and shows the start date in A8. Enter row 8.',
      row: 8,
    },
  },
  {
    id: "additions",
    label: siteText("ch.ct600.asset-additions", "Additions"),
    hint: siteText("ch.ct600.asset-additions-hint", "The cost of assets of this class bought in the period."),
    reference: "R48(1)(b)(ii)",
    termSource: regulationsParagraph(48),
    source: {
      workbookLabel: "Additions",
      differenceNote: 'The spreadsheet and Submit say "Additions". The Regulations call them acquisitions.',
      row: 9,
    },
  },
  {
    id: "disposals",
    label: siteText("ch.ct600.asset-disposals", "Disposals (cost)"),
    hint: siteText("ch.ct600.asset-disposals-hint", "The original cost of assets of this class sold or scrapped in the period."),
    reference: "R48(1)(b)(iii)",
    termSource: regulationsParagraph(48),
    source: { workbookLabel: "Disposals", row: 10 },
  },
  {
    id: "depreciationAtStart",
    label: siteText("ch.ct600.asset-depreciation-at-start", "Depreciation at the start of the period"),
    hint: siteText("ch.ct600.asset-depreciation-at-start-hint", "The depreciation charged on these assets up to the start of the period."),
    reference: "R48(3)(a)",
    termSource: regulationsParagraph(48),
    source: {
      labelCell: sheetCell("PubNotes!A13"),
      workbookLabel: "Depreciation",
      differenceNote: 'The spreadsheet heads the rows "Depreciation" and shows the start date in A14. Enter row 14.',
      row: 14,
    },
  },
  {
    id: "depreciationCharge",
    label: siteText("ch.ct600.asset-depreciation-charge", "Depreciation charge for the period"),
    hint: siteText("ch.ct600.asset-depreciation-charge-hint", "The depreciation charged on these assets for this period."),
    reference: "R48(3)(b)",
    termSource: regulationsParagraph(48),
    source: {
      workbookLabel: "Charge for the year",
      differenceNote: 'The spreadsheet calls this "Charge for the year". It is the depreciation provided for the year.',
      row: 15,
    },
  },
  {
    id: "depreciationOnDisposals",
    label: siteText("ch.ct600.asset-depreciation-on-disposals", "Depreciation on disposals"),
    hint: siteText(
      "ch.ct600.asset-depreciation-on-disposals-hint",
      "The depreciation taken off for the assets sold or scrapped in the period.",
    ),
    reference: "R48(3)(c)",
    termSource: regulationsParagraph(48),
    source: {
      workbookLabel: "On Disposals",
      differenceNote: 'The spreadsheet calls this "On Disposals". It is the depreciation taken off for the assets disposed of.',
      row: 16,
    },
  },
];

export const ACCOUNTS_TEXT_FIELDS = [
  {
    id: "principalActivity",
    label: siteText("ch.ct600.principal-activity", "Principal activity"),
    type: "text",
    smallOnly: true,
    hint: siteText("ch.ct600.principal-activity-hint", "What the company does, in a few words."),
    reference: "Notes",
    termSource: companiesActSection(416),
    source: { thisYear: sheetCell("OpenAccounts!E8"), workbookLabel: "The principal activity of the company is" },
  },
  {
    id: "accountingPolicies",
    label: siteText("ch.ct600.accounting-policies", "Accounting policies"),
    type: "textarea",
    smallOnly: true,
    hint: siteText(
      "ch.ct600.accounting-policies-hint",
      "How the accounts are prepared, for example under FRS 102 section 1A on the historical cost basis.",
    ),
    reference: "R44",
    termSource: regulationsParagraph(44),
  },
  {
    id: "directors",
    label: siteText("ch.ct600.directors", "Directors who held office during the period (one name per line)"),
    reviewLabel: siteText("ch.ct600.directors-review", "Directors who held office during the period"),
    type: "textarea",
    smallOnly: true,
    hint: siteText("ch.ct600.directors-hint", "Everyone who was a director at any time in the period, one name per line."),
    reference: "CA 416(1)(a)",
    termSource: companiesActSection(416),
    source: {
      thisYear: sheetCell("OpenAccounts!E5+E6"),
      workbookLabel: "First Director's Name; Second Director's Name",
      differenceNote: "The spreadsheet names up to two directors, first and second. List every director who held office in the period.",
    },
  },
  {
    id: "directorsAdvanceName",
    label: siteText(
      "ch.ct600.directors-advance-name",
      "Director who owes the company money (when the balance sheet shows amounts owed by directors)",
    ),
    type: "text",
    hint: siteText("ch.ct600.directors-advance-name-hint", "The director who owed the company money in the period."),
    reference: "CA 413(1)",
    termSource: companiesActSection(413),
    source: {
      thisYear: sheetCell("OpenAccounts!E5"),
      workbookLabel: "First Director's Name",
      differenceNote: "A book names the first director (OpenAccounts!E5). Change it when another director owes the company.",
    },
  },
  {
    id: "directorsAdvanceTerms",
    label: siteText("ch.ct600.directors-advance-terms", "Interest rate and main conditions of that director's advance"),
    type: "text",
    hint: siteText("ch.ct600.directors-advance-terms-hint", "The interest rate, any security and when the advance is repaid."),
    reference: "CA 413(3)(b), (c)",
    termSource: companiesActSection(413),
  },
  {
    id: "directorsAdvanceAtStart",
    label: siteText("ch.ct600.directors-advance-at-start", "Owed by that director at the start of the period, in whole pounds"),
    type: "count",
    hint: siteText("ch.ct600.directors-advance-at-start-hint", "What that director owed the company at the start of the period."),
    reference: "CA 413(3)",
    termSource: companiesActSection(413),
    source: {
      thisYear: sheetCell("OpenAccounts!E30"),
      workbookLabel: "Directors Loan Account",
      differenceNote:
        "The spreadsheet's opening director's loan account (OpenAccounts!E30) is below 0 when the director owes the company. Submit fills the amount owed, with the sign turned.",
    },
  },
  {
    id: "directorsAdvanceMade",
    label: siteText("ch.ct600.directors-advance-made", "Advanced to that director in the period, in whole pounds"),
    type: "count",
    hint: siteText("ch.ct600.directors-advance-made-hint", "What the company advanced to that director in the period."),
    reference: "CA 413(3)(a)",
    termSource: companiesActSection(413),
    source: {
      thisYear: `${sheetCell("PubBalSht!E29")}-${sheetCell("OpenAccounts!E30")}`,
      workbookLabel: "Directors Loan Account, end less start",
      differenceNote:
        "The spreadsheet holds the balance at the start and at the end only. A book fills the increase as advanced, or the decrease as repaid; enter the amounts when there were both.",
    },
  },
  {
    id: "directorsAdvanceRepaid",
    label: siteText("ch.ct600.directors-advance-repaid", "Repaid by that director in the period, in whole pounds"),
    type: "count",
    hint: siteText("ch.ct600.directors-advance-repaid-hint", "What that director repaid in the period."),
    reference: "CA 413(3)(d)",
    termSource: companiesActSection(413),
    source: {
      thisYear: `${sheetCell("OpenAccounts!E30")}-${sheetCell("PubBalSht!E29")}`,
      workbookLabel: "Directors Loan Account, start less end",
      differenceNote:
        "The spreadsheet holds the balance at the start and at the end only. A book fills the increase as advanced, or the decrease as repaid; enter the amounts when there were both.",
    },
  },
  {
    id: "averageEmployees",
    label: siteText("ch.ct600.average-employees", "Average number of employees during the period"),
    type: "count",
    hint: siteText(
      "ch.ct600.average-employees-hint",
      "The average number of people the company employed in the period, directors included. Enter 0 for none.",
    ),
    reference: "CA 411(1)",
    termSource: companiesActSection(411),
  },
  {
    id: "directorName",
    label: siteText("ch.ct600.director-name", "Director approving the accounts"),
    type: "text",
    hint: siteText("ch.ct600.director-name-hint", "The director who signs the balance sheet for the board."),
    reference: "CA 414(1)",
    termSource: companiesActSection(414),
    source: {
      thisYear: sheetCell("PubBalSht!C56"),
      workbookLabel: "Name of Director",
      differenceNote: 'The spreadsheet\'s "Name of Director" (PubBalSht!C56) shows the first director (OpenAccounts!E5).',
    },
  },
  {
    id: "directorDateApproved",
    label: siteText("ch.ct600.director-date-approved", "Date approved"),
    type: "date",
    hint: siteText("ch.ct600.director-date-approved-hint", "The day the board approved the accounts. It is not after today."),
    reference: "CA 414",
    termSource: companiesActSection(414),
    source: {
      thisYear: sheetCell("PubBalSht!C57"),
      workbookLabel: "Date Signed",
      differenceNote:
        "The spreadsheet's \"Date Signed\" shows today's date (TODAY()). A book does not fill this field; enter the date the board approved the accounts.",
    },
  },
];

// The fields of the note on advances to directors.
const DIRECTORS_ADVANCE_IDS = [
  "directorsAdvanceName",
  "directorsAdvanceTerms",
  "directorsAdvanceAtStart",
  "directorsAdvanceMade",
  "directorsAdvanceRepaid",
];

// The ids of the micro-entity accounts' amounts, in the order the form shows them.
export function microAmountIds() {
  const ids = [];
  for (const year of ["current", "prior"]) {
    for (const { id: field } of MICRO_PROFIT_AND_LOSS_FIELDS) ids.push(microId(year, field));
    for (const { id: field } of MICRO_BALANCE_SHEET_FIELDS) ids.push(microId(year, field));
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

/** The workbook cell of one fixed asset note figure: the class's column on the field's row. */
export function noteSheetCell(className, field) {
  const { column } = FIXED_ASSET_CLASSES.find(({ id }) => id === className).source;
  const { row } = FIXED_ASSET_FIELDS.find(({ id }) => id === field).source;
  return sheetCell(`PubNotes!${column}${row}`);
}

// The ids of the accounts section's amounts, in the order the form shows them.
export function accountAmountIds() {
  const ids = [];
  for (const year of ["current", "prior"]) {
    for (const { id: field } of PROFIT_AND_LOSS_FIELDS) ids.push(profitAndLossId(year, field));
    for (const { id: field } of BALANCE_SHEET_FIELDS) ids.push(balanceSheetId(year, field));
  }
  for (const { id: className } of FIXED_ASSET_CLASSES) for (const { id: field } of FIXED_ASSET_FIELDS) ids.push(noteId(className, field));
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
  for (const { id: field } of PROFIT_AND_LOSS_FIELDS) figures[field] = amountOf(values, profitAndLossId(year, field), true);
  figures.grossProfit = figures.turnover - figures.costOfSales;
  figures.operatingProfit = figures.grossProfit - figures.administrativeExpenses;
  figures.profitBeforeTax = figures.operatingProfit + figures.interestReceivable;
  figures.profit = figures.profitBeforeTax - figures.tax;
  return figures;
}

function balanceSheetOf(values, year) {
  const figures = {};
  for (const { id: field } of BALANCE_SHEET_FIELDS) figures[field] = amountOf(values, balanceSheetId(year, field), true);
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

// Micro-entity accounts show no amounts owed by directors on the balance sheet, so the note is
// present when any of its fields holds something, and the closing balance is the opening balance
// plus the advances less the repayments.
function microDirectorsAdvancesOf(values) {
  const typed = (id) => String(values[id] ?? "").trim();
  if (DIRECTORS_ADVANCE_IDS.every((id) => typed(id) === "")) return undefined;
  const whole = (id) => Number(typed(id) || 0);
  const balanceAtStart = whole("directorsAdvanceAtStart");
  const advanced = whole("directorsAdvanceMade");
  const repaid = whole("directorsAdvanceRepaid");
  return [
    {
      name: typed("directorsAdvanceName"),
      terms: typed("directorsAdvanceTerms"),
      balanceAtStart,
      advanced,
      repaid,
      balanceAtEnd: balanceAtStart + advanced - repaid,
    },
  ];
}

function microProfitAndLossOf(values, year) {
  const lines = {};
  for (const { id: field } of MICRO_PROFIT_AND_LOSS_FIELDS) lines[field] = amountOf(values, microId(year, field), true);
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
  return MICRO_PROFIT_AND_LOSS_FIELDS.some(({ id: field }) => !isBlank(values[microId("prior", field)]));
}

function microBalanceSheetOf(values, year) {
  const sheet = {};
  for (const { id: field } of MICRO_BALANCE_SHEET_FIELDS) sheet[field] = amountOf(values, microId(year, field), true);
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
  for (const { id: className } of FIXED_ASSET_CLASSES) {
    const figures = {};
    for (const { id: field } of FIXED_ASSET_FIELDS) figures[field] = amountOf(values, noteId(className, field), true);
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
 * The accounts the form holds, in the request's shape. First accounts give the date of
 * incorporation and carry no prior-year balance sheet.
 * @param {Record<string, string|boolean>} values - the form's values by element id
 * @param {string} [dateOfIncorporation] - ISO date, given only for the company's first accounts
 */
export function accountsFromValues(values, dateOfIncorporation) {
  const includePrior = values.includeComparatives === true;
  if (regimeOf(values) === "micro") {
    const microDirectorsAdvances = microDirectorsAdvancesOf(values);
    return {
      periodStart: values.periodStart,
      periodEnd: values.periodEnd,
      averageEmployees: Number(values.averageEmployees),
      director: { name: String(values.directorName ?? "").trim(), dateApproved: values.directorDateApproved },
      ...(dateOfIncorporation ? { dateOfIncorporation } : {}),
      balanceSheet: {
        currentYear: microBalanceSheetOf(values, "current"),
        ...(dateOfIncorporation ? {} : { priorYear: microBalanceSheetOf(values, "prior") }),
      },
      profitAndLoss: {
        currentYear: microProfitAndLossOf(values, "current"),
        ...(includePrior && hasMicroPriorProfitAndLoss(values) ? { priorYear: microProfitAndLossOf(values, "prior") } : {}),
      },
      ...(microDirectorsAdvances ? { directorsAdvances: microDirectorsAdvances } : {}),
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
      ...(dateOfIncorporation ? { dateOfIncorporation } : {}),
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
 * The preview and submit request body for the form's values. The company's profile facts say
 * whether the accounts are its first, which give the date of incorporation.
 * @param {Record<string, string|boolean>} values
 * @param {{companyName: string, companyNumber: string, dateOfCreation?: string, accountsLastPeriodStart?: string}} company
 * @param {object} [workingSheet]
 */
export function ct600RequestFromValues(values, company, workingSheet) {
  const figures = figuresFromValues(values, company, workingSheet);
  return {
    companyNumber: company.companyNumber,
    companyName: company.companyName,
    registeredOffice: company.registeredOffice,
    ...accountsFromValues(values, dateOfIncorporationFor(company, values.periodStart)),
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

export const LOAN_ROW_FIELDS = [
  {
    id: "Name",
    label: siteText("ch.ct.loan-name", "Name of participator or associate"),
    hint: siteText("ch.ct.loan-name-hint", "The participator, or their associate, the loan was made to."),
    reference: "CT600A A10 column A",
    termSource: CT600A_GUIDE_URL,
    source: {
      thisYear: sheetCell("OpenAccounts!E5"),
      workbookLabel: "First Director's Name",
      differenceNote: "A book names the first director (OpenAccounts!E5) for the one loan row it fills.",
    },
  },
  {
    id: "Amount",
    label: siteText("ch.ct.loan-amount", "Amount still owed at the end of the period"),
    hint: siteText("ch.ct.loan-amount-hint", "For example, £12,000"),
    reference: "CT600A A10 column B; sum A15",
    termSource: CT600A_GUIDE_URL,
    source: {
      thisYear: `${sheetCell("PubBalSht!E29")}-${sheetCell("OpenAccounts!E30")}`,
      workbookLabel: "Directors Loan Account, end less start",
      differenceNote:
        "The spreadsheet holds the director's loan account at the start and at the end. A book fills the increase in the amount the director owes. Enter each loan made in the period and still owed.",
    },
  },
  {
    id: "Lent",
    label: siteText("ch.ct.loan-lent", "Of this, the amount lent on or after the rate change"),
    hint: siteText("ch.ct.loan-lent-hint", "Leave it empty when none was lent after the change"),
    reference: "CT600A A20",
    termSource: CT600A_GUIDE_URL,
  },
  {
    id: "Rate",
    label: siteText("ch.ct.loan-rate", "Section 455 rate for this loan, if you want to use another (%)"),
    hint: siteText(
      "ch.ct.loan-rate-hint",
      "Leave it empty to use the rate shown with the worked tax. A rate you enter is not checked against the tax data.",
    ),
    reference: "CT600A A20",
    termSource: CT600A_GUIDE_URL,
  },
];
export const REPAYMENT_ROW_FIELDS = [
  {
    id: "Name",
    label: siteText("ch.ct.participator", "Name of participator or associate"),
    hint: siteText("ch.ct.repayment-name-hint", "The participator who repaid, or whose loan was released or written off."),
    reference: "CT600A A25 or A50 column A",
    termSource: CT600A_GUIDE_URL,
  },
  {
    id: "Date",
    label: siteText("ch.ct.date", "Date of repayment, release or write-off"),
    hint: siteText(
      "ch.ct.repayment-date-hint",
      "The day of the repayment, release or write-off. It decides whether it goes on part 2 or part 3 of the CT600A.",
    ),
    reference: "CT600A A25 or A50 column D",
    termSource: CT600A_GUIDE_URL,
  },
  {
    id: "Repaid",
    label: siteText("ch.ct.amount-repaid", "Amount repaid"),
    hint: siteText("ch.ct.amount-repaid-hint", "Leave it empty when none was repaid"),
    reference: "CT600A A25 or A50 column B; A30 or A55",
    termSource: CT600A_GUIDE_URL,
  },
  {
    id: "Released",
    label: siteText("ch.ct.amount-released", "Amount released or written off"),
    hint: siteText("ch.ct.amount-released-hint", "Leave it empty when none was released or written off"),
    reference: "CT600A A25 or A50 column C; A35 or A60",
    termSource: CT600A_GUIDE_URL,
  },
];

// The questions the Company Tax Return page asks around the boxes: where the accounts go, the copy
// Companies House gets, last year's figures, the fixed assets note and the start of a long period.
export const PAGE_QUESTION_FIELDS = [
  {
    id: "sendTo",
    label: siteText("ch.ct.where-sending", "Where are you sending these accounts?"),
    hint: SEND_TO_HMRC_ONLY_HINT,
    reference: "Accounts and computations",
    termSource: guideUrl("and-90-accounts-and-computations"),
  },
  {
    id: "companiesHouseCopy",
    label: siteText("ch.ct.which-copy", "Which copy goes to Companies House?"),
    hint: siteText(
      "ch.ct.which-copy-hint",
      "Companies House publishes what it receives. Filleted accounts leave the profit and loss account and the directors' report out of the public copy. HMRC gets the full accounts either way.",
    ),
    reference: "CA 444(1)",
    termSource: companiesActSection(444),
  },
  {
    id: "includeComparatives",
    label: siteText("ch.ct.include-comparatives", "Include last year's figures"),
    hint: siteText(
      "ch.ct.include-comparatives-hint",
      "Last year's figures show beside this year's. Accounts that are not the company's first carry them.",
    ),
    reference: "R7(1)",
    termSource: regulationsParagraph(7),
    source: { workbookLabel: "PubP&L column B; PubBalSht columns A and B" },
  },
  {
    id: "includeFixedAssetNote",
    label: siteText("ch.ct.include-fixed-assets-note", "Include the tangible fixed assets note"),
    hint: siteText(
      "ch.ct.include-fixed-assets-note-hint",
      "The note gives the cost and the depreciation of each class of tangible fixed asset.",
    ),
    reference: "R48",
    termSource: regulationsParagraph(48),
    source: {
      thisYear: sheetCell("PubNotes!A3"),
      workbookLabel: "1. Tangible Assets",
      differenceNote:
        "The spreadsheet calls the note \"1. Tangible Assets\". The Regulations' note is on fixed assets; Submit's note covers the tangible ones.",
    },
  },
  {
    id: "firstPeriodStart",
    label: siteText("ch.ct.first-period-start", "Does the first accounting period start on the first day of the accounts?"),
    hint: siteText(
      "ch.ct.first-period-start-hint",
      "Answer Yes when the company's accounting period began on the first day of these accounts. Submit files a long period only from there.",
    ),
    reference: "Box 30 of return 1",
    termSource: guideUrl("and-35-period-of-the-return"),
  },
];

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
  ["current", "prior"].flatMap((year) => MICRO_BALANCE_SHEET_FIELDS.map(({ id: field }) => microId(year, field))),
);

function isMicroBalanceSheetId(id) {
  return MICRO_BALANCE_SHEET_IDS.has(id);
}

// A micro-entity's accounts show last year's balance sheet beside this year's unless they are its first, which leave it blank.
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

// The note on micro-entity accounts states the advance to the director who approves them, as the
// accounts route requires, and its closing balance cannot be below nothing.
function microDirectorsAdvancesProblems(values, problem) {
  const advance = accountsFromValues(values).directorsAdvances?.[0];
  if (!advance) return;
  if (advance.name === "")
    problem("directorsAdvanceName", siteText("ch.ct600.problem-advance-name", "Name the director who owes the company money"));
  else if (advance.name !== String(values.directorName ?? "").trim()) {
    problem(
      "directorsAdvanceName",
      siteText(
        "ch.ct600.problem-advance-micro-signer",
        "Micro-entity accounts state the advance to the director approving them: name that director here",
      ),
    );
  }
  if (advance.terms === "") {
    problem(
      "directorsAdvanceTerms",
      siteText("ch.ct600.problem-advance-terms", "State the interest rate and the main conditions of the advance"),
    );
  }
  for (const id of ["directorsAdvanceAtStart", "directorsAdvanceMade", "directorsAdvanceRepaid"]) {
    if (!/^\d*$/.test(String(values[id] ?? "").trim()))
      problem(id, siteText("ch.ct600.problem-advance-whole", "Enter a whole number of pounds, or leave it empty for none"));
  }
  if (advance.balanceAtEnd < 0) {
    problem(
      "directorsAdvanceRepaid",
      siteText(
        "ch.ct600.problem-advance-micro-below-nothing",
        "Owed at the start {start} plus advanced {advanced} less repaid {repaid} leaves less than nothing owed at the end",
        { start: advance.balanceAtStart, advanced: advance.advanced, repaid: advance.repaid },
      ),
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
    microDirectorsAdvancesProblems(values, problem);
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
    for (const { id: field } of BALANCE_SHEET_FIELDS) entries.push([balanceSheetId(prefix, field), text(sheet[field])]);
  };
  const plEntries = (prefix, pl) => {
    for (const { id: field } of PROFIT_AND_LOSS_FIELDS) entries.push([profitAndLossId(prefix, field), text(pl[field])]);
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
    for (const { id: className } of FIXED_ASSET_CLASSES) {
      for (const { id: field } of FIXED_ASSET_FIELDS) entries.push([noteId(className, field), text(note[className]?.[field] ?? 0)]);
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
  for (const { id: field } of MICRO_PROFIT_AND_LOSS_FIELDS) entries.push([microId("current", field), text(pl[field])]);
  for (const [year, key] of [
    ["current", "currentYear"],
    ["prior", "priorYear"],
  ]) {
    const sheet = microAccounts.balanceSheet?.[key];
    if (sheet) for (const { id: field } of MICRO_BALANCE_SHEET_FIELDS) entries.push([microId(year, field), text(sheet[field])]);
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

const FIXED_ASSET_CLASS_NAMES = FIXED_ASSET_CLASSES.map(({ id: className }) => className);

function figureEntries(idOf, year, fields, figures) {
  return fields
    .filter(({ id: field }) => Number.isFinite(figures?.[field]))
    .map(({ id: field }) => [idOf(year, field), text(figures[field])]);
}

/**
 * The accounts section's values from an iXBRL accounts document the diya-gl reader mapped, as
 * [element id, value] pairs. The regime the document is for is the regime the form opens on, and the
 * depreciation added back starts as the fixed asset note's charge for the year.
 * @param {object} mapped - mapIxbrlAccounts output
 */
export function formEntriesFromIxbrl(mapped) {
  const micro = mapped.regime === "micro";
  const lines = (micro ? MICRO_BALANCE_SHEET_FIELDS : BALANCE_SHEET_FIELDS).map(({ id: field }) => field);
  const currentYear = foldBalanceSheetHeadings(mapped.balanceSheet.currentYear, lines);
  const priorYear = foldBalanceSheetHeadings(mapped.balanceSheet.priorYear, lines);
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
      for (const { id: field } of FIXED_ASSET_FIELDS) entries.push([noteId(className, field), text(note[className][field] ?? 0)]);
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

// The kinds of form field a filed box fills back as it was filed.
const FILED_BOX_TYPES = new Set(["whole-pounds", "pounds-and-pence", "count", "text"]);

/**
 * The form values a filed Company Tax Return's boxes give back: the period from boxes 30 and 35,
 * and each form field that files to one box takes that box as filed.
 * @param {Record<string, string|number>} boxes
 */
export function formEntriesFromFiledBoxes(boxes) {
  const entries = [];
  const boxValue = (box) => boxes?.[box] ?? boxes?.[String(box)];
  if (boxValue(30)) entries.push(["periodStart", String(boxValue(30))]);
  if (boxValue(35)) entries.push(["periodEnd", String(boxValue(35))]);
  for (const field of CT600_FORM_FIELDS) {
    if (field.box === undefined || !FILED_BOX_TYPES.has(field.type)) continue;
    const value = boxValue(field.box);
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "number") entries.push([field.id, String(value)]);
    else entries.push([field.id, field.type === "pounds-and-pence" ? value.toFixed(2) : text(value)]);
  }
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
  if (current) for (const { id: field } of PROFIT_AND_LOSS_FIELDS) entries.push([profitAndLossId("current", field), text(current[field])]);
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
        MICRO_PROFIT_AND_LOSS_FIELDS.map(({ id: field, label }) => ({ id: microId(year, field), label: yearLabel(label, when) })),
        values,
      ),
    );
  }
  for (const year of ["current", "prior"]) {
    const when = year === "current" ? THIS_YEAR : LAST_YEAR;
    rows.push(
      ...amountRows(
        MICRO_BALANCE_SHEET_FIELDS.map(({ id: field, label }) => ({ id: microId(year, field), label: yearLabel(label, when) })),
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
        PROFIT_AND_LOSS_FIELDS.map(({ id: field, label }) => ({ id: profitAndLossId(prefix, field), label: yearLabel(label, when) })),
        values,
      ),
      ...amountRows(
        BALANCE_SHEET_FIELDS.map(({ id: field, label }) => ({ id: balanceSheetId(prefix, field), label: yearLabel(label, when) })),
        values,
      ),
    );
  }
  if (values.includeFixedAssetNote === true) {
    for (const { id: className, label: title } of FIXED_ASSET_CLASSES) {
      rows.push(
        ...amountRows(
          FIXED_ASSET_FIELDS.map(({ id: field, label }) => ({
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
