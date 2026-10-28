// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/steps/behaviour-mcp-hmrc-grant-steps.js
//
// The browser half of an HMRC grant the MCP starts: the user opens the link that
// request_hmrc_authorisation answered, walks HMRC's consent pages, and lands on Submit's callback
// page, which stores the grant for the MCP session. The practice page starts its own grant the same
// way from its Connect button.

import { expect } from "@playwright/test";
import { fillInHmrcAuth, goToHmrcAuth, grantPermissionHmrcAuth, initHmrcAuth, submitHmrcAuth } from "./behaviour-hmrc-steps.js";

/**
 * Open the authorisation link, grant access on HMRC's pages and wait for Submit's callback page
 * to confirm the grant.
 * @param {import("@playwright/test").Page} page
 * @param {string} authorisationUrl - the url request_hmrc_authorisation answered
 * @param {string} username - the HMRC user id to sign in with
 * @param {string} password - that user's password
 * @param {string} screenshotPath
 */
export async function grantMcpHmrcAccessInBrowser(page, authorisationUrl, username, password, screenshotPath) {
  await page.goto(authorisationUrl);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, username, password, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);
  await expect(page).toHaveURL(/\/activities\/submitVatCallback\.html$/);
  await expect(page.locator("#statusMessagesContainer")).toContainText("HMRC access granted. Go back to your chat to carry on.");
}

/**
 * Click "Connect to HMRC" on the practice page, sign in on HMRC's pages as the agent and grant
 * access, then wait for the practice page to show the connection.
 * @param {import("@playwright/test").Page} page - on practice.html
 * @param {string} username - the HMRC agent user id to sign in with
 * @param {string} password - that user's password
 * @param {string} screenshotPath
 */
export async function connectPracticeToHmrcInBrowser(page, username, password, screenshotPath) {
  await page.getByRole("button", { name: "Connect to HMRC" }).click();
  // The click requests the grant first, then leaves for HMRC; wait for the departure before the
  // consent steps take their screenshots.
  await page.waitForURL((url) => !url.pathname.endsWith("/practice.html"), { timeout: 15000 });
  await page.waitForLoadState("domcontentloaded");
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, username, password, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);
  await expect(page).toHaveURL(/\/practice\.html$/, { timeout: 15000 });
  await expect(page.locator("#hmrcConnectionLine")).toHaveText("Connected to HMRC as an agent.");
}
