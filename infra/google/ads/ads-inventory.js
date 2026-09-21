#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// infra/google/ads/ads-inventory.js
//
// Read-only snapshot of the Google Ads account named in infra/google/ads/ads.toml: the customer
// record, its conversion actions and default conversion goals, its campaigns and asset groups,
// and the GA4 side of the Ads link. It writes nothing anywhere.
//
// Google Ads API access is an access level on the Cloud project named in ads.toml, granted on
// that project's "Google Ads API Overview" page in the Cloud console — not a developer token,
// which the API now ignores. Reading one client account with that account's own OAuth
// credentials needs no manager account and no login-customer-id header.
//
// Usage:
//   node infra/google/ads/ads-inventory.js [--client-file <path>]
//   node infra/google/ads/ads-inventory.js --consent [--client-file <path>]
//
// --consent runs the same loopback OAuth consent scripts/youtube-upload.js uses, requesting the
// adwords scope instead of the YouTube ones, and stores the resulting refresh token in the
// Secrets Manager secret ads.toml names through scripts/put-secret-with-rotation-tag.sh. A run
// without --consent reads that stored refresh token and exchanges it for an access token.
//
// --client-file reads the OAuth client id and secret from a downloaded Desktop client JSON
// instead of Secrets Manager, the same override scripts/youtube-upload.js supports.
//
// The GA4 side of the link is read with the analytics service account's own federated
// credentials (application default credentials from google-github-actions/auth), the same
// authentication infra/google/gcp/google-inventory.js uses — a separate credential from the
// Ads API's consent-based user token.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";
import { OAuth2Client } from "google-auth-library";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import { resolveClientCredentials, runLoopbackConsent } from "../../../scripts/youtube-upload.js";
import { assertFederatedCredentials, createGoogleAuthClient, getAccessToken } from "../lib/googleAuth.js";

export const CONFIG_PATH = "infra/google/ads/ads.toml";
export const ADS_API_OVERVIEW_URL = "https://console.cloud.google.com/google/ads-apis/overview";
export const GA4_ANALYTICS_ADMIN_V1BETA = "https://analyticsadmin.googleapis.com/v1beta";

const CUSTOMER_QUERY =
  "SELECT customer.id, customer.descriptive_name, customer.auto_tagging_enabled, customer.currency_code, customer.time_zone FROM customer";
const CONVERSION_ACTION_QUERY =
  "SELECT conversion_action.resource_name, conversion_action.name, conversion_action.type, conversion_action.category, conversion_action.status, conversion_action.primary_for_goal FROM conversion_action";
const CONVERSION_GOAL_QUERY = "SELECT customer_conversion_goal.category, customer_conversion_goal.origin, customer_conversion_goal.biddable FROM customer_conversion_goal";
const CAMPAIGN_QUERY =
  "SELECT campaign.resource_name, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.campaign_budget, campaign_budget.amount_micros FROM campaign";
const ASSET_GROUP_QUERY = "SELECT asset_group.resource_name, asset_group.name, asset_group.status, asset_group.campaign FROM asset_group";

