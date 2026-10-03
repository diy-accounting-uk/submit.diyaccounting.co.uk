// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/hmrc/hmrcItsaAssistReportPost.js
// Requests a Self Assessment Assist report for a calculation and keeps it as a receipt.

import { isValidNino, isValidTaxYear } from "../../lib/hmrcValidation.js";
import { itsaAssist } from "../../lib/hmrcAssistApi.js";
import { createAssistHandlers, postHmrcAssist, hmrcBaseUriFor } from "../../lib/hmrcAssistHandler.js";
import { putReceipt } from "../../data/dynamoDbReceiptRepository.js";
import { publishActivityEvent, resolveActorClass } from "../../lib/activityAlert.js";

const CALCULATION_ID_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateBody(body, errorMessages) {
  const { nino, taxYear, calculationId } = body;
  if (!nino) errorMessages.push("Missing nino parameter from body");
  if (nino && !isValidNino(nino)) errorMessages.push("Invalid nino format");
  if (!taxYear) errorMessages.push("Missing taxYear parameter from body");
  if (taxYear && !isValidTaxYear(taxYear)) errorMessages.push("Invalid taxYear format - must be YYYY-YY");
  if (!calculationId) errorMessages.push("Missing calculationId parameter from body");
  if (calculationId && !CALCULATION_ID_UUID_PATTERN.test(calculationId)) errorMessages.push("Invalid calculationId format");
  return { nino, taxYear, calculationId };
}

async function call(params, requestContext) {
  const { nino, taxYear, calculationId } = params;
  const url = itsaAssist.reportUrl(hmrcBaseUriFor(requestContext.hmrcAccount), params);
  const { hmrcResponse, hmrcResponseBody } = await postHmrcAssist({
    url,
    body: itsaAssist.reportBody(),
    acceptVersion: "1.0",
    context: requestContext,
  });

  if (!hmrcResponse.ok) return { hmrcResponse, hmrcResponseBody, data: null };
  if (hmrcResponse.status === 204) return { hmrcResponse, hmrcResponseBody, data: { statusCode: 204 } };

  const report = itsaAssist.normaliseReport(hmrcResponseBody);
  const requestedAt = new Date().toISOString();
  const receiptId = `${requestedAt}-${report.reportId}`;
  await putReceipt(
    requestContext.userSub,
    receiptId,
    {
      kind: "itsa-assist-report",
      reportId: report.reportId,
      correlationId: report.correlationId,
      messages: report.messages,
      nino,
      taxYear,
      calculationId,
      requestedAt,
    },
    resolveActorClass(),
  );
  await publishActivityEvent({
    event: "itsa-assist-report-requested",
    summary: "Self Assessment Assist report requested",
    userSub: requestContext.userSub,
    detail: { messageCount: report.messages.length },
  });
  return { hmrcResponse, hmrcResponseBody, data: { ...report, nino, taxYear, calculationId, receiptId } };
}

export const { apiEndpoint, extractAndValidateParameters, ingestHandler, workerHandler } = createAssistHandlers({
  sourceName: "app/functions/hmrc/hmrcItsaAssistReportPost.js",
  route: "/api/v1/hmrc/itsa/assist/report",
  asyncTableEnvName: "HMRC_ITSA_ASSIST_REPORT_POST_ASYNC_REQUESTS_TABLE_NAME",
  operationName: "Self Assessment Assist report",
  activityId: "self-employed",
  validateBody,
  call,
});
