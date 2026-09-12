// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseAccountsPost.js
// Generates the FRS 105 micro-entity iXBRL, wraps it in a GovTalk envelope and submits it to the
// Companies House XML Gateway. The company authentication code the user types goes into the
// envelope's FormHeader only, is never logged, and is dropped once this call returns.

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
import { buildMicroEntityAccounts } from "../../services/microEntityAccountsIxbrl.js";
import {
  buildAccountsSubmission,
  allocateSubmissionNumber,
  resolvePresenterCredentials,
  postToGateway,
  parseGatewayResponse,
} from "../../services/companiesHouseXmlGateway.js";
import { putAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import { publishActivityEvent, publishActivityFailureEvent, resolveActorClass } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseAccountsPost.js" });

const MIN_COMPANY_AUTH_CODE_LENGTH = 6;
const MAX_COMPANY_AUTH_CODE_LENGTH = 8;

const BALANCE_SHEET_FIELDS = [
  "fixedAssets",
  "currentAssets",
  "creditorsWithinOneYear",
  "creditorsAfterOneYear",
  "calledUpShareCapital",
  "profitAndLossAccount",
  "capitalAndReserves",
];

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/companies-house/accounts", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/accounts", ingestHandler);
}
/* v8 ignore stop */

// Extracts and validates the accounts filing request. Shared with the preview Lambda, which
// never needs the company authentication code because it never reaches the gateway.
export function extractAndValidateAccountsParameters(event, errorMessages, { requireCompanyAuthCode = true } = {}) {
  const parsedBody = parseRequestBody(event) || {};
  const {
    companyNumber,
    companyName,
    companyAuthCode,
    periodStart,
    periodEnd,
    balanceSheet,
    averageEmployees,
    director,
    statementsAccepted,
  } = parsedBody;

  const { valid: companyNumberValid, normalised: normalisedCompanyNumber } = isValidCompanyNumber(companyNumber);
  if (!companyNumberValid) {
    errorMessages.push("Invalid company number - must be 8 characters");
  }

  const trimmedCompanyName = typeof companyName === "string" ? companyName.trim() : "";
  if (!trimmedCompanyName) {
    errorMessages.push("Missing companyName");
  }

  let trimmedCompanyAuthCode;
  if (requireCompanyAuthCode) {
    trimmedCompanyAuthCode = typeof companyAuthCode === "string" ? companyAuthCode.trim() : "";
    if (trimmedCompanyAuthCode.length < MIN_COMPANY_AUTH_CODE_LENGTH || trimmedCompanyAuthCode.length > MAX_COMPANY_AUTH_CODE_LENGTH) {
      errorMessages.push(`Invalid companyAuthCode - must be ${MIN_COMPANY_AUTH_CODE_LENGTH} to ${MAX_COMPANY_AUTH_CODE_LENGTH} characters`);
    }
  }

  if (!periodStart || !isValidIsoDate(periodStart)) {
    errorMessages.push("Invalid or missing periodStart - must be YYYY-MM-DD");
  }
  if (!periodEnd || !isValidIsoDate(periodEnd)) {
    errorMessages.push("Invalid or missing periodEnd - must be YYYY-MM-DD");
  }

  const currentYear = extractAndValidateBalanceSheetYear(balanceSheet?.currentYear, "currentYear", errorMessages);
  const priorYear = extractAndValidateBalanceSheetYear(balanceSheet?.priorYear, "priorYear", errorMessages);

  validateBalanceSheetAddsUp(currentYear, "currentYear", errorMessages);
  validateBalanceSheetAddsUp(priorYear, "priorYear", errorMessages);

  const numericAverageEmployees = Number(averageEmployees);
  if (
    averageEmployees === undefined ||
    averageEmployees === null ||
    !Number.isFinite(numericAverageEmployees) ||
    numericAverageEmployees < 0
  ) {
    errorMessages.push("Invalid or missing averageEmployees - must be a non-negative number");
  }

  const directorName = typeof director?.name === "string" ? director.name.trim() : "";
  if (!directorName) {
    errorMessages.push("Missing director.name");
  }
  const dateApproved = director?.dateApproved;
  if (!dateApproved || !isValidIsoDate(dateApproved)) {
    errorMessages.push("Invalid or missing director.dateApproved - must be YYYY-MM-DD");
  }

  const statements = {
    section477Exemption: statementsAccepted?.section477Exemption === true,
    membersNotRequiredAudit: statementsAccepted?.membersNotRequiredAudit === true,
    directorsResponsibilities: statementsAccepted?.directorsResponsibilities === true,
    microEntityProvisions: statementsAccepted?.microEntityProvisions === true,
  };
  for (const [statementKey, accepted] of Object.entries(statements)) {
    if (!accepted) {
      errorMessages.push(`The user must accept the ${statementKey} statement`);
    }
  }

  return {
    companyNumber: normalisedCompanyNumber,
    companyName: trimmedCompanyName,
    ...(requireCompanyAuthCode ? { companyAuthCode: trimmedCompanyAuthCode } : {}),
    periodStart,
    periodEnd,
    // buildMicroEntityAccounts() names the two years current/prior, not currentYear/priorYear.
    balanceSheet: { current: currentYear, prior: priorYear },
    averageNumberOfEmployees: numericAverageEmployees,
    directorName,
    dateOfApproval: dateApproved,
    statementsAccepted: statements,
  };
}

