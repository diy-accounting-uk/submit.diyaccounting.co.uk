// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/smallCompanyAccountsRequest.js
// Validates the `smallCompany` section of an accounts filing request and maps it to the input
// buildSmallCompanyAccounts takes. The page derives and shows the totals; this re-derives them so
// a filing never reaches the gateway with figures that do not hold together.

import {
  SMALL_COMPANY_BALANCE_SHEET_LINES,
  SMALL_COMPANY_PROFIT_AND_LOSS_LINES,
  FIXED_ASSET_CLASSES,
  FIXED_ASSET_CLASS_FIELDS,
  withBalanceSheetTotals,
  profitAndLossProblems,
  fixedAssetNoteNetBookValue,
} from "./smallCompanyAccountsIxbrl.js";

export const SMALL_COMPANY_STATEMENT_FIELDS = [
  "section477Exemption",
  "membersNotRequiredAudit",
  "directorsResponsibilities",
  "smallCompaniesRegime",
];

function readFigures(values, lines, label, errorMessages) {
  const figures = {};
  for (const line of lines) {
    const raw = values?.[line];
    const numeric = Number(raw);
    if (raw === undefined || raw === null || raw === "" || !Number.isFinite(numeric)) {
      errorMessages.push(`Invalid or missing ${label}.${line}`);
    }
    figures[line] = numeric;
  }
  return figures;
}

function allFinite(figures) {
  return Object.values(figures).every((value) => Number.isFinite(value));
}

function readBalanceSheetYear(values, label, errorMessages) {
  const figures = readFigures(values, SMALL_COMPANY_BALANCE_SHEET_LINES, label, errorMessages);
  if (allFinite(figures)) {
    const totals = withBalanceSheetTotals(figures);
    const netAssets = totals.fixedAssets + totals.currentAssets - totals.creditorsWithinOneYear - totals.creditorsAfterOneYear;
    if (netAssets !== figures.capitalAndReserves) {
      errorMessages.push(`${label}.capitalAndReserves does not equal net assets (${netAssets})`);
    }
    if (figures.calledUpShareCapital + figures.profitAndLossAccount !== figures.capitalAndReserves) {
      errorMessages.push(`${label}.capitalAndReserves does not equal calledUpShareCapital plus profitAndLossAccount`);
    }
  }
  return figures;
}

function readProfitAndLossYear(values, label, errorMessages) {
  const figures = readFigures(values, SMALL_COMPANY_PROFIT_AND_LOSS_LINES, label, errorMessages);
  if (allFinite(figures)) {
    for (const problem of profitAndLossProblems(figures)) errorMessages.push(`${label}: ${problem}`);
  }
  return figures;
}

function readFixedAssetNote(values, fixedAssets, errorMessages) {
  if (values === undefined || values === null) return undefined;
  const note = {};
  for (const [className, classValues] of Object.entries(values)) {
    if (!FIXED_ASSET_CLASSES.includes(className)) {
      errorMessages.push(`Unknown fixedAssetNote class ${className} - must be one of ${FIXED_ASSET_CLASSES.join(", ")}`);
      continue;
    }
    const figures = readFigures(classValues, FIXED_ASSET_CLASS_FIELDS, `smallCompany.fixedAssetNote.${className}`, errorMessages);
    for (const field of FIXED_ASSET_CLASS_FIELDS) {
      if (Number.isFinite(figures[field]) && figures[field] < 0) {
        errorMessages.push(`smallCompany.fixedAssetNote.${className}.${field} must not be negative`);
      }
    }
    note[className] = figures;
  }
  if (Object.values(note).every(allFinite) && Number.isFinite(fixedAssets) && fixedAssetNoteNetBookValue(note) !== fixedAssets) {
    errorMessages.push(
      `smallCompany.fixedAssetNote net book value (${fixedAssetNoteNetBookValue(note)}) does not equal balanceSheet.currentYear.fixedAssets (${fixedAssets})`,
    );
  }
  return note;
}

function requiredText(value, label, errorMessages) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) errorMessages.push(`Missing ${label}`);
  return text;
}

/**
 * Validate the small-company section of a request body.
 * @param {object} smallCompany - the body's smallCompany object
 * @param {object} statementsAccepted - the body's statementsAccepted object
 * @param {string[]} errorMessages - validation messages are appended here
 * @returns {object} the buildSmallCompanyAccounts input fields this section supplies, plus the accepted statements
 */
export function extractAndValidateSmallCompany(smallCompany, statementsAccepted, errorMessages) {
  const section = smallCompany && typeof smallCompany === "object" ? smallCompany : {};

  if (section.filleted !== undefined && typeof section.filleted !== "boolean") {
    errorMessages.push("Invalid smallCompany.filleted - must be true or false");
  }

  const principalActivity = requiredText(section.principalActivity, "smallCompany.principalActivity", errorMessages);
  const accountingPolicies = requiredText(section.accountingPolicies, "smallCompany.accountingPolicies", errorMessages);

  const directors = Array.isArray(section.directors) ? section.directors.map((name) => (typeof name === "string" ? name.trim() : "")) : [];
  if (directors.length === 0 || directors.some((name) => !name)) {
    errorMessages.push("smallCompany.directors must list at least one director name");
  }

  const currentBalanceSheet = readBalanceSheetYear(
    section.balanceSheet?.currentYear,
    "smallCompany.balanceSheet.currentYear",
    errorMessages,
  );
  const priorBalanceSheet = section.balanceSheet?.priorYear
    ? readBalanceSheetYear(section.balanceSheet.priorYear, "smallCompany.balanceSheet.priorYear", errorMessages)
    : undefined;
  const currentProfitAndLoss = readProfitAndLossYear(
    section.profitAndLoss?.currentYear,
    "smallCompany.profitAndLoss.currentYear",
    errorMessages,
  );
  const priorProfitAndLoss = section.profitAndLoss?.priorYear
    ? readProfitAndLossYear(section.profitAndLoss.priorYear, "smallCompany.profitAndLoss.priorYear", errorMessages)
    : undefined;
  const fixedAssetNote = readFixedAssetNote(section.fixedAssetNote, currentBalanceSheet.fixedAssets, errorMessages);

  const statements = {};
  for (const field of SMALL_COMPANY_STATEMENT_FIELDS) {
    statements[field] = statementsAccepted?.[field] === true;
    if (!statements[field]) errorMessages.push(`The user must accept the ${field} statement`);
  }

  return {
    filleted: section.filleted === true,
    principalActivity,
    accountingPolicies,
    directors,
    balanceSheet: { current: currentBalanceSheet, ...(priorBalanceSheet ? { prior: priorBalanceSheet } : {}) },
    profitAndLoss: { current: currentProfitAndLoss, ...(priorProfitAndLoss ? { prior: priorProfitAndLoss } : {}) },
    ...(fixedAssetNote ? { fixedAssetNote } : {}),
    statementsAccepted: statements,
  };
}
