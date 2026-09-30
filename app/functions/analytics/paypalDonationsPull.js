// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/analytics/paypalDonationsPull.js
//
// Nightly job that pulls the previous day's PayPal transactions from the Transaction Search API,
// keeps the settled receipts (donations and any other incoming payment) and their refunds, and writes them as
// gzipped NDJSON under the lake's curated/paypal/ prefix. Holds, releases, currency conversions,
// bank transfers, pending or denied rows and outgoing payments are dropped. A lake row
// carries the transaction id, date, amounts, currency and a product label; it never carries a
// payer name, email address or address.

import { gzipSync } from "zlib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger } from "../../lib/logger.js";
import { createPacer, fetchAccessToken, fetchAllTransactions, realSleep } from "../../services/paypalTransactionSearch.js";
import {
  CREDIT_NOTE_EVENT_CODES,
  REFUND_EVENT_CODES,
  adaptTransactions,
  gbpAmountOf,
  isScaffolding,
} from "../../services/paypalTransactions.js";

const logger = createLogger({ source: "app/functions/analytics/paypalDonationsPull.js" });

const DONATION_EVENT_CODE = "T0013";
const DONATION_PRODUCT = "donation-paypal";
const OTHER_RECEIPT_PRODUCT = "paypal-other-receipt";

let cachedS3Client = null;
let cachedSecretsClient = null;

function getS3Client() {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

function getSecretsClient() {
  if (!cachedSecretsClient) {
    cachedSecretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedSecretsClient;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

async function readSecret(secretId) {
  const { SecretString } = await getSecretsClient().send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!SecretString) throw new Error(`Secret ${secretId} has no SecretString`);
  return SecretString;
}

/**
 * Yesterday's date in UTC, as "YYYY-MM-DD".
 *
 * @returns {string}
 */
export function defaultTargetDate() {
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return yesterday.toISOString().slice(0, 10);
}

/**
 * The Transaction Search window for one UTC calendar day: its first second to the last second of
 * the next day, so a currency conversion made just after midnight is on the page. The API's end
 * date is inclusive.
 *
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {{start: Date, end: Date}}
 */
export function computeDayWindow(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, day, 0, 0, 0)),
    end: new Date(Date.UTC(year, month - 1, day + 1, 23, 59, 59)),
  };
}

/**
 * The lake rows for one page of raw Transaction Search records.
 *
 * A row is a settled receipt (positive, not scaffolding, not a credit note) or a settled refund
 * of one (negative, with refund_of naming the original). A T0013 record is a donation; any other
 * receipt is labelled separately so the revenue view can tell them apart. amount is the pound
 * figure: a pound record's own gross, or for another currency the pound leg of the T0200
 * conversion that names it. A record with no such leg is left out and reported through
 * onUnmatched. original_amount and original_currency keep the record as PayPal reported it.
 * A refund's product is the original's when the original is on the same page, otherwise null and
 * the view resolves it from refund_of.
 *
 * @param {Array<Object>} transactions - raw transaction_details objects
 * @param {{onUnmatched?: (id: string, currency: string) => void, onlyDate?: string}} [options]
 *   onlyDate keeps rows dated that day, so a search window that reaches into the next day (to
 *   find a conversion made after midnight) does not write the next day's receipts twice.
 * @returns {Array<Object>}
 */
export function donationRowsFromTransactions(transactions, { onUnmatched = () => {}, onlyDate } = {}) {
  const { adaptedRecords, byId } = adaptTransactions(transactions);
  const rows = [];
  for (const adapted of adaptedRecords) {
    if (onlyDate && adapted.date !== onlyDate) continue;
    const isRefund = REFUND_EVENT_CODES.has(adapted.code) && adapted.status === "Completed" && adapted.gross < 0;
    if (!isRefund) {
      if (isScaffolding(adapted, byId) || CREDIT_NOTE_EVENT_CODES.has(adapted.code) || adapted.gross <= 0) continue;
      if (REFUND_EVENT_CODES.has(adapted.code)) continue;
    }
    const gbp = gbpAmountOf(adapted, adaptedRecords);
    if (gbp === undefined) {
      onUnmatched(adapted.id, adapted.currency);
      continue;
    }
    const original = isRefund ? byId.get(adapted.referenceId) : undefined;
    const receipt = original ?? adapted;
    const knownProduct = isRefund && !original ? null : productOf(receipt);
    rows.push({
      id: adapted.id,
      date: adapted.date,
      amount: gbp,
      fee: Math.abs(adapted.fee),
      product: knownProduct,
      original_amount: adapted.gross,
      original_currency: adapted.currency,
      refund_of: isRefund ? (adapted.referenceId ?? null) : null,
    });
  }
  return rows;
}

