// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/mcpHarness.browser.test.js
// The MCP chat harness page plays its first two turns, makes the tool call and follows a returned link.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { readSubmitCss } from "./submitCss.js";

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const readPublic = (relativePath) => fs.readFileSync(path.join(PUBLIC_DIR, relativePath), "utf-8");

const OBLIGATIONS = { obligations: [{ start: "2017-01-01", end: "2017-03-31", status: "O", periodKey: "#001" }] };

async function setupRoutes(page, toolAnswer, { callStatus = 200, failTool } = {}) {
  const calls = [];
  await page.route("**/*.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });
  await page.route("**/submit.css", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/css", body: readSubmitCss() });
  });
  await page.route("**/mcp-harness.page.js*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: readPublic("mcp-harness.page.js") });
  });
  await page.route("**/mcp-harness.html*", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: readPublic("mcp-harness.html") });
  });
  await page.route("**/mcp-harness/list-vat-obligations.json*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: readPublic("mcp-harness/list-vat-obligations.json") });
  });
  await page.route("**/api/v1/dev/mcp-harness/tools", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ tools: [{ name: "list_vat_obligations" }] }),
    });
  });
  await page.route("**/api/v1/dev/mcp-harness/call", async (route) => {
    calls.push(route.request().postDataJSON());
    if (callStatus !== 200) return route.fulfill({ status: callStatus, contentType: "text/html", body: "Not found" });
    if (route.request().postDataJSON().tool === failTool) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, result: "Missing registeredOffice" }),
      });
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, result: toolAnswer }) });
  });
  await page.route("**/browser-step.html", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body><h1>Sign in to continue</h1></body></html>" });
  });
  return calls;
}

