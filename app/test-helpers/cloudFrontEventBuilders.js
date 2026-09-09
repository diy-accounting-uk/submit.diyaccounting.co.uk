// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-helpers/cloudFrontEventBuilders.js
// Event builders for Lambda@Edge CloudFront events

/**
 * Build a CloudFront origin-response event
 * @param {Object} options - Event options
 * @returns {CloudFrontResponseEvent} - CloudFront origin-response event
 */
export function buildCloudFrontOriginResponseEvent({
  uri = "/some-page.html",
  status = "200",
  statusDescription = "OK",
  headers = {},
  body = "",
  method = "GET",
} = {}) {
  return {
    Records: [
      {
        cf: {
          config: {
            distributionId: "EXAMPLE",
            distributionDomainName: "d123.cloudfront.net",
            eventType: "origin-response",
            requestId: "test-request-id",
          },
          request: {
            uri,
            method,
            headers: {
              host: [{ key: "Host", value: "example.com" }],
            },
          },
          response: {
            status: String(status),
            statusDescription,
            headers: {
              "content-type": [{ key: "Content-Type", value: "text/html" }],
              ...headers,
            },
            body,
          },
        },
      },
    ],
  };
}

/**
 * Build a 404 error response event
 * @param {string} uri - The URI that was requested
 * @returns {CloudFrontResponseEvent} - CloudFront origin-response event with 404 status
 */
export function build404Event(uri = "/missing-page.html") {
  return buildCloudFrontOriginResponseEvent({
    uri,
    status: "404",
    statusDescription: "Not Found",
  });
}

/**
 * Build a 500 error response event
 * @param {string} uri - The URI that was requested
 * @returns {CloudFrontResponseEvent} - CloudFront origin-response event with 500 status
 */
export function build500Event(uri = "/error-page.html") {
  return buildCloudFrontOriginResponseEvent({
    uri,
    status: "500",
    statusDescription: "Internal Server Error",
  });
}

/**
 * Build an API error response event (should pass through unchanged)
 * @param {string} status - The HTTP status code
 * @returns {CloudFrontResponseEvent} - CloudFront origin-response event for API
 */
export function buildApiErrorEvent(status = "404") {
  return buildCloudFrontOriginResponseEvent({
    uri: "/api/v1/some-endpoint",
    status,
    statusDescription: status === "404" ? "Not Found" : "Error",
    body: JSON.stringify({ message: "Not Found" }),
    headers: {
      "content-type": [{ key: "Content-Type", value: "application/json" }],
    },
  });
}
