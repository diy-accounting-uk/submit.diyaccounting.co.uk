#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/gcp-identity-sync.js
//
// Makes the workload identity pool, its providers and the service account's
// roles/iam.workloadIdentityUser bindings match google/identity.toml. Lists the live state
// through the IAM REST API, diffs, and applies the difference; a resource that already matches
// is left alone. Plans by default, writes with --apply, like every script google-apply.yml runs.
//
// --write-cred-configs writes one external-account credential configuration per AWS provider
// into google/credentials/, the same file `gcloud iam workload-identity-pools create-cred-config
// --aws` produces. The Lambdas build the same configuration from their environment (see
// app/lib/googleWorkloadIdentity.js); the committed files are the record of it.
//
// Usage:
//   node scripts/gcp-identity-sync.js [--apply] [--write-cred-configs]
//
// Credentials: GA4_SERVICE_ACCOUNT_JSON (local override), GA4_SERVICE_ACCOUNT_ARN (Secrets
// Manager), or application default credentials when GOOGLE_AUTH_MODE=federated. The key never
// reaches a log line.

import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

import { resolveServiceAccountCredentialsJson, createGoogleAuthClient, getAccessToken } from "./lib/googleAuth.js";

export const CONFIG_PATH = "google/identity.toml";
export const CREDENTIALS_DIR = "google/credentials";
export const WORKLOAD_IDENTITY_USER_ROLE = "roles/iam.workloadIdentityUser";
const IAM_BASE = "https://iam.googleapis.com/v1";
const RESOURCE_MANAGER_BASE = "https://cloudresourcemanager.googleapis.com/v1";

/**
 * Parse google/identity.toml into the shape the planner reads.
 *
 * @param {string} tomlString
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const project = parsed.project;
  if (!project?.id) throw new Error("identity.toml is missing [project].id");
  const serviceAccount = parsed.service_account;
  if (!serviceAccount?.email) throw new Error("identity.toml is missing [service_account].email");
  const pool = parsed.workload_identity_pool;
  if (!pool?.id) throw new Error("identity.toml is missing [workload_identity_pool].id");
  const providers = Array.isArray(pool.provider) ? pool.provider : [];
  if (providers.length === 0) throw new Error("identity.toml declares no [[workload_identity_pool.provider]]");
  for (const provider of providers) {
    if (!provider.id) throw new Error("a provider is missing its id");
    if (provider.type !== "oidc" && provider.type !== "aws") {
      throw new Error(`provider ${provider.id}: type must be "oidc" or "aws", got "${provider.type}"`);
    }
    if (provider.type === "oidc" && !provider.issuer_uri) throw new Error(`provider ${provider.id}: oidc needs issuer_uri`);
    if (provider.type === "aws" && !provider.account_id) throw new Error(`provider ${provider.id}: aws needs account_id`);
    if (!provider.principal_set) throw new Error(`provider ${provider.id}: principal_set is required`);
    if (!provider.attribute_mapping || typeof provider.attribute_mapping !== "object") {
      throw new Error(`provider ${provider.id}: attribute_mapping is required`);
    }
  }
  return {
    project: { id: String(project.id), number: project.number ? String(project.number) : null },
    serviceAccount: { email: String(serviceAccount.email) },
    pool: { id: String(pool.id), displayName: pool.display_name ? String(pool.display_name) : "" },
    providers: providers.map((provider) => ({
      id: String(provider.id),
      displayName: provider.display_name ? String(provider.display_name) : "",
      type: provider.type,
      issuerUri: provider.issuer_uri ? String(provider.issuer_uri) : null,
      accountId: provider.account_id ? String(provider.account_id) : null,
      githubEnvironment: provider.github_environment ? String(provider.github_environment) : null,
      attributeMapping: Object.fromEntries(Object.entries(provider.attribute_mapping).map(([k, v]) => [k, String(v)])),
      attributeCondition: provider.attribute_condition ? String(provider.attribute_condition) : "",
      principalSet: String(provider.principal_set),
    })),
  };
}

export function loadConfigFromRoot() {
  return parseConfig(fs.readFileSync(path.join(process.cwd(), CONFIG_PATH), "utf-8"));
}

export function parseArgs(argv) {
  const opts = { apply: false, writeCredConfigs: false };
  for (const arg of argv) {
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--write-cred-configs") opts.writeCredConfigs = true;
    else if (arg === "--help") {
      console.log("Usage: node scripts/gcp-identity-sync.js [--apply] [--write-cred-configs]");
      process.exit(0);
    } else throw new Error(`Unknown argument "${arg}"`);
  }
  return opts;
}

/** The pool's resource name under the project number. */
export function poolName(projectNumber, poolId) {
  return `projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}`;
}