test.describe("MCP chat harness", () => {
  test("loads the widgets that show the signed-in state in the header", async ({ page }) => {
    const requested = [];
    page.on("request", (request) => requested.push(new URL(request.url()).pathname));
    await setupRoutes(page, OBLIGATIONS);
    await page.goto("http://localhost:3000/mcp-harness.html", { waitUntil: "domcontentloaded" });

    await expect(page.locator("#toolList")).toContainText("list_vat_obligations");
    for (const widget of ["auth-status.js", "entitlement-status.js", "status-messages.js"]) {
      expect(requested).toContain(`/widgets/${widget}`);
    }
  });

  test("sits in the site's centred column at 1280, with the buttons under the script choice before the first turn", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setupRoutes(page, OBLIGATIONS);
    await page.goto("http://localhost:3000/mcp-harness.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#toolList")).toContainText("list_vat_obligations");

    const main = await page.locator("main").boundingBox();
    expect(main.width).toBeLessThan(900);
    expect(Math.abs(main.x - (1280 - main.x - main.width))).toBeLessThan(24);

    const choice = await page.locator("#scriptChoice").boundingBox();
    const nextTurn = await page.locator("#nextTurn").boundingBox();
    expect(nextTurn.y - (choice.y + choice.height)).toBeLessThan(120);
  });

  test("stops the script at a 404 and says the endpoint is local only", async ({ page }) => {
    await setupRoutes(page, OBLIGATIONS, { callStatus: 404 });
    await page.goto("http://localhost:3000/mcp-harness.html", { waitUntil: "domcontentloaded" });

    await page.locator("#playAll").click();

    const toolCard = page.locator('.harness-turn[data-role="tool"]').first();
    await expect(toolCard).toHaveAttribute("data-outcome", "error");
    await expect(toolCard).toContainText("local only");
    await expect(page.locator(".harness-turn")).toHaveCount(3);
    await expect(page.locator("#nextTurn")).toBeDisabled();
    await expect(page.locator("#playAll")).toBeEnabled();
  });

  test("stops the script at a tool call that answers ok false, and says so", async ({ page }) => {
    const calls = await setupRoutes(page, OBLIGATIONS, { failTool: "request_hmrc_authorisation" });
    await page.goto("http://localhost:3000/mcp-harness.html", { waitUntil: "domcontentloaded" });

    await page.locator("#playAll").click();

    const toolCard = page.locator('.harness-turn[data-role="tool"]').first();
    await expect(toolCard).toHaveAttribute("data-outcome", "error");
    await expect(toolCard).toContainText("Missing registeredOffice");
    await expect(toolCard.locator(".harness-stopped")).toHaveText(
      "This call failed, so the script stops here: the turns after it depend on its answer.",
    );
    await expect(page.locator(".harness-turn")).toHaveCount(3);
    await expect(page.locator("#nextTurn")).toBeDisabled();
    expect(calls.map((call) => call.tool)).toEqual(["request_hmrc_authorisation"]);
  });

  test("offers the scripts in a chooser and a copy button for each configuration", async ({ page }) => {
    await setupRoutes(page, OBLIGATIONS);
    await page.goto("http://localhost:3000/mcp-harness.html", { waitUntil: "domcontentloaded" });

    await expect(page.locator("#scriptChoice")).toHaveValue("list-vat-obligations");
    await expect(page.locator("#scriptChoice option")).toHaveCount(3);
    await expect(page.locator(".harness-copy")).toHaveCount(3);
    await expect(page.locator("#configHosted")).toHaveCSS("overflow-x", "auto");
  });

  test("shows the configuration panel with the connector URL", async ({ page }) => {
    await setupRoutes(page, OBLIGATIONS);
    await page.goto("http://localhost:3000/mcp-harness.html", { waitUntil: "domcontentloaded" });

    await expect(page.locator("#configHosted")).toHaveText("claude mcp add --transport http diya-submit http://localhost:3000/mcp");
    await expect(page.locator("#configConnector")).toHaveText("http://localhost:3000/mcp");
    await expect(page.locator("#toolList")).toContainText("list_vat_obligations");
  });

  test("plays the question, the HMRC authorisation and the tool call, leaving the browser step idle when no tool hands back a link", async ({
    page,
  }) => {
    const calls = await setupRoutes(page, OBLIGATIONS);
    await page.goto("http://localhost:3000/mcp-harness.html", { waitUntil: "domcontentloaded" });

    await page.locator("#nextTurn").click();
    await expect(page.locator('.harness-turn[data-role="user"]')).toHaveText("Which VAT returns are due for 111222333?");
    for (let turn = 0; turn < 4; turn += 1) {
      await page.locator("#nextTurn").click();
      await expect(page.locator(".harness-turn")).toHaveCount(turn + 2);
    }

    const toolCard = page.locator('.harness-turn[data-role="tool"]').last();
    await expect(toolCard).toHaveAttribute("data-outcome", "ok");
    await expect(toolCard).toContainText('"periodKey": "#001"');
    expect(calls).toHaveLength(2);
    expect(calls[0].tool).toBe("request_hmrc_authorisation");
    expect(calls[1].tool).toBe("list_vat_obligations");
    expect(calls[1].arguments.vrn).toBe("111222333");
    expect(calls[1].arguments.hmrcAccessToken).toBeUndefined();
    await expect(page.locator("#browserStep")).toBeHidden();
  });

  test("follows a link a tool hands back in the iframe", async ({ page }) => {
    await setupRoutes(page, { authorizationUrl: "http://localhost:3000/browser-step.html" });
    await page.goto("http://localhost:3000/mcp-harness.html", { waitUntil: "domcontentloaded" });

    await page.locator("#playAll").click();

    await expect(page.locator("#browserStep")).toBeVisible();
    await expect(page.locator("#browserStatus")).toContainText("browser-step.html");
    await expect(page.frameLocator("#browserStep").locator("h1")).toHaveText("Sign in to continue");
    await expect(page.locator('.harness-turn[data-role="assistant"]')).toHaveCount(3);
  });

  test("wraps a long browser step link inside its panel", async ({ page }) => {
    const longQuery = `state=${"a1b2c3d4".repeat(40)}&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Factivities%2FsubmitVatCallback.html`;
    await setupRoutes(page, { authorizationUrl: `http://localhost:3000/browser-step.html?${longQuery}` });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("http://localhost:3000/mcp-harness.html", { waitUntil: "domcontentloaded" });

    await page.locator("#playAll").click();

    const status = page.locator("#browserStatus");
    await expect(status).toContainText("redirect_uri=");
    const fits = await status.evaluate((element) => {
      const panel = element.closest(".harness-panel").getBoundingClientRect();
      const text = element.getBoundingClientRect();
      return element.scrollWidth <= element.clientWidth && text.right <= panel.right;
    });
    expect(fits).toBe(true);
  });
});
