// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
