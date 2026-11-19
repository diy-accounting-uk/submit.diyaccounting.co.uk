// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/authUrlBuilderRedirect.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { resolveCallbackRedirectUri } from "@app/lib/oauthRedirectUri.js";

const HMRC_PATH = "activities/submitVatCallback.html";
const COMPANIES_HOUSE_PATH = "companies-house/filingCallback.html";
const DEPLOYMENT_BASE_URL = "https://ci-set2.submit.diyaccounting.co.uk/";

let authUrlBuilderJs;

test.beforeAll(() => {
  authUrlBuilderJs = fs.readFileSync(path.join(process.cwd(), "web/public/lib/auth-url-builder.js"), "utf-8");
});

// Loads the real auth-url-builder.js on the given host and returns what the browser builds.
async function redirectUrisOn(page, host) {
  await page.route(`https://${host}/**`, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>host</title>" });
  });
  await page.goto(`https://${host}/`, { waitUntil: "domcontentloaded" });
  return page.evaluate(
    async ({ script, baseUrl }) => {
      window.envReady = Promise.resolve({ DIY_SUBMIT_BASE_URL: baseUrl });
      new Function(script)();
      return {
        hmrc: await window.authUrlBuilder.hmrcRedirectUri(),
        companiesHouse: await window.authUrlBuilder.companiesHouseRedirectUri(),
      };
    },
    { script: authUrlBuilderJs, baseUrl: DEPLOYMENT_BASE_URL },
  );
}

test.describe("callback redirect_uri built in the browser", () => {
  test.beforeEach(() => {
    process.env.DIY_SUBMIT_BASE_URL = DEPLOYMENT_BASE_URL;
  });

  test("on the ci apex it is the apex callback page, which the token Lambda accepts", async ({ page }) => {
    const uris = await redirectUrisOn(page, "ci-submit.diyaccounting.co.uk");
    expect(uris.hmrc).toBe(`https://ci-submit.diyaccounting.co.uk/${HMRC_PATH}`);
    expect(uris.companiesHouse).toBe(`https://ci-submit.diyaccounting.co.uk/${COMPANIES_HOUSE_PATH}`);
    expect(resolveCallbackRedirectUri(uris.hmrc, HMRC_PATH)).toEqual({ redirectUri: uris.hmrc });
    expect(resolveCallbackRedirectUri(uris.companiesHouse, COMPANIES_HOUSE_PATH)).toEqual({ redirectUri: uris.companiesHouse });
  });

  test("on the prod apex it is the apex callback page, which the token Lambda accepts", async ({ page }) => {
    const uris = await redirectUrisOn(page, "submit.diyaccounting.co.uk");
    expect(uris.hmrc).toBe(`https://submit.diyaccounting.co.uk/${HMRC_PATH}`);
    expect(resolveCallbackRedirectUri(uris.hmrc, HMRC_PATH)).toEqual({ redirectUri: uris.hmrc });
  });

  test("on the deployment's own host it is the deployment's base URL, which the token Lambda accepts", async ({ page }) => {
    const uris = await redirectUrisOn(page, "ci-set2.submit.diyaccounting.co.uk");
    expect(uris.hmrc).toBe(`https://ci-set2.submit.diyaccounting.co.uk/${HMRC_PATH}`);
    expect(uris.companiesHouse).toBe(`https://ci-set2.submit.diyaccounting.co.uk/${COMPANIES_HOUSE_PATH}`);
    expect(resolveCallbackRedirectUri(uris.hmrc, HMRC_PATH)).toEqual({ redirectUri: uris.hmrc });
    expect(resolveCallbackRedirectUri(uris.companiesHouse, COMPANIES_HOUSE_PATH)).toEqual({ redirectUri: uris.companiesHouse });
  });
});
