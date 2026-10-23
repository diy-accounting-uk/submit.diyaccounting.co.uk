// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/vat-assist.js
// HMRC VAT Assist (MTD) 1.0 endpoints (mtd-transaction-risking)
// Handles: POST /organisations/vat-assist/feedback/{vrn}
//          POST /organisations/vat-assist/acknowledge/{vrn}/{reportId}/{correlationId}?presentedDateTime=

import { randomUUID, randomBytes } from "crypto";
import { storeAssistReport, getAssistReport } from "../state/store.js";
import { vatFeedbackLists, getVatFeedbackScenarioResponse, getVatAcknowledgeScenarioResponse, vatErrors } from "../scenarios/assist.js";

const REQUIRED_FIELDS = [
  "periodKey",
  "vatDueSales",
  "vatDueAcquisitions",
  "totalVatDue",
  "vatReclaimedCurrPeriod",
  "netVatDue",
  "totalValueSalesExVAT",
  "totalValuePurchasesExVAT",
  "totalValueGoodsSuppliedExVAT",
  "totalAcquisitionsExVAT",
];

function isValidVrn(vrn) {
  return /^\d{9}$/.test(vrn);
}

function isValidPeriodKey(periodKey) {
  return typeof periodKey === "string" && /^[#0-9A-Z]{4}$/.test(periodKey);
}

function isValidReportId(reportId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId);
}

function isValidPresentedDateTime(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function sendError(res, error) {
  return res.status(error.status).json(error.body);
}

export function apiEndpoint(app) {
  app.post("/organisations/vat-assist/feedback/:vrn", (req, res) => {
    const { vrn } = req.params;
    console.log(`[http-simulator:vat-assist] POST /organisations/vat-assist/feedback/${vrn}`);

    if (!isValidVrn(vrn)) return sendError(res, vatErrors.VRN_INVALID);

    res.setHeader("X-CorrelationId", randomUUID());

    const scenarioResponse = getVatFeedbackScenarioResponse(req.headers["gov-test-scenario"]);
    if (scenarioResponse && !scenarioResponse.feedback) return sendError(res, scenarioResponse);

    const body = req.body || {};
    for (const field of REQUIRED_FIELDS) {
      if (body[field] === undefined || body[field] === null) return sendError(res, vatErrors.INVALID_REQUEST);
    }
    if (!isValidPeriodKey(body.periodKey)) return sendError(res, vatErrors.PERIOD_KEY_INVALID);

    const reportId = randomUUID();
    if (scenarioResponse?.feedback === "none") {
      return res.status(200).json({ reportId, ...vatFeedbackLists("none") });
    }

    const correlationId = randomBytes(32).toString("hex").toUpperCase();
    storeAssistReport(reportId, { vrn, periodKey: body.periodKey, correlationId });
    res.status(200).json({ reportId, correlationId, ...vatFeedbackLists(scenarioResponse?.feedback ?? "default") });
  });

  app.post("/organisations/vat-assist/acknowledge/:vrn/:reportId/:correlationId", (req, res) => {
    const { vrn, reportId, correlationId } = req.params;
    console.log(`[http-simulator:vat-assist] POST /organisations/vat-assist/acknowledge/${vrn}/${reportId}/${correlationId}`);

    if (!isValidVrn(vrn)) return sendError(res, vatErrors.VRN_INVALID);
    if (!isValidReportId(reportId)) return sendError(res, vatErrors.FORMAT_REPORT_ID);
    if (!isValidPresentedDateTime(req.query.presentedDateTime)) return sendError(res, vatErrors.FORMAT_DATETIME);

    res.setHeader("X-CorrelationId", randomUUID());

    const scenarioResponse = getVatAcknowledgeScenarioResponse(req.headers["gov-test-scenario"]);
    if (scenarioResponse) return sendError(res, scenarioResponse);

    const issued = getAssistReport(reportId);
    if (!issued || issued.vrn !== vrn) return sendError(res, vatErrors.NOT_FOUND);
    if (issued.correlationId !== correlationId) return sendError(res, vatErrors.CORRELATION_ID);
    res.status(204).end();
  });
}
