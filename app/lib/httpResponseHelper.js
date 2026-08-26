// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/httpResponseHelper.js

import { v4 as uuidv4 } from "uuid";
import { createLogger, context, sanitiseString, sanitiseData } from "./logger.js";
import { putHmrcApiRequest } from "../data/dynamoDbHmrcApiRequestRepository.js";

const logger = createLogger({ source: "app/lib/httpResponseHelper.js" });

export function http200OkResponse({ request, headers, data }) {
  const merged = { ...(headers || {}) };
  if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  if (context.get("correlationId")) merged["x-correlationid"] = context.get("correlationId");
  return httpResponse({
    statusCode: 200,
    request,
    headers: merged,
    data,
    levelledLogger: logger.info.bind(logger),
  });
}

export function http400BadRequestResponse({ request, headers, message, error }) {
  const merged = { ...(headers || {}) };
  if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  if (context.get("correlationId")) merged["x-correlationid"] = context.get("correlationId");
  return httpResponse({
    statusCode: 400,
    request,
    headers: merged,
    data: { message, ...error },
    levelledLogger: logger.error.bind(logger),
  });
}

export function http500ServerErrorResponse({ request, headers, message, error }) {
  const merged = { ...(headers || {}) };
  if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  if (context.get("correlationId")) merged["x-correlationid"] = context.get("correlationId");
  return httpResponse({
    statusCode: 500,
    request,
    headers: merged,
    data: { message, ...error },
    levelledLogger: logger.error.bind(logger),
  });
}

export function http403ForbiddenResponse({ request, headers, message, error }) {
  const merged = { ...(headers || {}) };
  if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  if (context.get("correlationId")) merged["x-correlationid"] = context.get("correlationId");
  return httpResponse({
    statusCode: 403,
    request,
    headers: merged,
    data: { message, ...error },
    levelledLogger: logger.warn.bind(logger),
  });
}

export function http409ConflictResponse({ request, headers, message, error }) {
  const merged = { ...(headers || {}) };
  if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  if (context.get("correlationId")) merged["x-correlationid"] = context.get("correlationId");
  return httpResponse({
    statusCode: 409,
    request,
    headers: merged,
    data: { message, ...error },
    levelledLogger: logger.warn.bind(logger),
  });
}

export function http404NotFoundResponse({ request, headers, message, error }) {
  const merged = { ...(headers || {}) };
  if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  if (context.get("correlationId")) merged["x-correlationid"] = context.get("correlationId");
  return httpResponse({
    statusCode: 404,
    request,
    headers: merged,
    data: { message, ...error },
    levelledLogger: logger.warn.bind(logger),
  });
}

export function http401UnauthorizedResponse({ request, headers, message, error }) {
  const merged = { ...(headers || {}) };
  if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  if (context.get("correlationId")) merged["x-correlationid"] = context.get("correlationId");
  return httpResponse({
    statusCode: 401,
    request,
    headers: merged,
    data: { message, ...error },
    levelledLogger: logger.warn.bind(logger),
  });
}

export function http202AcceptedResponse({ request, headers, message, location }) {
  const merged = { ...(headers || {}) };
  if (context.get("requestId")) merged["x-request-id"] = context.get("requestId");
  if (context.get("amznTraceId")) merged["x-amzn-trace-id"] = context.get("amznTraceId");
  if (context.get("traceparent")) merged["traceparent"] = context.get("traceparent");
  if (context.get("correlationId")) merged["x-correlationid"] = context.get("correlationId");
  if (location) merged["Location"] = location;
  return httpResponse({
    statusCode: 202,
    request,
    headers: merged,
    data: { message },
    levelledLogger: logger.info.bind(logger),
  });
}

function httpResponse({ statusCode, headers, data, request, levelledLogger }) {
  const merged = { ...(headers || {}) };
  // Always provide an x-request-id for client correlation; generate if not supplied
  if (!merged["x-request-id"]) {
    merged["x-request-id"] = context.get("requestId") || String(Date.now());
  }
  if (context.get("amznTraceId") && !merged["x-amzn-trace-id"]) {
    merged["x-amzn-trace-id"] = context.get("amznTraceId");
  }
  if (context.get("traceparent") && !merged["traceparent"]) {
    merged["traceparent"] = context.get("traceparent");
  }
  // Ensure x-correlationid is present; if missing, mirror x-request-id
  if (!merged["x-correlationid"]) {
    merged["x-correlationid"] = context.get("correlationId") || merged["x-request-id"];
  }

  // Ensure client can read correlation and polling headers
  merged["Access-Control-Expose-Headers"] = "x-request-id,x-correlationid,Location,Retry-After";

  const response = {
    statusCode: statusCode,
    headers: {
      ...merged,
    },
    body: JSON.stringify({
      ...data,
    }),
  };
  if (request) {
    levelledLogger({ message: "Responding to request with response", request: request.toString(), response: sanitiseData(response) });
  } else {
    levelledLogger({ message: "Responding with response", response: sanitiseData(response) });
  }
  return response;
}

