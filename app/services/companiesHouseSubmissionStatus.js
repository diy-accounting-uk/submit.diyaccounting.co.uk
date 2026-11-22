// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseSubmissionStatus.js
// Polls the Companies House XML Gateway for the outcome of a submitted form and records it. Two
// polls share the record: the page polls one submission by number for the reader who waits, and
// the scheduled presenter poll (companiesHousePresenterPoll.js) asks for every submission Companies
// House has finished since the last poll, for the reader who left. Whichever sees the final status
// first records it; the other finds it claimed.

import { createLogger } from "../lib/logger.js";
import {
  buildStatusRequest,
  resolvePresenterCredentials,
  postToGateway,
  parseGatewayResponse,
  summariseGatewayResponse,
  redactPresenterCredentials,
  isNothingCompletedError,
} from "./companiesHouseXmlGateway.js";
import { putAsyncRequest, getAsyncRequest } from "../data/dynamoDbAsyncRequestRepository.js";
import { FILING_STATE_RETENTION, claimFinalStatus, releaseFinalStatus } from "../data/dynamoDbCompaniesHouseFilingStateRepository.js";
import { recordFiledReceiptForSubmission } from "./filedReceipt.js";
import { markReceiptStepDone, clearReceiptStep } from "../data/dynamoDbReceiptRepository.js";
import { publishActivityEvent, resolveActorClass } from "../lib/activityAlert.js";
import { jointFilingFields, amendedFields, revisesReceiptFields, formRequestFields } from "./jointFiling.js";
import { chargeTokenOnSuccess } from "./tokenEnforcement.js";
import { markChargeUsed } from "./activityCharges.js";

const ACCOUNTS_RECEIPT_KIND = "companies-house-accounts";

// The activity event each form publishes when Companies House accepts it.
export const FORM_KINDS = {
  "accounts": {
    acceptedEvent: "companies-house-accounts-accepted",
    acceptedSummary: "Companies House micro-entity accounts accepted",
  },
  "confirmation-statement": {
    acceptedEvent: "companies-house-confirmation-statement-accepted",
    acceptedSummary: "Companies House confirmation statement accepted",
  },
  "psc-verification-statement": {
    acceptedEvent: "companies-house-psc-verification-statement-accepted",
    acceptedSummary: "Companies House PSC verification statement accepted",
  },
};

const logger = createLogger({ source: "app/services/companiesHouseSubmissionStatus.js" });

export function isGatewayTest() {
  // A poll of a test-service submission needs the same GatewayTest flag the submission itself
  // carried; the live service wants it absent, the same split the submit Lambdas make.
  return process.env.COMPANIES_HOUSE_GATEWAY_TEST === "true";
}

/**
 * Poll the Companies House XML Gateway for one submission's status and record the outcome: a
 * cached completed/failed async request short-circuits the gateway call; a submission with no
 * request persisted for this user returns `{ notFound: true }` without calling the gateway; a
 * final status is recorded by recordSubmissionStatus.
 *
 * @param {object} input
 * @param {string} input.userSub
 * @param {string} input.submissionNumber
 * @param {string} [input.govTestScenario] - forwarded to the gateway call as Gov-Test-Scenario
 * @param {{presenterId: string, presenterCode: string}} [input.ownPresenter] - the customer's own
 *   presenter the submission was filed under; used for this poll only and never recorded
 * @param {string} input.kind - a key of FORM_KINDS
 * @returns {Promise<{data: object}|{errors: Array, submissionNumber: string}|{notFound: true, submissionNumber: string}>}
 */
