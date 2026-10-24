// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/smallCompanyAccounts.js
//
// deriveSmallCompanyAccounts: calculates a loaded Company book and gives the figures a small
// company's FRS 102 section 1A filing takes (smallCompanyAccountsFromResults).

import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { diyaGlToScenario } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { loadTaxDataForBook, productOf } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import { smallCompanyAccountsFromResults } from "./smallCompanyAccountsFromResults.js";

/**
 * derive_small_company_accounts: the figures a small company accounts filing takes, from the
 * session's loaded book.
 * @param {Object} session
 * @param {Object} [options]
 * @param {Object} [options.priorYearProfitAndLoss] - the prior year's profit and loss lines, whole pounds, when the company has them; the book publishes none
 */
export async function deriveSmallCompanyAccounts(session, { priorYearProfitAndLoss } = {}) {
  if (!session.book || !session.lines) throw new Error("No book is loaded. Call open_book first.");
  const { book, lines } = session;
  const taxData = await loadTaxDataForBook(book);
  const results = calculatedResultsFor(book, lines, taxData);
  const scenario = diyaGlToScenario(book, lines, productOf(book));
  return smallCompanyAccountsFromResults(book, results, scenario, { priorYearProfitAndLoss });
}
