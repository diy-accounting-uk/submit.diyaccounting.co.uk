#!/usr/bin/env node
/**
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 *
 * Assert two GCP billing housekeeping facts as code: a budget with 50/90/100 percent alerts
 * on the billing account that holds diyaccounting-ga4, and that the auto-created project
 * valued-context-507200-m9 is empty before it is deleted.
 *
 * Usage:
 *   node scripts/gcp-billing-assert.js --dry-run
 *   node scripts/gcp-billing-assert.js
 *
 * Options:
 *   --dry-run                      Report only; make no changes
 *   --billing-project <id>         Project whose billing account holds the budget
 *                                  (default: diyaccounting-ga4)
 *   --stray-project <id>           Project to inspect and, if empty, delete
 *                                  (default: valued-context-507200-m9)
 *   --amount <number>              Budget amount, whole units (default: 10)
 *   --currency <code>              Budget currency code (default: GBP)
 *   --budget-display-name <name>   Display name used only when creating a new budget
 *
 * Environment variables:
 *   GA4_SERVICE_ACCOUNT_JSON   Google service-account key JSON (local dev override)
 *   GA4_SERVICE_ACCOUNT_ARN    Secrets Manager ARN holding that JSON (used otherwise)
 *   AWS_REGION                 AWS region for the Secrets Manager call (default: eu-west-2)
 *
 * The service account needs, at minimum: a billing role that can read and write budgets on
 * the billing account, and read access to Service Usage, BigQuery, Cloud Storage and Compute
 * Engine on the stray project, plus delete rights on that project.
 *
 * A budget already exists on this billing account, created by hand. This script looks for it
 * first and reuses it, adding whichever of the three alert thresholds it is missing, rather
 * than creating a second budget.
 */

import { fileURLToPath } from "node:url";
import { resolveServiceAccountCredentialsJson, createGoogleAuthClient, getAccessToken } from "./lib/googleAuth.js";

// The APIs Google documents as enabled by default when a new project is created
// (cloud.google.com/service-usage/docs/enabled-service). A stray project holding only these
// has never been used for anything; anything else is a sign it was actually put to work.
export const DEFAULT_ENABLED_SERVICES = new Set([
  "analyticshub.googleapis.com",
  "bigquery.googleapis.com",
  "bigqueryconnection.googleapis.com",
  "bigquerydatapolicy.googleapis.com",
  "bigquerydatatransfer.googleapis.com",
  "bigquerymigration.googleapis.com",
  "bigqueryreservation.googleapis.com",
  "bigquerystorage.googleapis.com",
  "cloudapis.googleapis.com",
  "cloudtrace.googleapis.com",
  "dataform.googleapis.com",
  "dataplex.googleapis.com",
  "datastore.googleapis.com",
  "logging.googleapis.com",
  "monitoring.googleapis.com",
  "servicemanagement.googleapis.com",
  "serviceusage.googleapis.com",
  "sql-component.googleapis.com",
  "storage-api.googleapis.com",
  "storage-component.googleapis.com",
  "storage.googleapis.com",
  "telemetry.googleapis.com",
]);

export const THRESHOLD_PERCENTAGES = [0.5, 0.9, 1.0];

// Small round monthly amount, in the billing account's home currency; override with
// --amount/--currency once a firmer figure is available.
const DEFAULT_BUDGET_AMOUNT = "10";
const DEFAULT_BUDGET_CURRENCY_CODE = "GBP";
const DEFAULT_BUDGET_DISPLAY_NAME = "diyaccounting-ga4 monthly budget";
const DEFAULT_BILLING_PROJECT_ID = "diyaccounting-ga4";
const DEFAULT_STRAY_PROJECT_ID = "valued-context-507200-m9";

/**
 * Parse CLI args. Unknown flags throw rather than being silently ignored.
 *
 * @param {string[]} argv - process.argv.slice(2)
 */
