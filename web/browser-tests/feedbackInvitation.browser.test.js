// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/feedbackInvitation.browser.test.js
// The invitation to be contacted for feedback follows the feedback-engagement entry in submit.features.toml.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveRealSite, SITE_ORIGIN } from "./serveRealSite.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const SHIPPED_FEATURES = fs.readFileSync(path.join(process.cwd(), "web/public/submit.features.toml"), "utf-8");

async function openSignedIn(page, pagePath, featuresToml) {
  await serveRealSite(page, { signedIn: true });
  await page.route("**/submit.features.toml", (route) => route.fulfill({ status: 200, contentType: "text/x-toml", body: featuresToml }));
  await page.goto(`${SITE_ORIGIN}/${pagePath}`, { waitUntil: "load" });
  await page.waitForLoadState("networkidle");
}

const ON_WITH_MESSAGE = `
[[features]]
id = "feedback-engagement"
name = "Feedback Engagement"
enabled = true
description = "x"
message = "Tell us what you think of the new filing flow."
`;

test.describe("Feedback invitation", () => {
  test("the shipped config has the feature off", () => {
    expect(SHIPPED_FEATURES).toMatch(/id = "feedback-engagement"\nname = "[^"]+"\nenabled = false/);
  });

  test("the home page does not show it when the feature is off, and the content does not move", async ({ page }) => {
    await openSignedIn(page, "index.html", SHIPPED_FEATURES);
    await expect(page.locator("#feedbackEngagementBanner")).toBeHidden();
    expect(await page.locator("#feedbackEngagementBanner").evaluate((el) => el.getBoundingClientRect().height)).toBe(0);
  });

  test("the bundles page does not show it when the feature is off", async ({ page }) => {
    await openSignedIn(page, "bundles.html", SHIPPED_FEATURES);
    await expect(page.locator("#feedbackEngagementSection")).toBeHidden();
  });

  test("the home page shows the configured message when the feature is on", async ({ page }) => {
    await openSignedIn(page, "index.html", ON_WITH_MESSAGE);
    await expect(page.locator("#feedbackEngagementBanner")).toBeVisible();
    await expect(page.locator("#feedbackEngagementMessage")).toHaveText("Tell us what you think of the new filing flow.");
  });

  test("the bundles page shows the configured message when the feature is on", async ({ page }) => {
    await openSignedIn(page, "bundles.html", ON_WITH_MESSAGE);
    await expect(page.locator("#feedbackEngagementSection")).toBeVisible();
    await expect(page.locator("#feedbackEngagementMessage")).toHaveText("Tell us what you think of the new filing flow.");
  });
});
