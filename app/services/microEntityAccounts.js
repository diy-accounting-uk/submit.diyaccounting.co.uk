// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-04 Derive micro-entity accounts figures for Companies House filing
// - **Use when:** a Company (ltd) book's FRS 105 balance-sheet lines are needed before a Companies House accounts filing.
// - **Does:** deriveMicroEntityAccounts in app/services/microEntityAccounts.js reads the current year from the engine's published balance sheet, PubBalSht. It reads the prior year from the book's opening balance. It checks each sheet balances before rounding both years to whole pounds. mcp/lib/accounts-tools.js re-exports it for the derive_micro_entity_accounts tool; DATA-52's nightly company book pull imports the same function.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/services/microEntityAccounts.js:deriveMicroEntityAccounts`
// - **Files:** app/services/microEntityAccounts.js, mcp/lib/accounts-tools.js, mcp/test/accounts-tools.test.js
// - **Keywords:** derive_micro_entity_accounts, frs 105, balance sheet, companies house, micro-entity, pubbalsht, accounts filing
// - **Related:** MCP-03, MCP-08, DATA-52
// @end-capability

// app/services/microEntityAccounts.js
//
// deriveMicroEntityAccounts: calculates a loaded Company book and gives the figures the micro-entity
// accounts filing takes (microEntityAccountsFromResults).

import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { diyaGlToScenario } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { loadTaxDataForBook, productOf } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import { microEntityAccountsFromResults, cashAtBankFromResults } from "./microEntityAccountsFromResults.js";

/**
 * The figures the accounts filing takes and the cash held across the bank nominal accounts, from
 * one calculation of the session's loaded book.
 * @param {Object} session
 */
export async function deriveCompanyBookFigures(session) {
  if (!session.book || !session.lines) {
    throw new Error("No book is loaded. Call open_book first.");
  }
  const { book, lines } = session;
  const taxData = await loadTaxDataForBook(book);
  const results = calculatedResultsFor(book, lines, taxData);
  const scenario = diyaGlToScenario(book, lines, productOf(book));
  return {
    accounts: microEntityAccountsFromResults(book, results, scenario),
    cashAtBank: cashAtBankFromResults(results),
  };
}

/**
 * derive_micro_entity_accounts: the figures the accounts filing takes, from
 * the session's loaded book.
 * @param {Object} session
 */
export async function deriveMicroEntityAccounts(session) {
  return (await deriveCompanyBookFigures(session)).accounts;
}

/**
 * One year of a micro-entity profit and loss account (MICRO_PROFIT_AND_LOSS_LINES) from a small
 * company's profit and loss lines. The book keeps no staff cost or raw material line, so every
 * cost other than the depreciation charge is an other charge and interest receivable is other
 * income. Turnover, profit before tax, tax and profit are the small company's own.
 * @param {{turnover: number, costOfSales: number, administrativeExpenses: number, interestReceivable: number, profitBeforeTax: number, tax: number, profit: number}} year
 * @param {number} depreciation - the depreciation charge within the costs, whole pounds
 */
export function microProfitAndLossYear(year, depreciation = 0) {
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