/**
 * Parse infra/google/ads/ads.toml's content.
 *
 * @param {string} tomlString
 * @returns {{customerId: string, projectId: string, oauthClientSecretName: string, refreshTokenSecretName: string, scope: string, apiVersion: string, ga4PropertyId: string}}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const customerId = parsed.account?.customer_id;
  const projectId = parsed.project?.id;
  const oauthClientSecretName = parsed.secrets?.oauth_client;
  const refreshTokenSecretName = parsed.secrets?.refresh_token;
  const scope = parsed.oauth?.scope;
  const apiVersion = parsed.api?.version;
  const ga4PropertyId = parsed.ga4?.property_id;
  if (!customerId || !projectId || !oauthClientSecretName || !refreshTokenSecretName || !scope || !apiVersion || !ga4PropertyId) {
    throw new Error(
      "ads.toml is missing one of [account].customer_id, [project].id, [secrets].oauth_client, [secrets].refresh_token, [oauth].scope, [api].version or [ga4].property_id",
    );
  }
  return { customerId, projectId, oauthClientSecretName, refreshTokenSecretName, scope, apiVersion, ga4PropertyId };
}

export function loadConfigFromRoot() {
  const filePath = path.join(process.cwd(), CONFIG_PATH);
  return parseConfig(fs.readFileSync(filePath, "utf-8"));
}

export function parseArgs(argv) {
  const opts = { consent: false, clientFile: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--consent") {
      opts.consent = true;
    } else if (arg === "--client-file") {
      const value = argv[++i];
      if (!value) throw new Error("--client-file requires a path argument");
      opts.clientFile = value;
    } else if (arg === "--help") {
      console.log("Usage: node infra/google/ads/ads-inventory.js [--consent] [--client-file <path>]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

// --- Shaping: turn one API's raw response body into the plain rows the report prints.
// Pure and network-free so they are unit tested against mocked API responses. ---

export function shapeCustomer(searchBody) {
  const row = (searchBody.results ?? [])[0]?.customer;
  if (!row) return null;
  return {
    id: row.id,
    name: row.descriptiveName,
    autoTaggingEnabled: Boolean(row.autoTaggingEnabled),
    currencyCode: row.currencyCode,
    timeZone: row.timeZone,
  };
}

export function shapeConversionActions(conversionActionsBody, conversionGoalsBody) {
  const actions = (conversionActionsBody.results ?? []).map((row) => ({
    resourceName: row.conversionAction.resourceName,
    name: row.conversionAction.name,
    type: row.conversionAction.type,
    category: row.conversionAction.category,
    status: row.conversionAction.status,
    primaryForGoal: Boolean(row.conversionAction.primaryForGoal),
  }));
  const goals = (conversionGoalsBody.results ?? []).map((row) => ({
    category: row.customerConversionGoal.category,
    origin: row.customerConversionGoal.origin,
    biddable: Boolean(row.customerConversionGoal.biddable),
  }));
  return { actions, goals };
}

export function shapeCampaigns(searchBody) {
  return (searchBody.results ?? []).map((row) => ({
    resourceName: row.campaign.resourceName,
    name: row.campaign.name,
    status: row.campaign.status,
    advertisingChannelType: row.campaign.advertisingChannelType,
    budgetResourceName: row.campaign.campaignBudget ?? null,
    budgetAmountMicros: row.campaignBudget?.amountMicros ?? null,
  }));
}

export function shapeAssetGroups(searchBody) {
  return (searchBody.results ?? []).map((row) => ({
    resourceName: row.assetGroup.resourceName,
    name: row.assetGroup.name,
    status: row.assetGroup.status,
    campaign: row.assetGroup.campaign,
  }));
}

export function shapeAdsLinks(linksBody) {
  return (linksBody.googleAdsLinks ?? []).map((link) => ({
    name: link.name,
    customerId: link.customerId,
    canManageClients: Boolean(link.canManageClients),
    adsPersonalizationEnabled: Boolean(link.adsPersonalizationEnabled),
  }));
}

/**
 * A 403 from the Google Ads API becomes a finding line naming the project's access level and
 * where to raise it, instead of a failure: this inventory is read-only and never touches Ads
 * calls the account is not permitted to make, so its own errors always name a way forward.
 * Answers the finding for a 403, or null for any other error, which the caller rethrows.
 *
 * @param {Error} error
 * @param {string} projectId
 * @returns {string|null}
 */
