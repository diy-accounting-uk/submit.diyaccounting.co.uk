// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/dueList.js
// What a due list request may hold: a business of one of four kinds, and rows a page read from HMRC.
// A row holds only the dates and kind of a filing or payment, so a request that carries any other
// field (a VRN, a NINO, a period key, an amount) is refused before anything is stored.

import { BundleAuthorizationError, BundleEntitlementError } from "./bundleManagement.js";
import { http401UnauthorizedResponse, http403ForbiddenResponse, http500ServerErrorResponse } from "../lib/httpResponseHelper.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/services/dueList.js" });

// The most businesses one account's due list holds, as the company watch list does.
export const DUE_LIST_BUSINESS_CAP = 50;
// The most rows one account's due list holds.
export const DUE_LIST_ROW_CAP = 500;

export const BUSINESS_KINDS = ["company", "watched", "vat", "sole-trader"];
// The kinds a daily job reads again from Companies House or HMRC.
const REFRESHED_KINDS = ["company", "watched", "sole-trader"];

const BUSINESS_ID = /^[A-Za-z0-9-]{1,40}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROW_TYPE = /^[a-z0-9-]{1,40}$/;
const MAX_LABEL_LENGTH = 100;

// The fields a page sends for a row it read from HMRC; the server adds businessId, readAt, status and ttl.
const ROW_FIELDS = ["type", "filterType", "periodStart", "periodEnd", "dueDate", "kind", "source"];
const BUSINESS_FIELDS = ["kind", "label", "companyNumber", "itsa"];

const isIsoDate = (value) => typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** @returns {boolean} Whether a value can be a business id in the path */
export function isValidBusinessId(value) {
  return typeof value === "string" && BUSINESS_ID.test(value);
}

/**
 * Checks a business from a request body.
 * @param {object|null} body
 * @param {(value: string) => {valid: boolean, normalised: string}} isCompanyNumber - The company number check
 * @returns {{business: object|null, errors: string[]}} The business's fields, with its company number normalised
 */
export function validateBusiness(body, isCompanyNumber) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { business: null, errors: ["Request body must be a JSON object"] };
  const errors = Object.keys(body)
    .filter((name) => !BUSINESS_FIELDS.includes(name))
    .map((name) => `A business holds no field ${name}`);
  const { kind, label, companyNumber, itsa } = body;
  if (!BUSINESS_KINDS.includes(kind)) errors.push(`kind must be one of ${BUSINESS_KINDS.join(", ")}`);
  if (typeof label !== "string" || label.trim() === "" || label.length > MAX_LABEL_LENGTH) {
    errors.push(`label must be text of 1 to ${MAX_LABEL_LENGTH} characters`);
  }
  const business = { kind, label: typeof label === "string" ? label.trim() : label };
  if (kind === "company" || kind === "watched") {
    const { valid, normalised } = isCompanyNumber(companyNumber);
    if (typeof companyNumber !== "string" || !valid) errors.push("companyNumber must be an 8-character company number");
    else business.companyNumber = normalised;
  } else if (companyNumber !== undefined) {
    errors.push(`A ${kind} business holds no companyNumber`);
  }
  if (itsa !== undefined) {
    if (kind !== "sole-trader") errors.push(`A ${kind} business holds no itsa`);
    else if (typeof itsa !== "boolean") errors.push("itsa must be true or false");
    else business.itsa = itsa;
  }
  return { business: errors.length ? null : business, errors };
}

/**
 * The fields a business item adds for the daily refresh: a company, a watched company and a sole
 * trader are read again from today.
 * @param {string} kind
 * @param {string} today - YYYY-MM-DD
 */
export function refreshJobOf(kind, today) {
  return REFRESHED_KINDS.includes(kind) ? { job: "refresh", jobOn: today } : {};
}

/**
 * Checks the rows a page read from HMRC for one business.
 * @param {object|null} body - { businessId, rows }
 * @returns {{businessId: string|undefined, rows: object[], errors: string[]}}
 */
export function validateHmrcRows(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { businessId: undefined, rows: [], errors: ["Request body must be a JSON object"] };
  const errors = Object.keys(body)
    .filter((name) => !["businessId", "rows"].includes(name))
    .map((name) => `The request holds no field ${name}`);
  const { businessId, rows } = body;
  if (!isValidBusinessId(businessId)) errors.push("businessId must name a business");
  if (!Array.isArray(rows)) errors.push("rows must be a list");
  else if (rows.length > DUE_LIST_ROW_CAP) errors.push(`rows holds at most ${DUE_LIST_ROW_CAP} rows`);
  const valid = [];
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const where = `rows[${index}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`${where} must be an object`);
      return;
    }
    const outside = Object.keys(row).filter((name) => !ROW_FIELDS.includes(name));
    for (const name of outside) errors.push(`${where} holds a field a due list row does not keep: ${name}`);
    if (row.source !== "hmrc") errors.push(`${where}.source must be hmrc`);
    if (typeof row.type !== "string" || !ROW_TYPE.test(row.type)) errors.push(`${where}.type must name a filing or payment`);
    if (row.filterType !== undefined && (typeof row.filterType !== "string" || !ROW_TYPE.test(row.filterType))) {
      errors.push(`${where}.filterType must name a filter`);
    }
    if (!["filing", "payment"].includes(row.kind)) errors.push(`${where}.kind must be filing or payment`);
    if (row.periodEnd !== undefined && !isIsoDate(row.periodEnd)) errors.push(`${where}.periodEnd must be YYYY-MM-DD`);
    if (row.periodStart !== undefined && !isIsoDate(row.periodStart)) errors.push(`${where}.periodStart must be YYYY-MM-DD`);
    if (!isIsoDate(row.dueDate)) errors.push(`${where}.dueDate must be YYYY-MM-DD`);
    // A row with no period (a final declaration, a payment on account, an identity verification)
    // is keyed by its due date, which the row key takes as the date in place of a period end.
    if (outside.length === 0) valid.push({ ...row, businessId, ...(row.periodEnd === undefined ? { date: row.dueDate } : {}) });
  });
  return { businessId, rows: errors.length ? [] : valid, errors };
}

// The fields of a stored item the API answers: never the hashed sub, the raw sub or the ttl.
const STORED_ONLY = ["hashedSub", "sub", "ttl"];

/** A stored business or row as the API answers it. */
export function publicItem(item) {
  return Object.fromEntries(Object.entries(item).filter(([name]) => !STORED_ONLY.includes(name)));
}

/**
 * The JSON answer to a refused bundle check: 401 without a valid sign-in, 403 without the activity,
 * 500 when the check itself failed.
 */
export function http403ForbiddenFromBundleEnforcement(error, request) {
  if (error instanceof BundleAuthorizationError) {
    return http401UnauthorizedResponse({
      request,
      message: error.message,
      error: { code: error.details?.code || "UNAUTHORIZED", ...error.details },
    });
  }
  if (!(error instanceof BundleEntitlementError)) {
    logger.error({ message: "Unexpected error during bundle enforcement", error: error.message });
    return http500ServerErrorResponse({ request, message: "Authorization failure while checking entitlements" });
  }
  return http403ForbiddenResponse({
    request,
    message: "Forbidden - missing or insufficient bundle entitlement",
    error: { code: error.details?.code || "BUNDLE_ENTITLEMENT_REQUIRED", ...error.details },
  });
}
