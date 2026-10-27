// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/readerView.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { assertReaderView, findReaderViewDefects, isOwnPage } from "../../behaviour-tests/helpers/behaviour-helpers.js";

const fixturesDirectory = path.join(process.cwd(), "web/browser-tests/fixtures/reader-view");

async function openFixture(page, name) {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent(fs.readFileSync(path.join(fixturesDirectory, `${name}.html`), "utf-8"));
}

test.describe("Reader view check", () => {
  test("passes a clean page, ignoring a hidden developer section and a textarea value", async ({ page }) => {
    await openFixture(page, "clean");
    expect(await findReaderViewDefects(page)).toEqual([]);
    await assertReaderView(page);
  });

  const failingFixtures = [
    ["markup-as-text", "markup-as-text"],
    ["json-as-text", "json-as-text"],
    ["stack-trace", "stack-trace-as-text"],
    ["placeholder-values", "placeholder-value-as-text"],
    ["developer-visible", "developer-content-visible"],
    ["horizontal-overflow", "horizontal-overflow"],
    ["unstyled-control", "unstyled-control"],
  ];

  for (const [fixture, rule] of failingFixtures) {
    test(`fails a page that shows ${fixture} with the ${rule} rule`, async ({ page }) => {
      await openFixture(page, fixture);
      const defects = await findReaderViewDefects(page);
      expect(defects.map((defect) => defect.rule)).toContain(rule);
      await expect(assertReaderView(page)).rejects.toThrow(rule);
    });
  }

  test("accepts developer content when developer mode is on", async ({ page }) => {
    await openFixture(page, "developer-visible");
    await page.evaluate(() => document.body.classList.add("developer-mode"));
    expect((await findReaderViewDefects(page)).map((defect) => defect.rule)).not.toContain("developer-content-visible");
  });

  test("skips an ignored selector", async ({ page }) => {
    await openFixture(page, "json-as-text");
    expect(await findReaderViewDefects(page, { ignoreSelectors: ["p"] })).toEqual([]);
  });

  test("judges our pages and the local servers, never another service's", () => {
    expect(isOwnPage("https://ci-set1.submit.diyaccounting.co.uk/bundles.html")).toBe(true);
    expect(isOwnPage("https://submit.diyaccounting.co.uk/")).toBe(true);
    expect(isOwnPage("http://127.0.0.1:3000/hmrc/vat/submitVat.html")).toBe(true);
    expect(isOwnPage("http://localhost:64588/oauth/authorize")).toBe(true);
    expect(isOwnPage("https://checkout.stripe.com/c/pay/cs_test_x")).toBe(false);
    expect(isOwnPage("https://test-www.tax.service.gov.uk/oauth/start")).toBe(false);
    expect(isOwnPage("https://diyaccounting.co.uk.example.com/")).toBe(false);
    expect(isOwnPage("about:blank")).toBe(false);
  });
});
