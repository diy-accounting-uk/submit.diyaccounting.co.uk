// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/helpers/waitForSuccessOrError.js

import { timestamp } from "./behaviour-helpers.js";

/**
 * Default error conditions matching the status-messages.js widget.
 * The widget creates <div class="status-message status-error"> when
 * showStatus(msg, "error") is called. Error messages have autoHide: false
 * so they persist until dismissed.
 */
function defaultErrorConditions() {
  return [
    {
      selector: "#statusMessagesContainer .status-message.status-error",
      textPattern: /failed|error|expired|forbidden|no tokens/i,
    },
  ];
}

/**
 * Poll for either a success condition or an error condition on the page.
 * Logs progress at each polling interval. Fails fast if an error is detected.
 * Falls back to timeout if neither success nor error appears.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} options
 * @param {string} options.successSelector - CSS selector for the success element
 * @param {string} [options.description] - Human-readable description for logging
 * @param {number} [options.timeout=450000] - Total timeout in ms
 * @param {number} [options.pollIntervalMs=5000] - How often to check (ms)
 * @param {string} [options.screenshotPath] - Directory for periodic progress screenshots
 * @param {Array<{selector: string, textPattern?: RegExp}>} [options.errorConditions] - Error conditions to check
 * @returns {Promise<void>} Resolves when success detected, throws on error or timeout
 */
export async function waitForSuccessOrError(page, options = {}) {
  const {
    successSelector,
    description = successSelector,
    timeout = 450_000,
    pollIntervalMs = 5000,
    screenshotPath,
    errorConditions = defaultErrorConditions(),
  } = options;

  const startTime = Date.now();
  let pollCount = 0;

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > timeout) {
      throw new Error(`[waitForSuccessOrError] Timed out after ${Math.round(elapsed / 1000)}s waiting for "${description}"`);
    }

    pollCount++;

    // 1. Check for error conditions FIRST (fail fast)
    // The page can show more than one error banner at once (e.g. an authorizedFetch
    // poll error alongside the page's own catch-block message) since status-messages.js
    // never auto-hides type: "error" banners. .locator(selector) alone throws in
    // Playwright strict mode when more than one element matches, and that throw was
    // being swallowed by .catch(() => false), silently disabling fail-fast. Check every
    // match instead of assuming there is exactly one.
    for (const condition of errorConditions) {
      const errorLocators = await page
        .locator(condition.selector)
        .all()
        .catch(() => []);
      const visibleTexts = [];
      for (const errorLocator of errorLocators) {
        const isVisible = await errorLocator.isVisible().catch(() => false);
        if (isVisible) {
          const text = await errorLocator.innerText().catch(() => "");
          visibleTexts.push(text);
        }
      }
      if (visibleTexts.length > 0) {
        const combinedText = visibleTexts.join(" | ");
        if (!condition.textPattern || condition.textPattern.test(combinedText)) {
          const msg =
            `[waitForSuccessOrError] FAIL FAST: Error detected in "${condition.selector}" ` +
            `after ${Math.round(elapsed / 1000)}s while waiting for "${description}": "${combinedText.substring(0, 200)}"`;
          console.log(msg);
          throw new Error(msg);
        }
      }
    }

    // 2. Check for success condition
    const successVisible = await page
      .locator(successSelector)
      .isVisible()
      .catch(() => false);
    if (successVisible) {
      console.log(
        `[waitForSuccessOrError] SUCCESS: "${description}" detected after ` + `${Math.round(elapsed / 1000)}s (poll #${pollCount})`,
      );
      return;
    }

    // 3. Log progress
    const statusText = await page
      .locator("#statusMessagesContainer")
      .innerText()
      .catch(() => "(empty)");
    const spinnerVisible = await page
      .locator("#loadingSpinner")
      .isVisible()
      .catch(() => false);
    console.log(
      `[waitForSuccessOrError] Waiting for "${description}" ` +
        `(poll #${pollCount}, ${Math.round(elapsed / 1000)}s/${Math.round(timeout / 1000)}s, ` +
        `spinner: ${spinnerVisible ? "on" : "off"}, ` +
        `status: "${statusText.substring(0, 100).replace(/\n/g, " ")}")`,
    );

    // 4. Periodic screenshot (every 3rd poll = every ~15s)
    if (screenshotPath && pollCount % 3 === 0) {
      await page
        .screenshot({
          path: `${screenshotPath}/${timestamp()}-wait-progress-poll${pollCount}.png`,
        })
        .catch(() => {});
    }

    // 5. Sleep before next poll
    await page.waitForTimeout(pollIntervalMs);
  }
}
