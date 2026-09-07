#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/ga4-bigquery-link-export.js
//
// Reads the BigQuery link(s) for one GA4 property and, on request, turns its streaming
// and/or daily export on or off. This is separate from scripts/ga4-property-sync.js,
// which manages the per-environment "DIY Accounting Submit (ci|prod)" properties and
// never touches the shared "DIY Accounting" property (523400333) that this script targets.
//
// Usage:
//   GA4_SERVICE_ACCOUNT_JSON=... (or GA4_SERVICE_ACCOUNT_ARN with AWS credentials) \
//     node scripts/ga4-bigquery-link-export.js --property-id 523400333 --dry-run
//
// Options:
//   --property-id <id>        Required. The GA4 property id to inspect (numeric, no "properties/" prefix).
//   --streaming <true|false>  Set the link's streamingExportEnabled flag.
//   --daily <true|false>      Set the link's dailyExportEnabled flag.
//   --dry-run                 Read and print the current state only; write nothing.

import { fileURLToPath } from "node:url";

import { createGoogleAuthorizedClient, resolveServiceAccountCredentialsJson } from "./lib/googleAuth.js";

const ANALYTICS_ADMIN_V1ALPHA = "https://analyticsadmin.googleapis.com/v1alpha";
const ANALYTICS_EDIT_SCOPE = "https://www.googleapis.com/auth/analytics.edit";

function parseBoolFlag(value, flagName) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${flagName} must be "true" or "false", got: ${value}`);
}

export function parseArgs(argv) {
  const opts = { propertyId: undefined, streaming: undefined, daily: undefined, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--property-id":
        opts.propertyId = argv[++i];
        break;
      case "--streaming":
        opts.streaming = parseBoolFlag(argv[++i], "--streaming");
        break;
      case "--daily":
        opts.daily = parseBoolFlag(argv[++i], "--daily");
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.propertyId) {
    throw new Error("--property-id is required");
  }
  return opts;
}

/**
 * Pull the list of links out of a bigQueryLinks response body. The Analytics Admin API names
 * this field "bigqueryLinks" (lowercase q) in the JSON body, same quirk as ga4-property-sync.js.
 *
 * @param {object} data
 * @returns {Array<object>}
 */
export function extractBigQueryLinks(data) {
  return data.bigqueryLinks || [];
}

/**
 * Pick the property's single BigQuery link, failing loudly when there isn't exactly one —
 * a missing link means nothing to turn streaming on for, and more than one means this script
 * would be guessing which one the operator meant.
 *
 * @param {Array<object>} links
 * @param {string} propertyId
 * @returns {object}
 */
export function selectSingleLink(links, propertyId) {
  if (links.length === 0) {
    throw new Error(`Property ${propertyId} has no BigQuery link`);
  }
  if (links.length > 1) {
    const names = links.map((link) => link.name).join(", ");
    throw new Error(`Property ${propertyId} has ${links.length} BigQuery links, expected exactly one: ${names}`);
  }
  return links[0];
}

/**
 * Build the patch plan for a link from the requested flags. Pure and network-free so it can
 * be unit tested with fixtures.
 *
 * @param {object} link - the existing BigQuery link
 * @param {{streaming?: boolean, daily?: boolean}} requested
 * @returns {{link: object, updateMask: string[], data: object}} empty updateMask means no flags were requested
 */
export function buildPatch(link, { streaming, daily }) {
  const data = {};
  const updateMask = [];
  if (streaming !== undefined) {
    data.streamingExportEnabled = streaming;
    updateMask.push("streamingExportEnabled");
  }
  if (daily !== undefined) {
    data.dailyExportEnabled = daily;
    updateMask.push("dailyExportEnabled");
  }
  return { link, updateMask, data };
}

function printLink(link) {
  console.log(`  name: ${link.name}`);
  console.log(`  project: ${link.project ?? "(unknown)"}`);
  console.log(`  dataset location: ${link.datasetLocation ?? "(unknown)"}`);
  console.log(`  dailyExportEnabled: ${link.dailyExportEnabled === true}`);
  console.log(`  streamingExportEnabled: ${link.streamingExportEnabled === true}`);
}

async function listBigQueryLinks(client, propertyId) {
  const { data } = await client.request({ url: `${ANALYTICS_ADMIN_V1ALPHA}/properties/${propertyId}/bigQueryLinks` });
  return extractBigQueryLinks(data);
}

async function patchBigQueryLink(client, linkName, data, updateMask) {
  const { data: result } = await client.request({
    url: `${ANALYTICS_ADMIN_V1ALPHA}/${linkName}`,
    method: "PATCH",
    params: { updateMask: updateMask.join(",") },
    data,
  });
  return result;
}

export async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const credentialsJson = await resolveServiceAccountCredentialsJson({
    jsonEnvVar: "GA4_SERVICE_ACCOUNT_JSON",
    arnEnvVar: "GA4_SERVICE_ACCOUNT_ARN",
  });

  const client = await createGoogleAuthorizedClient(credentialsJson, [ANALYTICS_EDIT_SCOPE]);

  console.log(`Reading BigQuery links for property ${opts.propertyId}${opts.dryRun ? " (dry run)" : ""}...`);

  const links = await listBigQueryLinks(client, opts.propertyId);
  console.log(`\n=== BigQuery link(s) for property ${opts.propertyId} ===`);
  for (const link of links) {
    printLink(link);
    console.log("");
  }

  const link = selectSingleLink(links, opts.propertyId);
  const { updateMask, data } = buildPatch(link, { streaming: opts.streaming, daily: opts.daily });

  if (updateMask.length === 0) {
    console.log("No --streaming or --daily flag given: nothing to change.");
    return { link, updateMask, data };
  }

  if (opts.dryRun) {
    console.log(`[dry-run] would patch ${link.name} (${updateMask.join(", ")}):`);
    console.log(`  ${JSON.stringify(data)}`);
    return { link, updateMask, data };
  }

  const result = await patchBigQueryLink(client, link.name, data, updateMask);
  console.log(`Patched ${link.name} (${updateMask.join(", ")}):`);
  printLink(result);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("GA4 BigQuery link export change failed:", err.message);
    process.exit(1);
  });
}
