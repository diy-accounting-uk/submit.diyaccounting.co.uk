// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/smallCompanyAccountsFromResults.js
//
// The figures a small company's FRS 102 section 1A filing takes from a loaded Company book's
// calculated results: the full profit and loss account (PubP&L), the balance sheet sub-lines
// (PubBalSht), the tangible fixed asset note (PubNotes) and the directors. The prior-year balance
// sheet comes from the book's opening balance. The engine publishes no prior-year profit and loss
// account (its comparative cells are 0), so none is derived here. The module has no fs, so the
// browser's books bundle runs it too.

import { smallCompanyProfitAndLossFromPublishedAccount } from "./ct600Figures.js";

const BALANCE_TOLERANCE = 0.005;

// PubNotes columns B to F hold land, plant, fixtures, computer and motor, in that order.
const NOTE_COLUMN_OF_CLASS = {
  landBuildings: "B",
  plantMachinery: "C",
  furnitureFittings: "D",
  computerEquipment: "E",
  motorVehicles: "F",
};

const NOTE_ROW_OF_FIELD = {
  costAtStart: 8,
  additions: 9,
  disposals: 10,
  depreciationAtStart: 14,
  depreciationCharge: 15,
  depreciationOnDisposals: 16,
};

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

function sumValues(object) {
  return Object.values(object || {}).reduce((total, value) => total + (value || 0), 0);
}

/**
 * The balance sheet sub-lines, unrounded, from the engine's published balance sheet. Refuses a
 * sheet whose net assets (F33) do not equal shareholders' funds (F39).
 * @param {Object} sheet - results.PubBalSht
 */
export function smallCompanyLinesFromPublishedBalanceSheet(sheet) {
  if (!sheet)
    throw new Error("The book's product carries no published balance sheet; only a Company (ltd) book answers small company accounts");
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
    stocks: sheet.E10 ?? 0,
    debtors: sheet.E11 ?? 0,
    cashAtBank: sheet.E12 ?? 0,
    bankLoansOverdrafts: sheet.E19 ?? 0,
    tradeCreditors: sheet.E16 ?? 0,
    corporationTax: sheet.E17 ?? 0,
    taxationSocialSecurity: sheet.E18 ?? 0,
    otherCreditors: 0,
    creditorsAfterOneYear: sheet.F31 ?? 0,
    calledUpShareCapital: sheet.F36 ?? 0,
    profitAndLossAccount: shareholdersFunds - (sheet.F36 ?? 0),
    capitalAndReserves: shareholdersFunds,
  };
}

/**
 * The balance sheet sub-lines, unrounded, from the book's opening balance. Refuses an opening
 * balance whose assets do not equal its liabilities and equity.
 * @param {Object} opening - scenario.opening_balance, snake_case keys
 */
export function smallCompanyLinesFromOpeningBalance(opening = {}) {
  const at = (key) => opening[key] || 0;
  const fixedAssets = sumValues(opening.fixed_asset_cost) - sumValues(opening.fixed_asset_depreciation);
  const stocks = at("stock");
  const debtors = at("trade_debtors") + at("long_term_debtors");
  const statementAccounts = at("current_account") + at("savings_account") + at("credit_card");
  const bankLoansOverdrafts = statementAccounts < 0 ? -statementAccounts : 0;
  const cashAtBank = (statementAccounts < 0 ? 0 : statementAccounts) + at("cash");
  const tradeCreditors = at("trade_creditors");
  const corporationTax = at("corporation_tax");
  const taxationSocialSecurity = at("paye_due") + at("vat_due") + at("cis_due");
  const otherCreditors = at("net_wages_due") + at("wage_deductions_due") + at("dividends_due");
  const creditorsAfterOneYear = at("directors_loan") + at("long_term_creditors");
  const calledUpShareCapital = at("share_capital");
  const profitAndLossAccount = at("retained_earnings") + at("capital_reserves");
  const capitalAndReserves = calledUpShareCapital + profitAndLossAccount;
  const netAssets =
    fixedAssets +
    stocks +
    debtors +
    cashAtBank -
    bankLoansOverdrafts -
    tradeCreditors -
    corporationTax -
    taxationSocialSecurity -
    otherCreditors -
    creditorsAfterOneYear;
  if (Math.abs(netAssets - capitalAndReserves) > BALANCE_TOLERANCE) {
    throw new Error(
      `The opening balance sheet does not balance: net assets ${pence(netAssets)} against capital and reserves ${pence(capitalAndReserves)} ` +
        `(a difference of ${pence(netAssets - capitalAndReserves)})`,
    );
  }
  return {
    fixedAssets,
    stocks,
    debtors,
    cashAtBank,
    bankLoansOverdrafts,
    tradeCreditors,
    corporationTax,
    taxationSocialSecurity,
    otherCreditors,
    creditorsAfterOneYear,
    calledUpShareCapital,
    profitAndLossAccount,
    capitalAndReserves,
  };
}

