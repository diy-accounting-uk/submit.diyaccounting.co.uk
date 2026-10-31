// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-04 Fetch a company profile
// - **Use when:** a filing journey has a company number and needs the company's registered details.
// - **Does:** companiesHouseCompanyGet.js fetches a single company's details via getCompanyProfile. It enforces the caller's bundle entitlement and returns the profile as JSON.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/companies-house/companiesHouseCompanyGet.js:ingestHandler`; `app/functions/companies-house/companiesHouseCompanyGet.js:getCompanyProfile`
// - **Files:** app/functions/companies-house/companiesHouseCompanyGet.js, app/unit-tests/functions/companiesHouseCompanyGet.test.js, app/services/companiesHouseApi.js
// - **Keywords:** companies house, company profile, company number, bundle entitlement, GET /api/v1/companies-house/company
// - **Related:** CH-03
// @end-capability

// app/functions/companies-house/companiesHouseCompanyGet.js

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

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseCompanyGet.js" });

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "get", "/api/v1/companies-house/company/:companyNumber", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/company/:companyNumber", ingestHandler);
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

const trimmed = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * The registered office as the parts the accounts tag, from the Companies House address object.
 * The address lines are, in order and without empties: care of, PO box, premises with line 1
 * (the premises are left out when line 1 already starts with them), and line 2. The first three
 * are addressLine1 to addressLine3 and a fourth joins addressLine3.
 * @param {object} address - the registered_office_address object
 * @returns {{addressLine1?: string, addressLine2?: string, addressLine3?: string, cityOrTown?: string, countyRegion?: string, postalCode?: string, country?: string}}
 */
export function registeredOfficeFromAddress(address) {
  if (!address || typeof address !== "object") return {};
  const premises = trimmed(address.premises);
  const line1 = trimmed(address.address_line_1);
  const careOf = trimmed(address.care_of);
  const poBox = trimmed(address.po_box);
  const lines = [
    careOf && `c/o ${careOf}`,
    poBox && `PO Box ${poBox}`,
    premises && !line1.startsWith(premises) ? `${premises} ${line1}`.trim() : line1,
    trimmed(address.address_line_2),
  ].filter(Boolean);
  const [addressLine1, addressLine2, ...rest] = lines;
  const office = {
    addressLine1,
    addressLine2,
    addressLine3: rest.length > 0 ? rest.join(", ") : undefined,
    cityOrTown: trimmed(address.locality),
    countyRegion: trimmed(address.region),
    postalCode: trimmed(address.postal_code),
    country: trimmed(address.country),
  };
  return Object.fromEntries(Object.entries(office).filter(([, value]) => value));
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

  const { chResponse, profile } = await getCompanyProfile(companyNumber);

  if (!chResponse.ok) {
    return httpResponseFromCompaniesHouseResponse(request, chResponse, responseHeaders);
  }

  await publishActivityEvent({
    event: "company-profile-viewed",
    summary: "Companies House profile viewed",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: profile,
  });
}

// Service adaptor aware of the downstream service but not the consuming Lambda's incoming/outgoing HTTP request/response
export async function getCompanyProfile(companyNumber) {
  const chResponse = await companiesHouseHttpGet(`/company/${companyNumber}`);

  if (!chResponse.ok) {
    logger.warn({ message: "Companies House company lookup failed", companyNumber, status: chResponse.status });
    return { chResponse, profile: null };
  }

  const data = chResponse.data;
  const profile = {
    companyNumber: data.company_number,
    companyName: data.company_name,
    companyStatus: data.company_status,
    companyType: data.type,
    dateOfCreation: data.date_of_creation,
    jurisdiction: data.jurisdiction,
    registeredOfficeAddress: data.registered_office_address,
    registeredOffice: registeredOfficeFromAddress(data.registered_office_address),
    sicCodes: data.sic_codes,
    accountsNextDue: data.accounts?.next_accounts?.due_on,
    accountsNextPeriodEnd: data.accounts?.next_accounts?.period_end_on,
    confirmationStatementNextDue: data.confirmation_statement?.next_due,
    confirmationStatementNextMadeUpTo: data.confirmation_statement?.next_made_up_to,
  };

  return { chResponse, profile };
}
