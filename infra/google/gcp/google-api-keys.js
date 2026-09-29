#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/google/gcp/google-api-keys.js
//
// Creates and restricts the Google API keys declared in infra/google/gcp/api-keys.toml through the
// API Keys API. Idempotent: a key whose display name, HTTP referrers and API targets already
// match is left alone; a key that differs is updated; a missing key is created. Without --apply
// it reads live state and prints the plan.
//
// The key string never reaches a log or a file. On --apply it is read from the API Keys API and
// handed to `gh variable set` on standard input, into the repository variable the key's
// `github_variable` names. When the workflow token may not manage variables the script records a
// finding that names the variable and the command an operator runs, and still exits 0.
//
// Usage:
//   node infra/google/gcp/google-api-keys.js [--apply]
//
// Credentials: application default credentials from google-github-actions/auth's federated
// exchange.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import TOML from "@iarna/toml";

import { assertFederatedCredentials, createGoogleAuthClient, getAccessToken } from "../lib/googleAuth.js";
import { isVariableAccessForbidden } from "../ga4/ga4-sync.js";

export const CONFIG_PATH = "infra/google/gcp/api-keys.toml";
const API_KEYS_V2 = "https://apikeys.googleapis.com/v2";
const OPERATION_POLL_MS = 2000;
const OPERATION_POLL_LIMIT = 30;

