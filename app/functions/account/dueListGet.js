// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/account/dueListGet.js
// GET /api/v1/due-list: the signed-in account's businesses and the rows due for them.

import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, http500ServerErrorResponse } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { listBusinessesAndRows } from "../../data/dynamoDbDueListRepository.js";
import { http403ForbiddenFromBundleEnforcement, publicItem } from "../../services/dueList.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/account/dueListGet.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/due-list", ingestHandler);
}
/* v8 ignore stop */

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

  try {
    const { businesses, rows } = await listBusinessesAndRows(userSub);
    return http200OkResponse({
      request,
      headers: { ...responseHeaders },
      data: { businesses: businesses.map(publicItem), rows: rows.map(publicItem) },
    });
  } catch (error) {
    logger.error({ message: "The due list could not be read", error: error.message });
    return http500ServerErrorResponse({ request, headers: { ...responseHeaders }, message: "The due list could not be read" });
  }
}
