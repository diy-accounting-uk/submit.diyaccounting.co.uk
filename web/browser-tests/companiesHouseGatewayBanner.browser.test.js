// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/companiesHouseGatewayBanner.browser.test.js
//
// The XML gateway filing pages say what their deployment does with a filing: the test gateway
// records nothing, the live gateway reaches the register. The banner follows submit.env's
// COMPANIES_HOUSE_GATEWAY_TEST, which the accounts and confirmation statement Lambdas run with.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const LANE_SCRIPT = fs.readFileSync(path.join(process.cwd(), "web/public/lib/companies-house-lane.js"), "utf-8");
const GATEWAY_PAGES = ["fileMicroEntityAccounts.html", "fileSmallCompanyAccounts.html", "fileConfirmationStatement.html"];

function bannerOf(page) {
  const html = fs.readFileSync(path.join(process.cwd(), "web/public/companies-house", page), "utf-8");
  // The accounts forms ship the banner hidden and their page script reveals it; the banner is read as shown.
  const match = html.match(
    /<p class="hint" data-feature-status="production" data-companies-house-service="xml-gateway"( hidden)?>[\s\S]*?<\/p>/,
  );
  if (!match) throw new Error(`${page}: no XML gateway banner`);
  return match[0].replace(/ hidden>/, ">");
}

async function openBanner(page, pageName, env) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setContent(`<!doctype html><html lang="en-GB"><body><main>${bannerOf(pageName)}</main></body></html>`);
  await page.evaluate((value) => {
    window.envReady = Promise.resolve(value);
  }, env);
  await page.addScriptTag({ content: LANE_SCRIPT });
  await page.evaluate(() => document.dispatchEvent(new Event("DOMContentLoaded")));
  await page.waitForTimeout(100);
  return { banner: page.locator("p.hint[data-feature-status]"), errors };
}

test.describe("XML gateway filing page banner", () => {
  for (const pageName of GATEWAY_PAGES) {
    test(`${pageName} says sandbox where the gateway runs in test mode`, async ({ page }) => {
      const { banner } = await openBanner(page, pageName, { COMPANIES_HOUSE_GATEWAY_TEST: "true" });
      await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
      await expect(banner).toContainText("Status: sandbox.");
      await expect(banner).toContainText("Nothing you file here reaches the live register.");
      await expect(banner).not.toContainText("production");
    });

    test(`${pageName} keeps its production banner where the gateway files to the live register`, async ({ page }) => {
      const { banner } = await openBanner(page, pageName, { COMPANIES_HOUSE_GATEWAY_TEST: "false" });
      await expect(banner).toHaveAttribute("data-feature-status", "production");
      await expect(banner).toContainText("Status: production.");
      await expect(banner).toContainText("the live Companies House register");
    });
  }

  test("a submit.env with no gateway flag is reported, not read as either lane", async ({ page }) => {
    const { banner, errors } = await openBanner(page, "fileMicroEntityAccounts.html", {});
    await expect(banner).toHaveAttribute("data-feature-status", "production");
    expect(errors.join("\n")).toContain("COMPANIES_HOUSE_GATEWAY_TEST");
  });

  test("every XML gateway page loads the lane script", () => {
    for (const pageName of GATEWAY_PAGES) {
      for (const dir of ["web/public/companies-house", "web/public/cy/companies-house"]) {
        const html = fs.readFileSync(path.join(process.cwd(), dir, pageName), "utf-8");
        expect(html, `${dir}/${pageName}`).toContain("lib/companies-house-lane.js");
        expect(html, `${dir}/${pageName}`).toContain('data-companies-house-service="xml-gateway"');
      }
    }
  });
});
