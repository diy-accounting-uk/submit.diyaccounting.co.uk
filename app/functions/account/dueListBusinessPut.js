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
import { deleteBusiness, DueListBusyError, DueListFullError, putBusiness } from "../../data/dynamoDbDueListRepository.js";
import {
  BUSINESS_ID_RULE,
  DUE_LIST_BUSINESS_CAP,
  http403ForbiddenFromBundleEnforcement,
  publicItem,
  refreshJobOf,
  validateBusiness,
} from "../../services/dueList.js";
import { initializeSalt } from "../../services/subHasher.js";
import { isValidBusinessId } from "../../../web/public/lib/due/due-business-id.js";

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
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { item } = await putBusiness(userSub, { id: businessId, ...business, ...refreshJobOf(business.kind, today) });
    return http200OkResponse({ request, headers: { ...responseHeaders }, data: { business: publicItem(item) } });
  } catch (error) {
    if (!(error instanceof DueListFullError)) throw error;
    return http409ConflictResponse({
      request,
      headers: { ...responseHeaders },
      message: `The due list holds at most ${DUE_LIST_BUSINESS_CAP} businesses`,
      error: { reason: "due_list_full" },
    });
  }
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
    return buildValidationError(request, [BUSINESS_ID_RULE], responseHeaders);
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
    if (error instanceof DueListBusyError) {
      return http409ConflictResponse({
        request,
        headers: { ...responseHeaders },
        message: error.message,
        error: { reason: "due_list_busy" },
      });
    }
    logger.error({ message: "The due list business could not be changed", method, error: error.message });
    return http500ServerErrorResponse({ request, headers: { ...responseHeaders }, message: "The due list could not be changed" });
  }
}
