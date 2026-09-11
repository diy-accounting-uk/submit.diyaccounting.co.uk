#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/ga4-sync.js
//
// Idempotent GA4 setup over google/analytics.toml, for every property the file declares: the
// shared "DIY Accounting" property (523400333, covering gateway/spreadsheets/submit) and each
// per-environment "DIY Accounting Submit (ci|prod)" property. One pass finds or creates each
// property, its data streams, its enhanced measurement settings, its key events and its
// BigQuery link, then writes SUBMIT_GA4_MEASUREMENT_ID onto the matching GitHub Environment for
// any property that declares one.
//
// A property recorded with an `id` must already exist live: the script fails rather than
// creating a second one when that id can't be found, or when a stream's recorded
// `measurement_id` doesn't match what's live. A property with no `id` is matched by
// `display_name` and created when missing.
//
// Usage:
//   GA4_SERVICE_ACCOUNT_JSON=... (or GA4_SERVICE_ACCOUNT_ARN with AWS credentials) node scripts/ga4-sync.js
//   node scripts/ga4-sync.js --apply
//
// Options:
//   --apply    Write the differences. Without it, the script only reads live state and prints
//              the plan.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import TOML from "@iarna/toml";

import { createGoogleAuthorizedClient, resolveServiceAccountCredentialsJson } from "./lib/googleAuth.js";

export const GITHUB_VARIABLE_NAME = "SUBMIT_GA4_MEASUREMENT_ID";
export const CONFIG_PATH = "google/analytics.toml";

const ANALYTICS_ADMIN_V1BETA = "https://analyticsadmin.googleapis.com/v1beta";
// BigQuery links, key events and enhanced measurement settings are v1alpha-only resources on
// the Analytics Admin API; they have not graduated to v1beta.
const ANALYTICS_ADMIN_V1ALPHA = "https://analyticsadmin.googleapis.com/v1alpha";
const CLOUD_RESOURCE_MANAGER_V3 = "https://cloudresourcemanager.googleapis.com/v3";

const ANALYTICS_EDIT_SCOPE = "https://www.googleapis.com/auth/analytics.edit";
const CLOUD_PLATFORM_READONLY_SCOPE = "https://www.googleapis.com/auth/cloud-platform.read-only";
const DEFAULT_COUNTING_METHOD = "ONCE_PER_EVENT";

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

// --- Config: google/analytics.toml -> { account, properties } ---

function normalizeStream(entry, propertyDisplayName) {
  if (!entry.name || !entry.uri) {
    throw new Error(`[[property.stream]] entry under "${propertyDisplayName}" is missing name or uri: ${JSON.stringify(entry)}`);
  }
  return {
    name: entry.name,
    uri: entry.uri,
    measurementId: entry.measurement_id ? String(entry.measurement_id) : null,
    enhancedMeasurement: entry.enhanced_measurement ?? null,
  };
}

function normalizeProperty(entry) {
  if (!entry.display_name) {
    throw new Error(`[[property]] entry is missing display_name: ${JSON.stringify(entry)}`);
  }
  const streams = (entry.stream ?? []).map((s) => normalizeStream(s, entry.display_name));
  if (streams.length === 0) {
    throw new Error(`property "${entry.display_name}" has no [[property.stream]] entries`);
  }
  const bigQueryLink = entry.bigquery_link
    ? {
        project: entry.bigquery_link.project,
        location: entry.bigquery_link.location,
        dailyExport: entry.bigquery_link.daily_export ?? false,
        streamingExport: entry.bigquery_link.streaming_export ?? false,
      }
    : null;
  return {
    id: entry.id ? String(entry.id) : null,
    displayName: entry.display_name,
    timeZone: entry.time_zone ?? null,
    currency: entry.currency ?? null,
    githubEnvironment: entry.github_environment ?? null,
    keyEvents: entry.key_events ?? null,
    streams,
    bigQueryLink,
  };
}

