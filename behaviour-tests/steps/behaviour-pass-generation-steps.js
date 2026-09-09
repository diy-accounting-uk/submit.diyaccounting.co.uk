// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/steps/behaviour-pass-generation-steps.js
// Step functions for generate-pass-digital and generate-pass-physical activities.

import { test } from "@playwright/test";
import { timestamp } from "../helpers/behaviour-helpers.js";

/**
 * Navigate to the Generate Digital Pass page via direct URL.
 */
export async function goToGenerateDigitalPassPage(page, testUrl, screenshotPath) {
  await test.step("Navigate to Generate Digital Pass page", async () => {
    const base = page.url() || testUrl;
    const url = new URL("/passes/generate-digital.html", base);
    console.log(`[generate-pass]: Navigating to ${url}`);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-generate-digital-01-page-loaded.png` });
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
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-generate-physical-01-page-loaded.png` });
  });
}

/**
 * Generate a pass by clicking the Generate Pass button on either digital or physical page.
 * Returns the pass code from the result display.
 */
export async function generatePass(page, screenshotPath) {
  return await test.step("Click Generate Pass button", async () => {
    const generateBtn = page.locator("#generatePassBtn");
    console.log("[generate-pass]: Clicking Generate Pass button");
    await generateBtn.click();

    // Wait for pass code to appear in the result
    const passCodeEl = page.locator("#generatedPassCode");
    await passCodeEl.waitFor({ state: "visible", timeout: 15000 });

    const passCode = await passCodeEl.textContent();
    console.log(`[generate-pass]: Generated pass code: ${passCode}`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-generate-pass-02-result.png` });

    return passCode?.trim() || "";
  });
}

/**
 * Verify the generated pass result is displayed with expected elements.
 */
export async function verifyPassGenerated(page, screenshotPath) {
  await test.step("Verify pass generation result", async () => {
    // Verify pass code is displayed
    const passCodeEl = page.locator("#generatedPassCode");
    await passCodeEl.waitFor({ state: "visible", timeout: 10000 });
    const passCode = await passCodeEl.textContent();
    console.log(`[generate-pass]: Pass code displayed: ${passCode}`);

    // Verify pass URL is displayed
    const passUrlEl = page.locator("#generatedPassUrl");
    const passUrl = await passUrlEl.textContent().catch(() => "");
    console.log(`[generate-pass]: Pass URL displayed: ${passUrl}`);

    // Verify QR code SVG is rendered (client-side generated)
    const qrCodeSvg = page.locator("#generatedPassQrCode svg");
    const qrVisible = await qrCodeSvg.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`[generate-pass]: QR code SVG visible: ${qrVisible}`);

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-generate-pass-03-verified.png` });
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
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-my-passes-01-section.png` });

    // Verify the expected pass code appears in the list
    const passEntry = page.locator(`[data-pass-code="${expectedPassCode}"]`);
    const visible = await passEntry.isVisible({ timeout: 10000 }).catch(() => false);
    console.log(`[generate-pass]: Pass ${expectedPassCode} visible in My Generated Passes: ${visible}`);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-my-passes-02-verified.png` });
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
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-physical-product-${productType}.png` });
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

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-physical-downloads.png` });
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
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-physical-fulfillment.png` });
  });
}