/**
 * Whole pounds with the filing's identity intact: every sub-line and share capital is rounded,
 * capital and reserves is derived from them, and the profit and loss account is the remainder.
 */
export function roundSmallCompanyBalanceSheet(lines) {
  const fixedAssets = Math.round(lines.fixedAssets);
  const stocks = Math.round(lines.stocks);
  const debtors = Math.round(lines.debtors);
  const cashAtBank = Math.round(lines.cashAtBank);
  const bankLoansOverdrafts = Math.round(lines.bankLoansOverdrafts);
  const tradeCreditors = Math.round(lines.tradeCreditors);
  const corporationTax = Math.round(lines.corporationTax);
  const taxationSocialSecurity = Math.round(lines.taxationSocialSecurity);
  const otherCreditors = Math.round(lines.otherCreditors);
  const creditorsAfterOneYear = Math.round(lines.creditorsAfterOneYear);
  const calledUpShareCapital = Math.round(lines.calledUpShareCapital);
  const capitalAndReserves =
    fixedAssets +
    stocks +
    debtors +
    cashAtBank -
    bankLoansOverdrafts -
    tradeCreditors -
    corporationTax -
    taxationSocialSecurity -
    otherCreditors -
    creditorsAfterOneYear;
  return {
    fixedAssets,
    stocks,
    debtors,
    cashAtBank,
    bankLoansOverdrafts,
    tradeCreditors,
    corporationTax,
    taxationSocialSecurity,
    otherCreditors,
    creditorsAfterOneYear,
    calledUpShareCapital,
    profitAndLossAccount: capitalAndReserves - calledUpShareCapital,
    capitalAndReserves,
  };
}

/**
 * The tangible fixed asset note, per asset class that holds anything, from the engine's published
 * notes, in whole pounds with each class's closing net book value rounded from its own movements.
 * @param {Object} sheet - results.PubNotes
 */
export function fixedAssetNoteFromPublishedNotes(sheet) {
  const note = {};
  for (const className of Object.keys(NOTE_COLUMN_OF_CLASS)) {
    const column = NOTE_COLUMN_OF_CLASS[className];
    const figures = {};
    for (const [field, row] of Object.entries(NOTE_ROW_OF_FIELD)) figures[field] = Math.round(sheet?.[`${column}${row}`] ?? 0);
    if (Object.values(figures).some((value) => value !== 0)) note[className] = figures;
  }
  return note;
}

/**
 * The Format 2 profit and loss lines (by nature), in whole pounds, from the engine's monthly and
 * published profit and loss sheets. Turnover, operating profit, profit before tax and tax are
 * rounded from the published figures; the cost lines are rounded from the monthly sheet and the
 * remaining operating expenses line takes the rounding, so every identity holds to the pound. The
 * book's stock movement sits inside raw materials, and its grants inside turnover, so the change
 * in stocks, own work capitalised and other operating income are 0; its loan interest sits inside
 * administrative expenses, so interest payable is 0.
 * @param {Object} results - calculatedResultsFor output with MnthP&L and PubP&L
 */
