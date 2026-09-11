#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/gcp-enable-apis.js
//
// Makes sure the Google APIs the analytics scripts and the YouTube quota project need, listed
// in google/project.toml's [apis].services, are enabled on the GA4 project, using the same
// service account the scripts run as (it holds Owner there). Idempotent: an enabled service is
// left alone. Runs first in google-apply.yml so a fresh project never needs a hand click in the
// console.
//
// Usage:
//   node scripts/gcp-enable-apis.js [--apply] [--project diyaccounting-ga4]
//
// Credentials: GA4_SERVICE_ACCOUNT_JSON (local override) or GA4_SERVICE_ACCOUNT_ARN (Secrets
// Manager). The key never reaches a log line.

import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

import { resolveServiceAccountCredentialsJson, createGoogleAuthClient, getAccessToken } from "./lib/googleAuth.js";

export const DEFAULT_PROJECT = "diyaccounting-ga4";
export const CONFIG_PATH = "google/project.toml";

/**
 * Parse google/project.toml's [apis].services list.
 *
 * @param {string} tomlString
 * @returns {string[]}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const services = parsed.apis?.services;
  if (!Array.isArray(services) || services.length === 0) {
    throw new Error("project.toml is missing [apis].services");
  }
  return services.map(String);
}

export function loadConfigFromRoot() {
  const filePath = path.join(process.cwd(), CONFIG_PATH);
  return parseConfig(fs.readFileSync(filePath, "utf-8"));
}

export function parseArgs(argv) {
  const opts = { apply: false, project: DEFAULT_PROJECT };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--project") opts.project = argv[++i];
    else if (arg === "--help") {
      console.log("Usage: node scripts/gcp-enable-apis.js [--apply] [--project <id>]");
      process.exit(0);
    } else throw new Error(`Unknown argument "${arg}"`);
  }
  if (!opts.project) throw new Error("--project needs a value");
  return opts;
}

// Decides what to do from the states Service Usage reports. Pure, so it is unit-tested.
export function planEnables(states, required) {
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
  const requiredServices = loadConfigFromRoot();
  const credentialsJson = await resolveServiceAccountCredentialsJson({ jsonEnvVar: "GA4_SERVICE_ACCOUNT_JSON", arnEnvVar: "GA4_SERVICE_ACCOUNT_ARN" });
  const token = await getAccessToken(createGoogleAuthClient(credentialsJson));
  const base = `https://serviceusage.googleapis.com/v1/projects/${opts.project}/services`;

  const states = {};
  for (const service of requiredServices) {
    const data = await googleGet(`${base}/${service}`, token);
    states[service] = data.state;
  }
  const plan = planEnables(states, requiredServices);
  for (const { service, state, enable } of plan) {
    console.log(`${service}: ${state}${enable ? (opts.apply ? " (enabling)" : " (would enable)") : ""}`);
  }
  if (!opts.apply) return plan;
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
