// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/companies-house/companiesHouseConfirmationStatementPost.js
// Builds the ConfirmationAndVerificationStatement body, wraps it in a GovTalk envelope and submits
// it to the Companies House XML Gateway. The company authentication code and every director's
// personal code the user types go into the envelope only, are never logged, and are dropped once
// this call returns - the same rule companiesHouseAccountsPost.js already follows for its own
// authentication code.

import { createLogger } from "../../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http200OkResponse,
  http201CreatedResponse,
  http402PaymentRequiredResponse,
  http500ServerErrorResponse,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { isValidCompanyNumber, http403ForbiddenFromBundleEnforcement } from "../../services/companiesHouseApi.js";
import { isValidIsoDate } from "../../lib/hmrcValidation.js";
import {
  buildConfirmationStatementBody,
  selectConfirmationStatementSchema,
} from "../../services/companiesHouseConfirmationStatementXml.js";
import {
  buildConfirmationStatementSubmission,
  buildPaymentPeriodsRequest,
  parsePaymentPeriodsResponse,
  allocateSubmissionNumber,
  resolvePresenterCredentials,
  postToGateway,
  parseGatewayResponse,
} from "../../services/companiesHouseXmlGateway.js";
import { putAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import { publishActivityEvent, publishActivityFailureEvent, resolveActorClass } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";
import { hasPaidCharge, markChargeUsed } from "../../services/activityCharges.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseConfirmationStatementPost.js" });

const MIN_COMPANY_AUTH_CODE_LENGTH = 6;
const MAX_COMPANY_AUTH_CODE_LENGTH = 8;
const PERSONAL_CODE_LENGTH = 11;
const MAX_SIC_CODES = 4;
const MAX_OFFICERS = 50;

// Matches the activity id file-confirmation-statement carries in submit.catalogue.toml, and the
// subjectKey the fileConfirmationStatement.html journey sends billingActivityCheckoutPost.js when
// it opens the per-filing Stripe Checkout Session.
const CONFIRMATION_STATEMENT_ACTIVITY_ID = "file-confirmation-statement";

function buildConfirmationStatementChargeSubjectKey(companyNumber, reviewDate) {
  return `${companyNumber}:${reviewDate}`;
}

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/companies-house/confirmation-statement", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/companies-house/confirmation-statement", ingestHandler);
}
/* v8 ignore stop */

function validateOfficers(officers, errorMessages) {
  if (officers !== undefined && (!Array.isArray(officers) || officers.length > MAX_OFFICERS)) {
    errorMessages.push(`Invalid officers - must be an array of at most ${MAX_OFFICERS} entries`);
    return;
  }
  for (const officer of officers || []) {
    if (!officer || typeof officer !== "object" || Array.isArray(officer)) {
      errorMessages.push("Every officer entry must be an object");
    }
  }
}

function validateDirectors(directors, errorMessages) {
  if (!Array.isArray(directors) || directors.length === 0) {
    errorMessages.push("At least one director's verification statement is required");
  }
  for (const director of directors || []) {
    const personalCode = typeof director?.personalCode === "string" ? director.personalCode.trim() : "";
    if (personalCode.length !== PERSONAL_CODE_LENGTH) {
      errorMessages.push(`Invalid director personalCode - must be ${PERSONAL_CODE_LENGTH} characters`);
    }
    if (!director?.forename || !director?.surname) {
      errorMessages.push("Every director requires a forename and surname");
    }
    if (!director?.dob || !isValidIsoDate(director.dob)) {
      errorMessages.push("Every director requires a valid date of birth (YYYY-MM-DD)");
    }
  }
}

