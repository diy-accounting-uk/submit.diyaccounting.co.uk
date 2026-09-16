#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/gcp-key-rotate.js
//
// Rotates the analytics service account's key as code, until every caller is federated and
// the key can go. Each run creates a fresh key and writes it to one environment's Secrets
// Manager secret through scripts/put-secret-with-rotation-tag.sh (which stamps rotated-at only
// when the value changed), disables every key older than [service_account.key_rotation]
// max_age_days in google/identity.toml, and deletes the disabled ones on the run after that,
// so a key that something still used can be re-enabled for one cycle before it is gone.
//
// google-key-rotate.yml runs it monthly, once per environment, each with its own AWS account's
// credentials; a key is never printed, and the new key reaches nothing but the secret.
//
// Usage:
//   node scripts/gcp-key-rotate.js [--apply --secret-name <name>] [--max-age-days N]
//
// Credentials: GA4_SERVICE_ACCOUNT_JSON (local override) or GA4_SERVICE_ACCOUNT_ARN (Secrets
// Manager), the current key; or application default credentials when GOOGLE_AUTH_MODE=federated.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import TOML from "@iarna/toml";

import { resolveServiceAccountCredentialsJson, createGoogleAuthClient, getAccessToken } from "./lib/googleAuth.js";

export const CONFIG_PATH = "google/identity.toml";
export const PUT_SECRET_SCRIPT = "scripts/put-secret-with-rotation-tag.sh";
const IAM_BASE = "https://iam.googleapis.com/v1";
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parse google/identity.toml's service account and its key-rotation settings.
 *
 * @param {string} tomlString
 * @returns {{ email: string, maxAgeDays: number, secrets: string[] }}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const email = parsed.service_account?.email;
  if (!email) throw new Error("identity.toml is missing [service_account].email");
  const rotation = parsed.service_account.key_rotation;
  const maxAgeDays = Number(rotation?.max_age_days);
  if (!Number.isInteger(maxAgeDays) || maxAgeDays <= 0) {
    throw new Error("identity.toml is missing [service_account.key_rotation].max_age_days (a positive whole number of days)");
  }
  const secrets = Array.isArray(rotation.secrets) ? rotation.secrets.map(String) : [];
  if (secrets.length === 0) throw new Error("identity.toml is missing [service_account.key_rotation].secrets");
  return { email: String(email), maxAgeDays, secrets };
}

export function loadConfigFromRoot() {
  return parseConfig(fs.readFileSync(path.join(process.cwd(), CONFIG_PATH), "utf-8"));
}

export function parseArgs(argv) {
  const opts = { apply: false, secretName: null, maxAgeDays: null, now: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--secret-name") opts.secretName = argv[++i];
    else if (arg === "--max-age-days") opts.maxAgeDays = Number(argv[++i]);
    else if (arg === "--now") opts.now = new Date(argv[++i]);
    else if (arg === "--help") {
      console.log("Usage: node scripts/gcp-key-rotate.js [--apply --secret-name <name>] [--max-age-days N] [--now <iso>]");
      process.exit(0);
    } else throw new Error(`Unknown argument "${arg}"`);
  }
  if (opts.apply && !opts.secretName) throw new Error("--apply needs --secret-name, the Secrets Manager secret the new key is written to");
  if (opts.maxAgeDays !== null && (!Number.isInteger(opts.maxAgeDays) || opts.maxAgeDays <= 0)) {
    throw new Error("--max-age-days needs a positive whole number");
  }
  if (opts.now !== null && Number.isNaN(opts.now.getTime())) throw new Error("--now needs an ISO date");
  return opts;
}

/**
 * Decide what to create, disable and delete from the live user-managed keys. Pure, so it is
 * unit-tested. A key older than the limit is disabled; a disabled key older than the limit is
 * deleted, so deletion always follows a disable by at least one run.
 *
 * @param {Array<{ name: string, validAfterTime: string, disabled?: boolean }>} keys
 * @param {{ maxAgeDays: number, now: Date }} settings
 */
