// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-status.js
// HMRC ITSA status endpoint (Self Assessment Individual Details)
// Handles: GET /individuals/person/itsa-status/{nino}/{taxYear}

import { randomUUID } from "crypto";
import { getItsaStatusForScenario } from "../scenarios/itsa-status.js";

/**
 * Validate National Insurance number format (two letters, six digits, one suffix letter).
 * Matches app/lib/hmrcValidation.js#isValidNino without importing across the app/simulator
 * boundary - the simulator is deliberately standalone from the app it's simulating for.
 */
function isValidNino(nino) {
  const normalized = String(nino).replace(/\s+/g, "").toUpperCase();
  return /^(?!BG|GB|NK|KN|TN|NT|ZZ)[ABCEGHJ-PRSTW-Z][ABCEGHJ-NPRSTW-Z]\d{6}[A-D]$/.test(normalized);
}

const TAX_YEAR_PATTERN = /^\d{4}-\d{2}$/;

export function apiEndpoint(app) {
  // GET /individuals/person/itsa-status/{nino}/{taxYear}
  app.get("/individuals/person/itsa-status/:nino/:taxYear", (req, res) => {
    const { nino, taxYear } = req.params;
    const { futureYears } = req.query;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:itsa-status] GET /individuals/person/itsa-status/${nino}/${taxYear}`);

    if (!isValidNino(nino)) {
      return res.status(400).json({
        code: "FORMAT_NINO",
        message: "The provided NINO is invalid",
      });
    }

    if (!TAX_YEAR_PATTERN.test(taxYear)) {
      return res.status(400).json({
        code: "FORMAT_TAX_YEAR",
        message: "The taxYear format is invalid",
      });
    }

    const result = getItsaStatusForScenario(govTestScenario, taxYear, futureYears === "true");

    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json({ itsaStatuses: result.itsaStatuses });
  });
}
