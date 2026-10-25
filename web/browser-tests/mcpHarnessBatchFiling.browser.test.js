// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/mcpHarnessBatchFiling.browser.test.js
// The chat harness files accounts for two clients through one codes link: the link opens the codes
// page in the harness iframe, the page asks for one code per client, and run_for_clients names the
// one entry for both clients.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_DIR = path.join(process.cwd(), "web/public");
const readPublic = (relativePath) => fs.readFileSync(path.join(PUBLIC_DIR, relativePath), "utf-8");

// MCP_HARNESS_BASE_URL names a running local server (npm run start:simulator prints its port);
// with it set, the second test drives that server with no stubbed endpoint.
const LIVE_BASE_URL = process.env.MCP_HARNESS_BASE_URL?.replace(/\/+$/, "");
const ORIGIN = "http://localhost:3000";
const ENTRY_ID = "11111111-2222-4333-8444-555555555555";
const CLIENTS = [
  { clientId: "client-a", displayName: "Alpha Ltd" },
  { clientId: "client-b", displayName: "Beta Ltd" },
];

// The codes the test types come from the environment, as the behaviour tests read the test
// service's code; the default is the simulator's.
const COMPANY_CODE = process.env.TEST_COMPANIES_HOUSE_AUTH_CODE || "Sim0123";

function toolAnswer(tool, args) {
  if (tool === "add_client") return { client: { clientId: `client-${args.displayName[0].toLowerCase()}`, displayName: args.displayName } };
  if (tool === "list_clients") return { clients: CLIENTS };
  if (tool === "request_companies_house_codes") {
    return { entryId: ENTRY_ID, url: `${ORIGIN}/companies-house/mcpCodes.html?entry=${ENTRY_ID}`, expiresAt: "2099-01-01T00:00:00Z" };
  }
  if (tool === "run_for_clients") {
    const rows = CLIENTS.map((client) => ({ ...client, ok: true, result: { submissionNumber: `S-${client.clientId}` } }));
    return { tool: args.tool, rows, summary: { total: 2, ok: 2, failed: 0 } };
  }
  return {};
}

async function setupRoutes(page) {
  const calls = [];
  const puts = [];
  await page.route("**/*.js", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  });
  for (const file of ["mcp-harness.page.js", "companies-house/mcpCodes.page.js"]) {
    await page.route(`**/${file}*`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: readPublic(file) });
    });
  }
  for (const file of ["mcp-harness.html", "companies-house/mcpCodes.html"]) {
    await page.route(`**/${file}*`, async (route) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: readPublic(file) });
    });
  }
  await page.route("**/mcp-harness/file-accounts-for-clients.json*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: readPublic("mcp-harness/file-accounts-for-clients.json") });
  });
  await page.route("**/submit.css", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/css", body: readPublic("submit.css") });
  });
  await page.route("**/api/v1/dev/mcp-harness/tools", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tools: [] }) });
  });
  await page.route("**/api/v1/dev/mcp-harness/call", async (route) => {
    const call = route.request().postDataJSON();
    calls.push(call);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, result: toolAnswer(call.tool, call.arguments) }),
    });
  });
  await page.route("**/api/v1/mcp/codes-entries/*", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      puts.push(request.postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "filled" }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ state: "pending", kind: "accounts", directors: [], clients: CLIENTS }),
    });
  });
  return { calls, puts };
}

