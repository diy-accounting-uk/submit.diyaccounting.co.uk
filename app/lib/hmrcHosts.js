// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/hmrcHosts.js

export const HMRC_PRODUCTION_HOST = "api.service.hmrc.gov.uk";
export const HMRC_SANDBOX_HOST = "test-api.service.hmrc.gov.uk";

/**
 * The target field of an outbound call record: live for HMRC's production host, and test for
 * the sandbox, a simulator or any other host.
 * @param {string} url
 * @returns {"live"|"test"}
 */
export function hmrcCallTarget(url) {
  try {
    return new URL(url).hostname === HMRC_PRODUCTION_HOST ? "live" : "test";
  } catch {
    return "test";
  }
}
