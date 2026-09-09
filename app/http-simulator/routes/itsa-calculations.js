// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/itsa-calculations.js
// HMRC Individual Calculations (MTD) 8.0 endpoints
// Handles: POST /individuals/calculations/{nino}/self-assessment/{taxYear}/trigger/{calculationType}
//          GET  /individuals/calculations/{nino}/self-assessment/{taxYear}/{calculationId}
//          POST /individuals/calculations/{nino}/self-assessment/{taxYear}/{calculationId}/{calculationType}

import { randomUUID } from "crypto";
import { getCalculationTriggerErrorForScenario, getCalculationForScenario, getFinalDeclarationErrorForScenario } from "../scenarios/itsa-calculations.js";

const TRIGGER_CALCULATION_TYPES = ["in-year", "intent-to-finalise", "intent-to-amend"];
const FINAL_DECLARATION_CALCULATION_TYPES = ["final-declaration", "confirm-amendment"];

// Remembers which calculationType each triggered calculationId was requested with, for this
// simulator process's lifetime, so the retrieve endpoint can echo it back the way HMRC's own
// retrieve response does. HMRC's GET carries no calculationType of its own - the type lives
// only in what the matching trigger call asked for.
const triggeredCalculationTypes = new Map();

/**
 * Validate National Insurance number format (two letters, six digits, one suffix letter).
 * Matches app/lib/hmrcValidation.js#isValidNino without importing across the app/simulator
 * boundary - the simulator is deliberately standalone from the app it's simulating for.
 */
function isValidNino(nino) {
  const normalized = String(nino).replace(/\s+/g, "").toUpperCase();
  return /^(?!BG|GB|NK|KN|TN|NT|ZZ)[ABCEGHJ-PRSTW-Z][ABCEGHJ-NPRSTW-Z]\d{6}[A-D]$/.test(normalized);
}

function isValidTaxYear(taxYear) {
  return /^\d{4}-\d{2}$/.test(taxYear);
}

function isValidCalculationId(calculationId) {
  return /^([0-9]{8}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(calculationId);
}

export function apiEndpoint(app) {
  // POST /individuals/calculations/{nino}/self-assessment/{taxYear}/trigger/{calculationType}
  // Registered before the /{calculationId}/{calculationType} route below, since both are POST
  // with the same segment count - Express would otherwise match "trigger" as a calculationId.
  app.post("/individuals/calculations/:nino/self-assessment/:taxYear/trigger/:calculationType", (req, res) => {
    const { nino, taxYear, calculationType } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:itsa-calculations] POST /individuals/calculations/${nino}/self-assessment/${taxYear}/trigger/${calculationType}`);

    if (!isValidNino(nino)) {
      return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    }
    if (!isValidTaxYear(taxYear)) {
      return res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The provided tax year is invalid" });
    }
    if (!TRIGGER_CALCULATION_TYPES.includes(calculationType)) {
      return res.status(400).json({ code: "FORMAT_CALCULATION_TYPE", message: "The provided calculation type is not valid" });
    }

    const scenarioError = getCalculationTriggerErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: perform a real trigger. The simulator has no per-user mutable
    // state to track prior submissions, so STATEFUL behaves the same as the default.
    const calculationId = randomUUID();
    triggeredCalculationTypes.set(calculationId, calculationType);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.status(202).json({ calculationId });
  });

  // GET /individuals/calculations/{nino}/self-assessment/{taxYear}/{calculationId}
  app.get("/individuals/calculations/:nino/self-assessment/:taxYear/:calculationId", (req, res) => {
    const { nino, taxYear, calculationId } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:itsa-calculations] GET /individuals/calculations/${nino}/self-assessment/${taxYear}/${calculationId}`);

    if (!isValidNino(nino)) {
      return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    }
    if (!isValidTaxYear(taxYear)) {
      return res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The provided tax year is invalid" });
    }
    if (!isValidCalculationId(calculationId)) {
      return res.status(400).json({ code: "FORMAT_CALCULATION_ID", message: "The provided calculationId is invalid" });
    }

    const calculationType = triggeredCalculationTypes.get(calculationId) || "in-year";
    const result = getCalculationForScenario(govTestScenario, nino, taxYear, calculationId, calculationType);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json(result.calculation);
  });

  // POST /individuals/calculations/{nino}/self-assessment/{taxYear}/{calculationId}/{calculationType}
  app.post("/individuals/calculations/:nino/self-assessment/:taxYear/:calculationId/:calculationType", (req, res) => {
    const { nino, taxYear, calculationId, calculationType } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-calculations] POST /individuals/calculations/${nino}/self-assessment/${taxYear}/${calculationId}/${calculationType}`,
    );

    if (!isValidNino(nino)) {
      return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    }
    if (!isValidTaxYear(taxYear)) {
      return res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The provided tax year is invalid" });
    }
    if (!isValidCalculationId(calculationId)) {
      return res.status(400).json({ code: "FORMAT_CALCULATION_ID", message: "The provided calculationId is invalid" });
    }
    if (!FINAL_DECLARATION_CALCULATION_TYPES.includes(calculationType)) {
      return res.status(400).json({ code: "FORMAT_CALCULATION_TYPE", message: "The provided calculation type is not valid" });
    }

    const scenarioError = getFinalDeclarationErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: HMRC's submit-final-declaration endpoint returns 204 with no body.
    res.setHeader("x-correlationid", randomUUID());
    res.status(204).send();
  });
}
