// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseFilingDataPost.js
// Reads the register data a confirmation statement form is built from: CompanyDataRequest and
// PaymentPeriodsRequest, both synchronous and free. The company authentication code the user
// types goes into these requests only, is never logged, and is dropped once this call returns -
// the same rule companiesHouseAccountsPost.js already follows for its own authentication code.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http200OkResponse,
  http500ServerErrorResponse,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { isValidCompanyNumber, http403ForbiddenFromBundleEnforcement } from "../../services/companiesHouseApi.js";
import { isValidIsoDate } from "../../lib/hmrcValidation.js";
import {
  buildCompanyDataRequest,
  buildPaymentPeriodsRequest,
  parseCompanyDataResponse,
  parsePaymentPeriodsResponse,
  parseGatewayResponse,
  resolvePresenterCredentials,
  postToGateway,
} from "../../services/companiesHouseXmlGateway.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseFilingDataPost.js" });

const MIN_COMPANY_AUTH_CODE_LENGTH = 6;
const MAX_COMPANY_AUTH_CODE_LENGTH = 8;

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/companies-house/company/:companyNumber/filing-data", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/company/:companyNumber/filing-data", ingestHandler);
}
/* v8 ignore stop */

export function extractAndValidateParameters(event, errorMessages) {
  const pathParams = event.pathParameters || {};
  const { valid, normalised } = isValidCompanyNumber(pathParams.companyNumber);
  if (!valid) {
    errorMessages.push("Invalid company number - must be 8 characters");
  }

  const parsedBody = parseRequestBody(event) || {};
  const { companyAuthCode, madeUpDate, companyType } = parsedBody;

  const trimmedCompanyAuthCode = typeof companyAuthCode === "string" ? companyAuthCode.trim() : "";
  if (trimmedCompanyAuthCode.length < MIN_COMPANY_AUTH_CODE_LENGTH || trimmedCompanyAuthCode.length > MAX_COMPANY_AUTH_CODE_LENGTH) {
    errorMessages.push(`Invalid companyAuthCode - must be ${MIN_COMPANY_AUTH_CODE_LENGTH} to ${MAX_COMPANY_AUTH_CODE_LENGTH} characters`);
  }

  if (!madeUpDate || !isValidIsoDate(madeUpDate)) {
    errorMessages.push("Invalid or missing madeUpDate - must be YYYY-MM-DD");
  }

  return {
    companyNumber: normalised,
    companyAuthCode: trimmedCompanyAuthCode,
    madeUpDate,
    companyType: typeof companyType === "string" && companyType.trim() ? companyType.trim() : undefined,
  };
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["COMPANIES_HOUSE_XMLGW_URI"]);

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
  const { companyNumber, companyAuthCode, madeUpDate, companyType } = extractAndValidateParameters(event, errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  const { presenterId, presenterCode } = await resolvePresenterCredentials();
  const gatewayTest = process.env.COMPANIES_HOUSE_GATEWAY_TEST === "true";
  // Forwarded to the gateway call so the simulator's Gov-Test-Scenario handling can be driven
  // from the page's developer-mode field; the real gateway ignores headers it does not know.
  const govTestScenario = getHeader(event.headers, "Gov-Test-Scenario");
  const gatewayHeaders = govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {};

  const companyDataXml = buildCompanyDataRequest({
    presenterId,
    presenterCode,
    companyNumber,
    companyAuthenticationCode: companyAuthCode,
    companyType,
    madeUpDate,
    gatewayTest,
  });
  const companyDataGatewayResponse = await postToGateway(companyDataXml, gatewayHeaders);
  const companyDataParsed = parseGatewayResponse(companyDataGatewayResponse.data);

  if (companyDataParsed.errors?.length) {
    logger.warn({ message: "Companies House rejected the CompanyDataRequest", companyNumber, errors: companyDataParsed.errors });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House rejected the company data request",
      error: { errors: companyDataParsed.errors },
    });
  }

  const paymentPeriodsXml = buildPaymentPeriodsRequest({
    presenterId,
    presenterCode,
    companyNumber,
    companyAuthenticationCode: companyAuthCode,
    companyType,
    gatewayTest,
  });
  const paymentPeriodsGatewayResponse = await postToGateway(paymentPeriodsXml, gatewayHeaders);
  const paymentPeriodsParsed = parseGatewayResponse(paymentPeriodsGatewayResponse.data);

  if (paymentPeriodsParsed.errors?.length) {
    logger.warn({ message: "Companies House rejected the PaymentPeriodsRequest", companyNumber, errors: paymentPeriodsParsed.errors });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House rejected the payment periods request",
      error: { errors: paymentPeriodsParsed.errors },
    });
  }

  const companyData = parseCompanyDataResponse(companyDataGatewayResponse.data);
  const paymentPeriods = parsePaymentPeriodsResponse(paymentPeriodsGatewayResponse.data);

  await publishActivityEvent({
    event: "companies-house-confirmation-statement-filing-data-viewed",
    summary: "Companies House confirmation statement filing data viewed",
    userSub,
  });

  return http200OkResponse({
    request,
    headers: { ...responseHeaders },
    data: {
      ...companyData,
      paymentPeriods: paymentPeriods?.periods || [],
      paymentPeriodPaid: paymentPeriods?.periods?.[0]?.periodPaid ?? false,
    },
  });
}
