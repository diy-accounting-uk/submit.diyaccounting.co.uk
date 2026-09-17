#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/gcp-identity-sync.js
//
// Makes the workload identity pool, its providers, the service account's
// roles/iam.workloadIdentityUser bindings and every [[org_policy]] match google/identity.toml.
// Lists the live state through the IAM and Org Policy REST APIs, diffs, and applies the
// difference; a resource that already matches is left alone. Plans by default, writes with
// --apply, like every script google-apply.yml runs.
//
// An org policy's resource is an organization, not the project the rest of this file manages,
// so it needs its own role. Today the federated service account holds none there: a plan reads
// this as a named, non-fatal line, and an apply fails naming the grant that would fix it
// (roles/orgpolicy.policyAdmin on the organization, or managing the constraint at project scope
// instead).
//
// --write-cred-configs writes one external-account credential configuration per AWS provider
// into google/credentials/, the same file `gcloud iam workload-identity-pools create-cred-config
// --aws` produces. The Lambdas build the same configuration from their environment (see
// app/lib/googleWorkloadIdentity.js); the committed files are the record of it.
//
// Usage:
//   node scripts/gcp-identity-sync.js [--apply] [--write-cred-configs]
//
// Credentials: application default credentials from google-github-actions/auth's federated
// exchange.

import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

import { assertFederatedCredentials, createGoogleAuthClient, getAccessToken } from "./lib/googleAuth.js";

export const CONFIG_PATH = "google/identity.toml";
export const CREDENTIALS_DIR = "google/credentials";
export const WORKLOAD_IDENTITY_USER_ROLE = "roles/iam.workloadIdentityUser";
// The role an organization policy admin needs. The federated service account holds project
// roles only (google/project.toml), so it cannot write an organization-level policy today.
export const ORG_POLICY_ADMIN_ROLE = "roles/orgpolicy.policyAdmin";
const IAM_BASE = "https://iam.googleapis.com/v1";
const RESOURCE_MANAGER_BASE = "https://cloudresourcemanager.googleapis.com/v1";
const ORG_POLICY_BASE = "https://orgpolicy.googleapis.com/v2";

/**
 * Parse google/identity.toml into the shape the planner reads.
 *
 * @param {string} tomlString
 */
// The IAM API refuses a pool or provider display name longer than this at create time
// (400 INVALID_ARGUMENT), so the plan refuses it first.
export const MAX_DISPLAY_NAME_LENGTH = 32;

