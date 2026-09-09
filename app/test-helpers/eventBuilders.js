// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-helpers/eventBuilders.js
// Reusable test helpers for building Lambda events

/**
 * Base64 URL encode an object
 */
export function base64UrlEncode(obj) {
  const json = JSON.stringify(obj);
  // Replace base64 padding and make URL-safe by replacing + with - and / with _
  // Use non-backtracking approach to avoid ReDoS: trim trailing = chars one at a time
  let encoded = Buffer.from(json).toString("base64");
  while (encoded.endsWith("=")) {
    encoded = encoded.slice(0, -1);
  }
  return encoded.replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Create a mock JWT ID token
 */
export function makeIdToken(sub = "test-user", extra = {}) {
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    sub,
    email: `${sub}@example.com`,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...extra,
  };
  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.`;
}

/**
 * Build standard authorizer context for Lambda events
 */
export function buildAuthorizerContext(sub = "test-sub", username = "test", email = "test@test.submit.diyaccounting.co.uk") {
  return {
    authorizer: {
      lambda: {
        "sub": sub,
        "cognito:username": username,
        "email": email,
        "scope": "read write",
      },
    },
  };
}

/**
 * Build authorizer context matching HTTP API JWT authorizer structure
 * (claims at event.requestContext.authorizer.jwt.claims)
 */
export function buildJwtAuthorizerContext(sub = "test-sub", username = "test", email = "test@test.submit.diyaccounting.co.uk") {
  return {
    authorizer: {
      jwt: {
        claims: {
          "sub": sub,
          "cognito:username": username,
          "email": email,
        },
        scopes: [],
      },
    },
  };
}

/**
 * Build a standard Lambda event with common properties
 */
export function buildLambdaEvent({
  method = "POST",
  protocol = null,
  host = null,
  path = "/",
  headers = {},
  body = null,
  queryStringParameters = null,
  pathParameters = null,
  requestId = "test-request-id",
  authorizer = buildAuthorizerContext(),
} = {}) {
  return {
    requestContext: {
      requestId,
      http: {
        method,
        host,
        protocol,
        path,
      },
      ...authorizer,
    },
    headers: {
      "x-wait-time-ms": "30000",
      ...headers,
    },
    body: body ? JSON.stringify(body) : null,
    queryStringParameters,
    pathParameters,
  };
}

/**
 * Build event with authorization token
 */
export function buildEventWithToken(token, body = {}, options = {}) {
  return buildLambdaEvent({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
    ...options,
  });
}

/**
 * Build Gov-Client test headers for HMRC API calls
 */
export function buildGovClientHeaders() {
  return {
    "Gov-Client-Browser-JS-User-Agent": "test-browser-js-user-agent",
    "Gov-Client-Device-ID": "test-device-id",
    "Gov-Client-Multi-Factor": "test-multi-factor",
    "Gov-Client-Public-IP": "test-public-ip",
    "Gov-Client-Public-IP-Timestamp": "test-public-ip-timestamp",
    "Gov-Client-Public-Port": "test-public-port",
    "Gov-Client-Screens": "test-screens",
    "Gov-Client-Timezone": "test-timezone",
    "Gov-Client-User-IDs": "test-user-ids",
    "Gov-Client-Window-Size": "test-window-size",
    "Gov-Vendor-Forwarded": "test-vendor-forwarded",
    "Gov-Vendor-Public-IP": "test-vendor-public-ip",
  };
}

/**
 * Build event for HMRC API ingestHandlers
 */
export function buildHmrcEvent({
  body = {},
  queryStringParameters = null,
  pathParameters = null,
  headers = {},
  requestId = "test-request-id",
} = {}) {
  return buildLambdaEvent({
    headers: {
      ...buildGovClientHeaders(),
      "x-wait-time-ms": "30000",
      ...headers,
    },
    body,
    queryStringParameters,
    pathParameters,
    requestId,
  });
}

/**
 * Build HEAD request event
 */
export function buildHeadEvent(options = {}) {
  return buildLambdaEvent({
    method: "HEAD",
    ...options,
  });
}
