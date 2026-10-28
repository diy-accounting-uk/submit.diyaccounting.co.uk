// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/jointFiling.js
// The accounts and the Company Tax Return filed from one review share a jointFilingId. Both posts
// carry it, each submission stores it, and each receipt repeats it so the two show as one filing.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read the optional jointFilingId from a parsed request body.
 * @param {object|undefined} body
 * @param {string[]} errorMessages - a malformed id adds a message here
 * @returns {string|undefined} the lower-case UUID, or undefined when the filing is not part of a pair
 */
export function readJointFilingId(body, errorMessages) {
  const value = body?.jointFilingId;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    errorMessages.push("Invalid jointFilingId - must be a UUID");
    return undefined;
  }
  return value.toLowerCase();
}

/**
 * The fields a stored record or receipt repeats for a filing that is half of a pair.
 * @param {string|undefined} jointFilingId
 * @returns {{jointFilingId: string}|{}}
 */
export function jointFilingFields(jointFilingId) {
  return jointFilingId ? { jointFilingId } : {};
}
