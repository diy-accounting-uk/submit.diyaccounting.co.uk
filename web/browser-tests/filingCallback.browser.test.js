// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/filingCallback.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const BASE = "http://localhost:3000";
const COMPANY_NUMBER = "00000001";
const LIVE_ACCESS_TOKEN = "live-access-token";

// The documented Companies House token response carries no scope field, so this is what the
// browser receives from /api/v1/companies-house/token after a real sign-in.
const TOKEN_RESPONSE_WITHOUT_SCOPE = { accessToken: LIVE_ACCESS_TOKEN, expiresIn: 3600, tokenType: "Bearer" };

function readPublic(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), "web/public", relativePath), "utf-8");
}

// The real filing service, served as a classic script: its api-client import becomes plain
// fetch, and its exports drop to bare declarations so the window assignments at the bottom run.
function filingServiceAsClassicScript() {
  return readPublic("lib/services/companies-house-filing-service.js")
    .replace(
      /import \{[^}]*\} from "\.\/api-client\.js";/,
      "const fetchWithIdToken = window.fetch.bind(window); const authorizedFetch = window.fetch.bind(window);",
    )
    .replace(/^export /gm, "");
}

test.describe("Companies House filing OAuth callback", () => {
  let callbackHtml;
  let emailPageHtml;
  let officePageHtml;
  let statusMessagesJs;
  let loadingSpinnerJs;
  let filingServiceJs;

  test.beforeAll(async () => {
    callbackHtml = readPublic("companies-house/filingCallback.html");
    emailPageHtml = readPublic("companies-house/changeRegisteredEmail.html");
    officePageHtml = readPublic("companies-house/changeRegisteredOffice.html");
    statusMessagesJs = readPublic("widgets/status-messages.js");
    loadingSpinnerJs = readPublic("widgets/loading-spinner.js");
    filingServiceJs = filingServiceAsClassicScript();
  });

  async function setupRoutes(page, { tokenResponseStatus = 200, tokenResponseBody = TOKEN_RESPONSE_WITHOUT_SCOPE } = {}) {
    const apiCalls = [];

    page.on("pageerror", (err) => {
      // eslint-disable-next-line no-console
      console.log("[PAGE_ERROR]", err?.message || String(err));
    });
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      // eslint-disable-next-line no-console
      console.log("[PAGE_CONSOLE_ERROR]", msg.text());
    });

    await page.route("**/companies-house/filingCallback.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: callbackHtml });
    });
    await page.route("**/companies-house/changeRegisteredEmail.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: emailPageHtml });
    });
    await page.route("**/companies-house/changeRegisteredOffice.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: officePageHtml });
    });

    // The authorise URL the page builds: stands in for Companies House's sign-in-and-permission
    // screen and sends the browser straight back to the callback with a code and the same state.
    await page.route("**/oauth2/authorise*", async (route) => {
      const url = new URL(route.request().url());
      const state = url.searchParams.get("state");
      const callbackUrl = `${BASE}/companies-house/filingCallback.html?code=test-code&state=${encodeURIComponent(state)}`;
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><title>authorise</title><script>location.replace(${JSON.stringify(callbackUrl)});</script>`,
      });
    });

    await page.route("**/*.js", async (route) => {
      const url = route.request().url();
      if (url.includes("/widgets/status-messages.js")) {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: statusMessagesJs });
      } else if (url.includes("/widgets/loading-spinner.js")) {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: loadingSpinnerJs });
      } else if (url.includes("/lib/auth-url-builder.js")) {
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: `window.authUrlBuilder = { buildCompaniesHouseAuthUrl: (state, scope) => Promise.resolve("${BASE}/oauth2/authorise?state=" + encodeURIComponent(state) + "&scope=" + encodeURIComponent(scope)) };`,
        });
      } else if (url.endsWith("/submit.js")) {
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: `
            ${filingServiceJs}
            window.fetchWithIdToken = window.fetch.bind(window);
            window.normaliseCompanyNumber = (value) => String(value || "").trim().toUpperCase().padStart(8, "0");
            window.generateRandomState = () => "test-state-" + Math.random().toString(36).slice(2);
            window.__submitReady__ = true;
            document.dispatchEvent(new CustomEvent("submit-ready"));
          `,
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      }
    });

    await page.route("**/*.css", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/css", body: "" });
    });

    await page.route("**/api/v1/companies-house/token", async (route) => {
      apiCalls.push({ path: "/api/v1/companies-house/token", authorization: route.request().headers()["authorization"] });
      await route.fulfill({ status: tokenResponseStatus, contentType: "application/json", body: JSON.stringify(tokenResponseBody) });
    });

    await page.route(`**/api/v1/companies-house/company/${COMPANY_NUMBER}/registered-email-address/eligibility`, async (route) => {
      apiCalls.push({ path: "eligibility", authorization: route.request().headers()["authorization"] });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ eligibilityStatusCode: "COMPANY_VALID_FOR_SERVICE" }),
      });
    });

    await page.route(`**/api/v1/companies-house/company/${COMPANY_NUMBER}/registered-office-address`, async (route) => {
      apiCalls.push({ path: "registered-office-address", authorization: route.request().headers()["authorization"] });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          etag: "etag-1",
          premises: "1",
          addressLine1: "Example Street",
          addressLine2: "",
          locality: "Cardiff",
          region: "",
          postalCode: "CF14 3UZ",
          country: "Wales",
        }),
      });
    });

    await page.route("**/api/v1/companies-house/transaction", async (route) => {
      apiCalls.push({ path: "transaction", authorization: route.request().headers()["authorization"] });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ transactionId: "txn-1", status: "open", companyNumber: COMPANY_NUMBER }),
      });
    });
    await page.route("**/api/v1/companies-house/transaction/txn-1/registered-office-address", async (route) => {
      apiCalls.push({ path: "transaction/registered-office-address", authorization: route.request().headers()["authorization"] });
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ links: {} }) });
    });
    await page.route("**/api/v1/companies-house/transaction/txn-1", async (route) => {
      const method = route.request().method();
      apiCalls.push({ path: `transaction/txn-1 ${method}`, authorization: route.request().headers()["authorization"] });
      const body =
        method === "PUT"
          ? { transactionId: "txn-1", status: "closed" }
          : {
              transactionId: "txn-1",
              status: "closed",
              filings: [{ id: "f-1", status: "accepted", description: "Change of registered office address" }],
            };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });

    return apiCalls;
  }

  test("registered email: after the authorise round trip the page carries on to the eligibility check with the new token", async ({
    page,
  }) => {
    const apiCalls = await setupRoutes(page);

    await page.goto(`${BASE}/companies-house/changeRegisteredEmail.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#companyView")).toBeVisible();
    await page.fill("#companyNumber", COMPANY_NUMBER);
    await page.click("#companyLookupBtn");

    // Round trip: authorise -> callback -> back to the activity page.
    await page.waitForURL("**/companies-house/filingCallback.html*", { timeout: 5000 });
    await page.waitForURL("**/companies-house/changeRegisteredEmail.html", { timeout: 5000 });

    // The token was exchanged once, and the page must treat it as usable for the company it
    // requested: it moves on to the form, not back to the company-number step.
    await expect(page.locator("#formView")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#companyView")).toBeHidden();

    const tokenCalls = apiCalls.filter((call) => call.path === "/api/v1/companies-house/token");
    const eligibilityCalls = apiCalls.filter((call) => call.path === "eligibility");
    expect(tokenCalls).toHaveLength(1);
    expect(eligibilityCalls).toHaveLength(1);
    expect(eligibilityCalls[0].authorization).toBe(`Bearer ${LIVE_ACCESS_TOKEN}`);

    // The pending filing is consumed and the token is held against the scope the page asked for.
    const stored = await page.evaluate(() => ({
      pending: sessionStorage.getItem("companiesHousePendingFiling"),
      scope: sessionStorage.getItem("companiesHouseTokenScope"),
      state: sessionStorage.getItem("ch_oauth_state"),
      currentActivity: sessionStorage.getItem("currentActivity"),
    }));
    expect(stored.pending).toBeNull();
    expect(stored.scope).toContain(`/company/${COMPANY_NUMBER}/registered-email-address.update`);
    expect(stored.state).toBeNull();
    expect(stored.currentActivity).toBeNull();
  });

  test("registered office: after the authorise round trip the page files the pending change with the new token", async ({ page }) => {
    const apiCalls = await setupRoutes(page);

    await page.goto(`${BASE}/companies-house/changeRegisteredOffice.html`, { waitUntil: "domcontentloaded" });
    await page.fill("#companyNumber", COMPANY_NUMBER);
    await page.click("#companyLookupBtn");
    await expect(page.locator("#formView")).toBeVisible({ timeout: 5000 });

    await page.fill("#premises", "2");
    await page.fill("#addressLine1", "New Street");
    await page.fill("#locality", "Cardiff");
    await page.fill("#postalCode", "CF14 3UZ");
    await page.selectOption("#country", "Wales");
    await page.check("#acceptOfficeStatement");
    await page.click("#continueBtn");
    await expect(page.locator("#reviewView")).toBeVisible({ timeout: 5000 });

    await page.click("#submitFilingBtn");
    await page.waitForURL("**/companies-house/filingCallback.html*", { timeout: 5000 });
    await page.waitForURL("**/companies-house/changeRegisteredOffice.html", { timeout: 5000 });

    await expect(page.locator("#resultView")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#filingResult")).toContainText("accepted");

    const transactionCalls = apiCalls.filter((call) => call.path === "transaction");
    expect(transactionCalls).toHaveLength(1);
    expect(transactionCalls[0].authorization).toBe(`Bearer ${LIVE_ACCESS_TOKEN}`);
  });

  test("a token response without an expiry is an exchange failure shown on the callback page, not a silent loop", async ({ page }) => {
    await setupRoutes(page, { tokenResponseBody: { accessToken: LIVE_ACCESS_TOKEN, tokenType: "Bearer" } });

    await page.goto(`${BASE}/companies-house/changeRegisteredEmail.html`, { waitUntil: "domcontentloaded" });
    await page.fill("#companyNumber", COMPANY_NUMBER);
    await page.click("#companyLookupBtn");
    await page.waitForURL("**/companies-house/filingCallback.html*", { timeout: 5000 });

    const errorMessage = page.locator(".status-error");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
    await expect(errorMessage).toContainText("Companies House sign-in failed");
    expect(page.url()).toContain("filingCallback.html");
    await expect(page.locator("#navigationBtn")).toHaveText("Back to Companies House filing");

    const token = await page.evaluate(() => sessionStorage.getItem("companiesHouseAccessToken"));
    expect(token).toBeNull();
  });
});
