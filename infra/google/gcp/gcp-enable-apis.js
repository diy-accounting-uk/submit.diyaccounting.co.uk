#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/google/gcp/gcp-enable-apis.js
//
// Makes sure the Google APIs the analytics scripts and the YouTube quota project need, listed
// in infra/google/gcp/project.toml, are enabled on each project it names: [apis].services on the
// GA4 project and each [[apis.other_projects]] entry on its own project, using the same service
// account the scripts run as. Idempotent: an enabled service is left alone. Runs first in google-apply.yml so a fresh project never needs a hand click in the
// console.
//
// Usage:
//   node infra/google/gcp/gcp-enable-apis.js [--apply] [--project <id>]
//
// Without --project every project in project.toml is handled; with it, only that one.
//
// Credentials: application default credentials from google-github-actions/auth's federated
// exchange.

import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

import { assertFederatedCredentials, createGoogleAuthClient, getAccessToken } from "../lib/googleAuth.js";

export const DEFAULT_PROJECT = "diyaccounting-ga4";
export const CONFIG_PATH = "infra/google/gcp/project.toml";

/**
 * Parse infra/google/gcp/project.toml's [apis].services list.
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

/**
 * Every project project.toml enables APIs on: the GA4 project from [apis].services, then each
 * [[apis.other_projects]] entry.
 *
 * @param {string} tomlString
 * @returns {{projectId: string, services: string[]}[]}
 */
export function parseTargets(tomlString) {
  const parsed = TOML.parse(tomlString);
  const others = (parsed.apis?.other_projects ?? []).map((entry) => {
    if (!entry.project_id || !Array.isArray(entry.services) || entry.services.length === 0) {
      throw new Error(`Invalid [[apis.other_projects]] entry: ${JSON.stringify(entry)}`);
    }
    return { projectId: entry.project_id, services: entry.services.map(String) };
  });
  return [{ projectId: DEFAULT_PROJECT, services: parseConfig(tomlString) }, ...others];
}

export function loadTargetsFromRoot() {
  const filePath = path.join(process.cwd(), CONFIG_PATH);
  return parseTargets(fs.readFileSync(filePath, "utf-8"));
}

/**
 * The targets a run covers: all of them, or only the one --project names.
 *
 * @param {{projectId: string, services: string[]}[]} targets
 * @param {string|null} project
 */
export function selectTargets(targets, project) {
  if (!project) return targets;
  const selected = targets.filter((target) => target.projectId === project);
  if (selected.length === 0) {
    throw new Error(`project.toml declares no APIs for project "${project}"`);
  }
  return selected;
}

export function parseArgs(argv) {
  const opts = { apply: false, project: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--project") opts.project = argv[++i];
    else if (arg === "--help") {
      console.log("Usage: node infra/google/gcp/gcp-enable-apis.js [--apply] [--project <id>]");
      process.exit(0);
    } else throw new Error(`Unknown argument "${arg}"`);
  }
  if (opts.project === undefined) throw new Error("--project needs a value");
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
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`${res.status} from ${url}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** The suffix printed after a service's current state: what a plan entry would do, if anything. */
function describeEnableAction(enable, apply) {
  if (!enable) return "";
  return apply ? " (enabling)" : " (would enable)";
}

async function enableForProject({ projectId, services }, apply, token) {
  const base = `https://serviceusage.googleapis.com/v1/projects/${projectId}/services`;
  const states = {};
  for (const service of services) {
    const data = await googleGet(`${base}/${service}`, token);
    states[service] = data.state;
  }
  const plan = planEnables(states, services);
  for (const { service, state, enable } of plan) {
    console.log(`${projectId} ${service}: ${state}${describeEnableAction(enable, apply)}`);
  }
  if (!apply) return plan;
  for (const { service, enable } of plan) {
    if (!enable) continue;
    const op = await googlePost(`${base}/${service}:enable`, token);
    console.log(`${projectId} ${service}: ${op.done === false ? "enable operation started" : "enabled"}`);
  }
  return plan;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const targets = selectTargets(loadTargetsFromRoot(), opts.project);
  assertFederatedCredentials();
  const token = await getAccessToken(createGoogleAuthClient());
  const plans = [];
  for (const target of targets) {
    plans.push(...(await enableForProject(target, opts.apply, token)));
  }
  return plans;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`gcp-enable-apis failed: ${err.message}`);
    process.exit(1);
  });
}
