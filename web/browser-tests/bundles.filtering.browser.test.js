// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/bundles.filtering.browser.test.js

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { setTimeout as delay } from "timers/promises";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

test.describe("Bundles page client-side filtering by listedInEnvironments", () => {
  let bundlesHtmlContent;

  test.beforeAll(async () => {
    bundlesHtmlContent = fs.readFileSync(path.join(process.cwd(), "web/public/bundles.html"), "utf-8");
  });

  test("shows only bundles allowed in current environment or with no restriction", async ({ page }) => {
    // Capture console and page errors for debugging
    page.on("console", (msg) => {
      // eslint-disable-next-line no-console
      console.log(`[PAGE_CONSOLE:${msg.type()}]`, msg.text());
    });
    page.on("pageerror", (err) => {
      // eslint-disable-next-line no-console
      console.log("[PAGE_ERROR]", err?.message || String(err));
    });
    // Stub globals used by inline script to avoid ReferenceErrors
    await page.addInitScript(() => {
      window.showStatus = window.showStatus || (() => {});
      window.checkAuthStatus = window.checkAuthStatus || (() => {});
      window.toggleMenu = window.toggleMenu || (() => {});
      // Ensure localStorage APIs exist
      try {
        localStorage.setItem("__test__", "1");
        localStorage.removeItem("__test__");
      } catch {}
    });

    // Prevent external script files referenced by bundles.html from executing/failing
    // We only want the inline script inside bundles.html to run for this test
    // EXCEPT for the TOML parser which we now need
    await page.route("**/*.js", async (route) => {
      // Allow our API mocks below to proceed; only intercept script resources
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();
      if (resourceType === "script" && !url.includes("toml-parser.js")) {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      } else if (url.includes("toml-parser.js")) {
        const tomlParserPath = path.join(process.cwd(), "web/public/lib/toml-parser.js");
        const tomlParserContent = fs.readFileSync(tomlParserPath, "utf-8");
        await route.fulfill({ status: 200, contentType: "application/javascript", body: tomlParserContent });
      } else {
        await route.continue();
      }
    });

    // Mock the catalog API to return a mixture of bundles in TOML format
    await page.route("**/submit.catalogue.toml", async (route) => {
      const tomlBody = `
[[bundles]]
id = "restrictedTest"
name = "Restricted"
allocation = "on-request"
listedInEnvironments = ["test"]

[[bundles]]
id = "unrestricted"
name = "Unrestricted"
allocation = "on-request"

[[bundles]]
id = "prodOnly"
name = "Prod Only"
allocation = "on-request"
listedInEnvironments = ["prod"]

[[bundles]]
id = "hiddenBundle"
name = "Hidden Bundle"
allocation = "on-request"
hidden = true

[[bundles]]
id = "auto"
name = "Automatic"
allocation = "automatic"
`;
      await route.fulfill({ status: 200, contentType: "text/x-toml", body: tomlBody });
    });

    // Mock submit.environment-name.txt to indicate we are in the 'test' environment
    await page.route("**/submit.environment-name.txt", async (route) => {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "test\n" });
    });

    // Prepare HTML with a <base> tag for proper relative URL resolution and inline stubs for globals
    const modifiedHtml = bundlesHtmlContent
      .replace("<head>", '<head><base href="http://localhost:3000/account/">')
      .replace(
        "<body>",
        `<body><script>\nwindow.showStatus = window.showStatus || function(){};\nwindow.checkAuthStatus = window.checkAuthStatus || function(){};\nwindow.toggleMenu = window.toggleMenu || function(){};\n</script>`,
      );

    // Load the modified bundles page HTML
    await page.setContent(modifiedHtml, {
      url: "http://localhost:3000/bundles.html",
      waitUntil: "domcontentloaded",
    });

    // Wait a moment for the inline script to fetch and render
    await delay(400);

    // Debug: capture container HTML if nothing rendered
    const container = page.locator("#catalogBundles");
    const debugHtml = await container.evaluate((el) => el?.innerHTML || "");
    if (!debugHtml || debugHtml.trim() === "") {
      console.log("[DEBUG_LOG] #catalogBundles innerHTML (empty?):", debugHtml);
    }

    // Expect only the allowed buttons to be present: restrictedTest and unrestricted
    const buttons = page.locator("button[data-bundle-id]");
    await expect(buttons).toHaveCount(2);

    // Collect bundle IDs rendered
    const ids = await buttons.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-bundle-id")));
    expect(ids.sort()).toEqual(["restrictedTest", "unrestricted"]);

    // Ensure the "Prod Only", "automatic", and "hidden" bundles are not shown
    await expect(page.locator('button[data-bundle-id="prodOnly"]')).toHaveCount(0);
    await expect(page.locator('button[data-bundle-id="auto"]')).toHaveCount(0);
    await expect(page.locator('button[data-bundle-id="hiddenBundle"]')).toHaveCount(0);
  });
});
