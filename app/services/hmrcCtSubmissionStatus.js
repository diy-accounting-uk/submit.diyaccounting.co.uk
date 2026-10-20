// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/hmrcCtSubmissionStatus.js
// Polls HMRC's Transaction Engine for the outcome of a submitted Company Tax Return and records
// it. The async request holds the poll end point and the earliest time the next poll may go out,
// so a call that arrives inside the poll interval answers from the record and sends nothing. The
// final response writes the receipt, then a DELETE_REQUEST tells the Transaction Engine to drop
// its copy.

import { createLogger } from "../lib/logger.js";
import {
  buildPollRequest,
  buildDeleteRequest,
  parseTransactionEngineResponse,
  postToTransactionEngine,
  CT_RETURN_KIND,
} from "./hmrcTransactionEngine.js";
import { putAsyncRequest, getAsyncRequest } from "../data/dynamoDbAsyncRequestRepository.js";
import { putReceipt } from "../data/dynamoDbReceiptRepository.js";
import { publishActivityEvent, resolveActorClass } from "../lib/activityAlert.js";

const logger = createLogger({ source: "app/services/hmrcCtSubmissionStatus.js" });

const DEFAULT_POLL_INTERVAL_SECONDS = 10;

function secondsUntil(isoTime, now) {
  return Math.max(Math.ceil((Date.parse(isoTime) - now) / 1000), 0);
}

async function deleteFromTransactionEngine({ pollUrl, correlationId, gatewayTest, messageClass, extraHeaders }) {
  try {
    await postToTransactionEngine(pollUrl, buildDeleteRequest({ correlationId, gatewayTest, messageClass }), extraHeaders);
  } catch (error) {
    // The return is already decided; an undeleted response expires at HMRC.
    logger.warn({ message: "Transaction Engine delete request failed", correlationId, error: error.message });
  }
}

/**
 * Poll one Company Tax Return submission and record the outcome.
 *
 * @param {object} input
 * @param {string} input.userSub
 * @param {string} input.correlationId - the Transaction Engine CorrelationID, the async request id
 * @param {string} [input.govTestScenario] - forwarded to the Transaction Engine as Gov-Test-Scenario
 * @returns {Promise<{data: object}|{errors: object[], correlationId: string}|{notFound: true, correlationId: string}>}
 */
export async function pollCtSubmission({ userSub, correlationId, govTestScenario }) {
  const asyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  const persistedRequest = await getAsyncRequest(userSub, correlationId, asyncRequestsTableName);

  if (!persistedRequest || persistedRequest.data?.kind !== CT_RETURN_KIND) {
    logger.warn({ message: "Company Tax Return status poll for a submission this user did not make", correlationId });
    return { notFound: true, correlationId };
  }
  if (persistedRequest.status === "completed" || persistedRequest.status === "failed") {
    return { data: persistedRequest.data };
  }

  const pending = persistedRequest.data;
  const now = Date.now();
  if (pending.nextPollAt && Date.parse(pending.nextPollAt) > now) {
    return {
      data: { statusCode: "PENDING", correlationId, irmark: pending.irmark, pollIntervalSeconds: secondsUntil(pending.nextPollAt, now) },
    };
  }

  const extraHeaders = govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {};
  const { pollUrl, gatewayTest, messageClass } = pending;
  const response = await postToTransactionEngine(pollUrl, buildPollRequest({ correlationId, gatewayTest, messageClass }), extraHeaders);
  const parsed = parseTransactionEngineResponse(response.data);

  if (parsed.qualifier === "error" || parsed.errors.length > 0) {
    const failure = {
      kind: CT_RETURN_KIND,
      statusCode: "REJECT",
      correlationId,
      irmark: pending.irmark,
      errors: parsed.errors,
      businessErrors: parsed.businessErrors,
    };
    await putAsyncRequest(userSub, correlationId, "failed", failure, asyncRequestsTableName);
    await deleteFromTransactionEngine({ pollUrl, correlationId, gatewayTest, messageClass, extraHeaders });
    return { data: failure };
  }

  if (parsed.qualifier === "acknowledgement") {
    const pollIntervalSeconds = parsed.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS;
    const nextPollAt = new Date(Date.now() + pollIntervalSeconds * 1000).toISOString();
    await putAsyncRequest(userSub, correlationId, "pending", { ...pending, nextPollAt, pollIntervalSeconds }, asyncRequestsTableName);
    return { data: { statusCode: "PENDING", correlationId, irmark: pending.irmark, pollIntervalSeconds } };
  }

  const receiptId = `${new Date().toISOString()}-${correlationId}`;
  const accepted = {
    kind: CT_RETURN_KIND,
    statusCode: "ACCEPT",
    correlationId,
    utr: pending.utr,
    irmark: pending.irmark,
    irmarkReceipt: parsed.irmarkReceipt,
    successMessage: parsed.successMessage,
  };
  await putReceipt(userSub, receiptId, accepted, resolveActorClass());
  const data = { ...accepted, receiptId };
  await putAsyncRequest(userSub, correlationId, "completed", data, asyncRequestsTableName);
  await deleteFromTransactionEngine({ pollUrl, correlationId, gatewayTest, messageClass, extraHeaders });
  await publishActivityEvent({
    event: "hmrc-ct-return-accepted",
    summary: "HMRC Company Tax Return accepted",
    userSub,
  });
  return { data };
}
