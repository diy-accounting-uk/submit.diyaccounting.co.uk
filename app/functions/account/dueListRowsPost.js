// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/account/dueListRowsPost.js
// POST /api/v1/due-list/rows: the rows the account's page read from HMRC for one business. They
// replace that business's HMRC rows and its computed rows of the same types, and the business
// records when HMRC was read. A row holds only the fields of a due list row, so a VRN, a NINO, a
// period key or an amount is refused.

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
import { DueListBusinessMissingError, DueListBusyError, DueListFullError, putRows } from "../../data/dynamoDbDueListRepository.js";
import { DUE_LIST_ROW_CAP, http403ForbiddenFromBundleEnforcement, validateHmrcRows } from "../../services/dueList.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/account/dueListRowsPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/due-list/rows", ingestHandler);
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

  const { businessId, rows, errors } = validateHmrcRows(parseRequestBody(event));
  if (errors.length > 0) return buildValidationError(request, errors, responseHeaders);

  try {
    const readAt = new Date().toISOString();
    const newRows = rows.map((row) => ({ ...row, readAt }));
    const newTypes = new Set(newRows.map((row) => row.type));
    const replaces = (row) =>
      row.businessId === businessId && (row.source === "hmrc" || (row.source === "computed" && newTypes.has(row.type)));
    // The write records on the business when HMRC was read, only if the business is still on the list.
    const result = await putRows(userSub, newRows, replaces, { forBusiness: { id: businessId, set: { hmrcReadAt: readAt } } });
    // The unwritten rows' keys name the business, so the log line holds their count.
    logger.info({
      message: "Due list HMRC rows stored",
      written: result.written,
      refreshed: result.refreshed,
      removed: result.removed,
      unwritten: result.unwritten.length,
    });
    return http200OkResponse({ request, headers: { ...responseHeaders }, data: { ...result, readAt } });
  } catch (error) {
    if (error instanceof DueListBusinessMissingError) {
      return http404NotFoundResponse({ request, headers: { ...responseHeaders }, message: "No such business on the due list" });
    }
    if (error instanceof DueListFullError) {
      return http409ConflictResponse({
        request,
        headers: { ...responseHeaders },
        message: `The due list holds at most ${DUE_LIST_ROW_CAP} rows`,
        error: { reason: "due_list_rows_full" },
      });
    }
    if (error instanceof DueListBusyError) {
      return http409ConflictResponse({
        request,
        headers: { ...responseHeaders },
        message: error.message,
        error: { reason: "due_list_busy" },
      });
    }
    logger.error({ message: "The due list rows could not be stored", error: error.message });
    return http500ServerErrorResponse({ request, headers: { ...responseHeaders }, message: "The due list could not be changed" });
  }
}