/**
 * Parse and validate google/analytics.toml's content.
 *
 * @param {string} tomlString
 * @returns {{account: {id: string, displayName: string}, properties: object[]}}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const account = parsed.account;
  if (!account?.id || !account?.display_name) {
    throw new Error("analytics.toml is missing [account].id or display_name");
  }
  const properties = (parsed.property ?? []).map(normalizeProperty);
  if (properties.length === 0) {
    throw new Error("analytics.toml has no [[property]] entries");
  }
  return { account: { id: String(account.id), displayName: account.display_name }, properties };
}

export function loadConfigFromRoot() {
  const filePath = path.join(process.cwd(), CONFIG_PATH);
  return parseConfig(fs.readFileSync(filePath, "utf-8"));
}

// --- Pure planning. Network-free, unit tested with fixtures. ---

/**
 * Match a configured property against the account's live properties (trashed ones excluded).
 * A recorded `id` must match a live property's numeric id or the script fails outright — a
 * mismatch here means the file is wrong, not that a new property should be created. A property
 * with no `id` is matched by display_name, returning null (not found) when there isn't one, so
 * the caller can plan to create it.
 *
 * @param {{id: string|null, displayName: string}} configProperty
 * @param {Array<{name: string, displayName: string, deleteTime?: string}>} liveProperties
 * @returns {{name: string, displayName: string}|null}
 */
export function matchProperty(configProperty, liveProperties) {
  const live = liveProperties.filter((p) => !p.deleteTime);
  if (configProperty.id) {
    const found = live.find((p) => p.name === `properties/${configProperty.id}`);
    if (!found) {
      throw new Error(`analytics.toml records id ${configProperty.id} for property "${configProperty.displayName}", but no live property with that id was found`);
    }
    return found;
  }
  return live.find((p) => p.displayName === configProperty.displayName) ?? null;
}

/**
 * Match one configured stream against a property's live data streams. A recorded
 * `measurement_id` must match a live stream or the script fails, the same reasoning as
 * matchProperty: a mismatch means the file is wrong. A stream with no `measurement_id` is
 * matched by its uri; not found means "not created yet".
 *
 * @param {{name: string, uri: string, measurementId: string|null}} configStream
 * @param {Array<{name: string, webStreamData?: {defaultUri?: string, measurementId?: string}}>} liveStreams
 * @returns {{action: "noop"|"create", name: string|null, uri: string, measurementId: string|null}}
 */
export function buildStreamPlan(configStream, liveStreams = []) {
  const byUri = liveStreams.find((s) => s.webStreamData?.defaultUri === configStream.uri);

  if (configStream.measurementId) {
    const byMeasurementId = liveStreams.find((s) => s.webStreamData?.measurementId === configStream.measurementId);
    if (!byMeasurementId) {
      throw new Error(
        `analytics.toml records measurement_id ${configStream.measurementId} for stream "${configStream.name}" (${configStream.uri}), but no live stream has it` +
          (byUri ? ` (the live stream at that uri is ${byUri.webStreamData?.measurementId})` : ""),
      );
    }
    return { action: "noop", name: byMeasurementId.name, uri: configStream.uri, measurementId: byMeasurementId.webStreamData?.measurementId ?? null };
  }

  return byUri
    ? { action: "noop", name: byUri.name, uri: configStream.uri, measurementId: byUri.webStreamData?.measurementId ?? null }
    : { action: "create", name: null, uri: configStream.uri, measurementId: null };
}

/**
 * Decide whether a stream's enhanced measurement setting needs writing. Skips when the file
 * doesn't declare one (the setting is left as whatever it already is) or when the stream itself
 * is still pending creation.
 *
 * The exact JSON field the v1alpha `enhancedMeasurementSettings` resource uses for this master
 * on/off switch (modelled here as `streamEnabled`) has not been confirmed against a live
 * response; check it with a dry run before relying on the network path.
 *
 * @param {{enhancedMeasurement: boolean|null}} configStream
 * @param {{action: string}} streamPlan
 * @param {{streamEnabled?: boolean}|undefined} liveSettings
 */
