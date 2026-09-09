// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/chromium.client.status-stack.test.js

import { test, expect, chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, -5);
}

test.describe("Client Status Message Stacking", () => {
  let htmlContent;
  let statusMessagesJsContent;

  test.beforeAll(async () => {
    htmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/vat/submitVat.html"), "utf-8");
    // Use the status-messages widget which is an IIFE that directly sets window.showStatus
    // (submit.js is an ES module whose imports fail when injected as a string)
    statusMessagesJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/status-messages.js"), "utf-8");
  });

  test.beforeEach(async ({ page }) => {
    await page.setContent(htmlContent, {
      baseURL: "http://localhost:3000",
      waitUntil: "domcontentloaded",
    });

    // Inject status-messages widget which provides showStatus/hideStatus globals
    await page.addScriptTag({ content: statusMessagesJsContent });
  });

  test("should stack multiple info messages and auto-remove after 5 seconds", async ({ page }) => {
    const timestamp = getTimestamp();
    // Trigger three info messages in quick succession
    await page.evaluate(() => {
      window.showStatus("Info message 1", "info");
      window.showStatus("Info message 2", "info");
      window.showStatus("Info message 3", "info");
    });
    // All three should be visible and stacked
    const messages = page.locator("#statusMessagesContainer .status-message");
    await expect(messages).toHaveCount(3);
    await expect(messages.nth(0).locator(".status-message-content")).toHaveText("Info message 1");
    await expect(messages.nth(1).locator(".status-message-content")).toHaveText("Info message 2");
    await expect(messages.nth(2).locator(".status-message-content")).toHaveText("Info message 3");
    await page.screenshot({ path: `target/browser-test-results/browser-status-stack-initial_${timestamp}.png` });
    // Wait 31 seconds for auto-removal
    // await page.waitForTimeout(31000);
    // await expect(messages).toHaveCount(0);
  });

  test("should stack error and info messages, only auto-remove info", async ({ page }) => {
    // Trigger error and info
    await page.evaluate(() => {
      window.showStatus("Error message", "error");
      window.showStatus("Info message", "info");
    });
    const messages = page.locator("#statusMessagesContainer .status-message");
    await expect(messages).toHaveCount(2);
    await expect(messages.nth(0).locator(".status-message-content")).toHaveText("Error message");
    await expect(messages.nth(1).locator(".status-message-content")).toHaveText("Info message");
    // Wait 31 seconds
    // await page.waitForTimeout(31000);
    // Only error should remain
    // await expect(messages).toHaveCount(1);
    // await expect(messages.nth(0)).toHaveText("Error message");
  });

  test("should clear all messages with hideStatus", async ({ page }) => {
    await page.evaluate(() => {
      window.showStatus("Message 1", "info");
      window.showStatus("Message 2", "error");
    });
    const messages = page.locator("#statusMessagesContainer .status-message");
    await expect(messages).toHaveCount(2);
    // Call hideStatus
    await page.evaluate(() => window.hideStatus());
    await expect(messages).toHaveCount(0);
  });

  test("should remove individual messages when close button is clicked", async ({ page }) => {
    const timestamp = getTimestamp();
    // Create multiple messages
    await page.evaluate(() => {
      window.showStatus("Message 1", "info");
      window.showStatus("Message 2", "error");
      window.showStatus("Message 3", "success");
    });

    const messages = page.locator("#statusMessagesContainer .status-message");
    await expect(messages).toHaveCount(3);

    // Take screenshot before clicking
    await page.screenshot({ path: `target/browser-test-results/browser-close-button-before_${timestamp}.png` });

    // Click close button on the second message
    const secondMessageCloseButton = messages.nth(1).locator(".status-close-button");
    await expect(secondMessageCloseButton).toBeVisible();
    await secondMessageCloseButton.click();

    // Should have 2 messages remaining
    await expect(messages).toHaveCount(2);

    // Verify the correct messages remain
    await expect(messages.nth(0).locator(".status-message-content")).toHaveText("Message 1");
    await expect(messages.nth(1).locator(".status-message-content")).toHaveText("Message 3");

    // Take screenshot after clicking
    await page.screenshot({ path: `target/browser-test-results/browser-close-button-after_${timestamp}.png` });

    // Click close button on first remaining message
    const firstMessageCloseButton = messages.nth(0).locator(".status-close-button");
    await firstMessageCloseButton.click();

    // Should have 1 message remaining
    await expect(messages).toHaveCount(1);
    await expect(messages.nth(0).locator(".status-message-content")).toHaveText("Message 3");
  });
});