function extractAndValidateBalanceSheetYear(yearValues, yearLabel, errorMessages) {
  const year = {};
  for (const field of BALANCE_SHEET_FIELDS) {
    const rawValue = yearValues?.[field];
    const numericValue = Number(rawValue);
    if (rawValue === undefined || rawValue === null || !Number.isFinite(numericValue)) {
      errorMessages.push(`Invalid or missing balanceSheet.${yearLabel}.${field}`);
    }
    year[field] = numericValue;
  }
  return year;
}

// The page derives and shows these totals; the Lambda re-derives them so a filing can never
// reach the gateway with a balance sheet that does not balance, regardless of what the client sent.
function validateBalanceSheetAddsUp(year, yearLabel, errorMessages) {
  if (BALANCE_SHEET_FIELDS.some((field) => !Number.isFinite(year[field]))) {
    return; // Already reported as missing/invalid above.
  }
  const netCurrentAssets = year.currentAssets - year.creditorsWithinOneYear;
  const totalAssetsLessCurrentLiabilities = year.fixedAssets + netCurrentAssets;
  const netAssets = totalAssetsLessCurrentLiabilities - year.creditorsAfterOneYear;
  if (netAssets !== year.capitalAndReserves) {
    errorMessages.push(`balanceSheet.${yearLabel}.capitalAndReserves does not equal net assets (${netAssets})`);
  }
}

async function recordSubmissionFailure({ failure, summary, userSub, detail = {} }) {
  await publishActivityFailureEvent({
    event: "companies-house-accounts-failed",
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
  validateEnv(["COMPANIES_HOUSE_XMLGW_URI", "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME"]);

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
  const accounts = extractAndValidateAccountsParameters(event, errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  const asyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  // Forwarded to the gateway call so the simulator's Gov-Test-Scenario handling can be driven
  // from the page's developer-mode field; the real gateway ignores headers it does not know.
  const govTestScenario = getHeader(event.headers, "Gov-Test-Scenario");

  let submissionNumber;
  try {
    const ixbrl = buildMicroEntityAccounts(accounts);
    submissionNumber = await allocateSubmissionNumber();
    const { presenterId, presenterCode } = await resolvePresenterCredentials();

    await putAsyncRequest(userSub, submissionNumber, "pending", null, asyncRequestsTableName);

    const submissionXml = buildAccountsSubmission({
      presenterId,
      presenterCode,
      companyNumber: accounts.companyNumber,
      companyName: accounts.companyName,
      companyAuthenticationCode: accounts.companyAuthCode,
      submissionNumber,
      dateSigned: accounts.dateOfApproval,
      ixbrl,
    });

    const gatewayResponse = await postToGateway(submissionXml, govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {});
    const parsed = parseGatewayResponse(gatewayResponse.data);

    if (parsed.errors?.length) {
      await putAsyncRequest(userSub, submissionNumber, "failed", parsed, asyncRequestsTableName);
      await recordSubmissionFailure({
        failure: "gateway-rejected-envelope",
        summary: "Companies House accounts submission rejected by the gateway",
        userSub,
        detail: { errors: parsed.errors },
      });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: "Companies House rejected the accounts submission envelope",
        error: { submissionNumber, errors: parsed.errors },
      });
    }

    await publishActivityEvent({
      event: "companies-house-accounts-submitted",
      summary: "Companies House micro-entity accounts submitted",
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
    logger.error({ message: "Unexpected error submitting Companies House accounts", error: error.message, stack: error.stack });
    if (submissionNumber) {
      await putAsyncRequest(userSub, submissionNumber, "failed", { message: error.message }, asyncRequestsTableName);
    }
    await recordSubmissionFailure({
      failure: "internal-error",
      summary: "Companies House accounts submission failed unexpectedly",
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