export function buildEnhancedMeasurementPlan(configStream, streamPlan, liveSettings) {
  if (configStream.enhancedMeasurement === null || streamPlan.action === "create") {
    return { action: "skip" };
  }
  const live = liveSettings?.streamEnabled === true;
  return live === configStream.enhancedMeasurement ? { action: "noop" } : { action: "update", streamEnabled: configStream.enhancedMeasurement };
}

/**
 * Group a {label: eventName} map by event name, since two labels can share one GA4 event (e.g.
 * "purchase" fires for both subscribe and donate).
 *
 * @param {Record<string, string>} keyEvents
 * @returns {Map<string, string[]>}
 */
export function groupKeyEventsByName(keyEvents) {
  const byEventName = new Map();
  for (const [label, eventName] of Object.entries(keyEvents)) {
    const labels = byEventName.get(eventName) ?? [];
    labels.push(label);
    byEventName.set(eventName, labels);
  }
  return byEventName;
}

/**
 * @param {Record<string, string>} keyEvents - label -> GA4 event name, from analytics.toml
 * @param {Array<{name: string, eventName: string}>} [existingKeyEvents]
 * @returns {Array<{eventName: string, labels: string[], action: "noop"|"create", existingName?: string}>}
 */
export function buildKeyEventPlan(keyEvents, existingKeyEvents = []) {
  const existingByEventName = new Map(existingKeyEvents.map((event) => [event.eventName, event]));
  const desired = groupKeyEventsByName(keyEvents);
  return Array.from(desired.entries()).map(([eventName, labels]) => {
    const existing = existingByEventName.get(eventName);
    return existing ? { eventName, labels, action: "noop", existingName: existing.name } : { eventName, labels, action: "create" };
  });
}

/**
 * Pull the list of links out of a bigQueryLinks response body. The Analytics Admin API names
 * this field "bigqueryLinks" (lowercase q) in the JSON body, unlike the "bigQueryLinks" resource
 * path segment used to fetch it — reading the wrong case silently returns an empty list, which
 * reads exactly like "no link exists yet" and proposes creating a second one.
 *
 * @param {object} data
 * @returns {Array<{name: string, project?: string, datasetLocation?: string, dailyExportEnabled?: boolean, streamingExportEnabled?: boolean}>}
 */
export function extractBigQueryLinks(data) {
  return data.bigqueryLinks || [];
}

function projectMatches(linkProject, { projectId, projectNumber }) {
  if (!linkProject) return false;
  if (linkProject === `projects/${projectId}`) return true;
  return Boolean(projectNumber) && linkProject === `projects/${projectNumber}`;
}

/**
 * @param {{project: string, location: string, dailyExport: boolean, streamingExport: boolean}|null} configLink
 * @param {Array<object>} [liveLinks]
 * @param {string|null} [projectNumber]
 */
export function buildBigQueryLinkPlan(configLink, liveLinks = [], projectNumber = null) {
  if (!configLink) return { action: "skip" };
  const existing = liveLinks.find((link) => projectMatches(link.project, { projectId: configLink.project, projectNumber }));
  if (!existing) {
    return { action: "create", name: null, project: configLink.project, location: configLink.location, dailyExport: configLink.dailyExport, streamingExport: configLink.streamingExport };
  }
  const inSync =
    existing.datasetLocation === configLink.location &&
    existing.dailyExportEnabled === configLink.dailyExport &&
    existing.streamingExportEnabled === configLink.streamingExport;
  return inSync
    ? { action: "noop", name: existing.name }
    : { action: "update", name: existing.name, location: configLink.location, dailyExport: configLink.dailyExport, streamingExport: configLink.streamingExport };
}

