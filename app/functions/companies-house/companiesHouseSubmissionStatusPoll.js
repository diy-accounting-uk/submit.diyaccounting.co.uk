// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-21 Poll Companies House for filings the reader left pending
// - **Use when:** a Companies House filing under our presenter is still pending when the reader leaves the page, and its final accept or reject must reach the filings list and the receipt email.
// - **Does:** companiesHouseSubmissionStatusPoll.js runs on a schedule in office hours. It asks the XML Gateway for every submission of our presenter that Companies House has finished (GetSubmissionStatus with PresenterID alone), records each against its filing with the same code the page poll uses, then acknowledges the poll with GetStatusAck. One poll slot per environment keeps the rate at or under one poll per 10 minutes, or the gateway's PollInterval when that is longer.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/companies-house/companiesHouseSubmissionStatusPoll.js:handler`; `app/services/companiesHousePresenterPoll.js:pollPresenterSubmissions`
// - **Files:** app/functions/companies-house/companiesHouseSubmissionStatusPoll.js, app/services/companiesHousePresenterPoll.js, app/services/companiesHouseSubmissionStatus.js, app/services/companiesHouseSubmissionInProgress.js, app/data/dynamoDbCompaniesHouseFilingStateRepository.js, app/data/dynamoDbCompaniesHousePendingFilerRepository.js, app/unit-tests/functions/companiesHouseSubmissionStatusPoll.test.js, app/unit-tests/services/companiesHouseSubmissionStatus.test.js, app/unit-tests/data/dynamoDbCompaniesHouseFilingStateRepository.test.js, app/unit-tests/data/dynamoDbCompaniesHousePendingFilerRepository.test.js
// - **Keywords:** companies house, xml gateway, GetSubmissionStatus, GetStatusAck, StatusAck, presenter poll, pending filing, manual check, scheduled lambda
// - **Related:** SITE-28
// @end-capability

// app/functions/companies-house/companiesHouseSubmissionStatusPoll.js

import { createLogger } from "../../lib/logger.js";
import { validateEnv } from "../../lib/env.js";
import { initializeSalt } from "../../services/subHasher.js";
import { pollPresenterSubmissions } from "../../services/companiesHousePresenterPoll.js";

const logger = createLogger({ source: "app/functions/companies-house/companiesHouseSubmissionStatusPoll.js" });

export async function handler() {
  await initializeSalt();
  validateEnv(["COMPANIES_HOUSE_XMLGW_URI", "RECEIPTS_DYNAMODB_TABLE_NAME", "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME"]);
  const result = await pollPresenterSubmissions();
  logger.info({ message: "Companies House presenter poll finished", ...result });
  return result;
}
