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

// Playwright actions have no timeout of their own here: playwright.config.js leaves
// actionTimeout unset, and unset means 0, which means wait for ever. A query for an element
// the page no longer has never settles, so its .catch() never runs either. That matters most
// on the queries below, which run against whatever page the browser is on right now: once a
// click has sent the browser to the HMRC consent page, #statusMessagesContainer is gone and an
// unbounded innerText() on it wedges the whole poll loop, leaving the caller's `timeout`
// unread. A query gets one poll interval to answer, then the poll carries on without it.
function answerWithin(query, timeoutMs, fallback) {
  let timer;
  const bound = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  return Promise.race([query.catch(() => fallback), bound]).finally(() => clearTimeout(timer));
}

async function visibleTextsFor(page, selector, queryTimeoutMs) {
  const locators = await answerWithin(page.locator(selector).all(), queryTimeoutMs, []);
  const texts = [];
  for (const locator of locators) {
    const isVisible = await answerWithin(locator.isVisible(), queryTimeoutMs, false);
    if (isVisible) {
      texts.push(await answerWithin(locator.innerText(), queryTimeoutMs, ""));
    }
  }
  return texts;
}

// Multiset difference: texts in `current` with one matching occurrence in `baseline` removed
// per match, so a banner already on the page at wait-start doesn't count as new, but a second
// occurrence of the same text does.
function newTextsSince(baseline, current) {
  const remainingBaseline = [...baseline];
  const added = [];
  for (const text of current) {
    const matchIndex = remainingBaseline.indexOf(text);
    if (matchIndex === -1) {
      added.push(text);
    } else {
      remainingBaseline.splice(matchIndex, 1);
    }
  }
  return added;
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
 * @param {number} [options.pollIntervalMs=5000] - How often to check (ms), and how long any one
 *   page query gets to answer before the poll carries on without it
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

  // Snapshot whatever error banners are already visible when the wait begins. A page can carry
  // a banner left over from an earlier, already-abandoned attempt (status-messages.js never
  // auto-hides type: "error" banners) — that banner must not fail a wait for a later attempt
  // that hasn't had a chance to succeed or fail yet. Only a banner that appears (or reappears)
  // after this snapshot counts as a new error.
  const baselineTextsByCondition = new Map();
  for (const condition of errorConditions) {
    baselineTextsByCondition.set(condition, await visibleTextsFor(page, condition.selector, pollIntervalMs));
  }

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
      const visibleTexts = await visibleTextsFor(page, condition.selector, pollIntervalMs);
      const newTexts = newTextsSince(baselineTextsByCondition.get(condition), visibleTexts);
      if (newTexts.length > 0) {
        const combinedText = newTexts.join(" | ");
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
    const successVisible = await answerWithin(page.locator(successSelector).isVisible(), pollIntervalMs, false);
    if (successVisible) {
      console.log(
        `[waitForSuccessOrError] SUCCESS: "${description}" detected after ` + `${Math.round(elapsed / 1000)}s (poll #${pollCount})`,
      );
      return;
    }

    // 3. Log progress
    const statusText = await answerWithin(page.locator("#statusMessagesContainer").innerText(), pollIntervalMs, "(empty)");
    const spinnerVisible = await answerWithin(page.locator("#loadingSpinner").isVisible(), pollIntervalMs, false);
    console.log(
      `[waitForSuccessOrError] Waiting for "${description}" ` +
        `(poll #${pollCount}, ${Math.round(elapsed / 1000)}s/${Math.round(timeout / 1000)}s, ` +
        `spinner: ${spinnerVisible ? "on" : "off"}, ` +
        `status: "${statusText.substring(0, 100).replace(/\n/g, " ")}")`,
    );

    // 4. Periodic screenshot (every 3rd poll = every ~15s)
    if (screenshotPath && pollCount % 3 === 0) {
      await answerWithin(
        page.screenshot({
          path: `${screenshotPath}/${timestamp()}-wait-progress-poll${pollCount}.png`,
        }),
        pollIntervalMs,
        null,
      );
    }

    // 5. Sleep before next poll
    await page.waitForTimeout(pollIntervalMs);
  }
}
