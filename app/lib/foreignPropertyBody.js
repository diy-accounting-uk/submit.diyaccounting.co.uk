// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/foreignPropertyBody.js

import { isValidCountryCode, isValidIsoDate, resolveForeignPropertyEntryKey } from "./hmrcValidation.js";

const PROPERTY_ID_PATTERN = /^\S{1,50}$/;
const PROPERTY_NAME_MAX_LENGTH = 105;

const DUPLICATE_KEY_CODES = {
  countryCode: "RULE_DUPLICATE_COUNTRY_CODE",
  propertyId: "RULE_DUPLICATE_PROPERTY_ID",
};

/**
 * A foreign property body was refused before it reached HMRC, because HMRC always refuses a
 * body of this shape. Callers turn it into a 400.
 */
export class ForeignPropertyValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ForeignPropertyValidationError";
    this.code = code;
  }
}

function roundToTwoDecimalPlaces(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Copy a value and drop everything the caller left unanswered. Numbers round to two decimal
 * places, booleans stay (a "no" is an answer), blank strings, null and undefined go, and an
 * object or array with nothing left in it goes too, because HMRC refuses an empty object.
 * @param {*} value
 * @returns {*} the cleaned value, or undefined when nothing is left
 */
function clean(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return roundToTwoDecimalPlaces(value);
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (Array.isArray(value)) {
    const items = value.map(clean).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, inner]) => [key, clean(inner)])
      .filter(([, inner]) => inner !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
  return undefined;
}

function checkExpenses(entry, key) {
  const expenses = entry.expenses;
  if (!expenses || typeof expenses !== "object" || expenses.consolidatedExpenses === undefined) return;
  const itemised = Object.keys(expenses).filter((name) => name !== "consolidatedExpenses");
  if (itemised.length > 0) {
    throw new ForeignPropertyValidationError(
      "RULE_BOTH_EXPENSES_SUPPLIED",
      `Entry ${entry[key]} has both itemised expenses and consolidated expenses`,
    );
  }
}

/**
 * Build the list of foreign property entries for a period, annual or adjustment request.
 *
 * Each entry is keyed by countryCode up to 2025-26 and by propertyId from 2026-27. An entry
 * with no figures is left out, every number is rounded to two places, and a repeated key or an
 * entry that mixes itemised and consolidated expenses is refused before HMRC sees it.
 * @param {string} taxYear - Tax year in YYYY-YY form
 * @param {Array<Object>} entries - The caller's entries, each with the key and its sections
 * @returns {Array<Object>} the entries to send, possibly empty
 * @throws {ForeignPropertyValidationError}
 */
export function buildForeignPropertyEntries(taxYear, entries) {
  const key = resolveForeignPropertyEntryKey(taxYear);
  const otherKey = key === "countryCode" ? "propertyId" : "countryCode";
  if (entries === undefined || entries === null) return [];
  if (!Array.isArray(entries)) {
    throw new ForeignPropertyValidationError("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", "Entries must be a list");
  }

  const seen = new Set();
  const built = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      throw new ForeignPropertyValidationError("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", "Each entry must be an object");
    }
    if (entry[otherKey] !== undefined) {
      throw new ForeignPropertyValidationError(
        "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED",
        `Tax year ${taxYear} identifies an entry by ${key}, not ${otherKey}`,
      );
    }
    const keyValue = entry[key];
    if (keyValue === undefined || keyValue === null || keyValue === "") {
      throw new ForeignPropertyValidationError("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", `Each entry needs a ${key}`);
    }
    const keyIsValid = key === "countryCode" ? isValidCountryCode(keyValue) : PROPERTY_ID_PATTERN.test(String(keyValue));
    if (!keyIsValid) {
      throw new ForeignPropertyValidationError("FORMAT_" + key.toUpperCase(), `Invalid ${key} format: ${keyValue}`);
    }
    if (seen.has(keyValue)) {
      throw new ForeignPropertyValidationError(DUPLICATE_KEY_CODES[key], `${key} ${keyValue} appears in more than one entry`);
    }
    seen.add(keyValue);

    const sections = { ...entry };
    delete sections[key];
    const cleaned = clean(sections);
    if (!cleaned) continue;
    checkExpenses({ ...cleaned, [key]: keyValue }, key);
    built.push({ [key]: keyValue, ...cleaned });
  }
  return built;
}

/**
 * Build the foreignFhlEea section of a dated period or annual request (2024-25 and before).
 * Empty parts are dropped, numbers are rounded to two places, and itemised and consolidated
 * expenses together are refused before HMRC sees them.
 * @param {Object|undefined} section - The caller's foreignFhlEea object
 * @returns {Object|undefined} the section to send, or undefined when it has nothing in it
 * @throws {ForeignPropertyValidationError}
 */
export function buildForeignFhlEeaSection(section) {
  if (section === undefined || section === null) return undefined;
  if (typeof section !== "object" || Array.isArray(section)) {
    throw new ForeignPropertyValidationError("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", "foreignFhlEea must be an object");
  }
  const cleaned = clean(section);
  if (!cleaned) return undefined;
  const expenses = cleaned.expenses;
  if (expenses && expenses.consolidatedExpenses !== undefined && Object.keys(expenses).length > 1) {
    throw new ForeignPropertyValidationError(
      "RULE_BOTH_EXPENSES_SUPPLIED",
      "foreignFhlEea has both itemised expenses and consolidated expenses",
    );
  }
  return cleaned;
}

/**
 * Build the body of Create or Update Foreign Property Details.
 *
 * The name is required and is 1 to 105 characters. An end reason needs an end date. Create needs
 * the country code; Update does not send it.
 * @param {Object} details
 * @param {string} [details.propertyName]
 * @param {string} [details.countryCode]
 * @param {string} [details.endDate]
 * @param {string} [details.endReason]
 * @param {Object} options
 * @param {boolean} options.create - true for Create (name and country required)
 * @returns {Object} the HMRC request body
 * @throws {ForeignPropertyValidationError}
 */
export function buildForeignPropertyDetailsBody({ propertyName, countryCode, endDate, endReason }, { create }) {
  const body = {};
  const hasName = propertyName !== undefined && propertyName !== null && propertyName !== "";
  if (hasName) {
    if (typeof propertyName !== "string" || propertyName.length > PROPERTY_NAME_MAX_LENGTH) {
      throw new ForeignPropertyValidationError("FORMAT_PROPERTY_NAME", `propertyName must be 1 to ${PROPERTY_NAME_MAX_LENGTH} characters`);
    }
    body.propertyName = propertyName;
  } else {
    throw new ForeignPropertyValidationError("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", "Missing propertyName");
  }

  if (create) {
    if (!isValidCountryCode(countryCode)) {
      throw new ForeignPropertyValidationError("FORMAT_COUNTRY_CODE", "countryCode must be three upper-case letters");
    }
    body.countryCode = countryCode;
  }

  const hasEndDate = endDate !== undefined && endDate !== null && endDate !== "";
  const hasEndReason = endReason !== undefined && endReason !== null && endReason !== "";
  if (hasEndReason && !hasEndDate) {
    throw new ForeignPropertyValidationError("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", "endReason needs an endDate");
  }
  if (hasEndDate) {
    if (typeof endDate !== "string" || !isValidIsoDate(endDate)) {
      throw new ForeignPropertyValidationError("FORMAT_END_DATE", "endDate must be a date in YYYY-MM-DD form");
    }
    body.endDate = endDate;
  }
  if (hasEndReason) body.endReason = String(endReason);

  if (Object.keys(body).length === 0) {
    throw new ForeignPropertyValidationError("RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", "An empty body was submitted");
  }
  return body;
}
