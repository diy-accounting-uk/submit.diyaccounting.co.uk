// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/smallCompanyAccountsRequest.js
// Validates the `smallCompany` section of an accounts filing request and maps it to the input
// buildSmallCompanyAccounts takes. The page derives and shows the totals; this re-derives them so
// a filing never reaches the gateway with figures that do not hold together.

import {
  SMALL_COMPANY_BALANCE_SHEET_LINES,
  SMALL_COMPANY_OPTIONAL_BALANCE_SHEET_LINES,
  SMALL_COMPANY_POLICY_FIELDS,
  PROFIT_AND_LOSS_FORMATS,
  profitAndLossLinesOf,
  FIXED_ASSET_CLASSES,
  FIXED_ASSET_CLASS_FIELDS,
  withBalanceSheetTotals,
  profitAndLossProblemsOf,
  fixedAssetNoteNetBookValue,
} from "./smallCompanyAccountsIxbrl.js";
import { SHARE_CLASSES, sharesIssuedFor } from "./microEntityAccountsIxbrl.js";

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

// An optional line is absent (0) or a whole number of pounds that is not negative.
function readOptionalLines(values, label, errorMessages) {
  const figures = {};
  for (const line of SMALL_COMPANY_OPTIONAL_BALANCE_SHEET_LINES) {
    const raw = values?.[line];
    if (raw === undefined || raw === null || raw === "") {
      figures[line] = 0;
      continue;
    }
    const numeric = Number(raw);
    if (!Number.isInteger(numeric) || numeric < 0)
      errorMessages.push(`Invalid ${label}.${line} - must be a whole number of pounds, not negative`);
    figures[line] = numeric;
  }
  return figures;
}

function allFinite(figures) {
  return Object.values(figures).every((value) => Number.isFinite(value));
}

function readBalanceSheetYear(values, label, errorMessages) {
  const figures = {
    ...readFigures(values, SMALL_COMPANY_BALANCE_SHEET_LINES, label, errorMessages),
    ...readOptionalLines(values, label, errorMessages),
  };
  if (allFinite(figures)) {
    if (figures.bankLoansAfterOneYear > figures.creditorsAfterOneYear) {
      errorMessages.push(`${label}.bankLoansAfterOneYear must not be more than creditorsAfterOneYear`);
    }
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

function readProfitAndLossYear(values, format, label, errorMessages) {
  const figures = readFigures(values, profitAndLossLinesOf(format), label, errorMessages);
  if (allFinite(figures)) {
    for (const problem of profitAndLossProblemsOf(figures, format)) errorMessages.push(`${label}: ${problem}`);
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

function readOptionalText(value, label, errorMessages) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    errorMessages.push(`Invalid ${label} - must be text`);
    return "";
  }
  return value.trim();
}

function readControllingParty(values, errorMessages) {
  if (values === undefined || values === null) return undefined;
  if (typeof values !== "object" || Array.isArray(values)) {
    errorMessages.push("Invalid smallCompany.controllingParty - must be an object");
    return undefined;
  }
  if (typeof values.ultimate !== "boolean") errorMessages.push("Invalid smallCompany.controllingParty.ultimate - must be true or false");
  const name = readOptionalText(values.name, "smallCompany.controllingParty.name", errorMessages);
  if (values.ultimate === true && !name) errorMessages.push("Missing smallCompany.controllingParty.name");
  return { ultimate: values.ultimate === true, ...(name ? { name } : {}) };
}

function readShareCapital(values, calledUpShareCapital, errorMessages) {
  if (values === undefined || values === null) return undefined;
  const { shareClass } = values;
  const nominalValue = Number(values.nominalValue);
  if (!SHARE_CLASSES.includes(shareClass)) {
    errorMessages.push(`Invalid smallCompany.shareCapital.shareClass - must be one of ${SHARE_CLASSES.join(", ")}`);
  }
  if (!Number.isFinite(nominalValue) || nominalValue <= 0) {
    errorMessages.push("Invalid smallCompany.shareCapital.nominalValue - must be a positive number of pounds per share");
  } else if (Number.isFinite(calledUpShareCapital) && sharesIssuedFor(calledUpShareCapital, nominalValue) === null) {
    errorMessages.push("smallCompany.shareCapital.nominalValue must divide calledUpShareCapital into a whole number of shares");
  }
  return { shareClass, nominalValue };
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
  const profitAndLossFormat = section.profitAndLossFormat ?? 1;
  if (!PROFIT_AND_LOSS_FORMATS.includes(profitAndLossFormat)) {
    errorMessages.push("Invalid smallCompany.profitAndLossFormat - must be 1 or 2");
  }
  const currentProfitAndLoss = readProfitAndLossYear(
    section.profitAndLoss?.currentYear,
    profitAndLossFormat,
    "smallCompany.profitAndLoss.currentYear",
    errorMessages,
  );
  const priorProfitAndLoss = section.profitAndLoss?.priorYear
    ? readProfitAndLossYear(section.profitAndLoss.priorYear, profitAndLossFormat, "smallCompany.profitAndLoss.priorYear", errorMessages)
    : undefined;
  const fixedAssetNote = readFixedAssetNote(section.fixedAssetNote, currentBalanceSheet.fixedAssets, errorMessages);

  const shareCapital = readShareCapital(section.shareCapital, currentBalanceSheet.calledUpShareCapital, errorMessages);
  const policies = {};
  for (const { field } of SMALL_COMPANY_POLICY_FIELDS) {
    const text = readOptionalText(section[field], `smallCompany.${field}`, errorMessages);
    if (text) policies[field] = text;
  }
  const controllingParty = readControllingParty(section.controllingParty, errorMessages);

  const statements = {};
  for (const field of SMALL_COMPANY_STATEMENT_FIELDS) {
    statements[field] = statementsAccepted?.[field] === true;
    if (!statements[field]) errorMessages.push(`The user must accept the ${field} statement`);
  }

  return {
    filleted: section.filleted === true,
    profitAndLossFormat,
    principalActivity,
    accountingPolicies,
    directors,
    balanceSheet: { current: currentBalanceSheet, ...(priorBalanceSheet ? { prior: priorBalanceSheet } : {}) },
    profitAndLoss: { current: currentProfitAndLoss, ...(priorProfitAndLoss ? { prior: priorProfitAndLoss } : {}) },
    ...(fixedAssetNote ? { fixedAssetNote } : {}),
    ...(shareCapital ? { shareCapital } : {}),
    ...policies,
    ...(controllingParty ? { controllingParty } : {}),
    statementsAccepted: statements,
  };
}