test("the harness files accounts for two clients through one codes link", async ({ page }) => {
  test.skip(Boolean(LIVE_BASE_URL), "the live-server test covers this journey");
  const { calls, puts } = await setupRoutes(page);
  await page.goto(`${ORIGIN}/mcp-harness.html?script=file-accounts-for-clients`, { waitUntil: "domcontentloaded" });

  // The turns up to and including the codes request.
  for (let turn = 0; turn < 6; turn += 1) await page.locator("#nextTurn").click();

  const codesFrame = page.frameLocator("#browserStep");
  await expect(page.locator("#browserStatus")).toContainText(`mcpCodes.html?entry=${ENTRY_ID}`);
  await expect(codesFrame.locator("#clientCodeFields label")).toHaveText([
    "Company authentication code for Alpha Ltd",
    "Company authentication code for Beta Ltd",
  ]);
  const codesRequest = calls.find((call) => call.tool === "request_companies_house_codes");
  expect(codesRequest.arguments).toEqual({ kind: "accounts", clientIds: ["client-a", "client-b"] });

  await codesFrame.locator("#clientCode0").fill(COMPANY_CODE);
  await codesFrame.locator("#clientCode1").fill(COMPANY_CODE);
  await codesFrame.locator("#saveCodesBtn").click();
  await expect(codesFrame.locator("#codesDoneView")).toBeVisible();
  expect(puts).toEqual([
    {
      clients: [
        { clientId: "client-a", companyAuthCode: COMPANY_CODE },
        { clientId: "client-b", companyAuthCode: COMPANY_CODE },
      ],
    },
  ]);
  await page.screenshot({ path: "target/mcp-harness-screenshots/batch-codes.png" });

  await page.locator("#nextTurn").click();
  await page.locator("#nextTurn").click();
  const filingCard = page.locator('.harness-turn[data-turn-id="filing"]');
  await expect(filingCard).toHaveAttribute("data-outcome", "ok");
  const filing = calls.find((call) => call.tool === "run_for_clients");
  expect(filing.arguments.tool).toBe("submit_micro_entity_accounts_sandbox");
  expect(filing.arguments.args.codesEntryId).toBe(ENTRY_ID);
  await expect(filingCard).toContainText("Alpha Ltd");
  await expect(filingCard).toContainText("Beta Ltd");
  expect(JSON.parse(await filingCard.locator("pre").textContent()).rows).toHaveLength(2);
  await page.screenshot({ path: "target/mcp-harness-screenshots/batch-result.png" });
});

test("the harness files accounts for two clients through one codes link on the local server", async ({ page }) => {
  test.skip(!LIVE_BASE_URL, "set MCP_HARNESS_BASE_URL to a running local server");
  test.setTimeout(120000);
  await page.goto(`${LIVE_BASE_URL}/mcp-harness.html?script=file-accounts-for-clients`, { waitUntil: "domcontentloaded" });

  for (let turn = 0; turn < 6; turn += 1) await page.locator("#nextTurn").click();
  for (const turnId of ["alpha", "beta", "clients", "codes"]) {
    await expect(page.locator(`.harness-turn[data-turn-id="${turnId}"]`)).toHaveAttribute("data-outcome", "ok", { timeout: 30000 });
  }

  const codesFrame = page.frameLocator("#browserStep");
  await expect(page.locator("#browserStatus")).toContainText("mcpCodes.html?entry=");
  await expect(codesFrame.locator("#clientCodeFields label")).toHaveCount(2);
  const labels = await codesFrame.locator("#clientCodeFields label").allTextContents();
  await codesFrame.locator("#clientCode0").fill(COMPANY_CODE);
  await codesFrame.locator("#clientCode1").fill(COMPANY_CODE);
  await codesFrame.locator("#saveCodesBtn").click();
  await expect(codesFrame.locator("#codesDoneView")).toBeVisible();
  await page.screenshot({ path: "target/mcp-harness-screenshots/batch-codes-live.png" });

  await page.locator("#nextTurn").click();
  await page.locator("#nextTurn").click();
  const filingCard = page.locator('.harness-turn[data-turn-id="filing"]');
  await expect(filingCard).toHaveAttribute("data-outcome", /.+/, { timeout: 60000 });
  const filing = JSON.parse(await filingCard.locator("pre").textContent());
  await page.screenshot({ path: "target/mcp-harness-screenshots/batch-result-live.png" });

  // One row per client, each from the one codes entry. No route yet grants a client the
  // Companies House accounts filing authorisation the filing checks for, so every row is refused
  // with "Client is not authorised for Companies House filing". When that grant exists these rows
  // turn ok and this assertion changes.
  expect(filing.rows).toHaveLength(2);
  expect(filing.rows.map((row) => row.displayName).sort()).toEqual(["Alpha Ltd", "Beta Ltd"]);
  expect(labels).toEqual(["Company authentication code for Alpha Ltd", "Company authentication code for Beta Ltd"]);
  for (const row of filing.rows) {
    expect(row.ok).toBe(false);
    expect(row.error).toBe("Client is not authorised for Companies House filing");
  }
});
