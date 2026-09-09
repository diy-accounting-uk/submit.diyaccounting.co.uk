#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/ga4-bigquery-sync.js
//
// Reads analytics/ga4-bigquery.toml, lists the live ga4_daily dataset and its BigQuery Data
// Transfer scheduled queries, diffs them against what the file declares, and creates or
// updates the difference. Read-only and prints the plan unless --apply is given.
//
// Each query in the file becomes one BigQuery Data Transfer "scheduled_query" config: it runs
// on its own schedule, writes one day of GA4's events_* export into one table in the ga4_daily
// dataset, and replaces that day's partition on every run (WRITE_TRUNCATE with a
// partitioning_field), so a rerun for the same day is safe.
//
// Usage:
//   GA4_SERVICE_ACCOUNT_JSON=... (or GA4_SERVICE_ACCOUNT_ARN with AWS credentials) \
//     node scripts/ga4-bigquery-sync.js [--apply]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import TOML from "@iarna/toml";

import { createGoogleAuthorizedClient, resolveServiceAccountCredentialsJson } from "./lib/googleAuth.js";

const BIGQUERY_V2 = "https://bigquery.googleapis.com/bigquery/v2";
const DATA_TRANSFER_V1 = "https://bigquerydatatransfer.googleapis.com/v1";
const BIGQUERY_SCOPE = "https://www.googleapis.com/auth/bigquery";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export const CONFIG_PATH = "analytics/ga4-bigquery.toml";

