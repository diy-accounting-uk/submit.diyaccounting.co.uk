// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/edge/errorPageHandler.js
// Lambda@Edge origin-response handler for custom error pages

import { generateErrorHtml } from "./errorPageHtml.js";

/**
 * Lambda@Edge origin-response handler
 * Intercepts error responses from the origin and replaces them with custom error pages.
 * API routes (/api/*) are excluded to preserve JSON error responses.
 *
 * @param {CloudFrontResponseEvent} event - CloudFront origin-response event
 * @returns {CloudFrontResponse} - Modified or original response
 */
export async function handler(event) {
  const response = event.Records[0].cf.response;
  const request = event.Records[0].cf.request;
  const uri = request.uri;
  const status = parseInt(response.status, 10);

  // Only handle errors (4xx and 5xx)
  if (status < 400) {
    return response;
  }

  // Exclude API routes - let them return their JSON errors
  if (uri.startsWith("/api/")) {
    return response;
  }

  // Generate custom error page HTML
  const errorHtml = generateErrorHtml(status, uri);

  // Replace response body with custom error page
  response.body = errorHtml;
  response.bodyEncoding = "text";

  // Set content-type to HTML
  response.headers["content-type"] = [{ key: "Content-Type", value: "text/html; charset=UTF-8" }];

  // Remove content-length as body has changed
  delete response.headers["content-length"];

  // Status code is preserved (key requirement!)
  // response.status remains unchanged from the original error

  return response;
}
