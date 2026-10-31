// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DEV-09 Simulate HMRC ITSA MTD API
// - **Use when:** a test needs Making Tax Digital for Income Tax Self Assessment endpoints without a real HMRC call.
// - **Does:** Eighteen route files under app/http-simulator/routes/itsa-*.js answer the ITSA endpoints. They cover business details, obligations, self-employment and UK property periods, crystallisation, status, BSAS, calculations, losses, claims and tax-liability adjustments. Each has a matching scenario module, keyed by the Gov-Test-Scenario header, registered in server.js.
// - **Run:** `import { apiEndpoint } from "app/http-simulator/routes/itsa-business-details.js"`
// - **Entry:** `app/http-simulator/routes/itsa-business-details.js:apiEndpoint`; `app/http-simulator/server.js:createApp`
// - **Files:** app/http-simulator/routes/itsa-business-details.js, app/http-simulator/routes/itsa-obligations.js, app/http-simulator/routes/itsa-self-employment-period.js, app/http-simulator/routes/itsa-self-employment-periods.js, app/http-simulator/routes/itsa-self-employment-period-detail.js, app/http-simulator/routes/itsa-self-employment-cumulative.js, app/http-simulator/routes/itsa-self-employment-annual.js, app/http-simulator/routes/itsa-uk-property-period.js, app/http-simulator/routes/itsa-uk-property-period-detail.js, app/http-simulator/routes/itsa-uk-property-cumulative.js, app/http-simulator/routes/itsa-uk-property-periods.js, app/http-simulator/routes/itsa-uk-property-annual.js, app/http-simulator/routes/itsa-crystallisation-obligations.js, app/http-simulator/routes/itsa-status.js, app/http-simulator/routes/itsa-bsas.js, app/http-simulator/routes/itsa-calculations.js, app/http-simulator/routes/itsa-losses-and-claims.js, app/http-simulator/routes/itsa-tax-liability-adjustments.js, app/http-simulator/scenarios/itsa-obligations.js, app/http-simulator/scenarios/itsa-self-employment-period.js, app/http-simulator/scenarios/itsa-self-employment-periods.js, app/http-simulator/scenarios/itsa-self-employment-period-detail.js, app/http-simulator/scenarios/itsa-self-employment-cumulative.js, app/http-simulator/scenarios/itsa-self-employment-annual.js, app/http-simulator/scenarios/itsa-uk-property-period.js, app/http-simulator/scenarios/itsa-uk-property-period-detail.js, app/http-simulator/scenarios/itsa-uk-property-cumulative.js, app/http-simulator/scenarios/itsa-uk-property-periods.js, app/http-simulator/scenarios/itsa-uk-property-annual.js, app/http-simulator/scenarios/itsa-crystallisation-obligations.js, app/http-simulator/scenarios/itsa-status.js, app/http-simulator/scenarios/itsa-bsas.js, app/http-simulator/scenarios/itsa-calculations.js, app/http-simulator/scenarios/itsa-losses-and-claims.js, app/http-simulator/scenarios/itsa-tax-liability-adjustments.js
// - **Keywords:** itsa, making tax digital, self assessment, self-employment, uk property, bsas, crystallisation, losses and claims, tax liability adjustments
// - **Related:** DEV-01, DEV-08
// @end-capability

// app/http-simulator/routes/itsa-business-details.js
// HMRC ITSA Business Details endpoint
// Handles: GET /individuals/business/details/{nino}/list

import { randomUUID } from "crypto";
import { getBusinessDetailsForScenario } from "../scenarios/business-details.js";
import { getTestSupportBusinesses } from "../state/store.js";

/**
 * Validate National Insurance number format (two letters, six digits, one suffix letter).
 * Matches app/lib/hmrcValidation.js#isValidNino without importing across the app/simulator
 * boundary - the simulator is deliberately standalone from the app it's simulating for.
 */
function isValidNino(nino) {
  const normalized = String(nino).replace(/\s+/g, "").toUpperCase();
  return /^(?!BG|GB|NK|KN|TN|NT|ZZ)[ABCEGHJ-PRSTW-Z][ABCEGHJ-NPRSTW-Z]\d{6}[A-D]$/.test(normalized);
}

export function apiEndpoint(app) {
  // GET /individuals/business/details/{nino}/list
  app.get("/individuals/business/details/:nino/list", (req, res) => {
    const { nino } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:itsa-business-details] GET /individuals/business/details/${nino}/list`);

    if (!isValidNino(nino)) {
      return res.status(400).json({
        code: "FORMAT_NINO",
        message: "The provided NINO is invalid",
      });
    }

    const result = getBusinessDetailsForScenario(govTestScenario, getTestSupportBusinesses(nino));

    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json({ listOfBusinesses: result.listOfBusinesses });
  });
}
