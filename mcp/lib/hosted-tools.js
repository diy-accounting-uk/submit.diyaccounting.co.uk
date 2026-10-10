// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// hosted-tools.js -- the tools the hosted MCP endpoint registers, and the two
// that change shape there: open_book reads the DIYA cloud only, and
// derive_itsa_annual_submission answers without writing a file. The tools left
// out are the sign-in pair (the connector owns sign-in), the filesystem tools,
// the tools that reach HMRC, and the fan-out over every client.

import { z } from "zod";

import { openBook } from "./book-tools.js";
import { deriveItsaAnnualSubmission } from "./itsa-tools.js";

export const HOSTED_TOOL_NAMES = [
  "open_book",
  "derive_vat_return",
  "derive_micro_entity_accounts",
  "derive_small_company_accounts",
  "derive_itsa_quarterly_update",
  "derive_itsa_annual_submission",
  "get_vat_receipt",
  "preview_micro_entity_accounts",
  "submit_micro_entity_accounts",
  "poll_accounts_submission",
  "get_confirmation_statement_data",
  "preview_confirmation_statement",
  "submit_confirmation_statement",
  "poll_confirmation_statement",
  "list_clients",
  "add_client",
  "move_book_to_client",
];

export const HOSTED_OVERRIDES = {
  open_book: {
    description:
      "Open a book saved in the DIYA cloud by bookId (a practice client's own book with clientId), signed in as the " +
      "caller. Answers the product, the entity, the period covered, the line count and the book checks summary. " +
      "Replaces the session's loaded book.",
    inputSchema: {
      bookId: z.string().describe("The cloud book's id"),
      clientId: z.string().optional().describe("A practice client's id, to open that client's book instead of the practice's own"),
    },
    handler: async (session, { bookId, clientId } = {}) => {
      if (!bookId) throw new Error("open_book requires bookId");
      return openBook(session, { cloud: true, bookId, clientId });
    },
  },
  derive_itsa_annual_submission: {
    description:
      "The year's allowances and adjustments for HMRC's Self Employment Business API annual submission from the loaded " +
      "self-employed book, restricted to the fields HMRC accepts for that tax year.",
    inputSchema: {
      taxYear: z.string().optional().describe("Override the tax year the book's dates imply, as 2025-26"),
    },
    handler: (session, { taxYear } = {}) => deriveItsaAnnualSubmission(session, { taxYear }),
  },
};
