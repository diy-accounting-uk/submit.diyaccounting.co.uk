// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/vat-obligations.js
// HMRC VAT Obligations endpoint
// Handles: GET /organisations/vat/{vrn}/obligations

import { randomUUID } from "crypto";
import { getObligationsForScenario } from "../scenarios/obligations.js";

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

/**
 * Send obligations response (extracted for reuse with delayed scenarios)
 */
function sendObligationsResponse(res, result, statusFilter) {
  // Filter by status if provided
  let obligations = result.obligations;
  if (statusFilter) {
    obligations = obligations.filter((o) => o.status === statusFilter);
  }

  // Set HMRC-like response headers
  res.setHeader("Content-Type", "application/json");
  res.setHeader("x-correlationid", randomUUID());

  res.json({ obligations });
}

export function apiEndpoint(app) {
  // GET /organisations/vat/{vrn}/obligations
  app.get("/organisations/vat/:vrn/obligations", (req, res) => {
    const { vrn } = req.params;
    const { from, to, status } = req.query;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:vat-obligations] GET /organisations/vat/${vrn}/obligations from=${from} to=${to}`);

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
        code: "INVALID_DATE_FROM",
        message: "Invalid date from",
      });
    }

    // Validate to date
    if (to && !isValidDate(to)) {
      return res.status(400).json({
        code: "INVALID_DATE_TO",
        message: "Invalid date to",
      });
    }

    // Get obligations based on scenario
    const result = getObligationsForScenario(govTestScenario);

    // If it's an error response
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    // If it's a slow scenario with delay
    if (result.delayMs) {
      console.log(`[http-simulator:vat-obligations] Applying delay of ${result.delayMs}ms`);
      setTimeout(() => {
        sendObligationsResponse(res, result, status);
      }, result.delayMs);
      return;
    }

    // Send response immediately
    sendObligationsResponse(res, result, status);
  });
}
