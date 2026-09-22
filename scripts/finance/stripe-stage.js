#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * Stages a month's Stripe balance transactions and payouts to the workspace's staging tree, as
 * the raw Stripe objects, gross, fee and net kept separate (nothing here nets a charge against
 * its fee; that belongs to the parser that later turns these files into diya-gl lines).
 *
 * Reads the live secret key the way infra/stripe/stripe-sync.js reads it for --mode live: from
 * infra/stripe/stripe.toml's [keys.prod].live entry, resolved in AWS Secrets Manager, never from
 * an environment variable. This is a read-only listing; nothing here writes to Stripe.
 *
 * Usage:
 *   AWS_PROFILE=submit-prod node scripts/finance/stripe-stage.js --month 2026-03
 *
 * Writes, under ../staging/<year-end>/stripe/ (the year-end picked from the month's last day):
 *   <yyyy-mm-dd>-stripe-balance-transactions.json
 *   <yyyy-mm-dd>-stripe-payouts.json
 *
 * Nothing here prints or writes a key.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { loadConfigFromRoot } from "../../infra/stripe/stripe-sync.js";
import { resolveStagingDir } from "./lib/staging-paths.js";

const __filename = fileURLToPath(import.meta.url);

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
 *   end is the next month's first instant in UTC (exclusive, for Stripe's created[gte]/[lt]);
 *   lastDay is the month's last calendar day, the staged files' date stamp.
 */
export function computeMonthRange(month) {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1; // 0-11
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
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
  const dir = resolveStagingDir(lastDay, "stripe", cwd);
  return {
    dir,
    dateStamp,
    balanceTransactionsFile: path.join(dir, `${dateStamp}-stripe-balance-transactions.json`),
    payoutsFile: path.join(dir, `${dateStamp}-stripe-payouts.json`),
  };
}

/**
 * Pages through balance_transactions for [start, end), expanding each one's source, as the raw
 * Stripe objects.
 *
 * @param {import("stripe").Stripe} stripe
 * @param {Date} start
 * @param {Date} end
 */
export async function fetchBalanceTransactions(stripe, start, end) {
  const transactions = [];
  let startingAfter;
  for (;;) {
    const page = await stripe.balanceTransactions.list({
      created: { gte: Math.floor(start.getTime() / 1000), lt: Math.floor(end.getTime() / 1000) },
      expand: ["data.source"],
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    transactions.push(...page.data);
    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return transactions;
}

/**
 * Pages through payouts for [start, end), as the raw Stripe objects.
 *
 * @param {import("stripe").Stripe} stripe
 * @param {Date} start
 * @param {Date} end
 */
export async function fetchPayouts(stripe, start, end) {
  const payouts = [];
  let startingAfter;
  for (;;) {
    const page = await stripe.payouts.list({
      created: { gte: Math.floor(start.getTime() / 1000), lt: Math.floor(end.getTime() / 1000) },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    payouts.push(...page.data);
    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return payouts;
}

/**
 * Fetches a month's balance transactions and payouts, and writes both as one JSON array per
 * file under the staging tree.
 *
 * @param {import("stripe").Stripe} stripe
 * @param {string} month - "YYYY-MM"
 * @param {string} [cwd]
 */
export async function stageMonth(stripe, month, cwd = process.cwd()) {
  const { start, end } = computeMonthRange(month);
  const { dir, balanceTransactionsFile, payoutsFile } = stagingFilePaths(month, cwd);
  const [transactions, payouts] = await Promise.all([fetchBalanceTransactions(stripe, start, end), fetchPayouts(stripe, start, end)]);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(balanceTransactionsFile, JSON.stringify(transactions, null, 2));
  fs.writeFileSync(payoutsFile, JSON.stringify(payouts, null, 2));
  return { balanceTransactionsFile, payoutsFile, transactionCount: transactions.length, payoutCount: payouts.length };
}

async function readLiveSecretKey() {
  const config = loadConfigFromRoot();
  const secretName = config.keys.prod?.live;
  if (!secretName) {
    throw new Error("infra/stripe/stripe.toml has no [keys.prod].live");
  }
  const client = new SecretsManagerClient({});
  const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
  if (!SecretString) {
    throw new Error(`Secret ${secretName} has no SecretString`);
  }
  return SecretString;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const secretKey = await readLiveSecretKey();
  const stripe = new Stripe(secretKey);
  const result = await stageMonth(stripe, opts.month);
  console.log(
    `[stripe-stage] ${opts.month}: ${result.transactionCount} balance transactions, ${result.payoutCount} payouts -> ${result.balanceTransactionsFile}, ${result.payoutsFile}`,
  );
}

if (process.argv[1] === __filename) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
