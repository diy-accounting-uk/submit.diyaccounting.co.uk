// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/helpers/ga4PurchaseQuery.js
//
// Confirms a real GA4 `purchase` event reached BigQuery, for the ci purchase assertion in
// payment.behaviour.test.js.
//
// The ci property's BigQuery link only has the daily export enabled (see
// infra/google/ga4/ga4-sync.js — no streaming export), and that daily table for a given day
// can take up to about 27 hours after the day closes to appear (the same margin app/functions/
// analytics/ga4EventExportPull.js's D-2 targeting is built around). A same-run purchase event's row
// therefore cannot exist yet when the test that fired it is still running. So this check looks
// up a PAST run's transaction id (a Stripe test-mode subscription id, created on a day whose
// daily export should already have landed) and confirms BigQuery has ingested a purchase event
// carrying it, rather than polling for the current run's own event.
//
// Reads application default credentials, the same federated path ga4EventExportPull.js uses —
// no new credential for this check. probe-test.yml authenticates the job to Google before this
// runs.

import { BigQuery } from "@google-cloud/bigquery";
import { assertFederatedCredentials } from "../../infra/google/lib/googleAuth.js";
import { getStripeClient } from "@app/lib/stripeClient.js";

let cachedClient = null;

async function getBigQueryClient(projectId) {
  if (cachedClient) {
    return cachedClient;
  }
  assertFederatedCredentials();
  cachedClient = new BigQuery({ projectId });
  return cachedClient;
}

