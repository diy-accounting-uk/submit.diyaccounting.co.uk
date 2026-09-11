#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/google-inventory.js
//
// Read-only snapshot of everything this repo's Google footprint touches: the enabled
// services and IAM policy on the GA4 project, the billing account's budgets, every GA4
// account and property (trashed properties included) with their data streams, key events
// and BigQuery links, the analytics service account's keys with their creation dates, the
// project's IAP brand, and the BigQuery datasets and data transfer configs. It writes
// nothing anywhere; use it to see what is live before changing a toml file that describes
// it, or to check a script's plan against reality.
//
// Usage:
//   node scripts/google-inventory.js [--project diyaccounting-ga4] [--ga4-account 1035014]
//     [--service-account ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com]
//     [--location europe-west2]
//
// Credentials: GA4_SERVICE_ACCOUNT_JSON (raw key JSON, for local runs) or
// GA4_SERVICE_ACCOUNT_ARN (an AWS Secrets Manager ARN). Never printed. A run with neither
// set fails with "Neither GA4_SERVICE_ACCOUNT_JSON nor GA4_SERVICE_ACCOUNT_ARN is set"
// rather than a network error, since there is nothing to authenticate with.

import { fileURLToPath } from "node:url";

import { resolveServiceAccountCredentialsJson, createGoogleAuthClient, getAccessToken } from "./lib/googleAuth.js";

export const DEFAULT_PROJECT = "diyaccounting-ga4";
export const DEFAULT_GA4_ACCOUNT_ID = "1035014";
export const DEFAULT_SERVICE_ACCOUNT_EMAIL = "ga4-report-pull@diyaccounting-ga4.iam.gserviceaccount.com";
export const DEFAULT_BIGQUERY_LOCATION = "europe-west2";

const SERVICE_USAGE_V1 = "https://serviceusage.googleapis.com/v1";
const RESOURCE_MANAGER_V3 = "https://cloudresourcemanager.googleapis.com/v3";
const CLOUD_BILLING_V1 = "https://cloudbilling.googleapis.com/v1";
const BILLING_BUDGETS_V1 = "https://billingbudgets.googleapis.com/v1";
const ANALYTICS_ADMIN_V1ALPHA = "https://analyticsadmin.googleapis.com/v1alpha";
const IAM_V1 = "https://iam.googleapis.com/v1";
const IAP_V1 = "https://iap.googleapis.com/v1";
const BIGQUERY_V2 = "https://bigquery.googleapis.com/bigquery/v2";
const DATA_TRANSFER_V1 = "https://bigquerydatatransfer.googleapis.com/v1";

const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform.read-only",
  "https://www.googleapis.com/auth/analytics.readonly",
];

