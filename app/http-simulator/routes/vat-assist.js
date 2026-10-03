// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/vat-assist.js
// HMRC VAT Assist endpoints (assumed contract, see app/lib/hmrcAssistApi.js)
// Handles: POST /organisations/vat/{vrn}/assist/reports
//          POST /organisations/vat/{vrn}/assist/reports/acknowledge/{reportId}/{correlationId}

import { randomUUID, randomBytes } from "crypto";
import { storeAssistReport, getAssistReport } from "../state/store.js";
import { vatDefaultMessages, getReportScenarioResponse, getAcknowledgeScenarioResponse, acknowledgeErrors } from "../scenarios/assist.js";

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

function formatVrnError(res) {
  return res.status(400).json({ code: "FORMAT_VRN", message: "The provided VAT registration number is invalid" });
}

export function apiEndpoint(app) {
  app.post("/organisations/vat/:vrn/assist/reports", (req, res) => {
    const { vrn } = req.params;
    console.log(`[http-simulator:vat-assist] POST /organisations/vat/${vrn}/assist/reports`);

    if (!isValidVrn(vrn)) return formatVrnError(res);

    res.setHeader("X-CorrelationId", randomUUID());

    const scenarioResponse = getReportScenarioResponse(req.headers["gov-test-scenario"]);
    if (scenarioResponse) {
      return scenarioResponse.body
        ? res.status(scenarioResponse.status).json(scenarioResponse.body)
        : res.status(scenarioResponse.status).end();
    }

    const body = req.body || {};
    for (const field of REQUIRED_FIELDS) {
      if (body[field] === undefined || body[field] === null) {
        return res.status(400).json({ code: "INVALID_REQUEST", message: `${field} is required` });
      }
    }

    const reportId = randomUUID();
    const correlationId = randomBytes(32).toString("hex");
    storeAssistReport(reportId, { vrn, periodKey: body.periodKey, correlationId });

    res.status(200).json({
      reportId,
      messages: vatDefaultMessages(vrn),
      vrn,
      periodKey: body.periodKey,
      correlationId,
    });
  });

  app.post("/organisations/vat/:vrn/assist/reports/acknowledge/:reportId/:correlationId", (req, res) => {
    const { vrn, reportId, correlationId } = req.params;
    console.log(`[http-simulator:vat-assist] POST /organisations/vat/${vrn}/assist/reports/acknowledge/${reportId}/${correlationId}`);

    if (!isValidVrn(vrn)) return formatVrnError(res);

    res.setHeader("X-CorrelationId", randomUUID());

    const scenarioResponse = getAcknowledgeScenarioResponse(req.headers["gov-test-scenario"]);
    if (scenarioResponse) return res.status(scenarioResponse.status).json(scenarioResponse.body);

    const issued = getAssistReport(reportId);
    if (!issued || issued.vrn !== vrn) {
      return res.status(acknowledgeErrors.NOT_FOUND.status).json(acknowledgeErrors.NOT_FOUND.body);
    }
    if (issued.correlationId !== correlationId) {
      return res.status(acknowledgeErrors.NOT_AUTHORISED.status).json(acknowledgeErrors.NOT_AUTHORISED.body);
    }
    res.status(204).end();
  });
}