/**
 * @param {{githubEnvironment: string|null}} input
 * @param {string|null} input.measurementId - the designated stream's measurement id, once known
 * @param {string|null} input.currentValue - the value already on the GitHub Environment
 */
export function buildGithubVariablePlan({ githubEnvironment, measurementId, currentValue }) {
  if (!githubEnvironment) return { action: "skip" };
  if (!measurementId) {
    return { action: "pending", name: GITHUB_VARIABLE_NAME, environment: githubEnvironment, value: null, previousValue: currentValue };
  }
  return currentValue === measurementId
    ? { action: "noop", name: GITHUB_VARIABLE_NAME, environment: githubEnvironment, value: measurementId }
    : { action: "set", name: GITHUB_VARIABLE_NAME, environment: githubEnvironment, value: measurementId, previousValue: currentValue };
}

/**
 * Build the full plan for one configured property: the property itself, each of its streams
 * (with enhanced measurement), its key events, its BigQuery link, and the GitHub variable a
 * per-environment property writes. Pure and network-free so it can be unit tested with
 * fixtures — every "would create" / "would update" / "already in sync" decision lives here.
 *
 * @param {object} input
 * @param {object} input.configProperty - one normalized entry from parseConfig
 * @param {{name: string, displayName: string}|null} input.liveProperty
 * @param {Array<object>} [input.liveStreams]
 * @param {Array<object>} [input.liveBigQueryLinks]
 * @param {Array<object>} [input.liveKeyEvents]
 * @param {Record<string, object>} [input.liveEnhancedMeasurementByStreamName]
 * @param {string|null} [input.projectNumber]
 * @param {string|null} [input.currentGithubVariableValue]
 */
export function buildPropertyPlan({
  configProperty,
  liveProperty,
  liveStreams = [],
  liveBigQueryLinks = [],
  liveKeyEvents = [],
  liveEnhancedMeasurementByStreamName = {},
  projectNumber = null,
  currentGithubVariableValue = null,
}) {
  const propertyPlan = liveProperty
    ? { action: "noop", name: liveProperty.name, displayName: configProperty.displayName }
    : { action: "create", name: null, displayName: configProperty.displayName };
  const propertyPending = propertyPlan.action === "create";

  const streamPlans = configProperty.streams.map((configStream) => {
    const plan = propertyPending
      ? { action: "create", name: null, uri: configStream.uri, measurementId: null, blockedOnProperty: true }
      : buildStreamPlan(configStream, liveStreams);
    const enhancedMeasurement = buildEnhancedMeasurementPlan(configStream, plan, liveEnhancedMeasurementByStreamName[plan.name]);
    return { config: configStream, plan, enhancedMeasurement };
  });

  const keyEventPlan = configProperty.keyEvents ? buildKeyEventPlan(configProperty.keyEvents, liveKeyEvents) : null;

  const bigQueryLinkPlan = propertyPending
    ? configProperty.bigQueryLink
      ? {
          action: "create",
          name: null,
          project: configProperty.bigQueryLink.project,
          location: configProperty.bigQueryLink.location,
          dailyExport: configProperty.bigQueryLink.dailyExport,
          streamingExport: configProperty.bigQueryLink.streamingExport,
          blockedOnProperty: true,
        }
      : { action: "skip" }
    : buildBigQueryLinkPlan(configProperty.bigQueryLink, liveBigQueryLinks, projectNumber);

  // The GitHub variable takes its measurement id from the property's one designated stream —
  // every per-environment property (the only kind that declares github_environment) has exactly
  // one. The shared property has no github_environment, so this plan is always "skip" for it.
  const designatedStreamPlan = streamPlans[0]?.plan;
  const githubVariablePlan = buildGithubVariablePlan({
    githubEnvironment: configProperty.githubEnvironment,
    measurementId: designatedStreamPlan?.measurementId ?? null,
    currentValue: currentGithubVariableValue,
  });

  return {
    displayName: configProperty.displayName,
    property: propertyPlan,
    streams: streamPlans,
    keyEvents: keyEventPlan,
    bigQueryLink: bigQueryLinkPlan,
    githubVariable: githubVariablePlan,
  };
}

