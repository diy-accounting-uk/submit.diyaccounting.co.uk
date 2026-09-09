#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/ga4-key-events-sync.js
//
// Idempotent key-event setup for the shared "DIY Accounting" GA4 property (523400333, see
// google-analytics.toml). Reads the [key_events] table there — one GA4 event name per
// conversion the one-stop dashboard tracks (subscribe, submit, donate, download) — and marks
// each event name as a key event through the Analytics Admin API, unless it is marked already.
// Two of the four names can share one underlying GA4 event (e.g. "purchase" fires for both a
// submit bundle checkout and a spreadsheets donation); the plan marks that event once and
// reports which labels it covers, rather than proposing a duplicate.
//
// Usage:
//   GA4_SERVICE_ACCOUNT_JSON=... (or GA4_SERVICE_ACCOUNT_ARN with AWS credentials) node scripts/ga4-key-events-sync.js
//
// Options:
//   --apply    Write the missing key events. Without it, the script only reads the property's
//              current key events and prints what it would create.

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { parse as parseToml } from "@iarna/toml";

import { createGoogleAuthorizedClient, resolveServiceAccountCredentialsJson } from "./lib/googleAuth.js";

const ANALYTICS_ADMIN_V1ALPHA = "https://analyticsadmin.googleapis.com/v1alpha";
const ANALYTICS_EDIT_SCOPE = "https://www.googleapis.com/auth/analytics.edit";
const DEFAULT_COUNTING_METHOD = "ONCE_PER_EVENT";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GOOGLE_ANALYTICS_TOML_PATH = join(__dirname, "..", "google-analytics.toml");

export function parseArgs(argv) {
  const opts = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") {
      opts.apply = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

/**
 * Read the property id and the desired key events out of google-analytics.toml.
 *
 * @param {string} [tomlPath]
 * @returns {{propertyId: string, keyEvents: Record<string, string>}}
 */
export function readGa4Config(tomlPath = GOOGLE_ANALYTICS_TOML_PATH) {
  const parsed = parseToml(readFileSync(tomlPath, "utf-8"));
  const propertyId = parsed.account?.property_id;
  if (!propertyId) {
    throw new Error(`google-analytics.toml has no [account] property_id (read from ${tomlPath})`);
  }
  const keyEvents = parsed.key_events || {};
  if (Object.keys(keyEvents).length === 0) {
    throw new Error(`google-analytics.toml has no [key_events] entries (read from ${tomlPath})`);
  }
  return { propertyId, keyEvents };
}

/**
 * Group the desired {label: eventName} map by event name, since two labels can share one GA4
 * event (e.g. "purchase" fires for both subscribe and donate).
 *
 * @param {Record<string, string>} keyEvents
 * @returns {Map<string, string[]>} eventName -> the labels that map to it
 */
export function groupByEventName(keyEvents) {
  const byEventName = new Map();
  for (const [label, eventName] of Object.entries(keyEvents)) {
    const labels = byEventName.get(eventName) ?? [];
    labels.push(label);
    byEventName.set(eventName, labels);
  }
  return byEventName;
}

/**
 * Build the sync plan from the desired key events and the property's current ones. Pure and
 * network-free so it can be unit tested with fixtures.
 *
 * @param {object} input
 * @param {Record<string, string>} input.keyEvents - label -> GA4 event name, from google-analytics.toml
 * @param {Array<{name: string, eventName: string}>} [input.existingKeyEvents] - the property's current key events
 * @returns {Array<{eventName: string, labels: string[], action: "noop"|"create", existingName?: string}>}
 */
export function buildPlan({ keyEvents, existingKeyEvents = [] }) {
  const existingByEventName = new Map(existingKeyEvents.map((event) => [event.eventName, event]));
  const desired = groupByEventName(keyEvents);

  return Array.from(desired.entries()).map(([eventName, labels]) => {
    const existing = existingByEventName.get(eventName);
    return existing
      ? { eventName, labels, action: "noop", existingName: existing.name }
      : { eventName, labels, action: "create" };
  });
}

function printPlan(plan, propertyId, dryRun) {
  const tag = dryRun ? "[dry-run] " : "";
  console.log(`\n=== GA4 key-event sync: properties/${propertyId}${dryRun ? " (dry run)" : ""} ===`);
  for (const item of plan) {
    const labelList = item.labels.join(", ");
    if (item.action === "noop") {
      console.log(`  already a key event: "${item.eventName}" (${labelList}) — ${item.existingName}`);
    } else {
      const dupeNote = item.labels.length > 1 ? ` — covers ${labelList} in one event, not one each` : "";
      console.log(`  ${tag}would mark "${item.eventName}" (${labelList}) as a key event${dupeNote}`);
    }
  }
  console.log("");
}

async function listKeyEvents(client, propertyName) {
  const { data } = await client.request({ url: `${ANALYTICS_ADMIN_V1ALPHA}/${propertyName}/keyEvents` });
  return data.keyEvents || [];
}

async function createKeyEvent(client, propertyName, eventName) {
  const { data } = await client.request({
    url: `${ANALYTICS_ADMIN_V1ALPHA}/${propertyName}/keyEvents`,
    method: "POST",
    data: { eventName, countingMethod: DEFAULT_COUNTING_METHOD },
  });
  return data;
}

async function applyPlan(client, propertyName, plan) {
  for (const item of plan.filter((entry) => entry.action === "create")) {
    const created = await createKeyEvent(client, propertyName, item.eventName);
    console.log(`Created key event ${created.name} (${item.eventName})`);
  }
}

export async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { propertyId, keyEvents } = readGa4Config();
  const propertyName = `properties/${propertyId}`;

  const credentialsJson = await resolveServiceAccountCredentialsJson({
    jsonEnvVar: "GA4_SERVICE_ACCOUNT_JSON",
    arnEnvVar: "GA4_SERVICE_ACCOUNT_ARN",
  });
  const client = await createGoogleAuthorizedClient(credentialsJson, [ANALYTICS_EDIT_SCOPE]);

  console.log(`Reading current key events for ${propertyName}${opts.apply ? "" : " (dry run)"}...`);
  const existingKeyEvents = await listKeyEvents(client, propertyName);

  const plan = buildPlan({ keyEvents, existingKeyEvents });
  printPlan(plan, propertyId, !opts.apply);

  if (!opts.apply) {
    return plan;
  }

  await applyPlan(client, propertyName, plan);
  return plan;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("GA4 key-event sync failed:", err.message);
    process.exit(1);
  });
}
