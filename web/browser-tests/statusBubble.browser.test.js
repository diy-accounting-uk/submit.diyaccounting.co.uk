// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import JSZip from "jszip";

const PAGE_URL = "http://localhost:3000/companies-house/fileCompanyTaxReturn.html";
const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".txt": "text/plain",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const COMPANY_PROFILE = {
  companyNumber: "00000007",
  companyName: "Precision Code Ltd",
  dateOfCreation: "2019-04-01",
  accountsLastPeriodEnd: "2025-03-31",
};
const BOOK_DIRECTORY = path.join(process.cwd(), "fixtures/diya-gl/precision-code-ltd");
const PREVIEW_FAILURE = "HMRC could not check the return: the period of account is missing.";

// Serves the real site from web/public, signed in, with the company lookup answered and the
// return's preview failing with an error the page shows in its status area.
async function serveSite(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cognitoIdToken", "mock-id-token");
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "sam.patel@test.diyaccounting.co.uk" }));
    } catch {
      // storage can be blocked; the page then asks for sign-in
    }
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname === "/submit.environment-name.txt") {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "ci" });
      return;
    }
    if (url.pathname === "/api/v1/bundle") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles: [], tokensRemaining: 0 }) });
      return;
    }
    if (url.pathname === "/api/v1/companies-house/company/00000007") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(COMPANY_PROFILE) });
      return;
    }
    if (url.pathname === "/api/v1/hmrc/ct/return/preview") {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: PREVIEW_FAILURE }) });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      await route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
}

async function openForm(page) {
  await serveSite(page);
  await page.goto(PAGE_URL, { waitUntil: "domcontentloaded" });
  await page.locator("#companyNumber").fill("00000007");
  await page.locator("#companyLookupBtn").click();
  await expect(page.locator("#formView")).toBeVisible();
}

