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
  http403ForbiddenResponse,
  http500ServerErrorResponse,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { isValidCompanyNumber, http403ForbiddenFromBundleEnforcement } from "../../services/companiesHouseApi.js";
import { isValidIsoDate } from "../../lib/hmrcValidation.js";
import {
  buildMicroEntityAccounts,
  DORMANT_TRADING_STATUSES,
  SHARE_CLASSES,
  sharesIssuedFor,
} from "../../services/microEntityAccountsIxbrl.js";
import { buildSmallCompanyAccounts } from "../../services/smallCompanyAccountsIxbrl.js";
import { extractAndValidateSmallCompany } from "../../services/smallCompanyAccountsRequest.js";
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
import { isClientAuthorisedForService } from "../../lib/hmrcAgentAuthorisation.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseAccountsPost.js" });

// The Agent Authorisation API only names HMRC services (MTD-VAT, MTD-IT); Companies House has no
// equivalent delegated-authority flow yet, so this key is reserved for when one exists. Until a
// route sets it, no client-scoped filing can pass the check below - the safe default for an
// authorisation this service has never granted.
const AGENT_AUTHORISATION_SERVICE = "CH-ACCOUNTS";

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

// The iXBRL document for a validated request: the regime the request named picks the builder.
export function buildAccountsIxbrl(accounts) {
  return accounts.regime === "small-company" ? buildSmallCompanyAccounts(accounts) : buildMicroEntityAccounts(accounts);
}

// Extracts and validates the accounts filing request. Shared with the preview Lambda, which
// never needs the company authentication code because it never reaches the gateway.
export function extractAndValidateAccountsParameters(event, errorMessages, { requireCompanyAuthCode = true, clientId } = {}) {
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
    dormant,
    dormantTradingStatus,
    shareClass,
    nominalValue,
    smallCompany,
  } = parsedBody;

  // A client-scoped request resolves its company number from the client row instead, so the
  // body's own companyNumber is neither required nor validated here.
  let normalisedCompanyNumber;
  if (!clientId) {
    const { valid: companyNumberValid, normalised } = isValidCompanyNumber(companyNumber);
    if (!companyNumberValid) {
      errorMessages.push("Invalid company number - must be 8 characters");
    }
    normalisedCompanyNumber = normalised;
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

  const isSmallCompany = smallCompany !== undefined && smallCompany !== null;
  if (isSmallCompany && dormant === true) {
    errorMessages.push("A dormant company files micro-entity accounts: dormant cannot be combined with smallCompany");
  }

  let currentYear;
  let priorYear;
  if (!isSmallCompany) {
    currentYear = extractAndValidateBalanceSheetYear(balanceSheet?.currentYear, "currentYear", errorMessages);
    priorYear = extractAndValidateBalanceSheetYear(balanceSheet?.priorYear, "priorYear", errorMessages);

    validateBalanceSheetAddsUp(currentYear, "currentYear", errorMessages);
    validateBalanceSheetAddsUp(priorYear, "priorYear", errorMessages);
  }

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

  if (isSmallCompany) {
    const small = extractAndValidateSmallCompany(smallCompany, statementsAccepted, errorMessages);
    return {
      regime: "small-company",
      companyNumber: normalisedCompanyNumber,
      companyName: trimmedCompanyName,
      ...(requireCompanyAuthCode ? { companyAuthCode: trimmedCompanyAuthCode } : {}),
      periodStart,
      periodEnd,
      averageNumberOfEmployees: numericAverageEmployees,
      directorName,
      dateOfApproval: dateApproved,
      ...small,
    };
  }

  const isDormant = dormant === true;
  const numericNominalValue = Number(nominalValue);
  if (isDormant) {
    validateDormantFiling({ currentYear, priorYear, dormantTradingStatus, shareClass, numericNominalValue, errorMessages });
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
    regime: "micro-entity",
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
    ...(isDormant ? { dormant: true, dormantTradingStatus, shareClass, nominalValue: numericNominalValue } : {}),
  };
}

