// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/services/hmrcApi.js

import { v4 as uuidv4 } from "uuid";
import { createLogger, context } from "../lib/logger.js";
import { BundleEntitlementError, BundleAuthorizationError } from "./bundleManagement.js";
import {
  http400BadRequestResponse,
  http500ServerErrorResponse,
  http403ForbiddenResponse,
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
  const isSandbox = hmrcAccount === "sandbox";
  const base = isSandbox ? process.env.HMRC_SANDBOX_BASE_URI : process.env.HMRC_BASE_URI;
  if (!base || String(base).trim() === "") {
    throw new Error(`Missing required environment variable ${isSandbox ? "HMRC_SANDBOX_BASE_URI" : "HMRC_BASE_URI"}`);
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
) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/vnd.hmrc.1.0+json",
    "Authorization": `Bearer ${accessToken}`,
    "x-request-id": requestId,
    "traceparent": traceparent,
    "x-correlationid": correlationId,
    ...govClientHeaders,
  };

  // Add Gov-Test-Scenario header // && isSandboxBase(getHmrcBaseUrl()) if provided and we're in sandbox
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
 * Validate fraud prevention headers for sandbox HMRC accounts.
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

  // Add a conservative timeout to avoid hung connections
  let duration = 0;
  const timeoutMs = 115000;
  let hmrcResponse;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(timeoutMs));
  try {
    const startTime = Date.now();
    hmrcResponse = await fetch(hmrcRequestUrl, httpRequest);
    duration = Date.now() - startTime;
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

export async function hmrcHttpPost(hmrcRequestUrl, hmrcRequestHeaders, govClientHeaders, hmrcRequestBody, auditForUserSub) {
  let hmrcResponse;
  const httpRequestTimeoutMillis = 295000;
  const httpRequest = {
    method: "POST",
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
    message: `Request to POST ${hmrcRequestUrl}`,
    url: hmrcRequestUrl,
    ...httpRequest,
  });

  let duration = 0;
  const controller = new AbortController();
  const timeoutMs = Number(httpRequestTimeoutMillis);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const startTime = Date.now();
    hmrcResponse = await fetch(hmrcRequestUrl, { ...httpRequest, signal: controller.signal });
    duration = Date.now() - startTime;
  } finally {
    clearTimeout(timeout);
  }
  const hmrcResponseBody = await hmrcResponse.json();

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
    message: `Response from POST ${hmrcRequestUrl}`,
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

  return http400BadRequestResponse({
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

  return http400BadRequestResponse({
    request,
    headers: { ...govClientHeaders },
    message,
    error: errorResponse,
  });
}

export function http400BadRequestFromHmrcResponse(request, hmrcResponse, govClientHeaders, errorDetails = null) {
  logger.warn({
    message: "Bad request rejected by HMRC",
    request: request?.toString(),
    hmrcResponseCode: hmrcResponse.status,
    responseBody: hmrcResponse.data,
  });

  const message = errorDetails ? errorDetails.userMessage : "HMRC rejected the request";
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
