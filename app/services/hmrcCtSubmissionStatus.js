// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/hmrcCtSubmissionStatus.js
// Polls HMRC's Transaction Engine for the outcome of a submitted Company Tax Return and records
// it. The async request holds the poll end point and the earliest time the next poll may go out,
// so a call that arrives inside the poll interval answers from the record and sends nothing. The
// final response writes the receipt, then a DELETE_REQUEST tells the Transaction Engine to drop
// its copy. A pending return is kept 30 days from when it was sent, however often it is polled; a
// return HMRC has not answered by then is recorded as having no answer from HMRC.

import { setTimeout as sleep } from "node:timers/promises";
import { createLogger, context } from "../lib/logger.js";
import {
  buildPollRequest,
  buildDataRequest,
  findHeldSubmission,
  buildDeleteRequest,
  getTransactionEngineSubmissionUrl,
  parseTransactionEngineResponse,
  postToTransactionEngine,
  isTransientPollError,
  irmarkReceiptMatches,
} from "./hmrcTransactionEngine.js";
import { CT_RETURN_KIND, CT_NO_ANSWER_STATUS_CODE } from "./ctReturnKind.js";
import {
  verifyReceiptSignature,
  parseTrustedFingerprints,
  RECEIPT_SIGNATURE_VALID,
  RECEIPT_SIGNATURE_DIGEST_NOT_REPRODUCED,
} from "./hmrcReceiptSignature.js";
import {
  putAsyncRequest,
  getAsyncRequest,
  claimRecording,
  releaseRecording,
  RECORDING_CLAIM_STALE_MINUTES,
} from "../data/dynamoDbAsyncRequestRepository.js";
import { recordFiledReceipt } from "./filedReceipt.js";
import { publishActivityEvent, resolveActorClass } from "../lib/activityAlert.js";
import { jointFilingFields, longPeriodFields, amendedFields, formRequestFields } from "./jointFiling.js";
import { chargeTokenOnSuccess } from "./tokenEnforcement.js";
import { clientAuthorisationMessage } from "./ctClientScope.js";

const logger = createLogger({ source: "app/services/hmrcCtSubmissionStatus.js" });

const DEFAULT_POLL_INTERVAL_SECONDS = 10;
export const CT_RETURN_ACTIVITY_ID = "file-company-tax-return";

function secondsUntil(isoTime, now) {
  return Math.max(Math.ceil((Date.parse(isoTime) - now) / 1000), 0);
}

const DELETE_ATTEMPTS = 3;
const DELETE_RECORD_NOT_FOUND = "2000";

// A DELETE_REQUEST goes to the submission endpoint, which takes the messages a piece of software
// sends; the poll address answers polls. A delete answered with a SUBMISSION_ERROR is sent again;
// error 2000 means the copy is already gone, so the sending stops. Resolves true when the copy is
// gone, and false when every attempt of this call failed, so the caller marks the delete as owed
// and sends it on a later read.
async function deleteFromTransactionEngine({ correlationId, gatewayTest, messageClass, extraHeaders }) {
  const deleteRequest = buildDeleteRequest({ correlationId, gatewayTest, messageClass });
  const submissionUrl = getTransactionEngineSubmissionUrl({ gatewayTest });
  for (let attempt = 1; attempt <= DELETE_ATTEMPTS; attempt++) {
    try {
      const response = await postToTransactionEngine(submissionUrl, deleteRequest, extraHeaders);
      if (response.ok === false) throw new Error(`HTTP ${response.status}`);
      const parsed = parseTransactionEngineResponse(response.data);
      if (parsed.qualifier !== "error") return true;
      if (parsed.errors.some((error) => error.number === DELETE_RECORD_NOT_FOUND)) return true;
      logger.warn({
        message: "Transaction Engine delete request answered with an error",
        hmrcCorrelationId: correlationId,
        attempt,
        errorNumbers: parsed.errors.map((error) => error.number),
      });
    } catch (error) {
      logger.warn({ message: "Transaction Engine delete request failed", hmrcCorrelationId: correlationId, attempt, error: error.message });
    }
  }
  logger.warn({
    message: "Transaction Engine delete request not completed; it is owed and goes out on the next status read",
    hmrcCorrelationId: correlationId,
  });
  return false;
}

