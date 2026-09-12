// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

/**
 * Drive HMRC's sandbox authorize page as a test user and return the authorisation code.
 *
 * HMRC's user-restricted APIs - the Self Assessment Test Support endpoints among them - need a
 * token obtained on behalf of a user, not a client-credentials token. There is no headless way to
 * get one: the authorize page is a sign-in journey, so a browser walks it.
 *
 * This lived privately and identically in both `itsa-sandbox-year.js` and `itsa-sandbox-spike.js`.
 * The behaviour suites need it too, so it lives here once.
 *
 * @param {object} options
 * @param {string} options.authorizeUrl  The full /oauth/authorize URL, query string included.
 * @param {string} options.redirectUri   Intercepted rather than served; the code is read off it.
 * @param {string} options.userId        The HMRC test user's id.
 * @param {string} options.password      The HMRC test user's password.
 * @param {string} options.outDir        Where a screenshot and the DOM go if the flow gets stuck.
 * @param {boolean} [options.headful]    Watch it happen, for debugging.
 * @param {string} [options.label]       Placeholder body served at the redirect uri.
 * @returns {Promise<{code: string, visited: string[], documentResponses: string[]}>}
 */
export async function getAuthorizationCode({ authorizeUrl, redirectUri, userId, password, outDir, headful, label }) {
  const browser = await chromium.launch({ headless: !headful });
  const page = await browser.newPage();
  const visited = [];
  const documentResponses = [];
  let redirectUrl = null;
  page.on("response", (response) => {
    if (response.request().resourceType() === "document") {
      documentResponses.push(`${response.status()} ${response.url().split("?")[0]}`);
    }
  });
  // Nothing serves the redirect uri here, so read the code off the request itself.
  page.on("request", (request) => {
    if (request.url().startsWith(redirectUri)) redirectUrl = request.url();
  });
  page.on("requestfailed", (request) => {
    if (request.resourceType() === "document") {
      documentResponses.push(`FAILED ${request.failure()?.errorText} ${request.url().split("?")[0]}`);
    }
  });

  await page.route(`${redirectUri}*`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: `<p>${label || "authorization-code"}</p>` }),
  );

  try {
    await page.goto(authorizeUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    for (let step = 0; step < 12; step += 1) {
      // A sign-in click lands on a chain of redirects, so the url settles before the dom does.
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      const url = page.url();
      visited.push(url.split("?")[0]);

      if (redirectUrl) {
        const params = new URL(redirectUrl).searchParams;
        const error = params.get("error");
        if (error) {
          throw new Error(`Authorisation refused: ${error} ${params.get("error_description") || ""}`);
        }
        const code = params.get("code");
        if (!code) throw new Error("Redirect carried no authorisation code");
        return { code, visited, documentResponses };
      }

      const signInField = page.locator("#userId, input[name='userId']").first();
      if (await signInField.count()) {
        await signInField.fill(userId);
        await page.locator("#password, input[name='password']").first().fill(password);
        await Promise.all([
          page.waitForLoadState("domcontentloaded", { timeout: 60000 }),
          page.locator("button[type=submit], input[type=submit]").first().click(),
        ]);
        continue;
      }

      const candidates = [
        "#signIn",
        "#continue",
        "button[type=submit]",
        "input[type=submit]",
        "a[role=button].govuk-button",
        "a.govuk-button",
      ];
      let clicked = false;
      for (const selector of candidates) {
        const control = page.locator(selector).first();
        if (!(await control.count())) continue;
        await Promise.all([page.waitForLoadState("domcontentloaded", { timeout: 60000 }), control.click()]);
        clicked = true;
        break;
      }
      if (clicked) continue;

      await page.screenshot({ path: `${outDir}/stuck-${step}.png`, fullPage: true });
      writeFileSync(`${outDir}/stuck-${step}.html`, await page.content());
      const counts = {};
      for (const selector of candidates) counts[selector] = await page.locator(selector).count();
      throw new Error(
        `No action found on ${url.split("?")[0]} counts=${JSON.stringify(counts)} documents=${JSON.stringify(documentResponses)} (screenshot in ${outDir})`,
      );
    }

    throw new Error("Authorisation flow did not reach the redirect uri within 12 steps");
  } finally {
    await browser.close();
  }
}

/** The /oauth/authorize URL for a user-restricted token. */
export function buildAuthorizeUrl({ sandboxBase, clientId, redirectUri, scope, state }) {
  return (
    `${sandboxBase}/oauth/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`
  );
}
