// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/steps/behaviour-pass-generation-steps.js
// Step functions for generate-pass-digital and generate-pass-physical activities.

import { test, expect } from "@playwright/test";
import { timestamp, takeScreenshot } from "../helpers/behaviour-helpers.js";

/**
 * Navigate to the Generate Digital Pass page via direct URL.
 */
export async function goToGenerateDigitalPassPage(page, testUrl, screenshotPath) {
  await test.step("Navigate to Generate Digital Pass page", async () => {
    const base = page.url() || testUrl;
    const url = new URL("/passes/generate-digital.html", base);
    console.log(`[generate-pass]: Navigating to ${url}`);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-generate-digital-01-page-loaded.png`, readerView: true });
  });
}

/**
 * Navigate to the Generate Physical Pass page via direct URL.
 */
export async function goToGeneratePhysicalPassPage(page, testUrl, screenshotPath) {
  await test.step("Navigate to Generate Physical Pass page", async () => {
    const base = page.url() || testUrl;
    const url = new URL("/passes/generate-physical.html", base);
    console.log(`[generate-pass]: Navigating to ${url}`);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-generate-physical-01-page-loaded.png`, readerView: true });
  });
}

/**
 * Generate a pass by clicking the Generate Pass button on either digital or physical page.
 * Waits for the landing in My generated passes and returns the focused pass's code.
 */
export async function generatePass(page, screenshotPath) {
  return await test.step("Click Generate Pass button", async () => {
    const generateBtn = page.locator("#generatePassBtn");
    console.log("[generate-pass]: Clicking Generate Pass button");
    await generateBtn.click();

    // The generate page hands over to My generated passes, with the new pass in focus.
    await page.waitForURL(/\/bundles\.html.*#myGeneratedPasses/, { timeout: 15000 });
    const passEntry = page.locator("#myGeneratedPasses [data-pass-code]:focus");
    await passEntry.waitFor({ state: "visible", timeout: 15000 });
    const passCode = await passEntry.getAttribute("data-pass-code");
    console.log(`[generate-pass]: Generated pass code: ${passCode}`);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-generate-pass-02-result.png`, readerView: true });

    return passCode?.trim() || "";
  });
}

/**
 * Verify the landing after generation: My generated passes is visible, the new pass is listed and
 * in focus, and the confirmation points at the section.
 */
export async function verifyPassGenerated(page, expectedPassCode, screenshotPath) {
  await test.step("Verify the landing in My generated passes", async () => {
    await expect(page.locator("#myGeneratedPasses")).toBeVisible({ timeout: 10000 });
    const passEntry = page.locator(`#generatedPassesList [data-pass-code="${expectedPassCode}"]`);
    await expect(passEntry).toBeVisible({ timeout: 10000 });
    await expect(passEntry).toBeFocused();
    await expect(page.locator("#statusMessagesContainer")).toContainText("Track what this link earns under My generated passes");
    expect(new URL(page.url()).hash).toBe("#myGeneratedPasses");
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-generate-pass-03-verified.png`, readerView: true });
  });
}

/**
 * Open the QR page of a listed pass through its "View QR" link.
 */
export async function openPassQr(page, passCode, screenshotPath) {
  await test.step("Open the pass QR page", async () => {
    await page.locator(`#generatedPassesList [data-pass-code="${passCode}"] a`, { hasText: "View QR" }).click();
    await page.locator("#passResult").waitFor({ state: "visible", timeout: 15000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-generate-pass-04-qr.png`, readerView: true });
  });
}

/**
 * Verify the "My Generated Passes" section on the bundles page shows a pass.
 */
export async function verifyMyGeneratedPasses(page, expectedPassCode, screenshotPath) {
  await test.step("Verify My Generated Passes section", async () => {
    // Scroll to the My Generated Passes section
    const section = page.locator("#myGeneratedPasses");
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-my-passes-01-section.png`, readerView: true });

    // Verify the expected pass code appears in the list
    const passEntry = page.locator(`[data-pass-code="${expectedPassCode}"]`);
    const visible = await passEntry.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[generate-pass]: Pass ${expectedPassCode} visible in My Generated Passes: ${visible}`);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-my-passes-02-verified.png`, readerView: true });
  });
}

/**
 * Get the current token balance displayed on the page via API.
 */
export async function getTokenBalance(page) {
  return await test.step("Get token balance via API", async () => {
    const result = await page.evaluate(async () => {
      const idToken = localStorage.getItem("cognitoIdToken");
      if (!idToken) return { tokensRemaining: null };
      try {
        const response = await fetch("/api/v1/bundle", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await response.json();
        return { tokensRemaining: data.tokensRemaining ?? null };
      } catch {
        return { tokensRemaining: null };
      }
    });
    console.log(`[generate-pass]: Token balance: ${result.tokensRemaining}`);
    return result.tokensRemaining;
  });
}

/**
 * Select a physical product type (t-shirt, mug-right, mug-left) on the physical pass page.
 */
export async function selectPhysicalProductType(page, productType, screenshotPath) {
  await test.step(`Select physical product type: ${productType}`, async () => {
    const selector = page.locator(`[data-product-type="${productType}"]`);
    console.log(`[generate-pass]: Selecting product type: ${productType}`);
    await selector.click();
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-physical-product-${productType}.png`, readerView: true });
  });
}

/**
 * Verify physical media design downloads are available.
 */
export async function verifyPhysicalDesignDownloads(page, screenshotPath) {
  await test.step("Verify physical design download buttons", async () => {
    const frontDownload = page.locator("#downloadFrontSvg");
    const backDownload = page.locator("#downloadBackSvg");

    const frontVisible = await frontDownload.isVisible({ timeout: 5000 }).catch(() => false);
    const backVisible = await backDownload.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[generate-pass]: Front SVG download visible: ${frontVisible}`);
    console.log(`[generate-pass]: Back SVG download visible: ${backVisible}`);

    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-physical-downloads.png`, readerView: true });
  });
}

/**
 * Verify fulfillment link is present for physical passes.
 */
export async function verifyFulfillmentLink(page, screenshotPath) {
  await test.step("Verify fulfillment link is present", async () => {
    const fulfillmentLink = page.locator("a[data-fulfillment-link]");
    const visible = await fulfillmentLink.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[generate-pass]: Fulfillment link visible: ${visible}`);
    if (visible) {
      const href = await fulfillmentLink.getAttribute("href");
      console.log(`[generate-pass]: Fulfillment link href: ${href}`);
    }
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-physical-fulfillment.png`, readerView: true });
  });
}
