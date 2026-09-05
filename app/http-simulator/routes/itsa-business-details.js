// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/itsa-business-details.js
// HMRC ITSA Business Details endpoint
// Handles: GET /individuals/business/details/{nino}/list

import { randomUUID } from "crypto";
import { getBusinessDetailsForScenario } from "../scenarios/business-details.js";

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
  // GET /individuals/business/details/{nino}/list
  app.get("/individuals/business/details/:nino/list", (req, res) => {
    const { nino } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:itsa-business-details] GET /individuals/business/details/${nino}/list`);

    if (!isValidNino(nino)) {
      return res.status(400).json({
        code: "FORMAT_NINO",
        message: "The provided NINO is invalid",
      });
    }

    const result = getBusinessDetailsForScenario(govTestScenario);

    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json({ listOfBusinesses: result.listOfBusinesses });
  });
}
