#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/google/ads/ads-conversions-upload.js
//
// Uploads paid-subscription conversions to Google Ads through the Data Manager API. It reads the
// live, paid, unrefunded Stripe charges for subscription bundles from the analytics lake, keeps
// the ones whose account landed from a Google Ads click (a stored gclid), and sends each with its
// gclid, the Stripe invoice id as transactionId (Google dedupes on it, including against the GA4
// import), its value, adUserData CONSENT_GRANTED and adPersonalization CONSENT_DENIED. A gclid is
// only ever stored after the visitor accepted, so every event is sent as consented.
//
// The conversion action is the [upload] conversion_action_name in infra/google/ads/ads.toml,
// an "Import from clicks" action created in the Ads UI; the script resolves its id by name and
// fails when the account has no such action. The stored Ads refresh token must have been consented
// with the [upload] scope (Data Manager) as well as the Ads scope.
//
// Usage:
//   node infra/google/ads/ads-conversions-upload.js [--env prod|ci] [--since YYYY-MM-DD]
//       [--events-file <path>] [--validate-only | --apply] [--client-file <path>]
//
// Without --validate-only or --apply it prints the events it would send and calls no Google API.
// --validate-only sends the request with validateOnly set: Google checks it and stores nothing.
// --apply uploads. --events-file reads lake rows from a JSON file (an array of objects with the
// lake query's columns) instead of querying Athena. Without --since the window is the three days
// ending today; the transactionId makes a repeated upload a no-op.

import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";
import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } from "@aws-sdk/client-athena";

import { CONFIG_PATH, loadConfigFromRoot, getAdsAccessToken, googleAdsSearch } from "./ads-inventory.js";

