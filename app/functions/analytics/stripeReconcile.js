// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/analytics/stripeReconcile.js
//
// Nightly job that pulls the previous day's Stripe balance transactions and charges, plus a
// full subscription snapshot, and writes them as gzipped NDJSON under the lake's
// curated/stripe/ prefix. Customer ids are hashed with the same salt every other hashSub()
// caller in this system uses, so a lake row joins to activity events without ever carrying a
// Stripe identifier, an email address or a card detail.

import { gzipSync } from "zlib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createLogger } from "../../lib/logger.js";
import { getStripeClient } from "../../lib/stripeClient.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/analytics/stripeReconcile.js" });

const SECONDS_PER_DAY = 24 * 60 * 60;

let cachedS3Client = null;

function getS3Client() {
  if (!cachedS3Client) {
    cachedS3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedS3Client;
}

/**
 * Yesterday's date in UTC, as "YYYY-MM-DD". The default reconciliation target: a run that
 * fires just after midnight reconciles the day that just ended.
 *
 * @returns {string}
 */
export function defaultTargetDate() {
  const now = new Date();
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return yesterday.toISOString().slice(0, 10);
}

/**
 * The Stripe `created` window for one UTC calendar day, as epoch seconds: [00:00:00, next
 * 00:00:00). Half-open so a transaction landing exactly on midnight is counted once, in the
 * day it starts.
 *
 * @param {string} dateStr - "YYYY-MM-DD"
 * @returns {{gte: number, lt: number}}
 */
export function computeDateWindow(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const gte = Math.floor(Date.UTC(year, month - 1, day) / 1000);
  return { gte, lt: gte + SECONDS_PER_DAY };
}

/**
 * Hash a Stripe customer reference, which arrives either as a plain id string or, when
 * expanded, as the customer object itself. Returns null for a subscription or charge with no
 * customer, which happens for test fixtures and some incomplete charges.
 *
 * @param {string|{id: string}|null|undefined} customer
 * @returns {string|null}
 */
function hashCustomerId(customer) {
  const id = typeof customer === "string" ? customer : customer?.id;
  if (!id) return null;
  return hashSub(id);
}

function resolveId(value) {
  if (!value) return null;
  return typeof value === "string" ? value : (value.id ?? null);
}

/**
 * Page through a Stripe list endpoint to exhaustion, following `has_more` with
 * `starting_after` rather than the SDK's async-iterator auto-pagination, so the paging
 * behaviour is visible and testable against a plain mocked `list()`.
 *
 * @param {(params: object) => Promise<{data: object[], has_more: boolean}>} listFn
 * @param {object} params
 * @returns {Promise<object[]>}
 */
export async function listAllPages(listFn, params) {
  const results = [];
  let startingAfter;
  for (;;) {
    const page = await listFn({
      ...params,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    results.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
  return results;
}

export function sanitizeBalanceTransaction(tx) {
  return {
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    net: tx.net,
    fee: tx.fee,
    currency: tx.currency,
    created: tx.created,
    available_on: tx.available_on,
    source_id: resolveId(tx.source),
    description: tx.description ?? null,
  };
}

export function sanitizeCharge(charge) {
  return {
    id: charge.id,
    amount: charge.amount,
    amount_refunded: charge.amount_refunded,
    currency: charge.currency,
    created: charge.created,
    paid: charge.paid,
    refunded: charge.refunded,
    status: charge.status,
    failure_code: charge.failure_code ?? null,
    customer: hashCustomerId(charge.customer),
    invoice: resolveId(charge.invoice),
    bundle_id: charge.metadata?.bundleId ?? null,
  };
}

export function sanitizeSubscription(subscription) {
  const item = subscription.items?.data?.[0];
  return {
    id: subscription.id,
    status: subscription.status,
    created: subscription.created,
    current_period_start: subscription.current_period_start ?? null,
    current_period_end: subscription.current_period_end ?? null,
    cancel_at_period_end: subscription.cancel_at_period_end ?? null,
    canceled_at: subscription.canceled_at ?? null,
    customer: hashCustomerId(subscription.customer),
    price_id: item?.price?.id ?? null,
    unit_amount: item?.price?.unit_amount ?? null,
    bundle_id: subscription.metadata?.bundleId ?? null,
  };
}

/**
 * Gzip a list of records as newline-delimited JSON, one object per line. An empty list still
 * produces a valid (empty) gzip member rather than being skipped, so the day's object always
 * exists and a downstream `SELECT count(*)` for a quiet day returns zero, not "table missing".
 *
 * @param {object[]} records
 * @returns {Buffer}
 */
export function toNdjsonGzip(records) {
  const ndjson = records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
  return gzipSync(Buffer.from(ndjson, "utf8"));
}

function objectKey(entity, dateStr) {
  return `curated/stripe/stripe_${entity}/dt=${dateStr}/${entity}.json.gz`;
}

async function putEntityObject(s3Client, bucket, entity, dateStr, records) {
  const key = objectKey(entity, dateStr);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: toNdjsonGzip(records),
      ContentType: "application/json",
      ContentEncoding: "gzip",
    }),
  );
  return key;
}

/**
 * Reconcile one day of Stripe activity into the lake.
 *
 * @param {{date?: string}} [event] - an explicit `date` ("YYYY-MM-DD") overrides yesterday,
 *   which is what a backfill invoke passes.
 * @returns {Promise<{date: string, keys: object, counts: object}>}
 */
export async function handler(event = {}) {
  await initializeSalt();

  const targetDate = event.date ?? defaultTargetDate();
  const isProd = process.env.ENVIRONMENT_NAME === "prod";
  const stripe = await getStripeClient({ test: !isProd });
  const { gte, lt } = computeDateWindow(targetDate);

  const bucket = process.env.ANALYTICS_LAKE_BUCKET_NAME;
  if (!bucket) {
    throw new Error("ANALYTICS_LAKE_BUCKET_NAME environment variable is required");
  }

  const balanceTransactions = (
    await listAllPages((params) => stripe.balanceTransactions.list(params), {
      created: { gte, lt },
      expand: ["data.source"],
    })
  ).map(sanitizeBalanceTransaction);

  const charges = (
    await listAllPages((params) => stripe.charges.list(params), {
      created: { gte, lt },
    })
  ).map(sanitizeCharge);

  // Subscriptions is a full snapshot, not a delta: `dt` reads as "state as at", which is what a
  // subscription question actually wants, and the daily row count is small enough to afford it.
  const subscriptions = (
    await listAllPages((params) => stripe.subscriptions.list(params), {
      status: "all",
    })
  ).map(sanitizeSubscription);

  const s3Client = getS3Client();
  const keys = {
    balance_transactions: await putEntityObject(s3Client, bucket, "balance_transactions", targetDate, balanceTransactions),
    charges: await putEntityObject(s3Client, bucket, "charges", targetDate, charges),
    subscriptions: await putEntityObject(s3Client, bucket, "subscriptions", targetDate, subscriptions),
  };

  const counts = {
    balance_transactions: balanceTransactions.length,
    charges: charges.length,
    subscriptions: subscriptions.length,
  };

  logger.info({ message: "Stripe reconciliation complete", date: targetDate, counts, keys });

  return { date: targetDate, keys, counts };
}
