#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 *
 * Assert infra/companies-house/companies-house.toml against what a live call can prove: each
 * client id and redirect pair authorises without a 400, the REST API key answers a
 * public-data call, and the client id recorded here matches the deployed .env file. Read-only:
 * there is nothing here for it to apply, because the Companies House developer hub publishes
 * no application-management API.
 *
 * Usage: node infra/companies-house/companies-house-assert.js --environment ci
 *        node infra/companies-house/companies-house-assert.js --environment prod
 *
 * Credentials: the REST API key is read from Secrets Manager at the ARN this environment's
 * .env file names in COMPANIES_HOUSE_API_KEY_ARN.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";
import dotenv from "dotenv";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export const CONFIG_PATH = "infra/companies-house/companies-house.toml";

// A public, non-dissolved test company Companies House documents for exactly this purpose.
export const REST_PROBE_COMPANY_NUMBER = "00000006";

/**
 * Parse infra/companies-house/companies-house.toml's per-environment applications.
 *
 * @param {string} tomlString
 * @returns {{environments: Record<string, object>}}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const environments = parsed.environment ?? {};
  if (Object.keys(environments).length === 0) {
    throw new Error("companies-house.toml has no [environment.*] entries");
  }
  const result = {};
  for (const [name, entry] of Object.entries(environments)) {
    if (!entry.client_id || !entry.identity_base_uri || !entry.rest_base_uri) {
      throw new Error(`environment.${name} is missing client_id, identity_base_uri or rest_base_uri`);
    }
    result[name] = {
      applicationName: entry.application_name,
      clientId: entry.client_id,
      restBaseUri: entry.rest_base_uri,
      identityBaseUri: entry.identity_base_uri,
      xmlgwUri: entry.xmlgw_uri || null,
      redirectUris: entry.redirect_uris ?? [],
      secrets: {
        apiKey: entry.secrets?.api_key ?? null,
        clientSecret: entry.secrets?.client_secret ?? null,
        presenterId: entry.secrets?.presenter_id || null,
        presenterCode: entry.secrets?.presenter_code || null,
      },
    };
  }
  return { environments: result };
}

export function loadConfigFromRoot() {
  const filePath = path.join(process.cwd(), CONFIG_PATH);
  return parseConfig(fs.readFileSync(filePath, "utf-8"));
}

/**
 * The scope Companies House's identity service expects on a filing sign-in: the profile
 * scope plus one company-and-resource scope, matching what
 * web/public/lib/services/companies-house-filing-service.js builds for a real filing. The
 * probe names a resource nobody will ever authorise against, so this call only exercises
 * whether the client id and redirect pair are accepted, not a real consent.
 *
 * @param {string} identityBaseUri
 * @returns {string}
 */
export function probeScope(identityBaseUri) {
  return `${identityBaseUri.replace(/\/$/, "")}/user/profile.read`;
}

/**
 * Build the /oauth2/authorise URL exactly as web/public/lib/auth-url-builder.js's
 * buildCompaniesHouseAuthUrl does, so a live GET exercises the same request a browser sends.
 *
 * @param {{identityBaseUri: string, clientId: string, redirectUri: string, scope: string, state: string}} params
 * @returns {string}
 */
