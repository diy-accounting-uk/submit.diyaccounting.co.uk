// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/jsonErrorHandler.js

import { createLogger, context } from "./logger.js";

const logger = createLogger({ source: "app/lib/jsonErrorHandler.js" });

/**
 * Express error-handling middleware that responds to API errors with JSON.
 * Catches both synchronous throws and rejected promises from route handlers.
 *
 * Express error middleware signature: (err, req, res, next) => void
 * Four parameters are required for Express to recognize this as an error handler.
 *
 * @param {Error} err - The error object thrown by a route handler or previous middleware
 * @param {express.Request} req - The HTTP request object
 * @param {express.Response} res - The HTTP response object
 * @param {express.NextFunction} next - The next middleware function (called if headers already sent)
 */
export function jsonErrorHandler(err, req, res, next) {
  // If headers were already sent, delegate to default error handler
  if (res.headersSent) {
    return next(err);
  }

  // Extract request context for logging
  const requestId = context.get("requestId") || String(Date.now());
  const correlationId = context.get("correlationId") || requestId;
  const amznTraceId = context.get("amznTraceId") || null;
  const traceparent = context.get("traceparent") || null;

  // Log the error
  logger.error({
    message: "Unhandled error in API route handler",
    error: {
      message: err.message,
      stack: err.stack,
      name: err.name,
    },
    request: {
      method: req.method,
      path: req.path,
      url: req.url,
    },
    requestId,
    correlationId,
  });

  // Build response headers, matching httpResponseHelper.js pattern
  const responseHeaders = {
    "Content-Type": "application/json",
    "x-request-id": requestId,
    "x-correlationid": correlationId,
  };

  if (amznTraceId) {
    responseHeaders["x-amzn-trace-id"] = amznTraceId;
  }
  if (traceparent) {
    responseHeaders["traceparent"] = traceparent;
  }

  // Always provide the correlation and polling headers to the client
  responseHeaders["Access-Control-Expose-Headers"] = "x-request-id,x-correlationid,Location,Retry-After";

  // Build JSON error response body
  const responseBody = {
    message: "Internal server error",
    error: {
      name: err.name,
      message: err.message,
    },
  };

  // Send 500 response
  res.status(500).set(responseHeaders).json(responseBody);
}
