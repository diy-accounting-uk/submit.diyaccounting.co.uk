// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/money-input.js
// Parses what a customer types into a pounds box: "£1,200.50", "1200.5" or " 1,200 ".
// Returns a number, or null for anything else (blank included), so a caller never
// sends a guess to an API.

(function () {
  "use strict";

  function siteText(id, english, values) {
    if (typeof window !== "undefined" && window.siteText) return window.siteText(id, english, values);
    return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
  }

  const WHOLE_OR_GROUPED_POUNDS = "(?:\\d+|\\d{1,3}(?:,\\d{3})+)";
  const POUNDS_AND_PENCE = new RegExp(`^(-?)£?(-?)(${WHOLE_OR_GROUPED_POUNDS}(?:\\.\\d{1,2})?)$`);
  const WHOLE_POUNDS = new RegExp(`^(-?)£?(-?)(${WHOLE_OR_GROUPED_POUNDS})$`);

  function parseMoneyInput(text, { wholePounds = false } = {}) {
    if (typeof text !== "string" && typeof text !== "number") return null;
    const match = (wholePounds ? WHOLE_POUNDS : POUNDS_AND_PENCE).exec(String(text).trim());
    if (!match) return null;
    const [, leadingMinus, minusAfterPound, digits] = match;
    if (leadingMinus && minusAfterPound) return null;
    const magnitude = Number(digits.replaceAll(",", ""));
    return leadingMinus || minusAfterPound ? -magnitude : magnitude;
  }

  function isBlank(text) {
    return String(text ?? "").trim() === "";
  }

  // Checks every enabled input marked data-money. A non-blank value that does not parse gets
  // aria-invalid and is named in the returned message; returns null when all are fine.
  function moneyInputProblem(root = document) {
    const invalidLabels = [];
    const negativeLabels = [];
    let wantsWholePounds = false;
    root.querySelectorAll("input[data-money]").forEach((input) => {
      const invalid = !input.disabled && !isBlank(input.value) && parseMoneyInput(input.value, moneyOptions(input)) === null;
      if (invalid) {
        input.setAttribute("aria-invalid", "true");
        invalidLabels.push(labelOf(input));
        wantsWholePounds = wantsWholePounds || moneyOptions(input).wholePounds;
      } else if (isBelowMinimum(input)) {
        input.setAttribute("aria-invalid", "true");
        negativeLabels.push(labelOf(input));
      } else {
        input.removeAttribute("aria-invalid");
      }
    });
    const messages = [];
    if (invalidLabels.length > 0) {
      const labels = invalidLabels.join("; ");
      messages.push(
        wantsWholePounds
          ? siteText(
              "widget.money-check-whole-pounds",
              "Enter an amount in a whole number of pounds, like £600 or £1,200. Check: {labels}.",
              { labels },
            )
          : siteText("widget.money-check-pounds-pence", "Enter an amount in pounds and pence, like £600 or £193.54. Check: {labels}.", {
              labels,
            }),
      );
    }
    if (negativeLabels.length > 0) {
      messages.push(
        siteText("widget.money-check-negative", "The amount cannot be negative. Check: {labels}.", { labels: negativeLabels.join("; ") }),
      );
    }
    return messages.length > 0 ? messages.join(" ") : null;
  }

  function labelOf(input) {
    return input.labels?.[0]?.textContent?.trim() || input.id;
  }

  function isBelowMinimum(input) {
    const minimum = input.dataset.moneyMin;
    if (minimum === undefined || input.disabled) return false;
    const amount = readMoneyInput(input);
    return amount !== null && amount < Number(minimum);
  }

  function moneyOptions(input) {
    return { wholePounds: input.dataset.money === "whole-pounds" };
  }

  // The parsed value of a data-money input, or null when blank or invalid.
  function readMoneyInput(input) {
    return parseMoneyInput(input.value, moneyOptions(input));
  }

  window.parseMoneyInput = parseMoneyInput;
  window.moneyInputProblem = moneyInputProblem;
  window.readMoneyInput = readMoneyInput;
})();
