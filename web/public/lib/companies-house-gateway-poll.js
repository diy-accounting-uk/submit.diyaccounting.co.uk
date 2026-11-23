// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-gateway-poll.js
// Polls Companies House's XML gateway for one submission the way its technical interface
// specification asks: the gateway's acknowledgement carries a PollInterval, the seconds to leave
// before polling that submission, and an interval of 0 means poll it no more. The page polls a
// bounded number of times; a filing Companies House checks by hand stays pending for hours, and
// the reader asks again with Check again.

(function () {
  "use strict";

  const MAX_GATEWAY_POLLS = 8;
  // An acknowledgement with no PollInterval waits the shortest gap, as the Company Tax Return page does.
  const SHORTEST_POLL_SECONDS = 1;

  // page-chrome.js gives the text in the chosen language; without it the English stands, with its values.
  function siteText(id, english, values) {
    if (window.siteText) return window.siteText(id, english, values);
    return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
  }

  function isSettled(result) {
    return result.statusCode === "ACCEPT" || result.statusCode === "REJECT";
  }

  // poll() fetches the submission's status once; onPending(result) shows a status that is neither
  // ACCEPT nor REJECT. Resolves with the last status, settled or not.
  async function pollGatewayUntilSettled({ submissionNumber, pollIntervalSeconds, poll, onPending }) {
    let result = { submissionNumber, statusCode: "PENDING" };
    if (pollIntervalSeconds === 0) return result;
    const waitSeconds = Math.max(pollIntervalSeconds ?? SHORTEST_POLL_SECONDS, SHORTEST_POLL_SECONDS);
    for (let attempt = 0; attempt < MAX_GATEWAY_POLLS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
      result = await poll();
      if (isSettled(result)) return result;
      if (onPending) onPending(result);
    }
    return result;
  }

  // A PollInterval of 0 asks for no more polls of the submission, so the reader cannot check again.
  function mayCheckAgain(submission) {
    return submission.pollInterval !== 0;
  }

  // What a reader is told when the polls end with the filing still being checked.
  function pendingNote(submission) {
    if (!mayCheckAgain(submission)) {
      return siteText(
        "ch.gateway.pending",
        "Companies House has not finished checking submission {number}. It checks some filings by hand, in office hours.",
        { number: submission.submissionNumber },
      );
    }
    return siteText(
      "ch.gateway.pending-note",
      "Companies House has not finished checking submission {number}. It checks some filings by hand, in office hours. Choose Check again to ask for the outcome. Once Companies House accepts the filing, your copy is in your filings.",
      { number: submission.submissionNumber },
    );
  }

  // A Companies House status code in the word a sentence about the submission reads it as, in the
  // chosen language, or null for a code with no word here. The gateway answers ACCEPT, REJECT,
  // PENDING or PARKED.
  function statusWord(statusCode) {
    const words = {
      ACCEPT: () => siteText("ch.gateway.status-accept", "accepted"),
      REJECT: () => siteText("ch.gateway.status-reject", "rejected"),
      PARKED: () => siteText("ch.gateway.status-parked", "held for a check by hand"),
      PENDING: () => siteText("ch.gateway.status-pending", "waiting to be checked"),
    };
    return words[statusCode] ? words[statusCode]() : null;
  }

  // The sentence about a submission's status and its values: the page's template, with {number} and
  // {status}, for a code with a word; for any other code, a sentence of its own that gives the code.
  function statusSentence(template, number, statusCode) {
    const word = statusWord(statusCode);
    if (word !== null) return [template, { number, status: word }];
    return [
      siteText("ch.gateway.status-unknown", "Companies House answered {code} for submission {number}."),
      { number, code: String(statusCode) },
    ];
  }

  // The sentence for a status code with no word here, with the code and the submission number in place.
  function unknownStatusText(number, statusCode) {
    return siteText("ch.gateway.status-unknown", "Companies House answered {code} for submission {number}.", {
      number,
      code: String(statusCode),
    });
  }

  // statusSentence's sentence with its values in place, for a page that shows it as plain text.
  function statusText(template, number, statusCode) {
    const [text, values] = statusSentence(template, number, statusCode);
    return text.replace(/\{([a-z]+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole));
  }

  window.companiesHouseGatewayPoll = {
    pollGatewayUntilSettled,
    pendingNote,
    mayCheckAgain,
    isSettled,
    statusWord,
    statusSentence,
    statusText,
    unknownStatusText,
    MAX_GATEWAY_POLLS,
  };
})();
