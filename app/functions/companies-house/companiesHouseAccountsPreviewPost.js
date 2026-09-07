// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/companies-house/companiesHouseAccountsPreviewPost.js
// Renders the FRS 105 micro-entity iXBRL from the balance sheet the user entered, so the page can
// show it before anything reaches the Companies House XML Gateway. Never calls the gateway and
// never needs the company authentication code.

import { createLogger } from "../../lib/logger.js";
import { extractRequest, buildValidationError, http200OkResponse } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../services/companiesHouseApi.js";
import { buildMicroEntityAccounts } from "../../services/microEntityAccountsIxbrl.js";
import { extractAndValidateAccountsParameters } from "./companiesHouseAccountsPost.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseAccountsPreviewPost.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/companies-house/accounts/preview", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/accounts/preview", ingestHandler);
}
/* v8 ignore stop */

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json" };

  let userSub;
  try {
    ({ userSub } = await enforceBundles(event));
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  if (event?.requestContext?.http?.method === "HEAD") {
    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: {},
    });
  }

  const errorMessages = [];
  const accounts = extractAndValidateAccountsParameters(event, errorMessages, { requireCompanyAuthCode: false });

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  let ixbrl;
  try {
    ixbrl = buildMicroEntityAccounts(accounts);
  } catch (error) {
    logger.error({ message: "Failed to render micro-entity accounts iXBRL", error: error.message, stack: error.stack });
    throw error;
  }

  await publishActivityEvent({
    event: "companies-house-accounts-previewed",
    summary: "Companies House micro-entity accounts previewed",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: { ixbrl },
  });
}
