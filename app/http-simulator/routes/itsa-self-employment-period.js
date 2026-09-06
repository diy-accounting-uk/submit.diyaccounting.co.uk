// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/itsa-self-employment-period.js
// HMRC Self Employment Business endpoint
// Handles: POST /individuals/business/self-employment/{nino}/{businessId}/period

import { getSelfEmploymentPeriodErrorForScenario } from "../scenarios/itsa-self-employment-period.js";

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

export function apiEndpoint(app) {
  // POST /individuals/business/self-employment/{nino}/{businessId}/period
  app.post("/individuals/business/self-employment/:nino/:businessId/period", (req, res) => {
    const { nino, businessId } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:itsa-self-employment-period] POST /individuals/business/self-employment/${nino}/${businessId}/period`);

    if (!isValidNino(nino)) {
      return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    }
    if (!isValidBusinessId(businessId)) {
      return res.status(400).json({ code: "FORMAT_BUSINESS_ID", message: "The provided businessId is invalid" });
    }

    const periodDates = req.body?.periodDates;
    if (!periodDates?.periodStartDate || !periodDates?.periodEndDate) {
      return res.status(400).json({
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
      });
    }

    const scenarioError = getSelfEmploymentPeriodErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: perform a real create. The simulator has no per-user mutable
    // state to track across requests, so STATEFUL behaves the same as the default.
    const periodId = `${periodDates.periodStartDate}_${periodDates.periodEndDate}`;

    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ periodId });
  });
}
