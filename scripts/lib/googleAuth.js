// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/googleAuth.js
//
// Shared helper for scripts that call Google Cloud REST APIs. Two ways in, chosen by
// GOOGLE_AUTH_MODE:
//
//   key (the default)  a service-account key: an env var holding the raw JSON wins for local
//                      runs, otherwise a Secrets Manager ARN env var is read, the same way
//                      app/functions/analytics/ga4EventExportPull.js resolves the GA4 key.
//   federated          no key at all: google-github-actions/auth has exchanged the workflow's
//                      OIDC token through the workload identity pool in google/identity.toml
//                      and left application default credentials behind, which GoogleAuth picks
//                      up on its own.
//
// Every caller asks for the key JSON first and builds its client from the answer, so a null
// answer is the federated path and needs no branch in the calling script.

import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { GoogleAuth } from "google-auth-library";

export const AUTH_MODES = ["key", "federated"];

/**
 * Which way the scripts authenticate to Google: "key" (the default) or "federated".
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {"key"|"federated"}
 */
export function googleAuthMode(env = process.env) {
  const mode = env.GOOGLE_AUTH_MODE || "key";
  if (!AUTH_MODES.includes(mode)) {
    throw new Error(`GOOGLE_AUTH_MODE must be one of ${AUTH_MODES.join(", ")}, got "${mode}"`);
  }
  return mode;
}

let cachedSecretsManagerClient = null;

function getSecretsManagerClient() {
  if (!cachedSecretsManagerClient) {
    cachedSecretsManagerClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedSecretsManagerClient;
}

/**
 * Resolve a Google service-account key JSON from an env var holding the raw JSON, or else
 * from AWS Secrets Manager via an env var holding the secret's ARN. In federated mode there
 * is no key: the answer is null and the client is built from application default credentials.
 *
 * @param {{ jsonEnvVar: string, arnEnvVar: string }} envVarNames
 * @returns {Promise<string|null>}
 */
export async function resolveServiceAccountCredentialsJson({ jsonEnvVar, arnEnvVar }) {
  if (googleAuthMode() === "federated") {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error("GOOGLE_AUTH_MODE=federated but GOOGLE_APPLICATION_CREDENTIALS is not set; google-github-actions/auth sets it");
    }
    return null;
  }
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
 * Build a google-auth-library client for a service-account key JSON, or from application
 * default credentials when the JSON is null (federated mode). The cloud-platform scope covers
 * every Google Cloud REST API a script needs, provided the service account's IAM roles grant
 * the underlying permission for the call it makes.
 *
 * @param {string|null} credentialsJson
 * @param {string[]} [scopes]
 * @returns {GoogleAuth}
 */
export function createGoogleAuthClient(credentialsJson, scopes = ["https://www.googleapis.com/auth/cloud-platform"]) {
  if (credentialsJson === null) {
    return new GoogleAuth({ scopes });
  }
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

/**
 * Build an authorized Google API client whose `.request({url, method, params, data})` attaches the
 * bearer token and returns `{ data }`; used by scripts that prefer a client over a raw token.
 *
 * @param {string|null} credentialsJson - the service-account key as JSON text, or null in federated mode
 * @param {string[]} scopes - OAuth scopes to request
 * @returns {Promise<import("google-auth-library").AuthClient>}
 */
export async function createGoogleAuthorizedClient(credentialsJson, scopes) {
  return createGoogleAuthClient(credentialsJson, scopes).getClient();
}