export function parseArgs(argv) {
  const opts = {
    dryRun: false,
    billingProjectId: DEFAULT_BILLING_PROJECT_ID,
    strayProjectId: DEFAULT_STRAY_PROJECT_ID,
    budgetAmount: DEFAULT_BUDGET_AMOUNT,
    budgetCurrencyCode: DEFAULT_BUDGET_CURRENCY_CODE,
    budgetDisplayName: DEFAULT_BUDGET_DISPLAY_NAME,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--billing-project":
        opts.billingProjectId = argv[++i];
        break;
      case "--stray-project":
        opts.strayProjectId = argv[++i];
        break;
      case "--amount":
        opts.budgetAmount = argv[++i];
        break;
      case "--currency":
        opts.budgetCurrencyCode = argv[++i];
        break;
      case "--budget-display-name":
        opts.budgetDisplayName = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }

  return opts;
}

/**
 * Which alert thresholds a budget's existing threshold rules are missing, out of
 * THRESHOLD_PERCENTAGES.
 *
 * @param {Array<{thresholdPercent: number}>} existingThresholdRules
 * @returns {number[]}
 */
export function findThresholdGaps(existingThresholdRules) {
  const existingPercentages = (existingThresholdRules || []).map((rule) => rule.thresholdPercent);
  return THRESHOLD_PERCENTAGES.filter((wanted) => !existingPercentages.some((have) => Math.abs(have - wanted) < 1e-9));
}

/**
 * Decide what to do about the budget: create one if none exists on the billing account, or
 * reuse the existing one (the operator's hand-made budget), adding only the alert thresholds
 * it is missing.
 *
 * @param {Array<{name: string, displayName: string, thresholdRules?: Array}>} existingBudgets
 */
export function decideBudgetAction(existingBudgets) {
  if (existingBudgets.length === 0) {
    return { action: "create", targetBudget: null, missingThresholds: THRESHOLD_PERCENTAGES.slice() };
  }

  const targetBudget = existingBudgets[0];
  const missingThresholds = findThresholdGaps(targetBudget.thresholdRules || []);
  return {
    action: missingThresholds.length === 0 ? "reuse-noop" : "reuse-update",
    targetBudget,
    missingThresholds,
  };
}

/**
 * Build the request body for creating a new budget, scoped to the whole billing account
 * (an empty budgetFilter, rather than one project) since diyaccounting-ga4 is not the only
 * project the account could ever hold.
 */
export function buildBudgetCreateBody({ displayName, amount, currencyCode }) {
  return {
    displayName,
    budgetFilter: {},
    amount: { specifiedAmount: { currencyCode, units: String(amount) } },
    thresholdRules: THRESHOLD_PERCENTAGES.map((thresholdPercent) => ({ thresholdPercent })),
  };
}

/**
 * Merge the missing threshold rules into a budget's existing ones, for a PATCH that adds
 * alerts without touching the amount the operator set by hand.
 */
export function buildBudgetPatchBody({ existingThresholdRules, missingThresholds }) {
  const merged = [...(existingThresholdRules || []), ...missingThresholds.map((thresholdPercent) => ({ thresholdPercent }))];
  merged.sort((a, b) => a.thresholdPercent - b.thresholdPercent);
  return { thresholdRules: merged };
}

/**
 * The enabled service ids beyond the documented defaults.
 *
 * @param {string[]} enabledServiceIds
 * @param {Set<string>} [defaultServiceIds]
 */
export function computeNonDefaultServices(enabledServiceIds, defaultServiceIds = DEFAULT_ENABLED_SERVICES) {
  return enabledServiceIds.filter((id) => !defaultServiceIds.has(id)).sort();
}

/**
 * A project is safe to delete only when every one of these is empty: enabled services beyond
 * the defaults, BigQuery datasets, Cloud Storage buckets, and Compute Engine instances.
 *
 * @param {{nonDefaultServices: string[], bigQueryDatasets: string[], buckets: string[], computeInstances: string[]}} inventory
 */
export function isProjectSafeToDelete(inventory) {
  return (
    inventory.nonDefaultServices.length === 0 &&
    inventory.bigQueryDatasets.length === 0 &&
    inventory.buckets.length === 0 &&
    inventory.computeInstances.length === 0
  );
}

/**
 * Render a project's inventory as the report the dry run prints and the real run checks
 * before deleting.
 */
