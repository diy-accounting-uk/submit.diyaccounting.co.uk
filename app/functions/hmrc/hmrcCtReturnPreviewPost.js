// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/hmrc/hmrcCtReturnPreviewPost.js
// Builds the CT600 return, the computations iXBRL and the FRS 102 accounts iXBRL from the figures
// the user entered, so the page can show them before anything reaches HMRC. Never calls HMRC and
// never takes the Government Gateway credentials.

import { createLogger } from "../../lib/logger.js";
import { extractRequest, buildValidationError, http200OkResponse } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../services/companiesHouseApi.js";
import { extractAndValidateCtReturnParameters, buildCtReturnDocuments } from "../../services/hmrcCtReturnRequest.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcCtReturnPreviewPost.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/hmrc/ct/return/preview", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/hmrc/ct/return/preview", ingestHandler);
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
    return http200OkResponse({ request, headers: { ...responseHeaders }, data: {} });
  }

  const errorMessages = [];
  const returnRequest = extractAndValidateCtReturnParameters(event, errorMessages, { requireGatewayCredentials: false });
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  let documents;
  try {
    documents = buildCtReturnDocuments(returnRequest);
  } catch (error) {
    logger.warn({ message: "Company Tax Return documents could not be built", error: error.message });
    return buildValidationError(request, [error.message], responseHeaders);
  }

  await publishActivityEvent({
    event: "hmrc-ct-return-previewed",
    summary: "HMRC Company Tax Return previewed",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: {
      ct600Xml: documents.irEnvelopeXml,
      computationsIxbrl: documents.computationsIxbrl,
      accountsIxbrl: documents.accountsIxbrl,
      boxes: documents.boxes,
      computationLines: documents.computationLines,
      worked: documents.worked,
    },
  });
}
