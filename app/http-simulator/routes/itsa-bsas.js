// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-bsas.js
// HMRC Business Source Adjustable Summary endpoint
// Handles: POST /individuals/self-assessment/adjustable-summary/{nino}/trigger
//          GET  /individuals/self-assessment/adjustable-summary/{nino}/self-employment/{calculationId}/{taxYear}
//          POST /individuals/self-assessment/adjustable-summary/{nino}/self-employment/{calculationId}/adjust/{taxYear}

import { randomUUID } from "crypto";
import {
  getBsasTriggerErrorForScenario,
  getBsasSelfEmploymentForScenario,
  getBsasAdjustErrorForScenario,
  getBsasUkPropertyForScenario,
  getBsasUkPropertyAdjustErrorForScenario,
} from "../scenarios/itsa-bsas.js";

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

function isValidCalculationId(calculationId) {
  return /^([0-9]{8}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(calculationId);
}

function isValidTaxYear(taxYear) {
  return /^\d{4}-\d{2}$/.test(taxYear);
}

/** True when the caller sent zeroAdjustments together with any of income/expenses/additions. */
function hasBothAdjustmentForms(body) {
  const hasZeroAdjustments = body?.zeroAdjustments === true;
  const hasFigures = ["income", "expenses", "additions"].some((key) => {
    const section = body?.[key];
    return section && typeof section === "object" && Object.keys(section).length > 0;
  });
  return hasZeroAdjustments && hasFigures;
}

/** True when the caller sent neither zeroAdjustments nor any of income/expenses/additions. */
function isEntirelyEmptyAdjustBody(body) {
  const hasZeroAdjustments = body?.zeroAdjustments === true;
  const hasFigures = ["income", "expenses", "additions"].some((key) => {
    const section = body?.[key];
    return section && typeof section === "object" && Object.keys(section).length > 0;
  });
  return !hasZeroAdjustments && !hasFigures;
}

export function apiEndpoint(app) {
  // POST /individuals/self-assessment/adjustable-summary/{nino}/trigger
  app.post("/individuals/self-assessment/adjustable-summary/:nino/trigger", (req, res) => {
    const { nino } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:itsa-bsas] POST /individuals/self-assessment/adjustable-summary/${nino}/trigger`);

    if (!isValidNino(nino)) {
      return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    }

    const { accountingPeriod, typeOfBusiness, businessId } = req.body || {};
    if (!accountingPeriod?.startDate || !accountingPeriod?.endDate || !typeOfBusiness || !businessId) {
      return res.status(400).json({
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
      });
    }
    if (!isValidBusinessId(businessId)) {
      return res.status(400).json({ code: "FORMAT_BUSINESS_ID", message: "The supplied business ID is invalid" });
    }

    const scenarioError = getBsasTriggerErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: perform a real trigger. The simulator has no per-user mutable
    // state to track obligations, so STATEFUL behaves the same as the default.
    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.status(200).json({ calculationId: randomUUID() });
  });

  // GET /individuals/self-assessment/adjustable-summary/{nino}/self-employment/{calculationId}/{taxYear}
  app.get("/individuals/self-assessment/adjustable-summary/:nino/self-employment/:calculationId/:taxYear", (req, res) => {
    const { nino, calculationId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-bsas] GET /individuals/self-assessment/adjustable-summary/${nino}/self-employment/${calculationId}/${taxYear}`,
    );

    if (!isValidNino(nino)) {
      return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    }
    if (!isValidCalculationId(calculationId)) {
      return res.status(400).json({ code: "FORMAT_CALCULATION_ID", message: "The provided calculation ID is invalid" });
    }
    if (!isValidTaxYear(taxYear)) {
      return res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The provided tax year is invalid" });
    }

    const result = getBsasSelfEmploymentForScenario(govTestScenario, nino, calculationId, taxYear);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json(result.bsas);
  });

  // POST /individuals/self-assessment/adjustable-summary/{nino}/self-employment/{calculationId}/adjust/{taxYear}
  app.post("/individuals/self-assessment/adjustable-summary/:nino/self-employment/:calculationId/adjust/:taxYear", (req, res) => {
    const { nino, calculationId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-bsas] POST /individuals/self-assessment/adjustable-summary/${nino}/self-employment/${calculationId}/adjust/${taxYear}`,
    );

    if (!isValidNino(nino)) {
      return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    }
    if (!isValidCalculationId(calculationId)) {
      return res.status(400).json({ code: "FORMAT_CALCULATION_ID", message: "The provided calculation ID is invalid" });
    }
    if (!isValidTaxYear(taxYear)) {
      return res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The provided tax year is invalid" });
    }

    if (hasBothAdjustmentForms(req.body)) {
      return res.status(400).json({
        code: "RULE_BOTH_ADJUSTMENTS_SUPPLIED",
        message: "Both adjustments and zero adjustments must not be present",
      });
    }
    if (isEntirelyEmptyAdjustBody(req.body)) {
      return res.status(400).json({
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
      });
    }

    const scenarioError = getBsasAdjustErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: HMRC's submit-adjustments endpoint returns 200 with no body.
    res.setHeader("x-correlationid", randomUUID());
    res.status(200).send();
  });

  // GET /individuals/self-assessment/adjustable-summary/{nino}/uk-property/{calculationId}/{taxYear}
  app.get("/individuals/self-assessment/adjustable-summary/:nino/uk-property/:calculationId/:taxYear", (req, res) => {
    const { nino, calculationId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-bsas] GET /individuals/self-assessment/adjustable-summary/${nino}/uk-property/${calculationId}/${taxYear}`,
    );

    if (!isValidNino(nino)) {
      return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    }
    if (!isValidCalculationId(calculationId)) {
      return res.status(400).json({ code: "FORMAT_CALCULATION_ID", message: "The provided calculation ID is invalid" });
    }
    if (!isValidTaxYear(taxYear)) {
      return res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The provided tax year is invalid" });
    }

    const result = getBsasUkPropertyForScenario(govTestScenario, nino, calculationId, taxYear);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json(result.bsas);
  });

  // POST /individuals/self-assessment/adjustable-summary/{nino}/uk-property/{calculationId}/adjust/{taxYear}
  app.post("/individuals/self-assessment/adjustable-summary/:nino/uk-property/:calculationId/adjust/:taxYear", (req, res) => {
    const { nino, calculationId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-bsas] POST /individuals/self-assessment/adjustable-summary/${nino}/uk-property/${calculationId}/adjust/${taxYear}`,
    );

    if (!isValidNino(nino)) {
      return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    }
    if (!isValidCalculationId(calculationId)) {
      return res.status(400).json({ code: "FORMAT_CALCULATION_ID", message: "The provided calculation ID is invalid" });
    }
    if (!isValidTaxYear(taxYear)) {
      return res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The provided tax year is invalid" });
    }

    const ukProperty = req.body?.ukProperty;
    if (hasBothAdjustmentForms(ukProperty)) {
      return res.status(400).json({
        code: "RULE_BOTH_ADJUSTMENTS_SUPPLIED",
        message: "Both adjustments and zero adjustments must not be present",
      });
    }
    if (isEntirelyEmptyAdjustBody(ukProperty)) {
      return res.status(400).json({
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
      });
    }

    const scenarioError = getBsasUkPropertyAdjustErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: HMRC's submit-adjustments endpoint returns 200 with no body.
    res.setHeader("x-correlationid", randomUUID());
    res.status(200).send();
  });
}
