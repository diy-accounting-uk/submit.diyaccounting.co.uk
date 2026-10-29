// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/practiceEnforcement.js

import { enforceBundles, BundleAuthorizationError, BundleEntitlementError } from "../services/bundleManagement.js";
import { http401UnauthorizedResponse, http403ForbiddenResponse, http500ServerErrorResponse } from "./httpResponseHelper.js";

/**
 * Runs the catalogue check for a practice request. Returns null when the request may go on,
 * otherwise the 401, 403 or 500 response to send.
 */
export async function practiceEnforcementResponse(event, request, headers) {
  try {
    await enforceBundles(event);
    return null;
  } catch (error) {
    if (error instanceof BundleAuthorizationError) {
      return http401UnauthorizedResponse({
        request,
        headers,
        message: error.message,
        error: { code: error.details?.code || "UNAUTHORIZED", ...error.details },
      });
    }
    if (error instanceof BundleEntitlementError) {
      return http403ForbiddenResponse({
        request,
        headers,
        message: error.message,
        error: { code: error.details?.code || "BUNDLE_ENTITLEMENT_REQUIRED", ...error.details },
      });
    }
    return http500ServerErrorResponse({
      request,
      headers,
      message: "Authorization failure while checking entitlements",
      error: { detail: error.message || String(error) },
    });
  }
}
