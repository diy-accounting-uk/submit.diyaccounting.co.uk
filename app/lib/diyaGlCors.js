// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/diyaGlCors.js
//
// The DIYA-GL routes sit behind their own JWT authoriser and their own allow-listed origins
// (BOOKS_ALLOWED_ORIGINS), separate from the API-wide CloudFront CORS policy, so every DIYA-GL
// handler resolves and answers CORS the same way.

import { getHeader } from "./httpResponseHelper.js";

const ALLOWED_METHODS = "GET, PUT, DELETE, OPTIONS";
const ALLOWED_HEADERS = "authorization, content-type, if-match, x-request-id, x-correlationid";

/**
 * Resolves the CORS response headers for a DIYA-GL request: the caller's Origin echoed back only
 * when it's in the comma-separated BOOKS_ALLOWED_ORIGINS list, with Vary: Origin so caches don't
 * serve one origin's response to another. No match means no CORS header at all.
 *
 * @param {object} headers - the incoming request's headers (event.headers)
 * @returns {object}
 */
export function resolveDiyaGlCorsHeaders(headers) {
  const origin = getHeader(headers, "origin");
  const allowedOrigins = (process.env.BOOKS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!origin || !allowedOrigins.includes(origin)) {
    return { Vary: "Origin" };
  }

  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

/**
 * Builds the 204 response to an unauthenticated OPTIONS preflight for a DIYA-GL route.
 *
 * @param {object} headers - the incoming request's headers (event.headers)
 * @returns {{statusCode: number, headers: object, body: string}}
 */
export function diyaGlPreflightResponse(headers) {
  const corsHeaders = resolveDiyaGlCorsHeaders(headers);
  return {
    statusCode: 204,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Methods": ALLOWED_METHODS,
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
      "Access-Control-Expose-Headers": "x-request-id,x-correlationid,Location,Retry-After,ETag",
      "Access-Control-Max-Age": "600",
    },
    body: "",
  };
}