// The precision-code-ltd book fills the accounts; the answers it leaves complete a form whose
// preview the page sends.
async function fillFromTheBook(page) {
  const zip = new JSZip();
  zip.file("book.toml", fs.readFileSync(path.join(BOOK_DIRECTORY, "book.toml")));
  zip.file("lines.jsonl", fs.readFileSync(path.join(BOOK_DIRECTORY, "lines.jsonl")));
  await page.locator("#booksImportFile").setInputFiles({
    name: "precision-code.diya-gl.zip",
    mimeType: "application/zip",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  await expect(page.locator("#booksImportStatus")).toContainText("Filled", { timeout: 60_000 });
  await page.locator("#regimeSmall").check();
  await page.locator("#utr").fill("8596148860");
  await page.locator("#directorDateApproved").fill("2026-09-15");
  for (const id of [
    "statementSection477Exemption",
    "statementMembersNotRequiredAudit",
    "statementDirectorsResponsibilities",
    "statementSmallCompaniesRegime",
    "declarationAccepted",
  ]) {
    await page.locator(`#${id}`).check();
  }
}

async function scrollToFoot(page) {
  await page.locator("#previewBtn").scrollIntoViewIfNeeded();
  await expect(page.locator("#statusMessagesContainer")).not.toBeInViewport();
}

const showMessage = (page, message, type) => page.evaluate(([text, kind]) => window.showStatus(text, kind), [message, type]);

test.describe("The bubble for a status message out of view", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("an error added while the reader is far down the page shows as a bubble whose link goes to the message", async ({ page }) => {
    await openForm(page);
    await fillFromTheBook(page);
    await scrollToFoot(page);
    await page.locator("#previewBtn").click();

    const bubble = page.locator(".status-bubble");
    await expect(bubble).toBeVisible();
    await expect(bubble).toBeInViewport();
    await expect(bubble).toHaveAttribute("data-kind", "error");
    const errorText = await page.locator("#statusMessagesContainer .status-error .status-message-content").last().textContent();
    await expect(bubble.locator(".status-bubble-text")).toHaveText(errorText);
    await expect(bubble).not.toHaveAttribute("role");
    await expect(bubble).not.toHaveAttribute("aria-live");
    await expect(bubble.locator(".status-bubble-close")).toHaveAttribute("aria-label", "Close message");

    await bubble.getByRole("link", { name: "Go to the message" }).click();
    await expect(page.locator("#statusMessagesContainer")).toBeInViewport();
    await expect(bubble).toHaveCount(0);
    await expect(page.locator("#statusMessagesContainer .status-error").last()).toBeFocused();
  });

  test("an error shown while the status area is in view makes no bubble", async ({ page }) => {
    await openForm(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator("#statusMessagesContainer")).toBeInViewport();
    await showMessage(page, "The company number is not on the register.", "error");
    await expect(page.locator("#statusMessagesContainer .status-error")).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.locator(".status-bubble")).toHaveCount(0);
  });

  test("an error bubble stays until it is closed, and an information bubble closes on its own after eight seconds", async ({ page }) => {
    await page.clock.install();
    await openForm(page);
    await scrollToFoot(page);

    await showMessage(page, "The return could not be checked.", "error");
    const bubble = page.locator(".status-bubble");
    await expect(bubble).toHaveAttribute("data-kind", "error");
    await page.clock.fastForward(20_000);
    await expect(bubble).toBeVisible();
    await bubble.locator(".status-bubble-close").click();
    await expect(bubble).toHaveCount(0);
    await expect(page.locator("#statusMessagesContainer .status-error")).toHaveCount(1);

    await showMessage(page, "Checking the return with HMRC.", "info");
    await expect(bubble).toHaveAttribute("data-kind", "info");
    await page.clock.fastForward(7_000);
    await expect(bubble).toBeVisible();
    await page.clock.fastForward(1_500);
    await expect(bubble).toHaveCount(0);

    await showMessage(page, "The return is saved.", "success");
    await expect(bubble).toHaveAttribute("data-kind", "success");
    await page.clock.fastForward(8_500);
    await expect(bubble).toHaveCount(0);
  });

  test("one bubble shows the newest message, and it closes when the status area scrolls into view or the message goes", async ({
    page,
  }) => {
    await openForm(page);
    await scrollToFoot(page);
    const bubble = page.locator(".status-bubble");

    await showMessage(page, "The first problem.", "error");
    await showMessage(page, "The second problem, which is longer.", "error");
    await expect(bubble).toHaveCount(1);
    await expect(bubble.locator(".status-bubble-text")).toHaveText("The second problem, which is longer.");

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(bubble).toHaveCount(0);

    await scrollToFoot(page);
    await showMessage(page, "A warning about the period.", "warning");
    await expect(bubble).toHaveAttribute("data-kind", "warning");
    await page.locator("#statusMessagesContainer .status-warning .status-close-button").evaluate((button) => button.click());
    await expect(bubble).toHaveCount(0);
  });

  test("the bubble's close button and link stay in the tab order, and its text wraps inside it at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await openForm(page);
    await scrollToFoot(page);
    await showMessage(page, `${"A long message about the return that runs on ".repeat(4)}and ends here.`, "error");
    const bubble = page.locator(".status-bubble");
    await expect(bubble).toBeInViewport({ ratio: 1 });
    const widths = await bubble.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
    await expect(bubble.locator(".status-bubble-link")).not.toHaveAttribute("tabindex", "-1");
    await expect(bubble.locator(".status-bubble-close")).not.toHaveAttribute("tabindex", "-1");
    await bubble.locator(".status-bubble-link").focus();
    await expect(bubble.locator(".status-bubble-link")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(bubble.locator(".status-bubble-close")).toBeFocused();
  });

  test("the bubble reads in Welsh on the Welsh page", async ({ page }) => {
    await serveSite(page);
    await page.goto(PAGE_URL.replace("/companies-house/", "/cy/companies-house/"), { waitUntil: "domcontentloaded" });
    await page.locator("#companyNumber").fill("00000007");
    await page.locator("#companyLookupBtn").click();
    await expect(page.locator("#formView")).toBeVisible();
    await scrollToFoot(page);
    await showMessage(page, "Neges am y Ffurflen.", "error");
    await expect(page.locator(".status-bubble .status-bubble-link")).toHaveText("Ewch i’r neges");
  });
});