// Sends the delete for a settled request. When it does not complete, the request keeps a
// deleteOwed mark with what the next delete needs; when it does, the mark is cleared.
async function settleDelete({ userSub, correlationId, status, data, gatewayTest, messageClass, extraHeaders, asyncRequestsTableName }) {
  const deleted = await deleteFromTransactionEngine({ correlationId, gatewayTest, messageClass, extraHeaders });
  const owed = !deleted;
  if (owed || data.deleteOwed) {
    const settled = withoutDeleteOwed(data);
    await putAsyncRequest(
      userSub,
      correlationId,
      status,
      owed ? { ...settled, deleteOwed: { gatewayTest, messageClass } } : settled,
      asyncRequestsTableName,
    );
  }
}

// What the caller sees of a settled request: the delete bookkeeping stays server side.
function withoutDeleteOwed({ deleteOwed: _owed, ...data }) {
  return data;
}

const DATA_REQUEST_ATTEMPTS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

// How long Submit waits for HMRC's final answer to a return, counted from when it was sent.
export const CT_ANSWER_WAIT_DAYS = 30;
// A pending return is kept a day past the wait, so a day of scheduled checks can record that HMRC
// gave no answer before the record goes.
const CT_PENDING_RETENTION_DAYS = CT_ANSWER_WAIT_DAYS + 1;
// A no-answer record stays this long after it is written, so the receipts list and the status page
// show it.
const CT_NO_ANSWER_RETENTION = { days: CT_ANSWER_WAIT_DAYS };

/**
 * The retention of a pending return: CT_PENDING_RETENTION_DAYS from when it was sent, so a poll that
 * writes the request again does not move it.
 * @param {Date|string} sentAt
 * @returns {{days: number, from: Date}}
 */
export function ctPendingRetention(sentAt) {
  return { days: CT_PENDING_RETENTION_DAYS, from: new Date(sentAt) };
}

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
          hmrcCorrelationId: held.correlationId,
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

// Called once the Transaction Engine has answered a poll, so lastCheckedAt is when Submit last asked.
async function pendingAgain({ userSub, correlationId, pending, sentAt, pollIntervalSeconds: hmrcInterval, asyncRequestsTableName }) {
  const pollIntervalSeconds = hmrcInterval ?? pending.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS;
  const checkedAt = new Date();
  const nextPollAt = new Date(checkedAt.getTime() + pollIntervalSeconds * 1000).toISOString();
  const lastCheckedAt = checkedAt.toISOString();
  await putAsyncRequest(
    userSub,
    correlationId,
    "pending",
    { ...pending, nextPollAt, pollIntervalSeconds, lastCheckedAt },
    asyncRequestsTableName,
    ctPendingRetention(sentAt),
  );
  return { data: { statusCode: "PENDING", correlationId, irmark: pending.irmark, pollIntervalSeconds } };
}

function recordingIsStale(persistedRequest) {
  const since = Date.parse(persistedRequest.recordingSince ?? "");
  return Number.isNaN(since) || since <= Date.now() - RECORDING_CLAIM_STALE_MINUTES * 60 * 1000;
}

