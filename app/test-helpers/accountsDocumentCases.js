// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-helpers/accountsDocumentCases.js
// One accounts document per regime, built from the Companies House test-service cases (micro and
// dormant) and a small company case with comparatives and a fixed asset note, with the balance
// sheet labels a reader must see on each, in order.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildMicroEntityAccounts } from "../services/microEntityAccountsIxbrl.js";
import { buildSmallCompanyAccounts } from "../services/smallCompanyAccountsIxbrl.js";
import { buildCtComputations } from "../services/ctComputationsIxbrl.js";

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const MICRO_BALANCE_SHEET_LABELS = [
  "Fixed assets",
  "Current assets",
  "Creditors: amounts falling due within one year",
  "Net current assets",
  "Total assets less current liabilities",
  "Creditors: amounts falling due after more than one year",
  "Net assets",
  "Capital and reserves",
  "Called up share capital",
  "Profit and loss account",
  "Shareholders' funds",
];

const SMALL_BALANCE_SHEET_LABELS = [
  "Fixed assets",
  "Current assets",
  "Stocks",
  "Debtors",
  "Cash at bank and in hand",
  "Creditors: amounts falling due within one year",
  "Trade creditors",
  "Corporation tax",
  "Other creditors",
  "Net current assets",
  "Total assets less current liabilities",
  "Creditors: amounts falling due after more than one year",
  "Net assets",
  "Capital and reserves",
  "Called up share capital",
  "Profit and loss account",
  "Shareholders' funds",
];

export const SMALL_COMPANY_CASE_INPUT = {
  companyNumber: "04549236",
  companyName: "MORGAN TECHNICAL LIMITED",
  registeredOffice: { addressLine1: "Unit 4 Morgan Court", cityOrTown: "Cardiff", postalCode: "CF10 1AA" },
  periodStart: "2025-04-01",
  periodEnd: "2026-03-31",
  averageNumberOfEmployees: 4,
  principalActivity: "Software consultancy",
  accountingPolicies:
    "The financial statements have been prepared under the historical cost convention and in accordance with FRS 102 section 1A. Tangible fixed assets are depreciated at 25% a year on cost.",
  directors: ["Alan James Morgan", "Alex Jones"],
  directorName: "Alan James Morgan",
  dateOfApproval: "2026-09-15",
  balanceSheet: {
    current: {
      fixedAssets: 10000,
      stocks: 500,
      debtors: 2500,
      cashAtBank: 12000,
      tradeCreditors: 1000,
      corporationTax: 1500,
      otherCreditors: 500,
      creditorsAfterOneYear: 2000,
      calledUpShareCapital: 100,
      profitAndLossAccount: 19900,
      capitalAndReserves: 20000,
    },
    prior: {
      fixedAssets: 9500,
      stocks: 400,
      debtors: 2000,
      cashAtBank: 7100,
      tradeCreditors: 900,
      corporationTax: 1000,
      otherCreditors: 600,
      creditorsAfterOneYear: 1500,
      calledUpShareCapital: 100,
      profitAndLossAccount: 14900,
      capitalAndReserves: 15000,
    },
  },
  profitAndLoss: {
    current: {
      turnover: 50000,
      costOfSales: 20000,
      grossProfit: 30000,
      administrativeExpenses: 25000,
      operatingProfit: 5000,
      interestReceivable: 100,
      profitBeforeTax: 5100,
      tax: 1000,
      profit: 4100,
    },
    prior: {
      turnover: 40000,
      costOfSales: 16000,
      grossProfit: 24000,
      administrativeExpenses: 21000,
      operatingProfit: 3000,
      interestReceivable: 0,
      profitBeforeTax: 3000,
      tax: 600,
      profit: 2400,
    },
  },
  fixedAssetNote: {
    landBuildings: {
      costAtStart: 6000,
      additions: 0,
      disposals: 0,
      depreciationAtStart: 0,
      depreciationCharge: 0,
      depreciationOnDisposals: 0,
    },
    computerEquipment: {
      costAtStart: 5000,
      additions: 1000,
      disposals: 0,
      depreciationAtStart: 1500,
      depreciationCharge: 500,
      depreciationOnDisposals: 0,
    },
  },
};

export const SMALL_COMPANY_BANK_LINES_CASE_INPUT = {
  ...SMALL_COMPANY_CASE_INPUT,
  balanceSheet: {
    current: {
      ...SMALL_COMPANY_CASE_INPUT.balanceSheet.current,
      bankLoansOverdrafts: 300,
      taxationSocialSecurity: 200,
      accruals: 400,
      bankLoansAfterOneYear: 1200,
      profitAndLossAccount: 19000,
      capitalAndReserves: 19100,
    },
    prior: {
      ...SMALL_COMPANY_CASE_INPUT.balanceSheet.prior,
      bankLoansOverdrafts: 200,
      taxationSocialSecurity: 150,
      accruals: 250,
      bankLoansAfterOneYear: 700,
      profitAndLossAccount: 14300,
      capitalAndReserves: 14400,
    },
  },
};

