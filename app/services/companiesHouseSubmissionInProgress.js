// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseSubmissionInProgress.js
// What a submit Lambda records before it posts a Companies House envelope, so the outcome can be
// recorded after the reader has left the page.

import { putAsyncRequest } from "../data/dynamoDbAsyncRequestRepository.js";
import { FILING_STATE_RETENTION } from "../data/dynamoDbCompaniesHouseFilingStateRepository.js";
import { putPendingFiling } from "../data/dynamoDbCompaniesHousePendingFilerRepository.js";

/**
 * Record a submission before its envelope goes to the gateway: the filer's pending request, kept
 * as long as Companies House may take to decide it, and, for a filing under our presenter, the
 * filing state the presenter poll finds the filer from. A filing under the customer's own presenter
 * is answered only to that presenter, so the page poll alone can record its outcome.
 *
 * @param {object} input
 * @param {string} input.userSub
 * @param {string} input.submissionNumber
 * @param {string} input.kind - a key of FORM_KINDS in companiesHouseSubmissionStatus.js
 * @param {object} [input.data] - the fields the final status is recorded from (filed document, charge, language)
 * @param {boolean} input.underOwnPresenter
 */
export async function recordSubmissionInProgress({ userSub, submissionNumber, kind, data = {}, underOwnPresenter }) {
  await putAsyncRequest(
    userSub,
    submissionNumber,
    "pending",
    { ...data, kind },
    process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME,
    FILING_STATE_RETENTION,
  );
  if (!underOwnPresenter) await putPendingFiling({ submissionNumber, userSub, kind });
}
