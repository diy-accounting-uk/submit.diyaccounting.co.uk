// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/hmrcCtSubmissionStatus.js
// Polls HMRC's Transaction Engine for the outcome of a submitted Company Tax Return and records
// it. The async request holds the poll end point and the earliest time the next poll may go out,
// so a call that arrives inside the poll interval answers from the record and sends nothing. The
// final response writes the receipt, then a DELETE_REQUEST tells the Transaction Engine to drop
// its copy.

import { setTimeout as sleep } from "node:timers/promises";
import { createLogger } from "../lib/logger.js";
import {
  buildPollRequest,
  buildDataRequest,
  findHeldSubmission,
  buildDeleteRequest,
  parseTransactionEngineResponse,
  postToTransactionEngine,
  isTransientPollError,
  irmarkReceiptMatches,
  CT_RETURN_KIND,
} from "./hmrcTransactionEngine.js";
import {
  verifyReceiptSignature,
  parseTrustedFingerprints,
  RECEIPT_SIGNATURE_VALID,
  RECEIPT_SIGNATURE_DIGEST_NOT_REPRODUCED,
} from "./hmrcReceiptSignature.js";
import { putAsyncRequest, getAsyncRequest } from "../data/dynamoDbAsyncRequestRepository.js";
import { putReceipt } from "../data/dynamoDbReceiptRepository.js";
import { publishActivityEvent, resolveActorClass } from "../lib/activityAlert.js";
import { jointFilingFields, amendedFields, formRequestFields } from "./jointFiling.js";
import { chargeTokenOnSuccess } from "./tokenEnforcement.js";

const logger = createLogger({ source: "app/services/hmrcCtSubmissionStatus.js" });

const DEFAULT_POLL_INTERVAL_SECONDS = 10;
const CT_RETURN_ACTIVITY_ID = "file-company-tax-return";

function secondsUntil(isoTime, now) {
  return Math.max(Math.ceil((Date.parse(isoTime) - now) / 1000), 0);
}

const DELETE_ATTEMPTS = 3;
const DELETE_RECORD_NOT_FOUND = "2000";

// A DELETE_REQUEST answered with a SUBMISSION_ERROR is sent again; error 2000 means the copy is
// already gone, so the sending stops. An undeleted response expires at HMRC.
async function deleteFromTransactionEngine({ pollUrl, correlationId, gatewayTest, messageClass, extraHeaders }) {
  const deleteRequest = buildDeleteRequest({ correlationId, gatewayTest, messageClass });
  for (let attempt = 1; attempt <= DELETE_ATTEMPTS; attempt++) {
    try {
      const response = await postToTransactionEngine(pollUrl, deleteRequest, extraHeaders);
      if (response.ok === false) throw new Error(`HTTP ${response.status}`);
      const parsed = parseTransactionEngineResponse(response.data);
      if (parsed.qualifier !== "error") return;
      if (parsed.errors.some((error) => error.number === DELETE_RECORD_NOT_FOUND)) return;
      logger.warn({
        message: "Transaction Engine delete request answered with an error",
        correlationId,
        attempt,
        errorNumbers: parsed.errors.map((error) => error.number),
      });
    } catch (error) {
      logger.warn({ message: "Transaction Engine delete request failed", correlationId, attempt, error: error.message });
    }
  }
  logger.warn({ message: "Transaction Engine delete request not completed; the copy expires at HMRC", correlationId });
}

const DATA_REQUEST_ATTEMPTS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Find out whether the Transaction Engine holds a submission whose reply never reached us. The
 * Transaction Engine is asked with a DATA_REQUEST after the poll interval, as the protocol says,
 * and the submission is recognised by its TransactionID. The answer has three states:
 * - held: the Transaction Engine has it, so the caller polls it with the returned CorrelationID;
 * - not-received: the Transaction Engine answered and does not hold it, so the return can be filed again;
 * - unknown: the Transaction Engine did not answer or answered with an error, so nothing is known.
 * Credentials are not stored anywhere, so this runs in the call that has them.
 *
 * @param {object} input
 * @param {string} input.senderId
 * @param {string} input.password
 * @param {string} input.submissionUrl - the Transaction Engine URL the submission went to
 * @param {boolean} input.gatewayTest
 * @param {string} input.transactionId - the TransactionID of the submission request
 * @param {Date} input.attemptedAt
 * @param {number} input.waitSeconds - the poll interval to wait before each DATA_REQUEST
 * @param {Record<string, string>} [input.extraHeaders]
 * @returns {Promise<{state: "held", correlationId: string, status: string|undefined}|{state: "not-received"}|{state: "unknown"}>}
 */
