// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/lib/googleAuth.js
//
// Shared Google API auth helper for one-off scripts that call a Google API with a
// service-account key. The key JSON never touches a log line: callers pass it straight
// through from an environment variable (itself populated from AWS Secrets Manager), and
// this module hands it only to google-auth-library, which attaches the bearer token to
// each request internally.

import { GoogleAuth } from "google-auth-library";

/**
 * Build an authorized Google API client from a service-account key.
 *
 * @param {string} credentialsJson - the service-account key, as JSON text
 * @param {string[]} scopes - OAuth scopes to request, e.g.
 *   ["https://www.googleapis.com/auth/analytics.edit"]
 * @returns {Promise<import("google-auth-library").JWT>} a client whose `.request({url, method, params, data})`
 *   call attaches the bearer token and returns `{ data }` on success
 */
export async function createGoogleAuthorizedClient(credentialsJson, scopes) {
  const credentials = JSON.parse(credentialsJson);
  const auth = new GoogleAuth({ credentials, scopes });
  return auth.getClient();
}
