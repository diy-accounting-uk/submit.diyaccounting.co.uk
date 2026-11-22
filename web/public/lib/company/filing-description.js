// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// A filing's description in Companies House's own words: the register's description key looked up
// in filing-history-descriptions.js, each placeholder filled from the filing's description values,
// with dates in the page's date form. Companies House publishes these words in English only.

(function () {
  "use strict";

  const PLACEHOLDER = /\{([a-z_]+)\}/g;
  const DATE_PLACEHOLDER = /(^|_)date$/;

  /**
   * @param {{description: string, descriptionValues?: object}} filing
   * @param {(isoDate: string) => string} formatDate
   * @returns {string|null} the words, or null when the enumeration has no entry for the description
   */
  function registerDescription(filing, formatDate) {
    const words = window.filingHistoryDescriptions[filing.description];
    if (words === undefined) return null;
    const values = filing.descriptionValues || {};
    return words
      .replace(PLACEHOLDER, (whole, name) => {
        const value = values[name];
        if (value === undefined || value === null) return "";
        return DATE_PLACEHOLDER.test(name) ? formatDate(value) : String(value);
      })
      .replace(/\s+/g, " ")
      .trim();
  }

  window.companiesHouseWords = { registerDescription };
})();
