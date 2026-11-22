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
  // chosen language. The gateway answers ACCEPT, REJECT, PENDING or PARKED; any code that is not
  // settled reads as waiting, as the polls treat it.
  function statusWord(statusCode) {
    const words = {
      ACCEPT: () => siteText("ch.gateway.status-accept", "accepted"),
      REJECT: () => siteText("ch.gateway.status-reject", "rejected"),
      PARKED: () => siteText("ch.gateway.status-parked", "held for a check by hand"),
      PENDING: () => siteText("ch.gateway.status-pending", "waiting to be checked"),
    };
    return (words[statusCode] ?? words.PENDING)();
  }

  window.companiesHouseGatewayPoll = { pollGatewayUntilSettled, pendingNote, mayCheckAgain, isSettled, statusWord, MAX_GATEWAY_POLLS };
})();
