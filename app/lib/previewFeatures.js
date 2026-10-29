// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/previewFeatures.js
// The preview-features header lets a request reach an activity that the catalogue does not list in
// this environment, and only when the request runs against a sandbox service. The header is a
// request, not a grant: the server checks the sandbox condition itself.

import { getHeader } from "./httpResponseHelper.js";

export const PREVIEW_FEATURES_HEADER = "x-preview-features";

const COMPANIES_HOUSE_PATH_PREFIX = "/api/v1/companies-house/";

function companiesHouseFilingIsSandbox() {
  const base = String(process.env.COMPANIES_HOUSE_FILING_BASE_URI || "");
  return base.includes("sandbox");
}

/**
 * Whether a request for an activity unlisted in this environment may run: it asks for preview
 * features and its HMRC account is synthetic, or it is a Companies House request on a deployment
 * that files to the Companies House test service.
 * @param {object} event - The Lambda event
 * @param {string} requestPath - The request path
 * @returns {boolean} True when the request may run against the sandbox
 */
export function previewRunsAgainstSandbox(event, requestPath) {
  if (String(getHeader(event?.headers, PREVIEW_FEATURES_HEADER) || "").toLowerCase() !== "on") return false;
  if (String(getHeader(event?.headers, "hmrcAccount") || "").toLowerCase() === "synthetic") return true;
  return String(requestPath || "").startsWith(COMPANIES_HOUSE_PATH_PREFIX) && companiesHouseFilingIsSandbox();
}
