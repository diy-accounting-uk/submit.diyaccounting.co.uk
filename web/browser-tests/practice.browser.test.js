// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/practice.browser.test.js
// Browser tests for the practice page: the client list, add-client form and error states.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const CLIENT_A = {
  hashedSub: "practice-hash",
  clientId: "01ABCDEFGHJKMNPQRSTVWXYZ0",
  displayName: "Example Trading Ltd",
  identifiers: { vrn: "193054661", nino: null, utr: null, companyNumber: "00000006" },
  authorisations: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
};

const CLIENT_B = {
  hashedSub: "practice-hash",
  clientId: "01ABCDEFGHJKMNPQRSTVWXYZ1",
  displayName: "Jane Freelancer",
  identifiers: { vrn: null, nino: "AB123456C", utr: null, companyNumber: null },
  authorisations: { "MTD-IT": { status: "pending", invitationId: "inv-1", checkedAt: "2026-01-02T00:00:00.000Z" } },
  createdAt: "2026-01-02T00:00:00.000Z",
  archivedAt: null,
};

test.describe("Practice page", () => {
  let practiceHtmlContent;
  let pageChromeJsContent;
  let statusMessagesJsContent;
  let signedOutPanelJsContent;
  let formErrorsJsContent;

  test.beforeAll(async () => {
    practiceHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/practice.html"), "utf-8");
    pageChromeJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/page-chrome.js"), "utf-8");
    statusMessagesJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/status-messages.js"), "utf-8");
    signedOutPanelJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/signed-out-panel.js"), "utf-8");
    formErrorsJsContent = fs.readFileSync(path.join(process.cwd(), "web/public/lib/form-errors.js"), "utf-8");
  });

  async function setupRoutes(
    page,
    { clients = [], archivedClients = [], arnOnFile = false, listStatus = 200, createResponse = null } = {},
  ) {
    await page.route("**/practice.html*", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: practiceHtmlContent });
    });

    await page.route("**/api/v1/practice/clients", async (route) => {
      if (route.request().method() === "GET") {
        const body = listStatus === 200 ? { clients, arnOnFile } : { message: "This feature needs the practice bundle." };
        await route.fulfill({ status: listStatus, contentType: "application/json", body: JSON.stringify(body) });
        return;
      }
      if (route.request().method() === "POST") {
        const response = createResponse || { client: { ...CLIENT_A, clientId: "01NEWCLIENT00000000000000" } };
        await route.fulfill({
          status: response.status || 201,
          contentType: "application/json",
          body: JSON.stringify(response.body || response),
        });
        return;
      }
      await route.continue();
    });

    await page.route("**/api/v1/practice/clients?archived=true", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ clients: archivedClients }) });
    });
    await page.route("**/api/v1/practice/clients/*", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "Client archived" }) });
        return;
      }
      await route.continue();
    });

    // Catch-all for every other script (submit.js, developer-mode.js, request-cache.js,
    // entitlement-status.js, auth-status.js, view-source-link.js, analytics.js,
    // session-beacon.js, loading-spinner.js, env-loader.js): none of it is exercised by these
    // tests, which drive practice.js against a plain fetch fallback. Registered before the one
    // real widget below so that more specific route, registered after, takes precedence per
    // Playwright's last-registered-wins routing order.
    await page.route("**/*.js", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    });
    await page.route("**/lib/form-errors.js*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: formErrorsJsContent });
    });
    await page.route("**/widgets/page-chrome.js*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: pageChromeJsContent });
    });
    await page.route("**/widgets/status-messages.js*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: statusMessagesJsContent });
    });
    await page.route("**/widgets/signed-out-panel.js*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: signedOutPanelJsContent });
    });
    // practice.js itself is the page under test - never stubbed.
    await page.route("**/practice.js*", async (route) => {
      const content = fs.readFileSync(path.join(process.cwd(), "web/public/practice.js"), "utf-8");
      await route.fulfill({ status: 200, contentType: "application/javascript", body: content });
    });
  }

  async function loadPage(page, { loggedIn = true } = {}) {
    if (loggedIn) {
      await page.addInitScript(() => {
        window.localStorage.setItem("cognitoIdToken", "test-id-token");
        window.localStorage.setItem("userInfo", JSON.stringify({ sub: "practice-sub", email: "practice@example.com" }));
      });
    }
    await page.goto("http://localhost:3000/practice.html", { waitUntil: "domcontentloaded" });
    await delay(300);
  }

  test("renders each client's name, identifiers and authorisation state", async ({ page }) => {
    await setupRoutes(page, { clients: [CLIENT_A, CLIENT_B] });
    await loadPage(page);

    const rows = page.locator("#clientsTableBody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Example Trading Ltd");
    await expect(rows.nth(0)).toContainText("193054661");
    await expect(rows.nth(1)).toContainText("Jane Freelancer");
    await expect(rows.nth(1)).toContainText("Pending");

    await expect(page.locator("#clientsEmptyState")).toBeHidden();
  });

  test("shows the empty state when the practice has no clients", async ({ page }) => {
    await setupRoutes(page, { clients: [] });
    await loadPage(page);

    await expect(page.locator("#clientsEmptyState")).toBeVisible();
    await expect(page.locator("#clientsEmptyState")).toContainText("No clients yet");
    await expect(page.locator("#clientsTable")).toBeHidden();
  });

  test("renders the API's 403 message as plain text, not HTML", async ({ page }) => {
    await setupRoutes(page, { listStatus: 403 });
    await loadPage(page);

    const errorState = page.locator("#clientsErrorState");
    await expect(errorState).toBeVisible();
    await expect(errorState).toHaveText("This feature needs the practice bundle.");
    // Rendered as text content, not parsed as markup: no child elements.
    expect(await errorState.evaluate((el) => el.children.length)).toBe(0);
  });

  test("shows the unauthenticated hint when signed out", async ({ page }) => {
    await setupRoutes(page, { clients: [CLIENT_A] });
    await loadPage(page, { loggedIn: false });

    await expect(page.locator("#signedOutPanel")).toBeVisible();
    await expect(page.locator("#clientsTable")).toBeHidden();
  });

  test("the add-client form posts the entered fields and renders the new client", async ({ page }) => {
    await setupRoutes(page, {
      clients: [],
      createResponse: {
        status: 201,
        body: { client: { ...CLIENT_A, displayName: "New Co", clientId: "01NEWCLIENT00000000000000" } },
      },
    });
    await loadPage(page);

    await expect(page.locator("#clientsEmptyState")).toBeVisible();

    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/api/v1/practice/clients") && req.method() === "POST"),
      (async () => {
        await page.fill("#displayNameInput", "New Co");
        await page.fill("#vrnInput", "193054661");
        await page.click("#addClientBtn");
      })(),
    ]);

    const postedBody = JSON.parse(request.postData());
    expect(postedBody.displayName).toBe("New Co");
    expect(postedBody.vrn).toBe("193054661");

    await delay(200);
    const rows = page.locator("#clientsTableBody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("New Co");
  });

  test("marks the VAT registration number field when the API rejects it", async ({ page }) => {
    await setupRoutes(page, {
      clients: [],
      createResponse: {
        status: 400,
        body: { message: "Invalid request", errorMessages: ["Invalid VAT registration number format - must be 9 digits"] },
      },
    });
    await loadPage(page);

    await page.fill("#displayNameInput", "Bad Vrn Ltd");
    await page.fill("#vrnInput", "12345");
    await page.click("#addClientBtn");

    const summary = page.locator("#form-error-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("The VAT registration number must be 9 numbers");
    await expect(page.locator("#vrnInput")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#vrnInput-error")).toContainText("must be 9 numbers");
    await expect(page.locator("#addClientErrors")).toBeHidden();
  });

  test("shows an API failure that names no field above the button", async ({ page }) => {
    await setupRoutes(page, {
      clients: [],
      createResponse: { status: 400, body: { message: "Invalid request", errorMessages: ["Request body is required"] } },
    });
    await loadPage(page);

    await page.fill("#displayNameInput", "Some Ltd");
    await page.click("#addClientBtn");

    await expect(page.locator("#addClientErrors")).toContainText("Request body is required");
    await expect(page.locator("#form-error-summary")).toHaveCount(0);
  });

  test("an empty submit asks for the client name and sends nothing", async ({ page }) => {
    await setupRoutes(page, { clients: [] });
    let posted = false;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/v1/practice/clients")) posted = true;
    });
    await loadPage(page);

    await page.click("#addClientBtn");

    await expect(page.locator("#form-error-summary")).toContainText("Enter the client name");
    await expect(page.locator("#displayNameInput")).toHaveAttribute("aria-invalid", "true");
    expect(posted).toBe(false);
  });

  test("says when an agent reference number is on file", async ({ page }) => {
    await setupRoutes(page, { clients: [], arnOnFile: true });
    await loadPage(page);

    await expect(page.locator("#arnOnFile")).toBeVisible();
    await expect(page.locator("#arnOnFile")).toContainText("on file");
  });

  test("a new notification replaces the one before it", async ({ page }) => {
    await setupRoutes(page, { clients: [CLIENT_B] });
    await loadPage(page);
    await page.evaluate(() => window.showStatus("Agent reference number not set", "error"));
    await page.getByRole("button", { name: "Archive Jane Freelancer" }).click();
    await page.getByRole("button", { name: "Yes, archive" }).click();

    const messages = page.locator("#statusMessagesContainer .status-message");
    await expect(messages).toHaveCount(1);
    await expect(messages).toContainText("Client archived");
  });

  test("asks before archiving and archives only after the answer is yes", async ({ page }) => {
    await setupRoutes(page, { clients: [CLIENT_A, CLIENT_B] });
    let deleted = 0;
    page.on("request", (req) => {
      if (req.method() === "DELETE") deleted += 1;
    });
    await loadPage(page);

    await page.getByRole("button", { name: "Archive Example Trading Ltd" }).click();
    await expect(page.locator(".archive-confirm")).toContainText("Archive Example Trading Ltd?");

    await page.getByRole("button", { name: "Keep" }).click();
    await expect(page.locator(".archive-confirm")).toHaveCount(0);
    expect(deleted).toBe(0);
    await expect(page.locator("#clientsTableBody tr")).toHaveCount(2);

    await page.getByRole("button", { name: "Archive Example Trading Ltd" }).click();
    await page.getByRole("button", { name: "Yes, archive" }).click();
    await expect(page.locator("#clientsTableBody tr")).toHaveCount(1);
    expect(deleted).toBe(1);
  });

  test("lists archived clients on request", async ({ page }) => {
    await setupRoutes(page, { clients: [CLIENT_A], archivedClients: [{ ...CLIENT_B, archivedAt: "2026-02-01T00:00:00.000Z" }] });
    await loadPage(page);

    await expect(page.locator("#archivedClients")).toBeHidden();
    await page.click("#toggleArchivedBtn");
    await expect(page.locator("#archivedClientsList")).toContainText("Jane Freelancer");
    await page.click("#toggleArchivedBtn");
    await expect(page.locator("#archivedClients")).toBeHidden();
  });
});
