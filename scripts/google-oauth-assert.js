#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/google-oauth-assert.js
//
// Checks google/oauth.toml's two Google OAuth clients against everything about them a live API
// can actually confirm: each client's Google Auth Platform brand (where the file declares one),
// the sign-in client id against Cognito's own copy of it in AWS, the YouTube client id against
// the Secrets Manager secret it's read from (once the file records one), and the scopes
// actually granted to the YouTube client's stored refresh token. Fails on any mismatch; never
// writes anywhere — there is nothing here for it to apply. See google/oauth.toml's header for
// what it can't check (redirect URIs, application type) and why: Google publishes no general
// API for reading a non-IAP client's own configuration back.
//
// Usage: node scripts/google-oauth-assert.js
//
// Credentials: the brand lookups use GA4_SERVICE_ACCOUNT_JSON / GA4_SERVICE_ACCOUNT_ARN through
// scripts/lib/googleAuth.js (that service account holds Owner on diyaccounting-ga4, which needs
// iap.googleapis.com enabled — see google/project.toml [apis]). The YouTube checks reuse
// scripts/youtube-upload.js's own Secrets Manager credentials and OAuth flow. The Cognito check
// uses this process's ambient AWS credentials to call CloudFormation and Cognito directly.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";
import { CognitoIdentityProviderClient, DescribeIdentityProviderCommand } from "@aws-sdk/client-cognito-identity-provider";

import { resolveServiceAccountCredentialsJson, createGoogleAuthClient, getAccessToken } from "./lib/googleAuth.js";
import { resolveClientCredentials, obtainAccessToken } from "./youtube-upload.js";

export const CONFIG_PATH = "google/oauth.toml";
const IAP_V1 = "https://iap.googleapis.com/v1";
const TOKENINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v1/tokeninfo";

// --- Config: google/oauth.toml -> { clients } ---

function normalizeClient(entry) {
  if (!entry.purpose) {
    throw new Error(`[[client]] entry is missing purpose: ${JSON.stringify(entry)}`);
  }
  const environments = entry.environment
    ? Object.fromEntries(Object.entries(entry.environment).map(([env, e]) => [env, { secret: e.secret, identityStack: e.identity_stack }]))
    : null;
  const brand = entry.brand ? { appName: entry.brand.app_name, audience: entry.brand.audience } : null;
  return {
    purpose: entry.purpose,
    id: entry.id ?? null,
    applicationType: entry.application_type ?? null,
    scopes: entry.scopes ?? [],
    redirectUris: entry.redirect_uris ?? [],
    environments,
    secret: entry.secret ?? null,
    brand,
  };
}

/**
 * Parse and validate google/oauth.toml's content.
 *
 * @param {string} tomlString
 * @returns {{clients: object[]}}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const clients = (parsed.client ?? []).map(normalizeClient);
  if (clients.length === 0) {
    throw new Error("oauth.toml has no [[client]] entries");
  }
  return { clients };
}

export function loadConfigFromRoot() {
  const filePath = path.join(process.cwd(), CONFIG_PATH);
  return parseConfig(fs.readFileSync(filePath, "utf-8"));
}

// --- Pure checks. Network-free, unit tested with fixtures. ---

/**
 * A Google OAuth client id is "<project number>-<random>.apps.googleusercontent.com" — the
 * project it was created in is encoded right in the id, so a brand lookup never needs that
 * project recorded separately in the file.
 *
 * @param {string} clientId
 * @returns {string}
 */
export function deriveProjectNumber(clientId) {
  const [projectNumber] = clientId.split("-");
  if (!/^\d+$/.test(projectNumber)) {
    throw new Error(`Could not derive a project number from client id "${clientId}" (expected "<project number>-...")`);
  }
  return projectNumber;
}

/**
 * @param {string} label
 * @param {string} configId
 * @param {string} liveId
 */
export function assertClientIdMatches(label, configId, liveId) {
  if (configId !== liveId) {
    throw new Error(`${label}: oauth.toml records id "${configId}" but the live value is "${liveId}"`);
  }
}

/**
 * @param {string} label
 * @param {{appName?: string, audience?: string}} configBrand
 * @param {{applicationTitle: string, orgInternalOnly: boolean}} liveBrand
 */
export function assertBrandMatches(label, configBrand, liveBrand) {
  const mismatches = [];
  if (configBrand.appName !== undefined && configBrand.appName !== liveBrand.applicationTitle) {
    mismatches.push(`app_name "${configBrand.appName}" vs live "${liveBrand.applicationTitle}"`);
  }
  const liveAudience = liveBrand.orgInternalOnly ? "internal" : "external";
  if (configBrand.audience !== undefined && configBrand.audience !== liveAudience) {
    mismatches.push(`audience "${configBrand.audience}" vs live "${liveAudience}"`);
  }
  if (mismatches.length > 0) {
    throw new Error(`${label} brand: ${mismatches.join("; ")}`);
  }
}

/**
 * Every scope the file declares must be present in the token's granted set — a subset check,
 * not exact equality, since Google may grant scopes this file doesn't need to track.
 *
 * @param {string} label
 * @param {string[]} configScopes
 * @param {string} grantedScopeString - the tokeninfo endpoint's space-separated `scope` field
 */
export function assertScopesGranted(label, configScopes, grantedScopeString) {
  const granted = new Set((grantedScopeString || "").split(" ").filter(Boolean));
  const missing = configScopes.filter((scope) => !granted.has(scope));
  if (missing.length > 0) {
    throw new Error(`${label}: the stored refresh token is missing scope(s) declared in oauth.toml: ${missing.join(", ")}`);
  }
}

