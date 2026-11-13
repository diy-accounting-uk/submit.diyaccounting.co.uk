// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/reviewLine.browser.test.js
// The line that invites a review under an accepted VAT result and an accepted Companies House
// result, read from the generated review links module.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  pageScrollsSideways,
  recordScreenshotPath,
  serveFilingResultAssets,
  serveSubmissionRecordAssets,
} from "./submissionRecordAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const BOTH = [
  { site: "Trustpilot", url: "https://example.com/trustpilot-profile" },
  { site: "Capterra", url: "https://example.com/capterra-profile" },
];

const VAT_ACCEPTED = `
import { customerCopyHtml } from "/lib/submission-record.js";
import { vatReceiptRecordHtml } from "/lib/vat-return-record.js";
document.body.innerHTML = customerCopyHtml({
  title: "Your copy of the VAT return for July to September 2026",
  reference: { label: "Form bundle number", value: "123456789012" },
  status: { kind: "accepted", text: "Accepted by HMRC" },
  date: "24 October 2026",
  sections: [{ heading: "Receipt", recordHtml: vatReceiptRecordHtml({ processingDateText: "24 October 2026", formBundleNumber: "123456789012" }) }],
  links: [{ href: "receipts.html", text: "See your receipts" }],
});
`;

const registeredChange = (filings) => `
import { registeredChangeCopyHtml } from "/lib/filing-result-record.js";
document.body.innerHTML = registeredChangeCopyHtml({
  title: "Change of registered office address",
  companyNumber: "00000006",
  transaction: { transactionId: "000123-456789", filings: ${JSON.stringify(filings)} },
  details: [["Address", "1 Example Street"]],
  dateText: "24 October 2026",
});
`;

async function open(page, moduleBody, reviewLinks) {
  await serveFilingResultAssets(page);
  await serveSubmissionRecordAssets(page);
  await page.route("**/lib/**", async (route, request) => {
    const { pathname } = new URL(request.url());
    if (pathname === "/lib/review-links.js") {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `export const reviewLinks = ${JSON.stringify(reviewLinks)};`,
      });
      return;
    }
    const file = path.join(process.cwd(), "web/public", pathname);
    await route.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(file, "utf-8") });
  });
  await page.route("http://localhost:3000/result.html", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/submission-record.css"></head><body><script type="module">${moduleBody}</script></body></html>`,
    }),
  );
  await page.goto("http://localhost:3000/result.html");
  await page.locator(".customer-copy").waitFor();
}

test.describe("Review line", () => {
  test("an accepted VAT result shows the line with both links, and a click sends the event", async ({ page }) => {
    await page.addInitScript(() => {
      window.gtagEvents = [];
      window.gtag = (...args) => window.gtagEvents.push(args);
    });
    await open(page, VAT_ACCEPTED, BOTH);
    const line = page.locator(".customer-copy-review");
    await expect(line).toHaveText("Leave a review of DIY Accounting Submit on Trustpilot or Capterra.");
    const trustpilot = line.getByRole("link", { name: "Trustpilot" });
    await expect(trustpilot).toHaveAttribute("href", BOTH[0].url);
    await expect(trustpilot).toHaveAttribute("target", "_blank");
    await expect(trustpilot).toHaveAttribute("rel", "noopener noreferrer");
    await page.route(BOTH[0].url, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "ok" }));
    await trustpilot.click();
    expect(await page.evaluate(() => window.gtagEvents)).toEqual([["event", "review_link_clicked", { site: "Trustpilot" }]]);

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await pageScrollsSideways(page)).toBe(false);
      fs.mkdirSync(path.dirname(recordScreenshotPath("review-line", width)), { recursive: true });
      await page.screenshot({ path: recordScreenshotPath("review-line", width), fullPage: true });
    }
  });

  test("an accepted Companies House result shows the line", async ({ page }) => {
    await open(page, registeredChange([{ status: "accepted" }]), BOTH);
    await expect(page.locator(".customer-copy-review a")).toHaveCount(2);
  });

  test("the line is absent when the file holds no profile", async ({ page }) => {
    await open(page, VAT_ACCEPTED, []);
    await expect(page.locator(".customer-copy-review")).toHaveCount(0);
  });

  test("the line is absent on a rejected Companies House result", async ({ page }) => {
    await open(page, registeredChange([{ status: "rejected" }]), BOTH);
    await expect(page.locator(".customer-copy-review")).toHaveCount(0);
  });

  test("the line is absent on a pending Companies House result", async ({ page }) => {
    await open(page, registeredChange([{ status: "pending" }]), BOTH);
    await expect(page.locator(".customer-copy-review")).toHaveCount(0);
  });
});