export function smallCompanyFormat2ProfitAndLossFromResults(results) {
  const published = results["PubP&L"];
  const monthly = results["MnthP&L"];
  if (!published || !monthly)
    throw new Error(
      "The book's product carries no published profit and loss account; only a Company (ltd) book answers small company accounts",
    );
  const at = (cell) => monthly[cell] ?? 0;
  const turnover = Math.round(published.F9 ?? 0);
  const rawMaterialsConsumables = Math.round(at("B11"));
  const otherExternalCharges = Math.round(at("B12") + at("B13"));
  const staffCosts = Math.round(at("B18") + at("B19") + at("B20"));
  const depreciation = Math.round(at("B38") + at("B40"));
  const operatingProfit = Math.round(published.F46 ?? 0);
  const profitBeforeTax = Math.round(published.F49 ?? 0);
  const tax = Math.round(published.F50 ?? 0);
  const otherOperatingExpenses = turnover - operatingProfit - rawMaterialsConsumables - otherExternalCharges - staffCosts - depreciation;
  return {
    turnover,
    changeInStocks: 0,
    ownWorkCapitalised: 0,
    otherOperatingIncome: 0,
    rawMaterialsConsumables,
    otherExternalCharges,
    staffCosts,
    depreciation,
    otherOperatingExpenses,
    operatingProfit,
    interestReceivable: profitBeforeTax - operatingProfit,
    interestPayable: 0,
    profitBeforeTax,
    tax,
    profit: profitBeforeTax - tax,
  };
}

/**
 * The figures a small company accounts filing takes, from a loaded Company book and its
 * calculated results. Pure, so the browser's books bundle runs it too.
 * @param {Object} book
 * @param {Object} results - calculatedResultsFor output
 * @param {Object} scenario - diyaGlToScenario output
 * @param {Object} [options]
 * @param {Object} [options.priorYearProfitAndLoss]
 */
export function smallCompanyAccountsFromResults(book, results, scenario, { priorYearProfitAndLoss } = {}) {
  const info = book.documentInfo ?? {};
  const entity = book.entityInformation ?? {};
  const periodStart = isoDate(info.periodCoveredStart);
  const periodEnd = isoDate(info.periodCoveredEnd);
  if (!periodStart || !periodEnd) throw new Error("The book's documentInfo carries no periodCoveredStart and periodCoveredEnd");

  const current = smallCompanyLinesFromPublishedBalanceSheet(results.PubBalSht);
  const prior = smallCompanyLinesFromOpeningBalance(scenario.opening_balance);
  const currentYear = roundSmallCompanyBalanceSheet(current);
  const priorYear = roundSmallCompanyBalanceSheet(prior);
  const profitAndLoss = smallCompanyProfitAndLossFromPublishedAccount(results["PubP&L"]);
  const fixedAssetNote = fixedAssetNoteFromPublishedNotes(results.PubNotes);

  const capitalReserve = scenario.opening_balance?.capital_reserves || 0;
  const notes = [
    "Whole pounds: capital and reserves is derived from the rounded sub-lines, and the profit and loss account is the remainder after share capital.",
    "The interest line is profit before tax less operating profit, so every profit and loss subtotal holds after rounding.",
    "The average number of employees is the count of the book's employees table; confirm it before filing.",
    priorYearProfitAndLoss
      ? "The prior year's profit and loss account is the one supplied with the request; the book publishes none."
      : "The book publishes no prior-year profit and loss account: supply the comparatives when the company has them, or leave them out.",
    "The principal activity and the accounting policies text are typed on the page; the book holds neither.",
  ];
  if (capitalReserve)
    notes.push(
      `A capital reserve of ${pence(capitalReserve)} is folded into the profit and loss account; the sub-line set has no other reserve line.`,
    );

  return {
    companyNumber: entity["diya-gl:companyNumber"] ?? null,
    companyName: entity.organizationIdentifier ?? null,
    periodStart,
    periodEnd,
    priorBalanceSheetDate: dayBefore(periodStart),
    averageNumberOfEmployees: (book.employees ?? []).length,
    directors: (book.directors ?? []).map((director) => director.name).filter(Boolean),
    directorName: book.directors?.[0]?.name ?? null,
    profitAndLoss: { currentYear: profitAndLoss, ...(priorYearProfitAndLoss ? { priorYear: priorYearProfitAndLoss } : {}) },
    profitAndLossFormat2: { currentYear: smallCompanyFormat2ProfitAndLossFromResults(results) },
    balanceSheet: { currentYear, priorYear },
    fixedAssetNote,
    derivation: {
      currentYear: { sheet: "PubBalSht", lines: Object.fromEntries(Object.entries(current).map(([key, value]) => [key, pence(value)])) },
      priorYear: { sheet: "OpenAccounts", lines: Object.fromEntries(Object.entries(prior).map(([key, value]) => [key, pence(value)])) },
    },
    notes,
  };
}
