// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseFormFiling.js
// The filing route every Companies House form in companiesHouseForms.js shares: the bundle check,
// the request check (the company and its authentication code here, the form's own fields in its
// row), the refusal of a form with a fee this site cannot take, the form body from the row's builder
// with any document the row attaches, a submission number, the filing state, the GovTalk envelope,
// the send to the gateway, and a JSON answer for every outcome. The company
// authentication code goes into the envelope only, is never logged, and is dropped once the call
// returns.

import { createLogger } from "../lib/logger.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http200OkResponse,
  http201CreatedResponse,
  http400BadRequestResponse,
  http402PaymentRequiredResponse,
  http500ServerErrorResponse,
  getHeader,
} from "../lib/httpResponseHelper.js";
import {
  hasInvalidCompanyAuthenticationCodeError,
  INVALID_COMPANY_AUTHENTICATION_CODE_MESSAGE,
  INVALID_COMPANY_AUTHENTICATION_CODE_REASON,
} from "../lib/companiesHouseGatewayErrors.js";
import { validateEnv } from "../lib/env.js";
import { isValidIsoDate } from "../lib/hmrcValidation.js";
import { enforceBundles } from "./bundleManagement.js";
import { isValidCompanyNumber, http403ForbiddenFromBundleEnforcement } from "./companiesHouseApi.js";
import {
  buildFormSubmission,
  allocateSubmissionNumber,
  resolvePresenterCredentials,
  postToGateway,
  gatewayRequestNotDelivered,
  parseGatewayResponse,
} from "./companiesHouseXmlGateway.js";
import { putAsyncRequest } from "../data/dynamoDbAsyncRequestRepository.js";
import { recordSubmissionInProgress, recordOutcomeUnknown } from "./companiesHouseSubmissionInProgress.js";
import { publishActivityEvent, publishActivityFailureEvent, resolveActorClass } from "../lib/activityAlert.js";
import { initializeSalt } from "./subHasher.js";
import { readOwnPresenterFromBody } from "./companiesHouseOwnPresenter.js";
import { COMPANIES_HOUSE_FORMS } from "../../web/public/lib/companies-house-forms.js";
import { GATEWAY_FORM_BUILDERS } from "./companiesHouseForms.js";

const logger = createLogger({ source: "app/services/companiesHouseFormFiling.js" });

const MIN_COMPANY_AUTH_CODE_LENGTH = 6;
const MAX_COMPANY_AUTH_CODE_LENGTH = 8;

/**
 * The fields every form's request carries: the company, its authentication code and the date the
 * filing is signed. Each failed check adds its message.
 * @param {object} body - the parsed request body
 * @param {string[]} errorMessages
 */
export function extractCompanyFields(body, errorMessages) {
  const { companyNumber, companyName, companyAuthCode, dateSigned } = body;
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
  return { companyNumber: normalisedCompanyNumber, companyName: trimmedCompanyName, companyAuthCode: trimmedCompanyAuthCode, dateSigned };
}

/**
 * The company fields and the form's own fields of a request for one form kind, with every failed
 * check's message.
 * @param {object} event - the Lambda event
 * @param {string} kind - a kind of GATEWAY_FORM_BUILDERS
 * @param {string[]} errorMessages
 */
export function extractFormRequest(event, kind, errorMessages) {
  const body = parseRequestBody(event) || {};
  return { ...extractCompanyFields(body, errorMessages), ...GATEWAY_FORM_BUILDERS[kind].extractAndValidate(body, errorMessages) };
}

async function recordSubmissionFailure({ kind, failure, summary, userSub, detail = {} }) {
  await publishActivityFailureEvent({
    event: `companies-house-${kind}-failed`,
    summary,
    failure,
    userSub,
    actor: resolveActorClass(),
    detail,
  });
}

/**
 * File one form through the XML gateway and answer the request.
 * @param {object} event - the Lambda event
 * @param {string} kind - a kind of GATEWAY_FORM_BUILDERS and of COMPANIES_HOUSE_FORMS
 */
