// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// accounts-tools.js -- derive_micro_entity_accounts: the seven FRS 105
// balance-sheet lines the accounts filing takes. The derivation lives in
// app/services/microEntityAccounts.js, shared with the nightly company
// book pull; this file re-exports it for the MCP tool registration.
// derive_company_tax_return: the Company Tax Return figures from the loaded
// Company book, the file the web "Fill from your books" card reads.

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve as resolvePath } from "node:path";

import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { packageVersion } from "@diy-accounting-uk/diya-gl/dist/app/lib/package-version.js";
import { loadTaxDataForBook } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";

import { ct600FiguresFromResults, smallCompanyProfitAndLossFromPublishedAccount } from "../../app/services/ct600Figures.js";

export {
  BALANCE_SHEET_LINES,
  linesFromPublishedBalanceSheet,
  linesFromOpeningBalance,
  roundForFiling,
  profitAndLossFromPublishedAccount,
} from "../../app/services/microEntityAccountsFromResults.js";

export { deriveMicroEntityAccounts } from "../../app/services/microEntityAccounts.js";

export { deriveSmallCompanyAccounts } from "../../app/services/smallCompanyAccounts.js";

/**
 * derive_company_tax_return: the figures the Company Tax Return form takes, from the session's
 * loaded Company book, wrapped as the file the web card's Company Tax Return kind reads:
 * { kind: "ct600", sourceFileName, packageVersion, period, figures }. The profit and loss account
 * is the book's published one; the balance sheet and the rest of the accounts stay with the form.
 * With a path, the answer is also written there as JSON.
 * @param {Object} session
 * @param {{path?: string}} params
 */
export async function deriveCompanyTaxReturn(session, { path } = {}) {
  if (!session.book || !session.lines) throw new Error("No book is loaded. Call open_book first.");
  const { book, lines } = session;
  const taxData = await loadTaxDataForBook(book);
  const results = calculatedResultsFor(book, lines, taxData);
  const profitAndLoss = { currentYear: smallCompanyProfitAndLossFromPublishedAccount(results["PubP&L"]) };
  const figures = ct600FiguresFromResults(results, { profitAndLoss });
  const answer = {
    kind: "ct600",
    sourceFileName: session.sourcePath ? basename(session.sourcePath) : book.entityInformation?.organizationDescription || "book",
    packageVersion: await packageVersion(),
    period: { periodStart: figures.periodStart, periodEnd: figures.periodEnd },
    figures,
  };
  if (path) {
    const resolved = resolvePath(path);
    mkdirSync(dirname(resolved), { recursive: true });
    writeFileSync(resolved, JSON.stringify(answer, null, 2) + "\n");
    answer.path = resolved;
  }
  return answer;
}