export function parseArgs(argv) {
  const opts = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") opts.apply = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

/**
 * Parse and validate infra/google/gcp/api-keys.toml. A key must name a display name, a GitHub
 * variable, at least one API target and at least one referrer: an unrestricted key is refused.
 *
 * @param {string} tomlString
 * @returns {{projectId: string, projectNumber: string, keys: {id: string, displayName: string, githubVariable: string, apiServices: string[], allowedReferrers: string[]}[]}}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const projectId = parsed.project?.id;
  const projectNumber = parsed.project?.number;
  if (!projectId || !projectNumber) {
    throw new Error("api-keys.toml is missing [project].id or [project].number");
  }
  const keys = (parsed.key ?? []).map((entry) => {
    const {
      id,
      display_name: displayName,
      github_variable: githubVariable,
      api_services: apiServices,
      allowed_referrers: allowedReferrers,
    } = entry;
    if (!id || !displayName || !githubVariable) {
      throw new Error(`[[key]] entry needs id, display_name and github_variable: ${JSON.stringify(entry)}`);
    }
    if (!Array.isArray(apiServices) || apiServices.length === 0) {
      throw new Error(`Key "${id}" declares no api_services; an unrestricted key is refused`);
    }
    if (!Array.isArray(allowedReferrers) || allowedReferrers.length === 0) {
      throw new Error(`Key "${id}" declares no allowed_referrers; an unrestricted key is refused`);
    }
    return { id, displayName, githubVariable, apiServices: [...apiServices], allowedReferrers: [...allowedReferrers] };
  });
  if (keys.length === 0) {
    throw new Error("api-keys.toml has no [[key]] entries");
  }
  return { projectId, projectNumber: String(projectNumber), keys };
}

export function loadConfigFromRoot() {
  return parseConfig(fs.readFileSync(path.join(process.cwd(), CONFIG_PATH), "utf-8"));
}

/** The API Keys API `restrictions` object for a declared key. */
export function restrictionsFor(key) {
  return {
    browserKeyRestrictions: { allowedReferrers: [...key.allowedReferrers] },
    apiTargets: key.apiServices.map((service) => ({ service })),
  };
}

function sorted(values) {
  return [...values].sort();
}

/**
 * Whether a live key's display name and restrictions equal the declared ones. An API target
 * that narrows to methods, or any restriction type besides browser referrers, counts as a
 * difference.
 *
 * @param {object} key - declared key
 * @param {object} liveKey - key as the API Keys API returns it
 */
export function restrictionsMatch(key, liveKey) {
  const restrictions = liveKey.restrictions ?? {};
  const liveReferrers = restrictions.browserKeyRestrictions?.allowedReferrers ?? [];
  const liveTargets = restrictions.apiTargets ?? [];
  const hasOtherRestrictionType = ["serverKeyRestrictions", "androidKeyRestrictions", "iosKeyRestrictions"].some(
    (field) => restrictions[field],
  );
  const targetsHaveMethods = liveTargets.some((target) => (target.methods ?? []).length > 0);
  return (
    liveKey.displayName === key.displayName &&
    !hasOtherRestrictionType &&
    !targetsHaveMethods &&
    JSON.stringify(sorted(liveReferrers)) === JSON.stringify(sorted(key.allowedReferrers)) &&
    JSON.stringify(sorted(liveTargets.map((target) => target.service))) === JSON.stringify(sorted(key.apiServices))
  );
}

/**
 * Decide what one declared key needs from the live keys list.
 *
 * @param {object} key - declared key
 * @param {{name: string, displayName?: string, restrictions?: object}[]} liveKeys
 * @returns {{action: "create"|"update"|"noop", key: object, liveName: string|null}}
 */
export function planKey(key, liveKeys) {
  const live = liveKeys.find((candidate) => candidate.name.split("/").pop() === key.id);
  if (!live) return { action: "create", key, liveName: null };
  return { action: restrictionsMatch(key, live) ? "noop" : "update", key, liveName: live.name };
}

/** The finding recorded when the workflow token cannot set the repository variable. */
export function variableFinding(key, projectNumber) {
  return (
    `GitHub variable ${key.githubVariable} needs the key string of ${key.id}; the workflow token cannot manage ` +
    `variables. As an operator run: gh variable set ${key.githubVariable} --body "$(gcloud services api-keys get-key-string ` +
    `projects/${projectNumber}/locations/global/keys/${key.id} --format='value(keyString)')"`
  );
}

async function googleRequest(url, token, method = "GET", body = undefined) {
  const res = await fetch(url, {
    method,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} from ${method} ${url}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function waitForOperation(operation, token) {
  let current = operation;
  let attempts = 0;
  while (!current.done) {
    if (attempts++ >= OPERATION_POLL_LIMIT) throw new Error(`API Keys operation ${operation.name} did not finish`);
    await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_MS));
    current = await googleRequest(`${API_KEYS_V2}/${operation.name}`, token);
  }
  if (current.error) throw new Error(`API Keys operation ${operation.name} failed: ${JSON.stringify(current.error).slice(0, 300)}`);
  return current;
}

async function listKeys(projectNumber, token) {
  const data = await googleRequest(`${API_KEYS_V2}/projects/${projectNumber}/locations/global/keys`, token);
  return data.keys ?? [];
}

async function applyPlan(plan, projectNumber, token) {
  const { key } = plan;
  const body = { displayName: key.displayName, restrictions: restrictionsFor(key) };
  if (plan.action === "create") {
    const parent = `${API_KEYS_V2}/projects/${projectNumber}/locations/global/keys`;
    await waitForOperation(await googleRequest(`${parent}?keyId=${encodeURIComponent(key.id)}`, token, "POST", body), token);
    return;
  }
  await waitForOperation(
    await googleRequest(`${API_KEYS_V2}/${plan.liveName}?updateMask=displayName,restrictions`, token, "PATCH", body),
    token,
  );
}

async function readKeyString(keyName, token) {
  const data = await googleRequest(`${API_KEYS_V2}/${keyName}/keyString`, token);
  return data.keyString;
}

function setGithubVariable(name, value) {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- deliberately runs the gh CLI from PATH
  execFileSync("gh", ["variable", "set", name], { input: value, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

/**
 * Set the repository variable from a key string held only in memory. Answers the finding when
 * the token may not manage variables; any other failure is thrown.
 *
 * @param {object} key
 * @param {string} projectNumber
 * @param {string} keyString
 * @param {(name: string, value: string) => void} [set] - injectable for tests
 * @returns {string|null}
 */
export function applyGithubVariable(key, projectNumber, keyString, set = setGithubVariable) {
  try {
    set(key.githubVariable, keyString);
    console.log(`Set ${key.githubVariable} from ${key.id}`);
    return null;
  } catch (error) {
    if (isVariableAccessForbidden(error)) return variableFinding(key, projectNumber);
    throw error;
  }
}

function describeKeyAction(action, apply) {
  if (action === "noop") return "";
  return apply ? " (applying)" : " (would apply)";
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const config = loadConfigFromRoot();
  assertFederatedCredentials();
  const token = await getAccessToken(createGoogleAuthClient());
  const liveKeys = await listKeys(config.projectNumber, token);
  const findings = [];
  const plans = config.keys.map((key) => planKey(key, liveKeys));
  for (const plan of plans) {
    console.log(`${config.projectId} key ${plan.key.id}: ${plan.action}${describeKeyAction(plan.action, opts.apply)}`);
    if (!opts.apply) continue;
    if (plan.action !== "noop") await applyPlan(plan, config.projectNumber, token);
    const keyName = plan.liveName ?? `projects/${config.projectNumber}/locations/global/keys/${plan.key.id}`;
    const finding = applyGithubVariable(plan.key, config.projectNumber, await readKeyString(keyName, token));
    if (finding) findings.push(finding);
  }
  if (findings.length > 0) {
    console.log(`Findings (${findings.length}):`);
    for (const finding of findings) console.log(`  ${finding}`);
  }
  return plans;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`google-api-keys failed: ${err.message}`);
    process.exit(1);
  });
}
