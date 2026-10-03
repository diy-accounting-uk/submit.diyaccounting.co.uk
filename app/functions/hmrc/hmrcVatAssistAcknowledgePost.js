// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/hmrc/hmrcVatAssistAcknowledgePost.js
// Tells HMRC the Assist feedback was displayed and records the time on the stored report.

import { isValidVrn } from "../../lib/hmrcValidation.js";
import { vatAssist } from "../../lib/hmrcAssistApi.js";
import { createAssistHandlers, postHmrcAssist, hmrcBaseUriFor } from "../../lib/hmrcAssistHandler.js";
import { acknowledgeReceipt } from "../../lib/hmrcAssistReceipt.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";

function validateBody(body, errorMessages) {
  const { vrn, reportId, correlationId, receiptId } = body;
  if (!vrn) errorMessages.push("Missing vrn parameter from body");
  if (vrn && !isValidVrn(vrn)) errorMessages.push("Invalid vrn format - must be 9 digits");
  if (!reportId) errorMessages.push("Missing reportId parameter from body");
  if (!correlationId) errorMessages.push("Missing correlationId parameter from body");
  if (!receiptId) errorMessages.push("Missing receiptId parameter from body");
  return { vrn, reportId, correlationId, receiptId };
}

async function call(params, requestContext) {
  const { vrn, reportId, correlationId, receiptId } = params;
  const url = vatAssist.acknowledgeUrl(hmrcBaseUriFor(requestContext.hmrcAccount), { vrn, reportId, correlationId });
  const { hmrcResponse, hmrcResponseBody } = await postHmrcAssist({ url, body: undefined, acceptVersion: "1.0", context: requestContext });

  if (!hmrcResponse.ok) return { hmrcResponse, hmrcResponseBody, data: null };

  await acknowledgeReceipt(requestContext.userSub, receiptId);
  await publishActivityEvent({
    event: "vat-assist-report-acknowledged",
    summary: "VAT Assist report acknowledged",
    userSub: requestContext.userSub,
  });
  return { hmrcResponse, hmrcResponseBody, data: { statusCode: 204 } };
}

export const { apiEndpoint, extractAndValidateParameters, ingestHandler, workerHandler } = createAssistHandlers({
  sourceName: "app/functions/hmrc/hmrcVatAssistAcknowledgePost.js",
  route: "/api/v1/hmrc/vat/assist/acknowledge",
  asyncTableEnvName: "HMRC_VAT_ASSIST_ACKNOWLEDGE_POST_ASYNC_REQUESTS_TABLE_NAME",
  operationName: "VAT Assist acknowledge",
  activityId: "vat-assist-check",
  validateBody,
  call,
});
