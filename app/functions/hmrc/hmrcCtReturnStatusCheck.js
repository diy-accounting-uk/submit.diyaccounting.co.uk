// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-28 Ask HMRC for the answer to a Company Tax Return no page is waiting for
// - **Use when:** a CT600 sent to HMRC's Transaction Engine still waits for its final answer and no CT600 page or Check now asks for it.
// - **Does:** hmrcCtReturnStatusCheck.js runs every 15 minutes. It reads each pending return's marker with one Query on the hmrc-ct-pending partition of the Companies House async-requests table, opens the filer's sealed sub, and runs the page's poll (pollCtSubmission), which keeps to HMRC's poll interval and writes the receipt, the hmrc-ct-return-accepted event and the token charge. A return unanswered 30 days after it was sent is recorded with the status NO_ANSWER. The marker goes once the return has its final answer.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/hmrc/hmrcCtReturnStatusCheck.js:handler`; `app/services/hmrcCtPendingReturnCheck.js:checkPendingCtReturns`
// - **Files:** app/functions/hmrc/hmrcCtReturnStatusCheck.js, app/services/hmrcCtPendingReturnCheck.js, app/data/dynamoDbCtPendingReturnRepository.js, app/services/hmrcCtSubmissionStatus.js, app/unit-tests/functions/hmrcCtReturnStatusCheck.test.js, app/unit-tests/services/hmrcCtPendingReturnCheck.test.js, app/unit-tests/data/dynamoDbCtPendingReturnRepository.test.js
// - **Keywords:** company tax return, ct600, transaction engine, scheduled poll, pending return, no answer, scheduled lambda
// - **Related:** CH-21
// @end-capability

// app/functions/hmrc/hmrcCtReturnStatusCheck.js

import { createLogger } from "../../lib/logger.js";
import { validateEnv } from "../../lib/env.js";
import { initializeSalt } from "../../services/subHasher.js";
import { checkPendingCtReturns } from "../../services/hmrcCtPendingReturnCheck.js";

const logger = createLogger({ source: "app/functions/hmrc/hmrcCtReturnStatusCheck.js" });

export async function handler() {
  await initializeSalt();
  validateEnv(["RECEIPTS_DYNAMODB_TABLE_NAME", "COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME", "MCP_OAUTH_BLOB_KEY_SECRET_ARN"]);
  const result = await checkPendingCtReturns();
  logger.info({ message: "Scheduled Company Tax Return status check finished", ...result });
  return result;
}
