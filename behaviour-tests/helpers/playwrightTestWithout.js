// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/helpers/playwrightTestWithout.js
import { test as base } from "@playwright/test";

// Blocks RUM / GA / gtag / GTM endpoints / HMRC all.js so behaviour tests aren't
// slowed down or polluted by real analytics calls. Shared by any fixture that
// creates its own context (e.g. playwrightTestForCapture.js).
//
// This blocking is why consented synthetic traffic never reaches GA4: gtag.js itself
// is stubbed out here (the "gtag/js" match below), so it never loads in a behaviour-test
// context and the consent flow's gtag() calls only ever queue into window.dataLayer —
// they're never turned into a real network hit. Worse, the "analytics.js" match intended
// for Google's legacy hosted script also matched this app's own first-party
// lib/analytics.js by substring, so that file was never served either — window.gtag was
// never even defined, and the consent banner's gtag calls had nothing to call. A run that
// needs its own traffic to actually land in GA4 (e.g. to verify the purchase funnel lands
// in a property) can set DIY_SUBMIT_ALLOW_REAL_ANALYTICS=true to skip this interception.
export function blockAnalyticsRequests(context) {
  if (process.env.DIY_SUBMIT_ALLOW_REAL_ANALYTICS === "true") {
    return Promise.resolve();
  }
  return context.route("**/*", (route) => {
    const url = route.request().url();
    if (
      url.startsWith("https://client.rum") ||
      url.startsWith("https://test-www.tax.service.gov.uk/api-test-login/assets/lib/govuk-frontend/dist/govuk/all.js") ||
      url.startsWith("https://www.google-analytics.com/g/collect") ||
      url.startsWith("https://www.googletagmanager.com/") ||
      url.startsWith("https://www.google-analytics.com/analytics.js") ||
      url.includes("gtag/js")
    ) {
      const isGaScript =
        url.startsWith("https://www.google-analytics.com/analytics.js") ||
        url.includes("gtag/js") ||
        url.includes("/gtm.js") ||
        url.includes("/all.js") ||
        url.includes("/cwr.js");
      const isScriptRequest = isGaScript || route.request().resourceType() === "script";
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "no-store",
          ...(isScriptRequest ? { "content-type": "application/javascript" } : { "content-type": "text/plain; charset=utf-8" }),
        },
        body: "", // empty body as requested
      });
    }
    return route.continue();
  });
}

export const test = base.extend({
  // Respect project/test use: options by applying contextOptions and explicitly enabling recordVideo
  context: async ({ browser, contextOptions }, use, testInfo) => {
    const recordVideo = { dir: testInfo.outputPath(""), size: { width: 1280, height: 1024 } };
    const context = await browser.newContext({ ...contextOptions, recordVideo });
    await blockAnalyticsRequests(context);
    await use(context);
    try {
      await context.close();
    } catch (e) {
      console.warn("Error closing context:", e);
    }
  },
});