export const SMALL_COMPANY_FORMAT_2_CASE_INPUT = {
  ...SMALL_COMPANY_CASE_INPUT,
  profitAndLossFormat: 2,
  profitAndLoss: {
    current: {
      turnover: 50000,
      changeInStocks: 100,
      ownWorkCapitalised: 400,
      otherOperatingIncome: 500,
      rawMaterialsConsumables: 9000,
      otherExternalCharges: 3000,
      staffCosts: 20000,
      depreciation: 500,
      otherOperatingExpenses: 13000,
      operatingProfit: 5500,
      interestReceivable: 100,
      interestPayable: 200,
      profitBeforeTax: 5400,
      tax: 1000,
      profit: 4400,
    },
    prior: {
      turnover: 40000,
      changeInStocks: -50,
      ownWorkCapitalised: 0,
      otherOperatingIncome: 250,
      rawMaterialsConsumables: 8000,
      otherExternalCharges: 2000,
      staffCosts: 16000,
      depreciation: 400,
      otherOperatingExpenses: 10800,
      operatingProfit: 3000,
      interestReceivable: 0,
      interestPayable: 0,
      profitBeforeTax: 3000,
      tax: 600,
      profit: 2400,
    },
  },
};

export const SMALL_COMPANY_FORMAT_2_PROFIT_AND_LOSS_LABELS = [
  "Turnover",
  "Change in stocks of finished goods and in work in progress",
  "Own work capitalised",
  "Other operating income",
  "Raw materials and consumables",
  "Other external charges",
  "Staff costs",
  "Depreciation and other amounts written off tangible and intangible fixed assets",
  "Other operating expenses",
  "Operating profit",
  "Interest receivable and similar income",
  "Interest payable and similar expenses",
  "Profit on ordinary activities before taxation",
  "Tax on profit on ordinary activities",
  "Profit for the financial year",
];

function microInputFromTestServiceCase(testCase) {
  return {
    companyNumber: testCase.companyNumber,
    companyName: testCase.companyName,
    registeredOffice: testCase.registeredOffice,
    periodStart: testCase.periodStart,
    periodEnd: testCase.periodEnd,
    balanceSheet: { current: testCase.balanceSheet.currentYear, prior: testCase.balanceSheet.priorYear },
    averageNumberOfEmployees: testCase.averageEmployees,
    directorName: testCase.director.name,
    dateOfApproval: testCase.director.dateApproved,
    ...(testCase.dormant
      ? {
          dormant: true,
          dormantTradingStatus: testCase.dormantTradingStatus,
          shareClass: testCase.shareClass,
          nominalValue: testCase.nominalValue,
        }
      : {}),
  };
}

/**
 * Every accounts document a test should render: name, the XHTML, the balance sheet labels in
 * the order a reader sees them, and the title of the last page.
 * @returns {{name: string, xhtml: string, balanceSheetLabels: string[]}[]}
 */
export function accountsDocumentCases() {
  const testServiceCases = JSON.parse(
    readFileSync(join(REPOSITORY_ROOT, "scripts", "fixtures", "companies-house-test-service-cases.json"), "utf8"),
  );
  const microCases = testServiceCases
    .filter((testCase) => testCase.type === "accounts" && !testCase.smallCompany)
    .map((testCase) => ({
      name: testCase.name,
      xhtml: buildMicroEntityAccounts(microInputFromTestServiceCase(testCase)),
      balanceSheetLabels: MICRO_BALANCE_SHEET_LABELS,
    }));
  return [
    ...microCases,
    {
      name: "small-company-accounts",
      xhtml: buildSmallCompanyAccounts(SMALL_COMPANY_CASE_INPUT),
      balanceSheetLabels: SMALL_BALANCE_SHEET_LABELS,
    },
    {
      name: "small-company-accounts-format-2",
      xhtml: buildSmallCompanyAccounts(SMALL_COMPANY_FORMAT_2_CASE_INPUT),
      balanceSheetLabels: SMALL_BALANCE_SHEET_LABELS,
    },
    {
      name: "small-company-accounts-filleted",
      xhtml: buildSmallCompanyAccounts({ ...SMALL_COMPANY_CASE_INPUT, filleted: true }),
      balanceSheetLabels: SMALL_BALANCE_SHEET_LABELS,
    },
  ];
}

/**
 * The CT computations document that goes with the small company case.
 * @returns {string}
 */
export function computationsDocumentCase() {
  return buildCtComputations({
    companyName: SMALL_COMPANY_CASE_INPUT.companyName,
    companyNumber: SMALL_COMPANY_CASE_INPUT.companyNumber,
    utr: "8596148860",
    periodStart: SMALL_COMPANY_CASE_INPUT.periodStart,
    periodEnd: SMALL_COMPANY_CASE_INPUT.periodEnd,
    tradeName: SMALL_COMPANY_CASE_INPUT.principalActivity,
    lines: {
      profitLossPerAccounts: 5100,
      nonTradingLoanRelationshipCredits: 100,
      depreciation: 500,
      amortisation: 0,
      entertaining: 0,
      donations: 0,
      adjustedProfitBeforeCapitalAllowances: 5500,
      totalCapitalAllowances: 1000,
      adjustedProfit: 4500,
    },
  });
}
