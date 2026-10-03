// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/hmrc/hmrcItsaAssistAcknowledgePost.js
// Tells HMRC the Self Assessment Assist report was displayed and records the time on the stored report.

import { isValidNino } from "../../lib/hmrcValidation.js";
import { itsaAssist } from "../../lib/hmrcAssistApi.js";
import { createAssistHandlers, postHmrcAssist, hmrcBaseUriFor } from "../../lib/hmrcAssistHandler.js";
import { acknowledgeReceipt } from "../../lib/hmrcAssistReceipt.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

function validateBody(body, errorMessages) {
  const { nino, reportId, correlationId, receiptId } = body;
  if (!nino) errorMessages.push("Missing nino parameter from body");
  if (nino && !isValidNino(nino)) errorMessages.push("Invalid nino format");
  if (!reportId) errorMessages.push("Missing reportId parameter from body");
  if (!correlationId) errorMessages.push("Missing correlationId parameter from body");
  if (!receiptId) errorMessages.push("Missing receiptId parameter from body");
  return { nino, reportId, correlationId, receiptId };
}

async function call(params, requestContext) {
  const { nino, reportId, correlationId, receiptId } = params;
  const url = itsaAssist.acknowledgeUrl(hmrcBaseUriFor(requestContext.hmrcAccount), { nino, reportId, correlationId });
  const { hmrcResponse, hmrcResponseBody } = await postHmrcAssist({ url, body: undefined, acceptVersion: "1.0", context: requestContext });

  if (!hmrcResponse.ok) return { hmrcResponse, hmrcResponseBody, data: null };

  await acknowledgeReceipt(requestContext.userSub, receiptId);
  await publishActivityEvent({
    event: "itsa-assist-report-acknowledged",
    summary: "Self Assessment Assist report acknowledged",
    userSub: requestContext.userSub,
  });
  return { hmrcResponse, hmrcResponseBody, data: { statusCode: 204 } };
}

export const { apiEndpoint, extractAndValidateParameters, ingestHandler, workerHandler } = createAssistHandlers({
  sourceName: "app/functions/hmrc/hmrcItsaAssistAcknowledgePost.js",
  route: "/api/v1/hmrc/itsa/assist/acknowledge",
  asyncTableEnvName: "HMRC_ITSA_ASSIST_ACKNOWLEDGE_POST_ASYNC_REQUESTS_TABLE_NAME",
  operationName: "Self Assessment Assist acknowledge",
  validateBody,
  call,
});