// --- Network calls. Not covered by the unit tests (decision logic only, no network). ---

async function fetchBrand(token, projectNumber) {
  const response = await fetch(`${IAP_V1}/projects/${projectNumber}/brands`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new Error(`${response.status} from the brands lookup for project ${projectNumber}: ${(await response.text()).slice(0, 300)}`);
  }
  const data = await response.json();
  const brand = (data.brands || [])[0];
  if (!brand) {
    throw new Error(`Project ${projectNumber} has no Google Auth Platform brand`);
  }
  return { applicationTitle: brand.applicationTitle, supportEmail: brand.supportEmail, orgInternalOnly: Boolean(brand.orgInternalOnly) };
}

async function fetchCognitoGoogleClientId(identityStack) {
  const cfn = new CloudFormationClient({});
  const { Stacks } = await cfn.send(new DescribeStacksCommand({ StackName: identityStack }));
  const stack = Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack ${identityStack} not found`);
  }
  const findOutput = (key) => stack.Outputs?.find((o) => o.OutputKey === key)?.OutputValue;
  const userPoolId = findOutput("UserPoolId");
  const providerName = findOutput("CognitoGoogleIdpId");
  if (!userPoolId || !providerName) {
    throw new Error(`Stack ${identityStack} is missing the UserPoolId or CognitoGoogleIdpId output`);
  }
  const cognito = new CognitoIdentityProviderClient({});
  const { IdentityProvider } = await cognito.send(new DescribeIdentityProviderCommand({ UserPoolId: userPoolId, ProviderName: providerName }));
  const clientId = IdentityProvider?.ProviderDetails?.client_id;
  if (!clientId) {
    throw new Error(`${identityStack}'s Google identity provider has no client_id in its ProviderDetails`);
  }
  return clientId;
}

async function fetchGrantedScopes(accessToken) {
  const response = await fetch(`${TOKENINFO_ENDPOINT}?access_token=${encodeURIComponent(accessToken)}`);
  if (!response.ok) {
    throw new Error(`${response.status} from tokeninfo: ${(await response.text()).slice(0, 300)}`);
  }
  const data = await response.json();
  return data.scope || "";
}

async function checkBrand(client, googleToken, failures) {
  if (!client.brand) return;
  try {
    if (!client.id) {
      console.log("  brand: skipped (no id recorded to derive the project from)");
      return;
    }
    const projectNumber = deriveProjectNumber(client.id);
    const liveBrand = await fetchBrand(googleToken, projectNumber);
    assertBrandMatches(client.purpose, client.brand, liveBrand);
    console.log(`  brand: matches (${liveBrand.applicationTitle}, ${liveBrand.orgInternalOnly ? "internal" : "external"})`);
    if (!client.brand.supportEmail) {
      console.log(`  brand support email (not asserted, not recorded in oauth.toml): ${liveBrand.supportEmail}`);
    }
  } catch (err) {
    failures.push(`${client.purpose} brand: ${err.message}`);
    console.error(`  brand: ${err.message}`);
  }
}

async function checkSignInClient(client, failures) {
  if (client.purpose !== "sign_in" || !client.environments) return;
  for (const [environment, { identityStack }] of Object.entries(client.environments)) {
    try {
      const liveId = await fetchCognitoGoogleClientId(identityStack);
      assertClientIdMatches(`${client.purpose} (${environment})`, client.id, liveId);
      console.log(`  ${environment}: Cognito's Google identity provider client id matches`);
    } catch (err) {
      failures.push(`${client.purpose} (${environment}): ${err.message}`);
      console.error(`  ${environment}: ${err.message}`);
    }
  }
}

async function checkYoutubeClient(client, failures) {
  if (client.purpose !== "youtube_upload") return;
  try {
    const liveCredentials = await resolveClientCredentials({});
    if (client.id) {
      assertClientIdMatches(client.purpose, client.id, liveCredentials.client_id);
      console.log("  client id matches the stored secret");
    } else {
      console.log(`  client id not recorded in oauth.toml; live value is ${liveCredentials.client_id}`);
    }

    const accessToken = await obtainAccessToken({});
    const grantedScopeString = await fetchGrantedScopes(accessToken);
    assertScopesGranted(client.purpose, client.scopes, grantedScopeString);
    console.log("  stored refresh token carries every declared scope");
  } catch (err) {
    failures.push(`${client.purpose}: ${err.message}`);
    console.error(`  ${client.purpose}: ${err.message}`);
  }
}

export async function main() {
  const config = loadConfigFromRoot();
  const credentialsJson = await resolveServiceAccountCredentialsJson({ jsonEnvVar: "GA4_SERVICE_ACCOUNT_JSON", arnEnvVar: "GA4_SERVICE_ACCOUNT_ARN" });
  const googleToken = await getAccessToken(createGoogleAuthClient(credentialsJson));

  const failures = [];

  for (const client of config.clients) {
    console.log(`\n=== ${client.purpose} ===`);
    await checkBrand(client, googleToken, failures);
    await checkSignInClient(client, failures);
    await checkYoutubeClient(client, failures);
  }

  if (failures.length > 0) {
    throw new Error(`google-oauth-assert had ${failures.length} failing check(s): ${failures.join("; ")}`);
  }
  console.log("\nAll checks passed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("google-oauth-assert failed:", err.message);
    process.exit(1);
  });
}
