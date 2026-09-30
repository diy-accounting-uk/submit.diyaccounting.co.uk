// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/paypalTransactionSearch.js
//
// PayPal's OAuth client_credentials grant and Transaction Search API, read-only. Shared by the
// nightly PayPal donations pull and by scripts/finance/paypal-stage.js.

const OAUTH_TOKEN_URL = "https://api-m.paypal.com/v1/oauth2/token";
const TRANSACTIONS_URL = "https://api-m.paypal.com/v1/reporting/transactions";
const PAGE_SIZE = 500;
/**
 * @param {Date} date
 * @returns {string} the Transaction Search API's start_date/end_date shape, e.g.
 *   "2026-03-01T00:00:00+0000"
 */
export function formatPayPalDateTime(date) {
  return `${date.toISOString().split(".")[0]}+0000`;
}

/**
 * Exchanges the client id and secret for an access token via the client_credentials grant.
 *
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>} the bearer access token
 */
export async function fetchAccessToken(clientId, clientSecret, fetchImpl = fetch) {
  const basicCredentials = Buffer.from(clientId + ":" + clientSecret).toString("base64");
  const response = await fetchImpl(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicCredentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`PayPal OAuth token request failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

/**
 * Fetches one page of the Transaction Search API's results.
 *
 * @param {string} accessToken
 * @param {{startDate: Date, endDate: Date, page: number}} params
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchTransactionsPage(accessToken, { startDate, endDate, page }, fetchImpl = fetch) {
  const query = new URLSearchParams({
    start_date: formatPayPalDateTime(startDate),
    end_date: formatPayPalDateTime(endDate),
    fields: "all",
    page_size: String(PAGE_SIZE),
    page: String(page),
  });
  const response = await fetchImpl(`${TRANSACTIONS_URL}?${query}`, {
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`PayPal Transaction Search request failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

/**
 * Pages through the Transaction Search API for [start, end], as the raw
 * transaction_details objects (status field intact; nothing filtered here).
 *
 * @param {string} accessToken
 * @param {Date} start
 * @param {Date} end
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchAllTransactions(accessToken, start, end, fetchImpl = fetch) {
  const transactions = [];
  let page = 1;
  let totalPages = 1;
  do {
    const body = await fetchTransactionsPage(accessToken, { startDate: start, endDate: end, page }, fetchImpl);
    transactions.push(...(body.transaction_details ?? []));
    totalPages = body.total_pages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return transactions;
}
