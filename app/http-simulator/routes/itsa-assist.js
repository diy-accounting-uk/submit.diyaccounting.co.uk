// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-assist.js
// HMRC Self Assessment Assist (MTD) 1.0 endpoints
// Handles: POST /individuals/self-assessment/assist/reports/{nino}/{taxYear}/{calculationId}
//          POST /individuals/self-assessment/assist/reports/acknowledge/{nino}/{reportId}/{correlationId}

import { randomUUID, randomBytes } from "crypto";
import { storeAssistReport, getAssistReport } from "../state/store.js";
import {
  itsaDefaultMessages,
  getReportScenarioResponse,
  getAcknowledgeScenarioResponse,
  acknowledgeErrors,
  ITSA_NO_MESSAGES_CALCULATION_ID,
  ITSA_NOT_FOUND_CALCULATION_ID,
} from "../scenarios/assist.js";

// Matches app/lib/hmrcValidation.js#isValidNino; the simulator stays standalone from the app.
function isValidNino(nino) {
  const normalized = String(nino).replace(/\s+/g, "").toUpperCase();
  return /^(?!BG|GB|NK|KN|TN|NT|ZZ)[ABCEGHJ-PRSTW-Z][ABCEGHJ-NPRSTW-Z]\d{6}[A-D]$/.test(normalized);
}

function isValidTaxYear(taxYear) {
  return /^\d{4}-\d{2}$/.test(taxYear);
}

function isValidCalculationId(calculationId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(calculationId);
}

function isValidReportId(reportId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId);
}

export function apiEndpoint(app) {
  app.post("/individuals/self-assessment/assist/reports/:nino/:taxYear/:calculationId", (req, res) => {
    const { nino, taxYear, calculationId } = req.params;
    console.log(`[http-simulator:itsa-assist] POST /individuals/self-assessment/assist/reports/${nino}/${taxYear}/${calculationId}`);

    if (!isValidNino(nino)) return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    if (!isValidCalculationId(calculationId)) {
      return res.status(400).json({ code: "FORMAT_CALC_ID", message: "The provided calculation id is invalid" });
    }
    if (!isValidTaxYear(taxYear)) {
      return res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The provided tax year is invalid" });
    }

    res.setHeader("X-CorrelationId", randomUUID());

    const scenarioResponse = getReportScenarioResponse(req.headers["gov-test-scenario"]);
    if (scenarioResponse) {
      return scenarioResponse.body
        ? res.status(scenarioResponse.status).json(scenarioResponse.body)
        : res.status(scenarioResponse.status).end();
    }
    if (calculationId === ITSA_NO_MESSAGES_CALCULATION_ID) return res.status(204).end();
    if (calculationId === ITSA_NOT_FOUND_CALCULATION_ID) {
      return res.status(404).json({ code: "MATCHING_CALCULATION_ID_NOT_FOUND", message: "No calculation matches the calculation id" });
    }

    const reportId = randomUUID();
    const correlationId = randomBytes(32).toString("hex");
    storeAssistReport(reportId, { nino, taxYear, calculationId, correlationId });

    res.status(200).json({ reportId, messages: itsaDefaultMessages(), nino, taxYear, calculationId, correlationId });
  });

  app.post("/individuals/self-assessment/assist/reports/acknowledge/:nino/:reportId/:correlationId", (req, res) => {
    const { nino, reportId, correlationId } = req.params;
    console.log(
      `[http-simulator:itsa-assist] POST /individuals/self-assessment/assist/reports/acknowledge/${nino}/${reportId}/${correlationId}`,
    );

    if (!isValidNino(nino)) return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    if (!isValidReportId(reportId)) {
      return res.status(400).json({ code: "FORMAT_REPORT_ID", message: "The provided report id is invalid" });
    }

    res.setHeader("X-CorrelationId", randomUUID());

    const scenarioResponse = getAcknowledgeScenarioResponse(req.headers["gov-test-scenario"]);
    if (scenarioResponse) return res.status(scenarioResponse.status).json(scenarioResponse.body);

    const issued = getAssistReport(reportId);
    if (!issued || issued.nino !== nino) {
      return res.status(acknowledgeErrors.NOT_FOUND.status).json(acknowledgeErrors.NOT_FOUND.body);
    }
    if (issued.correlationId !== correlationId) {
      return res.status(acknowledgeErrors.NOT_AUTHORISED.status).json(acknowledgeErrors.NOT_AUTHORISED.body);
    }
    res.status(204).end();
  });
}
