// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/helpers/playwrightTestForCapture.js
//
// Playwright test fixture for demo video capture. Records video at the
// project's configured viewport size instead of playwrightTestWithout.js's
// fixed 1280x1024, so the recording isn't letterboxed or cropped relative to
// what's actually rendered.
import { test as base } from "@playwright/test";
import { blockAnalyticsRequests } from "./playwrightTestWithout.js";

export const test = base.extend({
  // `contextOptions` (the raw `use.contextOptions` config value) does NOT carry
  // `viewport` - that's a separate resolved fixture, so it must be requested here
  // directly and passed into newContext() explicitly, or the page renders at
  // Playwright's built-in default (1280x720) instead of the configured size.
  context: async ({ browser, contextOptions, viewport }, use, testInfo) => {
    const recordVideo = { dir: testInfo.outputPath(""), size: viewport || { width: 1280, height: 720 } };
    const context = await browser.newContext({ ...contextOptions, viewport, recordVideo });
    await blockAnalyticsRequests(context);
    await use(context);
    try {
      await context.close();
    } catch (e) {
      console.warn("Error closing context:", e);
    }
  },
});