// HMRC gave no final answer in CT_ANSWER_WAIT_DAYS: the request records that, and nothing more is asked.
async function recordNoAnswer({ userSub, correlationId, pending, jointFiling, sentAt, asyncRequestsTableName }) {
  const noAnswer = {
    kind: CT_RETURN_KIND,
    statusCode: CT_NO_ANSWER_STATUS_CODE,
    ...(pending.clientId ? { clientId: pending.clientId } : {}),
    ...jointFiling,
    correlationId,
    utr: pending.utr,
    irmark: pending.irmark,
    ...(pending.lastCheckedAt ? { lastCheckedAt: pending.lastCheckedAt } : {}),
    ...formRequestFields(pending.formRequest),
    ...(pending.filed?.boxes ? { filed: { boxes: pending.filed.boxes } } : {}),
  };
  logger.warn({
    message: "HMRC gave no final answer to the Company Tax Return in time; Submit stops asking",
    hmrcCorrelationId: correlationId,
    sentAt,
  });
  await putAsyncRequest(userSub, correlationId, "failed", noAnswer, asyncRequestsTableName, CT_NO_ANSWER_RETENTION);
  return { data: noAnswer };
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
  context.set("hmrcCorrelationId", correlationId);
  const asyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  const persistedRequest = await getAsyncRequest(userSub, correlationId, asyncRequestsTableName);

  if (!persistedRequest || persistedRequest.data?.kind !== CT_RETURN_KIND) {
    logger.warn({ message: "Company Tax Return status poll for a submission this user did not make", hmrcCorrelationId: correlationId });
    return { notFound: true, correlationId };
  }
  if (persistedRequest.status === "completed" || persistedRequest.status === "failed") {
    const settled = persistedRequest.data;
    if (settled.deleteOwed) {
      const { gatewayTest, messageClass } = settled.deleteOwed;
      await settleDelete({
        userSub,
        correlationId,
        status: persistedRequest.status,
        data: settled,
        gatewayTest,
        messageClass,
        extraHeaders: govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {},
        asyncRequestsTableName,
      });
    }
    return { data: withoutDeleteOwed(settled) };
  }

  const pending = persistedRequest.data;
  // Another poll is recording this return's final answer: the reader waits for it.
  if (persistedRequest.status === "recording" && !recordingIsStale(persistedRequest)) {
    return { data: { statusCode: "PENDING", correlationId, irmark: pending.irmark } };
  }
  const jointFiling = {
    ...jointFilingFields(pending.jointFilingId),
    ...longPeriodFields(pending.longPeriod),
    ...amendedFields(pending.amended === true),
  };
  const now = Date.now();
  const sentAt = persistedRequest.createdAt;
  if (now >= Date.parse(sentAt) + CT_ANSWER_WAIT_DAYS * DAY_MS) {
    return recordNoAnswer({ userSub, correlationId, pending, jointFiling, sentAt, asyncRequestsTableName });
  }
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
    logger.warn({
      message: "Transient Transaction Engine error on a poll; polling again later",
      hmrcCorrelationId: correlationId,
      errors: parsed.errors,
    });
    return pendingAgain({
      userSub,
      correlationId,
      pending,
      sentAt,
      pollIntervalSeconds: parsed.pollIntervalSeconds,
      asyncRequestsTableName,
    });
  }

  if (parsed.qualifier === "error" || parsed.errors.length > 0) {
    const failure = {
      kind: CT_RETURN_KIND,
      statusCode: "REJECT",
      ...(pending.clientId ? { clientId: pending.clientId } : {}),
      ...(pending.clientId && clientAuthorisationMessage(parsed.errors) ? { message: clientAuthorisationMessage(parsed.errors) } : {}),
      ...jointFiling,
      correlationId,
      irmark: pending.irmark,
      errors: parsed.errors,
      businessErrors: parsed.businessErrors,
    };
    await putAsyncRequest(userSub, correlationId, "failed", failure, asyncRequestsTableName);
    await settleDelete({
      userSub,
      correlationId,
      status: "failed",
      data: failure,
      gatewayTest,
      messageClass,
      extraHeaders,
      asyncRequestsTableName,
    });
    return { data: failure };
  }

  if (parsed.qualifier === "acknowledgement") {
    return pendingAgain({
      userSub,
      correlationId,
      pending,
      sentAt,
      pollIntervalSeconds: parsed.pollIntervalSeconds,
      asyncRequestsTableName,
    });
  }

  const irmarkReceiptMismatch = !irmarkReceiptMatches(pending.irmark, parsed.irmarkReceipt);
  if (irmarkReceiptMismatch) {
    logger.error({
      message: "The IRmark in HMRC's receipt differs from the IRmark sent",
      hmrcCorrelationId: correlationId,
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
    hmrcCorrelationId: correlationId,
    receiptIrmark: parsed.irmarkReceipt,
    receiptSignature,
    ...signatureDetail,
  });

  // The page's poll and the scheduled check can read the same final answer: only the one that takes
  // the claim records it, so the receipt, its email, the accepted event and the token charge happen once.
  if (!(await claimRecording(userSub, correlationId, asyncRequestsTableName))) {
    const stored = await getAsyncRequest(userSub, correlationId, asyncRequestsTableName);
    if (stored?.status === "completed") return { data: withoutDeleteOwed(stored.data) };
    return { data: { statusCode: "PENDING", correlationId, irmark: pending.irmark } };
  }
  try {
    return await recordAcceptance({
      userSub,
      correlationId,
      pending,
      jointFiling,
      parsed,
      irmarkReceiptMismatch,
      receiptSignature,
      gatewayTest,
      messageClass,
      extraHeaders,
      asyncRequestsTableName,
    });
  } catch (error) {
    await releaseRecording(userSub, correlationId, asyncRequestsTableName);
    throw error;
  }
}

