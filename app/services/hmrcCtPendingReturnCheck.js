// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/hmrcCtPendingReturnCheck.js
// The scheduled Company Tax Return status check: for every return that waits for HMRC's final
// answer, the page's own poll (pollCtSubmission) runs with the filer's sub, so the receipt, the
// accepted event and the token charge are written as the page writes them. The poll keeps to the
// interval HMRC named, and records "no answer from HMRC" once the return has waited 30 days.

import { createLogger, context } from "../lib/logger.js";
import {
  listPendingCtReturns,
  openPendingCtFiler,
  claimPendingCtCheck,
  deletePendingCtReturn,
} from "../data/dynamoDbCtPendingReturnRepository.js";
import { pollCtSubmission } from "./hmrcCtSubmissionStatus.js";

const logger = createLogger({ source: "app/services/hmrcCtPendingReturnCheck.js" });

// The schedule runs every 15 minutes. A return is checked at most once in 10 minutes, however many
// deployments of the environment run the schedule.
export const CT_PENDING_CHECK_SCHEDULE_MINUTES = 15;
export const CT_PENDING_CHECK_INTERVAL_SECONDS = 600;

async function checkPendingReturn(marker, now) {
  const { correlationId } = marker;
  context.set("hmrcCorrelationId", correlationId);
  if (!(await claimPendingCtCheck(correlationId, { now, intervalSeconds: CT_PENDING_CHECK_INTERVAL_SECONDS }))) {
    return { correlationId, outcome: "checked-recently" };
  }
  const userSub = await openPendingCtFiler(marker);
  const result = await pollCtSubmission({
    userSub,
    correlationId,
    noAnswerLeadSeconds: CT_PENDING_CHECK_SCHEDULE_MINUTES * 60,
  });
  if (result.notFound) {
    await deletePendingCtReturn(correlationId);
    return { correlationId, outcome: "not-held" };
  }
  const { statusCode } = result.data;
  if (statusCode === "PENDING") return { correlationId, outcome: "pending" };
  await deletePendingCtReturn(correlationId);
  return { correlationId, outcome: statusCode };
}

/**
 * Ask HMRC for the final answer of every Company Tax Return still waiting for one.
 * @param {{now?: Date}} [input]
 * @returns {Promise<{checked: number, outcomes: Array<{correlationId: string, outcome: string}>}>}
 */
export async function checkPendingCtReturns({ now = new Date() } = {}) {
  const markers = await listPendingCtReturns();
  const outcomes = [];
  for (const marker of markers) {
    try {
      outcomes.push(await checkPendingReturn(marker, now));
    } catch (error) {
      logger.error({
        message: "Scheduled Company Tax Return status check failed for one return; the next run tries again",
        hmrcCorrelationId: marker.correlationId,
        error: error.message,
      });
      outcomes.push({ correlationId: marker.correlationId, outcome: "error" });
    }
  }
  return { checked: markers.length, outcomes };
}
