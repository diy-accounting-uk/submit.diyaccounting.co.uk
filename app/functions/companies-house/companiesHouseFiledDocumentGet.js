// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseFiledDocumentGet.js
// One filed set of accounts as its iXBRL document, fetched on the server from the Document API and
// answered as JSON that holds the document text.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  http200OkResponse,
  buildValidationError,
  http404NotFoundResponse,
  http413PayloadTooLargeResponse,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { LOOKUP_CALLS, lookupLimitReached, lookupLimitResponse } from "../../services/companiesHouseLookupLimit.js";
import {
  httpResponseFromCompaniesHouseResponse,
  isValidCompanyNumber,
  http403ForbiddenFromBundleEnforcement,
} from "../../services/companiesHouseApi.js";
import { fetchFiledAccountsDocument, IXBRL_CONTENT_TYPE, MAX_DOCUMENT_RESPONSE_BYTES } from "../../services/companiesHouseFiledAccounts.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseFiledDocumentGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/companies-house/company/:companyNumber/filed-accounts/:transactionId/document", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/company/:companyNumber/filed-accounts/:transactionId/document", ingestHandler);
}
/* v8 ignore stop */

const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function extractAndValidateParameters(event, errorMessages) {
  const pathParams = event.pathParameters || {};
  const { valid, normalised } = isValidCompanyNumber(pathParams.companyNumber);
  if (!valid) {
    errorMessages.push("Invalid company number - must be 8 characters");
  }
  const transactionId = String(pathParams.transactionId ?? "");
  if (!TRANSACTION_ID_PATTERN.test(transactionId)) {
    errorMessages.push("Invalid transaction id - letters, digits, hyphens and underscores only");
  }
  return { companyNumber: normalised, transactionId };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["COMPANIES_HOUSE_BASE_URI", "COMPANIES_HOUSE_DOCUMENT_BASE_URI"]);

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
  const { companyNumber, transactionId } = extractAndValidateParameters(event, errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  if (await lookupLimitReached(userSub, LOOKUP_CALLS.filedDocument)) return lookupLimitResponse(request, responseHeaders);

  const { chResponse, problem, set, document } = await fetchFiledAccountsDocument(companyNumber, transactionId);

  if (chResponse) {
    logger.warn({
      message: "Companies House filed accounts document lookup failed",
      companyNumber,
      transactionId,
      status: chResponse.status,
    });
    return httpResponseFromCompaniesHouseResponse(request, chResponse, responseHeaders);
  }
  if (problem === "not-accounts") {
    return http404NotFoundResponse({
      request,
      headers: { ...responseHeaders },
      message: "That filing is not a set of accounts",
      error: { code: "NOT_ACCOUNTS", transactionId },
    });
  }
  if (problem === "no-ixbrl") {
    return http404NotFoundResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House holds no iXBRL document for that set of accounts",
      error: { code: "NO_IXBRL_DOCUMENT", transactionId, paperFiled: set.paperFiled },
    });
  }
  if (problem === "too-large") {
    return http413PayloadTooLargeResponse({
      request,
      headers: { ...responseHeaders },
      message: "The iXBRL document is larger than this API can answer",
      error: { code: "DOCUMENT_TOO_LARGE", transactionId, limitBytes: MAX_DOCUMENT_RESPONSE_BYTES },
    });
  }

  await publishActivityEvent({
    event: "company-filed-accounts-document-viewed",
    summary: "Companies House filed accounts document viewed",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: { companyNumber, ...set, contentType: IXBRL_CONTENT_TYPE, document },
  });
}