export function planRotation(keys, { maxAgeDays, now }) {
  const cutoff = now.getTime() - maxAgeDays * DAY_MS;
  const aged = keys.filter((key) => new Date(key.validAfterTime).getTime() < cutoff);
  return {
    create: true,
    disable: aged.filter((key) => !key.disabled).map((key) => key.name),
    delete: aged.filter((key) => key.disabled === true).map((key) => key.name),
    keep: keys.filter((key) => new Date(key.validAfterTime).getTime() >= cutoff).map((key) => key.name),
  };
}

/** The key id is the last path segment of its resource name. */
export function keyId(name) {
  return name.slice(name.lastIndexOf("/") + 1);
}

async function googleRequest(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} from ${method} ${url}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? {} : res.json();
}

async function listUserManagedKeys(token, email) {
  const data = await googleRequest("GET", `${IAM_BASE}/projects/-/serviceAccounts/${email}/keys?keyTypes=USER_MANAGED`, token);
  return (data.keys ?? []).map((key) => ({
    name: key.name,
    validAfterTime: key.validAfterTime,
    disabled: key.disabled === true,
  }));
}

/**
 * Write the key JSON to the secret through the tagging script, never through a log line.
 *
 * @param {string} secretName
 * @param {string} keyJson
 * @param {(file: string, args: string[]) => { status: number|null }} [run]
 */
export function writeSecret(secretName, keyJson, run = (file, args) => spawnSync(file, args, { stdio: "inherit" })) {
  const result = run("bash", [PUT_SECRET_SCRIPT, secretName, keyJson]);
  if (result.status !== 0) throw new Error(`${PUT_SECRET_SCRIPT} exited ${result.status} for ${secretName}`);
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const config = loadConfigFromRoot();
  const maxAgeDays = opts.maxAgeDays ?? config.maxAgeDays;
  const now = opts.now ?? new Date();
  if (opts.apply && !config.secrets.includes(opts.secretName)) {
    throw new Error(`--secret-name ${opts.secretName} is not one of ${CONFIG_PATH}'s key_rotation.secrets: ${config.secrets.join(", ")}`);
  }

  const credentialsJson = await resolveServiceAccountCredentialsJson({
    jsonEnvVar: "GA4_SERVICE_ACCOUNT_JSON",
    arnEnvVar: "GA4_SERVICE_ACCOUNT_ARN",
  });
  const token = await getAccessToken(createGoogleAuthClient(credentialsJson));

  const keys = await listUserManagedKeys(token, config.email);
  const plan = planRotation(keys, { maxAgeDays, now });
  console.log(`${config.email}: ${keys.length} user-managed key(s), limit ${maxAgeDays} days`);
  for (const key of keys) {
    const age = Math.floor((now.getTime() - new Date(key.validAfterTime).getTime()) / DAY_MS);
    console.log(`  ${keyId(key.name)}: ${age} day(s) old${key.disabled ? ", disabled" : ""}`);
  }
  const verb = opts.apply ? "" : "would ";
  console.log(`${verb}create a key${opts.apply ? ` and write it to ${opts.secretName}` : ""}`);
  for (const name of plan.disable) console.log(`${verb}disable ${keyId(name)}`);
  for (const name of plan.delete) console.log(`${verb}delete ${keyId(name)}`);
  if (!opts.apply) return plan;

  const created = await googleRequest("POST", `${IAM_BASE}/projects/-/serviceAccounts/${config.email}/keys`, token, {
    privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE",
    keyAlgorithm: "KEY_ALG_RSA_2048",
  });
  if (!created.privateKeyData) throw new Error("the IAM API answered a key with no privateKeyData");
  const keyJson = Buffer.from(created.privateKeyData, "base64").toString("utf-8");
  console.log(`created ${keyId(created.name)}`);
  writeSecret(opts.secretName, keyJson);

  for (const name of plan.disable) {
    await googleRequest("POST", `${IAM_BASE}/${name}:disable`, token, {});
    console.log(`disabled ${keyId(name)}`);
  }
  for (const name of plan.delete) {
    await googleRequest("DELETE", `${IAM_BASE}/${name}`, token);
    console.log(`deleted ${keyId(name)}`);
  }
  return plan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`gcp-key-rotate failed: ${err.message}`);
    process.exit(1);
  });
}
