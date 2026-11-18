// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-rejections.js
// The text of a Companies House filing's reject reasons. A reason Companies House sent shows as
// Companies House wrote it, with its code. Our own NOT-RECEIVED reason, for a filing Companies
// House never received, follows the reader's language.

(function () {
  "use strict";

  // page-chrome.js gives the text in the chosen language; without it the English stands.
  const siteText = (id, english, values) => (window.siteText ? window.siteText(id, english, values) : english);

  const NOT_RECEIVED = "NOT-RECEIVED";

  function isNotReceived(rejection) {
    return rejection?.rejectCode === NOT_RECEIVED;
  }

  /**
   * One reason as a line: "CODE: description" for Companies House's reasons, our sentence alone
   * for NOT-RECEIVED.
   * @param {{rejectCode: string, description: string}} rejection
   * @returns {string}
   */
  function rejectionText(rejection) {
    if (isNotReceived(rejection)) {
      return siteText("widget.ch-not-received", "Companies House did not receive this filing. Nothing was filed. File it again.");
    }
    return `${rejection.rejectCode}: ${rejection.description}`;
  }

  /**
   * One reason without its code, for a list that names the filing already.
   * @param {{rejectCode: string, description: string}} rejection
   * @returns {string}
   */
  function rejectionDescription(rejection) {
    return isNotReceived(rejection) ? rejectionText(rejection) : rejection.description;
  }

  /**
   * @param {Array<{rejectCode: string}>} [rejections]
   * @returns {boolean} true when Companies House never received the filing
   */
  function notReceived(rejections) {
    return Array.isArray(rejections) && rejections.some(isNotReceived);
  }

  window.companiesHouseRejections = { rejectionText, rejectionDescription, notReceived };
})();
