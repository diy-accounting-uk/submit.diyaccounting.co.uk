// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/hmrcAssist.browser.test.js
// The HMRC Assist check on the VAT return form, against the simulator's canned report content.

import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { vatMultipleMessages, vatFeedbackLists } from "@app/http-simulator/scenarios/assist.js";

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
async function openForm(page, { obligations = [obligation("O")], report, acknowledge, environmentName = "ci" } = {}) {
  const reportRequests = [];
  const acknowledgeRequests = [];
  const reportHeaders = [];

  await page.route("**/submit.environment-name.txt", async (route) => {
    if (environmentName === null) return route.abort();
    await route.fulfill({ status: 200, contentType: "text/plain", body: environmentName });
  });

  await page.route("**/submit.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        import "/lib/services/catalog-service.js";
        window.authorizedFetch = (url, options) => fetch(url, options);
        window.getGovClientHeaders = async () => ({});
      `,
    });
  });
  await page.route("**/hmrc-scope-check.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `window.hmrcScopeCheck = { isTokenSufficient: async () => true, clearHmrcToken: () => {}, storedGrantId: () => sessionStorage.getItem("hmrcGrantId"),
        grantHeaders: () => ({ "x-mcp-hmrc-grant": sessionStorage.getItem("hmrcGrantId") }), getOAuthScopeString: async () => "read:vat",
        getActivityById: async (id) => window.TOML.parse(await (await fetch("/submit.catalogue.toml")).text()).activities.find((activity) => activity.id === id) };`,
    });
  });
  await page.route("**/api/v1/hmrc/vat/obligation*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ obligations }) });
  });
  await page.route("**/api/v1/hmrc/vat/assist/report", async (route) => {
    const request = route.request().postDataJSON();
    reportRequests.push(request);
    reportHeaders.push(route.request().headers());
    const answer = report
      ? await report(request, reportRequests.length)
      : {
          status: 200,
          body: {
            reportId: `report-${reportRequests.length}`,
            correlationId: `correlation-${reportRequests.length}`,
            receiptId: `receipt-${reportRequests.length}`,
            messages: vatMultipleMessages(request.vrn),
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
    sessionStorage.setItem("hmrcGrantId", "00000000-0000-4000-8000-000000000001");
    localStorage.setItem("cognitoIdToken", "test-id-token");
  });
  await page.goto(`${baseUrl}/hmrc/vat/submitVat.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#vatNumber").fill(VRN);
  await expect(page.locator("#obligationStatus")).toBeAttached();
  return { reportRequests, acknowledgeRequests, reportHeaders };
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

function welshMessages() {
  return vatFeedbackLists("multiple").welshFeedback.map(({ itemNumber: _itemNumber, ...message }) => message);
}

function bilingualReport(request, count, { english = vatMultipleMessages(), welsh = welshMessages() } = {}) {
  return {
    status: 200,
    body: {
      reportId: `report-${count}`,
      correlationId: `correlation-${count}`,
      receiptId: `receipt-${count}`,
      messages: english,
      welshMessages: welsh,
      vrn: request.vrn,
      periodKey: request.periodKey,
    },
  };
}

function manyMessages(prefix) {
  return Array.from({ length: 7 }, (_unused, index) => ({ title: `${prefix} ${index + 1}`, body: `Body ${index + 1}`, links: [] }));
}

test.describe("HMRC Assist check on the VAT return, in English and Welsh", () => {
  test("shows the Welsh messages verbatim, in order, with their links and highlights, after the switch", async ({ page }) => {
    await openForm(page, { report: bilingualReport });
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();

    const english = page.locator("#hmrcAssistLanguage-en");
    const welsh = page.locator("#hmrcAssistLanguage-cy");
    await expect(english).toHaveText("English");
    await expect(welsh).toHaveText("Cymraeg");
    await expect(english).toHaveAttribute("aria-pressed", "true");
    await expect(welsh).toHaveAttribute("aria-pressed", "false");

    await welsh.focus();
    await page.keyboard.press("Enter");
    await expect(welsh).toHaveAttribute("aria-pressed", "true");
    await expect(english).toHaveAttribute("aria-pressed", "false");

    const expected = welshMessages();
    const items = page.locator("#hmrcAssistMessages > li");
    await expect(items).toHaveCount(expected.length);
    await expect(page.locator("#hmrcAssistMessages")).toHaveAttribute("lang", "cy");
    for (const [index, message] of expected.entries()) {
      const item = items.nth(index);
      await expect(item.locator(".hmrc-assist-message-title")).toHaveText(message.title);
      await expect(item.locator(".hmrc-assist-message-body")).toHaveText(message.body);
      await expect(item.locator(".hmrc-assist-message-action")).toHaveText(message.action);
      await expect(item.locator("a")).toHaveText(message.links[0].title);
      await expect(item.locator("a")).toHaveAttribute("href", message.links[0].url);
    }
    await expect(page.locator("#vatDueSales")).toHaveClass(/hmrc-assist-highlight/);
    await expect(page.locator("#totalValuePurchasesExVAT")).toHaveClass(/hmrc-assist-highlight/);

    await english.click();
    await expect(items.first().locator(".hmrc-assist-message-title")).toHaveText(vatMultipleMessages()[0].title);
  });

  test("shows at most five messages in each language", async ({ page }) => {
    await openForm(page, {
      report: (request, count) => bilingualReport(request, count, { english: manyMessages("English"), welsh: manyMessages("Cymraeg") }),
    });
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    const items = page.locator("#hmrcAssistMessages > li");
    await expect(items).toHaveCount(5);
    await expect(items.last().locator(".hmrc-assist-message-title")).toHaveText("English 5");
    await page.locator("#hmrcAssistLanguage-cy").click();
    await expect(items).toHaveCount(5);
    await expect(items.last().locator(".hmrc-assist-message-title")).toHaveText("Cymraeg 5");
  });

  test("sends one acknowledgement across switches, recording the language shown when it was sent", async ({ page }) => {
    const { acknowledgeRequests } = await openForm(page, { report: bilingualReport });
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect.poll(() => acknowledgeRequests.length).toBe(1);

    await page.locator("#hmrcAssistLanguage-cy").click();
    await page.locator("#hmrcAssistLanguage-en").click();
    await page.locator("#hmrcAssistLanguage-cy").click();
    await settle(page);
    expect(acknowledgeRequests).toHaveLength(1);
    expect(acknowledgeRequests[0].presentedLanguage).toBe("en");
  });

  test("remembers the chosen language for the session and records it in the acknowledgement", async ({ page }) => {
    const { acknowledgeRequests } = await openForm(page, { report: bilingualReport });
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await page.locator("#hmrcAssistLanguage-cy").click();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("hmrcAssistLanguage"))).toBe("cy");

    await page.locator("#vatDueSales").fill("101.00");
    await page.locator("#vatDueSales").blur();
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistLanguage-cy")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#hmrcAssistMessages > li .hmrc-assist-message-title").first()).toHaveText(welshMessages()[0].title);
    await expect.poll(() => acknowledgeRequests.length).toBe(2);
    expect(acknowledgeRequests[1].presentedLanguage).toBe("cy");
  });

  test("hides the switch when the report has no Welsh messages", async ({ page }) => {
    await openForm(page, { report: (request, count) => bilingualReport(request, count, { welsh: [] }) });
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li").first()).toBeVisible();
    await expect(page.locator("#hmrcAssistLanguageSwitch")).toHaveCount(0);
  });
});

