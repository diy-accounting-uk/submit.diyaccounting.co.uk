// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/approval-date-check.js
// The date the directors approve accounts cannot be after today, in the UK. The accounts form and the
// accounts route share the rule and its words, as they share the balance sheet's arithmetic.

// The words the route answers; the form shows the same words through siteText.
export const APPROVAL_DATE_AFTER_TODAY_MESSAGE =
  "The date approved, {date}, is after today. Enter the date the directors approved the accounts.";

/**
 * Today's date in the UK, as YYYY-MM-DD.
 * @param {Date} now
 */
export function todayInLondon(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Whether a YYYY-MM-DD approval date is after today in the UK.
 * @param {string} dateApproved
 * @param {Date} now
 */
export function isApprovedAfterToday(dateApproved, now) {
  return String(dateApproved) > todayInLondon(now);
}

/**
 * The message for an approval date after today, in the words of APPROVAL_DATE_AFTER_TODAY_MESSAGE.
 * @param {string} dateApproved
 * @param {string} [template] - the same message in the reader's language
 */
export function approvalDateAfterTodayMessage(dateApproved, template = APPROVAL_DATE_AFTER_TODAY_MESSAGE) {
  return template.replace("{date}", dateApproved);
}

/**
 * On an accounts form: show the problem beside the approval date when it is after today, in the
 * reader's language. Answers true when it is.
 * @param {HTMLInputElement} input - the date approved
 * @param {Date} now
 */
export function showApprovalDateAfterToday(input, now) {
  if (!isApprovedAfterToday(input.value, now)) return false;
  const template = globalThis.siteText(
    "ch.micro.approved-after-today",
    "The date approved, {date}, is after today. Enter the date the directors approved the accounts.",
  );
  globalThis.formErrors.showFormErrors([
    { input, message: approvalDateAfterTodayMessage(input.value, template), passes: () => !isApprovedAfterToday(input.value, now) },
  ]);
  return true;
}
