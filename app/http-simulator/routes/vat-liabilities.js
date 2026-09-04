// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/vat-liabilities.js
// HMRC VAT Liabilities endpoint
// Handles: GET /organisations/vat/{vrn}/liabilities

import { randomUUID } from "crypto";
import { getLiabilitiesForScenario } from "../scenarios/liabilities.js";

/**
 * Validate VAT registration number format (9 digits)
 */
function isValidVrn(vrn) {
  return /^\d{9}$/.test(vrn);
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function isValidDate(dateStr) {
  if (!dateStr) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function sendLiabilitiesResponse(res, result) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("x-correlationid", randomUUID());

  res.json({ liabilities: result.liabilities });
}

export function apiEndpoint(app) {
  // GET /organisations/vat/{vrn}/liabilities
  app.get("/organisations/vat/:vrn/liabilities", (req, res) => {
    const { vrn } = req.params;
    const { from, to } = req.query;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:vat-liabilities] GET /organisations/vat/${vrn}/liabilities from=${from} to=${to}`);

    // Validate VAT registration number
    if (!isValidVrn(vrn)) {
      return res.status(400).json({
        code: "VRN_INVALID",
        message: "The provided VAT registration number is invalid",
      });
    }

    // Validate from date
    if (from && !isValidDate(from)) {
      return res.status(400).json({
        code: "DATE_FROM_INVALID",
        message: "The provided from date is invalid",
      });
    }

    // Validate to date
    if (to && !isValidDate(to)) {
      return res.status(400).json({
        code: "DATE_TO_INVALID",
        message: "The provided to date is invalid",
      });
    }

    // Get liabilities based on scenario
    const result = getLiabilitiesForScenario(govTestScenario);

    // If it's an error response
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    // Send response
    sendLiabilitiesResponse(res, result);
  });
}