/** The provider's resource name. */
export function providerName(projectNumber, poolId, providerId) {
  return `${poolName(projectNumber, poolId)}/providers/${providerId}`;
}

/** The member string a provider's principal set binds on the service account. */
export function principalSetMember(projectNumber, poolId, principalSet) {
  return `principalSet://iam.googleapis.com/${poolName(projectNumber, poolId)}/${principalSet}`;
}

/** The audience a federated caller presents for one provider. */
export function providerAudience(projectNumber, poolId, providerId) {
  return `//iam.googleapis.com/${providerName(projectNumber, poolId, providerId)}`;
}

/** The provider body the IAM API stores, for comparison and for writes. */
export function providerBody(provider) {
  const body = {
    displayName: provider.displayName,
    attributeMapping: provider.attributeMapping,
    attributeCondition: provider.attributeCondition,
  };
  if (provider.type === "oidc") body.oidc = { issuerUri: provider.issuerUri };
  else body.aws = { accountId: provider.accountId };
  return body;
}

function sameMapping(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if ((a[key] ?? "") !== (b[key] ?? "")) return false;
  return true;
}

/**
 * Which pool and provider fields differ between the wanted body and the live resource.
 * Pure, so it is unit-tested.
 */
export function providerDiff(wanted, live) {
  const fields = [];
  if ((wanted.displayName ?? "") !== (live.displayName ?? "")) fields.push("displayName");
  if (!sameMapping(wanted.attributeMapping, live.attributeMapping)) fields.push("attributeMapping");
  if ((wanted.attributeCondition ?? "") !== (live.attributeCondition ?? "")) fields.push("attributeCondition");
  if (wanted.oidc && (wanted.oidc.issuerUri ?? "") !== (live.oidc?.issuerUri ?? "")) fields.push("oidc.issuerUri");
  if (wanted.aws && (wanted.aws.accountId ?? "") !== (live.aws?.accountId ?? "")) fields.push("aws.accountId");
  return fields;
}

/**
 * Decide what to create, update or bind from the live pool, providers and service-account
 * policy. Pure, so it is unit-tested.
 *
 * @param {object} config - parseConfig's result, with project.number filled in
 * @param {{ pool: object|null, providers: Record<string, object|null>, policy: object }} live
 */
export function planIdentity(config, live) {
  const number = config.project.number;
  const actions = [];
  const wantedPool = { displayName: config.pool.displayName };
  if (!live.pool) {
    actions.push({ kind: "create-pool", name: poolName(number, config.pool.id), body: wantedPool });
  } else if (live.pool.state && live.pool.state !== "ACTIVE") {
    actions.push({ kind: "undelete-pool", name: poolName(number, config.pool.id) });
  } else if ((live.pool.displayName ?? "") !== wantedPool.displayName) {
    actions.push({ kind: "update-pool", name: poolName(number, config.pool.id), body: wantedPool, fields: ["displayName"] });
  }

  for (const provider of config.providers) {
    const name = providerName(number, config.pool.id, provider.id);
    const wanted = providerBody(provider);
    const current = live.providers[provider.id];
    if (!current) {
      actions.push({ kind: "create-provider", name, providerId: provider.id, body: wanted });
    } else if (current.state && current.state !== "ACTIVE") {
      actions.push({ kind: "undelete-provider", name });
    } else {
      const fields = providerDiff(wanted, current);
      if (fields.length > 0) actions.push({ kind: "update-provider", name, body: wanted, fields });
    }
  }

  const wantedMembers = config.providers.map((provider) => principalSetMember(number, config.pool.id, provider.principalSet));
  const binding = (live.policy?.bindings ?? []).find((b) => b.role === WORKLOAD_IDENTITY_USER_ROLE);
  const liveMembers = new Set(binding?.members ?? []);
  const missing = wantedMembers.filter((member) => !liveMembers.has(member));
  if (missing.length > 0) {
    actions.push({ kind: "bind-workload-identity-user", serviceAccount: config.serviceAccount.email, members: missing });
  }
  return actions;
}

