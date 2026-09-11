// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-uk-property-period.js
// HMRC Property Business endpoint
// Handles: POST /individuals/business/property/uk/{nino}/{businessId}/period/{taxYear}

import { getUkPropertyPeriodErrorForScenario } from "../scenarios/itsa-uk-property-period.js";

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

/**
 * A UK property period create/amend body is empty when neither property type carries any
 * income or expenses. HMRC rejects this the same way it rejects an empty section anywhere
 * else - naming the empty path(s) - so a caller must omit a property type entirely rather than
 * send it with empty income/expenses objects.
 * @param {Object} body - the parsed request body
 * @returns {string[]} the paths of any property type present with nothing in it
 */
export function findEmptyPropertyTypes(body) {
  return ["ukFhlProperty", "ukNonFhlProperty"]
    .filter((key) => {
      const propertyType = body?.[key];
      if (!propertyType || typeof propertyType !== "object") return false;
      const income = propertyType.income;
      const expenses = propertyType.expenses;
      const hasIncome = income && typeof income === "object" && Object.keys(income).length > 0;
      const hasExpenses = expenses && typeof expenses === "object" && Object.keys(expenses).length > 0;
      return !hasIncome && !hasExpenses;
    })
    .map((key) => `/${key}`);
}

export function apiEndpoint(app) {
  // POST /individuals/business/property/uk/{nino}/{businessId}/period/{taxYear}
  app.post("/individuals/business/property/uk/:nino/:businessId/period/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-uk-property-period] POST /individuals/business/property/uk/${nino}/${businessId}/period/${taxYear}`,
    );

    if (!isValidNino(nino)) {
      return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    }
    if (!isValidBusinessId(businessId)) {
      return res.status(400).json({ code: "FORMAT_BUSINESS_ID", message: "The provided businessId is invalid" });
    }
    if (!isValidTaxYear(taxYear)) {
      return res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The provided taxYear is invalid" });
    }

    if (!req.body?.fromDate || !req.body?.toDate) {
      return res.status(400).json({
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
      });
    }

    if (!req.body?.ukFhlProperty && !req.body?.ukNonFhlProperty) {
      return res.status(400).json({
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
      });
    }

    const emptyPropertyTypePaths = findEmptyPropertyTypes(req.body);
    if (emptyPropertyTypePaths.length > 0) {
      return res.status(400).json({
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
        paths: emptyPropertyTypePaths,
      });
    }

    const scenarioError = getUkPropertyPeriodErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: perform a real create. The simulator has no per-user mutable
    // state to track across requests, so STATEFUL behaves the same as the default.
    const submissionId = `${req.body.fromDate}_${req.body.toDate}`;

    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ submissionId });
  });
}
