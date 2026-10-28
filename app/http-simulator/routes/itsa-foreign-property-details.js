// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/itsa-foreign-property-details.js
// HMRC Property Business v6.0 endpoint (2026-27 onwards)
// Handles: GET|POST /individuals/business/property/foreign/{nino}/{businessId}/details/{taxYear}
//          PUT      /individuals/business/property/foreign/{nino}/details/{propertyId}/{taxYear}

import { randomUUID } from "crypto";
import {
  getForeignPropertyDetailsGetErrorForScenario,
  getForeignPropertyDetailsWriteErrorForScenario,
} from "../scenarios/itsa-foreign-property-details.js";
import { isValidCountryCode, isValidPropertyId, taxYearStartYear, validatePathParams } from "./itsa-foreign-property-period.js";
import { addForeignProperty, findForeignProperty, getForeignProperties, getForeignPropertiesForNino } from "../state/store.js";

/** The first tax year the foreign property details endpoints serve. */
const DETAILS_START_YEAR = 2026;

const CREATE_END_REASONS = ["no-longer-renting-property-out", "disposal"];
const UPDATE_END_REASONS = ["no-longer-renting-property-out", "disposal", "added-in-error"];

const taxYearNotSupported = {
  status: 400,
  body: { code: "RULE_TAX_YEAR_NOT_SUPPORTED", message: "The tax year specified does not lie within the supported range" },
};

const badRequest = (code, message) => ({ status: 400, body: { code, message } });

