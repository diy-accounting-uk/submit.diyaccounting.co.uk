#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/gcp-enable-apis.js
//
// Makes sure the Google APIs the analytics scripts call are enabled on the GA4 project, using
// the same service account the scripts run as (it holds Owner there). Idempotent: an enabled
// service is left alone. Runs first in google-roles.yml so a fresh project never needs a hand
// click in the console.
//
// Usage:
//   node scripts/gcp-enable-apis.js [--dry-run] [--project diyaccounting-ga4]
//
// Credentials: GA4_SERVICE_ACCOUNT_JSON (local override) or GA4_SERVICE_ACCOUNT_ARN (Secrets
// Manager). The key never reaches a log line.

import { resolveServiceAccountCredentialsJson, createGoogleAuthClient, getAccessToken } from "./lib/googleAuth.js";

export const DEFAULT_PROJECT = "diyaccounting-ga4";

// Service Usage itself is enabled on every project by default and is what enables the rest.
export const REQUIRED_SERVICES = [
  "serviceusage.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "analyticsadmin.googleapis.com",
  "cloudbilling.googleapis.com",
  "billingbudgets.googleapis.com",
  "bigquery.googleapis.com",
];

export function parseArgs(argv) {
  const opts = { dryRun: false, project: DEFAULT_PROJECT };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--project") opts.project = argv[++i];
    else if (arg === "--help") {
      console.log("Usage: node scripts/gcp-enable-apis.js [--dry-run] [--project <id>]");
      process.exit(0);
    } else throw new Error(`Unknown argument "${arg}"`);
  }
  if (!opts.project) throw new Error("--project needs a value");
  return opts;
}

// Decides what to do from the states Service Usage reports. Pure, so it is unit-tested.
export function planEnables(states, required = REQUIRED_SERVICES) {
  return required.map((service) => ({ service, state: states[service] || "UNKNOWN", enable: states[service] !== "ENABLED" }));
}

async function googleGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${res.status} from ${url}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function googlePost(url, token) {
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
  if (!res.ok) throw new Error(`${res.status} from ${url}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const credentialsJson = await resolveServiceAccountCredentialsJson({ jsonEnvVar: "GA4_SERVICE_ACCOUNT_JSON", arnEnvVar: "GA4_SERVICE_ACCOUNT_ARN" });
  const token = await getAccessToken(createGoogleAuthClient(credentialsJson));
  const base = `https://serviceusage.googleapis.com/v1/projects/${opts.project}/services`;

  const states = {};
  for (const service of REQUIRED_SERVICES) {
    const data = await googleGet(`${base}/${service}`, token);
    states[service] = data.state;
  }
  const plan = planEnables(states);
  for (const { service, state, enable } of plan) {
    console.log(`${service}: ${state}${enable ? (opts.dryRun ? " (would enable)" : " (enabling)") : ""}`);
  }
  if (opts.dryRun) return plan;
  for (const { service, enable } of plan) {
    if (!enable) continue;
    const op = await googlePost(`${base}/${service}:enable`, token);
    console.log(`${service}: ${op.done === false ? "enable operation started" : "enabled"}`);
  }
  return plan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`gcp-enable-apis failed: ${err.message}`);
    process.exit(1);
  });
}
