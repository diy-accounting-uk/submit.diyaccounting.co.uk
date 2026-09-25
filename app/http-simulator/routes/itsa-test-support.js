// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-test-support.js
// HMRC Self Assessment Test Support API
// Handles: POST /individuals/self-assessment-test-support/business/{nino}
//          POST /individuals/self-assessment-test-support/itsa-status/{nino}/{taxYear}

import { generateBusinessId } from "../scenarios/business-details.js";
import { addTestSupportBusiness } from "../state/store.js";

/**
 * Validate National Insurance number format (two letters, six digits, one suffix letter).
 * Matches app/lib/hmrcValidation.js#isValidNino without importing across the app/simulator
 * boundary - the simulator is deliberately standalone from the app it's simulating for.
 */
function isValidNino(nino) {
  const normalized = String(nino).replace(/\s+/g, "").toUpperCase();
  return /^(?!BG|GB|NK|KN|TN|NT|ZZ)[ABCEGHJ-PRSTW-Z][ABCEGHJ-NPRSTW-Z]\d{6}[A-D]$/.test(normalized);
}

const TAX_YEAR_PATTERN = /^\d{4}-\d{2}$/;

export function apiEndpoint(app) {
  // POST /individuals/self-assessment-test-support/business/{nino}
  app.post("/individuals/self-assessment-test-support/business/:nino", (req, res) => {
    const { nino } = req.params;

    console.log(`[http-simulator:itsa-test-support] POST /individuals/self-assessment-test-support/business/${nino}`);

    if (!isValidNino(nino)) {
      return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    }

    const { typeOfBusiness } = req.body || {};
    if (!typeOfBusiness) {
      return res.status(400).json({
        code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        message: "An empty or non-matching body was submitted",
      });
    }

    const businessId = generateBusinessId();
    // Kept per NINO so the ITSA Business Details list route can hand this run's own business
    // back to it - the sandbox's Business Details endpoint otherwise serves canned data that
    // never reflects a business this endpoint just created.
    addTestSupportBusiness(nino, { ...req.body, businessId });

    res.setHeader("Content-Type", "application/json");
    res.status(201).json({ businessId });
  });

  // POST /individuals/self-assessment-test-support/itsa-status/{nino}/{taxYear}
  app.post("/individuals/self-assessment-test-support/itsa-status/:nino/:taxYear", (req, res) => {
    const { nino, taxYear } = req.params;

    console.log(`[http-simulator:itsa-test-support] POST /individuals/self-assessment-test-support/itsa-status/${nino}/${taxYear}`);

    if (!isValidNino(nino)) {
      return res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    }
    if (!TAX_YEAR_PATTERN.test(taxYear)) {
      return res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The taxYear format is invalid" });
    }

    res.status(204).send();
  });
}
