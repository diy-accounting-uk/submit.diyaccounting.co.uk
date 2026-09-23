#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * Stages a month's PayPal transactions to the workspace's staging tree, as the raw Transaction
 * Search API objects with each one's transaction_status field kept. Holds and their reversals
 * are not filtered out here - that filter is the parser's job once these files exist, the same
 * way Stripe's fee is kept separate rather than netted here.
 *
 * Reads the client id and secret from AWS Secrets Manager, at
 *   prod/submit/paypal/client_id
 *   prod/submit/paypal/client_secret
 * which deploy-environment.yml lands from the prod GitHub environment's PAYPAL_CLIENT_ID and
 * PAYPAL_CLIENT_SECRET. Never from an environment variable; a missing secret throws, naming the
 * secret id, rather than falling back to anything.
 *
 * Usage:
 *   AWS_PROFILE=submit-prod node scripts/finance/paypal-stage.js --month 2026-03
 *
 * Writes:
 *   ../staging/<year-end>/paypal/<yyyy-mm-dd>-paypal-transactions.json
 * (the file's date is the month's last day; the year-end is picked from that date)
 *
 * Nothing here prints or writes a client secret or an access token.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { resolveStagingDir } from "./lib/staging-paths.js";

const __filename = fileURLToPath(import.meta.url);

const OAUTH_TOKEN_URL = "https://api-m.paypal.com/v1/oauth2/token";
const TRANSACTIONS_URL = "https://api-m.paypal.com/v1/reporting/transactions";
const PAGE_SIZE = 500;
const CLIENT_ID_SECRET = "prod/submit/paypal/client_id";
const CLIENT_SECRET_SECRET = "prod/submit/paypal/client_secret";

/**
 * @param {string[]} argv - process.argv.slice(2)
 */
export function parseArgs(argv) {
  const opts = { month: undefined };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--month":
        opts.month = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  if (!opts.month || !/^\d{4}-\d{2}$/.test(opts.month)) {
    throw new Error('--month is required, in the shape "YYYY-MM"');
  }
  return opts;
}

/**
 * @param {string} month - "YYYY-MM"
 * @returns {{start: Date, end: Date, lastDay: Date}} start is the month's first instant in UTC;
 *   end is the month's last instant in UTC (23:59:59, the Transaction Search API's end_date is
 *   inclusive and the range cannot exceed 31 days, which one calendar month never does);
 *   lastDay is the month's last calendar day, the staged file's date stamp.
 */
export function computeMonthRange(month) {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1; // 0-11
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59));
  return { start, end, lastDay };
}

/**
 * @param {Date} date
 * @returns {string} "yyyy-mm-dd"
 */
export function formatDateStamp(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * @param {Date} date
 * @returns {string} the Transaction Search API's start_date/end_date shape, e.g.
 *   "2026-03-01T00:00:00+0000"
 */
export function formatPayPalDateTime(date) {
  return `${date.toISOString().split(".")[0]}+0000`;
}

/**
 * @param {string} month - "YYYY-MM"
 * @param {string} [cwd]
 */
export function stagingFilePaths(month, cwd = process.cwd()) {
  const { lastDay } = computeMonthRange(month);
  const dateStamp = formatDateStamp(lastDay);
  const dir = resolveStagingDir(lastDay, "paypal", cwd);
  return {
    dir,
    dateStamp,
    transactionsFile: path.join(dir, `${dateStamp}-paypal-transactions.json`),
  };
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
  const response = await fetchImpl(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
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

/**
 * Fetches a month's transactions and writes them as one JSON array.
 *
 * @param {string} accessToken
 * @param {string} month - "YYYY-MM"
 * @param {string} [cwd]
 * @param {typeof fetch} [fetchImpl]
 */
export async function stageMonth(accessToken, month, cwd = process.cwd(), fetchImpl = fetch) {
  const { start, end } = computeMonthRange(month);
  const { dir, transactionsFile } = stagingFilePaths(month, cwd);
  const transactions = await fetchAllTransactions(accessToken, start, end, fetchImpl);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(transactionsFile, JSON.stringify(transactions, null, 2));
  return { transactionsFile, transactionCount: transactions.length };
}

async function getSecretValue(secretId) {
  const client = new SecretsManagerClient({});
  const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!SecretString) {
    throw new Error(`Secret ${secretId} has no SecretString`);
  }
  return SecretString;
}

async function readCredentials() {
  const [clientId, clientSecret] = await Promise.all([getSecretValue(CLIENT_ID_SECRET), getSecretValue(CLIENT_SECRET_SECRET)]);
  return { clientId, clientSecret };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { clientId, clientSecret } = await readCredentials();
  const accessToken = await fetchAccessToken(clientId, clientSecret);
  const result = await stageMonth(accessToken, opts.month);
  console.log(`[paypal-stage] ${opts.month}: ${result.transactionCount} transactions -> ${result.transactionsFile}`);
}

if (process.argv[1] === __filename) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
