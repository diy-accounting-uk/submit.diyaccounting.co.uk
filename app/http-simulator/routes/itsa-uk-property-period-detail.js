// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-uk-property-period-detail.js
// HMRC Property Business endpoint
// Handles: GET|PUT /individuals/business/property/uk/{nino}/{businessId}/period/{taxYear}/{submissionId}

import { randomUUID } from "crypto";
import {
  getUkPropertyPeriodDetailForScenario,
  getUkPropertyPeriodAmendErrorForScenario,
} from "../scenarios/itsa-uk-property-period-detail.js";
import { findEmptyPropertyTypes } from "./itsa-uk-property-period.js";

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

export function apiEndpoint(app) {
  // GET /individuals/business/property/uk/{nino}/{businessId}/period/{taxYear}/{submissionId}
  app.get("/individuals/business/property/uk/:nino/:businessId/period/:taxYear/:submissionId", (req, res) => {
    const { nino, businessId, taxYear, submissionId } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-uk-property-period-detail] GET /individuals/business/property/uk/${nino}/${businessId}/period/${taxYear}/${submissionId}`,
    );

    if (!validatePathParams(req, res)) return;

    const result = getUkPropertyPeriodDetailForScenario(govTestScenario, submissionId);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json(result.periodSummary);
  });

  // PUT /individuals/business/property/uk/{nino}/{businessId}/period/{taxYear}/{submissionId}
  app.put("/individuals/business/property/uk/:nino/:businessId/period/:taxYear/:submissionId", (req, res) => {
    const { nino, businessId, taxYear, submissionId } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-uk-property-period-detail] PUT /individuals/business/property/uk/${nino}/${businessId}/period/${taxYear}/${submissionId}`,
    );

    if (!validatePathParams(req, res)) return;

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

    const scenarioError = getUkPropertyPeriodAmendErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: HMRC's amend endpoint returns 204 with no body.
    res.setHeader("x-correlationid", randomUUID());
    res.status(204).send();
  });
}