export async function findHeldCtSubmission({
  senderId,
  password,
  submissionUrl,
  gatewayTest,
  transactionId,
  attemptedAt,
  waitSeconds,
  extraHeaders = {},
}) {
  const dataRequest = buildDataRequest({
    senderId,
    password,
    gatewayTest,
    transactionId,
    since: new Date(attemptedAt.getTime() - DAY_MS),
  });
  for (let attempt = 1; attempt <= DATA_REQUEST_ATTEMPTS; attempt++) {
    await sleep(waitSeconds * 1000);
    try {
      const response = await postToTransactionEngine(submissionUrl, dataRequest, extraHeaders);
      if (response.ok === false) throw new Error(`HTTP ${response.status}`);
      const parsed = parseTransactionEngineResponse(response.data);
      if (parsed.qualifier === "error" || parsed.errors.length > 0) {
        logger.warn({ message: "Transaction Engine answered a data request with an error", transactionId, attempt, errors: parsed.errors });
        continue;
      }
      const held = findHeldSubmission(parsed, transactionId);
      if (held?.correlationId) {
        logger.info({
          message: "Transaction Engine holds the submission whose reply was lost",
          transactionId,
          correlationId: held.correlationId,
        });
        return { state: "held", correlationId: held.correlationId, status: held.status };
      }
      logger.warn({ message: "Transaction Engine holds no submission with this TransactionID", transactionId });
      return { state: "not-received" };
    } catch (error) {
      logger.warn({ message: "Transaction Engine data request failed", transactionId, attempt, error: error.message });
    }
  }
  return { state: "unknown" };
}

async function pendingAgain({ userSub, correlationId, pending, pollIntervalSeconds: hmrcInterval, asyncRequestsTableName }) {
  const pollIntervalSeconds = hmrcInterval ?? pending.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS;
  const nextPollAt = new Date(Date.now() + pollIntervalSeconds * 1000).toISOString();
  await putAsyncRequest(userSub, correlationId, "pending", { ...pending, nextPollAt, pollIntervalSeconds }, asyncRequestsTableName);
  return { data: { statusCode: "PENDING", correlationId, irmark: pending.irmark, pollIntervalSeconds } };
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
  const jointFiling = { ...jointFilingFields(pending.jointFilingId), ...amendedFields(pending.amended === true) };
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

  if (parsed.qualifier === "error" && isTransientPollError(parsed)) {
    logger.warn({ message: "Transient Transaction Engine error on a poll; polling again later", correlationId, errors: parsed.errors });
    return pendingAgain({ userSub, correlationId, pending, pollIntervalSeconds: parsed.pollIntervalSeconds, asyncRequestsTableName });
  }

  if (parsed.qualifier === "error" || parsed.errors.length > 0) {
    const failure = {
      kind: CT_RETURN_KIND,
      statusCode: "REJECT",
      ...jointFiling,
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
    return pendingAgain({ userSub, correlationId, pending, pollIntervalSeconds: parsed.pollIntervalSeconds, asyncRequestsTableName });
  }

  const irmarkReceiptMismatch = !irmarkReceiptMatches(pending.irmark, parsed.irmarkReceipt);
  if (irmarkReceiptMismatch) {
    logger.error({
      message: "The IRmark in HMRC's receipt differs from the IRmark sent",
      correlationId,
      sentIrmark: pending.irmark,
      receiptIrmark: parsed.irmarkReceipt,
    });
  }

  // The protocol makes the signature check optional: its outcome is logged and stored, and never
  // changes an accepted return.
  const signatureCheck = verifyReceiptSignature(response.data, {
    trustedFingerprints: parseTrustedFingerprints(process.env.HMRC_RECEIPT_CERTIFICATE_SHA256),
  });
  const { outcome: receiptSignature, ...signatureDetail } = signatureCheck;
  const informational = receiptSignature === RECEIPT_SIGNATURE_VALID || receiptSignature === RECEIPT_SIGNATURE_DIGEST_NOT_REPRODUCED;
  logger[informational ? "info" : "warn"]({
    message: `HMRC receipt signature: ${receiptSignature}`,
    correlationId,
    receiptIrmark: parsed.irmarkReceipt,
    receiptSignature,
    ...signatureDetail,
  });

  const receiptId = `${new Date().toISOString()}-${correlationId}`;
  const accepted = {
    kind: CT_RETURN_KIND,
    statusCode: "ACCEPT",
    ...jointFiling,
    correlationId,
    utr: pending.utr,
    irmark: pending.irmark,
    irmarkReceipt: parsed.irmarkReceipt,
    ...(irmarkReceiptMismatch ? { irmarkReceiptMismatch: true } : {}),
    receiptSignature,
    successMessage: parsed.successMessage,
  };
  // The filed figures and documents stay with the receipt so the customer's copy shows what was filed.
  const receipt = { ...accepted, ...(pending.filed ? { filed: pending.filed } : {}), ...formRequestFields(pending.formRequest) };
  await putReceipt(userSub, receiptId, receipt, resolveActorClass());
  const data = { ...accepted, receiptId };
  await putAsyncRequest(userSub, correlationId, "completed", data, asyncRequestsTableName);
  await deleteFromTransactionEngine({ pollUrl, correlationId, gatewayTest, messageClass, extraHeaders });
  await publishActivityEvent({
    event: "hmrc-ct-return-accepted",
    summary: "HMRC Company Tax Return accepted",
    userSub,
  });
  // A return sent as half of a pair costs its own token; the pair costs two.
  if (jointFiling.jointFilingId) await chargeTokenOnSuccess(userSub, CT_RETURN_ACTIVITY_ID);
  return { data };
}
