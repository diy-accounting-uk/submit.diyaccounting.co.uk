// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/self-employment-fields.js
// The register entry of each self-employment field on the Income Tax pages, by the id of its input:
// the SA103F box HMRC maps the field to, the link to the SA103F notes, and the cell of the Self
// Employed package's Financialaccounts.xlsx that holds the figure. The boxes and cells are HMRC's
// SA103-to-MTD mapping (sa103f_mapping_v3.csv) joined with the SE Full sheet's cell map, as
// diya-gl's data/hmrc/sa103-mtd-mapping.json records them.

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

export const SA103F_NOTES_URL = "https://www.gov.uk/government/publications/self-assessment-self-employment-full-sa103f";

const WORKBOOK = "Financialaccounts.xlsx";
const SHEET = "SE Full";

function entry(box, cell) {
  return {
    reference: `SA103F box ${box}`,
    termSource: SA103F_NOTES_URL,
    termSourceText: siteText("itsa.field-source-sa103f", "SA103F notes"),
    ...(cell && {
      source: {
        thisYear: `${WORKBOOK}!${SHEET}!${cell}`,
        differenceNote: siteText("itsa.field-source-se-package", "The Self Employed package's workbook."),
      },
    }),
  };
}

// The itemised expenses (boxes 17 to 30) and the disallowable part of each (boxes 32 to 45).
const EXPENSES = [
  ["costOfGoods", 17, "D66", 32, null],
  ["paymentsToSubcontractors", 18, "D70", 33, null],
  ["wagesAndStaffCosts", 19, "D74", 34, null],
  ["carVanTravelExpenses", 20, "D78", 35, null],
  ["premisesRunningCosts", 21, "D82", 36, null],
  ["maintenanceCosts", 22, "D86", 37, null],
  ["adminCosts", 23, "D90", 38, null],
  ["businessEntertainmentCosts", 24, "D94", 39, null],
  ["advertisingCosts", 24, "D94", 39, null],
  ["interestOnBankOtherLoans", 25, "D98", 40, null],
  ["financeCharges", 26, "D102", 41, null],
  ["irrecoverableDebts", 27, "D106", 42, null],
  ["professionalFees", 28, "D110", 43, null],
  ["depreciation", 29, "D114", 44, "O114"],
  ["otherExpenses", 30, "D118", 45, null],
];

/** The fields of a quarterly update and of its amendment, by input id. */
export function quarterlyFields() {
  const fields = {
    turnover: entry(15, "D55"),
    otherIncome: entry(16, "O55"),
    taxTakenOffTradingIncome: entry(82, null),
  };
  for (const [id, box, cell, disallowableBox, disallowableCell] of EXPENSES) {
    fields[id] = entry(box, cell);
    fields[`${id}Disallowable`] = entry(disallowableBox, disallowableCell);
  }
  return fields;
}

/** The allowances and adjustments of the annual submission, by input id. */
export function annualFields() {
  return {
    tradingIncomeAllowance: entry("16.1", null),
    annualInvestmentAllowance: entry(49, "D139"),
    capitalAllowanceMainPool: entry(50, "D144"),
    capitalAllowanceSpecialRatePool: entry(51, "D147"),
    zeroEmissionsCarAllowance: entry("52.1", "D152"),
    enhancedCapitalAllowance: entry(55, "O144"),
    businessPremisesRenovationAllowance: entry(55, "O144"),
    allowanceOnSales: entry(56, "O149"),
    balancingChargeOther: entry(59, "O160"),
    balancingChargeBpra: entry(59, "O160"),
    goodsAndServicesOwnUse: entry(60, "D169"),
    includedNonTaxableProfits: entry(62, "D179"),
    basisAdjustment: entry(68, "D197"),
    accountingAdjustment: entry(71, "D210"),
    transitionProfitAmount: entry("73.3", "D201"),
    transitionProfitAccelerationAmount: entry("73.3", "D201"),
    outstandingBusinessIncome: entry(75, "O204"),
  };
}

/** The adjustments to the business source adjustable summary: the box each adjusts, with no cell of its own. */
export function adjustmentFields() {
  return {
    adjustTurnover: entry(15, null),
    adjustCostOfGoods: entry(17, null),
  };
}
