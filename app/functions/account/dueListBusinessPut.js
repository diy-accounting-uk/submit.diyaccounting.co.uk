// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/account/dueListBusinessPut.js
// PUT /api/v1/due-list/businesses/{id} adds a business to the signed-in account's due list or
// replaces it; DELETE on the same path removes the business and every row due for it.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  http200OkResponse,
  http404NotFoundResponse,
  http409ConflictResponse,
  http500ServerErrorResponse,
  buildValidationError,
} from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { isValidCompanyNumber } from "../../services/companiesHouseApi.js";
import { deleteBusiness, listBusinessesAndRows, putBusiness } from "../../data/dynamoDbDueListRepository.js";
import {
  DUE_LIST_BUSINESS_CAP,
  http403ForbiddenFromBundleEnforcement,
  isValidBusinessId,
  publicItem,
  refreshJobOf,
  validateBusiness,
} from "../../services/dueList.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/account/dueListBusinessPut.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "put", "/api/v1/due-list/businesses/:id", ingestHandler);
  registerLambdaRoute(app, "delete", "/api/v1/due-list/businesses/:id", ingestHandler);
}
/* v8 ignore stop */

async function putOne(request, responseHeaders, userSub, businessId, body) {
  const { business, errors } = validateBusiness(body, isValidCompanyNumber);
  if (errors.length > 0) return buildValidationError(request, errors, responseHeaders);
  const { businesses } = await listBusinessesAndRows(userSub);
  const stored = businesses.find((item) => item.businessId === businessId);
  if (!stored && businesses.length >= DUE_LIST_BUSINESS_CAP) {
    return http409ConflictResponse({
      request,
      headers: { ...responseHeaders },
      message: `The due list holds at most ${DUE_LIST_BUSINESS_CAP} businesses`,
      error: { reason: "due_list_full" },
    });
  }
  const today = new Date().toISOString().slice(0, 10);
  const item = await putBusiness(userSub, {
    id: businessId,
    ...business,
    ...(stored?.hmrcReadAt ? { hmrcReadAt: stored.hmrcReadAt } : {}),
    ...refreshJobOf(business.kind, today),
  });
  logger.info({ message: "Due list business stored", kind: business.kind, replaced: Boolean(stored) });
  return http200OkResponse({ request, headers: { ...responseHeaders }, data: { business: publicItem(item) } });
}

export async function ingestHandler(event) {
  await initializeSalt();
  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json" };
  const method = String(event?.requestContext?.http?.method || "").toUpperCase();

  let userSub;
  try {
    ({ userSub } = await enforceBundles(event));
  } catch (error) {
    return http403ForbiddenFromBundleEnforcement(error, request);
  }

  const businessId = event.pathParameters?.id;
  if (!isValidBusinessId(businessId)) {
    return buildValidationError(request, ["The business id must be 1 to 40 letters, digits or hyphens"], responseHeaders);
  }

  try {
    if (method === "DELETE") {
      const removed = await deleteBusiness(userSub, businessId);
      if (removed === 0) {
        return http404NotFoundResponse({ request, headers: { ...responseHeaders }, message: "No such business on the due list" });
      }
      return http200OkResponse({ request, headers: { ...responseHeaders }, data: { removed } });
    }
    return await putOne(request, responseHeaders, userSub, businessId, parseRequestBody(event));
  } catch (error) {
    logger.error({ message: "The due list business could not be changed", method, error: error.message });
    return http500ServerErrorResponse({ request, headers: { ...responseHeaders }, message: "The due list could not be changed" });
  }
}
