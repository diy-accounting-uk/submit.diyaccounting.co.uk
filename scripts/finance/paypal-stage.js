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
 *   AWS_PROFILE=diya-submit-prod node scripts/finance/paypal-stage.js --month 2026-03
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
import { fetchAccessToken, fetchAllTransactions } from "../../app/services/paypalTransactionSearch.js";
import { resolveStagingDir } from "./lib/staging-paths.js";

const __filename = fileURLToPath(import.meta.url);

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
