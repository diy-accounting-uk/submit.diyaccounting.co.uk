// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-foreign-property-cumulative.js
// HMRC Property Business v6.0 endpoint (2025-26 onwards)
// Handles: GET|PUT /individuals/business/property/foreign/{nino}/{businessId}/cumulative/{taxYear}

import { randomUUID } from "crypto";
import {
  getForeignPropertyCumulativeGetForScenario,
  getForeignPropertyCumulativePutErrorForScenario,
} from "../scenarios/itsa-foreign-property-cumulative.js";
import { findEntryListError, usesCumulativeModel, validatePathParams } from "./itsa-foreign-property-period.js";
import { getForeignPropertiesForNino } from "../state/store.js";

const TAX_YEAR_NOT_SUPPORTED = {
  code: "RULE_TAX_YEAR_NOT_SUPPORTED",
  message: "The tax year specified does not lie within the supported range",
};

export function apiEndpoint(app) {
  // GET /individuals/business/property/foreign/{nino}/{businessId}/cumulative/{taxYear}
  app.get("/individuals/business/property/foreign/:nino/:businessId/cumulative/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-foreign-property-cumulative] GET /individuals/business/property/foreign/${nino}/${businessId}/cumulative/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;
    if (!usesCumulativeModel(taxYear)) return res.status(400).json(TAX_YEAR_NOT_SUPPORTED);

    const heldPropertyId = getForeignPropertiesForNino(nino)[0]?.propertyId;
    const result = getForeignPropertyCumulativeGetForScenario(govTestScenario, taxYear, heldPropertyId);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json(result.periodSummary);
  });

  // PUT /individuals/business/property/foreign/{nino}/{businessId}/cumulative/{taxYear}
  // Creates the year's running total on the first submission, amends it on every later one -
  // HMRC has no separate create for this model, so there is only ever one operation here.
  app.put("/individuals/business/property/foreign/:nino/:businessId/cumulative/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-foreign-property-cumulative] PUT /individuals/business/property/foreign/${nino}/${businessId}/cumulative/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;
    if (!usesCumulativeModel(taxYear)) return res.status(400).json(TAX_YEAR_NOT_SUPPORTED);

    const listError = findEntryListError(nino, taxYear, req.body?.foreignProperty, "/foreignProperty");
    if (listError) return res.status(listError.status).json(listError.body);

    const scenarioError = getForeignPropertyCumulativePutErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: HMRC's cumulative create-or-amend returns 204 with no body.
    res.setHeader("x-correlationid", randomUUID());
    res.status(204).send();
  });
}
