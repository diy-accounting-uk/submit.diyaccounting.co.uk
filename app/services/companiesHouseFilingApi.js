// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseFilingApi.js
// Shared client for the OAuth-authorised Companies House filing API. Holds what only the filing
// side needs (the bearer-token request shape, the OAuth client secret, the filing and identity
// base URLs) and imports nothing from companiesHouseApi.js, which stays the API-key client for the
// read-only lookup.

import { createLogger, context } from "../lib/logger.js";
import { fetchJsonWithTimeout, DEFAULT_TIMEOUTS } from "../lib/httpFetch.js";
import {
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http429TooManyRequestsResponse,
  http500ServerErrorResponse,
  extractBearerTokenFromAuthHeaderInLambdaEvent,
} from "../lib/httpResponseHelper.js";
import { BundleAuthorizationError, BundleEntitlementError } from "./bundleManagement.js";

const logger = createLogger({ source: "app/services/companiesHouseFilingApi.js" });

let secretsClient = null;
let cachedCompaniesHouseClientSecret;

// Lazy initialization of SecretsManagerClient; caches the secret across warm starts the same way
// companiesHouseApi.js's resolveApiKey does.
async function getSecretsClient() {
  if (!secretsClient) {
    const { SecretsManagerClient } = await import("@aws-sdk/client-secrets-manager");
    secretsClient = new SecretsManagerClient();
  }
  return secretsClient;
}

export function getFilingBaseUrl() {
  const base = process.env.COMPANIES_HOUSE_FILING_BASE_URI;
  if (!base || String(base).trim() === "") {
    throw new Error("Missing required environment variable COMPANIES_HOUSE_FILING_BASE_URI");
  }
  return base;
}

export function getIdentityBaseUrl() {
  const base = process.env.COMPANIES_HOUSE_IDENTITY_BASE_URI;
  if (!base || String(base).trim() === "") {
    throw new Error("Missing required environment variable COMPANIES_HOUSE_IDENTITY_BASE_URI");
  }
  return base;
}

export async function resolveClientSecret() {
  if (process.env.COMPANIES_HOUSE_CLIENT_SECRET) {
    return process.env.COMPANIES_HOUSE_CLIENT_SECRET;
  }
  if (!cachedCompaniesHouseClientSecret) {
    const secretArn = process.env.COMPANIES_HOUSE_CLIENT_SECRET_ARN;
    if (!secretArn) {
      throw new Error("Missing required environment variable COMPANIES_HOUSE_CLIENT_SECRET or COMPANIES_HOUSE_CLIENT_SECRET_ARN");
    }
    logger.info("Retrieving Companies House OAuth client secret from Secrets Manager");
    const client = await getSecretsClient();
    const { GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    const data = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    cachedCompaniesHouseClientSecret = data.SecretString;
    logger.info("Companies House OAuth client secret retrieved from Secrets Manager and cached");
  }
  return cachedCompaniesHouseClientSecret;
}

// Reads the user's Companies House access token from the Authorization header. The Cognito
// access token travels separately as X-Authorization, exactly like the HMRC VAT routes.
export function extractCompaniesHouseAccessTokenFromLambdaEvent(event) {
  return extractBearerTokenFromAuthHeaderInLambdaEvent(event);
}

export async function companiesHouseFilingRequest(method, path, { accessToken, body } = {}) {
  const baseUrl = getFilingBaseUrl();
  const requestUrl = `${baseUrl}${path}`;
  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "Accept": "application/json",
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(context.get("requestId") ? { "x-request-id": context.get("requestId") } : {}),
    ...(context.get("traceparent") ? { "traceparent": context.get("traceparent") } : {}),
    ...(context.get("correlationId") ? { "x-correlationid": context.get("correlationId") } : {}),
  };

  logger.info({
    message: `Request to ${method} ${requestUrl}`,
    url: requestUrl,
    method,
    headers: { ...headers, Authorization: "[redacted]" },
  });

  const result = await fetchJsonWithTimeout(
    requestUrl,
    { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) },
    DEFAULT_TIMEOUTS.SHORT,
  );

  logger.info({ message: `Response from ${method} ${requestUrl}`, url: requestUrl, status: result.status });

  return result;
}

// Maps enforceBundles() failures to HTTP responses. Duplicated rather than imported from
// companiesHouseApi.js, so this module pulls in no unrelated API-key request-signing code.
export function http403ForbiddenFromBundleEnforcement(error, request) {
  if (error instanceof BundleAuthorizationError) {
    logger.warn({ message: "Unauthorized - missing or invalid authorization token", error: error.message, details: error.details });
    return http401UnauthorizedResponse({
      request,
      message: error.message,
      error: { code: error.details?.code || "UNAUTHORIZED", ...error.details },
    });
  }
  if (!(error instanceof BundleEntitlementError)) {
    logger.error({ message: "Unexpected error during bundle enforcement", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      message: "Authorization failure while checking entitlements",
      error: { detail: error.message || String(error) },
    });
  }
  logger.warn({ message: "Forbidden - bundle entitlement missing or insufficient", error: error.message, details: error.details });
  return http403ForbiddenResponse({
    request,
    message: "Forbidden - missing or insufficient bundle entitlement",
    error: { code: error.details?.code || "BUNDLE_ENTITLEMENT_REQUIRED", ...error.details },
  });
}

// Maps a Companies House filing response to ours for the cases every filing Lambda shares: an
// expired or wrongly scoped user token, and the shared 429 rate limit. A 403, 404, 409, 422 or a
// 202 with X-Payment-Required carries a different meaning on each filing resource (a closed
// transaction, a missing registered email address, a validation failure, and so on), so each
// Lambda checks for its own special cases before falling through to this generic 500.
export function httpResponseFromFilingResponse(request, chResponse, responseHeaders = {}) {
  const status = chResponse.status;
  if (status === 401) {
    return http401UnauthorizedResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House rejected the access token",
      error: { code: "COMPANIES_HOUSE_UNAUTHORIZED", companiesHouseResponseCode: status, responseBody: chResponse.data },
    });
  }
  if (status === 429) {
    const retryAfterSeconds = chResponse.headers?.["retry-after"] || chResponse.headers?.["Retry-After"];
    return http429TooManyRequestsResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House is rate limiting our filing requests",
      retryAfterSeconds,
    });
  }
  return http500ServerErrorResponse({
    request,
    headers: { ...responseHeaders },
    message: "Companies House filing request failed",
    error: { companiesHouseResponseCode: status, responseBody: chResponse.data },
  });
}
