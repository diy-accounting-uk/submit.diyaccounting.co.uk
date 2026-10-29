// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/hmrc/hmrcCtReturnPost.js
// Builds the Company Tax Return (CT600, computations and accounts), signs it with its IRmark and
// posts it to HMRC's Transaction Engine. The Government Gateway user ID and password the user
// types go into the message's IDAuthentication only, are never logged or stored, and are dropped
// once this call returns. HMRC answers with an acknowledgement; the GET Lambda polls for the result.

import { createLogger } from "../../lib/logger.js";
import { HttpTimeoutError } from "../../lib/httpFetch.js";
import {
  extractRequest,
  parseRequestBody,
  buildValidationError,
  http200OkResponse,
  http201CreatedResponse,
  http409ConflictResponse,
  http500ServerErrorResponse,
  http502BadGatewayResponse,
  getHeader,
} from "../../lib/httpResponseHelper.js";
import { validateEnv } from "../../lib/env.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { enforceBundles } from "../../services/bundleManagement.js";
import { http403ForbiddenFromBundleEnforcement } from "../../services/companiesHouseApi.js";
import { fillRegisteredOffice } from "../../services/registeredOfficeFill.js";
import { extractAndValidateCtReturnParameters, buildCtReturnDocuments, boxesThatDiffer } from "../../services/hmrcCtReturnRequest.js";
import {
  buildCt600SubmissionRequest,
  parseTransactionEngineResponse,
  postToTransactionEngine,
  getTransactionEngineSubmissionUrl,
  redactGatewayCredentials,
  CT600_CLASS,
  CT_RETURN_KIND,
} from "../../services/hmrcTransactionEngine.js";
import { putAsyncRequest } from "../../data/dynamoDbAsyncRequestRepository.js";
import { publishActivityEvent, publishActivityFailureEvent, resolveActorClass } from "../../lib/activityAlert.js";
import { initializeSalt } from "../../services/subHasher.js";
import { readJointFilingId, jointFilingFields, amendedFields, sanitiseFormRequest, formRequestFields } from "../../services/jointFiling.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcCtReturnPost.js" });

const PRODUCT_NAME = "DIY Accounting Submit";
const PRODUCT_VERSION = "1.0";
const DEFAULT_POLL_INTERVAL_SECONDS = 10;

// Server hook for Express app, and construction of a Lambda-like event from HTTP request)
/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/hmrc/ct/return", ingestHandler);
  registerLambdaRoute(app, "head", "/api/v1/hmrc/ct/return", ingestHandler);
}
/* v8 ignore stop */

async function recordSubmissionFailure({ failure, summary, userSub, detail = {} }) {
  await publishActivityFailureEvent({
    event: "hmrc-ct-return-failed",
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
  validateEnv(["COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME", "HMRC_CT_VENDOR_ID"]);

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
  const returnRequest = extractAndValidateCtReturnParameters(event, errorMessages);
  const requestBody = parseRequestBody(event);
  const jointFilingId = readJointFilingId(requestBody, errorMessages);
  const formRequest = sanitiseFormRequest(requestBody);
  if (errorMessages.length === 0) await fillRegisteredOffice(returnRequest.accounts, errorMessages);
  if (errorMessages.length > 0) {
    return buildValidationError(request, errorMessages, responseHeaders);
  }

  let documents;
  try {
    documents = buildCtReturnDocuments(returnRequest);
  } catch (error) {
    logger.warn({ message: "Company Tax Return documents could not be built", error: error.message });
    return buildValidationError(request, [error.message], responseHeaders);
  }

  const differingBoxes = boxesThatDiffer(returnRequest.reviewedBoxes, documents.boxes);
  if (differingBoxes.length > 0) {
    return http409ConflictResponse({
      request,
      headers: { ...responseHeaders },
      message: `The figures changed after you reviewed them (box ${differingBoxes.join(", box ")}). Review the return again before you file it.`,
      error: { differingBoxes },
    });
  }

  // Forwarded so the simulator's Gov-Test-Scenario handling can be driven from the page's
  // developer-mode field; HMRC's services ignore headers they do not know.
  const govTestScenario = getHeader(event.headers, "Gov-Test-Scenario");
  const gatewayTest = process.env.HMRC_CT_GATEWAY_TEST === "true";
  const asyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;

  try {
    const { xml, irmark, transactionId } = buildCt600SubmissionRequest({
      senderId: returnRequest.gatewayUserId,
      password: returnRequest.gatewayPassword,
      utr: returnRequest.utr,
      vendorId: process.env.HMRC_CT_VENDOR_ID,
      productName: PRODUCT_NAME,
      productVersion: PRODUCT_VERSION,
      irEnvelopeXml: documents.irEnvelopeXml,
      gatewayTest,
    });
    logger.info({
      message: "HMRC Transaction Engine CT600 submission request",
      transactionId,
      requestXml: redactGatewayCredentials(xml.replace(/<EncodedInlineXBRLDocument[^>]*>[^<]*<\/EncodedInlineXBRLDocument>/g, "")),
    });

    const submissionUrl = getTransactionEngineSubmissionUrl({ gatewayTest });
    const engineResponse = await postToTransactionEngine(
      submissionUrl,
      xml,
      govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {},
    );
    const parsed = parseTransactionEngineResponse(engineResponse.data);

    if (parsed.qualifier !== "acknowledgement" || !parsed.correlationId) {
      const errors = [...parsed.errors, ...parsed.businessErrors];
      await recordSubmissionFailure({
        failure: "transaction-engine-rejected-submission",
        summary: "HMRC Company Tax Return rejected by the Transaction Engine",
        userSub,
        detail: { errors },
      });
      return http502BadGatewayResponse({
        request,
        headers: { ...responseHeaders },
        message: "HMRC did not acknowledge the Company Tax Return",
        error: { transactionId, errors },
      });
    }

    const pollIntervalSeconds = parsed.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS;
    const pollUrl = new URL(parsed.responseEndPoint, submissionUrl).href;
    await putAsyncRequest(
      userSub,
      parsed.correlationId,
      "pending",
      {
        kind: CT_RETURN_KIND,
        pollUrl,
        pollIntervalSeconds,
        nextPollAt: new Date(Date.now() + pollIntervalSeconds * 1000).toISOString(),
        irmark: irmark.base32,
        utr: returnRequest.utr,
        gatewayTest,
        messageClass: CT600_CLASS,
        ...jointFilingFields(jointFilingId),
        ...amendedFields(returnRequest.amended),
        ...formRequestFields(formRequest),
        filed: {
          boxes: documents.boxes,
          computationsIxbrl: documents.computationsIxbrl,
          accountsIxbrl: documents.accountsIxbrl,
        },
      },
      asyncRequestsTableName,
    );

    await publishActivityEvent({
      event: "hmrc-ct-return-submitted",
      summary: "HMRC Company Tax Return submitted",
      userSub,
    });

    return http201CreatedResponse({
      request,
      headers: { ...responseHeaders },
      data: { correlationId: parsed.correlationId, transactionId, irmark: irmark.base32, pollIntervalSeconds },
    });
  } catch (error) {
    // The submission carries the typed Gateway password, so nothing read from the error is
    // logged: an error's message, stack or fields can quote the document that failed.
    logger.error({
      message: "Unexpected error submitting the Company Tax Return",
      timedOut: error instanceof HttpTimeoutError,
    });
    await recordSubmissionFailure({
      failure: "internal-error",
      summary: "HMRC Company Tax Return submission failed unexpectedly",
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
