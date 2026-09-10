// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/diyaGlCors.js
//
// The DIYA-GL routes sit behind their own JWT authoriser and their own allow-listed origins
// (DIYA_GL_ALLOWED_ORIGINS), separate from the API-wide CloudFront CORS policy, so every DIYA-GL
// handler resolves and answers CORS the same way.

import { createLogger } from "./logger.js";
import { extractRequest, getHeader, http500ServerErrorResponse } from "./httpResponseHelper.js";

const logger = createLogger({ source: "app/lib/diyaGlCors.js" });

const ALLOWED_METHODS = "GET, PUT, DELETE, OPTIONS";
const ALLOWED_HEADERS = "authorization, content-type, if-match, x-request-id, x-correlationid";

/**
 * Resolves the CORS response headers for a DIYA-GL request: the caller's Origin echoed back only
 * when it's in the comma-separated DIYA_GL_ALLOWED_ORIGINS list, with Vary: Origin so caches don't
 * serve one origin's response to another. No match means no CORS header at all.
 *
 * @param {object} headers - the incoming request's headers (event.headers)
 * @returns {object}
 */
export function resolveDiyaGlCorsHeaders(headers) {
  const origin = getHeader(headers, "origin");
  const allowedOrigins = (process.env.DIYA_GL_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!origin || !allowedOrigins.includes(origin)) {
    return { Vary: "Origin" };
  }

  return { "Access-Control-Allow-Origin": origin, "Vary": "Origin" };
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

/**
 * Runs a DIYA-GL handler with the CORS decision made once, before anything can fail, and
 * stamped on whatever comes back. A browser reads Access-Control-Allow-Origin on the error
 * response too, so a 4xx or 5xx without it reaches the page as a CORS failure rather than as
 * the status and message the handler chose. Anything the handler throws becomes a 500 that
 * still carries the header, because an uncaught throw otherwise leaves API Gateway to answer
 * "Internal Server Error" with no CORS at all.
 *
 * @param {object} event - the Lambda event
 * @param {function({request: URL|string, corsHeaders: object}): Promise<object>} handle
 * @returns {Promise<{statusCode: number, headers: object, body: string}>}
 */
export async function respondWithDiyaGlCors(event, handle) {
  const corsHeaders = resolveDiyaGlCorsHeaders(event?.headers);

  if (event?.requestContext?.http?.method === "OPTIONS") {
    return diyaGlPreflightResponse(event?.headers);
  }

  let response;
  try {
    const { request } = extractRequest(event);
    response = await handle({ request, corsHeaders });
  } catch (error) {
    logger.error({ message: "DIYA-GL handler threw before it could answer", error: error.message, stack: error.stack });
    response = http500ServerErrorResponse({
      headers: corsHeaders,
      message: "storage-error",
      error: { code: "storage-error" },
    });
  }

  return { ...response, headers: { ...response.headers, ...corsHeaders } };
}