function productOf(adapted) {
  return adapted.code === DONATION_EVENT_CODE ? DONATION_PRODUCT : OTHER_RECEIPT_PRODUCT;
}

/**
 * Gzip a list of records as newline-delimited JSON. An empty list still produces a valid
 * (empty) gzip member so the day's object always exists.
 *
 * @param {object[]} records
 * @returns {Buffer}
 */
export function toNdjsonGzip(records) {
  const ndjson = records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
  return gzipSync(Buffer.from(ndjson, "utf8"));
}

export function objectKey(dateStr) {
  return `curated/paypal/paypal_donations/dt=${dateStr}/donations.json.gz`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 93;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The inclusive list of days a request covers: its `date`, its `from` and `to`, or yesterday.
 *
 * @param {{date?: string, from?: string, to?: string}} event
 * @returns {string[]} "YYYY-MM-DD" days in order
 */
export function daysOf(event) {
  const { date, from, to } = event;
  if (date && (from || to)) throw new Error("Pass either date or from and to, not both");
  if (from || to) {
    if (!from || !to) throw new Error("from and to must be passed together");
    for (const value of [from, to]) {
      if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`Not an ISO date: ${value}`);
    }
    const span = (Date.parse(to) - Date.parse(from)) / MS_PER_DAY + 1;
    if (span < 1) throw new Error(`from ${from} is after to ${to}`);
    if (span > MAX_RANGE_DAYS) throw new Error(`A range covers at most ${MAX_RANGE_DAYS} days, ${from} to ${to} is ${span}`);
    return Array.from({ length: span }, (_, offset) => new Date(Date.parse(from) + offset * MS_PER_DAY).toISOString().slice(0, 10));
  }
  const single = date ?? defaultTargetDate();
  if (!ISO_DATE.test(single) || Number.isNaN(Date.parse(single))) throw new Error(`Not an ISO date: ${single}`);
  return [single];
}

/**
 * Pull PayPal receipts into the lake, one object per day.
 *
 * @param {{date?: string, from?: string, to?: string}} [event] - `date` ("YYYY-MM-DD") overrides
 *   yesterday; `from` and `to` (inclusive, at most 93 days) backfill a range.
 * @returns {Promise<{days: Array<{date: string, key: string, count: number}>}>}
 */
export async function handler(event = {}) {
  const bucket = requireEnv("ANALYTICS_LAKE_BUCKET_NAME");
  const clientIdSecretId = requireEnv("PAYPAL_CLIENT_ID_SECRET_ID");
  const clientSecretSecretId = requireEnv("PAYPAL_CLIENT_SECRET_SECRET_ID");
  const days = daysOf(event);

  const [clientId, clientSecret] = await Promise.all([readSecret(clientIdSecretId), readSecret(clientSecretSecretId)]);
  const accessToken = await fetchAccessToken(clientId, clientSecret);

  const pace = createPacer();
  const results = [];
  for (const targetDate of days) {
    const { start, end } = computeDayWindow(targetDate);
    const transactions = await fetchAllTransactions(accessToken, start, end, fetch, { sleep: realSleep, pace });
    const rows = donationRowsFromTransactions(transactions, {
      onlyDate: targetDate,
      onUnmatched: (id, currency) =>
        logger.warn({ message: "PayPal receipt left out: no pound conversion names it", transactionId: id, currency }),
    });

    const key = objectKey(targetDate);
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: toNdjsonGzip(rows),
        ContentType: "application/json",
        ContentEncoding: "gzip",
      }),
    );
    logger.info({ message: "PayPal donations pull complete", date: targetDate, count: rows.length, key });
    results.push({ date: targetDate, key, count: rows.length });
  }
  return { days: results };
}
