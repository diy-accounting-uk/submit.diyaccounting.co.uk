// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/services/companiesHouseApi.js
// Shared client for the read-only Companies House REST API.

import { createLogger, context } from "../lib/logger.js";
import { fetchJsonWithTimeout, DEFAULT_TIMEOUTS } from "../lib/httpFetch.js";
import {
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http404NotFoundResponse,
  http429TooManyRequestsResponse,
  http500ServerErrorResponse,
} from "../lib/httpResponseHelper.js";
import { BundleAuthorizationError, BundleEntitlementError } from "./bundleManagement.js";

const logger = createLogger({ source: "app/services/companiesHouseApi.js" });

let secretsClient = null;
let cachedCompaniesHouseApiKey;

// Lazy initialization of SecretsManagerClient, mirroring retrieveHmrcClientSecret in hmrcTokenPost.js
async function getSecretsClient() {
  if (!secretsClient) {
    const { SecretsManagerClient } = await import("@aws-sdk/client-secrets-manager");
    secretsClient = new SecretsManagerClient();
  }
  return secretsClient;
}

export function getCompaniesHouseBaseUrl() {
  const base = process.env.COMPANIES_HOUSE_BASE_URI;
  if (!base || String(base).trim() === "") {
    throw new Error("Missing required environment variable COMPANIES_HOUSE_BASE_URI");
  }
  return base;
}

export async function resolveApiKey() {
  if (process.env.COMPANIES_HOUSE_API_KEY) {
    return process.env.COMPANIES_HOUSE_API_KEY;
  }
  if (!cachedCompaniesHouseApiKey) {
    const secretArn = process.env.COMPANIES_HOUSE_API_KEY_ARN;
    logger.info(`Retrieving Companies House API key from arn ${secretArn}`);
    const client = await getSecretsClient();
    const { GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    const data = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    cachedCompaniesHouseApiKey = data.SecretString;
    logger.info(`Companies House API key retrieved from Secrets Manager with Arn ${secretArn} and cached`);
  }
  return cachedCompaniesHouseApiKey;
}

export function buildCompaniesHouseHeaders(apiKey) {
  const basicAuth = Buffer.from(`${apiKey}:`).toString("base64");
  return {
    "Authorization": `Basic ${basicAuth}`,
    "Accept": "application/json",
    ...(context.get("requestId") ? { "x-request-id": context.get("requestId") } : {}),
    ...(context.get("traceparent") ? { "traceparent": context.get("traceparent") } : {}),
    ...(context.get("correlationId") ? { "x-correlationid": context.get("correlationId") } : {}),
  };
}

export async function companiesHouseHttpGet(endpoint, queryParams = {}) {
  const baseUrl = getCompaniesHouseBaseUrl();
  const apiKey = await resolveApiKey();
  const headers = buildCompaniesHouseHeaders(apiKey);

  // Sanitize query params: drop undefined, null, and blank strings
  const cleanParams = Object.fromEntries(
    Object.entries(queryParams || {}).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== ""),
  );
  const queryString = new URLSearchParams(cleanParams).toString();
  const requestUrl = `${baseUrl}${endpoint}${queryString ? `?${queryString}` : ""}`;

  logger.info({ message: `Request to GET ${requestUrl}`, url: requestUrl, headers: { ...headers, Authorization: "[redacted]" } });

  const result = await fetchJsonWithTimeout(requestUrl, { method: "GET", headers }, DEFAULT_TIMEOUTS.SHORT);

  logger.info({ message: `Response from GET ${requestUrl}`, url: requestUrl, status: result.status });

  return { ok: result.ok, status: result.status, data: result.data, headers: result.headers };
}

export function isValidCompanyNumber(value) {
  if (value === undefined || value === null) {
    return { valid: false, normalised: "" };
  }
  let normalised = String(value).trim().toUpperCase();
  if (/^\d+$/.test(normalised)) {
    normalised = normalised.padStart(8, "0");
  }
  return { valid: /^[A-Z0-9]{8}$/.test(normalised), normalised };
}

// Maps enforceBundles() failures to HTTP responses. Duplicated from hmrcApi.js rather than
// imported from it, so this module never pulls in HMRC-specific code (see the design decision
// against importing hmrcApi.js or buildFraudHeaders.js into any Companies House file).
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

export function httpResponseFromCompaniesHouseResponse(request, chResponse, responseHeaders = {}) {
  const status = chResponse.status;
  if (status === 404) {
    return http404NotFoundResponse({
      request,
      headers: { ...responseHeaders },
      message: "Not found for the specified query",
      error: { companiesHouseResponseCode: status, responseBody: chResponse.data },
    });
  }
  if (status === 429) {
    const retryAfterSeconds = chResponse.headers?.["retry-after"] || chResponse.headers?.["Retry-After"];
    return http429TooManyRequestsResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House is rate limiting our lookups",
      retryAfterSeconds,
    });
  }
  if (status === 401 || status === 403) {
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House rejected our API key",
      error: { companiesHouseResponseCode: status, responseBody: chResponse.data },
    });
  }
  return http500ServerErrorResponse({
    request,
    headers: { ...responseHeaders },
    message: "Companies House request failed",
    error: { companiesHouseResponseCode: status, responseBody: chResponse.data },
  });
}
