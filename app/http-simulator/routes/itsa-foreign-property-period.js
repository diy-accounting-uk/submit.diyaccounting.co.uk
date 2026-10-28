// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-foreign-property-period.js
// HMRC Property Business v6.0 endpoint (tax years 2024-25 and before)
// Handles: POST /individuals/business/property/foreign/{nino}/{businessId}/period/{taxYear}
// Also holds the path and entry checks every foreign property route shares.

import { randomUUID } from "crypto";
import { getForeignPropertyPeriodErrorForScenario } from "../scenarios/itsa-foreign-property-period.js";
import { findForeignProperty } from "../state/store.js";

/** The first tax year whose entries are keyed by propertyId instead of countryCode. */
const PROPERTY_ID_START_YEAR = 2026;

/** The first tax year served by the cumulative model; the dated period model ends the year before. */
const CUMULATIVE_START_YEAR = 2025;

const PROPERTY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ITEMISED_EXPENSE_FIELDS = [
  "premisesRunningCosts",
  "repairsAndMaintenance",
  "financialCosts",
  "professionalFees",
  "costOfServices",
  "travelCosts",
  "residentialFinancialCost",
  "broughtFwdResidentialFinancialCost",
  "other",
];

/**
 * Validate National Insurance number format (two letters, six digits, one suffix letter).
 * Matches app/lib/hmrcValidation.js#isValidNino without importing across the app/simulator
 * boundary - the simulator is deliberately standalone from the app it's simulating for.
 */
export function isValidNino(nino) {
  const normalized = String(nino).replace(/\s+/g, "").toUpperCase();
  return /^(?!BG|GB|NK|KN|TN|NT|ZZ)[ABCEGHJ-PRSTW-Z][ABCEGHJ-NPRSTW-Z]\d{6}[A-D]$/.test(normalized);
}

export function isValidBusinessId(businessId) {
  return /^X[A-Za-z0-9]IS\d{11}$/.test(businessId);
}

export function isValidPropertyId(propertyId) {
  return PROPERTY_ID_PATTERN.test(String(propertyId));
}

export function isValidCountryCode(countryCode) {
  return typeof countryCode === "string" && /^[A-Z]{3}$/.test(countryCode);
}

/** The year a tax year string starts in, for example 2026 for "2026-27". */
export function taxYearStartYear(taxYear) {
  return Number(String(taxYear).slice(0, 4));
}

/** True when entries for the tax year carry a propertyId rather than a countryCode. */
export function usesPropertyId(taxYear) {
  return taxYearStartYear(taxYear) >= PROPERTY_ID_START_YEAR;
}

/** True when the tax year is served by the cumulative model rather than the dated period model. */
export function usesCumulativeModel(taxYear) {
  return taxYearStartYear(taxYear) >= CUMULATIVE_START_YEAR;
}

/**
 * Check the nino, businessId and taxYear path parameters and answer the HMRC error when one is
 * wrong. A route whose path has no businessId passes `{ businessId: false }`.
 * @returns {boolean} true when every parameter is valid
 */
export function validatePathParams(req, res, { businessId = true } = {}) {
  const { nino, taxYear } = req.params;
  if (!isValidNino(nino)) {
    res.status(400).json({ code: "FORMAT_NINO", message: "The provided NINO is invalid" });
    return false;
  }
  if (businessId && !isValidBusinessId(req.params.businessId)) {
    res.status(400).json({ code: "FORMAT_BUSINESS_ID", message: "The provided businessId is invalid" });
    return false;
  }
  if (!/^\d{4}-\d{2}$/.test(taxYear)) {
    res.status(400).json({ code: "FORMAT_TAX_YEAR", message: "The provided taxYear is invalid" });
    return false;
  }
  if (Number(taxYear.slice(5)) !== (taxYearStartYear(taxYear) + 1) % 100) {
    res
      .status(400)
      .json({ code: "RULE_TAX_YEAR_RANGE_INVALID", message: "Tax year range invalid. A tax year range of one year is required" });
    return false;
  }
  return true;
}

function isEmptyObject(value) {
  return !value || typeof value !== "object" || Object.keys(value).length === 0;
}

const emptyBodyError = (paths) => ({
  status: 400,
  body: {
    code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
    message: "An empty or non-matching body was submitted",
    ...(paths ? { paths } : {}),
  },
});

/**
 * Check the list of entries every foreign property request carries, the way HMRC does: the list
 * is not empty, each entry has the key its tax year needs, no key repeats, a propertyId is one
 * the store holds, and an entry does not mix itemised and consolidated expenses.
 * @param {string} nino - the NINO the request is for
 * @param {string} taxYear - the tax year the request is for
 * @param {unknown} entries - the parsed entry list of the request body
 * @param {string} listPath - the JSON path of the list, for error paths
 * @returns {null|{status: number, body: object}} the first error, or null when the list is valid
 */
