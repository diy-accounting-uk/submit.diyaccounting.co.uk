// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHousePscVerificationStatementPost.js
// Builds the PSCVerificationStatement body, wraps it in a GovTalk envelope and submits it to the
// Companies House XML Gateway. Filed separately from the confirmation statement, once per
// director who is also a person with significant control, inside the window starting the day
// after the review date. The company authentication code and the PSC's personal code the user
// types go into the envelope only, are never logged, and are dropped once this call returns - the
// same rule companiesHouseConfirmationStatementPost.js follows for its own codes.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http200OkResponse,
  http201CreatedResponse,
  http500ServerErrorResponse,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { isValidCompanyNumber, http403ForbiddenFromBundleEnforcement } from "../../services/companiesHouseApi.js";
import { isValidIsoDate } from "../../lib/hmrcValidation.js";
import { buildPscVerificationStatementBody } from "../../services/companiesHousePscVerificationStatementXml.js";
import {
  buildPscVerificationStatementSubmission,
  allocateSubmissionNumber,
  resolvePresenterCredentials,
  postToGateway,
  parseGatewayResponse,
} from "../../services/companiesHouseXmlGateway.js";
import { putAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import { publishActivityEvent, publishActivityFailureEvent, resolveActorClass } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHousePscVerificationStatementPost.js" });

const MIN_COMPANY_AUTH_CODE_LENGTH = 6;
const MAX_COMPANY_AUTH_CODE_LENGTH = 8;
const PERSONAL_CODE_LENGTH = 11;

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/companies-house/psc-verification-statement", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/psc-verification-statement", ingestHandler);
}
/* v8 ignore stop */

// Extracts and validates a PSC verification statement request.
export function extractAndValidateParameters(event, errorMessages) {
  const parsedBody = parseRequestBody(event) || {};
  const {
    companyNumber,
    companyName,
    companyAuthCode,
    dateSigned,
    title,
    forename,
    otherForenames,
    surname,
    dobMonth,
    dobYear,
    personalCode,
  } = parsedBody;

  const { valid: companyNumberValid, normalised: normalisedCompanyNumber } = isValidCompanyNumber(companyNumber);
  if (!companyNumberValid) {
    errorMessages.push("Invalid company number - must be 8 characters");
  }

  const trimmedCompanyName = typeof companyName === "string" ? companyName.trim() : "";
  if (!trimmedCompanyName) {
    errorMessages.push("Missing companyName");
  }

  const trimmedCompanyAuthCode = typeof companyAuthCode === "string" ? companyAuthCode.trim() : "";
  if (trimmedCompanyAuthCode.length < MIN_COMPANY_AUTH_CODE_LENGTH || trimmedCompanyAuthCode.length > MAX_COMPANY_AUTH_CODE_LENGTH) {
    errorMessages.push(`Invalid companyAuthCode - must be ${MIN_COMPANY_AUTH_CODE_LENGTH} to ${MAX_COMPANY_AUTH_CODE_LENGTH} characters`);
  }

  if (!dateSigned || !isValidIsoDate(dateSigned)) {
    errorMessages.push("Invalid or missing dateSigned - must be YYYY-MM-DD");
  }

  if (!surname || typeof surname !== "string") {
    errorMessages.push("Missing surname");
  }

  const trimmedPersonalCode = typeof personalCode === "string" ? personalCode.trim() : "";
  if (trimmedPersonalCode.length !== PERSONAL_CODE_LENGTH) {
    errorMessages.push(`Invalid personalCode - must be ${PERSONAL_CODE_LENGTH} characters`);
  }

  if (dobMonth !== undefined && (dobMonth < 1 || dobMonth > 12)) {
    errorMessages.push("Invalid dobMonth - must be 1 to 12");
  }

  return {
    companyNumber: normalisedCompanyNumber,
    companyName: trimmedCompanyName,
    companyAuthCode: trimmedCompanyAuthCode,
    dateSigned,
    title,
    forename,
    otherForenames,
    surname,
    dobMonth,
    dobYear,
    personalCode: trimmedPersonalCode,
  };
}

async function recordSubmissionFailure({ failure, summary, userSub, detail = {} }) {
  await publishActivityFailureEvent({
    event: "companies-house-psc-verification-statement-failed",
    summary,
    failure,
    userSub,
    actor: resolveActorClass(),
    detail,
  });
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["COMPANIES_HOUSE_XMLGW_URI", "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME", "COMPANIES_HOUSE_PACKAGE_REFERENCE"]);

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
  const statement = extractAndValidateParameters(event, errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  const asyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  const gatewayTest = process.env.COMPANIES_HOUSE_GATEWAY_TEST === "true";
  const packageReference = process.env.COMPANIES_HOUSE_PACKAGE_REFERENCE;
  // Forwarded to the gateway call so the simulator's Gov-Test-Scenario handling can be driven
  // from the page's developer-mode field; the real gateway ignores headers it does not know.
  const govTestScenario = getHeader(event.headers, "Gov-Test-Scenario");

  let submissionNumber;
  try {
    const { presenterId, presenterCode } = await resolvePresenterCredentials();

    const statementXml = buildPscVerificationStatementBody({
      title: statement.title,
      forename: statement.forename,
      otherForenames: statement.otherForenames,
      surname: statement.surname,
      dobMonth: statement.dobMonth,
      dobYear: statement.dobYear,
      personalCode: statement.personalCode,
    });

    submissionNumber = await allocateSubmissionNumber();

    await putAsyncRequest(userSub, submissionNumber, "pending", null, asyncRequestsTableName);

    const submissionXml = buildPscVerificationStatementSubmission({
      presenterId,
      presenterCode,
      companyNumber: statement.companyNumber,
      companyName: statement.companyName,
      companyAuthenticationCode: statement.companyAuthCode,
      packageReference,
      submissionNumber,
      dateSigned: statement.dateSigned,
      statementXml,
      gatewayTest,
    });

    const gatewayHeaders = govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {};
    const gatewayResponse = await postToGateway(submissionXml, gatewayHeaders);
    const parsed = parseGatewayResponse(gatewayResponse.data);

    if (parsed.errors?.length) {
      await putAsyncRequest(userSub, submissionNumber, "failed", parsed, asyncRequestsTableName);
      await recordSubmissionFailure({
        failure: "gateway-rejected-envelope",
        summary: "Companies House PSC verification statement rejected by the gateway",
        userSub,
        detail: { errors: parsed.errors },
      });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: "Companies House rejected the PSC verification statement submission envelope",
        error: { submissionNumber, errors: parsed.errors },
      });
    }

    await publishActivityEvent({
      event: "companies-house-psc-verification-statement-submitted",
      summary: "Companies House PSC verification statement submitted",
      userSub,
    });

    return http201CreatedResponse({
      request,
      headers: { ...responseHeaders },
      data: {
        submissionNumber,
        gatewayTimestamp: parsed.gatewayTimestamp,
        pollInterval: parsed.pollInterval,
      },
    });
  } catch (error) {
    logger.error({
      message: "Unexpected error submitting Companies House PSC verification statement",
      error: error.message,
      stack: error.stack,
    });
    if (submissionNumber) {
      await putAsyncRequest(userSub, submissionNumber, "failed", { message: error.message }, asyncRequestsTableName);
    }
    await recordSubmissionFailure({
      failure: "internal-error",
      summary: "Companies House PSC verification statement submission failed unexpectedly",
      userSub,
    });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: { detail: error.message },
    });
  }
}
