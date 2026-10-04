// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/steps/behaviour-hmrc-assist-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, timestamp, takeScreenshot } from "../helpers/behaviour-helpers.js";
import { fillInHmrcAuth, goToHmrcAuth, grantPermissionHmrcAuth, initHmrcAuth, submitHmrcAuth } from "./behaviour-hmrc-steps.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-hmrc-assist-steps";

export const VAT_ASSIST_BOXES = {
  vatDueSales: "1500.00",
  vatDueAcquisitions: "0.00",
  vatReclaimedCurrPeriod: "300.00",
  totalValueSalesExVAT: "7500",
  totalValuePurchasesExVAT: "1500",
  totalValueGoodsSuppliedExVAT: "0",
  totalAcquisitionsExVAT: "0",
};

/**
 * Add a Gov-Test-Scenario header to every request that matches the URL pattern, so a scenario
 * reaches the HMRC simulator through the app's own routes.
 * @param {import("@playwright/test").Page} page
 * @param {string} urlPattern - Playwright route glob
 * @param {string} scenario - Gov-Test-Scenario value
 */
export async function sendTestScenarioOn(page, urlPattern, scenario) {
  await page.route(urlPattern, async (route) => {
    await route.continue({ headers: { ...route.request().headers(), "gov-test-scenario": scenario } });
  });
}

/**
 * Record the app's HMRC Assist requests and their final response statuses; a 202 is the
 * asynchronous accepted answer, which the page polls past, so it is not recorded.
 * @param {import("@playwright/test").Page} page
 * @param {"vat"|"itsa"} kind
 * @returns {{reports: object[], acknowledgements: object[]}} live arrays, filled as requests complete
 */
export function recordAssistTraffic(page, kind) {
  const traffic = { reports: [], acknowledgements: [] };
  page.on("response", async (response) => {
    const url = response.url();
    const request = response.request();
    if (request.method() !== "POST" || response.status() === 202) return;
    if (url.endsWith(`/api/v1/hmrc/${kind}/assist/report`)) {
      traffic.reports.push({ status: response.status(), body: request.postDataJSON() });
    } else if (url.endsWith(`/api/v1/hmrc/${kind}/assist/acknowledge`)) {
      traffic.acknowledgements.push({ status: response.status(), body: request.postDataJSON() });
    }
  });
  return traffic;
}

/**
 * From the empty VAT form, enter the VRN and connect to HMRC so the open periods load.
 * Ends back on the VAT form with the period choice showing.
 */
export async function connectToHmrcFromVatForm(page, { vrn, username, password }, screenshotPath = defaultScreenshotPath) {
  await test.step("The user connects the VAT form to HMRC to see the open periods", async () => {
    await loggedFill(page, "#vatNumber", vrn, "Entering VAT number", { screenshotPath });
    const connectButton = page.locator("#connectHmrcBtn");
    await expect(connectButton).toBeVisible({ timeout: 15000 });
    await Promise.all([
      page.waitForURL(/.*/, { timeout: 30000 }),
      loggedClick(page, "#connectHmrcBtn", "Connect to HMRC", { screenshotPath }),
    ]);
    await page.waitForLoadState("networkidle");
    await goToHmrcAuth(page, screenshotPath);
    await initHmrcAuth(page, screenshotPath);
    await fillInHmrcAuth(page, username, password, screenshotPath);
    await submitHmrcAuth(page, screenshotPath);
    await grantPermissionHmrcAuth(page, screenshotPath);
    await expect(page.locator("#vatSubmissionForm")).toBeVisible({ timeout: 30000 });
    if (!(await page.locator("#vatNumber").inputValue())) {
      await loggedFill(page, "#vatNumber", vrn, "Entering VAT number again", { screenshotPath });
    }
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-connected-to-hmrc.png` });
  });
}

/**
 * Choose the first open period and fill the nine boxes, leaving the period dates to the choice.
 */
export async function fillInVatBoxesForOpenPeriod(page, boxes = VAT_ASSIST_BOXES, screenshotPath = defaultScreenshotPath) {
  await test.step("The user chooses an open period and fills in the nine boxes", async () => {
    await expect(page.locator("#obligationChoice")).toBeVisible({ timeout: 30000 });
    await page.locator("#obligationChoice").selectOption({ index: 0 });
    for (const [id, value] of Object.entries(boxes)) {
      await loggedFill(page, `#${id}`, value, `Entering ${id}`, { screenshotPath });
    }
    const declaration = page.locator("#declaration");
    if (!(await declaration.isChecked())) await declaration.check();
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-boxes-filled.png` });
  });
}

export async function requestHmrcAssistFeedback(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user asks HMRC Assist to check the return", async () => {
    const control = page.locator("#hmrcAssistCheckBtn");
    await expect(control).toBeVisible({ timeout: 15000 });
    await expect(control).toBeEnabled();
    await loggedClick(page, "#hmrcAssistCheckBtn", "Check this return with HMRC Assist", { screenshotPath });
  });
}

/**
 * Expect HMRC's messages on screen in the order given, each with its title, body and link text.
 * @param {import("@playwright/test").Page} page
 * @param {Array<{title: string, body: string, links: Array<{title: string, url: string}>}>} expectedMessages
 */
export async function verifyAssistMessagesInOrder(page, expectedMessages, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees HMRC's messages verbatim and in order", async () => {
    const items = page.locator("#hmrcAssistMessages > li");
    await expect(items).toHaveCount(expectedMessages.length, { timeout: 60000 });
    for (const [index, message] of expectedMessages.entries()) {
      const item = items.nth(index);
      await expect(item.locator(".hmrc-assist-message-title")).toHaveText(message.title);
      await expect(item.locator(".hmrc-assist-message-body")).toHaveText(message.body);
      for (const link of message.links) {
        await expect(item.locator(`a[href="${link.url}"]`)).toHaveText(link.title);
      }
    }
    await items.last().scrollIntoViewIfNeeded();
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-assist-messages.png` });
  });
}
