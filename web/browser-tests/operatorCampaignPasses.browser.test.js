// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/operatorCampaignPasses.browser.test.js
// The operator's campaign pass page creates a pass with every term set on the page, shows its link
// and QR code, and lists the campaign passes on the same card as the bundles page.

import { test, expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveRealSite } from "./serveRealSite.js";

// The site's own address, which the page writes into the pass link a reader copies.
const SITE_ORIGIN = "https://submit.diyaccounting.co.uk";

dotenvConfigIfNotBlank({ path: ".env.test" });

const SCREENSHOTS = "target/screenshots/operator-campaign-passes";

// The page, or one part of it, at the page's width and again at a phone's width.
async function shotAtWidths(page, name, part) {
  const shown = page.viewportSize();
  for (const [width, file] of [
    [shown.width, `${SCREENSHOTS}/${name}.png`],
    [390, `${SCREENSHOTS}/${name}-390.png`],
  ]) {
    await page.setViewportSize({ width, height: shown.height });
    if (part) await page.locator(part).screenshot({ path: file });
    else await page.screenshot({ path: file, fullPage: true });
  }
  await page.setViewportSize(shown);
}

const donorPass = {
  code: "lantern-brisk-meadow-oak",
  passTypeId: "custom-campaign",
  bundleId: "resident-vat-comp",
  validFrom: "2026-11-22T00:00:00.000Z",
  validUntil: "2027-05-22T22:59:59.999Z",
  maxUses: 1000,
  usesPerAccount: 1,
  grants: [{ bundleId: "resident-vat-comp", duration: "P1Y" }],
  useCount: 12,
  createdAt: "2026-11-22T00:00:00.000Z",
  notes: "Donors' year",
  figures: {
    uses: 12,
    newAccounts: 9,
    filed: 4,
    subscribers: 0,
    paidCharges: 0,
    fewerThanThree: false,
    lastUsed: "2026-11-30T10:00:00.000Z",
  },
};

const eventPass = {
  ...donorPass,
  code: "harbour-quiet-silver-fern",
  validUntil: "2026-12-31T23:59:59.999Z",
  maxUses: null,
  usesPerAccount: 2,
  grants: [
    { bundleId: "invited-guest", duration: "P3M", tokens: 20, tokenRefreshInterval: "P1M" },
    { bundleId: "resident-vat-comp", duration: "P6M" },
  ],
  useCount: 3,
  notes: "Trade show",
  figures: { uses: 3, newAccounts: null, filed: null, subscribers: null, paidCharges: null, fewerThanThree: true, lastUsed: null },
};

async function openPage(page, { passes, onCreate }) {
  const created = [];
  await serveRealSite(page, {
    origin: SITE_ORIGIN,
    signedIn: true,
    apiHandler: (url, request) => {
      if (url.pathname === "/api/v1/pass/campaign") return { passes: passes(), count: passes().length };
      if (url.pathname === "/api/v1/pass/admin") {
        created.push({ body: request.postDataJSON(), headers: request.headers() });
        return onCreate(request.postDataJSON());
      }
      return undefined;
    },
  });
  await page.addInitScript(() => localStorage.setItem("consent.analytics", "declined"));
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(`${SITE_ORIGIN}/operator/campaign-passes.html`, { waitUntil: "domcontentloaded" });
  return created;
}

