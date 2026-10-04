// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
