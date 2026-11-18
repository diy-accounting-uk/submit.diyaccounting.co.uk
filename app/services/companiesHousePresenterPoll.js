// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHousePresenterPoll.js
// The scheduled presenter poll: GetSubmissionStatus with PresenterID alone (TIS v5.3 option 2),
// each final status recorded with the page poll's code, then GetStatusAck.

import { createLogger } from "../lib/logger.js";
import {
  buildStatusRequest,
  buildStatusAckRequest,
  resolvePresenterCredentials,
  postToGateway,
  parseGatewayResponse,
  redactPresenterCredentials,
} from "./companiesHouseXmlGateway.js";
import { getAsyncRequest } from "../data/dynamoDbAsyncRequestRepository.js";
import { claimPresenterPollSlot, deferPresenterPoll } from "../data/dynamoDbCompaniesHouseFilingStateRepository.js";
import { getPendingFiling } from "../data/dynamoDbCompaniesHousePendingFilerRepository.js";
import { FORM_KINDS, recordSubmissionStatus, isGatewayTest } from "./companiesHouseSubmissionStatus.js";

// The presenter poll runs on a schedule shared by every deployment of an environment. It never
// polls more often than this, or than the PollInterval the gateway last sent, whichever is longer.
export const MINIMUM_PRESENTER_POLL_SECONDS = 600;

const NO_TRANSACTION_FOUND = "No Transaction Found";

const logger = createLogger({ source: "app/services/companiesHousePresenterPoll.js" });

async function recordPresenterStatus(status) {
  const { submissionNumber, statusCode } = status;
  const filing = await getPendingFiling(submissionNumber);
  if (!filing?.userSub || !FORM_KINDS[filing.kind]) {
    // Filed under this presenter by something other than this environment's submit Lambdas.
    logger.info({ message: "Companies House status for a submission this environment did not record", submissionNumber, statusCode });
    return { submissionNumber, statusCode, outcome: "not-ours" };
  }
  if (filing.claimed) {
    return { submissionNumber, statusCode, outcome: "already-recorded" };
  }
  if (statusCode !== "ACCEPT" && statusCode !== "REJECT") {
    logger.error({ message: "Companies House presenter poll returned a status that is not final", submissionNumber, statusCode });
    return { submissionNumber, statusCode, outcome: "not-final" };
  }
  const persistedRequest = await getAsyncRequest(
    filing.userSub,
    submissionNumber,
    process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME,
  );
  if (!persistedRequest) {
    logger.error({ message: "Companies House filing has no request item to record its status against", submissionNumber, statusCode });
    return { submissionNumber, statusCode, outcome: "no-request" };
  }
  // A record that failed after its receipt was stored gave its claim back; the stored outcome says
  // it is recorded, as it does for the page poll.
  if (persistedRequest.status === "completed" || (persistedRequest.status === "failed" && persistedRequest.data?.statusCode === "REJECT")) {
    return { submissionNumber, statusCode, outcome: "already-recorded" };
  }
  const { recorded } = await recordSubmissionStatus({
    userSub: filing.userSub,
    submissionNumber,
    persistedRequest,
    status,
    kind: filing.kind,
  });
  return { submissionNumber, statusCode, outcome: recorded ? "recorded" : "already-recorded" };
}

/**
 * Ask the gateway for every submission of our presenter that Companies House has accepted or
 * rejected since the last acknowledged poll (GetSubmissionStatus option 2), record each against
 * its filing, then acknowledge the poll with GetStatusAck. The poll is skipped while the shared
 * poll slot is taken. The acknowledgement is held back when any record failed, so the gateway
 * answers the same submissions again on the next poll.
 *
 * @param {{now?: Date}} [input]
 * @returns {Promise<{polled: boolean, acknowledged?: boolean, errors?: Array, outcomes?: Array}>}
 */
export async function pollPresenterSubmissions({ now = new Date() } = {}) {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (!(await claimPresenterPollSlot({ nowSeconds, intervalSeconds: MINIMUM_PRESENTER_POLL_SECONDS }))) {
    logger.info({ message: "Companies House presenter poll skipped: the poll interval has not passed" });
    return { polled: false };
  }

  const gatewayTest = isGatewayTest();
  const { presenterId, presenterCode } = await resolvePresenterCredentials();
  const statusRequestXml = buildStatusRequest({ presenterId, presenterCode, gatewayTest });
  logger.info({
    message: "Companies House presenter GetSubmissionStatus request",
    requestXml: redactPresenterCredentials(statusRequestXml),
  });
  const gatewayResponse = await postToGateway(statusRequestXml);
  logger.info({
    message: "Companies House presenter GetSubmissionStatus response",
    status: gatewayResponse.status,
    responseXml: redactPresenterCredentials(gatewayResponse.data),
  });
  const parsed = parseGatewayResponse(gatewayResponse.data);

  if (parsed.pollInterval > MINIMUM_PRESENTER_POLL_SECONDS) {
    await deferPresenterPoll(nowSeconds + parsed.pollInterval);
  }

  const errors = parsed.errors.filter((error) => error.text !== NO_TRANSACTION_FOUND);
  if (errors.length) {
    logger.error({ message: "Companies House gateway returned errors for the presenter poll", errors });
    return { polled: true, acknowledged: false, errors };
  }

  // With nothing completed the gateway answers one blank Status element.
  const statuses = parsed.statuses.filter((status) => status.submissionNumber && status.statusCode);
  if (statuses.length === 0) {
    return { polled: true, acknowledged: false, outcomes: [] };
  }

  const outcomes = [];
  for (const status of statuses) {
    try {
      outcomes.push(await recordPresenterStatus(status));
    } catch (error) {
      logger.error({
        message: "Companies House presenter poll could not record a status",
        submissionNumber: status.submissionNumber,
        statusCode: status.statusCode,
        error: error.message,
      });
      outcomes.push({ submissionNumber: status.submissionNumber, statusCode: status.statusCode, outcome: "error" });
    }
  }
  if (outcomes.some(({ outcome }) => outcome === "error")) {
    return { polled: true, acknowledged: false, outcomes };
  }

  const statusAckXml = buildStatusAckRequest({ presenterId, presenterCode, gatewayTest });
  const ackResponse = await postToGateway(statusAckXml);
  const ackErrors = parseGatewayResponse(ackResponse.data).errors;
  if (ackErrors.length) {
    logger.error({ message: "Companies House gateway returned errors for the GetStatusAck", errors: ackErrors });
    return { polled: true, acknowledged: false, errors: ackErrors, outcomes };
  }
  logger.info({ message: "Companies House presenter poll recorded and acknowledged", outcomes });
  return { polled: true, acknowledged: true, outcomes };
}
