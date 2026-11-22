// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseSubmissionPollAnswer.js
// The answer every Companies House status route gives for one poll of a submission: the status,
// 404 for a submission the caller did not make, and a JSON 500 both when the gateway answers with
// errors and when the poll could not be made at all.

import { createLogger } from "../lib/logger.js";
import { http200OkResponse, http404NotFoundResponse, http500ServerErrorResponse } from "../lib/httpResponseHelper.js";
import { pollSubmission } from "./companiesHouseSubmissionStatus.js";

const logger = createLogger({ source: "app/services/companiesHouseSubmissionPollAnswer.js" });

/**
 * Poll one submission and answer the request.
 * @param {object} input
 * @param {object} input.request - the request, as extractRequest gives it
 * @param {object} input.responseHeaders
 * @param {object} input.poll - pollSubmission's input: userSub, submissionNumber, govTestScenario, ownPresenter, kind
 * @returns {Promise<object>} the Lambda response
 */
export async function answerSubmissionPoll({ request, responseHeaders, poll }) {
  const { submissionNumber } = poll;
  let result;
  try {
    result = await pollSubmission(poll);
  } catch (error) {
    logger.error({ message: "Companies House status poll could not be made", submissionNumber, error: error.message, stack: error.stack });
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "The status of this submission could not be read from Companies House",
      error: { submissionNumber, detail: error.message },
    });
  }
  if (result.notFound) {
    return http404NotFoundResponse({ request, headers: { ...responseHeaders }, message: "Submission not found" });
  }
  if (result.errors) {
    return http500ServerErrorResponse({
      request,
      headers: { ...responseHeaders },
      message: "Companies House gateway returned an error while polling this submission",
      error: { submissionNumber, errors: result.errors },
    });
  }
  return http200OkResponse({ request, headers: { ...responseHeaders }, data: result.data });
}