export function parseArgs(argv) {
  const opts = { apply: false };
  for (const arg of argv) {
    if (arg === "--apply") opts.apply = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

/**
 * Parse and validate analytics/ga4-bigquery.toml's content. Pure and file-system free so it
 * can be unit tested with fixtures; sql text is read separately by `loadQueries`.
 *
 * @param {string} tomlString
 * @returns {{dataset: {projectId: string, datasetId: string, location: string, description: string},
 *   queries: {name: string, panel: string, description: string, sqlFile: string,
 *     destinationTable: string, partitionField: string, writeDisposition: string, schedule: string}[]}}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const rawDataset = parsed.dataset;
  if (!rawDataset?.project_id || !rawDataset?.dataset_id || !rawDataset?.location) {
    throw new Error("ga4-bigquery.toml is missing [dataset].project_id, .dataset_id or .location");
  }
  const dataset = {
    projectId: rawDataset.project_id,
    datasetId: rawDataset.dataset_id,
    location: rawDataset.location,
    description: rawDataset.description ?? "",
  };

  const queries = (parsed.queries ?? []).map((entry) => {
    const required = ["name", "sql_file", "destination_table", "partition_field", "write_disposition", "schedule"];
    for (const key of required) {
      if (!entry[key]) {
        throw new Error(`Invalid [[queries]] entry, missing "${key}": ${JSON.stringify(entry)}`);
      }
    }
    return {
      name: entry.name,
      panel: entry.panel ?? "",
      description: entry.description ?? "",
      sqlFile: entry.sql_file,
      destinationTable: entry.destination_table,
      partitionField: entry.partition_field,
      writeDisposition: entry.write_disposition,
      schedule: entry.schedule,
    };
  });

  const names = new Set();
  for (const query of queries) {
    if (names.has(query.name)) {
      throw new Error(`Duplicate query name in ga4-bigquery.toml: ${query.name}`);
    }
    names.add(query.name);
  }

  return { dataset, queries };
}

/**
 * Read each query's sql file relative to the repo root, attaching its text to the parsed
 * config's query entries.
 *
 * @param {ReturnType<typeof parseConfig>} config
 * @param {string} repoRoot
 * @returns {(ReturnType<typeof parseConfig>["queries"][number] & {sql: string})[]}
 */
export function loadQueries(config, repoRoot) {
  return config.queries.map((query) => ({
    ...query,
    sql: fs.readFileSync(path.join(repoRoot, query.sqlFile), "utf-8").trim(),
  }));
}

/**
 * Build the sync plan from the current BigQuery state. Pure and network-free so it can be unit
 * tested with fixtures: every "would create" / "would update" / "already in sync" decision
 * lives here, not scattered across the network calls in `main`.
 *
 * @param {object} input
 * @param {ReturnType<typeof parseConfig>["dataset"]} input.dataset
 * @param {(ReturnType<typeof parseConfig>["queries"][number] & {sql: string})[]} input.queries
 * @param {boolean} input.datasetExists
 * @param {{displayName: string, name: string, params: {query?: string, destination_table_name_template?: string,
 *   write_disposition?: string, partitioning_field?: string}, schedule?: string}[]} [input.transferConfigs]
 *   - the project's live scheduled_query transfer configs, in any dataset
 * @returns {{dataset: object, queries: object[]}}
 */
export function buildPlan({ dataset, queries, datasetExists, transferConfigs = [] }) {
  const datasetPlan = datasetExists
    ? { action: "noop", projectId: dataset.projectId, datasetId: dataset.datasetId }
    : { action: "create", projectId: dataset.projectId, datasetId: dataset.datasetId, location: dataset.location };

  const queryPlans = queries.map((query) => {
    const existing = transferConfigs.find((config) => config.displayName === query.name);
    if (!existing) {
      return { action: "create", name: query.name, panel: query.panel, destinationTable: query.destinationTable, schedule: query.schedule };
    }
    const inSync =
      existing.params?.query === query.sql &&
      existing.params?.destination_table_name_template === query.destinationTable &&
      existing.params?.write_disposition === query.writeDisposition &&
      existing.params?.partitioning_field === query.partitionField &&
      existing.schedule === query.schedule;
    return {
      action: inSync ? "noop" : "update",
      name: query.name,
      panel: query.panel,
      destinationTable: query.destinationTable,
      schedule: query.schedule,
      transferConfigName: existing.name,
    };
  });

  return { dataset: datasetPlan, queries: queryPlans };
}

function printPlan(plan, apply) {
  const tag = apply ? "" : "[dry-run] ";
  console.log(`\n=== GA4 in BigQuery sync${apply ? "" : " (dry run)"} ===`);

  console.log(`Dataset ${plan.dataset.projectId}.${plan.dataset.datasetId}:`);
  console.log(plan.dataset.action === "noop" ? "  already exists" : `  ${tag}would create (${plan.dataset.location})`);

  for (const query of plan.queries) {
    console.log(`Scheduled query "${query.name}" -> ${query.destinationTable} (${query.panel}):`);
    if (query.action === "noop") {
      console.log(`  already in sync: ${query.transferConfigName}`);
    } else if (query.action === "update") {
      console.log(`  ${tag}would update: ${query.transferConfigName} (schedule "${query.schedule}")`);
    } else {
      console.log(`  ${tag}would create (schedule "${query.schedule}")`);
    }
  }
  console.log("");
}

async function checkDatasetExists(client, projectId, datasetId) {
  try {
    await client.request({ url: `${BIGQUERY_V2}/projects/${projectId}/datasets/${datasetId}` });
    return true;
  } catch (error) {
    if (error.code === 404 || error.response?.status === 404) return false;
    throw error;
  }
}

async function createDataset(client, dataset) {
  await client.request({
    url: `${BIGQUERY_V2}/projects/${dataset.projectId}/datasets`,
    method: "POST",
    data: {
      datasetReference: { projectId: dataset.projectId, datasetId: dataset.datasetId },
      location: dataset.location,
      description: dataset.description,
    },
  });
}

async function listTransferConfigs(client, projectId, location) {
  const configs = [];
  let pageToken;
  do {
    const { data } = await client.request({
      url: `${DATA_TRANSFER_V1}/projects/${projectId}/locations/${location}/transferConfigs`,
      params: { dataSourceIds: "scheduled_query", ...(pageToken ? { pageToken } : {}) },
    });
    configs.push(...(data.transferConfigs ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return configs;
}

function transferConfigBody(dataset, query) {
  return {
    displayName: query.name,
    dataSourceId: "scheduled_query",
    destinationDatasetId: dataset.datasetId,
    schedule: query.schedule,
    params: {
      query: query.sql,
      destination_table_name_template: query.destinationTable,
      write_disposition: query.writeDisposition,
      partitioning_field: query.partitionField,
    },
  };
}

async function createTransferConfig(client, projectId, location, dataset, query) {
  const { data } = await client.request({
    url: `${DATA_TRANSFER_V1}/projects/${projectId}/locations/${location}/transferConfigs`,
    method: "POST",
    data: transferConfigBody(dataset, query),
  });
  return data;
}

async function updateTransferConfig(client, transferConfigName, dataset, query) {
  const { data } = await client.request({
    url: `${DATA_TRANSFER_V1}/${transferConfigName}`,
    method: "PATCH",
    params: { updateMask: "schedule,params" },
    data: transferConfigBody(dataset, query),
  });
  return data;
}

async function applyPlan(client, plan, dataset, queriesByName) {
  if (plan.dataset.action === "create") {
    await createDataset(client, dataset);
    console.log(`Created dataset ${dataset.projectId}.${dataset.datasetId}`);
  }

  for (const queryPlan of plan.queries) {
    if (queryPlan.action === "noop") continue;
    const query = queriesByName.get(queryPlan.name);
    if (queryPlan.action === "create") {
      const created = await createTransferConfig(client, dataset.projectId, dataset.location, dataset, query);
      console.log(`Created scheduled query ${created.name} for "${queryPlan.name}"`);
    } else {
      await updateTransferConfig(client, queryPlan.transferConfigName, dataset, query);
      console.log(`Updated scheduled query ${queryPlan.transferConfigName} for "${queryPlan.name}"`);
    }
  }
}

export async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();

  const config = parseConfig(fs.readFileSync(path.join(repoRoot, CONFIG_PATH), "utf-8"));
  const queries = loadQueries(config, repoRoot);
  const queriesByName = new Map(queries.map((query) => [query.name, query]));

  const credentialsJson = await resolveServiceAccountCredentialsJson({
    jsonEnvVar: "GA4_SERVICE_ACCOUNT_JSON",
    arnEnvVar: "GA4_SERVICE_ACCOUNT_ARN",
  });
  const client = await createGoogleAuthorizedClient(credentialsJson, [BIGQUERY_SCOPE, CLOUD_PLATFORM_SCOPE]);

  console.log(`Reading current BigQuery state for ${config.dataset.projectId}${opts.apply ? "" : " (dry run)"}...`);

  const datasetExists = await checkDatasetExists(client, config.dataset.projectId, config.dataset.datasetId);
  const transferConfigs = await listTransferConfigs(client, config.dataset.projectId, config.dataset.location);

  const plan = buildPlan({ dataset: config.dataset, queries, datasetExists, transferConfigs });
  printPlan(plan, opts.apply);

  if (!opts.apply) {
    return plan;
  }

  await applyPlan(client, plan, config.dataset, queriesByName);
  return plan;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("GA4 BigQuery sync failed:", err.message);
    process.exit(1);
  });
}
