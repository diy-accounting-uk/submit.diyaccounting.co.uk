// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-24 Change an account setting
// - **Use when:** a signed-in user changes a preference that belongs to the account, such as pass generation, and it must follow them to every browser.
// - **Does:** accountSettingsPut.js validates the named settings against app/lib/accountSettings.js. It writes each named setting on its own path of one settings item in the user's own partition of the bundles table, and applies a watchList add or remove of one company number to the stored list in one conditional write, for an account that holds the company-watch-list activity. getUserBundles leaves that item out of the bundle list. bundleGet.js returns the settings with the bundles. settings.page.js and viewer-settings.js call the route.
// - **Run:** `PUT /api/v1/account/settings`
// - **Entry:** `app/functions/account/accountSettingsPut.js:ingestHandler`; `web/public/lib/services/viewer-settings.js:updateAccountSetting`
// - **Files:** app/functions/account/accountSettingsPut.js, app/lib/accountSettings.js, app/data/dynamoDbBundleRepository.js, app/functions/account/bundleGet.js, web/public/settings.html, web/public/settings.page.js, web/public/lib/services/viewer-settings.js, app/unit-tests/functions/accountSettings.test.js, app/unit-tests/lib/accountSettings.test.js, web/browser-tests/settings.browser.test.js
// - **Keywords:** account settings, settings page, pass generation, preview features, operator features, settings cog, viewer settings
// - **Related:** SITE-05
// @end-capability

// app/functions/account/accountSettingsPut.js
//
// Changes the caller's account settings (app/lib/accountSettings.js) and its company watch list. GET
// /api/v1/bundle returns the settings with the bundles.

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  extractUserFromAuthorizerContext,
  parseRequestBody,
  http200OkResponse,
  http401UnauthorizedResponse,
  http403ForbiddenResponse,
  http409ConflictResponse,
  http500ServerErrorResponse,
  buildValidationError,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { resolveAccountSettings, validateAccountSettingsUpdate, WATCH_LIST_CAP } from "../../lib/accountSettings.js";
import { updateAccountSettings, addToWatchedCompanies, removeFromWatchedCompanies } from "../../data/dynamoDbBundleRepository.js";
import { enforceBundles, BundleAuthorizationError, BundleEntitlementError } from "../../services/bundleManagement.js";
import { initializeSalt } from "../../services/subHasher.js";
import { corsOriginHeaders } from "../../lib/corsOrigins.js";

const logger = createLogger({ source: "app/functions/account/accountSettingsPut.js" });

const WATCH_LIST_ACTIVITY_ID = "company-watch-list";

// Maps enforceBundles() failures to HTTP responses, as the other activity-gated routes do. Kept here
// rather than imported from another API module, so this module pulls in none of its client code.
function http403ForbiddenFromBundleEnforcement(error, request, headers) {
  if (error instanceof BundleAuthorizationError) {
    logger.warn({ message: "Unauthorized - missing or invalid authorization token", error: error.message, details: error.details });
    return http401UnauthorizedResponse({
      request,
      headers,
      message: error.message,
      error: { code: error.details?.code || "UNAUTHORIZED", ...error.details },
    });
  }
  if (!(error instanceof BundleEntitlementError)) {
    logger.error({ message: "Unexpected error during bundle enforcement", error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers,
      message: "Authorization failure while checking entitlements",
      error: { detail: error.message || String(error) },
    });
  }
  logger.warn({ message: "Forbidden - bundle entitlement missing or insufficient", error: error.message, details: error.details });
  return http403ForbiddenResponse({
    request,
    headers,
    message: "Forbidden - missing or insufficient bundle entitlement",
    error: { code: error.details?.code || "BUNDLE_ENTITLEMENT_REQUIRED", ...error.details },
  });
}

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "put", "/api/v1/account/settings", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", ...corsOriginHeaders(event?.headers), "Cache-Control": "no-store" };

  const user = extractUserFromAuthorizerContext(event);
  if (!user?.sub) {
    return http401UnauthorizedResponse({ request, headers: responseHeaders, message: "Authentication required", error: {} });
  }

  const { update, watchListOperation, errors } = validateAccountSettingsUpdate(parseRequestBody(event));
  if (errors.length > 0) {
    return buildValidationError(request, errors, responseHeaders);
  }

  // A watch list change needs the company watch list activity; the other settings need none.
  if (watchListOperation) {
    try {
      await enforceBundles(event, { activityId: WATCH_LIST_ACTIVITY_ID });
    } catch (error) {
      return http403ForbiddenFromBundleEnforcement(error, request, responseHeaders);
    }
  }

  let stored = Object.keys(update).length > 0 ? await updateAccountSettings(user.sub, update) : null;
  if (watchListOperation) {
    const { op, companyNumber } = watchListOperation;
    const outcome =
      op === "add"
        ? await addToWatchedCompanies(user.sub, companyNumber, WATCH_LIST_CAP)
        : await removeFromWatchedCompanies(user.sub, companyNumber);
    if (outcome.status === "full") {
      return http409ConflictResponse({
        request,
        headers: responseHeaders,
        message: `The watch list holds at most ${WATCH_LIST_CAP} companies`,
        error: { reason: "watch_list_full", settings: resolveAccountSettings(outcome.settings) },
      });
    }
    stored = outcome.settings;
    logger.info({ message: "Watch list changed", op, status: outcome.status });
  }
  logger.info({ message: "Account settings updated", settings: update });
  return http200OkResponse({ request, headers: responseHeaders, data: { settings: resolveAccountSettings(stored) } });
}
