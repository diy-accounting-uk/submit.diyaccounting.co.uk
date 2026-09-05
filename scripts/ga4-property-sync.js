#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/ga4-property-sync.js
//
// Idempotent GA4 setup for one submit environment. Given an environment and a hostname,
// this finds or creates: the GA4 property named for that environment, its web data stream
// for the hostname, and its BigQuery link to the diyaccounting-ga4 project. It then sets
// SUBMIT_GA4_MEASUREMENT_ID on the matching GitHub Environment.
//
// This is a separate, per-environment split from the single shared "DIY Accounting"
// property that already covers the gateway, spreadsheets and submit production sites
// (see google-analytics.toml) — it does not touch that property.
//
// Usage:
//   GA4_SERVICE_ACCOUNT_JSON=... (or GA4_SERVICE_ACCOUNT_ARN with AWS credentials) node scripts/ga4-property-sync.js --environment ci --hostname ci-submit.diyaccounting.co.uk
//
// Options:
//   --environment <ci|prod>  Required. Which submit environment to sync.
//   --hostname <host>        Required. The hostname the web data stream should track.
//   --dry-run                Read current state and print the plan; write nothing to
//                             Google or GitHub.

import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { createGoogleAuthorizedClient, resolveServiceAccountCredentialsJson } from "./lib/googleAuth.js";

export const GA4_ACCOUNT_DISPLAY_NAME = "DIY Accounting";
export const GA4_BIGQUERY_PROJECT_ID = "diyaccounting-ga4";
export const GA4_BIGQUERY_LOCATION = "europe-west2";
export const GITHUB_VARIABLE_NAME = "SUBMIT_GA4_MEASUREMENT_ID";

const ANALYTICS_ADMIN_V1BETA = "https://analyticsadmin.googleapis.com/v1beta";
// BigQuery links are still a v1alpha-only resource on the Analytics Admin API.
const ANALYTICS_ADMIN_V1ALPHA = "https://analyticsadmin.googleapis.com/v1alpha";
const CLOUD_RESOURCE_MANAGER_V3 = "https://cloudresourcemanager.googleapis.com/v3";

const ANALYTICS_EDIT_SCOPE = "https://www.googleapis.com/auth/analytics.edit";
const CLOUD_PLATFORM_READONLY_SCOPE = "https://www.googleapis.com/auth/cloud-platform.read-only";