/**
 * Get a header value case-insensitively from a headers object.
 * @param {object} headers - The headers object (e.g. event.headers)
 * @param {string} name - The header name to look for
 * @returns {string|null} The header value or null if not found
 */
export function getHeader(headers, name) {
  if (!headers || !name) return null;
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return null;
}

export function extractRequest(event) {
  let request;
  // Initialise the store if it doesn't exist
  if (!context.getStore()) {
    context.enterWith(new Map());
  }
  // Extract correlation headers and set context explicitly to avoid leakage across invocations
  // PRIORITISE client-supplied headers over the AWS-generated requestId
  const requestId = getHeader(event.headers, "x-request-id") || event?.requestContext?.requestId || uuidv4();
  const amznTraceId = getHeader(event.headers, "x-amzn-trace-id") || null;
  const traceparent = getHeader(event.headers, "traceparent") || null;
  const correlationId = getHeader(event.headers, "x-correlationid") || requestId;
  context.set("requestId", requestId);
  context.set("amznTraceId", amznTraceId);
  context.set("traceparent", traceparent);
  context.set("correlationId", correlationId);
  if (event.headers) {
    try {
      let baseRequestUrl;
      const referer = getHeader(event.headers, "referer");
      if (referer) {
        const refererUrl = new URL(referer);
        baseRequestUrl = `${refererUrl.protocol}//${refererUrl.host}`;
      } else {
        baseRequestUrl = `https://${getHeader(event.headers, "host") || "unknown-host"}`;
      }
      const path = event.rawPath || event.path || event.requestContext?.http?.path || "";
      // Build URL without query string first, then add queryStringParameters
      // (avoids duplication when both rawQueryString and queryStringParameters are present)
      request = new URL(`${baseRequestUrl}${path}`);
      if (event.queryStringParameters) {
        Object.keys(event.queryStringParameters).forEach((key) => {
          request.searchParams.append(key, event.queryStringParameters[key]);
        });
      }
      logger.info({ message: "Processing request with event", request: request.toString(), event: sanitiseData(event) });
    } catch (err) {
      logger.warn({ message: "Error building request URL from event", error: err, event: sanitiseData(event) });
      request = "https://unknown-url"; // Fallback URL in case of error
    }
  } else {
    logger.warn({ message: "Event has missing URL path or host header", event: sanitiseData(event) });
    request = "https://unknown";
  }
  return { request, requestId, amznTraceId, traceparent, correlationId };
}

// Helper function to extract client IP from request headers
export function extractClientIPFromHeaders(event) {
  // Try various headers that might contain the client's real IP
  const headers = event.headers || {};
  const possibleIPHeaders = [
    "x-forwarded-for",
    "x-real-ip",
    "x-client-ip",
    "cf-connecting-ip", // Cloudflare
    "x-forwarded",
    "forwarded-for",
    "forwarded",
  ];

  for (const header of possibleIPHeaders) {
    const value = getHeader(headers, header);
    if (value) {
      // x-forwarded-for can contain multiple IPs, take the first one
      const ip = value.split(",")[0].trim();
      if (ip && ip !== "unknown") {
        return ip;
      }
    }
  }

  // Fallback to source IP from event context
  return event.requestContext?.identity?.sourceIp || "unknown";
}

export function extractBearerTokenFromAuthHeaderInLambdaEvent(event) {
  const authHeader = getHeader(event.headers, "authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.split(" ")[1];
}

export function extractAuthTokenFromXAuthorization(event) {
  const headers = event.headers || {};
  const xAuthHeader = getHeader(headers, "x-authorization");

  if (!xAuthHeader || !xAuthHeader.startsWith("Bearer ")) {
    return null;
  }
  return xAuthHeader.split(" ")[1];
}

export function extractUserFromAuthorizerContext(event) {
  // HTTP API JWT authorizer: claims at event.requestContext.authorizer.jwt.claims
  // Custom Lambda authorizer: claims at event.requestContext.authorizer.lambda
  const authz = event.requestContext?.authorizer;
  if (!authz) return null;

  const ctx = authz.jwt?.claims ?? authz.lambda ?? authz;

  if (ctx && ctx.sub) {
    // Plumb userSub through the async context so downstream observability
    // (activity events → telegram routing) can route customer-journey events
    // to the LIVE channel even when the caller doesn't pass `actor` explicitly.
    if (context.getStore()) {
      context.set("userSub", ctx.sub);
    }
    return {
      sub: ctx.sub,
      username: ctx["cognito:username"] || ctx.username || ctx.sub,
      email: ctx.email || "",
      scope: ctx.scope || ctx.scopes || "",
    };
  }
  return null;
}

export function parseRequestBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch (error) {
    logger.error({
      message: "Failed to parse request body as JSON",
      error: error.message,
      body: event.body,
    });
    return null;
  }
}

