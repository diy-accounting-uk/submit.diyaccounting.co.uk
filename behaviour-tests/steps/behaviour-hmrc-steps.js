// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/behaviour-hmrc-steps.js

import { expect, test } from "@playwright/test";
import { loggedFill, timestamp, loggedClick } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-hmrc-steps";

export async function acceptCookiesHmrc(page, screenshotPath = defaultScreenshotPath) {
  await test.step("Accept additional cookies and hide banner if presented", async () => {
    // Accept cookies if the banner is present
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-accept-cookies.png` });
    const acceptCookiesButton = page.getByRole("button", { name: "Accept additional cookies" });
    if (await acceptCookiesButton.isVisible()) {
      console.log("[USER INTERACTION] Clicking: Accept additional cookies button - Accepting cookies");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-accepting-cookies.png` });
      await loggedClick(page, acceptCookiesButton, "Accept additional cookies");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-accepted-cookies.png` });
    }
    // Hide the cookies message if it's still visible
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-accept-cookies-hide.png` });
    const hideCookiesButton = page.getByRole("button", { name: "Hide cookies message" });
    if (await hideCookiesButton.isVisible()) {
      console.log("[USER INTERACTION] Clicking: Hide cookies message button - Hiding cookies message");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-accept-cookies-hide-clicking.png` });
      await loggedClick(page, hideCookiesButton, "Hide cookies message");
      await page.screenshot({
        path: `${screenshotPath}/${timestamp()}-06-hid-cookies-message.png`,
      });
    }
  });
}

export async function goToHmrcAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user continues and is offered to sign in to the HMRC online service", async () => {
    //  Submit the permission form and expect the sign in option to be visible
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-submit-permission-wait.png` });
    await page.waitForTimeout(100);

    // If the screen has the text "invalid_request" anywhere, then fail the step immediately
    const pageContent = await page.content();
    if (pageContent.includes("invalid_request")) {
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-submit-permission-sign-in.png` });
      throw new Error("HMRC authorization page returned an invalid_request error");
    }

    console.log(`[USER INTERACTION] Clicking: Continue button - Continuing with HMRC permission`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-submit-permission.png` });
    await loggedClick(page, page.getByRole("button", { name: "Continue" }), "Continue");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-submit-permission-sign-in.png` });
    await expect(page.getByRole("button", { name: "Sign in to the HMRC online service" })).toContainText(
      "Sign in to the HMRC online service",
    );
  });
}

export async function initHmrcAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user chooses to sign in to HMRC and sees the credential fields", async () => {
    // Submit the sign in and expect the credentials form to be visible
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-init-hmrc-auth.png` });
    console.log(`[USER INTERACTION] Clicking: Sign in to HMRC button - Starting HMRC authentication`);
    await loggedClick(page, page.getByRole("button", { name: "Sign in to the HMRC online service" }), "Sign in to the HMRC online service");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-init-hmrc-auth.png` });
    await expect(page.locator("#userId")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });
}

export async function fillInHmrcAuth(page, hmrcTestUsername, hmrcTestPassword, screenshotPath = defaultScreenshotPath) {
  await test.step("The user provides HMRC credentials", async () => {
    // Fill in credentials and submit expecting this to initiate the HMRC sign in process
    await loggedFill(page, "#userId", hmrcTestUsername, "Entering HMRC user ID");
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-fill-in-hmrc-auth.png` });
    await loggedFill(page, "#password", hmrcTestPassword, "Entering HMRC password");
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-fill-in-hmrc-auth.png` });
  });
}

export async function submitHmrcAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits HMRC credentials, expecting to be prompted to grant permission", async () => {
    console.log(`[USER INTERACTION] Clicking: Sign in button - Submitting HMRC credentials`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-submit-hmrc-auth.png` });
    await loggedClick(page, page.getByRole("button", { name: "Sign in" }), "Sign in");
    // The click starts a navigation; a screenshot taken while the page is being torn down fails
    // with "Unable to capture screenshot", so wait for the next document first.
    await page.waitForLoadState("domcontentloaded");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-submit-hmrc-auth-clicked.png` });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-submit-hmrc-auth.png` });
    await expect(page.locator("#givePermission")).toBeVisible();
  });
}

export async function grantPermissionHmrcAuth(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user grants permission to HMRC and returns to the application", async () => {
    //  Submit the give permission form
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-give-permission-hmrc-auth.png` });
    // Click triggers redirect back to app - wait for navigation to complete
    await Promise.all([page.waitForURL(/.*/, { timeout: 30000 }), loggedClick(page, "#givePermission", "Give permission")]);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-give-permission-redirected.png` });
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-give-permission-hmrc-auth.png` });
  });
}
