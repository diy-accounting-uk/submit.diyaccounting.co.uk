// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-24 Change an account setting
// - **Use when:** a signed-in user changes a preference that belongs to the account, such as pass generation, and it must follow them to every browser.
// - **Does:** accountSettingsPut.js validates the named settings against app/lib/accountSettings.js. It merges them into one settings item in the user's own partition of the bundles table. getUserBundles leaves that item out of the bundle list. bundleGet.js returns the settings with the bundles. settings.page.js and viewer-settings.js call the route.
// - **Run:** `PUT /api/v1/account/settings`
// - **Entry:** `app/functions/account/accountSettingsPut.js:ingestHandler`; `web/public/lib/services/viewer-settings.js:updateAccountSetting`
// - **Files:** app/functions/account/accountSettingsPut.js, app/lib/accountSettings.js, app/data/dynamoDbBundleRepository.js, app/functions/account/bundleGet.js, web/public/settings.html, web/public/settings.page.js, web/public/lib/services/viewer-settings.js, app/unit-tests/functions/accountSettings.test.js, app/unit-tests/lib/accountSettings.test.js, web/browser-tests/settings.browser.test.js
// - **Keywords:** account settings, settings page, pass generation, preview features, operator features, settings cog, viewer settings
// - **Related:** SITE-05
// @end-capability

// app/functions/account/accountSettingsPut.js
//
// Changes the caller's account settings (the booleans in app/lib/accountSettings.js). GET
// /api/v1/bundle returns the settings with the bundles.

import { validateEnv } from "../../lib/env.js";
import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  extractUserFromAuthorizerContext,
  parseRequestBody,
  http200OkResponse,
  http401UnauthorizedResponse,
  buildValidationError,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { resolveAccountSettings, validateAccountSettingsUpdate } from "../../lib/accountSettings.js";
import { updateAccountSettings } from "../../data/dynamoDbBundleRepository.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/account/accountSettingsPut.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "put", "/api/v1/account/settings", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["BUNDLE_DYNAMODB_TABLE_NAME"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

  const user = extractUserFromAuthorizerContext(event);
  if (!user?.sub) {
    return http401UnauthorizedResponse({ request, headers: responseHeaders, message: "Authentication required", error: {} });
  }

  const { update, errors } = validateAccountSettingsUpdate(parseRequestBody(event));
  if (errors.length > 0) {
    return buildValidationError(request, errors, responseHeaders);
  }

  const stored = await updateAccountSettings(user.sub, update);
  logger.info({ message: "Account settings updated", settings: update });
  return http200OkResponse({ request, headers: responseHeaders, data: { settings: resolveAccountSettings(stored) } });
}