export function formatInventoryReport(projectId, inventory) {
  const list = (items) => (items.length === 0 ? "none" : items.join(", "));
  return [
    `Project ${projectId} inventory:`,
    `  Enabled services beyond defaults: ${list(inventory.nonDefaultServices)}`,
    `  BigQuery datasets:                ${list(inventory.bigQueryDatasets)}`,
    `  Cloud Storage buckets:            ${list(inventory.buckets)}`,
    `  Compute Engine instances:         ${list(inventory.computeInstances)}`,
  ].join("\n");
}

// --- Network calls. Not covered by the unit tests (decision logic only, no network); the
// real dry run exercises these against the actual GCP project. ---

async function googleApiFetch(accessToken, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${url} failed: ${response.status} ${response.statusText} - ${JSON.stringify(body)}`);
  }
  return body;
}

async function getBillingAccountForProject(accessToken, projectId) {
  const body = await googleApiFetch(accessToken, `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`);
  if (!body.billingAccountName) {
    throw new Error(`Project ${projectId} has no billing account attached`);
  }
  return body.billingAccountName;
}

async function listBudgets(accessToken, billingAccountName) {
  const budgets = [];
  let pageToken;
  do {
    const url = new URL(`https://billingbudgets.googleapis.com/v1/${billingAccountName}/budgets`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await googleApiFetch(accessToken, url.toString());
    budgets.push(...(body.budgets || []));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return budgets;
}

async function createBudget(accessToken, billingAccountName, budgetBody) {
  return googleApiFetch(accessToken, `https://billingbudgets.googleapis.com/v1/${billingAccountName}/budgets`, {
    method: "POST",
    body: JSON.stringify(budgetBody),
  });
}

async function patchBudgetThresholds(accessToken, budgetName, thresholdRules) {
  const url = new URL(`https://billingbudgets.googleapis.com/v1/${budgetName}`);
  url.searchParams.set("updateMask", "thresholdRules");
  return googleApiFetch(accessToken, url.toString(), {
    method: "PATCH",
    body: JSON.stringify({ thresholdRules }),
  });
}

