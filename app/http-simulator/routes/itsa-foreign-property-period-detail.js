// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-foreign-property-period-detail.js
// HMRC Property Business v6.0 endpoint (tax years 2024-25 and before)
// Handles: GET|PUT /individuals/business/property/foreign/{nino}/{businessId}/period/{taxYear}/{submissionId}

import { randomUUID } from "crypto";
import {
  getForeignPropertyPeriodDetailForScenario,
  getForeignPropertyPeriodAmendErrorForScenario,
} from "../scenarios/itsa-foreign-property-period-detail.js";
import { findDatedPeriodBodyError, usesCumulativeModel, validatePathParams } from "./itsa-foreign-property-period.js";

const TAX_YEAR_NOT_SUPPORTED = {
  code: "RULE_TAX_YEAR_NOT_SUPPORTED",
  message: "The tax year specified does not lie within the supported range",
};

export function apiEndpoint(app) {
  // GET /individuals/business/property/foreign/{nino}/{businessId}/period/{taxYear}/{submissionId}
  app.get("/individuals/business/property/foreign/:nino/:businessId/period/:taxYear/:submissionId", (req, res) => {
    const { nino, businessId, taxYear, submissionId } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-foreign-property-period-detail] GET /individuals/business/property/foreign/${nino}/${businessId}/period/${taxYear}/${submissionId}`,
    );

    if (!validatePathParams(req, res)) return;
    if (usesCumulativeModel(taxYear)) return res.status(400).json(TAX_YEAR_NOT_SUPPORTED);

    const result = getForeignPropertyPeriodDetailForScenario(govTestScenario);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json(result.periodSummary);
  });

  // PUT /individuals/business/property/foreign/{nino}/{businessId}/period/{taxYear}/{submissionId}
  app.put("/individuals/business/property/foreign/:nino/:businessId/period/:taxYear/:submissionId", (req, res) => {
    const { nino, businessId, taxYear, submissionId } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-foreign-property-period-detail] PUT /individuals/business/property/foreign/${nino}/${businessId}/period/${taxYear}/${submissionId}`,
    );

    if (!validatePathParams(req, res)) return;
    if (usesCumulativeModel(taxYear)) return res.status(400).json(TAX_YEAR_NOT_SUPPORTED);

    const bodyError = findDatedPeriodBodyError(nino, taxYear, req.body, { requireRentAmount: false });
    if (bodyError) return res.status(bodyError.status).json(bodyError.body);

    const scenarioError = getForeignPropertyPeriodAmendErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: HMRC's foreign property amend answers 200 with no body.
    res.setHeader("x-correlationid", randomUUID());
    res.status(200).send();
  });
}