// Extracts and validates a confirmation statement request. Shared with the preview Lambda, which
// never needs the company authentication code because it never reaches the gateway.
export function extractAndValidateConfirmationStatementParameters(event, errorMessages, { requireCompanyAuthCode = true } = {}) {
  const parsedBody = parseRequestBody(event) || {};
  const {
    companyNumber,
    companyName,
    companyAuthCode,
    dateSigned,
    reviewDate,
    sicCodes,
    statementOfCapital,
    shareholdings,
    registeredEmailAddress,
    lawfulPurposeStatementAccepted,
    directors,
    officers,
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

  if (!dateSigned || !isValidIsoDate(dateSigned)) {
    errorMessages.push("Invalid or missing dateSigned - must be YYYY-MM-DD");
  }

  const today = new Date().toISOString().slice(0, 10);
  if (!reviewDate || !isValidIsoDate(reviewDate)) {
    errorMessages.push("Invalid or missing reviewDate - must be YYYY-MM-DD");
  } else if (reviewDate > today) {
    errorMessages.push("reviewDate must not be in the future");
  }

  if (sicCodes !== undefined && (!Array.isArray(sicCodes) || sicCodes.length > MAX_SIC_CODES)) {
    errorMessages.push(`Invalid sicCodes - at most ${MAX_SIC_CODES} are allowed`);
  }

  for (const holding of shareholdings || []) {
    if (!holding?.shareClass) {
      errorMessages.push("Every shareholding must carry a shareClass");
    }
  }

  if (!lawfulPurposeStatementAccepted) {
    errorMessages.push("The user must accept the lawful purpose statement");
  }

  validateOfficers(officers, errorMessages);

  // Directors carry a verification statement only for ConfirmationAndVerificationStatement-v1-0 -
  // once every officer is verified the statement uses ConfirmationStatement-v1-3, which carries no
  // verification block, so no director row is required.
  const requiresVerificationStatement = selectConfirmationStatementSchema(officers).rootElement === "ConfirmationAndVerificationStatement";
  if (requiresVerificationStatement) {
    validateDirectors(directors, errorMessages);
  }

  return {
    companyNumber: normalisedCompanyNumber,
    companyName: trimmedCompanyName,
    ...(requireCompanyAuthCode ? { companyAuthCode: trimmedCompanyAuthCode } : {}),
    dateSigned,
    reviewDate,
    sicCodes,
    statementOfCapital,
    shareholdings,
    registeredEmailAddress,
    directors,
    officers,
  };
}

async function recordSubmissionFailure({ failure, summary, userSub, detail = {} }) {
  await publishActivityFailureEvent({
    event: "companies-house-confirmation-statement-failed",
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
  const statement = extractAndValidateConfirmationStatementParameters(event, errorMessages);

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
    const gatewayHeaders = govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {};
    const subjectKey = buildConfirmationStatementChargeSubjectKey(statement.companyNumber, statement.reviewDate);

    // COMPANIES_HOUSE_CS_FEE_MODE=operator skips the charge gate entirely: the operator's own
    // company's fee lands on DIY Accounting's own Companies House credit account, not on Stripe.
    let shouldMarkChargeUsed = false;
    if (process.env.COMPANIES_HOUSE_CS_FEE_MODE !== "operator") {
      const paymentPeriodsXml = buildPaymentPeriodsRequest({
        presenterId,
        presenterCode,
        companyNumber: statement.companyNumber,
        companyAuthenticationCode: statement.companyAuthCode,
        gatewayTest,
      });
      // Never carries the caller's own Gov-Test-Scenario: that header drives the outcome of the
      // submission this fee check gates, and this is our own gate, not part of what a developer
      // is testing when they set it.
      const paymentPeriodsGatewayResponse = await postToGateway(paymentPeriodsXml, {});
      const paymentPeriodsParsed = parseGatewayResponse(paymentPeriodsGatewayResponse.data);

      if (paymentPeriodsParsed.errors?.length) {
        logger.warn({
          message: "Companies House rejected the PaymentPeriodsRequest",
          companyNumber: statement.companyNumber,
          errors: paymentPeriodsParsed.errors,
        });
        return http500ServerErrorResponse({
          request,
          headers: { ...responseHeaders },
          message: "Companies House rejected the payment periods request",
          error: { errors: paymentPeriodsParsed.errors },
        });
      }

      const paymentPeriods = parsePaymentPeriodsResponse(paymentPeriodsGatewayResponse.data);
      const paymentPeriodPaid = paymentPeriods?.periods?.[0]?.periodPaid ?? false;

      if (!paymentPeriodPaid) {
        if (!(await hasPaidCharge(userSub, CONFIRMATION_STATEMENT_ACTIVITY_ID, subjectKey))) {
          return http402PaymentRequiredResponse({
            request,
            headers: { ...responseHeaders },
            message: "This confirmation statement's payment period carries a fee - pay before submitting",
            error: { code: "fee-due" },
          });
        }
        shouldMarkChargeUsed = true;
      }
    }

    const statementXml = buildConfirmationStatementBody({
      reviewDate: statement.reviewDate,
      sicCodes: statement.sicCodes,
      statementOfCapital: statement.statementOfCapital,
      shareholdings: statement.shareholdings,
      registeredEmailAddress: statement.registeredEmailAddress,
      directors: statement.directors,
      officers: statement.officers,
    });
    // The envelope's FormIdentifier must name the same schema the body was built against, or the
    // gateway rejects the submission with error 604.
    const { rootElement: formIdentifier } = selectConfirmationStatementSchema(statement.officers);

    submissionNumber = await allocateSubmissionNumber();

    await putAsyncRequest(userSub, submissionNumber, "pending", null, asyncRequestsTableName);

    const submissionXml = buildConfirmationStatementSubmission({
      presenterId,
      presenterCode,
      companyNumber: statement.companyNumber,
      companyName: statement.companyName,
      companyAuthenticationCode: statement.companyAuthCode,
      packageReference,
      formIdentifier,
      submissionNumber,
      dateSigned: statement.dateSigned,
      statementXml,
      gatewayTest,
    });

    const gatewayResponse = await postToGateway(submissionXml, gatewayHeaders);
    const parsed = parseGatewayResponse(gatewayResponse.data);

    if (parsed.errors?.length) {
      await putAsyncRequest(userSub, submissionNumber, "failed", parsed, asyncRequestsTableName);
      await recordSubmissionFailure({
        failure: "gateway-rejected-envelope",
        summary: "Companies House confirmation statement rejected by the gateway",
        userSub,
        detail: { errors: parsed.errors },
      });
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: "Companies House rejected the confirmation statement submission envelope",
        error: { submissionNumber, errors: parsed.errors },
      });
    }

    if (shouldMarkChargeUsed) {
      await markChargeUsed(userSub, CONFIRMATION_STATEMENT_ACTIVITY_ID, subjectKey);
    }

    await publishActivityEvent({
      event: "companies-house-confirmation-statement-submitted",
      summary: "Companies House confirmation statement submitted",
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
      message: "Unexpected error submitting Companies House confirmation statement",
      error: error.message,
      stack: error.stack,
    });
    if (submissionNumber) {
      await putAsyncRequest(userSub, submissionNumber, "failed", { message: error.message }, asyncRequestsTableName);
    }
    await recordSubmissionFailure({
      failure: "internal-error",
      summary: "Companies House confirmation statement submission failed unexpectedly",
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
