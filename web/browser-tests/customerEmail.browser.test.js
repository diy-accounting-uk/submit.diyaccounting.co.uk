// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/customerEmail.browser.test.js
// Each customer email as a reader sees it in a mail client: the rendered HTML opened at desktop
// and phone width, checked on its visible text, its QR image and its width, and saved as a
// picture under target/.

import { test, expect } from "@playwright/test";
import path from "path";
import { pathToFileURL } from "url";
import { CASES, renderCustomerEmails } from "../../scripts/render-customer-emails.mjs";

const OUTPUT_DIRECTORY = path.join(process.cwd(), "target", "customer-emails");
const WIDTHS = [600, 360];

const EXPECTED_TEXT = {
  "physical-pass": ["Your pass: Day pass", "tiger-happy-mountain-silver", "Open the pass link", "attached as files to print"],
  "digital-pass": ["Your pass: Day pass", "river-quiet-amber-cloud", "No end date", "Unlimited", "Open the pass link"],
  "vat-receipt": [
    "Your receipt: VAT return",
    "Form bundle number",
    "123456789012",
    "5 November 2026, 09:30 UTC",
    "DD means Direct Debit.",
    "See your receipts",
  ],
  "itsa-receipt": ["Your receipt: Self-employment update", "Correlation id", "6 April 2026 to 5 July 2026", "2026-27", "See your receipts"],
  "subscription": ["Your Resident VAT subscription is active", "Renews on", "5 December 2026", "Manage billing"],
};

let written;

test.beforeAll(async () => {
  written = await renderCustomerEmails(OUTPUT_DIRECTORY);
});

test.describe("Customer emails as a reader sees them", () => {
  for (const { name } of CASES) {
    for (const width of WIDTHS) {
      test(`the ${name} email reads cleanly at ${width} px`, async ({ page }) => {
        const { htmlFile, hasQr } = written.find((entry) => entry.name === name);
        // A short viewport makes the full-page screenshot end where the email ends.
        await page.setViewportSize({ width, height: 200 });
        await page.goto(pathToFileURL(path.join(OUTPUT_DIRECTORY, htmlFile)).href, { waitUntil: "load" });

        const text = await page.evaluate(() => document.body.innerText);
        for (const expected of EXPECTED_TEXT[name]) expect(text, `"${expected}" is visible`).toContain(expected);
        expect(text).toContain("support@diyaccounting.co.uk");
        expect(text).not.toMatch(/<[a-z]|&amp;|&lt;|undefined|null/);

        const images = await page.evaluate(() =>
          Array.from(document.images).map((image) => ({
            alt: image.alt,
            loaded: image.complete && image.naturalWidth > 0,
            width: image.width,
          })),
        );
        if (hasQr) {
          expect(images).toHaveLength(1);
          expect(images[0].alt).toBe("QR code for your pass");
          expect(images[0].loaded, "the QR image loads").toBe(true);
          expect(images[0].width).toBeGreaterThanOrEqual(150);
        } else {
          expect(images).toHaveLength(0);
        }

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(0);

        await page.screenshot({ path: path.join(OUTPUT_DIRECTORY, `${name}-${width}.png`), fullPage: true });
      });
    }
  }
});
