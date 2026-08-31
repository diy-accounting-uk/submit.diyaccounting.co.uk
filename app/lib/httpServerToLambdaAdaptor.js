// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/httpServerToLambdaAdaptor.js

import { createLogger } from "./logger.js";
import { decodeJwtNoVerify } from "./jwtHelper.js";

const logger = createLogger({ source: "app/lib/httpServerToLambdaAdaptor.js" });

export function buildLambdaEventFromHttpRequest(httpRequest) {
  // Start with a copy of all incoming headers (Express normalizes to lowercase keys)
  const incomingHeaders = { ...(httpRequest.headers || {}) };
  // Ensure host header is present
  incomingHeaders.host = httpRequest.get("host") || incomingHeaders.host || "localhost:3000";
  const protocol = httpRequest.protocol || "https";
  // incomingHeaders.host = httpRequest.get("host") || incomingHeaders.host || "localhost";
  // const port = httpRequest.get("host")?.split(":")[1] || (httpRequest.protocol === "https" ? "443" : "80");
  // Pass through referer if available via accessor (helps construct full URL in logs)
  const referer = httpRequest.get("referer");
  if (referer) incomingHeaders.referer = referer;

  // Synthesize CloudFront-Viewer-Address for local dev (CloudFront adds this in production).
  // Use the real client IP from X-Forwarded-For (set by the proxy) and the socket port,
  // matching the format CloudFront provides: "client-ip:client-port".
  if (!incomingHeaders["cloudfront-viewer-address"]) {
    const xff = incomingHeaders["x-forwarded-for"] || "";
    const clientIp = xff.split(",")[0]?.trim() || httpRequest.ip || httpRequest.socket?.remoteAddress || "127.0.0.1";
    const clientPort = httpRequest.socket?.remotePort || 0;
    incomingHeaders["cloudfront-viewer-address"] = `${clientIp}:${clientPort}`;
  }

  // Extract bearer token from Authorization or X-Authorization header if present
  const authorization = httpRequest.get("x-authorization") || httpRequest.get("authorization");
  let bearerToken = null;
  try {
    if (authorization && authorization.startsWith("Bearer ")) {
      bearerToken = authorization.substring("Bearer ".length);
    }
  } catch (err) {
    logger.warn({
      message: "Failed to extract bearer token from authorization header",
      authorization,
      error: err.message,
      stack: err.stack,
    });
  }
  // Decode JWT payload if present; avoid spreading null/undefined
  const jwtPayload = decodeJwtNoVerify(bearerToken) || {};

  const lambdaEvent = {
    requestContext: {
      authorizer: {
        lambda: {
          ...(jwtPayload || {}),
          "cognito:username": "test",
          "email": "test@test.submit.diyaccunting.co.uk",
          "scope": "read write",
        },
      },
      http: {
        method: httpRequest.method || "GET",
        protocol,
        host: incomingHeaders.host,
        // port,
        path: httpRequest.path,
      },
    },
    path: httpRequest.path,
    headers: incomingHeaders,
    queryStringParameters: httpRequest.query || {},
    rawQueryString: httpRequest.originalUrl?.split("?")[1] || "",
  };

  if (httpRequest.params) {
    lambdaEvent.pathParameters = httpRequest.params;
  }
  if (httpRequest.query) {
    lambdaEvent.queryStringParameters = httpRequest.query;
  }
  if (httpRequest.rawBody) {
    // Use preserved raw body (e.g. for Stripe webhook signature verification)
    lambdaEvent.body = httpRequest.rawBody;
  } else if (httpRequest.body) {
    lambdaEvent.body = JSON.stringify(httpRequest.body);
  }
  return lambdaEvent;
}

export function buildHttpResponseFromLambdaResult({ headers, statusCode, body }, httpResponse) {
  if (headers) httpResponse.set(headers);
  if (statusCode === 304) {
    return httpResponse.status(304).end();
  }
  try {
    return httpResponse.status(statusCode).json(body ? JSON.parse(body) : {});
  } catch (_e) {
    logger.warn(`Response body is not valid JSON, sending as text ${_e}`);
    return httpResponse.status(statusCode).send(body || "");
  }
}
