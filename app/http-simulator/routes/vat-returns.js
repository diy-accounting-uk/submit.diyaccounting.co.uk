// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/vat-returns.js
// HMRC VAT Return endpoints
// Handles: POST /organisations/vat/{vrn}/returns
//          GET /organisations/vat/{vrn}/returns/{periodKey}

import { randomUUID } from "crypto";
import { storeReturn, getReturn } from "../state/store.js";
import { getScenarioResponse } from "../scenarios/returns.js";
import { validateVatReturnBody, calculateTotalVatDue, calculateNetVatDue } from "../../lib/vatReturnTypes.js";

/**
 * Validate VAT registration number format (9 digits)
 */
function isValidVrn(vrn) {
  return /^\d{9}$/.test(vrn);
}

/**
 * Generate a random form bundle number (12 digits)
 */
function generateFormBundleNumber() {
  return String(Math.floor(100000000000 + Math.random() * 900000000000));
}

/**
 * Generate a random charge reference number
 */
function generateChargeRefNumber() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function apiEndpoint(app) {
  // POST /organisations/vat/{vrn}/returns - Submit VAT return
  app.post("/organisations/vat/:vrn/returns", (req, res) => {
    const { vrn } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:vat-returns] POST /organisations/vat/${vrn}/returns`);

    // Validate VAT registration number
    if (!isValidVrn(vrn)) {
      return res.status(400).json({
        code: "VRN_INVALID",
        message: "The provided VAT registration number is invalid",
      });
    }

    // Check for Gov-Test-Scenario error responses
    const scenarioResponse = getScenarioResponse(govTestScenario, "POST", vrn, req.body?.periodKey);
    if (scenarioResponse) {
      return res.status(scenarioResponse.status).json(scenarioResponse.body);
    }

    // Validate request body - ALL 9 boxes required
    const validation = validateVatReturnBody(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        code: validation.code,
        message: validation.message,
      });
    }

    const {
      periodKey,
      vatDueSales,
      vatDueAcquisitions,
      totalVatDue,
      vatReclaimedCurrPeriod,
      netVatDue,
      totalValueSalesExVAT,
      totalValuePurchasesExVAT,
      totalValueGoodsSuppliedExVAT,
      totalAcquisitionsExVAT,
      finalised,
    } = req.body || {};

    // Verify calculated fields (Box 3 and Box 5)
    const expectedTotalVatDue = calculateTotalVatDue(vatDueSales, vatDueAcquisitions);
    const expectedNetVatDue = calculateNetVatDue(expectedTotalVatDue, vatReclaimedCurrPeriod);

    if (Math.abs(totalVatDue - expectedTotalVatDue) > 0.01) {
      return res.status(400).json({
        code: "INVALID_TOTAL_VAT_DUE",
        message: `totalVatDue (${totalVatDue}) does not equal vatDueSales + vatDueAcquisitions (${expectedTotalVatDue})`,
      });
    }

    if (Math.abs(netVatDue - expectedNetVatDue) > 0.01) {
      return res.status(400).json({
        code: "INVALID_NET_VAT_DUE",
        message: `netVatDue (${netVatDue}) does not equal |totalVatDue - vatReclaimedCurrPeriod| (${expectedNetVatDue})`,
      });
    }

    // Store the return
    const returnData = {
      periodKey,
      vatDueSales: vatDueSales ?? 0,
      vatDueAcquisitions: vatDueAcquisitions ?? 0,
      totalVatDue: totalVatDue ?? 0,
      vatReclaimedCurrPeriod: vatReclaimedCurrPeriod ?? 0,
      netVatDue: netVatDue ?? 0,
      totalValueSalesExVAT: totalValueSalesExVAT ?? 0,
      totalValuePurchasesExVAT: totalValuePurchasesExVAT ?? 0,
      totalValueGoodsSuppliedExVAT: totalValueGoodsSuppliedExVAT ?? 0,
      totalAcquisitionsExVAT: totalAcquisitionsExVAT ?? 0,
    };

    storeReturn(vrn, periodKey, returnData);

    // Generate receipt response
    const processingDate = new Date().toISOString();
    const formBundleNumber = generateFormBundleNumber();
    const chargeRefNumber = generateChargeRefNumber();

    const receipt = {
      processingDate,
      formBundleNumber,
      paymentIndicator: "DD",
      chargeRefNumber,
    };

    // Set HMRC-like response headers
    res.setHeader("Content-Type", "application/json");
    res.setHeader("receipt-id", randomUUID());
    res.setHeader("receipt-signature", "This has been deprecated - DO NOT USE");
    res.setHeader("receipt-timestamp", new Date().toISOString().split(".")[0] + "Z");
    res.setHeader("x-correlationid", randomUUID());

    res.status(201).json(receipt);
  });

  // GET /organisations/vat/{vrn}/returns/{periodKey} - Get VAT return
  app.get("/organisations/vat/:vrn/returns/:periodKey", (req, res) => {
    const { vrn, periodKey } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:vat-returns] GET /organisations/vat/${vrn}/returns/${periodKey}`);

    // Validate VAT registration number
    if (!isValidVrn(vrn)) {
      return res.status(400).json({
        code: "VRN_INVALID",
        message: "The provided VAT registration number is invalid",
      });
    }

    // Check for Gov-Test-Scenario error responses
    const scenarioResponse = getScenarioResponse(govTestScenario, "GET", vrn, periodKey);
    if (scenarioResponse) {
      return res.status(scenarioResponse.status).json(scenarioResponse.body);
    }

    // Look up stored return
    const storedReturn = getReturn(vrn, periodKey);
    if (storedReturn) {
      res.setHeader("x-correlationid", randomUUID());
      return res.json(storedReturn);
    }

    // Return default test data if not stored
    const defaultReturn = {
      periodKey,
      vatDueSales: 1000,
      vatDueAcquisitions: 0,
      totalVatDue: 1000,
      vatReclaimedCurrPeriod: 0,
      netVatDue: 1000,
      totalValueSalesExVAT: 0,
      totalValuePurchasesExVAT: 0,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
    };

    res.setHeader("x-correlationid", randomUUID());
    res.json(defaultReturn);
  });
}