export async function pollSubmission({ userSub, submissionNumber, govTestScenario, ownPresenter, kind, now = new Date() }) {
  const asyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  const persistedRequest = await getAsyncRequest(userSub, submissionNumber, asyncRequestsTableName);

  if (!persistedRequest) {
    logger.warn({ message: "Companies House status poll for a submission this user did not make", submissionNumber });
    return { notFound: true, submissionNumber };
  }

  // A never-received rejection is asked about again while Companies House could still answer for
  // the filing, so a late decision is recorded for a filing under the customer's own presenter,
  // which the presenter poll never asks about.
  const stillAsking = isNeverReceived(persistedRequest.data) && withinStatusWindow(persistedRequest, now);
  if ((persistedRequest.status === "completed" || persistedRequest.status === "failed") && !stillAsking) {
    return { data: withoutPendingRequest(persistedRequest.data) };
  }

  const { presenterId, presenterCode } = ownPresenter ?? (await resolvePresenterCredentials());
  const statusRequestXml = buildStatusRequest({ presenterId, presenterCode, submissionNumber, gatewayTest: isGatewayTest() });
  logger.info({
    message: "Companies House GetSubmissionStatus request",
    submissionNumber,
    requestXml: redactPresenterCredentials(statusRequestXml),
  });
  const gatewayResponse = await postToGateway(statusRequestXml, govTestScenario ? { "Gov-Test-Scenario": govTestScenario } : {});
  let parsed;
  try {
    parsed = parseGatewayResponse(gatewayResponse.data);
  } catch (error) {
    logger.error({
      message: "Companies House GetSubmissionStatus response could not be parsed",
      submissionNumber,
      status: gatewayResponse.status,
      error: error.message,
      responseXml: redactPresenterCredentials(gatewayResponse.data),
    });
    throw error;
  }
  // The parsed fields, not the envelope: the envelope of a routine answer carries GovTalkErrors.
  logger.info({
    message: "Companies House GetSubmissionStatus response",
    submissionNumber,
    status: gatewayResponse.status,
    ...summariseGatewayResponse(parsed),
  });

  if (parsed.errors?.length) {
    if (stillAsking && parsed.errors.every((error) => error.text === "No Transaction Found")) {
      return { data: withoutPendingRequest(persistedRequest.data) };
    }
    if (neverReceived({ persistedRequest, errors: parsed.errors, now })) {
      return { data: await recordNeverReceived({ userSub, submissionNumber, persistedRequest, kind }) };
    }
    // Nothing decided yet: the filing is still being processed, so the reader keeps waiting.
    if (parsed.errors.every(isNothingCompletedError)) {
      logger.info({ message: "Companies House has not yet decided the submission", submissionNumber });
      if (stillAsking) return { data: withoutPendingRequest(persistedRequest.data) };
      return { data: { submissionNumber, statusCode: "PENDING", rejections: [] } };
    }
    logger.error({ message: "Companies House gateway returned errors while polling", submissionNumber, errors: parsed.errors });
    return { errors: parsed.errors, submissionNumber };
  }

  // parseGatewayResponse() carries every Status element it found; a GetSubmissionStatus poll for
  // one submission number always answers with exactly one.
  const status = parsed.statuses[0];
  const { data } = await recordSubmissionStatus({ userSub, submissionNumber, persistedRequest, status, kind });
  return { data };
}

// TIS v5.3 section 1.2.4: Companies House answers a delivered envelope with its receipt in the same
// connection, so a delivered submission is known to GetSubmissionStatus at once. The TIS gives no
// time for that, so the margin is 30 minutes. Section 2.5: option 1 also answers "No Transaction
// Found" 90 days after Companies House finished a submission, so an older filing proves nothing.
export const NEVER_RECEIVED_MARGIN_MS = 30 * 60 * 1000;
const NO_STATUS_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
export const NEVER_RECEIVED_REJECT_CODE = "NOT-RECEIVED";
const NEVER_RECEIVED_MESSAGE = "Companies House did not receive this filing. Nothing was filed. File it again.";

// A filing kept pending after its envelope got no answer, that Companies House says it has no
// record of, past the margin.
function neverReceived({ persistedRequest, errors, now }) {
  if (persistedRequest.status !== "pending" || persistedRequest.data?.outcomeUnknown !== true) return false;
  if (!errors.every((error) => error.text === "No Transaction Found")) return false;
  const age = now.getTime() - new Date(persistedRequest.createdAt).getTime();
  return age >= NEVER_RECEIVED_MARGIN_MS && age < NO_STATUS_AFTER_MS;
}

// Whether Companies House can still answer a status poll for a filing: option 1 answers "No
// Transaction Found" for every filing older than NO_STATUS_AFTER_MS.
function withinStatusWindow(persistedRequest, now) {
  return now.getTime() - new Date(persistedRequest.createdAt).getTime() < NO_STATUS_AFTER_MS;
}