test.describe("HMRC Assist check on the VAT return", () => {
  test("shows HMRC's messages verbatim and in order with their links, and highlights the named box", async ({ page }) => {
    await openForm(page);
    await fillBoxes(page);

    const control = page.locator("#hmrcAssistCheckBtn");
    await expect(control).toBeEnabled();
    await control.click();

    const expected = vatMultipleMessages(VRN);
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

    await expect(page.locator("#vatDueSales")).toHaveClass(/hmrc-assist-highlight/);
    await expect(page.locator("#totalValuePurchasesExVAT")).toHaveClass(/hmrc-assist-highlight/);
    await expect(page.locator("#vatDueAcquisitions")).not.toHaveClass(/hmrc-assist-highlight/);
    await expect(page.locator("#submitBtn")).toBeDisabled();
  });

  test("sends the report request with the chosen period and the nine boxes", async ({ page }) => {
    const { reportRequests, reportHeaders } = await openForm(page);
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages")).toBeVisible();

    expect(reportRequests).toHaveLength(1);
    expect(reportHeaders[0]["x-mcp-hmrc-grant"]).toBe("00000000-0000-4000-8000-000000000001");
    expect(reportHeaders[0].authorization).toBeUndefined();
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
    await page.setViewportSize({ width: 1280, height: 150 });
    const { acknowledgeRequests } = await openForm(page);
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(2);
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
      presentedDateTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      presentedLanguage: "en",
    });
  });

  test("retries the acknowledgement until HMRC answers 204 and keeps it going in the background", async ({ page }) => {
    const { acknowledgeRequests } = await openForm(page, {
      acknowledge: (_request, count) => ({ status: count < 2 ? 503 : 204 }),
    });
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(2);
    await scrollToLastMessage(page);

    await expect.poll(() => acknowledgeRequests.length, { timeout: 8000 }).toBe(2);
    await settle(page, 1500);
    expect(acknowledgeRequests).toHaveLength(2);
  });

  test("holds the submit button and shows the countdown from the moment the check is pressed", async ({ page }) => {
    await page.clock.install();
    await openForm(page);
    await fillBoxes(page);
    await expect(page.locator("#submitBtn")).toBeEnabled();
    await expect(page.locator("#hmrcAssistHold")).toBeHidden();

    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistHold")).toBeVisible();
    await expect(page.locator("#hmrcAssistHoldSeconds")).toHaveText("30s");
    await expect(page.locator("#hmrcAssistHoldBar")).toHaveAttribute("aria-valuemax", "30");
    await expect(page.locator("#hmrcAssistHoldBar")).toHaveAttribute("aria-valuenow", "30");
    await expect(page.locator("#hmrcAssistHoldStop")).toHaveAccessibleName("Stop waiting and enable submit");
    await expect(page.locator("#submitBtn")).toBeDisabled();
  });

  test("sits directly below the feedback list and keeps submit held after HMRC's messages arrive, until 0", async ({ page }) => {
    await page.clock.install();
    await openForm(page);
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(2);
    expect(await page.locator("#hmrcAssistFeedback + #hmrcAssistHold").count()).toBe(1);

    await page.clock.runFor(10000);
    await expect(page.locator("#hmrcAssistHoldSeconds")).toHaveText("20s");
    await expect(page.locator("#submitBtn")).toBeDisabled();
    await expect(page.locator("#hmrcAssistHoldBar")).toHaveAttribute("aria-valuenow", "20");

    await page.clock.runFor(19000);
    await expect(page.locator("#hmrcAssistHoldSeconds")).toHaveText("1s");
    await expect(page.locator("#submitBtn")).toBeDisabled();

    await page.clock.runFor(1000);
    await expect(page.locator("#hmrcAssistHold")).toBeHidden();
    await expect(page.locator("#submitBtn")).toBeEnabled();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(2);
  });

  test("announces the time left no more than every five seconds", async ({ page }) => {
    await page.clock.install();
    await openForm(page);
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    const announcement = page.locator("#hmrcAssistHoldAnnouncement");
    await expect(announcement).toHaveAttribute("aria-live", "polite");
    await expect(announcement).toHaveText("30 seconds left");
    await page.clock.runFor(3000);
    await expect(announcement).toHaveText("30 seconds left");
    await page.clock.runFor(2000);
    await expect(announcement).toHaveText("25 seconds left");
  });

  test("ends the hold at once when the stop button is pressed", async ({ page }) => {
    await page.clock.install();
    await openForm(page);
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(2);
    await page.clock.runFor(4000);
    await expect(page.locator("#submitBtn")).toBeDisabled();

    await page.locator("#hmrcAssistHoldStop").click();
    await expect(page.locator("#hmrcAssistHold")).toBeHidden();
    await expect(page.locator("#submitBtn")).toBeEnabled();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(2);
  });

  test("shows the stop label in Welsh when the Welsh switch is on", async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(() => sessionStorage.setItem("hmrcAssistLanguage", "cy"));
    await openForm(page);
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistHoldStop")).toHaveAccessibleName("Rhoi'r gorau i aros a galluogi cyflwyno");
    await expect(page.locator("#hmrcAssistHoldStop")).toHaveAttribute("lang", "cy");
  });

  test("shows unavailable at 0 when HMRC has not answered, and ignores a late answer", async ({ page }) => {
    await page.clock.install();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const { acknowledgeRequests } = await openForm(page, {
      report: async (request) => {
        await gate;
        return {
          status: 200,
          body: { reportId: "r", correlationId: "c", receiptId: "x", messages: vatMultipleMessages(request.vrn), vrn: request.vrn },
        };
      },
    });
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistStatus")).toContainText("Asking HMRC Assist");
    await expect(page.locator("#submitBtn")).toBeDisabled();

    await page.clock.runFor(30000);
    await expect(page.locator("#hmrcAssistHold")).toBeHidden();
    await expect(page.locator("#submitBtn")).toBeEnabled();
    await expect(page.locator("#hmrcAssistStatus")).toContainText("HMRC Assist feedback is unavailable");

    release();
    await settle(page, 300);
    await expect(page.locator("#hmrcAssistFeedback")).toBeHidden();
    await expect(page.locator("#hmrcAssistStatus")).toContainText("HMRC Assist feedback is unavailable");
    expect(acknowledgeRequests).toHaveLength(0);
  });

  test("clears the bar and restores submit when an edit clears the messages", async ({ page }) => {
    await page.clock.install();
    await openForm(page);
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(2);
    await expect(page.locator("#submitBtn")).toBeDisabled();

    await page.locator("#vatDueSales").fill("150.00");
    await expect(page.locator("#hmrcAssistFeedback")).toBeHidden();
    await expect(page.locator("#hmrcAssistHold")).toBeHidden();
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
      await expect(page.locator("#hmrcAssistHold")).toBeHidden();
      await expect(page.locator("#submitBtn")).toBeEnabled();
      await expect(page.locator("#hmrcAssistCheckBtn")).toBeEnabled();
      await expect(page.locator("#vatDueSales")).toHaveValue(BOXES.vatDueSales);
    });
  }

  test("clears the list on an edit, re-enables the control and gives the next report its own acknowledgement", async ({ page }) => {
    const { acknowledgeRequests } = await openForm(page);
    await fillBoxes(page);
    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(2);
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeDisabled();
    await scrollToLastMessage(page);
    await expect.poll(() => acknowledgeRequests.length).toBe(1);

    await page.locator("#vatDueSales").fill("150.00");

    await expect(page.locator("#hmrcAssistFeedback")).toBeHidden();
    await expect(page.locator("#vatDueSales")).not.toHaveClass(/hmrc-assist-highlight/);
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeEnabled();

    await page.locator("#hmrcAssistCheckBtn").click();
    await expect(page.locator("#hmrcAssistMessages > li")).toHaveCount(2);
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

  for (const [label, environmentName] of [
    ["the environment is prod", "prod"],
    ["the environment name cannot be read", null],
  ]) {
    test(`shows no control and makes no assist request when ${label}`, async ({ page }) => {
      const { reportRequests, acknowledgeRequests } = await openForm(page, { environmentName });
      await fillBoxes(page);
      await settle(page);

      await expect(page.locator("#hmrcAssistCheckBtn")).toHaveCount(0);
      await expect(page.locator("#hmrcAssistCheck")).toBeEmpty();
      await expect(page.locator("#hmrcAssistStatusNote")).toBeHidden();
      expect(reportRequests).toHaveLength(0);
      expect(acknowledgeRequests).toHaveLength(0);
    });
  }

  test("shows no control and no note on prod when preview features are on for the session", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("previewFeatures", "on"));
    const { reportRequests } = await openForm(page, { environmentName: "prod" });
    await fillBoxes(page);
    await settle(page);

    await expect(page.locator("#hmrcAssistCheckBtn")).toHaveCount(0);
    await expect(page.locator("#hmrcAssistStatusNote")).toBeHidden();
    await expect(page.locator("p.hint[data-feature-status]").first()).toContainText("Returns you submit here reach HMRC.");
    expect(reportRequests).toHaveLength(0);
  });

  test("shows the control and the note on ci with preview features off", async ({ page }) => {
    await openForm(page, { environmentName: "ci" });
    await fillBoxes(page);
    await settle(page);

    await expect(page.locator("#hmrcAssistCheckBtn")).toBeVisible();
    await expect(page.locator("#hmrcAssistStatusNote")).toBeVisible();
  });

  test("keeps the preview note in the sandbox status line when the control is mounted", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("hmrcAccount", "synthetic"));
    await page.route("**/api/v1/bundle", async (route) => {
      const bundles = [{ bundleId: "day-guest", qualifiers: { synthetic: true } }];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles }) });
    });
    await openForm(page);
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeVisible();
    await expect(page.locator("p.hint[data-feature-status]").first()).toContainText("Status: sandbox.");
    await expect(page.locator("#hmrcAssistStatusNote")).toBeVisible();
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