export function findingForAccessLevel(error, projectId) {
  const message = error?.message ?? "";
  if (!/^403 /.test(message)) return null;
  let reason = "the project's Google Ads API access level does not reach this account";
  if (/DEVELOPER_TOKEN_NOT_APPROVED/.test(message)) reason = "the project's access level is Test, which reaches test accounts only";
  else if (/NOT_ADS_USER/.test(message)) reason = "the signed-in account has no access to this Ads account";
  return `Google Ads: not permitted (${reason}). Set the access level at ${ADS_API_OVERVIEW_URL}?project=${projectId}, "Upgrade access level" to Basic.`;
}

export function buildInventoryReport({ customerId, customer, conversionActions, conversionGoals, campaigns, assetGroups, adsLinks, findings = [] }) {
  return { customerId, customer, conversionActions, conversionGoals, campaigns, assetGroups, adsLinks, findings };
}

export function printInventory(report) {
  const list = (items) => (items.length === 0 ? "none" : items.join(", "));

  console.log(`=== Google Ads inventory: ${report.customerId} ===\n`);

  if (report.findings.length > 0) {
    console.log(`Findings (${report.findings.length}):`);
    for (const finding of report.findings) console.log(`  ${finding}`);
    console.log("");
  }

  console.log("Customer:");
  console.log(
    report.customer
      ? `  ${report.customer.name} (${report.customer.id}), ${report.customer.currencyCode} ${report.customer.timeZone}, auto-tagging ${report.customer.autoTaggingEnabled}`
      : "  not read",
  );
  console.log("");

  console.log(`Conversion actions (${report.conversionActions.length}):`);
  for (const action of report.conversionActions) {
    console.log(`  ${action.name}: ${action.type}, ${action.category}, ${action.status}${action.primaryForGoal ? " [primary for goal]" : ""} (${action.resourceName})`);
  }
  console.log("");

  console.log(`Default conversion goals (${report.conversionGoals.length}):`);
  for (const goal of report.conversionGoals) {
    console.log(`  ${goal.category}: origin ${goal.origin}, biddable ${goal.biddable}`);
  }
  console.log("");

  console.log(`Campaigns (${report.campaigns.length}):`);
  for (const campaign of report.campaigns) {
    console.log(
      `  ${campaign.name}: ${campaign.status}, ${campaign.advertisingChannelType}, budget ${campaign.budgetAmountMicros ?? "unknown"} micros (${campaign.resourceName})`,
    );
  }
  console.log("");

  console.log(`Asset groups (${report.assetGroups.length}):`);
  for (const assetGroup of report.assetGroups) {
    console.log(`  ${assetGroup.name}: ${assetGroup.status}, campaign ${assetGroup.campaign} (${assetGroup.resourceName})`);
  }
  console.log("");

  console.log(`GA4 Ads links (${report.adsLinks.length}):`);
  for (const link of report.adsLinks) {
    console.log(`  customer ${link.customerId}: manage clients ${link.canManageClients}, ads personalization ${link.adsPersonalizationEnabled} (${link.name})`);
  }
  console.log("");
}

// --- Network calls. Not covered by the unit tests (no network in tests); the shaping
// functions above are what carry the argument-handling and output-shaping coverage. ---