// Recorded the way a REJECT is, so the page and the filings list tell the reader to file again. No
// token or fee was charged for it: a token is charged only on ACCEPT, and a confirmation statement
// fee is marked used only when the gateway acknowledges the envelope or Companies House accepts it.
async function recordNeverReceived({ userSub, submissionNumber, persistedRequest, kind }) {
  const status = {
    submissionNumber,
    statusCode: "REJECT",
    rejections: [{ rejectCode: NEVER_RECEIVED_REJECT_CODE, description: NEVER_RECEIVED_MESSAGE, instanceNumber: "1" }],
  };
  logger.warn({ message: "Companies House has no record of a filing whose envelope got no answer", submissionNumber });
  const { data } = await recordSubmissionStatus({ userSub, submissionNumber, persistedRequest, status, kind });
  return data;
}

/**
 * Whether a status is the rejection recorded when Companies House had no record of a filing whose
 * envelope got no answer. It is not Companies House's own decision, so a later ACCEPT or REJECT
 * replaces it.
 * @param {{rejections?: Array}|null|undefined} status
 * @returns {boolean}
 */
export function isNeverReceived(status) {
  return Boolean(status?.rejections?.some((rejection) => rejection.rejectCode === NEVER_RECEIVED_REJECT_CODE));
}

/**
 * Whether a filer's request item holds a final status Companies House decided: an accepted
 * filing's "completed", or a rejection's "failed" with its REJECT. Neither a "failed" item from a
 * send that never reached Companies House (no REJECT) nor the never-received rejection is one.
 * @param {object|null} request - the filer's async request item
 * @returns {boolean}
 */
export function hasStoredFinalStatus(request) {
  if (request?.status === "completed") return true;
  return request?.status === "failed" && request.data?.statusCode === "REJECT" && !isNeverReceived(request.data);
}

// The page answer of a stored outcome leaves out the fields the request was sent with.
function withoutPendingRequest(data) {
  if (!data?.pendingRequest) return data;
  const answer = { ...data };
  delete answer.pendingRequest;
  return answer;
}

/**
 * The fields the filer's request was sent with. A never-received record keeps them under
 * pendingRequest, so a status that arrives after it is recorded from the same fields.
 * @param {object} persistedRequest
 * @returns {object}
 */
function sentRequestData(persistedRequest) {
  return persistedRequest.data?.pendingRequest ?? persistedRequest.data ?? {};
}

/**
 * Record a submission's status once Companies House has decided it. REJECT stores "failed" with
 * the reject reasons; ACCEPT writes a receipt, asks for the receipt email, marks a paid
 * confirmation statement fee used, charges its token, stores "completed" and publishes the form's
 * accepted event. PENDING and PARKED change nothing. Only the poll that holds the claim records it;
 * a record that fails or stops part-way is retried, and the retry finds the receipt of the
 * submission and runs only the steps the receipt does not show as done, so the receipt, its email
 * and the token charge each happen once. The never-received rejection gives its claim back, so a
 * later decision from Companies House is recorded over it.
 *
 * @param {object} input
 * @param {string} input.userSub
 * @param {string} input.submissionNumber
 * @param {object} input.persistedRequest - the filer's async request item, as the submit Lambda wrote it
 * @param {{statusCode: string, submissionNumber: string, companyNumber?: string, rejections: Array}} input.status
 * @param {string} input.kind - a key of FORM_KINDS
 * @returns {Promise<{data: object, recorded: boolean}>} recorded is false when nothing was written
 */
