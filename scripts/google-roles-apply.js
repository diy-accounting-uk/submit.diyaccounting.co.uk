#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/google-roles-apply.js
//
// Reads analytics/google-roles.toml, lists the live GA4 Analytics Admin API access bindings
// and GCP Resource Manager IAM bindings for the principals named in that file, diffs them
// against what the file declares, and applies the difference. Read-only with --dry-run.
//
// The diff only ever touches a principal (a GA4 "user" or a GCP IAM "member") that appears in
// the toml file, and only for the account or project that entry names. A binding held by some
// other principal, or by a tracked principal on an account/project the file doesn't mention,
// is left alone. Revoke a role by removing it from an entry's roles list, not by deleting the
// entry: deleting the entry stops the script from managing that grant, it does not revoke it.
//
// Usage:
//   node scripts/google-roles-apply.js --dry-run
//   node scripts/google-roles-apply.js
//
// Credentials: GA4_SERVICE_ACCOUNT_JSON (raw key JSON, for local runs) or
// GA4_SERVICE_ACCOUNT_ARN (an AWS Secrets Manager ARN), the same precedence and secret
// app/functions/analytics/ga4ReportPull.js uses. Never printed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import TOML from "@iarna/toml";
import { GoogleAuth } from "google-auth-library";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

// AccessBinding is a v1alpha-only resource in the GA4 Analytics Admin API; it has not graduated
// to v1beta.
const GA4_ADMIN_API_BASE = "https://analyticsadmin.googleapis.com/v1alpha";
const RESOURCE_MANAGER_API_BASE = "https://cloudresourcemanager.googleapis.com/v3";
const SCOPES = ["https://www.googleapis.com/auth/analytics.manage.users", "https://www.googleapis.com/auth/cloud-platform"];