export function parseArgs(argv) {
  const opts = { environment: undefined, hostname: undefined, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--environment":
        opts.environment = argv[++i];
        break;
      case "--hostname":
        opts.hostname = argv[++i];
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (opts.environment !== "ci" && opts.environment !== "prod") {
    throw new Error('--environment is required and must be "ci" or "prod"');
  }
  if (!opts.hostname) {
    throw new Error("--hostname is required");
  }
  return opts;
}

/**
 * The display name convention for a per-environment GA4 property: "DIY Accounting Submit
 * (ci)" / "DIY Accounting Submit (prod)". Property lookup matches this exactly, so a
 * property renamed in the GA4 UI stops being found and a duplicate gets proposed.
 *
 * @param {"ci"|"prod"} environment
 * @returns {string}
 */
export function displayNameForEnvironment(environment) {
  return `DIY Accounting Submit (${environment})`;
}

/**
 * The web data stream's default URI for a hostname.
 *
 * @param {string} hostname
 * @returns {string}
 */
export function streamUriForHostname(hostname) {
  return `https://${hostname}`;
}

function projectMatches(linkProject, { projectId, projectNumber }) {
  if (!linkProject) return false;
  if (linkProject === `projects/${projectId}`) return true;
  return Boolean(projectNumber) && linkProject === `projects/${projectNumber}`;
}

/**
 * Build the sync plan from the current GA4/GitHub state. Pure and network-free so it can
 * be unit tested with fixtures: every "would create" / "would update" / "already in sync"
 * decision lives here, not scattered across the network calls in `main`.
 *
 * @param {object} input
 * @param {"ci"|"prod"} input.environment
 * @param {string} input.hostname
 * @param {{name: string, displayName: string}} input.account - the "DIY Accounting" GA4 account
 * @param {Array<{name: string, displayName: string, deleteTime?: string}>} [input.properties]
 * @param {Array<{name: string, webStreamData?: {defaultUri?: string, measurementId?: string}}>} [input.dataStreams]
 *   - data streams under the matched property, empty when the property doesn't exist yet
 * @param {Array<{name: string, project?: string, datasetLocation?: string, dailyExportEnabled?: boolean}>} [input.bigQueryLinks]
 *   - BigQuery links under the matched property, empty when the property doesn't exist yet
 * @param {string|null} [input.projectNumber] - diyaccounting-ga4's project number, when resolved
 * @param {string|null} [input.currentGithubVariableValue] - the value already set on the GitHub
 *   Environment, or null if unset or unread
 * @returns {object} the plan
 */
export function buildPlan({
  environment,
  hostname,
  account,
  properties = [],
  dataStreams = [],
  bigQueryLinks = [],
  projectNumber = null,
  currentGithubVariableValue = null,
}) {
  const displayName = displayNameForEnvironment(environment);
  const streamUri = streamUriForHostname(hostname);

  const existingProperty = properties.find((p) => p.displayName === displayName && !p.deleteTime);
  const propertyPlan = existingProperty
    ? { action: "noop", name: existingProperty.name, displayName }
    : { action: "create", name: null, displayName };
  const propertyPending = propertyPlan.action === "create";

  const existingStream = existingProperty ? dataStreams.find((s) => s.webStreamData?.defaultUri === streamUri) : undefined;
  const dataStreamPlan = existingStream
    ? { action: "noop", name: existingStream.name, defaultUri: streamUri, measurementId: existingStream.webStreamData?.measurementId ?? null }
    : { action: "create", name: null, defaultUri: streamUri, measurementId: null, blockedOnProperty: propertyPending };

  const existingLink = existingProperty
    ? bigQueryLinks.find((link) => projectMatches(link.project, { projectId: GA4_BIGQUERY_PROJECT_ID, projectNumber }))
    : undefined;
  const linkInSync = existingLink && existingLink.datasetLocation === GA4_BIGQUERY_LOCATION && existingLink.dailyExportEnabled === true;
  const bigQueryLinkPlan = existingLink
    ? {
        action: linkInSync ? "noop" : "update",
        name: existingLink.name,
        project: GA4_BIGQUERY_PROJECT_ID,
        datasetLocation: GA4_BIGQUERY_LOCATION,
        dailyExportEnabled: true,
      }
    : {
        action: "create",
        name: null,
        project: GA4_BIGQUERY_PROJECT_ID,
        datasetLocation: GA4_BIGQUERY_LOCATION,
        dailyExportEnabled: true,
        blockedOnProperty: propertyPending,
      };

  const measurementId = dataStreamPlan.measurementId;
  const githubVariablePlan = measurementId
    ? currentGithubVariableValue === measurementId
      ? { action: "noop", name: GITHUB_VARIABLE_NAME, environment, value: measurementId }
      : { action: "set", name: GITHUB_VARIABLE_NAME, environment, value: measurementId, previousValue: currentGithubVariableValue }
    : { action: "pending", name: GITHUB_VARIABLE_NAME, environment, value: null, previousValue: currentGithubVariableValue };

  return {
    environment,
    hostname,
    displayName,
    streamUri,
    account: { name: account.name, displayName: account.displayName },
    property: propertyPlan,
    dataStream: dataStreamPlan,
    bigQueryLink: bigQueryLinkPlan,
    githubVariable: githubVariablePlan,
  };
}

function printPlan(plan, dryRun) {
  const tag = dryRun ? "[dry-run] " : "";
  console.log(`\n=== GA4 property sync: ${plan.environment}${dryRun ? " (dry run)" : ""} ===`);
  console.log(`Account: ${plan.account.displayName} (${plan.account.name})`);

  console.log(`Property "${plan.displayName}":`);
  console.log(plan.property.action === "noop" ? `  already exists: ${plan.property.name}` : `  ${tag}would create`);

  console.log(`Data stream for ${plan.streamUri}:`);
  if (plan.dataStream.action === "noop") {
    console.log(`  already exists: ${plan.dataStream.name} (measurement id ${plan.dataStream.measurementId})`);
  } else {
    console.log(`  ${tag}would create${plan.dataStream.blockedOnProperty ? " (after the property is created)" : ""}`);
  }

  console.log(`BigQuery link to ${GA4_BIGQUERY_PROJECT_ID} (${GA4_BIGQUERY_LOCATION}, daily export):`);
  if (plan.bigQueryLink.action === "noop") {
    console.log(`  already in sync: ${plan.bigQueryLink.name}`);
  } else if (plan.bigQueryLink.action === "update") {
    console.log(`  ${tag}would update: ${plan.bigQueryLink.name}`);
  } else {
    console.log(`  ${tag}would create${plan.bigQueryLink.blockedOnProperty ? " (after the property is created)" : ""}`);
  }

  console.log(`GitHub variable ${GITHUB_VARIABLE_NAME} (environment "${plan.environment}"):`);
  if (plan.githubVariable.action === "noop") {
    console.log(`  already set to ${plan.githubVariable.value}`);
  } else if (plan.githubVariable.action === "set") {
    console.log(`  ${tag}would set to ${plan.githubVariable.value} (currently ${plan.githubVariable.previousValue ?? "unset"})`);
  } else {
    console.log("  pending — the measurement id only exists once the data stream is created");
  }
  console.log("");
}

async function findAccount(client) {
  const { data } = await client.request({ url: `${ANALYTICS_ADMIN_V1BETA}/accounts` });
  return (data.accounts || []).find((a) => a.displayName === GA4_ACCOUNT_DISPLAY_NAME) ?? null;
}

async function listProperties(client, accountName) {
  const { data } = await client.request({
    url: `${ANALYTICS_ADMIN_V1BETA}/properties`,
    params: { filter: `parent:${accountName}` },
  });
  return data.properties || [];
}

async function listDataStreams(client, propertyName) {
  const { data } = await client.request({ url: `${ANALYTICS_ADMIN_V1BETA}/${propertyName}/dataStreams` });
  return data.dataStreams || [];
}

async function listBigQueryLinks(client, propertyName) {
  const { data } = await client.request({ url: `${ANALYTICS_ADMIN_V1ALPHA}/${propertyName}/bigQueryLinks` });
  return data.bigQueryLinks || [];
}

async function resolveProjectNumber(client, projectId) {
  try {
    const { data } = await client.request({ url: `${CLOUD_RESOURCE_MANAGER_V3}/projects/${projectId}` });
    // data.name is "projects/{number}"; project id lookups only match by number after creation.
    return data.name?.split("/")[1] ?? null;
  } catch (error) {
    console.warn(`Could not resolve the project number for ${projectId}: ${error.message}`);
    return null;
  }
}

async function createProperty(client, accountName, displayName) {
  const { data } = await client.request({
    url: `${ANALYTICS_ADMIN_V1BETA}/properties`,
    method: "POST",
    data: { parent: accountName, displayName, timeZone: "Europe/London", currencyCode: "GBP" },
  });
  return data;
}

async function createDataStream(client, propertyName, displayName, defaultUri) {
  const { data } = await client.request({
    url: `${ANALYTICS_ADMIN_V1BETA}/${propertyName}/dataStreams`,
    method: "POST",
    data: { type: "WEB_DATA_STREAM", displayName, webStreamData: { defaultUri } },
  });
  return data;
}

async function createBigQueryLink(client, propertyName, projectId, datasetLocation) {
  const { data } = await client.request({
    url: `${ANALYTICS_ADMIN_V1ALPHA}/${propertyName}/bigQueryLinks`,
    method: "POST",
    data: { project: `projects/${projectId}`, datasetLocation, dailyExportEnabled: true },
  });
  return data;
}

/**
 * Read the current value of SUBMIT_GA4_MEASUREMENT_ID on a GitHub Environment, so the plan
 * can say whether it would change anything. A read, never a write; any failure (gh missing,
 * not authenticated, variable unset) is treated as "unknown" rather than thrown.
 *
 * @param {string} environment
 * @returns {string|null}
 */
function readGithubVariable(environment) {
  try {
    const output = execFileSync("gh", ["variable", "list", "--env", environment], { encoding: "utf8" });
    const row = output
      .split("\n")
      .map((line) => line.split("\t"))
      .find(([name]) => name === GITHUB_VARIABLE_NAME);
    return row?.[1]?.trim() ?? null;
  } catch (error) {
    console.warn(`Could not read the existing GitHub variable ${GITHUB_VARIABLE_NAME} for environment "${environment}": ${error.message}`);
    return null;
  }
}

function setGithubVariable(environment, value) {
  execFileSync("gh", ["variable", "set", GITHUB_VARIABLE_NAME, "--env", environment, "--body", value], { stdio: "inherit" });
}

async function applyPlan(client, plan) {
  let propertyName = plan.property.name;
  if (plan.property.action === "create") {
    const created = await createProperty(client, plan.account.name, plan.displayName);
    propertyName = created.name;
    console.log(`Created property ${propertyName}`);
  }

  let measurementId = plan.dataStream.measurementId;
  if (plan.dataStream.action === "create") {
    const created = await createDataStream(client, propertyName, plan.hostname, plan.streamUri);
    measurementId = created.webStreamData?.measurementId ?? null;
    console.log(`Created data stream ${created.name} (${measurementId})`);
  }

  if (plan.bigQueryLink.action === "create") {
    const created = await createBigQueryLink(client, propertyName, plan.bigQueryLink.project, plan.bigQueryLink.datasetLocation);
    console.log(`Created BigQuery link ${created.name}`);
  }

  if (measurementId && plan.githubVariable.action !== "noop") {
    setGithubVariable(plan.environment, measurementId);
    console.log(`Set ${GITHUB_VARIABLE_NAME}=${measurementId} on GitHub environment "${plan.environment}"`);
  }
}

export async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const credentialsJson = await resolveServiceAccountCredentialsJson({
    jsonEnvVar: "GA4_SERVICE_ACCOUNT_JSON",
    arnEnvVar: "GA4_SERVICE_ACCOUNT_ARN",
  });

  const client = await createGoogleAuthorizedClient(credentialsJson, [ANALYTICS_EDIT_SCOPE, CLOUD_PLATFORM_READONLY_SCOPE]);

  console.log(`Reading current GA4 state for "${GA4_ACCOUNT_DISPLAY_NAME}"${opts.dryRun ? " (dry run)" : ""}...`);

  const account = await findAccount(client);
  if (!account) {
    throw new Error(`No GA4 account named "${GA4_ACCOUNT_DISPLAY_NAME}" is visible to this service account`);
  }

  const properties = await listProperties(client, account.name);
  const displayName = displayNameForEnvironment(opts.environment);
  const existingProperty = properties.find((p) => p.displayName === displayName && !p.deleteTime);

  const dataStreams = existingProperty ? await listDataStreams(client, existingProperty.name) : [];
  const bigQueryLinks = existingProperty ? await listBigQueryLinks(client, existingProperty.name) : [];
  const projectNumber = await resolveProjectNumber(client, GA4_BIGQUERY_PROJECT_ID);
  const currentGithubVariableValue = readGithubVariable(opts.environment);

  const plan = buildPlan({
    environment: opts.environment,
    hostname: opts.hostname,
    account,
    properties,
    dataStreams,
    bigQueryLinks,
    projectNumber,
    currentGithubVariableValue,
  });

  printPlan(plan, opts.dryRun);

  if (opts.dryRun) {
    return plan;
  }

  await applyPlan(client, plan);
  return plan;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("GA4 property sync failed:", err.message);
    process.exit(1);
  });
}