// --- Reporting ---

function printPropertyPlan(plan, dryRun) {
  const tag = dryRun ? "[dry-run] " : "";
  console.log(`\n=== GA4 sync: "${plan.displayName}"${dryRun ? " (dry run)" : ""} ===`);
  console.log(plan.property.action === "noop" ? `Property: already exists (${plan.property.name})` : `Property: ${tag}would create`);

  for (const { config, plan: streamPlan, enhancedMeasurement } of plan.streams) {
    if (streamPlan.action === "noop") {
      console.log(`Stream "${config.name}" (${config.uri}): already exists, measurement id ${streamPlan.measurementId}`);
    } else {
      console.log(`Stream "${config.name}" (${config.uri}): ${tag}would create${streamPlan.blockedOnProperty ? " (after the property is created)" : ""}`);
    }
    if (enhancedMeasurement.action === "update") {
      console.log(`  enhanced measurement: ${tag}would set streamEnabled=${enhancedMeasurement.streamEnabled}`);
    } else if (enhancedMeasurement.action === "noop") {
      console.log("  enhanced measurement: already matches");
    }
  }

  if (plan.keyEvents) {
    for (const item of plan.keyEvents) {
      const labelList = item.labels.join(", ");
      console.log(
        item.action === "noop"
          ? `Key event "${item.eventName}" (${labelList}): already exists (${item.existingName})`
          : `Key event "${item.eventName}" (${labelList}): ${tag}would create`,
      );
    }
  }

  if (plan.bigQueryLink.action !== "skip") {
    if (plan.bigQueryLink.action === "noop") {
      console.log(`BigQuery link: already in sync (${plan.bigQueryLink.name})`);
    } else if (plan.bigQueryLink.action === "update") {
      console.log(`BigQuery link: ${tag}would update (${plan.bigQueryLink.name})`);
    } else {
      console.log(`BigQuery link: ${tag}would create${plan.bigQueryLink.blockedOnProperty ? " (after the property is created)" : ""}`);
    }
  }

  if (plan.githubVariable.action !== "skip") {
    if (plan.githubVariable.action === "noop") {
      console.log(`GitHub variable ${GITHUB_VARIABLE_NAME} (${plan.githubVariable.environment}): already set to ${plan.githubVariable.value}`);
    } else if (plan.githubVariable.action === "set") {
      console.log(`GitHub variable ${GITHUB_VARIABLE_NAME} (${plan.githubVariable.environment}): ${tag}would set to ${plan.githubVariable.value}`);
    } else {
      console.log(`GitHub variable ${GITHUB_VARIABLE_NAME} (${plan.githubVariable.environment}): pending, measurement id not known yet`);
    }
  }
}

// --- Network calls. Not covered by the unit tests (decision logic only, no network). ---

async function findAccount(client, configAccount) {
  const { data } = await client.request({ url: `${ANALYTICS_ADMIN_V1BETA}/accounts` });
  const account = (data.accounts || []).find((a) => a.name === `accounts/${configAccount.id}`);
  if (!account) {
    throw new Error(`No GA4 account with id ${configAccount.id} ("${configAccount.displayName}") is visible to this service account`);
  }
  return account;
}

async function listProperties(client, accountName) {
  const { data } = await client.request({ url: `${ANALYTICS_ADMIN_V1BETA}/properties`, params: { filter: `parent:${accountName}` } });
  return data.properties || [];
}

async function listDataStreams(client, propertyName) {
  const { data } = await client.request({ url: `${ANALYTICS_ADMIN_V1BETA}/${propertyName}/dataStreams` });
  return data.dataStreams || [];
}

async function listBigQueryLinks(client, propertyName) {
  const { data } = await client.request({ url: `${ANALYTICS_ADMIN_V1ALPHA}/${propertyName}/bigQueryLinks` });
  return extractBigQueryLinks(data);
}