// Writes an accepted return's receipt and settled record, tells the Transaction Engine to drop its
// copy, publishes the accepted event and charges the token. Only the poll that holds the claim runs it.
async function recordAcceptance({
  userSub,
  correlationId,
  pending,
  jointFiling,
  parsed,
  irmarkReceiptMismatch,
  receiptSignature,
  gatewayTest,
  messageClass,
  extraHeaders,
  asyncRequestsTableName,
}) {
  const receiptId = `${new Date().toISOString()}-${correlationId}`;
  const accepted = {
    kind: CT_RETURN_KIND,
    statusCode: "ACCEPT",
    ...(pending.clientId ? { clientId: pending.clientId } : {}),
    ...jointFiling,
    correlationId,
    utr: pending.utr,
    irmark: pending.irmark,
    irmarkReceipt: parsed.irmarkReceipt,
    ...(irmarkReceiptMismatch ? { irmarkReceiptMismatch: true } : {}),
    receiptSignature,
    successMessage: parsed.successMessage,
    gatewayTest: pending.gatewayTest === true,
  };
  // The filed figures and documents stay with the receipt so the customer's copy shows what was filed.
  const receipt = { ...accepted, ...(pending.filed ? { filed: pending.filed } : {}), ...formRequestFields(pending.formRequest) };
  await recordFiledReceipt({
    userSub,
    receiptId,
    receipt,
    actor: resolveActorClass(),
    clientId: pending.clientId,
    receiptKind: "ct-return",
    synthetic: pending.gatewayTest,
  });
  const data = { ...accepted, receiptId };
  await putAsyncRequest(userSub, correlationId, "completed", data, asyncRequestsTableName);
  await settleDelete({
    userSub,
    correlationId,
    status: "completed",
    data,
    gatewayTest,
    messageClass,
    extraHeaders,
    asyncRequestsTableName,
  });
  await publishActivityEvent({
    event: "hmrc-ct-return-accepted",
    summary: "HMRC Company Tax Return accepted",
    userSub,
    clientId: pending.clientId,
    detail: {
      outcome: "success",
      activityId: CT_RETURN_ACTIVITY_ID,
      hmrcStatus: accepted.statusCode,
      correlationId,
      irmark: pending.irmark,
      receiptId,
    },
  });
  // Each accepted return costs its own token, alone or as half of a pair; the pair costs two. The two
  // returns of a long period of account cost one token between them: part 1 takes it and part 2 takes none.
  if (pending.longPeriod?.part !== 2) await chargeTokenOnSuccess(userSub, CT_RETURN_ACTIVITY_ID);
  return { data };
}
