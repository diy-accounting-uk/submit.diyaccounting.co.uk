// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Reads the JSON body of an answer from this site's API. An answer that is not JSON (a gateway
// timeout page, an empty body) becomes an error that says so in the reader's language, with the
// answer's status, in place of the JSON parser's own words.

function answerNotJsonText(status) {
  if (typeof window !== "undefined" && window.siteText) {
    return window.siteText(
      "widget.answer-not-json",
      "The service did not give an answer this page can read (status {status}). Try again in a few minutes.",
      { status },
    );
  }
  return `The service did not give an answer this page can read (status ${status}). Try again in a few minutes.`;
}

/**
 * @param {Response} response
 * @returns {Promise<object>} the parsed body
 * @throws {Error} with `status` and `notJson: true` when the body is not JSON
 */
export async function readJsonAnswer(response) {
  try {
    return await response.json();
  } catch {
    const error = new Error(answerNotJsonText(response.status));
    error.status = response.status;
    error.notJson = true;
    throw error;
  }
}
