// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/hmrc/hmrcVatAssistReportPost.js
// Requests HMRC Assist feedback for a draft VAT return and keeps the report as a receipt.

import {
  isValidVrn,
  isValidPeriodKey,
  isValidVatMonetaryAmount,
  isValidNetVatDue,
  isValidVatWholeAmount,
} from "../../lib/hmrcValidation.js";
import { vatAssist, VAT_BOX_FIELDS } from "../../lib/hmrcAssistApi.js";
import { createAssistHandlers, postHmrcAssist, hmrcBaseUriFor } from "../../lib/hmrcAssistHandler.js";
import { putReceipt } from "../../data/dynamoDbReceiptRepository.js";
import { publishActivityEvent, resolveActorClass } from "../../lib/activityAlert.js";

const BOX_VALIDATORS = {
  vatDueSales: isValidVatMonetaryAmount,
  vatDueAcquisitions: isValidVatMonetaryAmount,
  totalVatDue: isValidVatMonetaryAmount,
  vatReclaimedCurrPeriod: isValidVatMonetaryAmount,
  netVatDue: isValidNetVatDue,
  totalValueSalesExVAT: isValidVatWholeAmount,
  totalValuePurchasesExVAT: isValidVatWholeAmount,
  totalValueGoodsSuppliedExVAT: isValidVatWholeAmount,
  totalAcquisitionsExVAT: isValidVatWholeAmount,
};

function validateBody(body, errorMessages) {
  const { vrn, periodKey } = body;
  if (!vrn) errorMessages.push("Missing vrn parameter from body");
  if (vrn && !isValidVrn(vrn)) errorMessages.push("Invalid vrn format - must be 9 digits");
  if (!periodKey) errorMessages.push("Missing periodKey parameter from body");
  if (periodKey && !isValidPeriodKey(periodKey)) errorMessages.push("Invalid periodKey format");

  const figures = {};
  for (const field of VAT_BOX_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null) {
      errorMessages.push(`Missing ${field} parameter from body`);
    } else if (!BOX_VALIDATORS[field](value)) {
      errorMessages.push(`Invalid ${field}`);
    }
    figures[field] = value;
  }
  return { vrn, periodKey, figures };
}

async function call(params, requestContext) {
  const { vrn, periodKey, figures } = params;
  const url = vatAssist.reportUrl(hmrcBaseUriFor(requestContext.hmrcAccount), { vrn });
  const body = vatAssist.reportBody({ periodKey }, figures);
  const { hmrcResponse, hmrcResponseBody } = await postHmrcAssist({ url, body, acceptVersion: "1.0", context: requestContext });

  if (!hmrcResponse.ok) return { hmrcResponse, hmrcResponseBody, data: null };
  if (hmrcResponse.status === 204) return { hmrcResponse, hmrcResponseBody, data: { statusCode: 204 } };

  const report = vatAssist.normaliseReport(hmrcResponseBody);
  const requestedAt = new Date().toISOString();
  const receiptId = `${requestedAt}-${report.reportId}`;
  await putReceipt(
    requestContext.userSub,
    receiptId,
    {
      kind: "vat-assist-report",
      reportId: report.reportId,
      correlationId: report.correlationId,
      messages: report.messages,
      figures,
      periodKey,
      vrn,
      requestedAt,
    },
    resolveActorClass(),
  );
  await publishActivityEvent({
    event: "vat-assist-report-requested",
    summary: "VAT Assist report requested",
    userSub: requestContext.userSub,
    detail: { messageCount: report.messages.length },
  });
  return { hmrcResponse, hmrcResponseBody, data: { ...report, vrn, periodKey, receiptId } };
}

export const { apiEndpoint, extractAndValidateParameters, ingestHandler, workerHandler } = createAssistHandlers({
  sourceName: "app/functions/hmrc/hmrcVatAssistReportPost.js",
  route: "/api/v1/hmrc/vat/assist/report",
  asyncTableEnvName: "HMRC_VAT_ASSIST_REPORT_POST_ASYNC_REQUESTS_TABLE_NAME",
  operationName: "VAT Assist report",
  validateBody,
  call,
});
