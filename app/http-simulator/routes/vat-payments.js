// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/vat-payments.js
// HMRC VAT Payments endpoint
// Handles: GET /organisations/vat/{vrn}/payments

import { randomUUID } from "crypto";
import { getPaymentsForScenario } from "../scenarios/payments.js";

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

function sendPaymentsResponse(res, result) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("x-correlationid", randomUUID());

  res.json({ payments: result.payments });
}

export function apiEndpoint(app) {
  // GET /organisations/vat/{vrn}/payments
  app.get("/organisations/vat/:vrn/payments", (req, res) => {
    const { vrn } = req.params;
    const { from, to } = req.query;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:vat-payments] GET /organisations/vat/${vrn}/payments from=${from} to=${to}`);

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

    // Get payments based on scenario
    const result = getPaymentsForScenario(govTestScenario);

    // If it's an error response
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    // Send response
    sendPaymentsResponse(res, result);
  });
}
