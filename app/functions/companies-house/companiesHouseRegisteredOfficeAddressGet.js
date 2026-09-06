// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/companies-house/companiesHouseRegisteredOfficeAddressGet.js
// Reads the current registered office address from the public register with the API key, the
// same client the read-only company profile lookup uses. The `etag` this returns is the point of
// the route: the address change filing needs it as `reference_etag` so Companies House can reject
// a submission if the register moved underneath us.

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

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseRegisteredOfficeAddressGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/companies-house/company/:companyNumber/registered-office-address", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/company/:companyNumber/registered-office-address", ingestHandler);
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

  const { chResponse, address } = await getRegisteredOfficeAddress(companyNumber);

  if (!chResponse.ok) {
    return httpResponseFromCompaniesHouseResponse(request, chResponse, responseHeaders);
  }

  await publishActivityEvent({
    event: "companies-house-registered-office-address-viewed",
    summary: "Companies House registered office address viewed",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: address,
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function getRegisteredOfficeAddress(companyNumber) {
  const chResponse = await companiesHouseHttpGet(`/company/${companyNumber}/registered-office-address`);

  if (!chResponse.ok) {
    logger.warn({ message: "Companies House registered office address lookup failed", companyNumber, status: chResponse.status });
    return { chResponse, address: null };
  }

  const data = chResponse.data;
  const address = {
    etag: data.etag,
    premises: data.premises,
    addressLine1: data.address_line_1,
    addressLine2: data.address_line_2,
    locality: data.locality,
    region: data.region,
    postalCode: data.postal_code,
    country: data.country,
  };

  return { chResponse, address };
}