export function parseArgs(argv) {
  const opts = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      opts.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

/**
 * Parse and validate analytics/google-roles.toml's content.
 *
 * @param {string} tomlString
 * @returns {{serviceAccountEmail: string, ga4AccountBindings: {accountId: string, user: string, roles: string[]}[], gcpProjectBindings: {projectId: string, member: string, roles: string[]}[]}}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const serviceAccountEmail = parsed.service_account?.email;
  if (!serviceAccountEmail) {
    throw new Error("google-roles.toml is missing [service_account].email");
  }
  const ga4AccountBindings = (parsed.ga4?.account_bindings ?? []).map((entry) => {
    if (!entry.account_id || !entry.user || !Array.isArray(entry.roles)) {
      throw new Error(`Invalid [[ga4.account_bindings]] entry: ${JSON.stringify(entry)}`);
    }
    return { accountId: String(entry.account_id), user: entry.user, roles: [...entry.roles] };
  });
  const gcpProjectBindings = (parsed.gcp?.project_bindings ?? []).map((entry) => {
    if (!entry.project_id || !entry.member || !Array.isArray(entry.roles)) {
      throw new Error(`Invalid [[gcp.project_bindings]] entry: ${JSON.stringify(entry)}`);
    }
    return { projectId: entry.project_id, member: entry.member, roles: [...entry.roles] };
  });
  return { serviceAccountEmail, ga4AccountBindings, gcpProjectBindings };
}

function sortedEqual(a, b) {
  const left = [...a].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((role, index) => role === right[index]);
}

/**
 * Diff one GA4 account's desired bindings (from the toml) against its live accessBindings.
 * Only compares users that appear in `desiredBindings`; a live binding for any other user is
 * left out of the result entirely.
 *
 * @param {{user: string, roles: string[]}[]} desiredBindings - already filtered to one account
 * @param {{name: string, user: string, roles: string[]}[]} liveBindings - that account's live accessBindings
 * @returns {{toCreate: {user: string, roles: string[]}[], toUpdate: {name: string, user: string, roles: string[]}[]}}
 */
export function diffGa4AccountBindings(desiredBindings, liveBindings) {
  const toCreate = [];
  const toUpdate = [];
  for (const desired of desiredBindings) {
    const live = liveBindings.find((binding) => binding.user === desired.user);
    if (!live) {
      toCreate.push(desired);
    } else if (!sortedEqual(desired.roles, live.roles)) {
      toUpdate.push({ name: live.name, user: desired.user, roles: desired.roles });
    }
  }
  return { toCreate, toUpdate };
}

/**
 * Diff one GCP project's desired member/role bindings (from the toml) against its live IAM
 * policy. Only compares members that appear in `desiredBindings`; a live binding for any other
 * member, or for a role a tracked member doesn't carry, is left out of the result entirely
 * unless that member is the one being diffed.
 *
 * @param {{member: string, roles: string[]}[]} desiredBindings - already filtered to one project
 * @param {{role: string, members: string[]}[]} livePolicyBindings - that project's live IAM policy bindings
 * @returns {{toAdd: {member: string, role: string}[], toRemove: {member: string, role: string}[]}}
 */
export function diffGcpProjectBindings(desiredBindings, livePolicyBindings) {
  const toAdd = [];
  const toRemove = [];
  const trackedMembers = new Set(desiredBindings.map((entry) => entry.member));

  const liveRolesByMember = new Map();
  for (const binding of livePolicyBindings) {
    for (const member of binding.members) {
      if (!trackedMembers.has(member)) continue;
      const roles = liveRolesByMember.get(member) ?? [];
      roles.push(binding.role);
      liveRolesByMember.set(member, roles);
    }
  }

  for (const desired of desiredBindings) {
    const liveRoles = new Set(liveRolesByMember.get(desired.member) ?? []);
    for (const role of desired.roles) {
      if (!liveRoles.has(role)) toAdd.push({ member: desired.member, role });
    }
    const desiredRoles = new Set(desired.roles);
    for (const role of liveRoles) {
      if (!desiredRoles.has(role)) toRemove.push({ member: desired.member, role });
    }
  }
  return { toAdd, toRemove };
}

/**
 * Apply a set of member/role additions and removals onto a live IAM policy's bindings,
 * without touching any binding for a member not named in `toAdd`/`toRemove`.
 *
 * @param {{role: string, members: string[]}[]} bindings
 * @param {{member: string, role: string}[]} toAdd
 * @param {{member: string, role: string}[]} toRemove
 * @returns {{role: string, members: string[]}[]}
 */
export function applyGcpBindingChanges(bindings, toAdd, toRemove) {
  const next = bindings.map((binding) => ({ role: binding.role, members: [...binding.members] }));

  for (const { member, role } of toRemove) {
    const binding = next.find((b) => b.role === role);
    if (binding) binding.members = binding.members.filter((m) => m !== member);
  }
  for (const { member, role } of toAdd) {
    let binding = next.find((b) => b.role === role);
    if (!binding) {
      binding = { role, members: [] };
      next.push(binding);
    }
    if (!binding.members.includes(member)) binding.members.push(member);
  }
  return next.filter((binding) => binding.members.length > 0);
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

// --- I/O: reading the config file and the AWS-held credential ---

/**
 * @returns {{serviceAccountEmail: string, ga4AccountBindings: object[], gcpProjectBindings: object[]}}
 */
export function loadConfigFromRoot() {
  const filePath = path.join(process.cwd(), "analytics/google-roles.toml");
  return parseConfig(fs.readFileSync(filePath, "utf-8"));
}

let cachedSecretsManagerClient = null;

function getSecretsManagerClient() {
  if (!cachedSecretsManagerClient) {
    cachedSecretsManagerClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedSecretsManagerClient;
}

/**
 * Resolve the GA4 service-account key JSON, the same env-var-then-Secrets-Manager precedence
 * and secret app/functions/analytics/ga4ReportPull.js uses.
 *
 * @returns {Promise<string>}
 */
async function resolveServiceAccountCredentialsJson() {
  if (process.env.GA4_SERVICE_ACCOUNT_JSON) {
    return process.env.GA4_SERVICE_ACCOUNT_JSON;
  }
  const arn = process.env.GA4_SERVICE_ACCOUNT_ARN;
  if (!arn) {
    throw new Error("Neither GA4_SERVICE_ACCOUNT_JSON nor GA4_SERVICE_ACCOUNT_ARN is set");
  }
  const result = await getSecretsManagerClient().send(new GetSecretValueCommand({ SecretId: arn }));
  return result.SecretString;
}

async function getAuthClient() {
  const credentialsJson = await resolveServiceAccountCredentialsJson();
  const credentials = JSON.parse(credentialsJson);
  const auth = new GoogleAuth({ credentials, scopes: SCOPES });
  return auth.getClient();
}

// --- GA4 Analytics Admin API ---

function toGa4Binding(raw) {
  return { name: raw.name, user: raw.user, roles: [...(raw.roles ?? [])] };
}

async function listGa4AccessBindings(authClient, accountId) {
  const bindings = [];
  let pageToken;
  do {
    const response = await authClient.request({
      url: `${GA4_ADMIN_API_BASE}/accounts/${accountId}/accessBindings`,
      params: pageToken ? { pageSize: 200, pageToken } : { pageSize: 200 },
    });
    for (const raw of response.data.accessBindings ?? []) {
      if (raw.user) bindings.push(toGa4Binding(raw));
    }
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return bindings;
}

async function createGa4AccessBinding(authClient, accountId, { user, roles }) {
  await authClient.request({
    url: `${GA4_ADMIN_API_BASE}/accounts/${accountId}/accessBindings`,
    method: "POST",
    data: { user, roles },
  });
}

async function updateGa4AccessBinding(authClient, { name, roles }) {
  await authClient.request({
    url: `${GA4_ADMIN_API_BASE}/${name}`,
    method: "PATCH",
    data: { roles },
  });
}

// --- GCP Resource Manager IAM ---

async function getProjectIamPolicy(authClient, projectId) {
  const response = await authClient.request({
    url: `${RESOURCE_MANAGER_API_BASE}/projects/${projectId}:getIamPolicy`,
    method: "POST",
    data: {},
  });
  return { etag: response.data.etag, bindings: response.data.bindings ?? [] };
}

async function setProjectIamPolicy(authClient, projectId, policy) {
  await authClient.request({
    url: `${RESOURCE_MANAGER_API_BASE}/projects/${projectId}:setIamPolicy`,
    method: "POST",
    data: { policy: { bindings: policy.bindings, etag: policy.etag }, updateMask: "bindings" },
  });
}

// --- Reporting ---

function printGa4Diff(accountId, diff) {
  for (const binding of diff.toCreate) {
    console.log(`  [ga4 account ${accountId}] create ${binding.user}: ${binding.roles.join(", ")}`);
  }
  for (const binding of diff.toUpdate) {
    console.log(`  [ga4 account ${accountId}] update ${binding.user} -> ${binding.roles.join(", ")}`);
  }
}

function printGcpDiff(projectId, diff) {
  for (const change of diff.toAdd) {
    console.log(`  [gcp project ${projectId}] grant ${change.role} to ${change.member}`);
  }
  for (const change of diff.toRemove) {
    console.log(`  [gcp project ${projectId}] revoke ${change.role} from ${change.member}`);
  }
}

function isGa4DiffEmpty(diff) {
  return diff.toCreate.length === 0 && diff.toUpdate.length === 0;
}

function isGcpDiffEmpty(diff) {
  return diff.toAdd.length === 0 && diff.toRemove.length === 0;
}

export async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = loadConfigFromRoot();
  const authClient = await getAuthClient();

  console.log(`Google roles${opts.dryRun ? " (dry run)" : ""} for ${config.serviceAccountEmail}\n`);

  let anyChange = false;

  const byAccount = groupBy(config.ga4AccountBindings, (b) => b.accountId);
  for (const [accountId, desiredBindings] of byAccount) {
    const liveBindings = await listGa4AccessBindings(authClient, accountId);
    const diff = diffGa4AccountBindings(desiredBindings, liveBindings);
    if (isGa4DiffEmpty(diff)) {
      console.log(`GA4 account ${accountId}: no changes`);
      continue;
    }
    anyChange = true;
    console.log(`GA4 account ${accountId}:`);
    printGa4Diff(accountId, diff);
    if (!opts.dryRun) {
      for (const binding of diff.toCreate) {
        await createGa4AccessBinding(authClient, accountId, binding);
      }
      for (const binding of diff.toUpdate) {
        await updateGa4AccessBinding(authClient, binding);
      }
    }
  }

  const byProject = groupBy(config.gcpProjectBindings, (b) => b.projectId);
  for (const [projectId, desiredBindings] of byProject) {
    const policy = await getProjectIamPolicy(authClient, projectId);
    const diff = diffGcpProjectBindings(desiredBindings, policy.bindings);
    if (isGcpDiffEmpty(diff)) {
      console.log(`GCP project ${projectId}: no changes`);
      continue;
    }
    anyChange = true;
    console.log(`GCP project ${projectId}:`);
    printGcpDiff(projectId, diff);
    if (!opts.dryRun) {
      const nextBindings = applyGcpBindingChanges(policy.bindings, diff.toAdd, diff.toRemove);
      await setProjectIamPolicy(authClient, projectId, { etag: policy.etag, bindings: nextBindings });
    }
  }

  if (!anyChange) {
    console.log("\nNo changes.");
  } else if (opts.dryRun) {
    console.log("\nDry run: no changes applied.");
  } else {
    console.log("\nChanges applied.");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("google-roles-apply failed:", err.message);
    process.exit(1);
  });
}
