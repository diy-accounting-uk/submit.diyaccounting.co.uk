// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/accounts-filing-failure.js
// What a failed preview or filing of the micro-entity, dormant, small company or revised accounts
// left behind, in the failure panel of filing-failure.js: what reached Companies House, where the
// answers are, and the kind of failure with its next step.

import { classifyFilingFailure, showFailureDetail } from "./filing-failure.js";

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

export const ACCOUNTS_FAILURE_STAGES = { preview: "preview", filing: "filing" };

/**
 * What a failure at a stage sent: the preview sends nothing; a filing that failed was not taken by
 * Companies House, so nothing was filed.
 * @param {"preview"|"filing"} stage
 * @returns {string}
 */
export function accountsSentText(stage) {
  if (stage === ACCOUNTS_FAILURE_STAGES.preview) {
    return siteText(
      "ch.accounts.failure-sent-preview",
      "Nothing was sent to Companies House. The preview is built before anything is sent.",
    );
  }
  return siteText("ch.accounts.failure-sent-not-filed", "Companies House did not take the accounts, and nothing was filed.");
}

/**
 * Show the panel for a failed preview or filing of the accounts, in place of an earlier one.
 * @param {Document} doc
 * @param {object} error - the client's error for the answer
 * @param {"preview"|"filing"} stage
 */
export function showAccountsFailure(doc, error, stage) {
  return showFailureDetail(doc, {
    sent: accountsSentText(stage),
    answers: siteText("ct.failure-answers-in-form", "Your answers are still in this form."),
    failure: classifyFilingFailure(error, { service: "companiesHouse" }),
  });
}

/** Remove the panel of an earlier failure, when the person tries again. */
export function clearAccountsFailure(doc) {
  doc.getElementById("failureDetail")?.remove();
}
