// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The types a due list row may have, each with the filter it is listed under. The due rules take a
// row's filter from here, and the due list API stores a row only when its type is one of these.

/** The filters of the due list's type filter. */
export const DUE_ROW_FILTER_TYPES = ["taxes", "accounts", "people", "shareholders", "other"];

/** Each row type and the filter it is listed under. */
export const DUE_ROW_TYPES = {
  "accounts": "accounts",
  "confirmation-statement": "shareholders",
  "ct600": "taxes",
  "ct-payment": "taxes",
  "vat-return": "taxes",
  "vat-payment": "taxes",
  "itsa-quarterly-update": "taxes",
  "itsa-final-declaration": "taxes",
  "sa-payment-on-account": "taxes",
  "sa-balancing-payment": "taxes",
  "officer-change": "people",
  "psc-change": "people",
  "ico-fee": "other",
};

/** @returns {boolean} Whether a value is the type of a due list row */
export function isDueRowType(value) {
  return typeof value === "string" && Object.hasOwn(DUE_ROW_TYPES, value);
}

/**
 * The filter a row type is listed under.
 * @param {string} type
 * @returns {string}
 */
export function filterTypeOf(type) {
  if (!isDueRowType(type)) throw new Error(`${type} is not a type of due list row`);
  return DUE_ROW_TYPES[type];
}
