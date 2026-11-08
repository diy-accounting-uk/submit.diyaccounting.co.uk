// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/google-delegated-token.mjs
//
// An access token that acts as a Workspace mailbox, with no service-account key. The job
// authenticates to Google by workload identity federation (google-github-actions/auth with no
// service_account input). The federated principal holds roles/iam.serviceAccountTokenCreator on
// the delegated service account, which permits iam.serviceAccounts.signJwt. This module:
//
//   1. gets the federated access token from the credentials file that the auth step exported
//   2. asks the IAM Credentials API to sign the delegation claim set for the service account
//   3. exchanges the signed JWT at the Google token endpoint for an access token for the mailbox
//
// Every failure names its step and carries only the HTTP status and Google's error text. No token,
// JWT or claim value reaches a message.

import { GoogleAuth } from "google-auth-library";

export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const SIGN_JWT_URL = (serviceAccountEmail) =>
  `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:signJwt`;
export const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
export const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";
export const ASSERTION_LIFETIME_SECONDS = 3600;

const REFRESH_MARGIN_MS = 60 * 1000;

export class DelegationError extends Error {
  constructor(step, detail) {
    super(`Google delegation failed at ${step}: ${detail}`);
    this.name = "DelegationError";
    this.step = step;
  }
}

/** The claim set that domain-wide delegation requires, in seconds since the epoch. */
export function delegationClaims({ serviceAccountEmail, subject, scopes, nowMs }) {
  const iat = Math.floor(nowMs / 1000);
  return {
    iss: serviceAccountEmail,
    sub: subject,
    scope: scopes.join(" "),
    aud: TOKEN_URL,
    iat,
    exp: iat + ASSERTION_LIFETIME_SECONDS,
  };
}

async function googleErrorText(response) {
  const text = await response.text().catch(() => "");
  try {
    const error = JSON.parse(text).error;
    if (typeof error === "string") return `${error}`;
    return [error?.status, error?.message].filter(Boolean).join(": ") || "no error text";
  } catch {
    return "no error text";
  }
}

async function federatedAccessToken() {
  const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("no access token returned");
  return token;
}

async function signedAssertion({ serviceAccountEmail, claims, federatedToken, fetchImpl }) {
  const response = await fetchImpl(SIGN_JWT_URL(serviceAccountEmail), {
    method: "POST",
    headers: { "authorization": `Bearer ${federatedToken}`, "content-type": "application/json" },
    body: JSON.stringify({ payload: JSON.stringify(claims) }),
  });
  if (!response.ok) throw new DelegationError("signJwt", `HTTP ${response.status} ${await googleErrorText(response)}`);
  const { signedJwt } = await response.json();
  if (!signedJwt) throw new DelegationError("signJwt", "the response holds no signedJwt");
  return signedJwt;
}

async function exchangedAccessToken({ assertion, fetchImpl }) {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: JWT_BEARER_GRANT, assertion }).toString(),
  });
  if (!response.ok) throw new DelegationError("token exchange", `HTTP ${response.status} ${await googleErrorText(response)}`);
  const { access_token: accessToken, expires_in: expiresIn } = await response.json();
  if (!accessToken) throw new DelegationError("token exchange", "the response holds no access_token");
  return { accessToken, expiresInSeconds: Number(expiresIn) || ASSERTION_LIFETIME_SECONDS };
}

/**
 * Returns an async function that yields an access token for `subject`, refreshed a minute before
 * it expires. `getFederatedToken`, `fetchImpl` and `now` are the test seams.
 */
export function delegatedTokenGetter({
  serviceAccountEmail,
  subject,
  scopes,
  getFederatedToken = federatedAccessToken,
  fetchImpl = fetch,
  now = Date.now,
}) {
  let cached = null;
  return async () => {
    if (cached && now() < cached.expiresAtMs - REFRESH_MARGIN_MS) return cached.accessToken;
    let federatedToken;
    try {
      federatedToken = await getFederatedToken();
    } catch (error) {
      throw new DelegationError(
        "federation",
        `${error.message}; check the google-github-actions/auth step and its id-token: write permission`,
      );
    }
    const claims = delegationClaims({ serviceAccountEmail, subject, scopes, nowMs: now() });
    const assertion = await signedAssertion({ serviceAccountEmail, claims, federatedToken, fetchImpl });
    const { accessToken, expiresInSeconds } = await exchangedAccessToken({ assertion, fetchImpl });
    cached = { accessToken, expiresAtMs: now() + expiresInSeconds * 1000 };
    return accessToken;
  };
}
