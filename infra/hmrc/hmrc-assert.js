#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 *
 * Assert infra/hmrc/hmrc.toml's API subscriptions against live HMRC state. A subscription
 * cannot be added here - only the Developer Hub account holder can do that - but it can be
 * checked: an unsubscribed call answers 403 RESOURCE_FORBIDDEN, so a subscription that
 * disappears is a red build rather than a failed customer submission.
 *
 * Usage: node infra/hmrc/hmrc-assert.js --environment ci
 *        node infra/hmrc/hmrc-assert.js --environment prod
 *
 * The ci environment holds only the sandbox application's secret; prod holds both, and asserts
 * both applications.
 *
 * Credentials: each application's client secret is read from Secrets Manager at the name
 * infra/hmrc/hmrc.toml records for this environment.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export const CONFIG_PATH = "infra/hmrc/hmrc.toml";

function normalizeSubscription(entry) {
  if (!entry.api || !entry.version || !entry.probe) {
    throw new Error(`[[subscription]] entry is missing api, version or probe: ${JSON.stringify(entry)}`);
  }
  return { api: entry.api, version: entry.version, probe: entry.probe, method: entry.method ?? "GET" };
}

function normalizeApplication(name, entry) {
  if (!entry.client_id || !entry.host) {
    throw new Error(`application.${name} is missing client_id or host`);
  }
  return {
    clientId: entry.client_id,
    host: entry.host,
    redirectUris: entry.redirect_uris ?? [],
    secretByEnvironment: { ...(entry.secret ?? {}) },
    subscriptions: (entry.subscription ?? []).map(normalizeSubscription),
  };
}

/**
 * Parse infra/hmrc/hmrc.toml's two applications.
 *
 * @param {string} tomlString
 * @returns {{applications: Record<string, object>}}
 */
export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const applications = parsed.application ?? {};
  if (!applications.sandbox || !applications.production) {
    throw new Error("hmrc.toml must declare [application.sandbox] and [application.production]");
  }
  return {
    applications: {
      sandbox: normalizeApplication("sandbox", applications.sandbox),
      production: normalizeApplication("production", applications.production),
    },
  };
}

export function loadConfigFromRoot() {
  const filePath = path.join(process.cwd(), CONFIG_PATH);
  return parseConfig(fs.readFileSync(filePath, "utf-8"));
}

/**
 * Which applications a given environment asserts: ci only ever holds the sandbox
 * application's secret, so it checks sandbox alone; prod holds both applications' secrets and
 * checks both.
 *
 * @param {string} environmentName
 * @returns {string[]}
 */
export function applicationsForEnvironment(environmentName) {
  if (environmentName === "ci") return ["sandbox"];
  if (environmentName === "prod") return ["sandbox", "production"];
  throw new Error(`Unknown environment "${environmentName}" (expected ci or prod)`);
}

/**
 * Build the request a subscription probe sends, without sending it - the client-credentials
 * token request scripts/create-hmrc-test-user.js already makes, then one call per declared
 * subscription with the Accept header naming its version.
 *
 * @param {{host: string, subscription: {method: string, probe: string, version: string}, accessToken: string}} params
 * @returns {{url: string, method: string, headers: Record<string,string>}}
 */
export function probeRequest({ host, subscription, accessToken }) {
  return {
    url: `https://${host}${subscription.probe}`,
    method: subscription.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: `application/vnd.hmrc.${subscription.version}+json`,
    },
  };
}

/**
 * Classify a probe's response as proof the application is subscribed to that API, or proof
 * it is not. 403 RESOURCE_FORBIDDEN is HMRC's specific "not subscribed to this API" answer;
 * every other documented status this probe can hit (200 success, 400 a validation the probe's
 * placeholder path parameters trip, 401 a token problem unrelated to subscription, 404 the
 * placeholder resource not existing) means the gateway let the call through to the API itself,
 * which only happens once subscribed.
 *
 * @param {number} status
 * @param {{code?: string}|undefined} body
 * @returns {"subscribed"|"not-subscribed"|"unknown"}
 */
export function classifySubscriptionResponse(status, body) {
  if (status === 403 && body?.code === "RESOURCE_FORBIDDEN") {
    return "not-subscribed";
  }
  if ([200, 400, 401, 404].includes(status)) {
    return "subscribed";
  }
  return "unknown";
}

// --- Network calls. Not covered by the unit tests (decision logic only, no network). ---

async function getSecretValue(secretId) {
  const client = new SecretsManagerClient({});
  const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  return SecretString;
}

async function obtainClientCredentialsToken(host, clientId, clientSecret) {
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" });
  const response = await fetch(`https://${host}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`token request failed: ${response.status} ${JSON.stringify(responseBody)}`);
  }
  return responseBody.access_token;
}

async function assertApplication(applicationName, application, environmentName, failures) {
  console.log(`\n=== hmrc (${applicationName}, ${environmentName}) ===`);
  const secretName = application.secretByEnvironment[environmentName];
  if (!secretName) {
    failures.push(`${applicationName}: no secret recorded for environment "${environmentName}"`);
    console.error(`  no secret recorded for environment "${environmentName}"`);
    return;
  }

  let accessToken;
  try {
    const clientSecret = await getSecretValue(secretName);
    accessToken = await obtainClientCredentialsToken(application.host, application.clientId, clientSecret);
  } catch (err) {
    failures.push(`${applicationName}: token request - ${err.message}`);
    console.error(`  token request: ${err.message}`);
    return;
  }

  for (const subscription of application.subscriptions) {
    const request = probeRequest({ host: application.host, subscription, accessToken });
    try {
      const response = await fetch(request.url, { method: request.method, headers: request.headers });
      const body = await response.json().catch(() => undefined);
      const outcome = classifySubscriptionResponse(response.status, body);
      if (outcome === "subscribed") {
        console.log(`  ${subscription.api} (${subscription.version}): subscribed (${response.status})`);
      } else if (outcome === "not-subscribed") {
        failures.push(`${applicationName}/${subscription.api}: RESOURCE_FORBIDDEN, not subscribed`);
        console.error(`  ${subscription.api} (${subscription.version}): not subscribed`);
      } else {
        failures.push(`${applicationName}/${subscription.api}: unexpected ${response.status} ${JSON.stringify(body)}`);
        console.error(`  ${subscription.api} (${subscription.version}): unexpected ${response.status}`);
      }
    } catch (err) {
      failures.push(`${applicationName}/${subscription.api}: ${err.message}`);
      console.error(`  ${subscription.api}: ${err.message}`);
    }
  }
}

export async function main(argv = process.argv.slice(2)) {
  const environmentIndex = argv.indexOf("--environment");
  const environmentName = environmentIndex >= 0 ? argv[environmentIndex + 1] : null;
  if (!environmentName) {
    throw new Error("Usage: hmrc-assert.js --environment <ci|prod>");
  }

  const { applications } = loadConfigFromRoot();
  const failures = [];

  for (const applicationName of applicationsForEnvironment(environmentName)) {
    await assertApplication(applicationName, applications[applicationName], environmentName, failures);
  }

  if (failures.length > 0) {
    throw new Error(`hmrc-assert had ${failures.length} failing check(s): ${failures.join("; ")}`);
  }
  console.log("\nAll checks passed.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("hmrc-assert failed:", err.message);
    process.exit(1);
  });
}
