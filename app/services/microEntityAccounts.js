// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
