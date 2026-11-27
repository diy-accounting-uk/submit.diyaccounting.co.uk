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

  // A Check again button that asks for the submission's outcome again.
  function checkAgainButton(onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.id = "checkAgainBtn";
    button.textContent = siteText("ch.form.check-again", "Check again");
    button.addEventListener("click", () => {
      button.disabled = true;
      onClick();
    });
    return button;
  }

  // Polls a submission the gateway took and shows its outcome. A submission still pending after the
  // polls, or whose status could not be read, gets Check again; Start a new filing waits until
  // Companies House has decided it, or the gateway asked for no more polls and Check again is not
  // offered, so a second filing cannot start while the first may still be pending. Resolves with the
  // settled outcome, or null.
  async function pollAndShowOutcome({ kind, submission, result, headers, onSettled }) {
    const poll = window.companiesHouseGatewayPoll;
    const startAgainButton = document.getElementById("startAgainBtn");
    startAgainButton.style.display = "none";
    const askAgain = () => pollAndShowOutcome({ kind, submission, result, headers, onSettled });
    let outcome;
    try {
      window.narrateStage(siteText("ct.narrate-waiting-ch", "Waiting for Companies House's answer..."));
      outcome = await poll.pollGatewayUntilSettled({
        submissionNumber: submission.submissionNumber,
        pollIntervalSeconds: submission.pollInterval,
        poll: () => window.pollCompaniesHouseForm(kind, submission.submissionNumber, headers),
      });
      window.endStage();
    } catch (error) {
      window.endStage();
      result.replaceChildren(
        paragraph(poll.checkFailedNote(submission.submissionNumber, errorText(error)), "error-message"),
        ...(poll.mayCheckAgain(submission) ? [checkAgainButton(askAgain)] : []),
      );
      if (!poll.mayCheckAgain(submission)) startAgainButton.style.display = "";
      return null;
    }
    if (!poll.isSettled(outcome)) {
      result.replaceChildren(
        paragraph(poll.pendingNote(submission)),
        ...(poll.mayCheckAgain(submission) ? [checkAgainButton(askAgain)] : []),
      );
      if (!poll.mayCheckAgain(submission)) startAgainButton.style.display = "";
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
    startAgainButton.style.display = "";
    if (onSettled) await onSettled(outcome);
    return outcome;
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
   * @param {function(object): Promise<void>} [input.onPaymentRequired] - called with the route's 402
   *   fee-due answer (activityId, subjectKey, priceKey, fee) for a form whose fee the filer pays first
   * @param {function(object): Promise<void>} [input.onSettled] - called with the outcome once Companies
   *   House accepts or rejects the submission, after the first polls or after Check again
   * @returns {Promise<object|null>} the settled outcome, or null when it is still pending or failed
   */
  async function fileAndShowOutcome({ kind, form, result, headers = {}, onRefusal, onPaymentRequired, onSettled }) {
    result.replaceChildren();
    let submission;
    try {
      window.narrateStage(siteText("ch.narrate-sending-form", "Sending the form to Companies House..."));
      submission = await window.submitCompaniesHouseForm(kind, form, headers);
    } catch (error) {
      if (error?.status === 402 && error.body?.code === "fee-due" && onPaymentRequired) {
        await onPaymentRequired(error.body);
        return null;
      }
      if (onRefusal && onRefusal(error)) return null;
      result.replaceChildren(paragraph(errorText(error), "error-message"));
      return null;
    }
    result.replaceChildren(
      paragraph(
        siteText("ch.form.sent", "Submission {number} was taken by the gateway. Waiting for Companies House...", {
          number: submission.submissionNumber,
        }),
      ),
    );
    return pollAndShowOutcome({ kind, submission, result, headers, onSettled });
  }

  window.companiesHouseFormPage = { fileAndShowOutcome, errorText, registerMessages, todayInLondon };
})();
