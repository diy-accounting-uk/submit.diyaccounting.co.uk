// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-uk-property-cumulative.js
// HMRC Property Business v6.0 endpoint (2025-26 onwards)
// Handles: GET|PUT /individuals/business/property/uk/{nino}/{businessId}/cumulative/{taxYear}

import { randomUUID } from "crypto";
import {
  getUkPropertyCumulativePutErrorForScenario,
  getUkPropertyCumulativeGetForScenario,
} from "../scenarios/itsa-uk-property-cumulative.js";

/**
 * Validate National Insurance number format (two letters, six digits, one suffix letter).
 * Matches app/lib/hmrcValidation.js#isValidNino without importing across the app/simulator
 * boundary - the simulator is deliberately standalone from the app it's simulating for.
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
    res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    return false;
  }
  if (!isValidBusinessId(businessId)) {
    res.status(400).json({ code: "FORMAT_BUSINESS_ID", message: "The provided businessId is invalid" });
    return false;
  }
  if (!isValidTaxYear(taxYear)) {
    res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The provided taxYear is invalid" });
    return false;
  }
  return true;
}

/**
 * A UK property cumulative body is empty when ukProperty carries neither income nor expenses.
 * HMRC rejects this the same way it rejects an empty section anywhere else.
 * @param {Object} body - the parsed request body
 * @returns {boolean}
 */
function hasEmptyUkProperty(body) {
  const ukProperty = body?.ukProperty;
  if (!ukProperty || typeof ukProperty !== "object") return true;
  const income = ukProperty.income;
  const expenses = ukProperty.expenses;
  const hasIncome = income && typeof income === "object" && Object.keys(income).length > 0;
  const hasExpenses = expenses && typeof expenses === "object" && Object.keys(expenses).length > 0;
  return !hasIncome && !hasExpenses;
}

export function apiEndpoint(app) {
  // GET /individuals/business/property/uk/{nino}/{businessId}/cumulative/{taxYear}
  app.get("/individuals/business/property/uk/:nino/:businessId/cumulative/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-uk-property-cumulative] GET /individuals/business/property/uk/${nino}/${businessId}/cumulative/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;

    const result = getUkPropertyCumulativeGetForScenario(govTestScenario);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json(result.periodSummary);
  });

  // PUT /individuals/business/property/uk/{nino}/{businessId}/cumulative/{taxYear}
  // Creates the year's running total on the first submission, amends it on every later one -
  // HMRC has no separate create for this model, so there is only ever one operation here.
  app.put("/individuals/business/property/uk/:nino/:businessId/cumulative/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-uk-property-cumulative] PUT /individuals/business/property/uk/${nino}/${businessId}/cumulative/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;

    if (hasEmptyUkProperty(req.body)) {
      return res.status(400).json({
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
        paths: ["/ukProperty"],
      });
    }

    const scenarioError = getUkPropertyCumulativePutErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: HMRC's cumulative create-or-amend returns 204 with no body.
    res.setHeader("x-correlationid", randomUUID());
    res.status(204).send();
  });
}
