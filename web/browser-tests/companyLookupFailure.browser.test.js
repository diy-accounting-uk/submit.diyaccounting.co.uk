// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/companyLookupFailure.browser.test.js
// A company lookup that fails says what happened in the page's language: no such company, Companies
// House not answering, or a fault in Submit. The lookup route's English message stays out of the
// status line.

import path from "path";
import { test, expect } from "@playwright/test";
import { serveAccountsSite } from "./accountsLinesSite.js";

const SCREENSHOT_DIR = path.join(process.cwd(), "target/screenshots/company-lookup-failure");

async function lookUpAnswered(page, form, { status, message, welsh = false }) {
  await serveAccountsSite(page);
  await page.route("**/api/v1/companies-house/company/09999999", (route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ message }) }),
  );
  await page.goto(`http://localhost:3000${welsh ? "/cy" : ""}/companies-house/${form}.html`, { waitUntil: "networkidle" });
  await page.fill("#companyNumber", "09999999");
  await page.locator("#companyForm button[type=submit]").click();
  return page.locator("#statusMessagesContainer");
}

async function shoot(page, name) {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 700 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-${width}.png`), fullPage: false });
  }
}

for (const [status, sentence] of [
  [404, "Companies House has no company with the number 09999999. Check the number and look it up again."],
  [502, "Companies House did not answer. Try again in a few minutes."],
  [500, "Submit could not look up the company. This is a fault in Submit: try again, and ask for help if it happens again."],
]) {
  test(`the micro-entity page says in its own words what a ${status} from the lookup means`, async ({ page }) => {
    const statusLine = await lookUpAnswered(page, "fileMicroEntityAccounts", { status, message: "Not found for the specified query" });
    await expect(statusLine).toContainText(sentence);
    await expect(statusLine).not.toContainText("Not found for the specified query");
    await expect(page.locator("#formView")).toBeHidden();
    if (status === 404) await shoot(page, "micro-not-found");
  });
}

test("the Welsh small company page says in Welsh that Companies House has no such company", async ({ page }) => {
  const statusLine = await lookUpAnswered(page, "fileSmallCompanyAccounts", {
    status: 404,
    message: "Not found for the specified query",
    welsh: true,
  });
  await expect(statusLine).toContainText("Nid oes gan Dŷ’r Cwmnïau gwmni â’r rhif 09999999.");
  await expect(statusLine).not.toContainText("Not found for the specified query");
  await shoot(page, "small-not-found-cy");
});

test("the Welsh small company page says in Welsh that Companies House did not answer", async ({ page }) => {
  const statusLine = await lookUpAnswered(page, "fileSmallCompanyAccounts", { status: 503, message: "Service Unavailable", welsh: true });
  await expect(statusLine).toContainText("Ni atebodd Tŷ’r Cwmnïau.");
  await expect(statusLine).not.toContainText("Service Unavailable");
});
