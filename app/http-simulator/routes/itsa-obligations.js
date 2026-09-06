// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/itsa-obligations.js
// HMRC ITSA Obligations endpoint
// Handles: GET /obligations/details/{nino}/income-and-expenditure

import { randomUUID } from "crypto";
import { getItsaObligationsForScenario } from "../scenarios/itsa-obligations.js";

/**
 * Validate National Insurance number format (two letters, six digits, one suffix letter).
 * Matches app/lib/hmrcValidation.js#isValidNino without importing across the app/simulator
 * boundary - the simulator is deliberately standalone from the app it's simulating for.
 */
function isValidNino(nino) {
  const normalized = String(nino).replace(/\s+/g, "").toUpperCase();
  return /^(?!BG|GB|NK|KN|TN|NT|ZZ)[ABCEGHJ-PRSTW-Z][ABCEGHJ-NPRSTW-Z]\d{6}[A-D]$/.test(normalized);
}

export function apiEndpoint(app) {
  // GET /obligations/details/{nino}/income-and-expenditure
  app.get("/obligations/details/:nino/income-and-expenditure", (req, res) => {
    const { nino } = req.params;
    const { status } = req.query;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:itsa-obligations] GET /obligations/details/${nino}/income-and-expenditure`);

    if (!isValidNino(nino)) {
      return res.status(400).json({
        code: "FORMAT_NINO",
        message: "The provided NINO is invalid",
      });
    }

    const result = getItsaObligationsForScenario(govTestScenario);

    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    let obligations = result.obligations;
    if (status) {
      obligations = obligations
        .map((business) => ({
          ...business,
          obligationDetails: business.obligationDetails.filter((detail) => detail.status === status),
        }))
        .filter((business) => business.obligationDetails.length > 0);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json({ obligations });
  });
}
