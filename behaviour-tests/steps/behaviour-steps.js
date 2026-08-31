// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/behaviour-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, loggedGoto, timestamp } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-steps";

export async function goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath = defaultScreenshotPath) {
  await test.step("The user opens the home page expecting the log in link to be visible", async () => {
    // Load default document with warning message bypass
    console.log("Loading document...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-home-page.png` });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-home-page.png` });
    await loggedGoto(page, testUrl, "Loading home page");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-home-page.png` });

    // Home page has a welcome message and clickable login link
    console.log("Checking home page...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-home-page.png` });
    await expect(page.getByText("Log in")).toBeVisible({ timeout: 15000 });
  });
}

export async function goToHomePage(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user returns to the home page from the Bundles screen via home icon", async () => {
    // Return to home via home icon
    console.log("Returning to home via home icon...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-goto-home-page.png` });
    await expect(page.locator(".home-link")).toBeVisible({ timeout: 10000 });
    await Promise.all([
      page.waitForURL(/index\.html$|\/$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      loggedClick(page, ".home-link", "Home icon", { screenshotPath }),
    ]);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-goto-home.png` });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-goto-home.png` });
  });
}

export async function goToHomePageUsingMainNav(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user returns to the home page via the main navigation", async () => {
    // Return to home via main navigation
    console.log("Returning to home via main navigation...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-goto-home-nav.png` });
    await expect(page.locator("nav.main-nav a:has-text('Activities')")).toBeVisible({ timeout: 10000 });
    await Promise.all([
      page.waitForURL(/index\.html$|\/$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      loggedClick(page, "nav.main-nav a:has-text('Activities')", "Clicking Activities in main navigation", { screenshotPath }),
    ]);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-goto-home.png` });
  });
}

export async function goToAboutPage(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user navigates to the About page via the info icon", async () => {
    console.log("Navigating to About page via info icon...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-goto-about.png` });
    await expect(page.locator("a.info-link")).toBeVisible({ timeout: 10000 });
    await Promise.all([
      page.waitForURL(/about\.html$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      loggedClick(page, "a.info-link", "Clicking info icon to go to About", { screenshotPath }),
    ]);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-about-page.png` });
  });
}

export async function goToHelpPageFromAbout(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user navigates to the Help page from the About page", async () => {
    console.log("Navigating to Help page from About...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-about-to-help.png` });
    await expect(page.locator("a.about-nav-link:has-text('Help')")).toBeVisible({ timeout: 10000 });
    await Promise.all([
      page.waitForURL(/help\/index\.html$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      loggedClick(page, "a.about-nav-link:has-text('Help')", "Clicking Help link on About page", { screenshotPath }),
    ]);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-help-page.png` });
  });
}

export async function goToUserGuideFromAbout(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user navigates to the User Guide from the About page", async () => {
    console.log("Navigating to User Guide from About...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-about-to-guide.png` });
    await expect(page.locator("a.about-nav-link:has-text('User Guide')")).toBeVisible({ timeout: 10000 });
    await Promise.all([
      page.waitForURL(/guide\/index\.html$/, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {}),
      loggedClick(page, "a.about-nav-link:has-text('User Guide')", "Clicking User Guide link on About page", { screenshotPath }),
    ]);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-guide-page.png` });
  });
}

export async function enableDeveloperMode(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user enables developer mode via the global toggle", async () => {
    console.log("Enabling developer mode via global toggle...");
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-enable-dev-mode.png` });

    // Check if developer mode is already enabled
    const isEnabled = await page.evaluate(() => sessionStorage.getItem("showDeveloperOptions") === "true");
    if (isEnabled) {
      console.log("Developer mode already enabled, skipping toggle.");
      return;
    }

    // Click the developer mode toggle icon
    const toggleIcon = page.locator(".developer-mode-toggle");
    await expect(toggleIcon).toBeVisible({ timeout: 10000 });
    await loggedClick(page, ".developer-mode-toggle", "Developer mode toggle icon", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-dev-mode-enabled.png` });

    // Verify developer mode is now enabled
    const nowEnabled = await page.evaluate(() => sessionStorage.getItem("showDeveloperOptions") === "true");
    expect(nowEnabled).toBe(true);
    console.log("Developer mode enabled successfully.");
  });
}

export async function consentToDataCollection(page, screenshotPath = defaultScreenshotPath) {
  // If there is a "CloudWatch RUM" analytics consent dialog, accept it
  await test.step("Accept CloudWatch RUM analytics consent if shown", async () => {
    const consentSelector = 'button:has-text("Accept")';
    const isConsentVisible = await page
      .locator(consentSelector)
      .isVisible()
      .catch(() => false);
    if (isConsentVisible) {
      console.log("CloudWatch RUM analytics consent dialog is visible, accepting...");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-consent-dialog.png` });
      await loggedClick(page, consentSelector, "Accept CloudWatch RUM consent", { screenshotPath });
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-consent-accepted.png` });
    } else {
      console.log("CloudWatch RUM analytics consent dialog not shown, continuing...");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-no-consent-dialog.png` });
    }
  });
}
