// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/itsaSubmissionModel.js
//
// Mirrors app/lib/hmrcValidation.js's isValidTaxYear/resolveItsaSubmissionModel boundary on the
// client, so an ITSA page can choose dated-quarter or cumulative-total wording and behaviour
// before a request ever reaches the handler. The handler stays the one place that enforces the
// boundary; this copy exists only to drive what the page shows.

(function () {
  const TAX_YEAR_PATTERN = /^(\d{4})-(\d{2})$/;

  // The first tax year ITSA's cumulative period summary model applies to, matching
  // app/lib/hmrcValidation.js's CUMULATIVE_MODEL_START_TAX_YEAR.
  const CUMULATIVE_MODEL_START_YEAR = 2025;

  function isValidTaxYear(taxYear) {
    if (typeof taxYear !== "string") {
      return false;
    }
    const match = TAX_YEAR_PATTERN.exec(taxYear);
    if (!match) {
      return false;
    }
    const startYear = Number(match[1]);
    const endYearSuffix = Number(match[2]);
    return endYearSuffix === (startYear + 1) % 100;
  }

  function resolveItsaSubmissionModel(taxYear) {
    if (!isValidTaxYear(taxYear)) {
      throw new Error(`Invalid taxYear format - must be YYYY-YY, got: ${taxYear}`);
    }
    const startYear = Number(taxYear.slice(0, 4));
    return startYear >= CUMULATIVE_MODEL_START_YEAR ? "cumulative" : "dated";
  }

  window.itsaSubmissionModel = { isValidTaxYear, resolveItsaSubmissionModel };
})();