export function buildValidationError(request, errorMessages, govClientHeaders = {}) {
  return http400BadRequestResponse({
    request,
    headers: { ...govClientHeaders },
    message: errorMessages.join(", "),
  });
}

export async function performTokenExchange(providerUrl, body, auditForUserSub) {
  const requestHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    ...(context.get("requestId") ? { "x-request-id": context.get("requestId") } : {}),
    ...(context.get("amznTraceId") ? { "x-amzn-trace-id": context.get("amznTraceId") } : {}),
    ...(context.get("traceparent") ? { traceparent: context.get("traceparent") } : {}),
    ...(context.get("correlationId") || context.get("requestId")
      ? { "x-correlationid": context.get("correlationId") || context.get("requestId") }
      : {}),
  };
  const requestBody = new URLSearchParams(body);

  logger.info({
    message: `Request to POST ${providerUrl}`,
    url: providerUrl,
    headers: { ...requestHeaders },
    body: sanitiseString(requestBody.toString()),
  });

  let duration = 0;
  const httpRequest = {
    method: "POST",
    headers: { ...requestHeaders },
    // Store a plain string for auditing to ensure DynamoDB marshalling works
    // (URLSearchParams is a class instance and not supported by the marshaller)
    body: requestBody.toString(),
  };

  logger.info({ message: "Performing HTTP POST for token exchange", providerUrl });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  const startTime = new Date().getTime();
  let response;
  try {
    response = await fetch(providerUrl, { ...httpRequest, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  duration = new Date().getTime() - startTime;
  logger.info({ message: "HTTP POST response received with status and duration", status: response?.status, duration });

  let responseTokens;
  try {
    responseTokens = await response.json();
  } catch (err) {
    logger.warn({ message: "Failed to parse response as JSON, attempting text parse", error: err.message });
    try {
      const text = await response.text();
      logger.info({ message: "Response text received", text });
      responseTokens = JSON.parse(text);
    } catch {
      logger.error({ message: "Failed to parse response as text, returning empty tokens" });
      responseTokens = {};
    }
  }

  // Normalise headers to a plain object for DynamoDB marshalling
  let responseHeadersObj = {};
  try {
    if (response && typeof response.headers?.forEach === "function") {
      response.headers.forEach((value, key) => {
        responseHeadersObj[key] = value;
      });
    } else if (response?.headers && typeof response.headers === "object") {
      responseHeadersObj = { ...response.headers };
    }
  } catch (err) {
    logger.warn({ message: "Failed to extract response headers", error: err.message, stack: err.stack });
  }
  const httpResponse = {
    statusCode: response.status,
    headers: responseHeadersObj,
    body: responseTokens,
  };
  const userSubOrUuid = auditForUserSub || `unknown-user-${uuidv4()}`;
  if (userSubOrUuid) {
    try {
      await putHmrcApiRequest(userSubOrUuid, { url: providerUrl, httpRequest, httpResponse, duration });
    } catch (auditError) {
      logger.error({
        message: "Error auditing HMRC API request/response to DynamoDB",
        error: auditError.message,
        stack: auditError.stack,
      });
    }
  }

  logger.info({
    message: "exchangeClientSecretForAccessToken response",
    responseStatus: response.status,
    responseTokens,
    tokenValidation: {
      hasAccessToken: !!responseTokens.access_token,
      accessTokenLength: responseTokens.access_token ? responseTokens.access_token.length : 0,
      tokenType: responseTokens.token_type,
      scope: responseTokens.scope,
      expiresIn: responseTokens.expires_in,
      hasRefreshToken: !!responseTokens.refresh_token,
    },
  });

  const accessToken = responseTokens.access_token;
  const responseBody = { ...responseTokens };
  delete responseBody.access_token;

  return { accessToken, response: response, responseBody };
}

export async function buildTokenExchangeResponse(request, url, body, auditForUserSub = undefined) {
  const { accessToken, response, responseBody } = await performTokenExchange(url, body, auditForUserSub);

  if (!response.ok) {
    logger.error({
      message: "Token exchange failed",
      responseCode: response.status,
      responseBody,
    });
    return http500ServerErrorResponse({
      request,
      message: "Token exchange failed",
      error: {
        responseCode: response.status,
        responseBody,
      },
    });
  }

  const idToken = responseBody.id_token;
  const refreshToken = responseBody.refresh_token;
  const expiresIn = responseBody.expires_in;
  const tokenType = responseBody.token_type;
  const scope = responseBody.scope;

  logger.info({
    message: "Token exchange succeeded",
    accessTokenLength: accessToken.length,
    hasIdToken: !!idToken,
    hasRefreshToken: !!refreshToken,
    expiresIn,
    tokenType,
    scope,
  });
  return http200OkResponse({
    request,
    data: {
      accessToken,
      hmrcAccessToken: accessToken,
      idToken,
      refreshToken,
      expiresIn,
      tokenType,
      scope,
    },
  });
}
