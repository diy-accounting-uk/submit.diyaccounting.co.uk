// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/operatorHeldPasses.browser.test.js
// The operator dashboard lists every held pass and releases one from its row.

import { test, expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveRealSite, SITE_ORIGIN } from "./serveRealSite.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const affiliatePass = {
  code: "tiger-happy-mountain-silver",
  issuedBy: "9f2c4e7a1b3d5f60aabbccdd",
  useCount: 1000,
  reviewLimit: 1000,
  heldAt: "2026-10-30T09:15:00.000Z",
};
const secondPass = {
  ...affiliatePass,
  code: "river-quiet-garden-amber",
  useCount: 50,
  reviewLimit: 50,
  heldAt: "2026-10-31T01:00:00.000Z",
};

test.describe("held passes on the operator dashboard", () => {
  test("lists each held pass and a release reloads the list", async ({ page }) => {
    let released = false;
    const releaseBodies = [];
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: (url, request) => {
        if (url.pathname === "/api/v1/pass/held") return { passes: released ? [secondPass] : [affiliatePass, secondPass] };
        if (url.pathname === "/api/v1/pass/release") {
          releaseBodies.push(request.postDataJSON());
          released = true;
          return { code: affiliatePass.code, useCount: 1000, reviewLimit: 2000, heldForReview: false };
        }
        return undefined;
      },
    });
    await page.goto(`${SITE_ORIGIN}/operator/dashboard.html`, { waitUntil: "domcontentloaded" });

    const rows = page.locator("#heldPassesBody tr");
    await expect(rows).toHaveCount(2);
    const firstRow = page.locator(`[data-held-code="${affiliatePass.code}"]`);
    await expect(firstRow).toContainText("1,000");
    await expect(firstRow).toContainText("9f2c4e7a1b3d");
    await firstRow.locator(".held-pass-release").click();

    await expect(rows).toHaveCount(1);
    await expect(page.locator(`[data-held-code="${secondPass.code}"]`)).toBeVisible();
    expect(releaseBodies).toEqual([{ code: affiliatePass.code, raiseBy: 1000 }]);
  });

  test("says so when no pass is held", async ({ page }) => {
    await serveRealSite(page, {
      signedIn: true,
      apiHandler: (url) => (url.pathname === "/api/v1/pass/held" ? { passes: [] } : undefined),
    });
    await page.goto(`${SITE_ORIGIN}/operator/dashboard.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#heldPassesEmpty")).toBeVisible();
    await expect(page.locator("#heldPassesTable")).toBeHidden();
  });
});
