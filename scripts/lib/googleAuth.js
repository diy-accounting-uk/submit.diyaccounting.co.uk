// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/googleAuth.js
//
// Shared helper for scripts that call Google Cloud REST APIs with a service-account key held
// in AWS Secrets Manager. Resolves the key the same way app/functions/analytics/ga4EventExportPull.js
// resolves the GA4 service account: an env var holding the raw JSON wins for local runs,
// otherwise a Secrets Manager ARN env var is read.

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { GoogleAuth } from "google-auth-library";

let cachedSecretsManagerClient = null;

function getSecretsManagerClient() {
  if (!cachedSecretsManagerClient) {
    cachedSecretsManagerClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedSecretsManagerClient;
}

/**
 * Resolve a Google service-account key JSON from an env var holding the raw JSON, or else
 * from AWS Secrets Manager via an env var holding the secret's ARN.
 *
 * @param {{ jsonEnvVar: string, arnEnvVar: string }} envVarNames
 * @returns {Promise<string>}
 */
export async function resolveServiceAccountCredentialsJson({ jsonEnvVar, arnEnvVar }) {
  const rawJson = process.env[jsonEnvVar];
  if (rawJson) {
    return rawJson;
  }
  const arn = process.env[arnEnvVar];
  if (!arn) {
    throw new Error(`Neither ${jsonEnvVar} nor ${arnEnvVar} is set`);
  }
  const result = await getSecretsManagerClient().send(new GetSecretValueCommand({ SecretId: arn }));
  return result.SecretString;
}

/**
 * Build a google-auth-library client for a service-account key JSON. The cloud-platform scope
 * covers every Google Cloud REST API a script needs, provided the service account's IAM roles
 * grant the underlying permission for the call it makes.
 *
 * @param {string} credentialsJson
 * @param {string[]} [scopes]
 * @returns {GoogleAuth}
 */
export function createGoogleAuthClient(credentialsJson, scopes = ["https://www.googleapis.com/auth/cloud-platform"]) {
  const credentials = JSON.parse(credentialsJson);
  return new GoogleAuth({ credentials, scopes });
}

/**
 * Get a bearer access token for a plain `fetch` call against a Google Cloud REST API.
 *
 * @param {GoogleAuth} googleAuth
 * @returns {Promise<string>}
 */
export async function getAccessToken(googleAuth) {
  const client = await googleAuth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) {
    throw new Error("Google auth client returned no access token");
  }
  return token;
}
