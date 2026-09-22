// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// practice-tools.js -- the practice's own client-book operations. Unlike the rest of this
// server's tools, these reach DIY Accounting Submit's own API rather than the local filesystem:
// a client's book set lives in the deployed backend's S3 storage (PLAN_PRICE_UPDATE.md (d)),
// never on this machine, so moving a book into it is a network call, not a file copy.
//
// Configuration comes from the environment: DIYA_SUBMIT_BASE_URL (the deployed site's base URL,
// e.g. https://submit.diyaccounting.co.uk/) and DIYA_SUBMIT_ACCESS_TOKEN (the signed-in
// practice's own session bearer token). Obtaining that token is outside this tool's scope.

function baseUrl() {
  const value = process.env.DIYA_SUBMIT_BASE_URL;
  if (!value) throw new Error("DIYA_SUBMIT_BASE_URL is not set");
  return value.replace(/\/$/, "");
}

function accessToken() {
  const value = process.env.DIYA_SUBMIT_ACCESS_TOKEN;
  if (!value) throw new Error("DIYA_SUBMIT_ACCESS_TOKEN is not set");
  return value;
}

/**
 * Moves one of the practice's own books to a client's book set, by calling DIY Accounting
 * Submit's own move route. The route itself verifies every copy before any delete and refuses
 * when the destination already holds a book with this id; this tool just carries that answer
 * back, or throws with the API's own message when it refuses.
 *
 * @param {Object} _session - unused; this tool carries no local session state
 * @param {{clientId: string, bookId: string}} params
 * @returns {Promise<{bookId: string, clientId: string, movedObjectCount: number}>}
 */
export async function moveBookToClient(_session, { clientId, bookId } = {}) {
  if (!clientId) throw new Error("move_book_to_client requires a clientId");
  if (!bookId) throw new Error("move_book_to_client requires a bookId");

  const url = `${baseUrl()}/api/v1/practice/clients/${encodeURIComponent(clientId)}/books/${encodeURIComponent(bookId)}/move`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `move_book_to_client failed with HTTP ${response.status}`);
  }
  return body;
}
