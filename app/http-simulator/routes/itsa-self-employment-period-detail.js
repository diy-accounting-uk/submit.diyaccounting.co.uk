// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/itsa-self-employment-period-detail.js
// HMRC Self Employment Business endpoint
// Handles: GET /individuals/business/self-employment/{nino}/{businessId}/period/{taxYear}/{periodId}

import { randomUUID } from "crypto";
import { getSelfEmploymentPeriodDetailForScenario } from "../scenarios/itsa-self-employment-period-detail.js";

/**
 * Validate National Insurance number format (two letters, six digits, one suffix letter).
 * Matches app/lib/hmrcValidation.js#isValidNino without importing across the app/simulator
 * boundary - the simulator is deliberately standalone from the app it's simulating for.
 */
function isValidNino(nino) {
  const normalized = String(nino).replace(/\s+/g, "").toUpperCase();
  return /^(?!BG|GB|NK|KN|TN|NT|ZZ)[ABCEGHJ-PRSTW-Z][ABCEGHJ-NPRSTW-Z]\d{6}[A-D]$/.test(normalized);
}

function isValidBusinessId(businessId) {
  return /^X[A-Za-z0-9]IS\d{11}$/.test(businessId);
}

function isValidTaxYear(taxYear) {
  return /^\d{4}-\d{2}$/.test(taxYear);
}

function validatePathParams(req, res) {
  const { nino, businessId, taxYear } = req.params;
  if (!isValidNino(nino)) {
    res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    return false;
  }
  if (!isValidBusinessId(businessId)) {
    res.status(400).json({ code: "FORMAT_BUSINESS_ID", message: "The provided businessId is invalid" });
    return false;
  }
  if (!isValidTaxYear(taxYear)) {
    res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The provided taxYear is invalid" });
    return false;
  }
  return true;
}

export function apiEndpoint(app) {
  // GET /individuals/business/self-employment/{nino}/{businessId}/period/{taxYear}/{periodId}
  app.get("/individuals/business/self-employment/:nino/:businessId/period/:taxYear/:periodId", (req, res) => {
    const { nino, businessId, taxYear, periodId } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-self-employment-period-detail] GET /individuals/business/self-employment/${nino}/${businessId}/period/${taxYear}/${periodId}`,
    );

    if (!validatePathParams(req, res)) return;

    const result = getSelfEmploymentPeriodDetailForScenario(govTestScenario, periodId);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json(result.periodSummary);
  });
}
