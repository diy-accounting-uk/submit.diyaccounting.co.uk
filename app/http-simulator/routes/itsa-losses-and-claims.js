// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-losses-and-claims.js
// HMRC Individual Losses endpoint
// Handles: GET|PUT|DELETE /individuals/losses/{nino}/businesses/{businessId}/loss-claims/{taxYear}

import { randomUUID } from "crypto";
import {
  getLossesAndClaimsForScenario,
  getLossesAndClaimsAmendErrorForScenario,
  getLossesAndClaimsDeleteErrorForScenario,
} from "../scenarios/itsa-losses-and-claims.js";

/**
 * Validate National Insurance number format. Matches app/lib/hmrcValidation.js#isValidNino
 * without importing across the app/simulator boundary - the simulator is deliberately
 * standalone from the app it's simulating for.
 */
function isValidNino(nino) {
  const normalized = String(nino).replace(/\s+/g, "").toUpperCase();
  return /^(?!BG|GB|NK|KN|TN|NT|ZZ)[ABCEGHJ-PRSTW-Z][ABCEGHJ-NPRSTW-Z]\d{6}[A-D]$/.test(normalized);
}

function isValidBusinessId(businessId) {
  return /^X[A-Za-z0-9]IS\d{11}$/.test(businessId);
}

function isValidTaxYear(taxYear) {
  return /^\d{4}-\d{2}$/.test(taxYear);
}

function validatePathParams(req, res) {
  const { nino, businessId, taxYear } = req.params;
  if (!isValidNino(nino)) {
    res.status(400).json({ code: "FORMAT_NINO", message: "The NINO format is invalid" });
    return false;
  }
  if (!isValidBusinessId(businessId)) {
    res.status(400).json({ code: "FORMAT_BUSINESS_ID", message: "The Business ID format is invalid" });
    return false;
  }
  if (!isValidTaxYear(taxYear)) {
    res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The taxYear format is invalid" });
    return false;
  }
  return true;
}

/** True when losses and claims are both absent or empty. */
function isEntirelyEmptyBody(body) {
  return ["losses", "claims"].every((key) => {
    const section = body?.[key];
    return !section || typeof section !== "object" || Object.keys(section).length === 0;
  });
}

export function apiEndpoint(app) {
  // GET /individuals/losses/{nino}/businesses/{businessId}/loss-claims/{taxYear}
  app.get("/individuals/losses/:nino/businesses/:businessId/loss-claims/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-losses-and-claims] GET /individuals/losses/${nino}/businesses/${businessId}/loss-claims/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;

    const result = getLossesAndClaimsForScenario(govTestScenario);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json(result.lossesAndClaims);
  });

  // PUT /individuals/losses/{nino}/businesses/{businessId}/loss-claims/{taxYear}
  app.put("/individuals/losses/:nino/businesses/:businessId/loss-claims/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-losses-and-claims] PUT /individuals/losses/${nino}/businesses/${businessId}/loss-claims/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;

    if (isEntirelyEmptyBody(req.body)) {
      return res.status(400).json({
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
      });
    }

    const scenarioError = getLossesAndClaimsAmendErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: HMRC's create/amend endpoint returns 204 with no body.
    res.setHeader("x-correlationid", randomUUID());
    res.status(204).send();
  });

  // DELETE /individuals/losses/{nino}/businesses/{businessId}/loss-claims/{taxYear}
  app.delete("/individuals/losses/:nino/businesses/:businessId/loss-claims/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-losses-and-claims] DELETE /individuals/losses/${nino}/businesses/${businessId}/loss-claims/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;

    const scenarioError = getLossesAndClaimsDeleteErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    res.setHeader("x-correlationid", randomUUID());
    res.status(204).send();
  });
}
