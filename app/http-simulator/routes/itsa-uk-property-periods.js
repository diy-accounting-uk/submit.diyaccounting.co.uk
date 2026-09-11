// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-uk-property-periods.js
// HMRC Property Business endpoint
// Handles: GET /individuals/business/property/{nino}/{businessId}/period/{taxYear}
// This path is untyped - it serves UK and foreign property alike, unlike the typed
// create/retrieve/amend paths under /property/uk/.

import { randomUUID } from "crypto";
import { getUkPropertyPeriodsForScenario } from "../scenarios/itsa-uk-property-periods.js";

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

export function apiEndpoint(app) {
  // GET /individuals/business/property/{nino}/{businessId}/period/{taxYear}
  app.get("/individuals/business/property/:nino/:businessId/period/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-uk-property-periods] GET /individuals/business/property/${nino}/${businessId}/period/${taxYear}`,
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

    const result = getUkPropertyPeriodsForScenario(govTestScenario);
    if (result.status) {
      return res.status(result.status).json(result.body);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.json({ periods: result.periods });
  });
}