export function parseArgs(argv) {
  const opts = {
    project: DEFAULT_PROJECT,
    ga4AccountId: DEFAULT_GA4_ACCOUNT_ID,
    serviceAccountEmail: DEFAULT_SERVICE_ACCOUNT_EMAIL,
    location: DEFAULT_BIGQUERY_LOCATION,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--project":
        opts.project = argv[++i];
        break;
      case "--ga4-account":
        opts.ga4AccountId = argv[++i];
        break;
      case "--service-account":
        opts.serviceAccountEmail = argv[++i];
        break;
      case "--location":
        opts.location = argv[++i];
        break;
      case "--help":
        console.log(
          "Usage: node scripts/google-inventory.js [--project <id>] [--ga4-account <id>] [--service-account <email>] [--location <region>]",
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

// --- Shaping: turn one API's raw response body into the plain rows the report prints.
// Pure and network-free so they are unit tested against mocked API responses. ---

export function shapeEnabledServices(servicesListBody) {
  return (servicesListBody.services ?? []).map((service) => service.config?.name ?? service.name.split("/").pop()).sort();
}

export function shapeIamPolicy(policyBody) {
  return (policyBody.bindings ?? []).map((binding) => ({ role: binding.role, members: [...(binding.members ?? [])] }));
}

export function shapeBudgets(budgetsListBody) {
  return (budgetsListBody.budgets ?? []).map((budget) => ({
    name: budget.name,
    displayName: budget.displayName,
    amount: budget.amount?.specifiedAmount ? `${budget.amount.specifiedAmount.units ?? "0"} ${budget.amount.specifiedAmount.currencyCode ?? ""}`.trim() : "unspecified",
    thresholds: (budget.thresholdRules ?? []).map((rule) => rule.thresholdPercent),
  }));
}

export function shapeGa4Accounts(accountsListBody) {
  return (accountsListBody.accounts ?? []).map((account) => ({
    name: account.name,
    displayName: account.displayName,
    deleted: Boolean(account.deleteTime),
  }));
}

export function shapeGa4Properties(propertiesListBody) {
  return (propertiesListBody.properties ?? []).map((property) => ({
    name: property.name,
    displayName: property.displayName,
    parent: property.parent,
    deleted: Boolean(property.deleteTime),
  }));
}

export function shapeDataStreams(dataStreamsListBody) {
  return (dataStreamsListBody.dataStreams ?? []).map((stream) => ({
    name: stream.name,
    displayName: stream.displayName,
    measurementId: stream.webStreamData?.measurementId ?? null,
    defaultUri: stream.webStreamData?.defaultUri ?? null,
  }));
}

export function shapeKeyEvents(keyEventsListBody) {
  return (keyEventsListBody.keyEvents ?? []).map((event) => ({ name: event.name, eventName: event.eventName }));
}

// The Analytics Admin API names this field "bigqueryLinks" (lowercase q) in the JSON body,
// unlike the "bigQueryLinks" resource path segment used to fetch it.
export function shapeBigQueryLinks(bigQueryLinksBody) {
  return (bigQueryLinksBody.bigqueryLinks ?? []).map((link) => ({
    name: link.name,
    project: link.project,
    datasetLocation: link.datasetLocation,
    dailyExportEnabled: Boolean(link.dailyExportEnabled),
  }));
}

export function shapeServiceAccountKeys(keysListBody) {
  return (keysListBody.keys ?? [])
    .map((key) => ({ name: key.name, createTime: key.validAfterTime ?? null, keyType: key.keyType ?? null }))
    .sort((a, b) => (a.createTime ?? "").localeCompare(b.createTime ?? ""));
}

export function shapeIapBrand(brandsListBody) {
  const brands = brandsListBody.brands ?? [];
  if (brands.length === 0) return null;
  const [brand] = brands;
  return { name: brand.name, applicationTitle: brand.applicationTitle, supportEmail: brand.supportEmail };
}

export function shapeBigQueryDatasets(datasetsListBody) {
  return (datasetsListBody.datasets ?? []).map((dataset) => dataset.datasetReference?.datasetId ?? dataset.id).sort();
}

export function shapeTransferConfigs(transferConfigsListBody) {
  return (transferConfigsListBody.transferConfigs ?? []).map((config) => ({
    name: config.name,
    displayName: config.displayName,
    schedule: config.schedule,
    disabled: Boolean(config.disabled),
  }));
}

/**
 * Assemble every shaped section into the one report `printInventory` renders. Pure: takes
 * already-shaped rows, so a test can build the whole report from small fixtures without
 * touching the network functions below.
 */
export function buildInventoryReport({
  project,
  enabledServices,
  iamPolicy,
  budgets,
  ga4Accounts,
  ga4Properties,
  dataStreamsByProperty,
  keyEventsByProperty,
  bigQueryLinksByProperty,
  serviceAccountKeys,
  iapBrand,
  bigQueryDatasets,
  transferConfigs,
}) {
  return {
    project,
    enabledServices,
    iamPolicy,
    budgets,
    ga4Accounts,
    ga4Properties: ga4Properties.map((property) => ({
      ...property,
      dataStreams: dataStreamsByProperty[property.name] ?? [],
      keyEvents: keyEventsByProperty[property.name] ?? [],
      bigQueryLinks: bigQueryLinksByProperty[property.name] ?? [],
    })),
    serviceAccountKeys,
    iapBrand,
    bigQueryDatasets,
    transferConfigs,
  };
}

export function printInventory(report) {
  const list = (items) => (items.length === 0 ? "none" : items.join(", "));

  console.log(`=== Google inventory: ${report.project} ===\n`);

  console.log(`Enabled services (${report.enabledServices.length}):`);
  console.log(`  ${list(report.enabledServices)}\n`);

  console.log(`Project IAM policy (${report.iamPolicy.length} role binding(s)):`);
  for (const binding of report.iamPolicy) {
    console.log(`  ${binding.role}: ${list(binding.members)}`);
  }
  console.log("");

  console.log(`Billing budgets (${report.budgets.length}):`);
  for (const budget of report.budgets) {
    console.log(`  ${budget.displayName} (${budget.name}): ${budget.amount}, thresholds ${list(budget.thresholds.map((t) => `${t * 100}%`))}`);
  }
  console.log("");

  console.log(`GA4 accounts (${report.ga4Accounts.length}):`);
  for (const account of report.ga4Accounts) {
    console.log(`  ${account.displayName} (${account.name})${account.deleted ? " [trashed]" : ""}`);
  }
  console.log("");

  console.log(`GA4 properties (${report.ga4Properties.length}):`);
  for (const property of report.ga4Properties) {
    console.log(`  ${property.displayName} (${property.name})${property.deleted ? " [trashed]" : ""}`);
    for (const stream of property.dataStreams) {
      console.log(`    stream: ${stream.displayName} (${stream.name}) measurement id ${stream.measurementId ?? "none"}`);
    }
    for (const event of property.keyEvents) {
      console.log(`    key event: ${event.eventName} (${event.name})`);
    }
    for (const link of property.bigQueryLinks) {
      console.log(`    BigQuery link: ${link.project} (${link.datasetLocation}) daily export ${link.dailyExportEnabled} (${link.name})`);
    }
  }
  console.log("");

  console.log(`Service account keys (${report.serviceAccountKeys.length}):`);
  for (const key of report.serviceAccountKeys) {
    console.log(`  ${key.name}: created ${key.createTime ?? "unknown"} (${key.keyType ?? "unknown type"})`);
  }
  console.log("");

  console.log("IAP brand:");
  console.log(report.iapBrand ? `  ${report.iapBrand.applicationTitle} (${report.iapBrand.name}), support ${report.iapBrand.supportEmail}` : "  none");
  console.log("");

  console.log(`BigQuery datasets (${report.bigQueryDatasets.length}):`);
  console.log(`  ${list(report.bigQueryDatasets)}\n`);

  console.log(`BigQuery data transfer configs (${report.transferConfigs.length}):`);
  for (const config of report.transferConfigs) {
    console.log(`  ${config.displayName} (${config.name}): schedule "${config.schedule}"${config.disabled ? " [disabled]" : ""}`);
  }
  console.log("");
}

// --- Network calls. Not covered by the unit tests (no network in tests); the shaping
// functions above are what carry the argument-handling and output-shaping coverage. ---

async function googleGet(url, token, params) {
  const withParams = new URL(url);
  for (const [key, value] of Object.entries(params ?? {})) {
    withParams.searchParams.set(key, value);
  }
  const res = await fetch(withParams, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${res.status} from ${withParams}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function paginate(fetchPage) {
  const items = [];
  let pageToken;
  do {
    const body = await fetchPage(pageToken);
    items.push(body);
    pageToken = body.nextPageToken;
  } while (pageToken);
  return items;
}

async function listEnabledServices(token, project) {
  const pages = await paginate((pageToken) =>
    googleGet(`${SERVICE_USAGE_V1}/projects/${project}/services`, token, { filter: "state:ENABLED", pageSize: 200, ...(pageToken ? { pageToken } : {}) }),
  );
  return shapeEnabledServices({ services: pages.flatMap((page) => page.services ?? []) });
}

async function getProjectIamPolicy(token, project) {
  const res = await fetch(`${RESOURCE_MANAGER_V3}/projects/${project}:getIamPolicy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`${res.status} getting IAM policy for ${project}: ${(await res.text()).slice(0, 300)}`);
  return shapeIamPolicy(await res.json());
}

async function getProjectNumber(token, project) {
  const data = await googleGet(`${RESOURCE_MANAGER_V3}/projects/${project}`, token);
  return data.name?.split("/")[1] ?? null;
}

async function listBudgets(token, project) {
  const billingInfo = await googleGet(`${CLOUD_BILLING_V1}/projects/${project}/billingInfo`, token);
  if (!billingInfo.billingAccountName) return [];
  const pages = await paginate((pageToken) =>
    googleGet(`${BILLING_BUDGETS_V1}/${billingInfo.billingAccountName}/budgets`, token, pageToken ? { pageToken } : {}),
  );
  return shapeBudgets({ budgets: pages.flatMap((page) => page.budgets ?? []) });
}

async function listGa4Accounts(token) {
  const pages = await paginate((pageToken) => googleGet(`${ANALYTICS_ADMIN_V1ALPHA}/accounts`, token, { showDeleted: true, ...(pageToken ? { pageToken } : {}) }));
  return shapeGa4Accounts({ accounts: pages.flatMap((page) => page.accounts ?? []) });
}

async function listGa4Properties(token, accountName) {
  const pages = await paginate((pageToken) =>
    googleGet(`${ANALYTICS_ADMIN_V1ALPHA}/properties`, token, { filter: `parent:${accountName}`, showDeleted: true, ...(pageToken ? { pageToken } : {}) }),
  );
  return shapeGa4Properties({ properties: pages.flatMap((page) => page.properties ?? []) });
}

async function listDataStreams(token, propertyName) {
  return shapeDataStreams(await googleGet(`${ANALYTICS_ADMIN_V1ALPHA}/${propertyName}/dataStreams`, token));
}

async function listKeyEvents(token, propertyName) {
  return shapeKeyEvents(await googleGet(`${ANALYTICS_ADMIN_V1ALPHA}/${propertyName}/keyEvents`, token));
}

async function listBigQueryLinks(token, propertyName) {
  return shapeBigQueryLinks(await googleGet(`${ANALYTICS_ADMIN_V1ALPHA}/${propertyName}/bigQueryLinks`, token));
}

async function listServiceAccountKeys(token, project, serviceAccountEmail) {
  return shapeServiceAccountKeys(await googleGet(`${IAM_V1}/projects/${project}/serviceAccounts/${serviceAccountEmail}/keys`, token));
}

async function listIapBrand(token, projectNumber) {
  if (!projectNumber) return null;
  return shapeIapBrand(await googleGet(`${IAP_V1}/projects/${projectNumber}/brands`, token));
}

async function listBigQueryDatasets(token, project) {
  const pages = await paginate((pageToken) => googleGet(`${BIGQUERY_V2}/projects/${project}/datasets`, token, pageToken ? { pageToken } : {}));
  return shapeBigQueryDatasets({ datasets: pages.flatMap((page) => page.datasets ?? []) });
}

async function listTransferConfigs(token, project, location) {
  const pages = await paginate((pageToken) =>
    googleGet(`${DATA_TRANSFER_V1}/projects/${project}/locations/${location}/transferConfigs`, token, {
      dataSourceIds: "scheduled_query",
      ...(pageToken ? { pageToken } : {}),
    }),
  );
  return shapeTransferConfigs({ transferConfigs: pages.flatMap((page) => page.transferConfigs ?? []) });
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);

  const credentialsJson = await resolveServiceAccountCredentialsJson({ jsonEnvVar: "GA4_SERVICE_ACCOUNT_JSON", arnEnvVar: "GA4_SERVICE_ACCOUNT_ARN" });
  const token = await getAccessToken(createGoogleAuthClient(credentialsJson, SCOPES));

  const [enabledServices, iamPolicy, budgets, projectNumber, ga4Accounts, serviceAccountKeys, bigQueryDatasets] = await Promise.all([
    listEnabledServices(token, opts.project),
    getProjectIamPolicy(token, opts.project),
    listBudgets(token, opts.project),
    getProjectNumber(token, opts.project),
    listGa4Accounts(token),
    listServiceAccountKeys(token, opts.project, opts.serviceAccountEmail),
    listBigQueryDatasets(token, opts.project),
  ]);

  const accountName = ga4Accounts.find((account) => account.name === `accounts/${opts.ga4AccountId}`)?.name ?? `accounts/${opts.ga4AccountId}`;
  const ga4Properties = await listGa4Properties(token, accountName);

  const dataStreamsByProperty = {};
  const keyEventsByProperty = {};
  const bigQueryLinksByProperty = {};
  for (const property of ga4Properties) {
    if (property.deleted) continue;
    dataStreamsByProperty[property.name] = await listDataStreams(token, property.name);
    keyEventsByProperty[property.name] = await listKeyEvents(token, property.name);
    bigQueryLinksByProperty[property.name] = await listBigQueryLinks(token, property.name);
  }

  const [iapBrand, transferConfigs] = await Promise.all([
    listIapBrand(token, projectNumber),
    listTransferConfigs(token, opts.project, opts.location),
  ]);

  const report = buildInventoryReport({
    project: opts.project,
    enabledServices,
    iamPolicy,
    budgets,
    ga4Accounts,
    ga4Properties,
    dataStreamsByProperty,
    keyEventsByProperty,
    bigQueryLinksByProperty,
    serviceAccountKeys,
    iapBrand,
    bigQueryDatasets,
    transferConfigs,
  });

  printInventory(report);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("google-inventory failed:", err.message);
    process.exit(1);
  });
}
