// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-131 Serve CloudFront custom error pages
// - **Use when:** CloudFront returns an HTTP error and the visitor needs the right static error page instead of a raw status.
// - **Does:** errorPageHandler.js is the CloudFront@Edge viewer-request handler that renders the right static page for each HTTP error status, via errorPageHtml.js. The web/public/errors/*.html pages are the served output, and error-page.js is the web component that displays error-page detail in the app shell.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/edge/errorPageHandler.js:handler`
// - **Files:** app/functions/edge/errorPageHandler.js, app/functions/edge/errorPageHtml.js, app/unit-tests/edge/errorPageHandler.test.js, web/public/errors/403.html, web/public/errors/404.html, web/public/errors/404-error-distribution.html, web/public/errors/404-error-origin.html, web/public/errors/500.html, web/public/errors/502.html, web/public/errors/503.html, web/public/errors/504.html, web/public/widgets/error-page.js
// - **Keywords:** cloudfront edge, custom error page, 403, 404, 500, error handler, viewer request
// - **Related:** OPS-115
// @end-capability

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
  const errorHtml = generateErrorHtml(status);

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