export const DATA_MANAGER_INGEST_URL = "https://datamanager.googleapis.com/v1/events:ingest";
export const MAX_EVENTS_PER_REQUEST = 2000;
export const SUBSCRIPTION_BUNDLE_IDS = ["resident-vat", "resident", "resident-pro"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ENVIRONMENTS = ["ci", "prod"];
const ATHENA_POLL_MS = 1500;

export function parseUploadConfig(tomlString) {
  const upload = TOML.parse(tomlString).upload;
  const conversionActionName = upload?.conversion_action_name;
  const scope = upload?.scope;
  if (!conversionActionName || !scope) {
    throw new Error("ads.toml is missing [upload].conversion_action_name or [upload].scope");
  }
  return { conversionActionName, scope };
}

export function loadUploadConfigFromRoot() {
  return parseUploadConfig(fs.readFileSync(path.join(process.cwd(), CONFIG_PATH), "utf-8"));
}

export function parseArgs(argv) {
  const opts = { env: "prod", since: undefined, eventsFile: undefined, validateOnly: false, apply: false, clientFile: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--env") {
      const value = argv[++i];
      if (!ENVIRONMENTS.includes(value)) throw new Error(`--env must be one of ${ENVIRONMENTS.join(", ")}`);
      opts.env = value;
    } else if (arg === "--since") {
      const value = argv[++i];
      if (!value) throw new Error("--since requires a YYYY-MM-DD date argument");
      opts.since = value;
    } else if (arg === "--events-file") {
      const value = argv[++i];
      if (!value) throw new Error("--events-file requires a path argument");
      opts.eventsFile = value;
    } else if (arg === "--client-file") {
      const value = argv[++i];
      if (!value) throw new Error("--client-file requires a path argument");
      opts.clientFile = value;
    } else if (arg === "--validate-only") {
      opts.validateOnly = true;
    } else if (arg === "--apply") {
      opts.apply = true;
    } else if (arg === "--help") {
      console.log(
        "Usage: node infra/google/ads/ads-conversions-upload.js [--env prod|ci] [--since YYYY-MM-DD] [--events-file <path>] [--validate-only | --apply] [--client-file <path>]",
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (opts.validateOnly && opts.apply) throw new Error("--validate-only and --apply cannot be combined");
  if (opts.since && !DATE_PATTERN.test(opts.since)) throw new Error(`--since must be a YYYY-MM-DD date, got "${opts.since}"`);
  return opts;
}

/**
 * The window start when --since is absent: three days before `now`, in UTC.
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function defaultSince(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3));
  return start.toISOString().slice(0, 10);
}

/**
 * The Athena query for paid, unrefunded subscription charges since `since` whose account landed
 * from a Google Ads click. The charge reaches its account's acquisition record through the
 * Stripe customer, the subscription and the hashed subject, the join v_paid_subscribers_by_channel
 * uses; the earliest sourced record wins.
 *
 * @param {string} since YYYY-MM-DD
 * @returns {string}
 */
export function buildLakeQuery(since) {
  if (!DATE_PATTERN.test(since)) throw new Error(`since must be a YYYY-MM-DD date, got "${since}"`);
  const bundles = SUBSCRIPTION_BUNDLE_IDS.map((id) => `'${id}'`).join(", ");
  return `WITH acquisition AS (
  SELECT hashed_sub, min_by(acq_gclid, change_ts) AS gclid
  FROM   dynamo_bundles
  WHERE  acq_gclid IS NOT NULL
  GROUP  BY hashed_sub),
subscription_owner AS (
  SELECT subscription_id, arbitrary(hashed_sub) AS hashed_sub
  FROM   dynamo_subscriptions
  WHERE  hashed_sub IS NOT NULL
  GROUP  BY subscription_id),
customer_account AS (
  SELECT s.customer, s.bundle_id, arbitrary(o.hashed_sub) AS hashed_sub
  FROM   stripe_subscriptions s
  JOIN   subscription_owner o ON o.subscription_id = s.id
  GROUP  BY s.customer, s.bundle_id)
SELECT c.invoice AS invoice_id,
       a.gclid AS gclid,
       c.amount - c.amount_refunded AS net_minor,
       upper(c.currency) AS currency,
       c.created AS created
FROM   stripe_charges c
JOIN   customer_account ca ON ca.customer = c.customer AND ca.bundle_id = c.bundle_id
JOIN   acquisition a ON a.hashed_sub = ca.hashed_sub
WHERE  c.livemode = true
  AND  c.paid = true
  AND  c.refunded = false
  AND  c.invoice IS NOT NULL
  AND  c.bundle_id IN (${bundles})
  AND  from_unixtime(c.created) >= date '${since}'
ORDER  BY c.created`;
}

/**
 * Athena GetQueryResults pages into plain row objects keyed by column name. The first row of the
 * first page is the header.
 *
 * @param {Array<{ResultSet: {Rows: Array<{Data: Array<{VarCharValue?: string}>}>}}>} pages
 * @returns {Array<Record<string, string|undefined>>}
 */
export function shapeAthenaRows(pages) {
  const rows = pages.flatMap((page) => page.ResultSet?.Rows ?? []);
  if (rows.length === 0) return [];
  const header = rows[0].Data.map((cell) => cell.VarCharValue);
  return rows.slice(1).map((row) => Object.fromEntries(header.map((name, i) => [name, row.Data[i]?.VarCharValue])));
}

/**
 * One Data Manager event per lake row. The invoice id is the transactionId, the value is the net
 * charge in major units, and the consent is what a stored gclid implies: the visitor accepted
 * advertising measurement and declined personalisation.
 *
 * @param {Array<{invoice_id: string, gclid: string, net_minor: string|number, currency: string, created: string|number}>} rows
 * @returns {Array<object>}
 */
export function shapeConversionEvents(rows) {
  return rows.map((row) => {
    const netMinor = Number(row.net_minor);
    if (!row.invoice_id || !row.gclid || !Number.isFinite(netMinor) || !row.currency || !row.created) {
      throw new Error(`Lake row is missing invoice_id, gclid, net_minor, currency or created: ${JSON.stringify(row)}`);
    }
    return {
      eventTimestamp: new Date(Number(row.created) * 1000).toISOString(),
      transactionId: row.invoice_id,
      conversionValue: netMinor / 100,
      currency: row.currency,
      eventSource: "WEB",
      adIdentifiers: { gclid: row.gclid },
      consent: { adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_DENIED" },
    };
  });
}

export function buildIngestRequests({ customerId, conversionActionId, events, validateOnly }) {
  const requests = [];
  for (let start = 0; start < events.length; start += MAX_EVENTS_PER_REQUEST) {
    requests.push({
      destinations: [
        {
          operatingAccount: { accountType: "GOOGLE_ADS", accountId: customerId },
          productDestinationId: conversionActionId,
        },
      ],
      events: events.slice(start, start + MAX_EVENTS_PER_REQUEST),
      validateOnly,
    });
  }
  return requests;
}

export function buildConversionActionQuery(name) {
  if (name.includes("'")) throw new Error(`Conversion action name must not contain a quote: ${name}`);
  return `SELECT conversion_action.id, conversion_action.name, conversion_action.type FROM conversion_action WHERE conversion_action.name = '${name}'`;
}

export function shapeConversionActionId(searchBody, name) {
  const match = (searchBody.results ?? []).find((row) => row.conversionAction?.name === name);
  if (!match) {
    throw new Error(
      `The Ads account has no conversion action named "${name}". Create an Import from clicks action with that name in the Ads UI.`,
    );
  }
  return String(match.conversionAction.id);
}

export function printEvents(events) {
  console.log(`=== Google Ads conversion upload: ${events.length} event(s) ===`);
  for (const event of events) {
    console.log(
      `  ${event.eventTimestamp}  ${event.transactionId}  ${event.currency} ${event.conversionValue.toFixed(2)}  gclid=${event.adIdentifiers.gclid}`,
    );
  }
}

// --- Network edges. Covered by the dry run and the first validate-only call, not unit tests. ---

async function queryLake({ env, since, athena = new AthenaClient({ region: process.env.AWS_REGION || "eu-west-2" }) }) {
  const { QueryExecutionId } = await athena.send(
    new StartQueryExecutionCommand({
      QueryString: buildLakeQuery(since),
      QueryExecutionContext: { Database: `${env}_env_analytics` },
      WorkGroup: `${env}-env-analytics`,
    }),
  );
  for (;;) {
    const { QueryExecution } = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId }));
    const state = QueryExecution.Status.State;
    if (state === "SUCCEEDED") break;
    if (state === "FAILED" || state === "CANCELLED") {
      throw new Error(`Athena query ${QueryExecutionId} ${state}: ${QueryExecution.Status.StateChangeReason ?? ""}`);
    }
    await new Promise((resolve) => setTimeout(resolve, ATHENA_POLL_MS));
  }
  const pages = [];
  let nextToken;
  do {
    const page = await athena.send(new GetQueryResultsCommand({ QueryExecutionId, NextToken: nextToken }));
    pages.push(page);
    nextToken = page.NextToken;
  } while (nextToken);
  return shapeAthenaRows(pages);
}

async function postIngest(token, request) {
  const res = await fetch(DATA_MANAGER_INGEST_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`${res.status} from events:ingest: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const since = opts.since ?? defaultSince();

  const rows = opts.eventsFile ? JSON.parse(fs.readFileSync(opts.eventsFile, "utf-8")) : await queryLake({ env: opts.env, since });
  const events = shapeConversionEvents(rows);
  printEvents(events);

  if (!opts.apply && !opts.validateOnly) {
    console.log("Dry run: no Google API called. Pass --validate-only or --apply to send.");
    return { events, requests: [] };
  }
  if (events.length === 0) return { events, requests: [] };

  const config = loadConfigFromRoot();
  const upload = loadUploadConfigFromRoot();
  const token = await getAdsAccessToken(config, { clientFile: opts.clientFile });
  const actionBody = await googleAdsSearch(
    token,
    config.customerId,
    config.apiVersion,
    buildConversionActionQuery(upload.conversionActionName),
  );
  const conversionActionId = shapeConversionActionId(actionBody, upload.conversionActionName);

  const requests = buildIngestRequests({ customerId: config.customerId, conversionActionId, events, validateOnly: opts.validateOnly });
  for (const request of requests) {
    const response = await postIngest(token, request);
    console.log(`${opts.validateOnly ? "Validated" : "Uploaded"} ${request.events.length} event(s): ${JSON.stringify(response)}`);
  }
  return { events, requests };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("ads-conversions-upload failed:", err.message);
    process.exit(1);
  });
}
