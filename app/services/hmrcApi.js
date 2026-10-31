// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability HMRC-29 Call the HMRC API
// - **Use when:** a Lambda or browser page must call an HMRC endpoint and classify the response.
// - **Does:** app/services/hmrcApi.js builds HMRC request headers and issues hmrcHttpGet, hmrcHttpPost, hmrcHttpPut and hmrcHttpDelete. It classifies HMRC error responses into the application's own 401, 403, 404 and 500 responses. hmrc-service.js is its browser counterpart, wrapping every HMRC endpoint behind one authorizedFetch-based client.
// - **Run:** `import { hmrcHttpGet, hmrcHttpPost } from "app/services/hmrcApi.js"`; `import from "web/public/lib/services/hmrc-service.js"`
// - **Entry:** `app/services/hmrcApi.js:hmrcHttpGet`; `app/services/hmrcApi.js:validateHmrcAccessToken`; `web/public/lib/services/hmrc-service.js`
// - **Files:** app/services/hmrcApi.js, app/unit-tests/services/hmrcApi.test.js, web/public/lib/services/hmrc-service.js, web/unit-tests/hmrc-service.test.js
// - **Keywords:** hmrc http client, error classification, access token validation, authorizedfetch, hmrc-service
// - **Related:** HMRC-25, HMRC-30
// @end-capability

// app/services/hmrcApi.js

import { v4 as uuidv4 } from "uuid";
import { createLogger, context } from "../lib/logger.js";
import { BundleEntitlementError, BundleAuthorizationError } from "./bundleManagement.js";
import {
  http400BadRequestResponse,
  http500ServerErrorResponse,
  http403ForbiddenResponse,
  http404NotFoundResponse,
  http401UnauthorizedResponse,
} from "../lib/httpResponseHelper.js";
import { putHmrcApiRequest } from "../data/dynamoDbHmrcApiRequestRepository.js";

/**
 * Get a header value case-insensitively from a headers object.
 * @param {object} headers - The headers object
 * @param {string} name - The header name to look for
 * @returns {string|null} The header value or null if not found
 */
function getHeader(headers, name) {
  if (!headers || !name) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return null;
}
import { getHmrcErrorMessage, extractHmrcErrorCode } from "../lib/hmrcValidation.js";

const logger = createLogger({ source: "app/services/hmrcApi.js" });

export function getHmrcBaseUrl(hmrcAccount) {
  const isSynthetic = hmrcAccount === "synthetic";
  const base = isSynthetic ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  if (!base || String(base).trim() === "") {
    throw new Error(`Missing required environment variable ${isSynthetic ? "HMRC_SANDBOX_BASE_URI" : "HMRC_BASE_URI"}`);
  }
  return base;
}

export function buildHmrcHeaders(
  accessToken,
  govClientHeaders = {},
  testScenario = undefined,
  requestId = undefined,
  traceparent = undefined,
  correlationId = undefined,
  apiVersion = "1.0",
) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": `application/vnd.hmrc.${apiVersion}+json`,
    "Authorization": `Bearer ${accessToken}`,
    "x-request-id": requestId,
    "traceparent": traceparent,
    "x-correlationid": correlationId,
    ...govClientHeaders,
  };

  // Add Gov-Test-Scenario header // && isSyntheticBase(getHmrcBaseUrl()) if provided and we're in synthetic mode
  if (testScenario) {
    headers["Gov-Test-Scenario"] = testScenario;
  }

  return headers;
}

export class UnauthorizedTokenError extends Error {
  constructor(message = "Unauthorized - invalid or expired HMRC access token") {
    super(message);
    this.name = "UnauthorizedTokenError";
  }
}

export function extractHmrcAccessTokenFromLambdaEvent(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.split(" ")[1];
}