async function listKeyEvents(client, propertyName) {
  const { data } = await client.request({ url: `${ANALYTICS_ADMIN_V1ALPHA}/${propertyName}/keyEvents` });
  return data.keyEvents || [];
}

async function loadEnhancedMeasurementSettings(client, liveStreams) {
  const byStreamName = {};
  for (const stream of liveStreams) {
    try {
      const { data } = await client.request({ url: `${ANALYTICS_ADMIN_V1ALPHA}/${stream.name}/enhancedMeasurementSettings` });
      byStreamName[stream.name] = data;
    } catch (error) {
      console.warn(`Could not read enhanced measurement settings for ${stream.name}: ${error.message}`);
    }
  }
  return byStreamName;
}

async function resolveProjectNumber(client, projectId) {
  try {
    const { data } = await client.request({ url: `${CLOUD_RESOURCE_MANAGER_V3}/projects/${projectId}` });
    return data.name?.split("/")[1] ?? null;
  } catch (error) {
    console.warn(`Could not resolve the project number for ${projectId}: ${error.message}`);
    return null;
  }
}

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

async function createProperty(client, accountName, configProperty) {
  const { data } = await client.request({
    url: `${ANALYTICS_ADMIN_V1BETA}/properties`,
    method: "POST",
    data: { parent: accountName, displayName: configProperty.displayName, timeZone: configProperty.timeZone ?? "Europe/London", currencyCode: configProperty.currency ?? "GBP" },
  });
  return data;
}

async function createDataStream(client, propertyName, configStream) {
  const { data } = await client.request({
    url: `${ANALYTICS_ADMIN_V1BETA}/${propertyName}/dataStreams`,
    method: "POST",
    data: { type: "WEB_DATA_STREAM", displayName: configStream.name, webStreamData: { defaultUri: configStream.uri } },
  });
  return data;
}

async function updateEnhancedMeasurementSettings(client, streamName, streamEnabled) {
  await client.request({
    url: `${ANALYTICS_ADMIN_V1ALPHA}/${streamName}/enhancedMeasurementSettings`,
    method: "PATCH",
    params: { updateMask: "streamEnabled" },
    data: { streamEnabled },
  });
}

async function createKeyEvent(client, propertyName, eventName) {
  const { data } = await client.request({
    url: `${ANALYTICS_ADMIN_V1ALPHA}/${propertyName}/keyEvents`,
    method: "POST",
    data: { eventName, countingMethod: DEFAULT_COUNTING_METHOD },
  });
  return data;
}

async function createBigQueryLink(client, propertyName, plan) {
  const { data } = await client.request({
    url: `${ANALYTICS_ADMIN_V1ALPHA}/${propertyName}/bigQueryLinks`,
    method: "POST",
    data: { project: `projects/${plan.project}`, datasetLocation: plan.location, dailyExportEnabled: plan.dailyExport, streamingExportEnabled: plan.streamingExport },
  });
  return data;
}

async function updateBigQueryLink(client, plan) {
  await client.request({
    url: `${ANALYTICS_ADMIN_V1ALPHA}/${plan.name}`,
    method: "PATCH",
    params: { updateMask: "datasetLocation,dailyExportEnabled,streamingExportEnabled" },
    data: { datasetLocation: plan.location, dailyExportEnabled: plan.dailyExport, streamingExportEnabled: plan.streamingExport },
  });
}

