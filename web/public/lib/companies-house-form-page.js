// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-form-page.js
// The submit and result handling every Companies House form page on the shared filing route uses:
// it sends the form (window.submitCompaniesHouseForm, from submit.js), says the gateway took it,
// polls the outcome through companies-house-gateway-poll.js (window.pollCompaniesHouseForm), and
// writes the outcome, Companies House's reasons for a rejection, or the error into the page's
// result element. A form page gathers its fields and calls fileAndShowOutcome; it registers the
// refusals it words itself with registerMessages.

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

  // A link to an accepted filing's receipt, on the receipts page in the page's language.
  function receiptLink(receiptId) {
    const p = document.createElement("p");
    const link = document.createElement("a");
    const query = new URLSearchParams({ receipt: receiptId + ".json" });
    link.href = `../hmrc/receipt/receipts.html?${query}`;
    link.textContent = siteText("ch.form.receipt-link", "See the receipt for this filing");
    p.appendChild(link);
    return p;
  }

  /**
   * Today's date in the United Kingdom, as YYYY-MM-DD: the latest date a form's dates may hold, and
   * the date a filing is signed. A UTC date is the day before between midnight and 1am in summer.
   * @param {Date} [now]
   * @returns {string}
   */
  function todayInLondon(now = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }

  // The refusals a form's page words itself, by the id the route names them by in messageIds.
  const pageMessages = new Map();

  /**
   * Register the refusals a form's page words in the reader's language. Each value is a function
   * that returns window.siteText("<id>", "<English>") with literal arguments, so the Welsh build
   * finds the string; the route pushes { text, id } with the same id (companiesHouseForms.js).
   * @param {Object<string, function(): string>} messages
   */
  function registerMessages(messages) {
    Object.entries(messages).forEach(([id, text]) => pageMessages.set(id, text));
  }

  // The words an error answers: the page's own words for each refusal the route names by id, when
  // the page has all of them, else the route's message, which joins its validation messages.
  function errorText(error) {
    const ids = error?.body?.messageIds;
    if (Array.isArray(ids) && ids.length > 0 && ids.every((id) => pageMessages.has(id))) {
      return ids.map((id) => pageMessages.get(id)()).join(" ");
    }
    return error?.body?.message || error?.message;
  }

  /**
   * File one form and show its outcome.
   * @param {object} input
   * @param {string} input.kind - the form's kind in companies-house-forms.js
   * @param {object} input.form - the company fields and the form's own fields
   * @param {HTMLElement} input.result - the element the outcome is written into
   * @param {object} [input.headers] - such as a developer-mode Gov-Test-Scenario, sent with every call
   * @param {(error: Error) => boolean} [input.onRefusal] - a form's own handling of a refused filing:
   *   answers true when it showed the refusal itself, and the error is then not written into result
   * @returns {Promise<object|null>} the settled outcome, or null when it is still pending or failed
   */
  async function fileAndShowOutcome({ kind, form, result, headers = {}, onRefusal }) {
    result.replaceChildren();
    let submission;
    try {
      submission = await window.submitCompaniesHouseForm(kind, form, headers);
    } catch (error) {
      if (onRefusal && onRefusal(error)) return null;
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
    if (accepted && outcome.receiptId) lines.push(receiptLink(outcome.receiptId));
    result.replaceChildren(...lines);
    return outcome;
  }

  window.companiesHouseFormPage = { fileAndShowOutcome, errorText, registerMessages, todayInLondon };
})();
