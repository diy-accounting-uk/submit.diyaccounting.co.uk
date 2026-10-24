// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/mcpCodes.browser.test.js
// The page a tool's codes link opens: it asks for the codes the entry needs and stores them.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const readPublic = (relativePath) => fs.readFileSync(path.join(PUBLIC_DIR, relativePath), "utf-8");

const ENTRY_ID = "11111111-2222-4333-8444-555555555555";
const PAGE = `http://localhost:3000/companies-house/mcpCodes.html?entry=${ENTRY_ID}`;
const DIRECTORS = [
  { forename: "Jo", surname: "Brick" },
  { forename: "Sam", surname: "Mortar" },
];

async function setupRoutes(page, { entry, putStatus = 200, putBody = { state: "filled" } }) {
  const puts = [];
  await page.route("**/companies-house/mcpCodes.page.js*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: readPublic("companies-house/mcpCodes.page.js") });
  });
  await page.route("**/companies-house/mcpCodes.html*", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: readPublic("companies-house/mcpCodes.html") });
  });
  await page.route("**/submit.css", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/css", body: readPublic("submit.css") });
  });
  await page.route("**/api/v1/mcp/codes-entries/*", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      puts.push(request.postDataJSON());
      return route.fulfill({ status: putStatus, contentType: "application/json", body: JSON.stringify(putBody) });
    }
    if (!entry) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "expired" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(entry) });
  });
  return puts;
}

test.describe("Companies House codes page", () => {
  test("asks for the company code only, then tells the user to go back to the chat", async ({ page }) => {
    const puts = await setupRoutes(page, { entry: { state: "pending", kind: "accounts", companyNumber: "12345678", directors: [] } });
    await page.goto(PAGE, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#codesIntro")).toContainText("12345678");
    await expect(page.locator("#personalCodeFields input")).toHaveCount(0);
    await expect(page.locator("#companyAuthCode")).toHaveAttribute("type", "password");
    await page.screenshot({ path: "target/mcp-codes-screenshots/mcp-codes-accounts.png" });

    await page.locator("#companyAuthCode").fill("Sim0123");
    await page.locator("#saveCodesBtn").click();

    await expect(page.locator("#codesDoneView")).toBeVisible();
    await expect(page.locator("#codesFormView")).toBeHidden();
    expect(puts).toEqual([{ companyAuthCode: "Sim0123", personalCodes: [] }]);
  });

  test("asks for one personal code for each director, in order", async ({ page }) => {
    const puts = await setupRoutes(page, {
      entry: { state: "pending", kind: "confirmation-statement", companyNumber: "12345678", directors: DIRECTORS },
    });
    await page.goto(PAGE, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#personalCodeFields label")).toHaveText(["Personal code for Jo Brick", "Personal code for Sam Mortar"]);
    await page.screenshot({ path: "target/mcp-codes-screenshots/mcp-codes-confirmation-statement.png" });

    await page.locator("#companyAuthCode").fill("Sim0123");
    await page.locator("#personalCode0").fill("ABCDE123456");
    await page.locator("#personalCode1").fill("FGHIJK67890");
    await page.locator("#saveCodesBtn").click();

    await expect(page.locator("#codesDoneView")).toBeVisible();
    expect(puts).toEqual([{ companyAuthCode: "Sim0123", personalCodes: ["ABCDE123456", "FGHIJK67890"] }]);
  });

  test("shows the reason and lets the user try again when the codes are refused", async ({ page }) => {
    await setupRoutes(page, {
      entry: { state: "pending", kind: "accounts", companyNumber: "12345678", directors: [] },
      putStatus: 400,
      putBody: { message: "Invalid companyAuthCode - must be 6 to 8 characters" },
    });
    await page.goto(PAGE, { waitUntil: "domcontentloaded" });

    await page.locator("#companyAuthCode").fill("Sim0123");
    await page.locator("#saveCodesBtn").click();

    await expect(page.locator("#codesMessage")).toHaveText("Invalid companyAuthCode - must be 6 to 8 characters");
    await expect(page.locator("#saveCodesBtn")).toBeEnabled();
    await expect(page.locator("#codesDoneView")).toBeHidden();
  });

  test("says the link has expired when the entry is gone", async ({ page }) => {
    await setupRoutes(page, { entry: null });
    await page.goto(PAGE, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#codesMessage")).toContainText("expired");
    await expect(page.locator("#codesFormView")).toBeHidden();
  });

  test("shows the saved state, not the form, when the codes are already in", async ({ page }) => {
    await setupRoutes(page, { entry: { state: "filled", kind: "accounts", companyNumber: "12345678", directors: [] } });
    await page.goto(PAGE, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#codesDoneView")).toBeVisible();
    await expect(page.locator("#codesFormView")).toBeHidden();
  });
});
