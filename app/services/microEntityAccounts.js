// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/microEntityAccounts.js
//
// deriveMicroEntityAccounts: the seven FRS 105 balance-sheet lines the
// accounts filing takes, for the current year from the Ltd engine's
// published balance sheet (PubBalSht) and for the prior year from the
// book's opening balance, rounded to whole pounds so the filing endpoint's
// own check (capital and reserves equals net assets) holds. The filing
// maps seven FRS 105 lines from book balances; nothing here computes a
// balance the engine has not already computed.

import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { diyaGlToScenario } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { loadTaxDataForBook, productOf } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";

export const BALANCE_SHEET_LINES = [
  "fixedAssets",
  "currentAssets",
  "creditorsWithinOneYear",
  "creditorsAfterOneYear",
  "calledUpShareCapital",
  "profitAndLossAccount",
  "capitalAndReserves",
];

const BALANCE_TOLERANCE = 0.005;

function isoDate(value) {
  if (value === undefined || value === null) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function dayBefore(isoDay) {
  return new Date(new Date(isoDay).getTime() - 86_400_000).toISOString().slice(0, 10);
}

function pence(value) {
  return Math.round(value * 100) / 100;
}

function requireLoaded(session) {
  if (!session.book || !session.lines) {
    throw new Error("No book is loaded. Call open_book first.");
  }
}

/**
 * The seven lines, unrounded, from the engine's published balance sheet.
 * Refuses a sheet whose own net assets (F33) do not equal shareholders'
 * funds (F39).
 * @param {Object} sheet - results.PubBalSht
 */
export function linesFromPublishedBalanceSheet(sheet) {
  if (!sheet)
    throw new Error("The book's product carries no published balance sheet; only a Company (ltd) book answers micro-entity accounts");
  const netAssets = sheet.F33 ?? 0;
  const shareholdersFunds = sheet.F39 ?? 0;
  if (Math.abs(netAssets - shareholdersFunds) > BALANCE_TOLERANCE) {
    throw new Error(
      `The published balance sheet does not balance: net assets ${pence(netAssets)} against shareholders' funds ${pence(shareholdersFunds)} ` +
        `(a difference of ${pence(netAssets - shareholdersFunds)}); a long-term debtor sits on no published line and is the usual cause`,
    );
  }
  return {
    fixedAssets: sheet.F6 ?? 0,
    currentAssets: sheet.E13 ?? 0,
    creditorsWithinOneYear: sheet.E20 ?? 0,
    creditorsAfterOneYear: sheet.F31 ?? 0,
    calledUpShareCapital: sheet.F36 ?? 0,
    profitAndLossAccount: shareholdersFunds - (sheet.F36 ?? 0),
    capitalAndReserves: shareholdersFunds,
  };
}

function sumValues(object) {
  return Object.values(object || {}).reduce((total, value) => total + (value || 0), 0);
}

/**
 * The three headline P&L figures for the financial year, from the engine's published profit
 * and loss account. Turnover and profit are rounded to whole pounds first and costs is their
 * difference, so turnover minus costs equals profit exactly rather than drifting from separate
 * roundings of cost of sales, administrative expenses and tax.
 * @param {Object} sheet - results["PubP&L"]
 */
export function profitAndLossFromPublishedAccount(sheet) {
  if (!sheet)
    throw new Error(
      "The book's product carries no published profit and loss account; only a Company (ltd) book answers micro-entity accounts",
    );
  const turnover = Math.round(sheet.F9 ?? 0);
  const profit = Math.round(sheet.F51 ?? 0);
  return { turnover, costs: turnover - profit, profit };
}

/**
 * The seven lines, unrounded, from the book's opening balance (the figures
 * the engine's OpenAccounts sheet shows). Refuses an opening balance whose
 * assets do not equal its liabilities and equity.
 * @param {Object} opening - scenario.opening_balance, snake_case keys
 */
export function linesFromOpeningBalance(opening = {}) {
  const at = (key) => opening[key] || 0;
  const fixedAssets = sumValues(opening.fixed_asset_cost) - sumValues(opening.fixed_asset_depreciation);
  const currentAssets =
    at("stock") +
    at("trade_debtors") +
    at("current_account") +
    at("savings_account") +
    at("credit_card") +
    at("cash") +
    at("long_term_debtors");
  const creditorsWithinOneYear =
    at("trade_creditors") +
    at("net_wages_due") +
    at("wage_deductions_due") +
    at("dividends_due") +
    at("corporation_tax") +
    at("cis_due") +
    at("vat_due") +
    at("paye_due");
  const creditorsAfterOneYear = at("directors_loan") + at("long_term_creditors");
  const calledUpShareCapital = at("share_capital");
  const profitAndLossAccount = at("retained_earnings") + at("capital_reserves");
  const capitalAndReserves = calledUpShareCapital + profitAndLossAccount;
  const netAssets = fixedAssets + currentAssets - creditorsWithinOneYear - creditorsAfterOneYear;
  if (Math.abs(netAssets - capitalAndReserves) > BALANCE_TOLERANCE) {
    throw new Error(
      `The opening balance sheet does not balance: net assets ${pence(netAssets)} against capital and reserves ${pence(capitalAndReserves)} ` +
        `(a difference of ${pence(netAssets - capitalAndReserves)})`,
    );
  }
  return {
    fixedAssets,
    currentAssets,
    creditorsWithinOneYear,
    creditorsAfterOneYear,
    calledUpShareCapital,
    profitAndLossAccount,
    capitalAndReserves,
  };
}

/**
 * Whole pounds with the filing's identity intact: the four asset and
 * liability lines and share capital are rounded, capital and reserves is
 * derived from the four, and the profit and loss account is the remainder.
 */
export function roundForFiling(lines) {
  const fixedAssets = Math.round(lines.fixedAssets);
  const currentAssets = Math.round(lines.currentAssets);
  const creditorsWithinOneYear = Math.round(lines.creditorsWithinOneYear);
  const creditorsAfterOneYear = Math.round(lines.creditorsAfterOneYear);
  const calledUpShareCapital = Math.round(lines.calledUpShareCapital);
  const capitalAndReserves = fixedAssets + currentAssets - creditorsWithinOneYear - creditorsAfterOneYear;
  return {
    fixedAssets,
    currentAssets,
    creditorsWithinOneYear,
    creditorsAfterOneYear,
    calledUpShareCapital,
    profitAndLossAccount: capitalAndReserves - calledUpShareCapital,
    capitalAndReserves,
  };
}

function rounded(lines) {
  return Object.fromEntries(Object.entries(lines).map(([key, value]) => [key, pence(value)]));
}

/**
 * derive_micro_entity_accounts: the figures the accounts filing takes, from
 * the session's loaded book.
 * @param {Object} session
 */
export async function deriveMicroEntityAccounts(session) {
  requireLoaded(session);
  const { book, lines } = session;
  const info = book.documentInfo ?? {};
  const entity = book.entityInformation ?? {};
  const periodStart = isoDate(info.periodCoveredStart);
  const periodEnd = isoDate(info.periodCoveredEnd);
  if (!periodStart || !periodEnd) throw new Error("The book's documentInfo carries no periodCoveredStart and periodCoveredEnd");

  const taxData = await loadTaxDataForBook(book);
  const results = calculatedResultsFor(book, lines, taxData);
  const scenario = diyaGlToScenario(book, lines, productOf(book));

  const current = linesFromPublishedBalanceSheet(results.PubBalSht);
  const prior = linesFromOpeningBalance(scenario.opening_balance);
  const currentYear = roundForFiling(current);
  const priorYear = roundForFiling(prior);
  const profitAndLoss = profitAndLossFromPublishedAccount(results["PubP&L"]);

  const capitalReserve = scenario.opening_balance?.capital_reserves || 0;
  const notes = [
    "Whole pounds: capital and reserves is derived from the rounded assets and creditors, and the profit and loss account is the remainder after share capital.",
    "The average number of employees is the count of the book's employees table; confirm it before filing.",
  ];
  if (capitalReserve)
    notes.push(
      `A capital reserve of ${pence(capitalReserve)} is folded into the profit and loss account; the seven-line set has no other reserve line.`,
    );

  return {
    companyNumber: entity["diya-gl:companyNumber"] ?? null,
    companyName: entity.organizationIdentifier ?? null,
    periodStart,
    periodEnd,
    priorBalanceSheetDate: dayBefore(periodStart),
    averageNumberOfEmployees: (book.employees ?? []).length,
    directorName: book.directors?.[0]?.name ?? null,
    dormant: false,
    profitAndLoss,
    balanceSheet: { currentYear, priorYear },
    derivation: {
      currentYear: { sheet: "PubBalSht", lines: rounded(current) },
      priorYear: { sheet: "OpenAccounts", lines: rounded(prior) },
    },
    notes,
  };
}