export function validateHmrcAccessToken(hmrcAccessToken) {
  // Test hook to force Unauthorized for coverage
  if (process.env.TEST_FORCE_UNAUTHORIZED_TOKEN === "true") {
    throw new UnauthorizedTokenError();
  }
  // Validate access token format
  const tokenValidation = {
    hasAccessToken: !!hmrcAccessToken,
    accessTokenLength: hmrcAccessToken ? hmrcAccessToken.length : 0,
    accessTokenPrefix: hmrcAccessToken ? hmrcAccessToken.substring(0, 8) + "..." : "none",
    isValidFormat: hmrcAccessToken && typeof hmrcAccessToken === "string" && hmrcAccessToken.length > 10,
  };
  logger.info({
    message: "Validating access token",
    tokenValidation,
  });
  if (!hmrcAccessToken || typeof hmrcAccessToken !== "string" || hmrcAccessToken.length < 2) {
    logger.error({
      message: "Invalid access token provided",
      tokenValidation,
      error: "Access token is missing, not a string, or too short",
    });
    // Keep existing behavior for tests: throw a generic Error to produce HTTP 400
    throw new Error("Invalid access token provided");
  }
}

/**
 * Validate fraud prevention headers for synthetic HMRC accounts.
 * Calls the HMRC Test Fraud Prevention Headers API to validate headers before making actual API calls.
 *
 * This is a fire-and-forget validation that logs results but does not block the main API request.
 * The validation helps identify header issues during development and testing.
 *
 * @param {string} accessToken - HMRC OAuth access token
 * @param {Object} govClientHeaders - Gov-Client-* fraud prevention headers
 * @param {string|null} auditForUserSub - User sub for auditing to DynamoDB
 * @param {string|null} requestId - Optional request ID to use for the validation request
 * @param {string|null} traceparent - Optional traceparent header for distributed tracing
 * @param {string|null} correlationId - Optional correlation ID for tracing
 * @returns {Promise<Object>} Validation result with isValid flag and response details
 */
