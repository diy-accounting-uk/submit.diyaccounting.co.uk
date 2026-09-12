// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseRegisteredOfficeAddressPost.js
// Adds a registered office address change resource to an open transaction (the AD01 form). All
// validation runs server side: postcode became mandatory for this filing on 15 September 2025.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http200OkResponse,
  http201CreatedResponse,
  http400BadRequestResponse,
  http409ConflictResponse,
  http401UnauthorizedResponse,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import {
  companiesHouseFilingRequest,
  extractCompaniesHouseAccessTokenFromLambdaEvent,
  httpResponseFromFilingResponse,
  http403ForbiddenFromBundleEnforcement,
} from "../../services/companiesHouseFilingApi.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseRegisteredOfficeAddressPost.js" });

const VALID_COUNTRIES = new Set(["England", "Wales", "Scotland", "Northern Ireland", "Great Britain", "United Kingdom", "Not specified"]);

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/companies-house/transaction/:transactionId/registered-office-address", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/transaction/:transactionId/registered-office-address", ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const pathParams = event.pathParameters || {};
  const transactionId = (pathParams.transactionId || "").trim();
  if (!transactionId) {
    errorMessages.push("Missing transactionId");
  }

  const parsedBody = parseRequestBody(event) || {};
  const {
    premises,
    addressLine1,
    addressLine2,
    locality,
    region,
    postalCode,
    country,
    acceptAppropriateOfficeAddressStatement,
    referenceEtag,
  } = parsedBody;

  if (!premises || !String(premises).trim()) errorMessages.push("Missing premises");
  if (!addressLine1 || !String(addressLine1).trim()) errorMessages.push("Missing addressLine1");
  if (!locality || !String(locality).trim()) errorMessages.push("Missing locality");
  if (!country || !String(country).trim()) {
    errorMessages.push("Missing country");
  } else if (!VALID_COUNTRIES.has(country)) {
    errorMessages.push(`country must be one of ${Array.from(VALID_COUNTRIES).join(", ")}`);
  }
  if (!postalCode || !String(postalCode).trim()) errorMessages.push("Missing postalCode");
  if (!referenceEtag || !String(referenceEtag).trim()) errorMessages.push("Missing referenceEtag");

  if (acceptAppropriateOfficeAddressStatement !== true) {
    errorMessages.push("The user must accept the section 86(2) appropriate address statement");
  }

  return {
    transactionId,
    premises,
    addressLine1,
    addressLine2,
    locality,
    region,
    postalCode,
    country,
    acceptAppropriateOfficeAddressStatement,
    referenceEtag,
  };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["COMPANIES_HOUSE_FILING_BASE_URI"]);

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
  const parameters = extractAndValidateParameters(event, errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  const accessToken = extractCompaniesHouseAccessTokenFromLambdaEvent(event);
  if (!accessToken) {
    return http401UnauthorizedResponse({
      request,
      headers: { ...responseHeaders },
      message: "Missing Companies House access token",
      error: { code: "COMPANIES_HOUSE_UNAUTHORIZED" },
    });
  }

  const { chResponse, resource } = await putRegisteredOfficeAddress(accessToken, parameters);

  if (chResponse.status === 400) {
    return http400BadRequestResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House rejected the registered office address",
      error: { errors: chResponse.data?.errors },
    });
  }

  if (chResponse.status === 409) {
    return http409ConflictResponse({
      request,
      headers: { ...responseHeaders },
      message: "This transaction already holds a registered office address change",
      error: { transactionId: parameters.transactionId },
    });
  }

  if (chResponse.status === 403) {
    return http409ConflictResponse({
      request,
      headers: { ...responseHeaders },
      message: "The transaction is closed",
      error: { transactionId: parameters.transactionId },
    });
  }

  if (!chResponse.ok) {
    return httpResponseFromFilingResponse(request, chResponse, responseHeaders);
  }

  await publishActivityEvent({
    event: "companies-house-registered-office-address-filed",
    summary: "Companies House registered office address change filed",
    userSub,
  });

  return http201CreatedResponse({
    request,
    headers: { ...responseHeaders },
    data: resource,
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function putRegisteredOfficeAddress(accessToken, parameters) {
  const { transactionId, ...address } = parameters;
  const chResponse = await companiesHouseFilingRequest("POST", `/transactions/${transactionId}/registered-office-address`, {
    accessToken,
    body: {
      premises: address.premises,
      address_line_1: address.addressLine1,
      address_line_2: address.addressLine2,
      locality: address.locality,
      region: address.region,
      postal_code: address.postalCode,
      country: address.country,
      accept_appropriate_office_address_statement: address.acceptAppropriateOfficeAddressStatement,
      reference_etag: address.referenceEtag,
    },
  });

  if (!chResponse.ok) {
    logger.warn({ message: "Companies House registered office address filing failed", transactionId, status: chResponse.status });
    return { chResponse, resource: null };
  }

  const data = chResponse.data;
  const resource = {
    premises: data.premises,
    addressLine1: data.address_line_1,
    addressLine2: data.address_line_2,
    locality: data.locality,
    region: data.region,
    postalCode: data.postal_code,
    country: data.country,
    acceptAppropriateOfficeAddressStatement: data.accept_appropriate_office_address_statement,
    etag: data.etag,
    kind: data.kind,
    links: data.links,
  };

  return { chResponse, resource };
}
