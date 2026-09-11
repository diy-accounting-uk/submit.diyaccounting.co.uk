// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-tax-liability-adjustments.js
// HMRC Individuals Tax Liability Adjustments endpoint
// Handles: GET|PUT|DELETE /individuals/tax-liability/adjustments/{nino}/{taxYear}

import { randomUUID } from "crypto";
import {
  getTaxLiabilityAdjustmentsForScenario,
  getTaxLiabilityAdjustmentsAmendErrorForScenario,
  getTaxLiabilityAdjustmentsDeleteErrorForScenario,
} from "../scenarios/itsa-tax-liability-adjustments.js";

/**
 * Validate National Insurance number format. Matches app/lib/hmrcValidation.js#isValidNino
 * without importing across the app/simulator boundary - the simulator is deliberately
 * standalone from the app it's simulating for.
 */
function isValidNino(nino) {
  const normalized = String(nino).replace(/\s+/g, "").toUpperCase();
  return /^(?!BG|GB|NK|KN|TN|NT|ZZ)[ABCEGHJ-PRSTW-Z][ABCEGHJ-NPRSTW-Z]\d{6}[A-D]$/.test(normalized);
}

function isValidTaxYear(taxYear) {
  return /^\d{4}-\d{2}$/.test(taxYear);
}

function validatePathParams(req, res) {
  const { nino, taxYear } = req.params;
  if (!isValidNino(nino)) {
    res.status(400).json({ code: "FORMAT_NINO", message: "The NINO format is invalid" });
    return false;
  }
  if (!isValidTaxYear(taxYear)) {
    res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The taxYear format is invalid" });
    return false;
  }
  return true;
}

/** True when carryBackLossesDecrease and taxRefundedOrSetOff are both absent or empty. */
function isEntirelyEmptyBody(body) {
  return ["carryBackLossesDecrease", "taxRefundedOrSetOff"].every((key) => {
    const section = body?.[key];
    return !section || typeof section !== "object" || Object.keys(section).length === 0;
  });
}

export function apiEndpoint(app) {
  // GET /individuals/tax-liability/adjustments/{nino}/{taxYear}
  app.get("/individuals/tax-liability/adjustments/:nino/:taxYear", (req, res) => {
    const { nino, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:itsa-tax-liability-adjustments] GET /individuals/tax-liability/adjustments/${nino}/${taxYear}`);

    if (!validatePathParams(req, res)) return;

    const result = getTaxLiabilityAdjustmentsForScenario(govTestScenario);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json(result.taxLiabilityAdjustments);
  });

  // PUT /individuals/tax-liability/adjustments/{nino}/{taxYear}
  app.put("/individuals/tax-liability/adjustments/:nino/:taxYear", (req, res) => {
    const { nino, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:itsa-tax-liability-adjustments] PUT /individuals/tax-liability/adjustments/${nino}/${taxYear}`);

    if (!validatePathParams(req, res)) return;

    if (isEntirelyEmptyBody(req.body)) {
      return res.status(400).json({
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
      });
    }

    const scenarioError = getTaxLiabilityAdjustmentsAmendErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: HMRC's create/amend endpoint returns 204 with no body.
    res.setHeader("x-correlationid", randomUUID());
    res.status(204).send();
  });

  // DELETE /individuals/tax-liability/adjustments/{nino}/{taxYear}
  app.delete("/individuals/tax-liability/adjustments/:nino/:taxYear", (req, res) => {
    const { nino, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:itsa-tax-liability-adjustments] DELETE /individuals/tax-liability/adjustments/${nino}/${taxYear}`);

    if (!validatePathParams(req, res)) return;

    const scenarioError = getTaxLiabilityAdjustmentsDeleteErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    res.setHeader("x-correlationid", randomUUID());
    res.status(204).send();
  });
}