/**
 * The external-account credential configuration for one AWS provider, the shape
 * `gcloud iam workload-identity-pools create-cred-config --aws` writes. Holds no secret.
 */
export function awsCredentialConfig(config, provider) {
  if (provider.type !== "aws") throw new Error(`provider ${provider.id} is not an aws provider`);
  return {
    universe_domain: "googleapis.com",
    type: "external_account",
    audience: providerAudience(config.project.number, config.pool.id, provider.id),
    subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${config.serviceAccount.email}:generateAccessToken`,
    token_url: "https://sts.googleapis.com/v1/token",
    credential_source: {
      environment_id: "aws1",
      region_url: "http://169.254.169.254/latest/meta-data/placement/availability-zone",
      url: "http://169.254.169.254/latest/meta-data/iam/security-credentials",
      regional_cred_verification_url: "https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15",
      imdsv2_session_token_url: "http://169.254.169.254/latest/api/token",
    },
  };
}

/** The file each AWS provider's credential configuration is written to. */
export function credentialConfigPath(provider) {
  return path.join(CREDENTIALS_DIR, `${provider.id}.json`);
}

async function googleRequest(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404 && method === "GET") return null;
  if (!res.ok) throw new Error(`${res.status} from ${method} ${url}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function resolveProjectNumber(token, config) {
  const project = await googleRequest("GET", `${RESOURCE_MANAGER_BASE}/projects/${config.project.id}`, token);
  if (!project?.projectNumber) throw new Error(`Resource Manager returned no projectNumber for ${config.project.id}`);
  const liveNumber = String(project.projectNumber);
  if (config.project.number && config.project.number !== liveNumber) {
    throw new Error(`identity.toml records project number ${config.project.number} but ${config.project.id} is ${liveNumber}`);
  }
  return liveNumber;
}

async function readLiveState(token, config) {
  const number = config.project.number;
  const pool = await googleRequest("GET", `${IAM_BASE}/${poolName(number, config.pool.id)}`, token);
  const providers = {};
  for (const provider of config.providers) {
    providers[provider.id] = pool
      ? await googleRequest("GET", `${IAM_BASE}/${providerName(number, config.pool.id, provider.id)}`, token)
      : null;
  }
  const policy = await googleRequest(
    "POST",
    `${IAM_BASE}/projects/-/serviceAccounts/${config.serviceAccount.email}:getIamPolicy`,
    token,
    {},
  );
  return { pool, providers, policy: policy ?? { bindings: [] } };
}

const PAST_TENSE = { create: "created", update: "updated", undelete: "undeleted", bind: "bound" };

function describe(action) {
  switch (action.kind) {
    case "create-pool":
      return `pool ${action.name}: missing (would create)`;
    case "undelete-pool":
      return `pool ${action.name}: deleted (would undelete)`;
    case "update-pool":
      return `pool ${action.name}: differs on ${action.fields.join(", ")} (would update)`;
    case "create-provider":
      return `provider ${action.name}: missing (would create)`;
    case "undelete-provider":
      return `provider ${action.name}: deleted (would undelete)`;
    case "update-provider":
      return `provider ${action.name}: differs on ${action.fields.join(", ")} (would update)`;
    case "bind-workload-identity-user":
      return `${action.serviceAccount}: ${WORKLOAD_IDENTITY_USER_ROLE} missing for ${action.members.join(", ")} (would bind)`;
    default:
      return `${action.kind}`;
  }
}

async function applyAction(token, action, config, live) {
  switch (action.kind) {
    case "create-pool": {
      const parent = `projects/${config.project.number}/locations/global`;
      return googleRequest(
        "POST",
        `${IAM_BASE}/${parent}/workloadIdentityPools?workloadIdentityPoolId=${config.pool.id}`,
        token,
        action.body,
      );
    }
    case "undelete-pool":
    case "undelete-provider":
      return googleRequest("POST", `${IAM_BASE}/${action.name}:undelete`, token, {});
    case "update-pool":
    case "update-provider":
      return googleRequest("PATCH", `${IAM_BASE}/${action.name}?updateMask=${action.fields.join(",")}`, token, action.body);
    case "create-provider": {
      const parent = poolName(config.project.number, config.pool.id);
      return googleRequest(
        "POST",
        `${IAM_BASE}/${parent}/providers?workloadIdentityPoolProviderId=${action.providerId}`,
        token,
        action.body,
      );
    }
    case "bind-workload-identity-user": {
      const policy = live.policy ?? { bindings: [] };
      const bindings = policy.bindings ?? [];
      let binding = bindings.find((b) => b.role === WORKLOAD_IDENTITY_USER_ROLE);
      if (!binding) {
        binding = { role: WORKLOAD_IDENTITY_USER_ROLE, members: [] };
        bindings.push(binding);
      }
      binding.members = [...new Set([...(binding.members ?? []), ...action.members])];
      const body = { policy: { ...policy, bindings } };
      return googleRequest("POST", `${IAM_BASE}/projects/-/serviceAccounts/${action.serviceAccount}:setIamPolicy`, token, body);
    }
    default:
      throw new Error(`Unknown action ${action.kind}`);
  }
}

export function writeCredentialConfigs(config, rootDir = process.cwd()) {
  const written = [];
  for (const provider of config.providers.filter((p) => p.type === "aws")) {
    const filePath = path.join(rootDir, credentialConfigPath(provider));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(awsCredentialConfig(config, provider), null, 2)}\n`);
    written.push(filePath);
  }
  return written;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const config = loadConfigFromRoot();
  const credentialsJson = await resolveServiceAccountCredentialsJson({
    jsonEnvVar: "GA4_SERVICE_ACCOUNT_JSON",
    arnEnvVar: "GA4_SERVICE_ACCOUNT_ARN",
  });
  const token = await getAccessToken(createGoogleAuthClient(credentialsJson));

  config.project.number = await resolveProjectNumber(token, config);
  console.log(`project ${config.project.id}: number ${config.project.number}`);

  const live = await readLiveState(token, config);
  const plan = planIdentity(config, live);
  if (plan.length === 0) {
    console.log(
      `pool ${config.pool.id}, ${config.providers.length} provider(s) and the ${WORKLOAD_IDENTITY_USER_ROLE} bindings: already match`,
    );
  }
  for (const action of plan) console.log(describe(action));
  for (const provider of config.providers) {
    console.log(`provider ${provider.id}: audience ${providerAudience(config.project.number, config.pool.id, provider.id)}`);
  }

  if (opts.writeCredConfigs) {
    for (const filePath of writeCredentialConfigs(config)) console.log(`wrote ${path.relative(process.cwd(), filePath)}`);
  }
  if (!opts.apply) return plan;

  for (const action of plan) {
    const result = await applyAction(token, action, config, live);
    const suffix = result?.done === false ? " (operation started)" : "";
    console.log(`${describe(action).replace(/\(would (\w+)\)/, (_, verb) => `(${PAST_TENSE[verb] ?? verb})`)}${suffix}`);
  }
  return plan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`gcp-identity-sync failed: ${err.message}`);
    process.exit(1);
  });
}