test.describe("the operator's campaign pass page", () => {
  test("creates a pass with the terms set on the page, then shows its link and QR code and lists it", async ({ page }) => {
    let listed = [donorPass];
    const created = await openPage(page, {
      passes: () => listed,
      onCreate: () => {
        listed = [eventPass, donorPass];
        return { code: eventPass.code, bundleId: "invited-guest", passTypeId: "custom-campaign" };
      },
    });

    await expect(page.locator("#cpGrants .cp-grant")).toHaveCount(1);
    await expect(page.locator(`[data-pass-code="${donorPass.code}"]`)).toBeVisible();
    await shotAtWidths(page, "form-empty");

    await page.fill("#cpValidFrom", "2026-11-22");
    await page.fill("#cpValidUntil", "2026-12-31");
    await page.fill("#cpUsesPerAccount", "2");
    await page.selectOption("#cpGrant0Bundle", "invited-guest");
    await page.fill("#cpGrant0Duration", "P3M");
    await page.fill("#cpGrant0Tokens", "20");
    await page.fill("#cpGrant0Refresh", "P1M");
    await page.click("#cpAddGrant");
    await page.selectOption("#cpGrant1Bundle", "resident-vat-comp");
    await page.fill("#cpGrant1Duration", "P6M");
    await page.fill("#cpNotes", "Trade show");
    await shotAtWidths(page, "form-filled");

    await page.click("#cpCreate");

    await expect(page.locator("#cpNewPass")).toBeVisible();
    await expect(page.locator("#cpNewPassCode")).toHaveText(eventPass.code);
    await expect(page.locator("#cpNewPassLink")).toHaveText(`${SITE_ORIGIN}/pass.html?pass=${eventPass.code}`);
    await expect(page.locator("#cpNewPassQr")).toBeVisible();
    expect(await page.locator("#cpNewPassQr").evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    await shotAtWidths(page, "new-pass", "#cpNewPass");

    expect(created).toHaveLength(1);
    expect(created[0].body).toEqual({
      passTypeId: "custom-campaign",
      validFrom: "2026-11-22T00:00:00.000Z",
      validUntil: "2026-12-31T23:59:59.999Z",
      usesPerAccount: 2,
      maxUses: null,
      grants: [
        { bundleId: "invited-guest", duration: "P3M", tokens: 20, tokenRefreshInterval: "P1M" },
        { bundleId: "resident-vat-comp", duration: "P6M" },
      ],
      notes: "Trade show",
    });

    await expect(page.locator("#cpList [data-pass-code]")).toHaveCount(2);
  });

  test("a window chosen in summer runs from the start of the first UK day to the end of the last, and the list states those dates", async ({
    page,
  }) => {
    let listed = [];
    const created = await openPage(page, {
      passes: () => listed,
      onCreate: (body) => {
        listed = [{ ...eventPass, validFrom: body.validFrom, validUntil: body.validUntil, createdAt: body.validFrom }];
        return { code: eventPass.code, bundleId: "invited-guest", passTypeId: "custom-campaign" };
      },
    });
    await page.fill("#cpValidFrom", "2027-06-01");
    await page.fill("#cpValidUntil", "2027-06-30");
    await page.selectOption("#cpGrant0Bundle", "invited-guest");
    await page.click("#cpCreate");
    await expect(page.locator("#cpNewPass")).toBeVisible();
    expect(created[0].body.validFrom).toBe("2027-05-31T23:00:00.000Z");
    expect(created[0].body.validUntil).toBe("2027-06-30T22:59:59.999Z");
    await expect(page.locator(`#cpList [data-pass-code="${eventPass.code}"] .pass-terms li`).first()).toHaveText(
      "Redeem from 1 June 2027 to 30 June 2027",
    );
  });

  test("lists each campaign pass with its window, its limits and each bundle with its duration and tokens", async ({ page }) => {
    await openPage(page, { passes: () => [eventPass, donorPass], onCreate: () => ({}) });

    const event = page.locator(`#cpList [data-pass-code="${eventPass.code}"]`);
    await expect(event.locator(".status-tag")).toHaveText("Campaign");
    await expect(event.locator(".pass-terms li")).toHaveText([
      "Redeem from 22 November 2026 to 31 December 2026",
      "No limit on redemptions, 2 per account",
      "Invited Guest for 3 months from redemption, 20 tokens a month",
      "Resident VAT (Complimentary) for 6 months from redemption, 100 tokens a month",
    ]);
    await expect(event.locator('[data-figure="uses"] dd')).toHaveText("3");

    const donor = page.locator(`#cpList [data-pass-code="${donorPass.code}"]`);
    await expect(donor.locator(".pass-terms li")).toHaveText([
      "Redeem from 22 November 2026 to 22 May 2027",
      "Up to 1000 redemptions, 1 per account",
      "Resident VAT (Complimentary) for 1 year from redemption, 100 tokens a month",
    ]);
    await expect(donor.locator('[data-figure="uses"] dd')).toHaveText("12");
    await shotAtWidths(page, "campaign-passes-list", "#cpList");
  });

  test("a signed-in reader who is not an operator is told they have no access, without HMRC", async ({ page }) => {
    await serveRealSite(page, { origin: SITE_ORIGIN, signedIn: true });
    await page.route(`${SITE_ORIGIN}/api/v1/pass/campaign*`, (route) =>
      route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "Forbidden" }) }),
    );
    await page.addInitScript(() => localStorage.setItem("consent.analytics", "declined"));
    await page.goto(`${SITE_ORIGIN}/operator/campaign-passes.html`, { waitUntil: "domcontentloaded" });

    const failure = page.locator(".status-message.status-error[role=alert]");
    await expect(failure.locator(".status-message-cause")).toHaveText("You do not have access to this page.");
    await expect(failure.locator("a.status-message-next")).toHaveAttribute("href", "/");
    await expect(page.locator("#statusMessagesContainer")).not.toContainText("HMRC");
  });

  test("offers no bundle sold by subscription, the automatic one or the operator's own", async ({ page }) => {
    await openPage(page, { passes: () => [], onCreate: () => ({}) });
    // The list fills once the catalogue has loaded.
    await expect(page.locator('#cpGrant0Bundle option[value="resident-vat-comp"]')).toHaveCount(1);

    const options = await page.locator("#cpGrant0Bundle option").evaluateAll((nodes) => nodes.map((node) => node.value));
    expect(options).toContain("resident-vat-comp");
    for (const bundleId of ["resident-vat", "resident-ltd", "resident-pro", "default", "operator"]) expect(options).not.toContain(bundleId);
    await expect(page.locator("#cpListEmpty")).toBeVisible();
  });
});
