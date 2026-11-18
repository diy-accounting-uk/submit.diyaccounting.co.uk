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
  redactPresenterCredentials,
} from "./companiesHouseXmlGateway.js";
import { putAsyncRequest, getAsyncRequest } from "../data/dynamoDbAsyncRequestRepository.js";
import { FILING_STATE_RETENTION, claimFinalStatus, releaseFinalStatus } from "../data/dynamoDbCompaniesHouseFilingStateRepository.js";
import { recordFiledReceipt } from "./filedReceipt.js";
import { publishActivityEvent, resolveActorClass } from "../lib/activityAlert.js";
import { jointFilingFields, amendedFields, formRequestFields } from "./jointFiling.js";
import { chargeTokenOnSuccess } from "./tokenEnforcement.js";

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
export async function pollSubmission({ userSub, submissionNumber, govTestScenario, ownPresenter, kind }) {
  const asyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  const persistedRequest = await getAsyncRequest(userSub, submissionNumber, asyncRequestsTableName);

  if (!persistedRequest) {
    logger.warn({ message: "Companies House status poll for a submission this user did not make", submissionNumber });
    return { notFound: true, submissionNumber };
  }

  if (persistedRequest.status === "completed" || persistedRequest.status === "failed") {
    return { data: persistedRequest.data };
  }

  const { presenterId, presenterCode } = ownPresenter ?? (await resolvePresenterCredentials());
  const statusRequestXml = buildStatusRequest({ presenterId, presenterCode, submissionNumber, gatewayTest: isGatewayTest() });
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
  const { data } = await recordSubmissionStatus({ userSub, submissionNumber, persistedRequest, status, kind });
  return { data };
}

/**
 * Record a submission's status once Companies House has decided it. REJECT stores "failed" with
 * the reject reasons; ACCEPT writes a receipt (which asks for the receipt email), stores
 * "completed", publishes the form's accepted event and charges its token. PENDING and PARKED
 * change nothing. Only the first caller to claim a final status records it.
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
    logger.info({ message: "Companies House final status already recorded", submissionNumber, statusCode: status.statusCode });
    return { data: status, recorded: false };
  }
  try {
    return { data: await writeFinalStatus({ userSub, submissionNumber, persistedRequest, status, kind }), recorded: true };
  } catch (error) {
    await releaseFinalStatus(submissionNumber);
    throw error;
  }
}

async function writeFinalStatus({ userSub, submissionNumber, persistedRequest, status, kind }) {
  const asyncRequestsTableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  const jointFiling = {
    ...jointFilingFields(persistedRequest.data?.jointFilingId),
    ...amendedFields(persistedRequest.data?.amended === true),
  };

  if (status.statusCode === "REJECT") {
    // Kept as long as the filing state, so the filings list shows the rejection and its reasons.
    await putAsyncRequest(
      userSub,
      submissionNumber,
      "failed",
      { ...status, kind, ...jointFiling },
      asyncRequestsTableName,
      FILING_STATE_RETENTION,
    );
    return status;
  }

  const receiptId = `${new Date().toISOString()}-${submissionNumber}`;
  // The accounts document is kept with the receipt so the customer's copy shows what was filed.
  const filedDocument = persistedRequest.data?.filedDocument;
  const receipt = filedDocument
    ? { ...status, kind: ACCOUNTS_RECEIPT_KIND, filedDocument, ...jointFiling, ...formRequestFields(persistedRequest.data?.formRequest) }
    : { ...status, ...jointFiling };
  await recordFiledReceipt({
    userSub,
    receiptId,
    receipt,
    actor: resolveActorClass(),
    receiptKind: kind,
    synthetic: isGatewayTest(),
    language: persistedRequest.data?.language,
  });
  const data = { ...status, ...jointFiling, receiptId };
  await putAsyncRequest(userSub, submissionNumber, "completed", { ...data, kind }, asyncRequestsTableName);
  const { acceptedEvent, acceptedSummary } = FORM_KINDS[kind];
  await publishActivityEvent({ event: acceptedEvent, summary: acceptedSummary, userSub });
  // Each accepted filing costs its own token, alone or as half of a pair; the pair costs two.
  if (persistedRequest.data?.chargeActivityId) await chargeTokenOnSuccess(userSub, persistedRequest.data.chargeActivityId);
  return data;
}