export async function recordSubmissionStatus({ userSub, submissionNumber, persistedRequest, status, kind }) {
  if (status.statusCode !== "REJECT" && status.statusCode !== "ACCEPT") {
    // PENDING or PARKED: leave the request state as-is and hand the current snapshot back so the
    // caller can keep polling.
    return { data: status, recorded: false };
  }
  if (!(await claimFinalStatus(submissionNumber))) {
    logger.info({
      message: "Companies House final status is being recorded by another poll",
      submissionNumber,
      statusCode: status.statusCode,
    });
    // The other poll holds the claim: answer with what it stored, so the page gets the receipt id.
    // Until it has stored the outcome, the filing is still pending for the reader.
    const stored = await getAsyncRequest(userSub, submissionNumber, process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME);
    return {
      data: hasStoredFinalStatus(stored) ? stored.data : { submissionNumber, statusCode: "PENDING", rejections: [] },
      recorded: false,
    };
  }
  let data;
  try {
    data = await writeFinalStatus({ userSub, submissionNumber, persistedRequest, status, kind });
  } catch (error) {
    await releaseFinalStatus(submissionNumber);
    throw error;
  }
  if (isNeverReceived(status)) await releaseFinalStatus(submissionNumber);
  return { data, recorded: true };
}

async function writeFinalStatus({ userSub, submissionNumber, persistedRequest, status, kind }) {
  const asyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  const requestData = sentRequestData(persistedRequest);
  const jointFiling = {
    ...jointFilingFields(requestData.jointFilingId),
    ...amendedFields(requestData.amended === true),
    ...revisesReceiptFields(requestData.revisesReceipt),
  };

  if (status.statusCode === "REJECT") {
    // Kept as long as the filing state, so the filings list shows the rejection and its reasons. The
    // never-received rejection also keeps the fields the request was sent with, for a later status.
    const pendingRequest = isNeverReceived(status) ? { pendingRequest: requestData } : {};
    await putAsyncRequest(
      userSub,
      submissionNumber,
      "failed",
      { ...status, kind, ...jointFiling, ...pendingRequest },
      asyncRequestsTableName,
      FILING_STATE_RETENTION,
    );
    return status;
  }

  // The accounts document is kept with the receipt so the customer's copy shows what was filed.
  const filedDocument = requestData.filedDocument;
  const receipt = filedDocument
    ? { ...status, kind: ACCOUNTS_RECEIPT_KIND, filedDocument, ...jointFiling, ...formRequestFields(requestData.formRequest) }
    : { ...status, ...jointFiling };
  // Every step before the "completed" put is safe to repeat: the receipt is found by its submission
  // number, the email and the token charge run only when the receipt does not show them done, and a
  // fee already marked used stays used. The event after the put runs once, because a stored
  // "completed" ends every later poll of this filing.
  const storedReceipt = await recordFiledReceiptForSubmission({
    userSub,
    submissionNumber,
    sentAt: persistedRequest.createdAt,
    receipt,
    actor: resolveActorClass(),
    clientId: requestData.clientId,
    receiptKind: kind,
    synthetic: isGatewayTest(),
    language: requestData.language,
  });
  const { receiptId } = storedReceipt;
  const feeCharge = requestData.feeCharge;
  if (feeCharge) await markChargeUsed(userSub, feeCharge.activityId, feeCharge.subjectKey);
  // Each accepted filing costs its own token, alone or as half of a pair; the pair costs two.
  // The charge is recorded before it runs, so a stop or a failed write can miss a token but never
  // charge a second one. A charge that could not run is unrecorded again and the record fails, so
  // the next poll charges it.
  if (requestData.chargeActivityId && !storedReceipt.tokenChargedAt) {
    const chargeRecordedAt = await markReceiptStepDone(storedReceipt.hashedSub, receiptId, "tokenChargedAt");
    if (chargeRecordedAt) {
      const charge = await chargeTokenOnSuccess(userSub, requestData.chargeActivityId);
      if (charge?.reason === "charge_error") {
        logger.warn({ message: "Companies House token charge could not run; the next poll charges it", submissionNumber, receiptId });
        await clearReceiptStep(storedReceipt.hashedSub, receiptId, "tokenChargedAt", chargeRecordedAt);
        throw new Error(`Token charge for submission ${submissionNumber} could not run`);
      }
    }
  }
  const data = { ...status, ...jointFiling, receiptId };
  await putAsyncRequest(userSub, submissionNumber, "completed", { ...data, kind }, asyncRequestsTableName, FILING_STATE_RETENTION);
  const { acceptedEvent, acceptedSummary } = FORM_KINDS[kind];
  await publishActivityEvent({ event: acceptedEvent, summary: acceptedSummary, userSub });
  return data;
}