// A dormant company had no significant accounting transaction in the period, so its profit and
// loss reserve and its capital and reserves end the period where they began.
function validateDormantFiling({ currentYear, priorYear, dormantTradingStatus, shareClass, numericNominalValue, errorMessages }) {
  if (!DORMANT_TRADING_STATUSES.includes(dormantTradingStatus)) {
    errorMessages.push(`Invalid or missing dormantTradingStatus - must be one of ${DORMANT_TRADING_STATUSES.join(", ")}`);
  }
  if (!SHARE_CLASSES.includes(shareClass)) {
    errorMessages.push(`Invalid or missing shareClass - must be one of ${SHARE_CLASSES.join(", ")}`);
  }
  if (!Number.isFinite(numericNominalValue) || numericNominalValue <= 0) {
    errorMessages.push("Invalid or missing nominalValue - must be a number above zero");
  } else if (
    Number.isFinite(currentYear.calledUpShareCapital) &&
    sharesIssuedFor(currentYear.calledUpShareCapital, numericNominalValue) === null
  ) {
    errorMessages.push("balanceSheet.currentYear.calledUpShareCapital is not a whole number of shares at the nominal value");
  }
  if (
    Number.isFinite(currentYear.profitAndLossAccount) &&
    Number.isFinite(priorYear.profitAndLossAccount) &&
    currentYear.profitAndLossAccount !== priorYear.profitAndLossAccount
  ) {
    errorMessages.push("A dormant company cannot report a profit or loss: profitAndLossAccount must equal the prior year");
  }
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

async function recordSubmissionFailure({ failure, summary, userSub, detail = {}, clientId }) {
  await publishActivityFailureEvent({
    event: "companies-house-accounts-failed",
    summary,
    failure,
    userSub,
    actor: resolveActorClass(),
    clientId,
    detail,
  });
}

// HTTP request/response, aware Lambda ingestHandler function
export async function ingestHandler(event) {
  await initializeSalt();
  validateEnv(["COMPANIES_HOUSE_XMLGW_URI", "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME", "COMPANIES_HOUSE_PACKAGE_REFERENCE"]);

  const { request } = extractRequest(event);
  const responseHeaders = { "Content-Type": "application/json" };

  // A practice acting for a client names the client instead of a company number; read early
  // so it can be passed into bundle enforcement's own practice check.
  const clientId = parseRequestBody(event)?.clientId || undefined;

  let userSub;
  let client = null;
  try {
    ({ userSub, client } = await enforceBundles(event, { clientId }));
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

  if (clientId && !isClientAuthorisedForService(client, AGENT_AUTHORISATION_SERVICE)) {
    logger.warn({ message: "Client-scoped request refused: not authorised for Companies House filing", clientId });
    await recordSubmissionFailure({
      failure: "client-not-authorised",
      summary: "Companies House accounts blocked: client not authorised",
      userSub,
      clientId,
    });
    return http403ForbiddenResponse({
      request,
      headers: responseHeaders,
      message: "Client is not authorised for Companies House filing",
      error: { code: "client-not-authorised" },
    });
  }

  const errorMessages = [];
  const accounts = extractAndValidateAccountsParameters(event, errorMessages, { clientId });

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  // A client-scoped request resolves its company number from the client row, never from the
  // body: buildMicroEntityAccounts and buildAccountsSubmission below both read it off `accounts`.
  if (clientId) {
    accounts.companyNumber = client.identifiers?.companyNumber;
  }

  const asyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  // Forwarded to the gateway call so the simulator's Gov-Test-Scenario handling can be driven
  // from the page's developer-mode field; the real gateway ignores headers it does not know.
  const govTestScenario = getHeader(event.headers, "Gov-Test-Scenario");
  // The test and live gateways expect the opposite of each other on both: the test service wants
  // GatewayTest set and a package reference it has issued, the live service wants neither. Both
  // come from the deployment's own environment, never hardcoded here.
  const gatewayTest = process.env.COMPANIES_HOUSE_GATEWAY_TEST === "true";
  const packageReference = process.env.COMPANIES_HOUSE_PACKAGE_REFERENCE;

  let submissionNumber;
  try {
    const ixbrl = buildAccountsIxbrl(accounts);
    submissionNumber = await allocateSubmissionNumber();
    const { presenterId, presenterCode } = await resolvePresenterCredentials();

    await putAsyncRequest(userSub, submissionNumber, "pending", null, asyncRequestsTableName);

    const submissionXml = buildAccountsSubmission({
      presenterId,
      presenterCode,
      companyNumber: accounts.companyNumber,
      companyName: accounts.companyName,
      companyAuthenticationCode: accounts.companyAuthCode,
      packageReference,
      submissionNumber,
      dateSigned: accounts.dateOfApproval,
      ixbrl,
      gatewayTest,
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
        clientId,
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
      clientId,
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
      clientId,
    });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Internal server error",
      error: { detail: error.message },
    });
  }
}
