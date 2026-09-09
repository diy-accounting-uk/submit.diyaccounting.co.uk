// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/itsa-self-employment-annual.js
// HMRC Self Employment Business endpoint
// Handles: GET|PUT /individuals/business/self-employment/{nino}/{businessId}/annual/{taxYear}

import { randomUUID } from "crypto";
import { getAnnualSubmissionForScenario, getAnnualSubmissionAmendErrorForScenario } from "../scenarios/itsa-self-employment-annual.js";

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

/**
 * True when the caller sent tradingIncomeAllowance together with any itemised allowance
 * field - HMRC rejects the combination with RULE_BOTH_ALLOWANCES_SUPPLIED.
 */
function hasBothAllowanceForms(allowances) {
  if (!allowances || typeof allowances !== "object") return false;
  const { tradingIncomeAllowance, ...rest } = allowances;
  if (tradingIncomeAllowance === undefined || tradingIncomeAllowance === null || tradingIncomeAllowance === "") return false;
  return Object.values(rest).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "",
  );
}

/** True when adjustments, allowances and nonFinancials are all absent or empty. */
function isEntirelyEmptyBody(body) {
  return ["adjustments", "allowances", "nonFinancials"].every((key) => {
    const section = body?.[key];
    return !section || typeof section !== "object" || Object.keys(section).length === 0;
  });
}

export function apiEndpoint(app) {
  // GET /individuals/business/self-employment/{nino}/{businessId}/annual/{taxYear}
  app.get("/individuals/business/self-employment/:nino/:businessId/annual/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-self-employment-annual] GET /individuals/business/self-employment/${nino}/${businessId}/annual/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;

    const result = getAnnualSubmissionForScenario(govTestScenario);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json(result.annualSubmission);
  });

  // PUT /individuals/business/self-employment/{nino}/{businessId}/annual/{taxYear}
  app.put("/individuals/business/self-employment/:nino/:businessId/annual/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-self-employment-annual] PUT /individuals/business/self-employment/${nino}/${businessId}/annual/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;

    if (isEntirelyEmptyBody(req.body)) {
      return res.status(400).json({
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
      });
    }

    if (hasBothAllowanceForms(req.body?.allowances)) {
      return res.status(400).json({
        code: "RULE_BOTH_ALLOWANCES_SUPPLIED",
        message: "Both allowances and trading allowances must not be present at the same time",
      });
    }

    const scenarioError = getAnnualSubmissionAmendErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: HMRC's create/amend endpoint returns 204 with no body.
    res.setHeader("x-correlationid", randomUUID());
    res.status(204).send();
  });
}