function assertDisplayName(what, displayName) {
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(
      `${what}: display_name "${displayName}" is ${displayName.length} characters; the IAM API allows at most ${MAX_DISPLAY_NAME_LENGTH}`,
    );
  }
}

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
  assertDisplayName(`pool ${pool.id}`, pool.display_name ? String(pool.display_name) : "");
  for (const provider of providers) {
    if (!provider.id) throw new Error("a provider is missing its id");
    if (provider.type !== "oidc" && provider.type !== "aws") {
      throw new Error(`provider ${provider.id}: type must be "oidc" or "aws", got "${provider.type}"`);
    }
    if (provider.type === "oidc" && !provider.issuer_uri) throw new Error(`provider ${provider.id}: oidc needs issuer_uri`);
    if (provider.type === "aws" && !provider.account_id) throw new Error(`provider ${provider.id}: aws needs account_id`);
    if (!provider.principal_set) throw new Error(`provider ${provider.id}: principal_set is required`);
    assertDisplayName(`provider ${provider.id}`, provider.display_name ? String(provider.display_name) : "");
    if (!provider.attribute_mapping || typeof provider.attribute_mapping !== "object") {
      throw new Error(`provider ${provider.id}: attribute_mapping is required`);
    }
  }
  const orgPolicies = Array.isArray(parsed.org_policy) ? parsed.org_policy : [];
  for (const policy of orgPolicies) {
    if (!policy.constraint) throw new Error("an org_policy is missing its constraint");
    if (!policy.resource) throw new Error(`org_policy ${policy.constraint}: resource is required`);
    if (!Array.isArray(policy.allowed_values) || policy.allowed_values.length === 0) {
      throw new Error(`org_policy ${policy.constraint}: allowed_values must be a non-empty array`);
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
    orgPolicies: orgPolicies.map((policy) => ({
      constraint: String(policy.constraint),
      resource: String(policy.resource),
      allowedValues: policy.allowed_values.map(String),
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

/** The org policy's resource name under the Org Policy API. */
export function orgPolicyName(resource, constraint) {
  return `${resource}/policies/${constraint}`;
}

/** The policy body the Org Policy API stores, for comparison and for writes. */
export function orgPolicyBody(policy) {
  return { spec: { rules: [{ values: { allowedValues: [...policy.allowedValues] } }] } };
}

function sameValues(a = [], b = []) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, i) => value === sortedB[i]);
}

/**
 * Which fields differ between the wanted org policy and the live one. Pure, so it is unit-tested.
 *
 * @param {{ allowedValues: string[] }} wanted
 * @param {object|null} live - the Org Policy API's Policy resource, or null when it doesn't exist
 */
export function orgPolicyDiff(wanted, live) {
  const liveValues = live?.spec?.rules?.[0]?.values?.allowedValues ?? [];
  return sameValues(wanted.allowedValues, liveValues) ? [] : ["allowedValues"];
}

/**
 * Decide what to create or update for each declared org policy, from what readOrgPolicy read
 * back for it. A policy this service account cannot read reports as "forbidden" rather than
 * "missing": the caller decides whether that is a non-fatal plan line or an apply failure.
 * Pure, so it is unit-tested.
 *
 * @param {object} config - parseConfig's result
 * @param {Record<string, { policy: object|null, forbidden: string|null }>} liveOrgPolicies - keyed by constraint
 */
export function planOrgPolicies(config, liveOrgPolicies) {
  const actions = [];
  for (const policy of config.orgPolicies) {
    const name = orgPolicyName(policy.resource, policy.constraint);
    const live = liveOrgPolicies[policy.constraint];
    if (live?.forbidden) {
      actions.push({
        kind: "org-policy-forbidden",
        name,
        resource: policy.resource,
        reason: live.forbidden,
        serviceAccount: config.serviceAccount.email,
      });
      continue;
    }
    const wanted = orgPolicyBody(policy);
    if (!live?.policy) {
      actions.push({ kind: "create-org-policy", name, resource: policy.resource, body: wanted });
    } else {
      const fields = orgPolicyDiff(policy, live.policy);
      if (fields.length > 0) actions.push({ kind: "update-org-policy", name, body: wanted, fields });
    }
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

/**
 * The reason a Google API gave for refusing a request, read out of its JSON error body: the
 * message, plus the first ErrorInfo reason when there is one. Falls back to the raw text.
 * @param {string} bodyText
 * @returns {string}
 */
export function forbiddenReason(bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    const message = parsed?.error?.message;
    const reason = parsed?.error?.details?.find((d) => d.reason)?.reason;
    if (message) return reason ? `${message} (${reason})` : message;
  } catch {
    // not JSON: the raw text is the reason
  }
  return bodyText.slice(0, 300);
}

/**
 * The API a 403 names as not enabled in the project, or null when the refusal is anything else.
 * @param {string} message - an error message, as googleRequest throws it
 * @returns {string|null} e.g. "Identity and Access Management (IAM)"
 */
export function disabledApiName(message) {
  const match = /([A-Za-z()\s]+?) API has not been used in project|([A-Za-z()\s]+?) API[^"]*?it is disabled/i.exec(message ?? "");
  return match ? (match[1] ?? match[2]).trim() : null;
}

/**
 * What the plan says when the IAM API is disabled and nothing can be read: one line per
 * resource the sync would create once gcp-enable-apis has enabled the API. Answers null in
 * apply mode (the enable step ran first there, so a 403 is a real failure) and for any
 * refusal that is not a disabled API.
 * @param {Error} error - what readLiveState threw
 * @param {object} config - the parsed identity.toml
 * @param {boolean} apply - whether the run applies
 * @returns {string[]|null}
 */
export function planWhenApiDisabled(error, config, apply) {
  if (apply || !/^403 /.test(error?.message ?? "")) return null;
  const api = disabledApiName(error.message);
  if (api === null) return null;
  const number = config.project.number;
  const because = `the ${api} API is disabled (would enable, then create)`;
  return [
    `pool ${poolName(number, config.pool.id)}: ${because}`,
    ...config.providers.map((provider) => `provider ${providerName(number, config.pool.id, provider.id)}: ${because}`),
    `${config.serviceAccount.email}: ${WORKLOAD_IDENTITY_USER_ROLE} for ${config.providers.length} principal set(s): ${because.replace("then create", "then bind")}`,
  ];
}

async function googleRequest(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // A 404 on a read is the resource not existing yet, which the plan reports as "would create".
  if (res.status === 404 && method === "GET") return null;
  // A 403 is never something the plan can create its way out of: it fails, quoting the reason
  // (a disabled API, a missing role, an insufficient token scope).
  if (res.status === 403) throw new Error(`403 from ${method} ${url}: ${forbiddenReason(await res.text())}`);
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

/**
 * Read one org policy from the Org Policy API v2. A 403 is not thrown here: an
 * organization-scoped policy is the one resource in this file the federated service account may
 * have no role for, so the caller decides whether to print that as a non-fatal plan line or
 * fail the apply.
 */
async function readOrgPolicy(token, policy) {
  try {
    const live = await googleRequest("GET", `${ORG_POLICY_BASE}/${orgPolicyName(policy.resource, policy.constraint)}`, token);
    return { policy: live, forbidden: null };
  } catch (error) {
    if (/^403 /.test(error.message)) return { policy: null, forbidden: error.message };
    throw error;
  }
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

function describeOrgPolicy(action) {
  switch (action.kind) {
    case "create-org-policy":
      return `org policy ${action.name}: missing (would create)`;
    case "update-org-policy":
      return `org policy ${action.name}: differs on ${action.fields.join(", ")} (would update)`;
    case "org-policy-forbidden":
      return `org policy ${action.name}: ${action.reason} (needs ${ORG_POLICY_ADMIN_ROLE} on the organization for ${action.serviceAccount}, or a project-level policy instead)`;
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

async function applyOrgPolicyAction(token, action) {
  switch (action.kind) {
    case "create-org-policy":
      return googleRequest("POST", `${ORG_POLICY_BASE}/${action.resource}/policies`, token, { name: action.name, ...action.body });
    case "update-org-policy":
      return googleRequest("PATCH", `${ORG_POLICY_BASE}/${action.name}?updateMask=spec`, token, action.body);
    case "org-policy-forbidden":
      throw new Error(
        `${action.name}: ${action.reason}; grant ${ORG_POLICY_ADMIN_ROLE} on the organization to ${action.serviceAccount}, or manage this constraint with a project-level policy instead`,
      );
    default:
      throw new Error(`Unknown org policy action ${action.kind}`);
  }
}

/** Plan (and, in apply mode, apply) every [[org_policy]] entry. Prints as it goes. */
async function runOrgPolicies(token, config, opts) {
  const live = {};
  for (const policy of config.orgPolicies) {
    live[policy.constraint] = await readOrgPolicy(token, policy);
  }
  const plan = planOrgPolicies(config, live);
  for (const action of plan) console.log(describeOrgPolicy(action));
  if (!opts.apply) return plan;

  for (const action of plan) {
    await applyOrgPolicyAction(token, action);
    console.log(describeOrgPolicy(action).replace(/\(would (\w+)\)/, (_, verb) => `(${PAST_TENSE[verb] ?? verb})`));
  }
  return plan;
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
  assertFederatedCredentials();
  const token = await getAccessToken(createGoogleAuthClient());

  config.project.number = await resolveProjectNumber(token, config);
  console.log(`project ${config.project.id}: number ${config.project.number}`);

  let live;
  try {
    live = await readLiveState(token, config);
  } catch (error) {
    // On a pull request the workflow plans without enabling APIs, so a project that has never
    // used the IAM API answers 403 to every read until a push applies; the plan says what the
    // apply will do rather than failing. In apply mode the enable step has already run.
    const lines = planWhenApiDisabled(error, config, opts.apply);
    if (lines === null) throw error;
    for (const line of lines) console.log(line);
    for (const provider of config.providers) {
      console.log(`provider ${provider.id}: audience ${providerAudience(config.project.number, config.pool.id, provider.id)}`);
    }
    if (opts.writeCredConfigs) {
      for (const filePath of writeCredentialConfigs(config)) console.log(`wrote ${path.relative(process.cwd(), filePath)}`);
    }
    const orgPolicyPlan = await runOrgPolicies(token, config, opts);
    return [...lines, ...orgPolicyPlan];
  }
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
  if (!opts.apply) {
    const orgPolicyPlan = await runOrgPolicies(token, config, opts);
    return [...plan, ...orgPolicyPlan];
  }

  for (const action of plan) {
    const result = await applyAction(token, action, config, live);
    const suffix = result?.done === false ? " (operation started)" : "";
    console.log(`${describe(action).replace(/\(would (\w+)\)/, (_, verb) => `(${PAST_TENSE[verb] ?? verb})`)}${suffix}`);
  }
  const orgPolicyPlan = await runOrgPolicies(token, config, opts);
  return [...plan, ...orgPolicyPlan];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`gcp-identity-sync failed: ${err.message}`);
    process.exit(1);
  });
}
