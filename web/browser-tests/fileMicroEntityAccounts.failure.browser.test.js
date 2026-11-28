// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/fileMicroEntityAccounts.failure.browser.test.js
// A filing of the micro-entity accounts that fails says what happened under the status message: what
// reached Companies House, that the answers are still in the form, and the kind of failure with its
// next step. The filing request is answered here by a stub of the page's own filing call.

import path from "path";
import { test, expect } from "@playwright/test";
import { serveRealSite, declineConsent, SITE_ORIGIN } from "./serveRealSite.js";

const SCREENSHOT_DIR = path.join(process.cwd(), "target/screenshots/accounts-failure");

async function openPage(page, { welsh = false } = {}) {
  await serveRealSite(page, { signedIn: true });
  const pagePath = welsh ? "cy/companies-house/fileMicroEntityAccounts.html" : "companies-house/fileMicroEntityAccounts.html";
  await page.goto(`${SITE_ORIGIN}/${pagePath}`, { waitUntil: "networkidle" });
  await declineConsent(page);
}

// Files with a stub that refuses as the filing service's client would: an Error with the answer's
// status, its reason and its body.
async function fileRefusedWith(page, { status, reason, body, message }) {
  await page.evaluate(
    ({ status, reason, body, message }) => {
      document.getElementById("companyAuthCode").value = "ABC123";
      window.buildAccountsPayload = () => ({});
      window.submitMicroEntityAccounts = () => Promise.reject(Object.assign(new Error(message), { status, reason, body }));
      // eslint-disable-next-line no-undef -- the page's own filing step
      handleSubmitFiling();
    },
    { status, reason, body, message },
  );
}

test("an error Companies House answered shows the panel with its error and that nothing was filed", async ({ page }) => {
  await openPage(page);
  await fileRefusedWith(page, {
    status: 502,
    body: { errors: [{ number: "9999", text: "The period end date is after the made up date" }] },
    message: "Companies House rejected the submission",
  });
  const panel = page.locator("#failureDetail");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-kind", "business-error");
  await expect(panel.locator("[data-part='sent']")).toHaveText("Companies House did not take the accounts, and nothing was filed.");
  await expect(panel.locator("[data-part='answers']")).toHaveText("Your answers are still in this form.");
  await expect(panel.locator("[data-part='errors']")).toContainText("The period end date is after the made up date");
  await expect(page.locator("#statusMessagesContainer")).toContainText("Companies House rejected the submission");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `micro-business-error-${width}.png`), fullPage: false });
  }
});

test("a refused presenter account says Companies House refused Submit's own credentials", async ({ page }) => {
  await openPage(page);
  await fileRefusedWith(page, {
    status: 502,
    body: { errors: [{ number: "502", text: "Authentication failure" }] },
    message: "Companies House refused the presenter",
  });
  const panel = page.locator("#failureDetail");
  await expect(panel).toHaveAttribute("data-kind", "submit-credentials");
  await expect(panel.locator("[data-part='kind']")).toHaveText(
    "Companies House refused Submit's own credentials. Nothing is wrong with your account. Try again later.",
  );
});

test("a fault in Submit offers Help and the reference to quote", async ({ page }) => {
  await openPage(page);
  await page.evaluate(() => {
    document.getElementById("companyAuthCode").value = "ABC123";
    window.buildAccountsPayload = () => ({});
    window.submitMicroEntityAccounts = () =>
      Promise.reject(Object.assign(new Error("Internal error"), { status: 500, body: {}, requestId: "req-123" }));
    // eslint-disable-next-line no-undef -- the page's own filing step
    handleSubmitFiling();
  });
  const panel = page.locator("#failureDetail");
  await expect(panel).toHaveAttribute("data-kind", "submit-fault");
  await expect(panel.locator("[data-part='next'] a")).toHaveAttribute("href", "/help.html");
  await expect(panel.locator("[data-part='next']")).toContainText("req-123");
});

test("filing again removes the panel of the earlier failure", async ({ page }) => {
  await openPage(page);
  await fileRefusedWith(page, { status: 500, body: {}, message: "Internal error" });
  await expect(page.locator("#failureDetail")).toBeVisible();
  await page.evaluate(() => {
    window.submitMicroEntityAccounts = () => new Promise(() => {});
    // eslint-disable-next-line no-undef -- the page's own filing step
    handleSubmitFiling();
  });
  await expect(page.locator("#statusMessagesContainer")).toContainText("Sending the accounts to Companies House...");
  await expect(page.locator("#failureDetail")).toHaveCount(0);
});

test("a failed preview says nothing was sent to Companies House", async ({ page }) => {
  await openPage(page);
  const sent = await page.evaluate(async () => {
    const module = await import("/lib/accounts-filing-failure.js");
    module.showAccountsFailure(
      document,
      Object.assign(new Error("Bad request"), { status: 400, body: {} }),
      module.ACCOUNTS_FAILURE_STAGES.preview,
    );
    return document.querySelector("#failureDetail [data-part='sent']").textContent;
  });
  expect(sent).toBe("Nothing was sent to Companies House. The preview is built before anything is sent.");
});

test("the Welsh page says in Welsh that nothing was filed", async ({ page }) => {
  await openPage(page, { welsh: true });
  await fileRefusedWith(page, {
    status: 502,
    body: { errors: [{ number: "9999", text: "The period end date is after the made up date" }] },
    message: "Companies House rejected the submission",
  });
  const panel = page.locator("#failureDetail");
  await expect(panel.locator("[data-part='sent']")).toHaveText("Ni chymerodd Tŷ’r Cwmnïau y cyfrifon, ac ni ffeiliwyd dim.");
  await page.setViewportSize({ width: 390, height: 900 });
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "micro-business-error-cy-390.png"), fullPage: false });
});
