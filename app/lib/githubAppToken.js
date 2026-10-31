// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-85 Obtain and use GitHub App API tokens
// - **Use when:** a script or Lambda must call the GitHub API and needs a short-lived App installation token.
// - **Does:** githubAppToken.js mints short-lived GitHub App installation tokens for API access. gitHubHelpers.js provides higher-level helpers built on top of them, such as creating issues, comments and releases.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/lib/githubAppToken.js:getInstallationAccessToken`; `app/lib/gitHubHelpers.js:appendAutomationDisclosure`
// - **Files:** app/lib/githubAppToken.js, app/lib/gitHubHelpers.js, app/unit-tests/lib/gitHubHelpers.test.js, app/unit-tests/lib/githubAppToken.test.js
// - **Keywords:** github app token, installation token, github api, issues and comments, releases, github helpers
// - **Related:** OPS-71
// @end-capability

// app/lib/githubAppToken.js
//
// Mints a GitHub App installation access token: a short-lived App JWT (RS256, node:crypto),
// exchanged for an installation token scoped to the caller's own repository, so a Lambda holds
// only the App's private key and never a long-lived token.
//
// Tokens are cached per (installation id, repositories, permissions) until 5 minutes before GitHub's own
// expires_at, so a warm Lambda container mints one token an hour rather than one per invocation.

import { createSign } from "node:crypto";

// GitHub rejects a JWT whose iat is in the future if the caller's clock runs even slightly
// ahead of GitHub's, so iat is backdated by this much. exp is capped at 10 minutes by GitHub;
// 9 minutes leaves margin for the exchange call itself to complete before the JWT expires.
const JWT_ISSUED_AT_SKEW_SECONDS = 60;
const JWT_EXPIRY_SECONDS = 9 * 60;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

const tokenCache = new Map();

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function buildAppJwt({ appId, privateKey, nowMs }) {
  const nowSeconds = Math.floor(nowMs / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: nowSeconds - JWT_ISSUED_AT_SKEW_SECONDS,
    exp: nowSeconds + JWT_EXPIRY_SECONDS,
    iss: appId,
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function cacheKey(installationId, repositories, permissions) {
  const sortedRepos = repositories && repositories.length > 0 ? [...repositories].sort().join(",") : "";
  const sortedPermissions = permissions
    ? Object.keys(permissions)
        .sort()
        .map((name) => `${name}:${permissions[name]}`)
        .join(",")
    : "";
  return `${installationId}::${sortedRepos}::${sortedPermissions}`;
}

/**
 * Mints, or reuses a cached, GitHub App installation access token.
 *
 * @param {Object} params
 * @param {string} params.appId - the GitHub App's id
 * @param {string} params.privateKey - the App's PEM-encoded RSA private key
 * @param {string} params.installationId - the App's installation id
 * @param {string[]} [params.repositories] - repository names (not owner/name) to scope the
 *   token to; omitted entirely, the token can reach every repository the installation covers
 * @param {Object<string,string>} [params.permissions] - permission name to access level (for
 *   example `{ issues: "write" }`) to narrow the token below the installation's own grant;
 *   omitted, the token carries everything the installation holds
 * @param {typeof fetch} [params.fetchImpl]
 * @returns {Promise<string>} the installation access token
 */
export async function getInstallationAccessToken({ appId, privateKey, installationId, repositories, permissions, fetchImpl = fetch }) {
  const key = cacheKey(installationId, repositories, permissions);
  const cached = tokenCache.get(key);
  const nowMs = Date.now();
  if (cached && cached.expiresAtMs - TOKEN_REFRESH_MARGIN_MS > nowMs) {
    return cached.token;
  }

  const jwt = buildAppJwt({ appId, privateKey, nowMs });
  const headers = {
    "Authorization": `Bearer ${jwt}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const hasRepositories = Array.isArray(repositories) && repositories.length > 0;
  const hasPermissions = permissions && Object.keys(permissions).length > 0;
  const requestInit = { method: "POST", headers };
  if (hasRepositories || hasPermissions) {
    headers["Content-Type"] = "application/json";
    requestInit.body = JSON.stringify({
      ...(hasRepositories ? { repositories } : {}),
      ...(hasPermissions ? { permissions } : {}),
    });
  }

  const response = await fetchImpl(`https://api.github.com/app/installations/${installationId}/access_tokens`, requestInit);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error minting installation access token: ${response.status} ${errorText}`);
  }

  const body = await response.json();
  tokenCache.set(key, { token: body.token, expiresAtMs: Date.parse(body.expires_at) });
  return body.token;
}
