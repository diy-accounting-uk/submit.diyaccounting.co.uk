// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/googleAuth.js
//
// Shared helper for scripts that call Google Cloud REST APIs. There is no service-account key:
// google-github-actions/auth has exchanged the workflow's OIDC token through the workload
// identity pool in google/identity.toml and left application default credentials behind, which
// GoogleAuth picks up on its own.

import { GoogleAuth } from "google-auth-library";

/**
 * Confirm application default credentials are in place before building a client from them.
 * google-github-actions/auth sets GOOGLE_APPLICATION_CREDENTIALS; a local run without it would
 * otherwise fail deep inside GoogleAuth with no clue which variable is missing.
 */
export function assertFederatedCredentials() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS is not set; google-github-actions/auth sets it");
  }
}

/**
 * Build a google-auth-library client from application default credentials. The cloud-platform
 * scope covers every Google Cloud REST API a script needs, provided the service account's IAM
 * roles grant the underlying permission for the call it makes.
 *
 * @param {string[]} [scopes]
 * @returns {GoogleAuth}
 */
export function createGoogleAuthClient(scopes = ["https://www.googleapis.com/auth/cloud-platform"]) {
  return new GoogleAuth({ scopes });
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
 * @param {string[]} scopes - OAuth scopes to request
 * @returns {Promise<import("google-auth-library").AuthClient>}
 */
export async function createGoogleAuthorizedClient(scopes) {
  return createGoogleAuthClient(scopes).getClient();
}