export async function validateFraudPreventionHeaders(
  accessToken,
  govClientHeaders = {},
  auditForUserSub = null,
  requestId = undefined,
  traceparent = undefined,
  correlationId = undefined,
) {
  const hmrcBase = process.env.HMRC_SANDBOX_BASE_URI || "https://test-api.service.hmrc.gov.uk";
  const validationUrl = `${hmrcBase}/test/fraud-prevention-headers/validate`;
  const nonValidatedHeaders = ["gov-test-scenario"];
  const govClientHeadersWithoutNonValidated = Object.fromEntries(
    Object.entries(govClientHeaders).filter(([key]) => !nonValidatedHeaders.includes(key.toLowerCase())),
  );
  const headers = {
    "Accept": "application/vnd.hmrc.1.0+json",
    "Authorization": `Bearer ${accessToken}`,
    ...govClientHeadersWithoutNonValidated,
    "x-request-id": requestId,
    "traceparent": traceparent,
    "x-correlationid": correlationId,
  };

  logger.info({
    message: `Validating fraud prevention headers`,
    url: validationUrl,
    headers: Object.keys(govClientHeaders),
  });

  // Prepare request object and capture duration
  const httpRequest = { method: "GET", headers };
  let duration = 0;
  const controller = new AbortController();
  const timeoutMs = 20000;
  const timeout = setTimeout(() => controller.abort(), Number(timeoutMs));

  try {
    const startTime = Date.now();
    const response = await fetch(validationUrl, { method: "GET", headers, signal: controller.signal });
    duration = Date.now() - startTime;

    const responseBody = await response.json().catch(() => ({}));

    // Normalise response headers to a plain object (Headers is not marshallable)
    let responseHeadersObj = {};
    try {
      if (response && typeof response.headers?.forEach === "function") {
        response.headers.forEach((value, key) => {
          responseHeadersObj[key] = value;
        });
      } else if (response?.headers && typeof response.headers === "object") {
        responseHeadersObj = { ...response.headers };
      }
    } catch (error) {
      logger.error({
        message: "Error normalizing HMRC response headers",
        error: error.message,
        stack: error.stack,
      });
    }

    logger.info({
      message: `Fraud prevention header validation response`,
      status: response.status,
      code: responseBody.code,
      validationMessage: responseBody.message,
    });

    // Log any errors or warnings from the validation
    if (responseBody.errors && responseBody.errors.length > 0) {
      logger.warn({
        message: "Fraud prevention header validation errors",
        errors: responseBody.errors,
      });
    }
    if (responseBody.warnings && responseBody.warnings.length > 0) {
      logger.warn({
        message: "Fraud prevention header validation warnings",
        warnings: responseBody.warnings,
      });
    }

    // Audit request/response to DynamoDB
    const httpResponse = {
      statusCode: response.status,
      headers: responseHeadersObj,
      body: responseBody,
    };
    const userSubOrUuid = auditForUserSub || `unknown-user-${uuidv4()}`;
    try {
      await putHmrcApiRequest(userSubOrUuid, { url: validationUrl, httpRequest, httpResponse, duration });
      // await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
    } catch (auditError) {
      logger.error({
        message: "Error auditing HMRC API request/response to DynamoDB",
        error: auditError.message,
        stack: auditError.stack,
      });
    }

    return {
      isValid: response.ok && responseBody.code === "VALID_HEADERS",
      response: responseBody,
      status: response.status,
    };
  } catch (error) {
    clearTimeout(timeout);
    logger.error({
      message: "Error validating fraud prevention headers",
      error: error.message,
      stack: error.stack,
    });
    // Optionally audit failed attempt even if fetch throws before response
    const userSubOrUuid = auditForUserSub || `unknown-user-${uuidv4()}`;
    try {
      await putHmrcApiRequest(userSubOrUuid, {
        url: validationUrl,
        httpRequest,
        httpResponse: { statusCode: 0, headers: {}, body: { error: error.message } },
        duration,
      });
      // await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
    } catch (auditError) {
      logger.error({
        message: "Error auditing HMRC API request/response to DynamoDB",
        error: auditError.message,
        stack: auditError.stack,
      });
    }
    // Don't fail the main request if validation fails
    return {
      isValid: false,
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get validation feedback for fraud prevention headers from HMRC test API.
 * This retrieves feedback on all requests made to a specific API.
 *
 * @param {string} api - The API name (e.g., 'vat-mtd')
 * @param {string} accessToken - HMRC OAuth access token
 * @param {string} auditForUserSub - User sub for auditing to DynamoDB
 * @param {string|null} requestId - Optional request ID to use for the validation request
 * @param {string|null} traceparent - Optional traceparent header for distributed tracing
 * @param {string|null} correlationId - Optional correlation ID for tracing
 * @returns {Promise<Object>} Validation feedback
 */
export async function getFraudPreventionHeadersFeedback(
  api,
  accessToken,
  auditForUserSub,
  requestId = undefined,
  traceparent = undefined,
  correlationId = undefined,
) {
  const hmrcBase = process.env.HMRC_SANDBOX_BASE_URI || "https://test-api.service.hmrc.gov.uk";
  const feedbackUrl = `${hmrcBase}/test/fraud-prevention-headers/${api}/validation-feedback`;

  const headers = {
    "Accept": "application/vnd.hmrc.1.0+json",
    "Authorization": `Bearer ${accessToken}`,
    "x-request-id": requestId,
    "traceparent": traceparent,
    "x-correlationid": correlationId,
  };

  logger.info({
    message: `Getting fraud prevention headers validation feedback`,
    url: feedbackUrl,
    api,
  });

  const httpRequest = { method: "GET", headers };
  let duration = 0;
  const controller = new AbortController();
  const timeoutMs = 20000;
  const timeout = setTimeout(() => controller.abort(), Number(timeoutMs));

  try {
    const startTime = Date.now();
    const response = await fetch(feedbackUrl, { method: "GET", headers, signal: controller.signal });
    duration = Date.now() - startTime;

    const responseBody = await response.json().catch(() => ({}));

    // Normalise response headers to a plain object (Headers is not marshallable)
    let responseHeadersObj = {};
    try {
      if (response && typeof response.headers?.forEach === "function") {
        response.headers.forEach((value, key) => {
          responseHeadersObj[key] = value;
        });
      } else if (response?.headers && typeof response.headers === "object") {
        responseHeadersObj = { ...response.headers };
      }
    } catch (error) {
      logger.error({
        message: "Error normalizing HMRC response headers",
        error: error.message,
        stack: error.stack,
      });
    }

    logger.info({
      message: `Fraud prevention header validation feedback response`,
      status: response.status,
      feedback: responseBody,
    });

    const httpResponse = {
      statusCode: response.status,
      headers: responseHeadersObj,
      body: responseBody,
    };
    const userSubOrUuid = auditForUserSub || `unknown-user-${uuidv4()}`;
    try {
      // await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
      await putHmrcApiRequest(userSubOrUuid, { url: feedbackUrl, httpRequest, httpResponse, duration });
    } catch (auditError) {
      logger.error({
        message: "Error auditing HMRC API request/response to DynamoDB",
        error: auditError.message,
        stack: auditError.stack,
      });
    }

    return {
      ok: response.ok,
      status: response.status,
      feedback: responseBody,
    };
  } catch (error) {
    clearTimeout(timeout);
    logger.error({
      message: "Error getting fraud prevention headers validation feedback",
      error: error.message,
      stack: error.stack,
    });
    try {
      await putHmrcApiRequest(auditForUserSub, {
        url: feedbackUrl,
        httpRequest,
        httpResponse: { statusCode: 0, headers: {}, body: { error: error.message } },
        duration,
      });
    } catch (auditError) {
      logger.error({
        message: "Error auditing HMRC API request/response to DynamoDB",
        error: auditError.message,
        stack: auditError.stack,
      });
    }
    return {
      ok: false,
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function hmrcHttpGet(
  endpoint,
  hmrcRequestHeaders,
  govClientHeaders = {},
  testScenario = null,
  hmrcAccount,
  queryParams = {},
  auditForUserSub,
) {
  const baseUrl = getHmrcBaseUrl(hmrcAccount);
  // Sanitize query params: drop undefined, null, and blank strings
  const cleanParams = Object.fromEntries(
    Object.entries(queryParams || {}).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== ""),
  );
  const queryString = new URLSearchParams(cleanParams).toString();
  // eslint-disable-next-line sonarjs/no-nested-template-literals
  const hmrcRequestUrl = `${baseUrl}${endpoint}${queryString ? `?${queryString}` : ""}`;
  const httpRequest = {
    method: "GET",
    headers: {
      ...hmrcRequestHeaders,
      ...govClientHeaders,
      ...(context.get("requestId") ? { "x-request-id": context.get("requestId") } : {}),
      ...(context.get("amznTraceId") ? { "x-amzn-trace-id": context.get("amznTraceId") } : {}),
      ...(context.get("traceparent") ? { traceparent: context.get("traceparent") } : {}),
    },
  };
  // Ensure x-correlationid is set; prefer existing header, otherwise mirror requestId/correlationId from context
  if (!getHeader(httpRequest.headers, "x-correlationid")) {
    const cid = context.get("correlationId") || context.get("requestId");
    if (cid) httpRequest.headers["x-correlationid"] = cid;
  }

  logger.info({
    message: `Request to GET ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    ...httpRequest,
    testScenario,
    environment: {
      hmrcBase: baseUrl,
      // nodeEnv: process.env.NODE_ENV,
    },
  });

  let duration = 0;
  let hmrcResponse;
  const timeoutMs = hmrcRequestTimeoutMillis(HMRC_WORKER_READ_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const startTime = Date.now();
    hmrcResponse = await fetch(hmrcRequestUrl, { ...httpRequest, signal: controller.signal });
    duration = Date.now() - startTime;
  } catch (error) {
    throw toHmrcTimeoutError(error, "GET", hmrcRequestUrl, timeoutMs);
  } finally {
    clearTimeout(timeout);
  }

  const hmrcResponseBody = await hmrcResponse.json().catch(() => ({}));

  // Normalise response headers to a plain object (Headers is not marshallable)
  let responseHeadersObj = {};
  try {
    if (hmrcResponse && typeof hmrcResponse.headers?.forEach === "function") {
      hmrcResponse.headers.forEach((value, key) => {
        responseHeadersObj[key] = value;
      });
    } else if (hmrcResponse?.headers && typeof hmrcResponse.headers === "object") {
      responseHeadersObj = { ...hmrcResponse.headers };
    }
  } catch (error) {
    logger.error({
      message: "Error normalizing HMRC response headers",
      error: error.message,
      stack: error.stack,
    });
  }

  logger.info({
    message: `Response from GET ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    status: hmrcResponse.status,
    hmrcResponseBody,
  });

  const httpResponse = {
    statusCode: hmrcResponse.status,
    headers: responseHeadersObj,
    body: hmrcResponseBody,
  };
  const userSubOrUuid = auditForUserSub || `unknown-user-${uuidv4()}`;
  try {
    await putHmrcApiRequest(userSubOrUuid, { url: hmrcRequestUrl, httpRequest, httpResponse, duration });
  } catch (auditError) {
    logger.error({
      message: "Error auditing HMRC API request/response to DynamoDB",
      error: auditError.message,
      stack: auditError.stack,
    });
  }

  return {
    ok: hmrcResponse.ok,
    status: hmrcResponse.status,
    data: hmrcResponseBody,
    response: hmrcResponse,
  };
}

// An API Gateway request is cut at 29 s and the ingest Lambda at 28 s. A call to HMRC made
// inline in an ingest Lambda is aborted at 25 s, leaving time to audit the call and answer JSON.
export const HMRC_INGEST_REQUEST_TIMEOUT_MS = 25000;
// An SQS worker Lambda has its own, longer timeout.
const HMRC_WORKER_READ_TIMEOUT_MS = 115000;
const HMRC_WORKER_WRITE_TIMEOUT_MS = 295000;

export class HmrcTimeoutError extends Error {
  constructor(method, url, timeoutMs) {
    super(`HMRC did not answer ${method} ${url} within ${timeoutMs} ms`);
    this.name = "HmrcTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

function hmrcRequestTimeoutMillis(workerTimeoutMillis) {
  return context.get("sqsWorker") ? workerTimeoutMillis : HMRC_INGEST_REQUEST_TIMEOUT_MS;
}

function toHmrcTimeoutError(error, method, url, timeoutMs) {
  return error?.name === "AbortError" ? new HmrcTimeoutError(method, url, timeoutMs) : error;
}

export async function hmrcHttpPost(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub) {
  return hmrcHttpWriteRequest("POST", hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub);
}

export async function hmrcHttpPut(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub) {
  return hmrcHttpWriteRequest("PUT", hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub);
}

export async function hmrcHttpDelete(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, auditForUserSub) {
  return hmrcHttpWriteRequest("DELETE", hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, undefined, auditForUserSub);
}

async function hmrcHttpWriteRequest(method, hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub) {
  let hmrcResponse;
  const httpRequest = {
    method,
    headers: {
      ...hmrcRequestHeaders,
      ...govClientHeaders,
      ...(context.get("requestId") ? { "x-request-id": context.get("requestId") } : {}),
      ...(context.get("amznTraceId") ? { "x-amzn-trace-id": context.get("amznTraceId") } : {}),
      ...(context.get("traceparent") ? { traceparent: context.get("traceparent") } : {}),
    },
    body: JSON.stringify(hmrcRequestBody),
  };
  // Ensure x-correlationid is set; prefer existing header, otherwise mirror requestId/correlationId from context
  if (!getHeader(httpRequest.headers, "x-correlationid")) {
    const cid = context.get("correlationId") || context.get("requestId");
    if (cid) httpRequest.headers["x-correlationid"] = cid;
  }

  logger.info({
    message: `Request to ${method} ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    ...httpRequest,
  });

  let duration = 0;
  const controller = new AbortController();
  const timeoutMs = hmrcRequestTimeoutMillis(HMRC_WORKER_WRITE_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const startTime = Date.now();
    hmrcResponse = await fetch(hmrcRequestUrl, { ...httpRequest, signal: controller.signal });
    duration = Date.now() - startTime;
  } catch (error) {
    throw toHmrcTimeoutError(error, method, hmrcRequestUrl, timeoutMs);
  } finally {
    clearTimeout(timeout);
  }
  // HMRC's amend-period-summary PUT returns 204 with no body, unlike every other write
  // endpoint here - fall back to {} rather than let response.json() throw on an empty body.
  const hmrcResponseBody = await hmrcResponse.json().catch(() => ({}));

  // Normalise response headers to a plain object (Headers is not marshallable)
  let responseHeadersObj = {};
  try {
    if (hmrcResponse && typeof hmrcResponse.headers?.forEach === "function") {
      hmrcResponse.headers.forEach((value, key) => {
        responseHeadersObj[key] = value;
      });
    } else if (hmrcResponse?.headers && typeof hmrcResponse.headers === "object") {
      responseHeadersObj = { ...hmrcResponse.headers };
    }
  } catch (error) {
    logger.error({
      message: "Error normalizing HMRC response headers",
      error: error.message,
      stack: error.stack,
    });
  }

  logger.info({
    message: `Response from ${method} ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    status: hmrcResponse.status,
    hmrcResponseBody,
  });

  const httpResponse = {
    statusCode: hmrcResponse.status,
    headers: responseHeadersObj,
    body: hmrcResponseBody,
  };
  const userSubOrUuid = auditForUserSub || `unknown-user-${uuidv4()}`;
  try {
    await putHmrcApiRequest(userSubOrUuid, { url: hmrcRequestUrl, httpRequest, httpResponse, duration });
  } catch (auditError) {
    logger.error({
      message: "Error auditing HMRC API request/response to DynamoDB",
      error: auditError.message,
      stack: auditError.stack,
    });
  }

  return { hmrcResponse, hmrcResponseBody };
}

export function generateHmrcErrorResponseWithRetryAdvice(request, hmrcResponse, hmrcResponseBody, hmrcAccessToken, responseHeaders) {
  // Attach parsed body for downstream error helpers
  hmrcResponse.data = hmrcResponseBody;

  // Extract HMRC error code and get user-friendly message
  const errorCode = extractHmrcErrorCode(hmrcResponseBody);
  const errorDetails = errorCode ? getHmrcErrorMessage(errorCode) : null;

  if (hmrcResponse.status === 403) {
    return http403ForbiddenFromHmrcResponse(hmrcAccessToken, hmrcResponse, responseHeaders, errorDetails);
  } else if (hmrcResponse.status === 404) {
    return http404NotFoundFromHmrcResponse(request, hmrcResponse, responseHeaders, errorDetails);
  } else if (hmrcResponse.status === 429) {
    const retryAfter = getHeader(hmrcResponse.headers, "Retry-After") || undefined;
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Upstream rate limited. Please retry later.",
      error: { hmrcResponseCode: hmrcResponse.status, responseBody: hmrcResponse.data, retryAfter },
    });
  } else {
    return http500ServerErrorFromHmrcResponse(request, hmrcResponse, responseHeaders, errorDetails);
  }
}

export function http500ServerErrorFromBundleEnforcement(error, request) {
  if (error instanceof BundleEntitlementError) {
    logger.error({
      message: "Bundle enforcement failed",
      error: error.message,
      details: error.details,
    });
    return http500ServerErrorResponse({
      request,
      message: error.message,
      error: error.details,
    });
  }
  // Re-throw unexpected errors
  logger.error({
    message: "Unexpected error during bundle enforcement",
    error: error.message,
    stack: error.stack,
  });
  return http500ServerErrorResponse({
    request,
    message: "Authorization failure while checking entitlements",
    error: { detail: error.message || String(error) },
  });
}

export function http403ForbiddenFromBundleEnforcement(error, request) {
  if (error instanceof BundleAuthorizationError) {
    logger.warn({
      message: "Unauthorized - missing or invalid authorization token",
      error: error.message,
      details: error.details,
    });
    return http401UnauthorizedResponse({
      request,
      message: error.message,
      error: { code: error.details?.code || "UNAUTHORIZED", ...error.details },
    });
  }
  // Only intended for BundleEntitlementError, fall back to 500 otherwise
  if (!(error instanceof BundleEntitlementError)) {
    return http500ServerErrorFromBundleEnforcement(error, request);
  }
  logger.warn({
    message: "Forbidden - bundle entitlement missing or insufficient",
    error: error.message,
    details: error.details,
  });
  return http403ForbiddenResponse({
    request,
    message: "Forbidden - missing or insufficient bundle entitlement",
    error: { code: error.details?.code || "BUNDLE_ENTITLEMENT_REQUIRED", ...error.details },
  });
}

export function http403ForbiddenFromHmrcResponse(hmrcAccessToken, hmrcResponse, govClientHeaders, errorDetails = null) {
  const hmrcAccessTokenData = {
    tokenInfo: {
      hasAccessToken: !!hmrcAccessToken,
      accessTokenLength: hmrcAccessToken ? hmrcAccessToken.length : 0,
      accessTokenPrefix: hmrcAccessToken ? hmrcAccessToken.substring(0, 8) + "..." : "none",
    },
    requestHeaders: {
      authorization: hmrcAccessToken ? `Bearer ${hmrcAccessToken.substring(0, 8)}...` : "missing",
      govClientHeadersCount: Object.keys(govClientHeaders || {}).length,
      govClientHeaderKeys: Object.keys(govClientHeaders || {}),
    },
  };
  logger.warn({
    message: "Forbidden - Access token may be invalid, expired, or lack required permissions",
    hmrcAccessTokenData,
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  });

  const message = errorDetails
    ? errorDetails.userMessage
    : "Forbidden - Access token may be invalid, expired, or lack required permissions";
  const errorResponse = {
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  };

  if (errorDetails) {
    errorResponse.userMessage = errorDetails.userMessage;
    errorResponse.actionAdvice = errorDetails.actionAdvice;
    if (errorDetails.reason) {
      errorResponse.reason = errorDetails.reason;
    }
  }

  return http403ForbiddenResponse({
    hmrcAccessTokenData,
    headers: { ...govClientHeaders },
    message,
    error: errorResponse,
  });
}

export function http404NotFoundFromHmrcResponse(request, hmrcResponse, govClientHeaders, errorDetails = null) {
  logger.warn({
    message: "Not found for request",
    request: request?.toString(),
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  });

  const message = errorDetails ? errorDetails.userMessage : "Not found for the specified query";
  const errorResponse = {
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  };

  if (errorDetails) {
    errorResponse.userMessage = errorDetails.userMessage;
    errorResponse.actionAdvice = errorDetails.actionAdvice;
  }

  return http404NotFoundResponse({
    request,
    headers: { ...govClientHeaders },
    message,
    error: errorResponse,
  });
}

// HMRC error codes not in getHmrcErrorMessage's curated map still carry a plain-English
// message (and sometimes the field paths it applies to) - forward that instead of a generic
// "rejected" line, the way an unmapped VAT code would otherwise lose its detail.
export function buildHmrcRejectionMessage(responseBody, fallbackMessage) {
  if (!responseBody || typeof responseBody.message !== "string") {
    return fallbackMessage;
  }
  const paths = Array.isArray(responseBody.paths) && responseBody.paths.length > 0 ? `: ${responseBody.paths.join(", ")}` : "";
  return `${responseBody.message}${paths}`;
}

export function http400BadRequestFromHmrcResponse(request, hmrcResponse, govClientHeaders, errorDetails = null) {
  logger.warn({
    message: "Bad request rejected by HMRC",
    request: request?.toString(),
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  });

  const message = errorDetails ? errorDetails.userMessage : buildHmrcRejectionMessage(hmrcResponse.data, "HMRC rejected the request");
  const errorResponse = {
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  };

  if (errorDetails) {
    errorResponse.userMessage = errorDetails.userMessage;
    errorResponse.actionAdvice = errorDetails.actionAdvice;
  }

  return http400BadRequestResponse({
    request,
    headers: { ...govClientHeaders },
    message,
    error: errorResponse,
  });
}

export function http500ServerErrorFromHmrcResponse(request, hmrcResponse, govClientHeaders, errorDetails = null) {
  logger.error({
    message: "HMRC request failed for request",
    request: request?.toString(),
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  });

  const message = errorDetails ? errorDetails.userMessage : "HMRC request failed";
  const errorResponse = {
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  };

  if (errorDetails) {
    errorResponse.userMessage = errorDetails.userMessage;
    errorResponse.actionAdvice = errorDetails.actionAdvice;
  }

  return http500ServerErrorResponse({
    request,
    headers: { ...govClientHeaders },
    message,
    error: errorResponse,
  });
}