export function findEntryListError(nino, taxYear, entries, listPath) {
  if (!Array.isArray(entries) || entries.length === 0) return emptyBodyError([listPath]);

  const byPropertyId = usesPropertyId(taxYear);
  const keyField = byPropertyId ? "propertyId" : "countryCode";
  const seen = new Set();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const entryPath = `${listPath}/${index}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return emptyBodyError([entryPath]);

    const key = entry[keyField];
    const keyIsValid = byPropertyId ? isValidPropertyId(key) : isValidCountryCode(key);
    if (!keyIsValid) {
      return {
        status: 400,
        body: byPropertyId
          ? { code: "FORMAT_PROPERTY_ID", message: "The provided property ID is invalid", paths: [`${entryPath}/propertyId`] }
          : { code: "FORMAT_COUNTRY_CODE", message: "The provided Country code is invalid", paths: [`${entryPath}/countryCode`] },
      };
    }
    if (seen.has(key)) {
      return {
        status: 400,
        body: byPropertyId
          ? { code: "RULE_DUPLICATE_PROPERTY_ID", message: `The property ID '${key}' is duplicated for multiple properties` }
          : { code: "RULE_DUPLICATE_COUNTRY_CODE", message: "You cannot supply the same country code for multiple properties" },
      };
    }
    seen.add(key);

    if (byPropertyId && !findForeignProperty(nino, key)) {
      return {
        status: 400,
        body: { code: "RULE_PROPERTY_ID_MISMATCH", message: "The supplied property ID is not valid for this income source" },
      };
    }

    const expenses = entry.expenses;
    if (!isEmptyObject(expenses) && expenses.consolidatedExpenses !== undefined) {
      const hasItemised = ITEMISED_EXPENSE_FIELDS.some((field) => expenses[field] !== undefined);
      if (hasItemised) {
        return {
          status: 400,
          body: {
            code: "RULE_BOTH_EXPENSES_SUPPLIED",
            message: "Both expenses and consolidatedExpenses can not be present at the same time",
            paths: [`${entryPath}/expenses`],
          },
        };
      }
    }
  }
  return null;
}

/**
 * Check the body of a dated period create or amend: the FHL in the EEA section and the
 * country entries. The dated model needs foreignTaxCreditRelief in every country entry, and
 * on create it needs rentIncome.rentAmount as well.
 * @returns {null|{status: number, body: object}} the first error, or null when the body is valid
 */
export function findDatedPeriodBodyError(nino, taxYear, body, { requireRentAmount }) {
  const { foreignFhlEea, foreignNonFhlProperty } = body || {};
  if (isEmptyObject(foreignFhlEea) && foreignNonFhlProperty === undefined) return emptyBodyError();

  if (foreignFhlEea !== undefined) {
    if (isEmptyObject(foreignFhlEea)) return emptyBodyError(["/foreignFhlEea"]);
    const expenses = foreignFhlEea.expenses;
    const hasItemised = !isEmptyObject(expenses) && ITEMISED_EXPENSE_FIELDS.some((field) => expenses[field] !== undefined);
    if (hasItemised && expenses.consolidatedExpenses !== undefined) {
      return {
        status: 400,
        body: {
          code: "RULE_BOTH_EXPENSES_SUPPLIED",
          message: "Both expenses and consolidatedExpenses can not be present at the same time",
          paths: ["/foreignFhlEea/expenses"],
        },
      };
    }
  }

  if (foreignNonFhlProperty !== undefined) {
    const listError = findEntryListError(nino, taxYear, foreignNonFhlProperty, "/foreignNonFhlProperty");
    if (listError) return listError;
    for (let index = 0; index < foreignNonFhlProperty.length; index += 1) {
      const income = foreignNonFhlProperty[index].income;
      const path = `/foreignNonFhlProperty/${index}/income`;
      if (typeof income?.foreignTaxCreditRelief !== "boolean") return emptyBodyError([`${path}/foreignTaxCreditRelief`]);
      if (requireRentAmount && typeof income?.rentIncome?.rentAmount !== "number") return emptyBodyError([`${path}/rentIncome/rentAmount`]);
    }
  }
  return null;
}

export function apiEndpoint(app) {
  // POST /individuals/business/property/foreign/{nino}/{businessId}/period/{taxYear}
  app.post("/individuals/business/property/foreign/:nino/:businessId/period/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-foreign-property-period] POST /individuals/business/property/foreign/${nino}/${businessId}/period/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;

    if (usesCumulativeModel(taxYear)) {
      return res.status(400).json({
        code: "RULE_TAX_YEAR_NOT_SUPPORTED",
        message: "The tax year specified does not lie within the supported range",
      });
    }

    if (!req.body?.fromDate || !req.body?.toDate) {
      return res.status(400).json(emptyBodyError().body);
    }

    const bodyError = findDatedPeriodBodyError(nino, taxYear, req.body, { requireRentAmount: true });
    if (bodyError) return res.status(bodyError.status).json(bodyError.body);

    const scenarioError = getForeignPropertyPeriodErrorForScenario(govTestScenario);
    if (scenarioError) {
      return res.status(scenarioError.status).json(scenarioError.body);
    }

    // Default and STATEFUL: HMRC answers 201 with a generated submissionId.
    res.setHeader("Content-Type", "application/json");
    res.setHeader("x-correlationid", randomUUID());
    res.status(201).json({ submissionId: randomUUID() });
  });
}