export function authoriseUrl({ identityBaseUri, clientId, redirectUri, scope, state }) {
  return (
    `${identityBaseUri.replace(/\/$/, "")}/oauth2/authorise` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`
  );
}

/**
 * A 400 from /oauth2/authorise means the client id or the redirect URI is not registered.
 * Companies House's identity service answers a redirect (manual, so fetch reports it as an
 * opaque 3xx) or a 200 consent page for a valid pair, since no user is signed in for this
 * check to reach further than that.
 *
 * @param {number} status
 * @returns {"registered"|"not-registered"}
 */
export function classifyAuthoriseResponse(status) {
  if (status === 400) {
    return "not-registered";
  }
  return "registered";
}

// --- Network calls. Not covered by the unit tests (decision logic only, no network). ---

async function getSecretValue(secretId) {
  const client = new SecretsManagerClient({});
  const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  return SecretString;
}

async function checkAuthorise(environmentName, config, failures) {
  for (const redirectUri of config.redirectUris) {
    const url = authoriseUrl({
      identityBaseUri: config.identityBaseUri,
      clientId: config.clientId,
      redirectUri,
      scope: probeScope(config.identityBaseUri),
      state: "infra-assert",
    });
    try {
      const response = await fetch(url, { redirect: "manual" });
      const outcome = classifyAuthoriseResponse(response.status);
      if (outcome === "not-registered") {
        failures.push(`${environmentName}: ${redirectUri} answered 400 from /oauth2/authorise (not registered)`);
        console.error(`  ${redirectUri}: not registered (400)`);
      } else {
        console.log(`  ${redirectUri}: registered (${response.status})`);
      }
    } catch (err) {
      failures.push(`${environmentName}: ${redirectUri} - ${err.message}`);
      console.error(`  ${redirectUri}: ${err.message}`);
    }
  }
}

async function checkRestApiKey(environmentName, config, failures) {
  if (!config.secrets.apiKey) {
    console.log("  REST API key: skipped, no secret recorded");
    return;
  }
  try {
    const apiKey = await getSecretValue(config.secrets.apiKey);
    const basicAuth = Buffer.from(`${apiKey}:`).toString("base64");
    const response = await fetch(`${config.restBaseUri.replace(/\/$/, "")}/company/${REST_PROBE_COMPANY_NUMBER}`, {
      headers: { Authorization: `Basic ${basicAuth}` },
    });
    if (!response.ok) {
      failures.push(`${environmentName}: REST API key answered ${response.status} for company ${REST_PROBE_COMPANY_NUMBER}`);
      console.error(`  REST API key: ${response.status}`);
    } else {
      console.log(`  REST API key: 200 for company ${REST_PROBE_COMPANY_NUMBER}`);
    }
  } catch (err) {
    failures.push(`${environmentName}: REST API key check - ${err.message}`);
    console.error(`  REST API key: ${err.message}`);
  }
}

function checkClientIdMatchesEnvFile(environmentName, config, failures) {
  const envFile = path.join(process.cwd(), `.env.${environmentName}`);
  if (!fs.existsSync(envFile)) {
    console.log(`  .env.${environmentName}: skipped, file not found`);
    return;
  }
  const parsed = dotenv.parse(fs.readFileSync(envFile, "utf-8"));
  const liveClientId = parsed.COMPANIES_HOUSE_CLIENT_ID;
  if (liveClientId !== config.clientId) {
    failures.push(
      `${environmentName}: companies-house.toml records client_id "${config.clientId}" but .env.${environmentName} has "${liveClientId}"`,
    );
    console.error(`  .env.${environmentName}: client id mismatch`);
  } else {
    console.log(`  .env.${environmentName}: client id matches`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const environmentIndex = argv.indexOf("--environment");
  const environmentName = environmentIndex >= 0 ? argv[environmentIndex + 1] : null;
  if (!environmentName) {
    throw new Error("Usage: companies-house-assert.js --environment <ci|prod>");
  }

  const { environments } = loadConfigFromRoot();
  const config = environments[environmentName];
  if (!config) {
    throw new Error(`companies-house.toml has no [environment.${environmentName}]`);
  }

  console.log(`\n=== companies-house (${environmentName}) ===`);
  const failures = [];
  await checkAuthorise(environmentName, config, failures);
  await checkRestApiKey(environmentName, config, failures);
  checkClientIdMatchesEnvFile(environmentName, config, failures);

  if (failures.length > 0) {
    throw new Error(`companies-house-assert had ${failures.length} failing check(s): ${failures.join("; ")}`);
  }
  console.log("\nAll checks passed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("companies-house-assert failed:", err.message);
    process.exit(1);
  });
}
