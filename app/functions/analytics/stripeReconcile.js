// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/analytics/stripeReconcile.js
//
// Nightly job that pulls the previous day's Stripe balance transactions and charges, plus a
// full subscription snapshot, and writes them as gzipped NDJSON under the lake's
// curated/stripe/ prefix. Customer ids are hashed with the same salt every other hashSub()
// caller in this system uses, so a lake row joins to activity events without ever carrying a
// Stripe identifier, an email address or a card detail.

import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "zlib";
import TOML from "@iarna/toml";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createLogger } from "../../lib/logger.js";
import { getStripeClient } from "../../lib/stripeClient.js";

const CHARGE_API_VERSION = "2024-12-18.acacia";
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
 * The spreadsheets site's donation Payment Links, url -> bundle id, from
 * infra/stripe/stripe.toml. Loaded once per reconciliation run, not per charge: a donation
 * charge carries no bundle id of its own when it predates that Payment Link's
 * payment_intent_data.metadata being configured, so resolving it needs this url -> bundle id
 * table matched against the account's live Payment Links (see resolveChargeBundleId).
 *
 * @param {string} [cwd]
 * @returns {Map<string, string>} payment link url -> bundle id
 */
export function loadPaymentLinkBundleIdsFromRoot(cwd = process.cwd()) {
  const filePath = path.join(cwd, "infra/stripe/stripe.toml");
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = TOML.parse(raw);
  return new Map((parsed.payment_link ?? []).map((entry) => [entry.url, entry.bundle_id]));
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

/**
 * Resolve a charge's bundle id. A subscription charge carries no bundle metadata of its own
 * (Stripe refuses `payment_intent_data` on a subscription-mode checkout), so its bundle lives
 * on the subscription that its invoice belongs to: look up the invoice by the charge's
 * `invoice` id to find `invoice.subscription`, then look up that subscription's own
 * `metadata.bundleId`. A donation charge (from a Payment Link, one-off `mode: "payment"`)
 * carries the bundle id directly on `charge.metadata.bundleId`, which Stripe copies from the
 * Payment Link's `payment_intent_data.metadata` onto the PaymentIntent and onto the Charge at
 * creation, so that is the next fallback.
 *
 * A donation charge from before the Payment Link's payment_intent_data.metadata was
 * configured carries neither: metadata is a one-time snapshot at charge creation, and
 * updating the Payment Link's config afterwards does not add it retroactively. The last
 * fallback resolves that case through the Checkout Session the charge's payment intent
 * belongs to: the session's `payment_link` id, matched against the account's live Payment
 * Links to find the one whose url infra/stripe/stripe.toml declares for a bundle.
 *
 * @param {object} charge
 * @param {Map<string, string>} invoiceToSubscription - invoice id -> subscription id
 * @param {Map<string, string>} subscriptionBundleIds - subscription id -> bundle id
 * @param {Map<string, string>} [paymentIntentToPaymentLinkId] - payment intent id -> payment link id
 * @param {Map<string, string>} [paymentLinkIdToBundleId] - payment link id -> bundle id
 * @returns {string|null}
 */
export function resolveChargeBundleId(
  charge,
  invoiceToSubscription,
  subscriptionBundleIds,
  paymentIntentToPaymentLinkId = new Map(),
  paymentLinkIdToBundleId = new Map(),
) {
  const invoiceId = resolveId(charge.invoice);
  const subscriptionId = invoiceId ? invoiceToSubscription.get(invoiceId) : undefined;
  const subscriptionBundleId = subscriptionId ? subscriptionBundleIds.get(subscriptionId) : undefined;
  if (subscriptionBundleId) return subscriptionBundleId;
  if (charge.metadata?.bundleId) return charge.metadata.bundleId;

  const paymentIntentId = resolveId(charge.payment_intent);
  const paymentLinkId = paymentIntentId ? paymentIntentToPaymentLinkId.get(paymentIntentId) : undefined;
  return (paymentLinkId ? paymentLinkIdToBundleId.get(paymentLinkId) : undefined) ?? null;
}

export function sanitizeCharge(
  charge,
  invoiceToSubscription = new Map(),
  subscriptionBundleIds = new Map(),
  paymentIntentToPaymentLinkId = new Map(),
  paymentLinkIdToBundleId = new Map(),
) {
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
    bundle_id: resolveChargeBundleId(
      charge,
      invoiceToSubscription,
      subscriptionBundleIds,
      paymentIntentToPaymentLinkId,
      paymentLinkIdToBundleId,
    ),
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

  // Subscriptions is a full snapshot, not a delta: `dt` reads as "state as at", which is what a
  // subscription question actually wants, and the daily row count is small enough to afford it.
  // Fetched before charges so a subscription charge's bundle_id can resolve against it below.
  const rawSubscriptions = await listAllPages((params) => stripe.subscriptions.list(params), {
    status: "all",
  });
  const subscriptions = rawSubscriptions.map(sanitizeSubscription);
  const subscriptionBundleIds = new Map(rawSubscriptions.map((s) => [s.id, s.metadata?.bundleId ?? null]));

  // A donation charge from before its Payment Link's payment_intent_data.metadata was
  // configured carries no bundle metadata snapshot. Resolving it needs the account's live
  // Payment Links, matched by url against infra/stripe/stripe.toml, plus the day's Checkout
  // Sessions, which is where a Charge's payment_link actually lives (the Charge and
  // PaymentIntent objects do not carry it).
  const paymentLinkUrlToBundleId = loadPaymentLinkBundleIdsFromRoot();
  const livePaymentLinks = await listAllPages((params) => stripe.paymentLinks.list(params), {});
  const paymentLinkIdToBundleId = new Map(
    livePaymentLinks.map((link) => [link.id, paymentLinkUrlToBundleId.get(link.url)]).filter(([, bundleId]) => bundleId != null),
  );
  const rawCheckoutSessions = await listAllPages((params) => stripe.checkout.sessions.list(params), {
    created: { gte, lt },
  });
  const paymentIntentToPaymentLinkId = new Map(
    rawCheckoutSessions
      .filter((session) => session.payment_intent && session.payment_link)
      .map((session) => [resolveId(session.payment_intent), resolveId(session.payment_link)]),
  );

  // expand data.invoice: a subscription-mode checkout carries no bundle metadata on the charge
  // itself (Stripe refuses payment_intent_data in that mode), so the charge's invoice is the
  // only way to reach the subscription that does carry it.
  // Charges are read at a pinned API version: from 2025-03-31.basil a charge carries no
  // `invoice`, and an invoice no top-level `subscription`, so the account's default version
  // returns every subscription charge with nothing to resolve.
  const rawCharges = await listAllPages((params) => stripe.charges.list(params, { apiVersion: CHARGE_API_VERSION }), {
    created: { gte, lt },
    expand: ["data.invoice"],
  });
  const invoiceToSubscription = new Map(
    rawCharges
      .filter((charge) => charge.invoice && typeof charge.invoice === "object")
      .map((charge) => [charge.invoice.id, resolveId(charge.invoice.subscription)]),
  );
  const charges = rawCharges.map((charge) =>
    sanitizeCharge(charge, invoiceToSubscription, subscriptionBundleIds, paymentIntentToPaymentLinkId, paymentLinkIdToBundleId),
  );

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