function normaliseName(name) {
  return String(name).trim().toLowerCase();
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

/**
 * Check the fields create and update share: propertyName, and endDate with endReason.
 * @returns {null|{status: number, body: object}} the first error, or null when the fields are valid
 */
function findDetailsFieldError(body, taxYear, endReasons) {
  const { propertyName, endDate, endReason } = body;
  if (typeof propertyName !== "string" || propertyName.trim() === "" || propertyName.length > 105) {
    return badRequest("FORMAT_PROPERTY_NAME", "The provided property name is invalid");
  }
  if (endDate !== undefined && !isValidDate(endDate)) return badRequest("FORMAT_END_DATE", "The provided end date is invalid");
  if (endReason !== undefined && !endReasons.includes(endReason))
    return badRequest("FORMAT_END_REASON", "The provided end reason is invalid");
  if ((endDate === undefined) !== (endReason === undefined)) {
    return badRequest("RULE_MISSING_END_DETAILS", "An end date needs an end reason, and an end reason needs an end date");
  }
  if (endDate !== undefined) {
    const startYear = taxYearStartYear(taxYear);
    if (endDate < `${startYear}-04-06`)
      return badRequest("RULE_END_DATE_BEFORE_TAX_YEAR_START", "The end date is before the start of the tax year");
    if (endDate > `${startYear + 1}-04-05`)
      return badRequest("RULE_END_DATE_AFTER_TAX_YEAR_END", "The end date is after the end of the tax year");
  }
  return null;
}

function respond(res, status, body) {
  res.setHeader("x-correlationid", randomUUID());
  if (body === undefined) return res.status(status).send();
  res.setHeader("Content-Type", "application/json");
  return res.status(status).json(body);
}

export function apiEndpoint(app) {
  // GET /individuals/business/property/foreign/{nino}/{businessId}/details/{taxYear}
  app.get("/individuals/business/property/foreign/:nino/:businessId/details/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-foreign-property-details] GET /individuals/business/property/foreign/${nino}/${businessId}/details/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;
    if (taxYearStartYear(taxYear) < DETAILS_START_YEAR) return res.status(taxYearNotSupported.status).json(taxYearNotSupported.body);

    const scenarioError = getForeignPropertyDetailsGetErrorForScenario(govTestScenario);
    if (scenarioError) return res.status(scenarioError.status).json(scenarioError.body);

    // A property that ended in an earlier tax year is not listed again.
    const listed = getForeignProperties(nino, businessId).filter(
      (property) => !property.endDate || property.endDate >= `${taxYearStartYear(taxYear)}-04-06`,
    );
    if (listed.length === 0) {
      return res.status(404).json({ code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" });
    }
    respond(res, 200, { foreignPropertyDetails: listed });
  });

  // POST /individuals/business/property/foreign/{nino}/{businessId}/details/{taxYear}
  app.post("/individuals/business/property/foreign/:nino/:businessId/details/:taxYear", (req, res) => {
    const { nino, businessId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-foreign-property-details] POST /individuals/business/property/foreign/${nino}/${businessId}/details/${taxYear}`,
    );

    if (!validatePathParams(req, res)) return;
    if (taxYearStartYear(taxYear) < DETAILS_START_YEAR) return res.status(taxYearNotSupported.status).json(taxYearNotSupported.body);

    const body = req.body;
    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      return res
        .status(400)
        .json({ code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", message: "An empty or non-matching body was submitted" });
    }
    if (!isValidCountryCode(body.countryCode)) {
      return res.status(400).json({ code: "FORMAT_COUNTRY_CODE", message: "The provided Country code is invalid" });
    }
    const fieldError = findDetailsFieldError(body, taxYear, CREATE_END_REASONS);
    if (fieldError) return res.status(fieldError.status).json(fieldError.body);

    const scenarioError = getForeignPropertyDetailsWriteErrorForScenario(govTestScenario);
    if (scenarioError) return res.status(scenarioError.status).json(scenarioError.body);

    const nameTaken = getForeignProperties(nino, businessId).some(
      (property) => property.countryCode === body.countryCode && normaliseName(property.propertyName) === normaliseName(body.propertyName),
    );
    if (nameTaken) {
      return res
        .status(400)
        .json({ code: "RULE_DUPLICATE_PROPERTY_NAME", message: "Foreign property name already exists for the same country" });
    }

    const propertyId = randomUUID();
    addForeignProperty(nino, businessId, {
      submittedOn: new Date().toISOString(),
      propertyId,
      propertyName: body.propertyName,
      countryCode: body.countryCode,
      ...(body.endDate ? { endDate: body.endDate, endReason: body.endReason } : {}),
    });
    respond(res, 200, { propertyId });
  });

  // PUT /individuals/business/property/foreign/{nino}/details/{propertyId}/{taxYear}
  app.put("/individuals/business/property/foreign/:nino/details/:propertyId/:taxYear", (req, res) => {
    const { nino, propertyId, taxYear } = req.params;
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(
      `[http-simulator:itsa-foreign-property-details] PUT /individuals/business/property/foreign/${nino}/details/${propertyId}/${taxYear}`,
    );

    if (!validatePathParams(req, res, { businessId: false })) return;
    if (!isValidPropertyId(propertyId)) {
      return res.status(400).json({ code: "FORMAT_PROPERTY_ID", message: "The provided property ID is invalid" });
    }
    if (taxYearStartYear(taxYear) < DETAILS_START_YEAR) return res.status(taxYearNotSupported.status).json(taxYearNotSupported.body);

    const body = req.body;
    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      return res
        .status(400)
        .json({ code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", message: "An empty or non-matching body was submitted" });
    }
    const fieldError = findDetailsFieldError(body, taxYear, UPDATE_END_REASONS);
    if (fieldError) return res.status(fieldError.status).json(fieldError.body);

    const scenarioError = getForeignPropertyDetailsWriteErrorForScenario(govTestScenario);
    if (scenarioError) return res.status(scenarioError.status).json(scenarioError.body);

    const property = findForeignProperty(nino, propertyId);
    if (!property) {
      return res.status(404).json({ code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" });
    }
    const nameTaken = getForeignPropertiesForNino(nino).some(
      (other) =>
        other.propertyId !== propertyId &&
        other.countryCode === property.countryCode &&
        normaliseName(other.propertyName) === normaliseName(body.propertyName),
    );
    if (nameTaken) {
      return res
        .status(400)
        .json({ code: "RULE_DUPLICATE_PROPERTY_NAME", message: "Foreign property name already exists for the same country" });
    }

    property.propertyName = body.propertyName;
    if (body.endDate) {
      property.endDate = body.endDate;
      property.endReason = body.endReason;
    }
    respond(res, 204);
  });
}
