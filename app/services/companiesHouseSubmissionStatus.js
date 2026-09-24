// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseSubmissionStatus.js
// Polls the Companies House XML Gateway for the outcome of a submitted form and records it. The
// gateway itself is the source of truth for status, so every call polls it directly rather than
// trusting a cached "already accepted" record; shared by every poll Lambda (accounts, confirmation
// statement, ...) since GetSubmissionStatus and the receipt/async-request bookkeeping around it are
// identical for every form.

import { createLogger } from "../lib/logger.js";
import {
  buildStatusRequest,
  resolvePresenterCredentials,
  postToGateway,
  parseGatewayResponse,
  redactPresenterCredentials,
} from "./companiesHouseXmlGateway.js";
import { putAsyncRequest, getAsyncRequest } from "../data/dynamoDbAsyncRequestRepository.js";
import { putReceipt } from "../data/dynamoDbReceiptRepository.js";
import { publishActivityEvent, resolveActorClass } from "../lib/activityAlert.js";

const logger = createLogger({ source: "app/services/companiesHouseSubmissionStatus.js" });

/**
 * Poll the Companies House XML Gateway for one submission's status and record the outcome: a
 * cached completed/failed async request short-circuits the gateway call; REJECT stores "failed";
 * ACCEPT writes a receipt, stores "completed" and publishes acceptedEvent; PENDING/PARKED leave
 * the request state as-is so the caller can keep polling.
 *
 * @param {object} input
 * @param {string} input.userSub
 * @param {string} input.submissionNumber
 * @param {string} [input.govTestScenario] - forwarded to the gateway call as Gov-Test-Scenario
 * @param {string} input.kind - e.g. "accounts" or "confirmation-statement"; carried into the
 *   async request record only, so it can be told apart from another form in flight for this user
 * @param {string} input.acceptedEvent - the activityAlert event name published on ACCEPT
 * @param {string} input.acceptedSummary - its summary text
 * @returns {Promise<{data: object}|{errors: Array, submissionNumber: string}>}
 */
export async function pollSubmission({ userSub, submissionNumber, govTestScenario, kind, acceptedEvent, acceptedSummary }) {
  const asyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  const persistedRequest = await getAsyncRequest(userSub, submissionNumber, asyncRequestsTableName);

  if (persistedRequest?.status === "completed" || persistedRequest?.status === "failed") {
    return { data: persistedRequest.data };
  }

  const { presenterId, presenterCode } = await resolvePresenterCredentials();
  // A poll of a test-service submission needs the same GatewayTest flag the submission itself
  // carried; the live service wants it absent, the same split the submit Lambdas make.
  const gatewayTest = process.env.COMPANIES_HOUSE_GATEWAY_TEST === "true";
  const statusRequestXml = buildStatusRequest({ presenterId, presenterCode, submissionNumber, gatewayTest });
  logger.info({
    message: "Companies House GetSubmissionStatus request",
    submissionNumber,
    requestXml: redactPresenterCredentials(statusRequestXml),
  });
  const gatewayResponse = await postToGateway(statusRequestXml, govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {});
  logger.info({
    message: "Companies House GetSubmissionStatus response",
    submissionNumber,
    status: gatewayResponse.status,
    responseXml: redactPresenterCredentials(gatewayResponse.data),
  });
  const parsed = parseGatewayResponse(gatewayResponse.data);

  if (parsed.errors?.length) {
    logger.error({ message: "Companies House gateway returned errors while polling", submissionNumber, errors: parsed.errors });
    return { errors: parsed.errors, submissionNumber };
  }

  // parseGatewayResponse() carries every Status element it found; a GetSubmissionStatus poll for
  // one submission number always answers with exactly one.
  const status = parsed.statuses[0];

  if (status.statusCode === "REJECT") {
    await putAsyncRequest(userSub, submissionNumber, "failed", { ...status, kind }, asyncRequestsTableName);
    return { data: status };
  }

  if (status.statusCode === "ACCEPT") {
    const receiptId = `${new Date().toISOString()}-${submissionNumber}`;
    await putReceipt(userSub, receiptId, status, resolveActorClass());
    const data = { ...status, receiptId };
    await putAsyncRequest(userSub, submissionNumber, "completed", { ...data, kind }, asyncRequestsTableName);
    await publishActivityEvent({ event: acceptedEvent, summary: acceptedSummary, userSub });
    return { data };
  }

  // PENDING or PARKED: leave the request state as-is and hand the current snapshot back so the
  // caller can keep polling.
  return { data: status };
}