async function applyPropertyPlan(client, plan, accountName) {
  let propertyName = plan.property.name;
  if (plan.property.action === "create") {
    const created = await createProperty(client, accountName, { displayName: plan.displayName });
    propertyName = created.name;
    console.log(`Created property ${propertyName}`);
  }

  for (const { config, plan: streamPlan, enhancedMeasurement } of plan.streams) {
    let streamName = streamPlan.name;
    if (streamPlan.action === "create") {
      const created = await createDataStream(client, propertyName, config);
      streamName = created.name;
      console.log(`Created data stream ${streamName} (${created.webStreamData?.measurementId})`);
    }
    if (enhancedMeasurement.action === "update") {
      await updateEnhancedMeasurementSettings(client, streamName, enhancedMeasurement.streamEnabled);
      console.log(`Set enhanced measurement streamEnabled=${enhancedMeasurement.streamEnabled} on ${streamName}`);
    }
  }

  if (plan.keyEvents) {
    for (const item of plan.keyEvents.filter((entry) => entry.action === "create")) {
      const created = await createKeyEvent(client, propertyName, item.eventName);
      console.log(`Created key event ${created.name} (${item.eventName})`);
    }
  }

  if (plan.bigQueryLink.action === "create") {
    const created = await createBigQueryLink(client, propertyName, plan.bigQueryLink);
    console.log(`Created BigQuery link ${created.name}`);
  } else if (plan.bigQueryLink.action === "update") {
    await updateBigQueryLink(client, plan.bigQueryLink);
    console.log(`Updated BigQuery link ${plan.bigQueryLink.name}`);
  }

  if (plan.githubVariable.action === "set") {
    setGithubVariable(plan.githubVariable.environment, plan.githubVariable.value);
    console.log(`Set ${GITHUB_VARIABLE_NAME}=${plan.githubVariable.value} on GitHub environment "${plan.githubVariable.environment}"`);
  }
}

export async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const config = loadConfigFromRoot();

  const credentialsJson = await resolveServiceAccountCredentialsJson({ jsonEnvVar: "GA4_SERVICE_ACCOUNT_JSON", arnEnvVar: "GA4_SERVICE_ACCOUNT_ARN" });
  const client = await createGoogleAuthorizedClient(credentialsJson, [ANALYTICS_EDIT_SCOPE, CLOUD_PLATFORM_READONLY_SCOPE]);

  console.log(`Reading current GA4 state for account ${config.account.id} ("${config.account.displayName}")${opts.apply ? "" : " (dry run)"}...`);

  const account = await findAccount(client, config.account);
  const liveProperties = await listProperties(client, account.name);

  const bigQueryProjectIds = new Set(config.properties.filter((p) => p.bigQueryLink).map((p) => p.bigQueryLink.project));
  const projectNumbersById = {};
  for (const projectId of bigQueryProjectIds) {
    projectNumbersById[projectId] = await resolveProjectNumber(client, projectId);
  }

  const plans = [];
  for (const configProperty of config.properties) {
    const liveProperty = matchProperty(configProperty, liveProperties);
    const liveStreams = liveProperty ? await listDataStreams(client, liveProperty.name) : [];
    const liveBigQueryLinks = liveProperty ? await listBigQueryLinks(client, liveProperty.name) : [];
    const liveKeyEvents = liveProperty && configProperty.keyEvents ? await listKeyEvents(client, liveProperty.name) : [];
    const liveEnhancedMeasurementByStreamName = liveProperty ? await loadEnhancedMeasurementSettings(client, liveStreams) : {};
    const currentGithubVariableValue = configProperty.githubEnvironment ? readGithubVariable(configProperty.githubEnvironment) : null;
    const projectNumber = configProperty.bigQueryLink ? (projectNumbersById[configProperty.bigQueryLink.project] ?? null) : null;

    const plan = buildPropertyPlan({
      configProperty,
      liveProperty,
      liveStreams,
      liveBigQueryLinks,
      liveKeyEvents,
      liveEnhancedMeasurementByStreamName,
      projectNumber,
      currentGithubVariableValue,
    });
    plans.push(plan);
    printPropertyPlan(plan, !opts.apply);

    if (opts.apply) {
      await applyPropertyPlan(client, plan, account.name);
    }
  }

  return plans;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("GA4 sync failed:", err.message);
    process.exit(1);
  });
}