export async function fileCompaniesHouseForm(event, kind) {
  const { label, formIdentifier, fee } = COMPANIES_HOUSE_FORMS[kind];
  const { buildFormXml, buildDocument } = GATEWAY_FORM_BUILDERS[kind];
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
    return http200OkResponse({ request, headers: { ...responseHeaders }, data: {} });
  }

  const errorMessages = [];
  const form = extractFormRequest(event, kind, errorMessages);
  // Held in this call only: it goes to the envelope builder and nowhere else.
  const ownPresenter = readOwnPresenterFromBody(parseRequestBody(event), errorMessages);

  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  const asyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  const gatewayTest = process.env.COMPANIES_HOUSE_GATEWAY_TEST === "true";
  // Companies House charges a form's fee to the credit account behind the presenter. This site has
  // no way yet to take that fee from the filer, so a form with a fee is sent only where the fee is
  // not ours to recover: under the filer's own presenter, or as a test submission, which registers
  // nothing.
  if (fee && !ownPresenter && !gatewayTest) {
    return http402PaymentRequiredResponse({
      request,
      headers: { ...responseHeaders },
      message: `Companies House charges a fee for a ${label}, and this site cannot take that fee yet, so it has not filed it`,
      error: { code: "fee-path-not-wired", fee },
    });
  }
  const packageReference = process.env.COMPANIES_HOUSE_PACKAGE_REFERENCE;
  // Forwarded to the gateway call so the simulator's Gov-Test-Scenario handling can be driven
  // from the page's developer-mode field; the real gateway ignores headers it does not know.
  const govTestScenario = getHeader(event.headers, "Gov-Test-Scenario");

  let submissionNumber;
  let envelopeSent = false;
  try {
    const { presenterId, presenterCode } = ownPresenter ?? (await resolvePresenterCredentials());
    const formXml = buildFormXml(form);

    submissionNumber = await allocateSubmissionNumber();
    await recordSubmissionInProgress({ userSub, submissionNumber, kind, underOwnPresenter: Boolean(ownPresenter) });

    const submissionXml = buildFormSubmission({
      presenterId,
      presenterCode,
      companyNumber: form.companyNumber,
      companyName: form.companyName,
      companyAuthenticationCode: form.companyAuthCode,
      packageReference,
      formIdentifier,
      submissionNumber,
      dateSigned: form.dateSigned,
      formXml,
      document: buildDocument ? buildDocument(form) : undefined,
      gatewayTest,
    });

    const gatewayHeaders = govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {};
    envelopeSent = true;
    const gatewayResponse = await postToGateway(submissionXml, gatewayHeaders);
    const parsed = parseGatewayResponse(gatewayResponse.data);

    if (parsed.errors?.length) {
      await putAsyncRequest(userSub, submissionNumber, "failed", parsed, asyncRequestsTableName);
      await recordSubmissionFailure({
        kind,
        failure: "gateway-rejected-envelope",
        summary: `Companies House ${label} rejected by the gateway`,
        userSub,
        detail: { errors: parsed.errors },
      });
      if (hasInvalidCompanyAuthenticationCodeError(parsed.errors)) {
        return http400BadRequestResponse({
          request,
          headers: { ...responseHeaders },
          message: INVALID_COMPANY_AUTHENTICATION_CODE_MESSAGE,
          error: { reason: INVALID_COMPANY_AUTHENTICATION_CODE_REASON, submissionNumber, errors: parsed.errors },
        });
      }
      return http500ServerErrorResponse({
        request,
        headers: { ...responseHeaders },
        message: `Companies House rejected the ${label} submission envelope`,
        error: { submissionNumber, errors: parsed.errors },
      });
    }

    await publishActivityEvent({
      event: `companies-house-${kind}-submitted`,
      summary: `Companies House ${label} submitted`,
      userSub,
    });

    return http201CreatedResponse({
      request,
      headers: { ...responseHeaders },
      data: { submissionNumber, gatewayTimestamp: parsed.gatewayTimestamp, pollInterval: parsed.pollInterval },
    });
  } catch (error) {
    logger.error({ message: `Unexpected error submitting Companies House ${label}`, error: error.message, stack: error.stack });
    if (envelopeSent && !gatewayRequestNotDelivered(error)) {
      // The envelope left, so Companies House may have it. The filing stays pending, the page
      // polls it by number, and a late ACCEPT still gets its receipt and email.
      await recordOutcomeUnknown({ userSub, submissionNumber, kind, data: {} });
      await recordSubmissionFailure({
        kind,
        failure: "gateway-outcome-unknown",
        summary: `Companies House ${label} sent with no answer from the gateway; kept pending`,
        userSub,
        detail: { submissionNumber, error: error.message },
      });
      return http201CreatedResponse({ request, headers: { ...responseHeaders }, data: { submissionNumber } });
    }
    if (submissionNumber) {
      await putAsyncRequest(userSub, submissionNumber, "failed", { message: error.message }, asyncRequestsTableName);
    }
    await recordSubmissionFailure({
      kind,
      failure: "internal-error",
      summary: `Companies House ${label} submission failed unexpectedly`,
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
