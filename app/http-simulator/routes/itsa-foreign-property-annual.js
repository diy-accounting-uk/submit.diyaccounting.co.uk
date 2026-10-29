// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-foreign-property-annual.js
// HMRC Property Business v6.0 endpoint
// Handles: GET|PUT /individuals/business/property/foreign/{nino}/{businessId}/annual/{taxYear}

import { randomUUID } from "crypto";
import {
  getForeignPropertyAnnualForScenario,
  getForeignPropertyAnnualAmendErrorForScenario,
} from "../scenarios/itsa-foreign-property-annual.js";
import { findEntryListError, taxYearStartYear, validatePathParams } from "./itsa-foreign-property-period.js";
import { getForeignPropertiesForNino, storeForeignAnnualCountries } from "../state/store.js";

/** The first tax year without the foreignFhlEea section: furnished holiday lettings ended 5 April 2025. */
const FHL_END_YEAR = 2025;

const hasValue = (value) => value !== undefined && value !== null && value !== "";

/** True when propertyIncomeAllowance sits beside any itemised allowance - HMRC rejects the combination. */
function hasBothAllowanceForms(allowances) {
  if (!allowances || typeof allowances !== "object") return false;
  const { propertyIncomeAllowance, ...rest } = allowances;
  if (!hasValue(propertyIncomeAllowance)) return false;
  return Object.values(rest).some((value) => (Array.isArray(value) ? value.length > 0 : hasValue(value)));
}

/** True when propertyIncomeAllowance sits beside a privateUseAdjustment - HMRC rejects the combination. */
function hasPropertyIncomeAllowanceWithPrivateUseAdjustment(section) {
  return hasValue(section?.allowances?.propertyIncomeAllowance) && hasValue(section?.adjustments?.privateUseAdjustment);
}

/**
 * Check the body of a create-and-amend request.
 * @returns {null|{status: number, body: object}} the first error, or null when the body is valid
 */
function findAnnualBodyError(nino, taxYear, body) {
  const hasFhlSection = body?.foreignFhlEea !== undefined;
  if (hasFhlSection && taxYearStartYear(taxYear) >= FHL_END_YEAR) {
    return {
      status: 400,
      body: {
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
        paths: ["/foreignFhlEea"],
      },
    };
  }
  if (!hasFhlSection && body?.foreignProperty === undefined) {
    return {
      status: 400,
      body: { code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", message: "An empty or non-matching body was submitted" },
    };
  }

  if (body.foreignProperty !== undefined) {
    const listError = findEntryListError(nino, taxYear, body.foreignProperty, "/foreignProperty");
    if (listError) return listError;
  }

  const sections = [...(hasFhlSection ? [body.foreignFhlEea] : []), ...(body.foreignProperty || [])];
  if (sections.some((section) => hasBothAllowanceForms(section.allowances))) {
    return {
      status: 400,
      body: {
        code: "RULE_BOTH_ALLOWANCES_SUPPLIED",
        message: "Both allowances and property income allowance must not be present at the same time",
      },
    };
  }
  if (sections.some(hasPropertyIncomeAllowanceWithPrivateUseAdjustment)) {
    return {
      status: 400,
      body: {
        code: "RULE_PROPERTY_INCOME_ALLOWANCE",
        message: "Property income allowance must not be present alongside a private use adjustment",
      },
    };
  }
  return null;
}

export function apiEndpoint(app) {
  // GET /individuals/business/property/foreign/{nino}/{businessId}/annual/{taxYear}
  app.get("/individuals/business/property/foreign/:nino/:businessId/annual/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-foreign-property-annual] GET /individuals/business/property/foreign/${nino}/${businessId}/annual/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;

    const heldPropertyId = getForeignPropertiesForNino(nino)[0]?.propertyId;
    const result = getForeignPropertyAnnualForScenario(govTestScenario, taxYear, heldPropertyId);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json(result.annualSubmission);
  });

  // PUT /individuals/business/property/foreign/{nino}/{businessId}/annual/{taxYear}
  app.put("/individuals/business/property/foreign/:nino/:businessId/annual/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-foreign-property-annual] PUT /individuals/business/property/foreign/${nino}/${businessId}/annual/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;

    const bodyError = findAnnualBodyError(nino, taxYear, req.body);
    if (bodyError) return res.status(bodyError.status).json(bodyError.body);

    const scenarioError = getForeignPropertyAnnualAmendErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    const countryCodes = (req.body.foreignProperty || []).map((entry) => entry.countryCode).filter(Boolean);
    storeForeignAnnualCountries(nino, taxYear, countryCodes);

    // Default and STATEFUL: HMRC answers 200 with no body.
    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.status(200).json({});
  });
}
