// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/hmrcAssist.browser.test.js
// The HMRC Assist check on the VAT return form, against the simulator's canned report content.

import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { vatDefaultMessages } from "@app/http-simulator/scenarios/assist.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VRN = "193054661";
const BOXES = {
  vatDueSales: "100.00",
  vatDueAcquisitions: "0",
  vatReclaimedCurrPeriod: "20.00",
  totalValueSalesExVAT: "1000",
  totalValuePurchasesExVAT: "500",
  totalValueGoodsSuppliedExVAT: "0",
  totalAcquisitionsExVAT: "0",
};

let serverProcess;
let baseUrl;

test.beforeAll(async () => {
  const port = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/static-server.mjs", "web/public"], {
      cwd: path.resolve(process.cwd()),
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProcess = child;
    child.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/LISTENING_ON:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.stderr.on("data", (chunk) => console.error(`[static-server] ${chunk}`));
    child.on("error", reject);
  });
  baseUrl = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  serverProcess?.kill();
});

function isoDaysFromToday(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

let obligationCount = 0;

function obligation(status) {
  obligationCount += 1;
  return {
    periodKey: `K${status}${obligationCount}`,
    start: isoDaysFromToday(-120),
    end: isoDaysFromToday(-30),
    due: isoDaysFromToday(20),
    status,
  };
}

/**
 * Serve the VAT form with HMRC Assist mocked the way the simulator answers it.
 * @param {import("@playwright/test").Page} page
 * @param {{obligations?: object[], report?: (request: object, count: number) => {status: number, body?: object}|Promise<object>, acknowledge?: (request: object, count: number) => {status: number}}} behaviour
 */
async function openForm(page, { obligations = [obligation("O")], report, acknowledge } = {}) {
  const reportRequests = [];
  const acknowledgeRequests = [];

  await page.route("**/submit.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.authorizedFetch = (url, options) => fetch(url, options);
        window.getGovClientHeaders = async () => ({});
      `,
    });
  });
  await page.route("**/hmrc-scope-check.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `window.hmrcScopeCheck = { isTokenSufficient: async () => true, clearHmrcToken: () => {}, getOAuthScopeString: async () => "read:vat" };`,
    });
  });
  await page.route("**/api/v1/hmrc/vat/obligation*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ obligations }) });
  });
  await page.route("**/api/v1/hmrc/vat/assist/report", async (route) => {
    const request = route.request().postDataJSON();
    reportRequests.push(request);
    const answer = report
      ? await report(request, reportRequests.length)
      : {
          status: 200,
          body: {
            reportId: `report-${reportRequests.length}`,
            correlationId: `correlation-${reportRequests.length}`,
            receiptId: `receipt-${reportRequests.length}`,
            messages: vatDefaultMessages(request.vrn),
            vrn: request.vrn,
            periodKey: request.periodKey,
          },
        };
    if (answer.abort) return route.abort();
    await route.fulfill({
      status: answer.status,
      contentType: "application/json",
      body: answer.body === undefined ? undefined : JSON.stringify(answer.body),
    });
  });
  await page.route("**/api/v1/hmrc/vat/assist/acknowledge", async (route) => {
    const request = route.request().postDataJSON();
    acknowledgeRequests.push(request);
    const answer = acknowledge ? acknowledge(request, acknowledgeRequests.length) : { status: 204 };
    await route.fulfill({ status: answer.status, contentType: "application/json", body: answer.status === 204 ? undefined : "{}" });
  });

  await page.addInitScript(() => {
    sessionStorage.setItem("hmrcAccessToken", "test-access-token");
  });
  await page.goto(`${baseUrl}/hmrc/vat/submitVat.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#vatNumber").fill(VRN);
  await expect(page.locator("#obligationStatus")).toBeAttached();
  return { reportRequests, acknowledgeRequests };
}

// A negative assertion has no event to wait for: give a stray request time to arrive.
function settle(page, milliseconds = 500) {
  return page.evaluate((ms) => new Promise((resolve) => setTimeout(resolve, ms)), milliseconds);
}

async function fillBoxes(page) {
  for (const [id, value] of Object.entries(BOXES)) {
    await page.locator(`#${id}`).fill(value);
    await page.locator(`#${id}`).blur();
  }
}

// The acknowledgement waits for the last message to be in view, so a test that expects it scrolls there.
async function scrollToLastMessage(page) {
  await page.locator("#hmrcAssistMessages > li").last().scrollIntoViewIfNeeded();
}

test.describe("HMRC Assist check on the VAT return", () => {
  test("shows HMRC's messages verbatim and in order with their links, and highlights the named box", async ({ page }) => {
    await openForm(page);
    await fillBoxes(page);

    const control = page.locator("#hmrcAssistCheckBtn");
    await expect(control).toBeEnabled();
    await control.click();

    const expected = vatDefaultMessages(VRN);
    await expect(page.locator("#hmrcAssistFeedback h3")).toHaveText("HMRC feedback");
    const items = page.locator("#hmrcAssistMessages > li");
    await expect(items).toHaveCount(expected.length);

    for (const [index, message] of expected.entries()) {
      const item = items.nth(index);
      await expect(item.locator(".hmrc-assist-message-title")).toHaveText(message.title);
      await expect(item.locator(".hmrc-assist-message-body")).toHaveText(message.body);
      await expect(item.locator(".hmrc-assist-message-action")).toHaveText(message.action);
      for (const link of message.links) {
        const anchor = item.locator("a");
        await expect(anchor).toHaveText(link.title);
        await expect(anchor).toHaveAttribute("href", link.url);
      }
    }

    await expect(page.locator("#vatReclaimedCurrPeriod")).toHaveClass(/hmrc-assist-highlight/);
    await expect(page.locator("#vatDueSales")).toHaveClass(/hmrc-assist-highlight/);
    await expect(page.locator("#totalValueSalesExVAT")).toHaveClass(/hmrc-assist-highlight/);
    await expect(page.locator("#vatDueAcquisitions")).not.toHaveClass(/hmrc-assist-highlight/);
    await expect(page.locator("#submitBtn")).toBeEnabled();
  });

  test("sends the report request with the chosen period and the nine boxes", async ({ page }) => {
    const { reportRequests } = await openForm(page);
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages")).toBeVisible();

    expect(reportRequests).toHaveLength(1);
    const [request] = reportRequests;
    expect(request.vrn).toBe(VRN);
    expect(request.periodKey).toBeTruthy();
    expect(request.vatDueSales).toBe(100);
    expect(request.totalVatDue).toBe(100);
    expect(request.netVatDue).toBe(80);
    expect(request.totalValueSalesExVAT).toBe(1000);
    expect(request).not.toHaveProperty("finalised");
  });

  test("acknowledges the report once, with the receipt id, after the messages are displayed", async ({ page }) => {
    const { acknowledgeRequests } = await openForm(page);
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(3);
    await expect(page.locator("#hmrcAssistFeedback")).toBeVisible();
    expect(acknowledgeRequests).toHaveLength(0);
    await scrollToLastMessage(page);

    await expect.poll(() => acknowledgeRequests.length).toBe(1);
    await settle(page);
    expect(acknowledgeRequests).toHaveLength(1);
    expect(acknowledgeRequests[0]).toEqual({
      vrn: VRN,
      reportId: "report-1",
      correlationId: "correlation-1",
      receiptId: "receipt-1",
    });
  });

  test("retries the acknowledgement until HMRC answers 204 and never blocks the submit button", async ({ page }) => {
    const { acknowledgeRequests } = await openForm(page, {
      acknowledge: (_request, count) => ({ status: count < 2 ? 503 : 204 }),
    });
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(3);
    await expect(page.locator("#submitBtn")).toBeEnabled();
    await scrollToLastMessage(page);

    await expect.poll(() => acknowledgeRequests.length, { timeout: 8000 }).toBe(2);
    await settle(page, 1500);
    expect(acknowledgeRequests).toHaveLength(2);
  });

  test("holds the submit button only while the request is in flight", async ({ page }) => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await openForm(page, {
      report: async (request) => {
        await gate;
        return {
          status: 200,
          body: { reportId: "r", correlationId: "c", receiptId: "x", messages: vatDefaultMessages(request.vrn), vrn: request.vrn },
        };
      },
    });
    await fillBoxes(page);
    await expect(page.locator("#submitBtn")).toBeEnabled();

    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistStatus")).toContainText("Asking HMRC Assist");
    await expect(page.locator("#submitBtn")).toBeDisabled();

    release();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(3);
    await expect(page.locator("#submitBtn")).toBeEnabled();
  });

  test("says HMRC Assist has no feedback when HMRC answers 204, and sends no acknowledgement", async ({ page }) => {
    const { acknowledgeRequests } = await openForm(page, { report: () => ({ status: 204 }) });
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();

    await expect(page.locator("#hmrcAssistStatus")).toHaveText("HMRC Assist has no feedback on this return");
    await expect(page.locator("#hmrcAssistFeedback")).toBeHidden();
    await expect(page.locator("#submitBtn")).toBeEnabled();
    await settle(page, 300);
    expect(acknowledgeRequests).toHaveLength(0);
  });

  for (const [name, answer] of [
    ["a 403", { status: 403, body: { message: "forbidden" } }],
    ["a 500", { status: 500, body: { message: "failed" } }],
    ["a network failure", { abort: true }],
  ]) {
    test(`shows one line and leaves the form as it was after ${name}`, async ({ page }) => {
      await openForm(page, { report: () => answer });
      await fillBoxes(page);
      await page.locator("#hmrcAssistCheckBtn").click();

      await expect(page.locator("#hmrcAssistStatus")).toContainText("HMRC Assist feedback is unavailable");
      await expect(page.locator("#hmrcAssistFeedback")).toBeHidden();
      await expect(page.locator("#submitBtn")).toBeEnabled();
      await expect(page.locator("#hmrcAssistCheckBtn")).toBeEnabled();
      await expect(page.locator("#vatDueSales")).toHaveValue(BOXES.vatDueSales);
    });
  }

  test("clears the list on an edit, re-enables the control and gives the next report its own acknowledgement", async ({ page }) => {
    const { acknowledgeRequests } = await openForm(page);
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(3);
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeDisabled();
    await scrollToLastMessage(page);
    await expect.poll(() => acknowledgeRequests.length).toBe(1);

    await page.locator("#vatDueSales").fill("150.00");

    await expect(page.locator("#hmrcAssistFeedback")).toBeHidden();
    await expect(page.locator("#vatDueSales")).not.toHaveClass(/hmrc-assist-highlight/);
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeEnabled();

    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(3);
    await scrollToLastMessage(page);
    await expect.poll(() => acknowledgeRequests.length).toBe(2);
    expect(acknowledgeRequests.map((request) => request.receiptId)).toEqual(["receipt-1", "receipt-2"]);
  });

  test("keeps the control disabled until the nine boxes validate", async ({ page }) => {
    await openForm(page);
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeDisabled();
    await expect(page.locator("#vatDueSales-error")).toHaveCount(0);

    await fillBoxes(page);
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeEnabled();

    await page.locator("#totalValueSalesExVAT").fill("not a number");
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeDisabled();
  });

  test("shows no control when the obligation is fulfilled", async ({ page }) => {
    await openForm(page, { obligations: [obligation("F")] });
    await fillBoxes(page);
    await expect(page.locator("#obligationStatus")).toContainText("no open VAT periods");
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeHidden();
    await expect(page.locator("#submitBtn")).toBeEnabled();
  });

  test("shows no control for another period", async ({ page }) => {
    await openForm(page);
    await fillBoxes(page);
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeVisible();

    await page.locator("#obligationChoice").selectOption("another");
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeHidden();
    await expect(page.locator("#submitBtn")).toBeEnabled();
  });
});
