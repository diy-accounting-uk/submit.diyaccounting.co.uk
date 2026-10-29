// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/jointFiling.js
// The accounts and the Company Tax Return filed from one review share a jointFilingId. Both posts
// carry it, each submission stores it, and each receipt repeats it so the two show as one filing.
// A revision of the accounts and an amended return carry the same id, so the receipts page shows
// them under the filing they amend.

import { isValidIsoDate } from "../lib/hmrcValidation.js";

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

const MAX_REVISION_DIFFERENCES_LENGTH = 2000;

/**
 * Read the optional revision of accounts already filed: the date the original accounts were
 * approved and a description of what the revision changes. The revised accounts carry both.
 * @param {object|undefined} body
 * @param {string|undefined} dateApproved - the approval date of the revised accounts
 * @param {string[]} errorMessages
 * @returns {{originalDateOfApproval: string, differences: string}|undefined}
 */
export function readRevision(body, dateApproved, errorMessages) {
  const value = body?.revision;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    errorMessages.push("Invalid revision - must be an object");
    return undefined;
  }
  const originalDateOfApproval = value.originalDateOfApproval;
  const differences = typeof value.differences === "string" ? value.differences.trim() : "";
  if (!isValidIsoDate(originalDateOfApproval)) {
    errorMessages.push("Invalid or missing revision.originalDateOfApproval - must be YYYY-MM-DD");
  } else if (isValidIsoDate(dateApproved) && originalDateOfApproval > dateApproved) {
    errorMessages.push("revision.originalDateOfApproval is after the date the revised accounts are approved");
  }
  if (!differences) errorMessages.push("Missing revision.differences - say what the revision changes");
  if (differences.length > MAX_REVISION_DIFFERENCES_LENGTH) {
    errorMessages.push(`revision.differences is longer than ${MAX_REVISION_DIFFERENCES_LENGTH} characters`);
  }
  return { originalDateOfApproval, differences };
}

/**
 * Read the optional amended flag of a Company Tax Return request.
 * @param {object|undefined} body
 * @param {string[]} errorMessages
 * @returns {boolean}
 */
export function readAmended(body, errorMessages) {
  const value = body?.amended;
  if (value === undefined || value === null || value === false) return false;
  if (value !== true) errorMessages.push("Invalid amended - must be true or false");
  return value === true;
}

/**
 * The field a stored record or receipt repeats for an amended return or revised accounts.
 * @param {boolean} amended
 * @returns {{amended: true}|{}}
 */
export function amendedFields(amended) {
  return amended ? { amended: true } : {};
}
