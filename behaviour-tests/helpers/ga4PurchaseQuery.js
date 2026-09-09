// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/helpers/ga4PurchaseQuery.js
//
// Confirms a real GA4 `purchase` event reached BigQuery, for the ci purchase assertion in
// payment.behaviour.test.js.
//
// The ci property's BigQuery link only has the daily export enabled (see
// scripts/ga4-property-sync.js — no streaming export), and that daily table for a given day
// can take up to about 27 hours to appear (the same margin app/functions/analytics/
// ga4EventExportPull.js's D-2 targeting is built around). A same-run purchase event's row
// therefore cannot exist yet when the test that fired it is still running. So this check looks
// up a PAST run's transaction id (a Stripe test-mode subscription id, old enough that its daily
// export should already have landed) and confirms BigQuery has ingested a purchase event
// carrying it, rather than polling for the current run's own event.
//
// Reads the GA4 service-account credential the same way ga4EventExportPull.js does
// (GA4_SERVICE_ACCOUNT_JSON, else GA4_SERVICE_ACCOUNT_ARN via Secrets Manager) — no new
// credential for this check.

import { BigQuery } from "@google-cloud/bigquery";
import { resolveServiceAccountCredentialsJson } from "../../scripts/lib/googleAuth.js";
import { getStripeClient } from "@app/lib/stripeClient.js";

let cachedClient = null;
let cachedCredentialsJson = null;

async function getBigQueryClient(projectId) {
  const credentialsJson = await resolveServiceAccountCredentialsJson({
    jsonEnvVar: "GA4_SERVICE_ACCOUNT_JSON",
    arnEnvVar: "GA4_SERVICE_ACCOUNT_ARN",
  });
  if (cachedClient && cachedCredentialsJson === credentialsJson) {
    return cachedClient;
  }
  cachedClient = new BigQuery({ projectId, credentials: JSON.parse(credentialsJson) });
  cachedCredentialsJson = credentialsJson;
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

/**
 * Finds a Stripe test-mode subscription id created between `olderThanMs` and `newestMs` ago —
 * old enough for its GA4 purchase event's daily BigQuery export to have landed under normal
 * operation, but not so old it falls outside the lookback window this module then queries.
 * Every ci run of payment.behaviour.test.js creates and later cancels one such subscription,
 * so this stands in for a persisted "last run's transaction id" without adding new storage.
 *
 * @param {{olderThanMs: number, newestMs: number}} window
 * @returns {Promise<string|null>}
 */
export async function findPastStripeSubscriptionId({ olderThanMs, newestMs }) {
  const stripe = await getStripeClient({ test: true });
  const now = Date.now();
  const subscriptions = await stripe.subscriptions.list({
    status: "all",
    created: {
      gte: Math.floor((now - newestMs) / 1000),
      lte: Math.floor((now - olderThanMs) / 1000),
    },
    limit: 1,
  });
  return subscriptions.data[0]?.id ?? null;
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
