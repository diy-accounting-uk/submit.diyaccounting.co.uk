// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// batch-tools.js -- run_for_clients: one client-scoped tool, run once per client in the
// practice's own list (practice-tools.js's listClients), collecting one result row per client.
// The allow-list is exactly the tools that take a clientId to act on one client at a time --
// the four submission tools (submit-tools.js) and the two book tools (book-tools.js) -- not
// practice-tools.js's own client-management tools (list_clients has no clientId to loop over;
// add_client creates a client rather than acting on an existing one; invite_client and
// client_authorisation_status already take one clientId per call by design, so looping them
// over every client would invite an authorisation request or a status check nobody asked for).
//
// A failure for one client is carried in that client's row, never thrown; run_for_clients throws
// only when the client list itself cannot be read, since without it there is nothing to loop over.

import { openBook, saveBook } from "./book-tools.js";
import { listClients } from "./practice-tools.js";
import { listVatObligations, submitVatReturn, getVatReceipt, submitMicroEntityAccounts } from "./submit-tools.js";

const HANDLERS = {
  list_vat_obligations: listVatObligations,
  submit_vat_return: submitVatReturn,
  get_vat_receipt: getVatReceipt,
  submit_micro_entity_accounts: submitMicroEntityAccounts,
  open_book: openBook,
  save_book: saveBook,
};

export const RUN_FOR_CLIENTS_TOOLS = Object.keys(HANDLERS);

/**
 * run_for_clients: lists the practice's own clients, then calls the chosen tool once per client
 * with that client's clientId merged into args (args' own clientId, if given, is overridden -- the
 * point of this tool is to run for every client, not to repeat one). Each call's outcome becomes
 * one row; a rejected call becomes {ok: false, error}, never a thrown error, so one client's
 * failure never stops the rest.
 * @param {Object} session - passed through to each per-client call unchanged
 * @param {{tool: string, args?: Object}} params
 * @returns {Promise<{tool: string, rows: Array<{clientId: string, displayName: string, ok: boolean, result?: *, error?: string}>, summary: {total: number, ok: number, failed: number}}>}
 */
export async function runForClients(session, { tool, args = {} } = {}) {
  const handler = HANDLERS[tool];
  if (!handler) {
    throw new Error(`run_for_clients does not support tool "${tool}"; must be one of ${RUN_FOR_CLIENTS_TOOLS.join(", ")}`);
  }

  const { clients } = await listClients(session, {});

  const rows = [];
  for (const client of clients) {
    try {
      const result = await handler(session, { ...args, clientId: client.clientId });
      rows.push({ clientId: client.clientId, displayName: client.displayName, ok: true, result });
    } catch (err) {
      rows.push({ clientId: client.clientId, displayName: client.displayName, ok: false, error: err?.message ?? String(err) });
    }
  }

  const okCount = rows.filter((row) => row.ok).length;
  return { tool, rows, summary: { total: rows.length, ok: okCount, failed: rows.length - okCount } };
}
