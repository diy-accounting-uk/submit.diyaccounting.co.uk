// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability MCP-05 Derive VAT figures via MCP tools
// - **Use when:** a VAT return's nine HMRC boxes must be computed from a loaded book before filing or review.
// - **Does:** deriveVatReturn in mcp/lib/vat-tools.js reads the engine's Vatreturns.xlsx Vatinterface sheet for one obligation quarter. It cross-checks the sheet totals against the sales and purchases journal lines and throws on disagreement. It returns every line behind boxes 1, 4, 6 and 7.
// - **Run:** no command; see Does and Entry
// - **Entry:** `mcp/lib/vat-tools.js:deriveVatReturn`; `mcp/lib/vat-tools.js:interfaceRows`
// - **Files:** mcp/lib/vat-tools.js, mcp/test/vat-tools.test.js
// - **Keywords:** derive_vat_return, vat boxes, vatinterface, hmrc vat, vat return, reconcile, mtd vat
// - **Related:** MCP-03, MCP-07
// @end-capability

// vat-tools.js -- derive_vat_return: the nine VAT boxes for one obligation
// period from the session's loaded book. The derivation is the diya-gl
// package's own; this module adds only the session's "no book loaded" check.

import { deriveVatReturn as deriveVatReturnFromBook } from "@diy-accounting-uk/diya-gl";

/**
 * derive_vat_return: the nine boxes for the quarter ending on periodEnd,
 * from the session's loaded book.
 * @param {Object} session
 * @param {{periodEnd: string, periodStart?: string, periodKey?: string}} params
 */
export async function deriveVatReturn(session, params = {}) {
  if (!session.book || !session.lines) {
    throw new Error("No book is loaded. Call open_book first.");
  }
  return deriveVatReturnFromBook(session.book, session.lines, params);
}
