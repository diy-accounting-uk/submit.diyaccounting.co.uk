// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-form-page.js
// The submit and result handling every Companies House form page on the shared filing route uses:
// it sends the form (window.submitCompaniesHouseForm, from submit.js), says the gateway took it,
// polls the outcome through companies-house-gateway-poll.js (window.pollCompaniesHouseForm), and
// writes the outcome, Companies House's reasons for a rejection, or the error into the page's
// result element. A form page gathers its fields and calls fileAndShowOutcome.

(function () {
  "use strict";

  function siteText(id, english, values) {
    if (window.siteText) return window.siteText(id, english, values);
    return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
  }

  function paragraph(text, className) {
    const p = document.createElement("p");
    if (className) p.className = className;
    p.textContent = text;
    return p;
  }

  // The words an error answers: the route's message, which joins its validation messages.
  function errorText(error) {
    return error?.body?.message || error?.message;
  }

  /**
   * File one form and show its outcome.
   * @param {object} input
   * @param {string} input.kind - the form's kind in companies-house-forms.js
   * @param {object} input.form - the company fields and the form's own fields
   * @param {HTMLElement} input.result - the element the outcome is written into
   * @param {object} [input.headers] - such as a developer-mode Gov-Test-Scenario, sent with every call
   * @returns {Promise<object|null>} the settled outcome, or null when it is still pending or failed
   */
  async function fileAndShowOutcome({ kind, form, result, headers = {} }) {
    result.replaceChildren();
    let submission;
    try {
      submission = await window.submitCompaniesHouseForm(kind, form, headers);
    } catch (error) {
      result.replaceChildren(paragraph(errorText(error), "error-message"));
      return null;
    }
    const poll = window.companiesHouseGatewayPoll;
    result.replaceChildren(
      paragraph(
        siteText("ch.form.sent", "Submission {number} was taken by the gateway. Waiting for Companies House...", {
          number: submission.submissionNumber,
        }),
      ),
    );
    let outcome;
    try {
      outcome = await poll.pollGatewayUntilSettled({
        submissionNumber: submission.submissionNumber,
        pollIntervalSeconds: submission.pollInterval,
        poll: () => window.pollCompaniesHouseForm(kind, submission.submissionNumber, headers),
      });
    } catch (error) {
      result.replaceChildren(paragraph(errorText(error), "error-message"));
      return null;
    }
    if (!poll.isSettled(outcome)) {
      result.replaceChildren(paragraph(poll.pendingNote({ ...submission, pollInterval: 0 })));
      return null;
    }
    const accepted = outcome.statusCode === "ACCEPT";
    const lines = [
      paragraph(
        siteText("ch.form.outcome", "Submission {number} was {status}.", {
          number: outcome.submissionNumber,
          status: poll.statusWord(outcome.statusCode),
        }),
        accepted ? "outcome outcome--ok" : "outcome outcome--error",
      ),
      ...(outcome.rejections || []).map((rejection) => paragraph(window.companiesHouseRejections.rejectionText(rejection))),
    ];
    result.replaceChildren(...lines);
    return outcome;
  }

  window.companiesHouseFormPage = { fileAndShowOutcome, errorText };
})();