async function listEnabledServices(accessToken, projectId) {
  const services = [];
  let pageToken;
  do {
    const url = new URL(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services`);
    url.searchParams.set("filter", "state:ENABLED");
    url.searchParams.set("pageSize", "200");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await googleApiFetch(accessToken, url.toString());
    for (const service of body.services || []) {
      services.push(service.name.split("/").pop());
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return services;
}

async function listBigQueryDatasets(accessToken, projectId) {
  const datasets = [];
  let pageToken;
  do {
    const url = new URL(`https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await googleApiFetch(accessToken, url.toString());
    for (const dataset of body.datasets || []) {
      datasets.push(dataset.datasetReference?.datasetId ?? dataset.id);
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return datasets;
}

async function listStorageBuckets(accessToken, projectId) {
  const buckets = [];
  let pageToken;
  do {
    const url = new URL("https://storage.googleapis.com/storage/v1/b");
    url.searchParams.set("project", projectId);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await googleApiFetch(accessToken, url.toString());
    for (const bucket of body.items || []) {
      buckets.push(bucket.name);
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return buckets;
}

async function listComputeInstances(accessToken, projectId) {
  const instances = [];
  let pageToken;
  do {
    const url = new URL(`https://compute.googleapis.com/compute/v1/projects/${projectId}/aggregated/instances`);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await googleApiFetch(accessToken, url.toString());
    for (const scoped of Object.values(body.items || {})) {
      for (const instance of scoped.instances || []) {
        instances.push(instance.name);
      }
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return instances;
}

async function deleteProject(accessToken, projectId) {
  return googleApiFetch(accessToken, `https://cloudresourcemanager.googleapis.com/v3/projects/${projectId}`, {
    method: "DELETE",
  });
}

async function assertBudget(accessToken, opts) {
  const billingAccountName = await getBillingAccountForProject(accessToken, opts.billingProjectId);
  console.log(`Billing account: ${billingAccountName}`);

  const existingBudgets = await listBudgets(accessToken, billingAccountName);
  console.log(
    existingBudgets.length === 0
      ? "No existing budget found on this billing account."
      : `Found ${existingBudgets.length} existing budget(s) on this billing account; reusing rather than creating a new one.`,
  );

  const decision = decideBudgetAction(existingBudgets);

  if (decision.action === "create") {
    console.log(
      `No budget exists. Would create "${opts.budgetDisplayName}" for ${opts.budgetAmount} ${opts.budgetCurrencyCode}/month with 50/90/100% alerts.`,
    );
    if (!opts.dryRun) {
      const body = buildBudgetCreateBody({
        displayName: opts.budgetDisplayName,
        amount: opts.budgetAmount,
        currencyCode: opts.budgetCurrencyCode,
      });
      const created = await createBudget(accessToken, billingAccountName, body);
      console.log(`Created budget: ${created.name}`);
    }
  } else if (decision.action === "reuse-noop") {
    console.log(`Existing budget "${decision.targetBudget.displayName}" (${decision.targetBudget.name}) already carries 50/90/100% alert thresholds.`);
  } else {
    console.log(
      `Existing budget "${decision.targetBudget.displayName}" (${decision.targetBudget.name}) is missing the ${decision.missingThresholds
        .map((p) => `${p * 100}%`)
        .join(", ")} alert threshold(s).`,
    );
    if (!opts.dryRun) {
      const merged = buildBudgetPatchBody({
        existingThresholdRules: decision.targetBudget.thresholdRules || [],
        missingThresholds: decision.missingThresholds,
      }).thresholdRules;
      await patchBudgetThresholds(accessToken, decision.targetBudget.name, merged);
      console.log(`Updated budget ${decision.targetBudget.name} with the missing threshold(s).`);
    }
  }
}

async function assertStrayProjectEmpty(accessToken, opts) {
  const enabledServices = await listEnabledServices(accessToken, opts.strayProjectId);
  const nonDefaultServices = computeNonDefaultServices(enabledServices);
  const bigQueryDatasets = await listBigQueryDatasets(accessToken, opts.strayProjectId);
  const buckets = await listStorageBuckets(accessToken, opts.strayProjectId);
  const computeInstances = enabledServices.includes("compute.googleapis.com") ? await listComputeInstances(accessToken, opts.strayProjectId) : [];

  const inventory = { enabledServices, nonDefaultServices, bigQueryDatasets, buckets, computeInstances };
  console.log(formatInventoryReport(opts.strayProjectId, inventory));
  console.log("");

  const safeToDelete = isProjectSafeToDelete(inventory);

  if (opts.dryRun) {
    console.log(
      safeToDelete
        ? `Dry run: ${opts.strayProjectId} is empty and would be deleted.`
        : `Dry run: ${opts.strayProjectId} is not empty and would NOT be deleted.`,
    );
    return;
  }

  if (!safeToDelete) {
    throw new Error(`Refusing to delete ${opts.strayProjectId}: it is not empty. See the inventory above.`);
  }

  await deleteProject(accessToken, opts.strayProjectId);
  console.log(`Deleted project ${opts.strayProjectId}.`);
}

export async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log(`GCP billing tidy-up: ${opts.dryRun ? "DRY RUN" : "APPLY"}`);
  console.log(`  Billing-holder project: ${opts.billingProjectId}`);
  console.log(`  Stray project:          ${opts.strayProjectId}`);
  console.log("");

  const credentialsJson = await resolveServiceAccountCredentialsJson({
    jsonEnvVar: "GA4_SERVICE_ACCOUNT_JSON",
    arnEnvVar: "GA4_SERVICE_ACCOUNT_ARN",
  });
  const googleAuth = createGoogleAuthClient(credentialsJson);
  const accessToken = await getAccessToken(googleAuth);

  // The budget and the stray-project checks are independent of each other. One failing
  // (for example, a Google API the project hasn't enabled yet) should not hide the other's
  // report, so each runs and reports on its own before either error is raised.
  const failures = [];

  try {
    await assertBudget(accessToken, opts);
  } catch (err) {
    console.error(`Budget check failed: ${err.message}`);
    failures.push(`budget: ${err.message}`);
  }

  console.log("");

  try {
    await assertStrayProjectEmpty(accessToken, opts);
  } catch (err) {
    console.error(`Stray project check failed: ${err.message}`);
    failures.push(`stray project: ${err.message}`);
  }

  if (failures.length > 0) {
    throw new Error(`gcp-billing-assert had ${failures.length} failing check(s): ${failures.join("; ")}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("gcp-billing-assert failed:", err.message);
    process.exit(1);
  });
}