async function googleAdsSearch(token, customerId, apiVersion, query) {
  const res = await fetch(`https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`${res.status} from googleAds:search: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

async function fetchGa4AdsLinks(token, propertyId) {
  const res = await fetch(`${GA4_ANALYTICS_ADMIN_V1BETA}/properties/${propertyId}/googleAdsLinks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status} from googleAdsLinks: ${(await res.text()).slice(0, 500)}`);
  return shapeAdsLinks(await res.json());
}

let cachedSecretsManagerClient = null;

function getSecretsManagerClient() {
  if (!cachedSecretsManagerClient) {
    cachedSecretsManagerClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedSecretsManagerClient;
}

async function readStoredRefreshToken(smClient, secretId) {
  try {
    const result = await smClient.send(new GetSecretValueCommand({ SecretId: secretId }));
    return JSON.parse(result.SecretString).refresh_token;
  } catch (error) {
    if (error.name === "ResourceNotFoundException") return null;
    throw error;
  }
}

async function exchangeRefreshTokenForAccessToken({ clientCredentials, refreshToken, refreshTokenSecretName, OAuth2ClientImpl = OAuth2Client }) {
  const oAuth2Client = new OAuth2ClientImpl({ clientId: clientCredentials.client_id, clientSecret: clientCredentials.client_secret });
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  const { token } = await oAuth2Client.getAccessToken();
  if (!token) {
    throw new Error(`Google did not return an access token for the stored Ads refresh token. Delete Secrets Manager secret ${refreshTokenSecretName} and run --consent again.`);
  }
  return token;
}

async function runConsent(config, clientFile) {
  const clientCredentials = await resolveClientCredentials({ clientFile, smClient: getSecretsManagerClient() });
  const refreshToken = await runLoopbackConsent({ clientCredentials, scopes: [config.scope] });
  execFileSync("scripts/put-secret-with-rotation-tag.sh", [config.refreshTokenSecretName, JSON.stringify({ refresh_token: refreshToken })], {
    stdio: "inherit",
  });
  console.log(`Stored the Ads refresh token in Secrets Manager secret ${config.refreshTokenSecretName}`);
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const config = loadConfigFromRoot();

  if (opts.consent) {
    await runConsent(config, opts.clientFile);
    return;
  }

  const clientCredentials = await resolveClientCredentials({ clientFile: opts.clientFile, smClient: getSecretsManagerClient() });
  const smClient = getSecretsManagerClient();
  const refreshToken = await readStoredRefreshToken(smClient, config.refreshTokenSecretName);
  if (!refreshToken) {
    throw new Error(`No Ads refresh token found in Secrets Manager secret ${config.refreshTokenSecretName}. Run: node infra/google/ads/ads-inventory.js --consent`);
  }
  const adsAccessToken = await exchangeRefreshTokenForAccessToken({ clientCredentials, refreshToken, refreshTokenSecretName: config.refreshTokenSecretName });

  const findings = [];
  let customer = null;
  let conversionActions = [];
  let conversionGoals = [];
  let campaigns = [];
  let assetGroups = [];
  try {
    const [customerBody, conversionActionsBody, conversionGoalsBody, campaignsBody, assetGroupsBody] = await Promise.all([
      googleAdsSearch(adsAccessToken, config.customerId, config.apiVersion, CUSTOMER_QUERY),
      googleAdsSearch(adsAccessToken, config.customerId, config.apiVersion, CONVERSION_ACTION_QUERY),
      googleAdsSearch(adsAccessToken, config.customerId, config.apiVersion, CONVERSION_GOAL_QUERY),
      googleAdsSearch(adsAccessToken, config.customerId, config.apiVersion, CAMPAIGN_QUERY),
      googleAdsSearch(adsAccessToken, config.customerId, config.apiVersion, ASSET_GROUP_QUERY),
    ]);
    customer = shapeCustomer(customerBody);
    const shapedConversions = shapeConversionActions(conversionActionsBody, conversionGoalsBody);
    conversionActions = shapedConversions.actions;
    conversionGoals = shapedConversions.goals;
    campaigns = shapeCampaigns(campaignsBody);
    assetGroups = shapeAssetGroups(assetGroupsBody);
  } catch (error) {
    const finding = findingForAccessLevel(error, config.projectId);
    if (finding === null) throw error;
    findings.push(finding);
  }

  assertFederatedCredentials();
  const ga4Token = await getAccessToken(createGoogleAuthClient(["https://www.googleapis.com/auth/analytics.readonly"]));
  const adsLinks = await fetchGa4AdsLinks(ga4Token, config.ga4PropertyId);

  const report = buildInventoryReport({ customerId: config.customerId, customer, conversionActions, conversionGoals, campaigns, assetGroups, adsLinks, findings });
  printInventory(report);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("ads-inventory failed:", err.message);
    process.exit(1);
  });
}
