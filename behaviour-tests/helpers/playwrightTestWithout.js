// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/helpers/playwrightTestWithout.js
import { test as base } from "@playwright/test";

// Blocks RUM / GA / gtag / GTM endpoints / HMRC all.js so behaviour tests aren't
// slowed down or polluted by real analytics calls. Shared by any fixture that
// creates its own context (e.g. playwrightTestForCapture.js).
//
// The match for Google's legacy analytics.js is a full URL prefix, not a bare substring:
// this app also serves its own web/public/lib/analytics.js, and a substring match blocked
// that file too, so no behaviour-test browser ever defined gtag or a dataLayer.
//
// Set DIY_SUBMIT_ALLOW_REAL_ANALYTICS=true to skip this interception entirely for a run
// that must send real analytics hits.

// Playwright turns the browser HTTP cache off while a route is registered, so without this every
// page load fetches all of the site's script and style files again: about 85 requests per load,
// and a journey of ten loads sent about 900 requests from one runner address against the web
// ACL's 2000 requests per 5 minutes per address. The cache below holds each own-origin static
// file for the life of the context, so a file is fetched once per test.
const CACHEABLE_STATIC_PATH = /\.(?:js|css|toml|woff2?|png|jpe?g|svg|ico|webp)$/;

function isCacheableStaticRequest(request) {
  if (request.method() !== "GET") return false;
  const baseUrl = process.env.DIY_SUBMIT_BASE_URL;
  if (!baseUrl) return false;
  const url = new URL(request.url());
  return url.origin === new URL(baseUrl).origin && CACHEABLE_STATIC_PATH.test(url.pathname);
}

export function blockAnalyticsRequests(context) {
  if (process.env.DIY_SUBMIT_ALLOW_REAL_ANALYTICS === "true") {
    return Promise.resolve();
  }
  const staticResponses = new Map();
  return context.route("**/*", async (route) => {
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
    if (isCacheableStaticRequest(route.request())) {
      let cached = staticResponses.get(url);
      if (!cached) {
        const response = await route.fetch();
        if (response.status() !== 200) return route.fulfill({ response });
        cached = { response, body: await response.body() };
        staticResponses.set(url, cached);
      }
      return route.fulfill({ response: cached.response, body: cached.body });
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
