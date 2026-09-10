// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-uk-property-annual.js
// HMRC Property Business endpoint
// Handles: GET|PUT /individuals/business/property/uk/{nino}/{businessId}/annual/{taxYear}

import { randomUUID } from "crypto";
import {
  getUkPropertyAnnualForScenario,
  getUkPropertyAnnualAmendErrorForScenario,
} from "../scenarios/itsa-uk-property-annual.js";

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
 * True when the caller sent propertyIncomeAllowance together with any itemised allowance
 * field - HMRC rejects the combination with RULE_BOTH_ALLOWANCES_SUPPLIED.
 */
function hasBothAllowanceForms(allowances) {
  if (!allowances || typeof allowances !== "object") return false;
  const { propertyIncomeAllowance, ...rest } = allowances;
  if (propertyIncomeAllowance === undefined || propertyIncomeAllowance === null || propertyIncomeAllowance === "") return false;
  return Object.values(rest).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "",
  );
}

/** True when propertyIncomeAllowance sits alongside a privateUseAdjustment - HMRC rejects it. */
function hasPropertyIncomeAllowanceWithPrivateUseAdjustment(ukProperty) {
  const propertyIncomeAllowance = ukProperty?.allowances?.propertyIncomeAllowance;
  const privateUseAdjustment = ukProperty?.adjustments?.privateUseAdjustment;
  const hasAllowance = propertyIncomeAllowance !== undefined && propertyIncomeAllowance !== null && propertyIncomeAllowance !== "";
  const hasAdjustment = privateUseAdjustment !== undefined && privateUseAdjustment !== null && privateUseAdjustment !== "";
  return hasAllowance && hasAdjustment;
}

/** True when adjustments and allowances are both absent or empty. */
function isEntirelyEmptyBody(ukProperty) {
  return ["adjustments", "allowances"].every((key) => {
    const section = ukProperty?.[key];
    return !section || typeof section !== "object" || Object.keys(section).length === 0;
  });
}

export function apiEndpoint(app) {
  // GET /individuals/business/property/uk/{nino}/{businessId}/annual/{taxYear}
  app.get("/individuals/business/property/uk/:nino/:businessId/annual/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-uk-property-annual] GET /individuals/business/property/uk/${nino}/${businessId}/annual/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;

    const result = getUkPropertyAnnualForScenario(govTestScenario);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json(result.annualSubmission);
  });

  // PUT /individuals/business/property/uk/{nino}/{businessId}/annual/{taxYear}
  app.put("/individuals/business/property/uk/:nino/:businessId/annual/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-uk-property-annual] PUT /individuals/business/property/uk/${nino}/${businessId}/annual/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;

    const ukProperty = req.body?.ukProperty;
    if (isEntirelyEmptyBody(ukProperty)) {
      return res.status(400).json({
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
      });
    }

    if (hasBothAllowanceForms(ukProperty?.allowances)) {
      return res.status(400).json({
        code: "RULE_BOTH_ALLOWANCES_SUPPLIED",
        message: "Both allowances and property income allowance must not be present at the same time",
      });
    }

    if (hasPropertyIncomeAllowanceWithPrivateUseAdjustment(ukProperty)) {
      return res.status(400).json({
        code: "RULE_PROPERTY_INCOME_ALLOWANCE",
        message: "Property income allowance must not be present alongside a private use adjustment",
      });
    }

    const scenarioError = getUkPropertyAnnualAmendErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: the UK property annual submission answers 200, not the 204 the
    // self-employment one answers.
    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.status(200).json({});
  });
}
