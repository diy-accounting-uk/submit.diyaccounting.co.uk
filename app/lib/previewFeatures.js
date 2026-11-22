// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/previewFeatures.js
// The preview-features header lets a request reach an activity that the catalogue does not list in
// this environment, and only when the request runs against a sandbox service. The header is a
// request, not a grant: the server checks the sandbox condition itself.

import { getHeader } from "./httpResponseHelper.js";

const PREVIEW_FEATURES_HEADER = "x-preview-features";

const COMPANIES_HOUSE_PATH_PREFIX = "/api/v1/companies-house/";

function companiesHouseFilingIsSandbox() {
  const base = String(process.env.COMPANIES_HOUSE_FILING_BASE_URI || "");
  return base.includes("sandbox");
}

function companiesHouseGatewayIsTestService() {
  return process.env.COMPANIES_HOUSE_GATEWAY_TEST === "true";
}

// The Companies House routes that file, or read and render, through the XML gateway. Every other
// Companies House route goes through the REST filing API or its public data lookups.
const XML_GATEWAY_PATH_PATTERN =
  /^\/api\/v1\/companies-house\/(accounts|confirmation-statement|psc-verification-statement|company\/[^/]+\/filing-data)(\/|$)/;

/**
 * Whether a request for an activity unlisted in this environment may run. It asks for preview
 * features, and the service it reaches is a test service: for a Companies House path, the XML
 * gateway's test service (accounts, confirmation statement, PSC verification statement, filing
 * data) or the sandbox filing API (every other Companies House path), whatever the HMRC account;
 * for any other path, the synthetic HMRC account.
 * @param {object} event - The Lambda event
 * @param {string} requestPath - The request path
 * @returns {boolean} True when the request may run against the sandbox
 */
export function previewRunsAgainstSandbox(event, requestPath) {
  if (String(getHeader(event?.headers, PREVIEW_FEATURES_HEADER) || "").toLowerCase() !== "on") return false;
  const path = String(requestPath || "");
  if (path.startsWith(COMPANIES_HOUSE_PATH_PREFIX)) {
    return XML_GATEWAY_PATH_PATTERN.test(path) ? companiesHouseGatewayIsTestService() : companiesHouseFilingIsSandbox();
  }
  return String(getHeader(event?.headers, "hmrcAccount") || "").toLowerCase() === "synthetic";
}
