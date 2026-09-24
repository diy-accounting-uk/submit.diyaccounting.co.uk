// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHousePscGet.js
// Public-data proxy for a company's persons with significant control, so the confirmation
// statement journey's first view can show them alongside the officers - a PSC's own identity
// verification is separate from a director's, and never carried in the confirmation statement
// itself (it goes through the PSC verification statement instead).

import { createLogger } from "../../lib/logger.js";
import { extractRequest, http200OkResponse, buildValidationError } from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import {
  companiesHouseHttpGet,
  httpResponseFromCompaniesHouseResponse,
  isValidCompanyNumber,
  http403ForbiddenFromBundleEnforcement,
} from "../../services/companiesHouseApi.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHousePscGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/companies-house/company/:companyNumber/persons-with-significant-control", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/company/:companyNumber/persons-with-significant-control", ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const pathParams = event.pathParameters || {};
  const { valid, normalised } = isValidCompanyNumber(pathParams.companyNumber);
  if (!valid) {
    errorMessages.push("Invalid company number - must be 8 characters");
  }
  return { companyNumber: normalised };
}

function mapPsc(item) {
  return {
    name: item.name,
    kind: item.kind,
    naturesOfControl: item.natures_of_control,
    notifiedOn: item.notified_on,
    ceasedOn: item.ceased_on,
    dateOfBirth: item.date_of_birth,
    nationality: item.nationality,
    identityVerificationDetails: item.identity_verification_details,
  };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["COMPANIES_HOUSE_BASE_URI"]);

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
  const { companyNumber } = extractAndValidateParameters(event, errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  const chResponse = await companiesHouseHttpGet(`/company/${companyNumber}/persons-with-significant-control`);

  if (!chResponse.ok) {
    logger.warn({ message: "Companies House PSC lookup failed", companyNumber, status: chResponse.status });
    return httpResponseFromCompaniesHouseResponse(request, chResponse, responseHeaders);
  }

  await publishActivityEvent({
    event: "company-pscs-viewed",
    summary: "Companies House persons with significant control viewed",
    userSub,
  });

  const data = chResponse.data;
  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: {
      companyNumber,
      activeCount: data.active_count,
      ceasedCount: data.ceased_count,
      pscs: (data.items || []).map(mapPsc),
    },
  });
}
