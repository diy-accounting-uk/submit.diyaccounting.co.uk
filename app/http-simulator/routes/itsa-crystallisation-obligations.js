// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/itsa-crystallisation-obligations.js
// HMRC ITSA final declaration (crystallisation) obligations endpoint
// Handles: GET /obligations/details/{nino}/crystallisation

import { randomUUID } from "crypto";
import { getItsaCrystallisationObligationsForScenario } from "../scenarios/itsa-crystallisation-obligations.js";

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
  // GET /obligations/details/{nino}/crystallisation
  app.get("/obligations/details/:nino/crystallisation", (req, res) => {
    const { nino } = req.params;
    const { taxYear, status } = req.query;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:itsa-crystallisation-obligations] GET /obligations/details/${nino}/crystallisation`);

    if (!isValidNino(nino)) {
      return res.status(400).json({
        code: "FORMAT_NINO",
        message: "The provided NINO is invalid",
      });
    }

    const result = getItsaCrystallisationObligationsForScenario(govTestScenario, taxYear);

    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    let obligations = result.obligations;
    if (status) {
      obligations = obligations.filter((detail) => detail.status === status);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json({ obligations });
  });
}