function dailyTableSuffixes(lookbackDays) {
  const suffixes = [];
  const now = new Date();
  for (let daysAgo = 0; daysAgo <= lookbackDays; daysAgo++) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
    suffixes.push(day.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return suffixes;
}

const dayMs = 24 * 60 * 60 * 1000;
export const dailyExportLagMs = 27 * 60 * 60 * 1000;

/**
 * The creation-time window a transaction must fall in for its purchase event to be readable in
 * the daily tables: created on a UTC day whose daily table has had `dailyExportLagMs` since the
 * day closed (so the table has landed), and on or after the first day of the `lookbackDays`
 * tables the query reads, and after the first whole day the export covers.
 *
 * @param {{nowMs: number, lookbackDays: number, exportFirstWholeDayStartMs: number|null}} input
 * @returns {{createdAfterMs: number, createdBeforeMs: number}|null} null when no day qualifies
 */
export function exportedTransactionWindow({ nowMs, lookbackDays, exportFirstWholeDayStartMs }) {
  if (exportFirstWholeDayStartMs === null) return null;
  const todayStartMs = Math.floor(nowMs / dayMs) * dayMs;
  const createdBeforeMs = Math.floor((nowMs - dailyExportLagMs) / dayMs) * dayMs;
  const createdAfterMs = Math.max(todayStartMs - lookbackDays * dayMs, exportFirstWholeDayStartMs);
  return createdAfterMs < createdBeforeMs ? { createdAfterMs, createdBeforeMs } : null;
}

/**
 * Picks the newest subscription that came from the same user pool as the current run's
 * subscription (same `hashedSub` metadata). Stripe test mode is shared by the ci and prod
 * lanes, which use the same synthetic email, but only a ci run fires a GA4 purchase, so the
 * email cannot tell them apart and the user-pool hash can.
 *
 * @param {Array<{id: string, created: number, metadata?: Record<string, string>}>} subscriptions newest first
 * @param {{hashedSub: string}} criteria
 * @returns {{id: string, createdMs: number}|null}
 */
export function selectPriorPurchaseSubscription(subscriptions, { hashedSub }) {
  const match = subscriptions.find((subscription) => subscription.metadata?.hashedSub === hashedSub);
  return match ? { id: match.id, createdMs: match.created * 1000 } : null;
}

/**
 * Finds a Stripe test-mode subscription created inside the window (see exportedTransactionWindow)
 * by the same user pool as `currentSubscriptionId`. Every ci run of payment.behaviour.test.js
 * creates and later cancels one such subscription and fires a purchase carrying its id, so this
 * stands in for a persisted "last run's transaction id" without adding new storage. Prod probes
 * and other lanes fire no purchase, hence the user-pool match.
 *
 * @param {{createdAfterMs: number, createdBeforeMs: number, currentSubscriptionId: string}} window
 * @returns {Promise<{id: string, createdMs: number}|null>}
 */
export async function findPastStripeSubscription({ createdAfterMs, createdBeforeMs, currentSubscriptionId }) {
  if (createdBeforeMs <= createdAfterMs) return null;
  const stripe = await getStripeClient({ test: true });
  const current = await stripe.subscriptions.retrieve(currentSubscriptionId);
  const hashedSub = current.metadata?.hashedSub;
  if (!hashedSub) {
    throw new Error(`Stripe subscription ${currentSubscriptionId} has no hashedSub metadata`);
  }
  const subscriptions = await stripe.subscriptions.list({
    status: "all",
    created: {
      gte: Math.floor(createdAfterMs / 1000),
      lt: Math.floor(createdBeforeMs / 1000),
    },
    limit: 100,
  });
  return selectPriorPurchaseSubscription(subscriptions.data, { hashedSub });
}

/**
 * The start (UTC midnight, in ms) of the first whole day the GA4 export dataset covers: the day
 * after its oldest daily table, since the export can begin part way through that day. Null when
 * the dataset holds no daily table. A purchase fired earlier may never have been exported.
 *
 * @param {{projectId: string, datasetId: string}} input
 * @returns {Promise<number|null>}
 */
export async function exportFirstWholeDayStartMs({ projectId, datasetId }) {
  const client = await getBigQueryClient(projectId);
  const [tables] = await client.dataset(datasetId).getTables();
  const days = tables
    .map((table) => /^events_(\d{4})(\d{2})(\d{2})$/.exec(table.id))
    .filter(Boolean)
    .map(([, year, month, day]) => Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return days.length > 0 ? Math.min(...days) + 24 * 60 * 60 * 1000 : null;
}

/**
 * Whether the GA4 export dataset exists yet. GA4 creates it with the first daily export, so a
 * property whose BigQuery link is younger than a day has none.
 *
 * @param {{projectId: string, datasetId: string}} input
 * @returns {Promise<boolean>}
 */
export async function exportDatasetExists({ projectId, datasetId }) {
  const client = await getBigQueryClient(projectId);
  const [exists] = await client.dataset(datasetId).exists();
  return exists;
}

/**
 * Queries the daily GA4 BigQuery export for a `purchase` event carrying the given transaction
 * id, across the last `lookbackDays` days of daily tables. The dataset lives in the location
 * the GA4 link was created with, which the query has to name: BigQuery looks in the US
 * multi-region otherwise and reports the dataset as not found.
 *
 * @param {{transactionId: string, projectId: string, datasetId: string, location: string, lookbackDays?: number}} input
 * @returns {Promise<{found: boolean, tablesQueried: string[]}>}
 */
export async function findPurchaseEvent({ transactionId, projectId, datasetId, location, lookbackDays = 4 }) {
  const client = await getBigQueryClient(projectId);
  const suffixes = dailyTableSuffixes(lookbackDays);

  const [rows] = await client.query({
    location,
    query: `
      SELECT event_name
      FROM \`${projectId}.${datasetId}.events_*\`
      WHERE _TABLE_SUFFIX IN UNNEST(@suffixes)
        AND event_name = 'purchase'
        AND EXISTS (
          SELECT 1 FROM UNNEST(event_params) AS p
          WHERE p.key = 'transaction_id' AND p.value.string_value = @transactionId
        )
      LIMIT 1
    `,
    params: { suffixes, transactionId },
  });

  return { found: rows.length > 0, tablesQueried: suffixes.map((suffix) => `events_${suffix}`) };
}

/**
 * Polls findPurchaseEvent a bounded number of times, to absorb ordinary query latency for a
 * row that should already exist — not to wait out the daily export's own multi-hour lag.
 *
 * @param {Parameters<typeof findPurchaseEvent>[0]} args
 * @param {{attempts?: number, intervalMs?: number}} [options]
 * @returns {Promise<{found: boolean, tablesQueried: string[]}>}
 */
export async function pollForPurchaseEvent(args, { attempts = 3, intervalMs = 10_000 } = {}) {
  let last = { found: false, tablesQueried: [] };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    last = await findPurchaseEvent(args);
    if (last.found) return last;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return last;
}
