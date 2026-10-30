#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/microsoft/ads/msads-conversions-upload.js
//
// Uploads paid-subscription conversions to Microsoft Advertising by msclkid, with the Campaign
// Management ApplyOfflineConversions operation. It reads the live, paid, unrefunded Stripe charges
// for subscription bundles from the analytics lake, keeps the ones whose account landed from a
// Microsoft Advertising click (a stored msclkid) and sends each with its msclkid, the charge time,
// its net value and its currency. A msclkid is stored only after the visitor accepted the banner.
//
// The conversion goal is the [upload] conversion_goal_name in infra/microsoft/ads/ads.toml, an
// offline conversion goal that `msads.js --apply` creates. Microsoft ignores offline conversions
// sent in the first two hours after the goal exists, and ignores a repeat of the same msclkid and
// conversion time, so a repeated upload is a no-op.
//
// Usage:
//   node infra/microsoft/ads/msads-conversions-upload.js [--env prod|ci] [--since YYYY-MM-DD]
//       [--events-file <path>] [--apply] [--client-file <path>]
//
// Without --apply it prints the conversions it would send and calls no Microsoft API. --events-file
// reads lake rows from a JSON file (an array of objects with the lake query's columns) instead of
// querying Athena. Without --since the window is the three days ending today.

import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

import { shapeAthenaRows, SUBSCRIPTION_BUNDLE_IDS, defaultSince, queryLake } from "../../google/ads/ads-conversions-upload.js";
import { ADS_CONFIG_PATH } from "./msads-sync.js";
import { loadConfigFromRoot, openSession } from "./msads.js";
import { discoverCustomer, callApi } from "../../../app/lib/microsoftAdsReporting.js";

export { shapeAthenaRows, defaultSince };
export const MAX_CONVERSIONS_PER_REQUEST = 1000;
export const APPLY_PATH = "/OfflineConversions/Apply";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ENVIRONMENTS = ["ci", "prod"];

export function parseUploadConfig(tomlString) {
  const goalName = TOML.parse(tomlString).upload?.conversion_goal_name;
  if (!goalName) throw new Error("ads.toml is missing [upload].conversion_goal_name");
  return { goalName };
}

export function loadUploadConfigFromRoot() {
  return parseUploadConfig(fs.readFileSync(path.join(process.cwd(), ADS_CONFIG_PATH), "utf-8"));
}

export function parseArgs(argv) {
  const opts = { env: "prod", since: undefined, eventsFile: undefined, apply: false, clientFile: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--env") {
      const value = argv[++i];
      if (!ENVIRONMENTS.includes(value)) throw new Error(`--env must be one of ${ENVIRONMENTS.join(", ")}`);
      opts.env = value;
    } else if (arg === "--since" || arg === "--events-file" || arg === "--client-file") {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} requires an argument`);
      opts[{ "--since": "since", "--events-file": "eventsFile", "--client-file": "clientFile" }[arg]] = value;
    } else if (arg === "--apply") {
      opts.apply = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (opts.since && !DATE_PATTERN.test(opts.since)) throw new Error(`--since must be a YYYY-MM-DD date, got "${opts.since}"`);
  return opts;
}

/**
 * The Athena query for paid, unrefunded subscription charges since `since` whose account landed
 * from a Microsoft Advertising click. It is the join of the Google upload's query, on acq_msclkid.
 */
export function buildLakeQuery(since) {
  if (!DATE_PATTERN.test(since)) throw new Error(`since must be a YYYY-MM-DD date, got "${since}"`);
  const bundles = SUBSCRIPTION_BUNDLE_IDS.map((id) => `'${id}'`).join(", ");
  return `WITH acquisition AS (
  SELECT hashed_sub, min_by(acq_msclkid, change_ts) AS msclkid
  FROM   dynamo_bundles
  WHERE  acq_msclkid IS NOT NULL
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
       a.msclkid AS msclkid,
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

/** One offline conversion per lake row: the charge time in UTC, the net value in major units. */
export function shapeOfflineConversions(rows, goalName) {
  return rows.map((row) => {
    const netMinor = Number(row.net_minor);
    if (!row.msclkid || !Number.isFinite(netMinor) || !row.currency || !row.created) {
      throw new Error(`Lake row is missing msclkid, net_minor, currency or created: ${JSON.stringify(row)}`);
    }
    return {
      ConversionName: goalName,
      ConversionTime: new Date(Number(row.created) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      ConversionValue: netMinor / 100,
      ConversionCurrencyCode: row.currency,
      MicrosoftClickId: row.msclkid,
    };
  });
}

export function buildApplyRequests(conversions) {
  const requests = [];
  for (let start = 0; start < conversions.length; start += MAX_CONVERSIONS_PER_REQUEST) {
    requests.push({ OfflineConversions: conversions.slice(start, start + MAX_CONVERSIONS_PER_REQUEST) });
  }
  return requests;
}

export function printConversions(conversions) {
  console.log(`=== Microsoft Advertising conversion upload: ${conversions.length} conversion(s) ===`);
  for (const c of conversions) {
    console.log(`  ${c.ConversionTime}  ${c.ConversionCurrencyCode} ${c.ConversionValue.toFixed(2)}  msclkid=${c.MicrosoftClickId}`);
  }
}

export async function assertGoalExists(session, goalName) {
  const body = await callApi(session, session.config.campaignManagementUrl, "/ConversionGoals/QueryByIds", {
    ConversionGoalIds: null,
    ConversionGoalTypes: "OfflineConversion",
    ReturnAdditionalFields: null,
  });
  if (!(body.ConversionGoals ?? []).some((g) => g.Name === goalName)) {
    throw new Error(`The account has no offline conversion goal named "${goalName}". Run msads.js --apply first.`);
  }
}

export async function sendConversions(session, requests) {
  for (const request of requests) {
    const response = await callApi(session, session.config.campaignManagementUrl, APPLY_PATH, request);
    const errors = response.PartialErrors ?? [];
    if (errors.length > 0) {
      throw new Error(
        `ApplyOfflineConversions: ${errors
          .map((e) => `${e.ErrorCode}: ${e.Message}`)
          .join(" | ")
          .slice(0, 600)}`,
      );
    }
    console.log(`Uploaded ${request.OfflineConversions.length} conversion(s)`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const since = opts.since ?? defaultSince();
  const { goalName } = loadUploadConfigFromRoot();

  const rows = opts.eventsFile
    ? JSON.parse(fs.readFileSync(opts.eventsFile, "utf-8"))
    : await queryLake({ env: opts.env, since, buildQuery: buildLakeQuery });
  const conversions = shapeOfflineConversions(rows, goalName);
  printConversions(conversions);

  if (!opts.apply) {
    console.log("Dry run: no Microsoft API called. Pass --apply to send.");
    return { conversions, requests: [] };
  }
  if (conversions.length === 0) return { conversions, requests: [] };

  const session = await openSession({ config: loadConfigFromRoot(), clientFile: opts.clientFile });
  await discoverCustomer(session);
  await assertGoalExists(session, goalName);
  const requests = buildApplyRequests(conversions);
  await sendConversions(session, requests);
  return { conversions, requests };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("msads-conversions-upload failed:", err.message);
    process.exit(1);
  });
}
