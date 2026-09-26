// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/services/companies-house-error-messages.js
// Plain-English text for the Companies House XML Gateway's GovTalkErrors numbers. A
// GovTalkErrors block means the submission never reached Companies House at all, so every one of
// these describes a failed attempt, not a rejected filing - the numbers and their Text come from
// PLAN_COMPANIES_HOUSE.md's gateway envelope section and cases observed against the test service.

const GOVTALK_ERROR_MESSAGES = {
  100: "Companies House could not read part of the submission - a value sent was invalid or too long.",
  502: "Companies House could not authenticate this filing.",
  505: "Companies House rejected the form this page sent. This is a software fault, not something to fix on this page.",
  604: "The submission is missing a required field or carries invalid data.",
  5003: "Companies House does not recognise this account.",
  5006: "The credit account behind this filing does not have enough funds for Companies House's fee.",
  9984: "The credit account behind this filing does not have enough funds for Companies House's fee.",
  9999: "Companies House could not process this submission right now.",
  12682: "Every current officer for this company is already verified, so a statement carrying a verification statement is rejected.",
};

/**
 * Plain-English text for one GovTalkErrors/Error entry. Falls back to the gateway's own Text
 * when the number is not one of the known ones above, and to a generic message when neither is
 * available.
 * @param {{number?: number, text?: string}} govTalkError
 * @returns {string}
 */
export function describeGovTalkError(govTalkError) {
  const { number, text } = govTalkError || {};
  if (number !== undefined && GOVTALK_ERROR_MESSAGES[number]) {
    return GOVTALK_ERROR_MESSAGES[number];
  }
  return text || "Companies House rejected this submission.";
}

/**
 * Plain-English text for a whole GovTalkErrors array, one entry per error, most specific first.
 * @param {Array<{number?: number, text?: string}>} [govTalkErrors]
 * @returns {string[]}
 */
export function describeGovTalkErrors(govTalkErrors) {
  return (govTalkErrors || []).map(describeGovTalkError);
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.describeGovTalkError = describeGovTalkError;
  window.describeGovTalkErrors = describeGovTalkErrors;
}
