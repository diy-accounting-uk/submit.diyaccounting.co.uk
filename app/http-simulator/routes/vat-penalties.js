// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/vat-penalties.js
// HMRC VAT Penalties endpoint
// Handles: GET /organisations/vat/{vrn}/penalties

import { randomUUID } from "crypto";
import { getPenaltiesForScenario } from "../scenarios/penalties.js";

/**
 * Validate VAT registration number format (9 digits)
 */
function isValidVrn(vrn) {
  return /^\d{9}$/.test(vrn);
}

export function apiEndpoint(app) {
  // GET /organisations/vat/{vrn}/penalties - no from/to query params on this endpoint
  app.get("/organisations/vat/:vrn/penalties", (req, res) => {
    const { vrn } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:vat-penalties] GET /organisations/vat/${vrn}/penalties`);

    // Validate VAT registration number
    if (!isValidVrn(vrn)) {
      return res.status(400).json({
        code: "VRN_INVALID",
        message: "The provided VAT registration number is invalid",
      });
    }

    // Get penalties based on scenario
    const result = getPenaltiesForScenario(govTestScenario);

    // If it's an error response
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    // Set HMRC-like response headers
    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());

    // The whole result object is the response body - no wrapper key
    res.json(result);
  });
}
