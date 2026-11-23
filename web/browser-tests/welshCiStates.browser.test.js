// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/welshCiStates.browser.test.js
//
// The Welsh pages in the states a long-used account reaches: generated passes on the Bundles page, a
// past filing on the filings page, and a subscription's cost line on an Income Tax page. Each reads in
// Welsh, with no English string that has a Welsh entry.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { accountsDocumentCases, computationsDocumentCase } from "@app/test-helpers/accountsDocumentCases.js";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const ACCOUNTS_RECEIPT_NAME = "2026-10-24T10:15:00.000Z-00001A.json";
const ACCOUNTS_RECEIPT = {
  kind: "companies-house-accounts",
  statusCode: "ACCEPT",
  submissionNumber: "00001A",
  companyNumber: "00000003",
  rejections: [],
  filedDocument: accountsDocumentCases()[0].xhtml,
};

const CT_RECEIPT_NAME = "2026-10-24T11:30:00.000Z-ABCDEF0123456789.json";
const CT_RECEIPT = {
  kind: "company-tax-return",
  statusCode: "ACCEPT",
  correlationId: "ABCDEF0123456789",
  utr: "8596148860",
  irmark: "RB3VJQ7ATMNZ7DXZRD3GVKMWDFPAYR5S",
  irmarkReceipt: "RB3VJQ7ATMNZ7DXZRD3GVKMWDFPAYR5S",
  successMessage: "The submission was successfully received.",
  filed: {
    boxes: {
      1: "Example Trading Limited",
      2: "00000003",
      3: "8596148860",
      30: "2025-04-01",
      35: "2026-03-31",
      145: 10000,
      155: 4500,
      475: 855,
    },
    computationsIxbrl: computationsDocumentCase(),
    accountsIxbrl: accountsDocumentCases().find((candidate) => candidate.name === "small-company-accounts").xhtml,
  },
};

const GENERATED_PASSES = {
  passes: [
    {
      code: "maple-river-quiet-harbour",
      passTypeId: "digital-pass",
      bundleId: "resident-vat",
      validFrom: "2026-08-01T00:00:00.000Z",
      validUntil: "2027-08-01T00:00:00.000Z",
      maxUses: 25,
      useCount: 14,
      heldForReview: false,
      createdAt: "2026-08-01T09:30:00.000Z",
      notes: "Bookkeepers' meet-up",
      revokedAt: null,
      figures: {
        uses: 14,
        newAccounts: 11,
        filed: 6,
        subscribers: 4,
        paidCharges: 3,
        fewerThanThree: false,
        lastUsed: "2026-10-28T16:05:00.000Z",
      },
    },
  ],
  count: 1,
  totals: {
    passes: 1,
    countedPasses: 1,
    uses: 14,
    newAccounts: 11,
    filed: 6,
    subscribers: 4,
    paidCharges: 3,
    fewerThanThree: false,
    lastUsed: "2026-10-28T16:05:00.000Z",
  },
};

async function serveSite(page, apiBodies, apiStatus = {}) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const body = Object.entries(apiBodies).find(([prefix]) => url.pathname.startsWith(prefix))?.[1] ?? {};
      const status = Object.entries(apiStatus).find(([prefix]) => url.pathname.startsWith(prefix))?.[1] ?? 200;
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      return;
    }
    const filePath = path.join(PUBLIC_ROOT, decodeURIComponent(url.pathname));
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      await route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
        body: fs.readFileSync(filePath),
      });
    } else {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("cognitoIdToken", "test-id-token");
    localStorage.setItem("siteLanguage", "cy");
  });
}

const COST_STATES = [
  { state: "a balance that cannot be read", bundles: null, welsh: /^Mae’r cyflwyniad hwn yn costio 1 credyd\.$/ },
  {
    state: "tokens left",
    bundles: [{ bundleId: "resident-pro", allocated: true, tokensGranted: 100, tokensRemaining: 90 }],
    welsh: /^Mae’r cyflwyniad hwn yn costio 1 credyd\. Mae gennych 90 ar ôl\.$/,
  },
  {
    state: "an unlimited grant",
    bundles: [{ bundleId: "resident-pro", allocated: true, tokensGranted: "unlimited" }],
    welsh: /^Mae’r cyflwyniad hwn yn costio 1 credyd\. Mae gennych gredydau diderfyn\.$/,
  },
  {
    state: "no token left, with a refresh date",
    bundles: [
      { bundleId: "resident-pro", allocated: true, tokensGranted: 100, tokensRemaining: 0, tokenResetAt: "2026-12-01T00:00:00.000Z" },
    ],
    welsh: /^Nid oes gennych gredydau \(tokens\) ar ôl\. Bydd eich lwfans yn adnewyddu ar 1 Rhagfyr 2026, neu gallwch ychwanegu Bundle\.$/,
  },
  {
    state: "no token left, with no refresh date",
    bundles: [{ bundleId: "resident-pro", allocated: true, tokensGranted: 100, tokensRemaining: 0 }],
    welsh: /^Nid oes gennych gredydau \(tokens\) ar ôl\. Gallwch ychwanegu Bundle\.$/,
  },
];

test.describe("Welsh pages in a long-used account's states", () => {
  for (const { state, bundles, welsh } of COST_STATES) {
    test(`the cost line on a Welsh Income Tax page reads in Welsh with ${state}`, async ({ page }) => {
      await serveSite(page, bundles ? { "/api/v1/bundle": { bundles } } : {});
      if (!bundles)
        await page.route("**/api/v1/bundle", (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
      await page.goto("http://localhost:3000/cy/hmrc/itsa/selfEmploymentPeriod.html", { waitUntil: "load" });
      const cost = page.locator("#submissionCost");
      await expect(cost).toHaveText(welsh);
      const lines = (await cost.innerText()).split("\n").map((line) => line.trim());
      for (const english of ["You can", "You have", "This submission"]) expect(lines.some((line) => line.startsWith(english))).toBe(false);
    });
  }

  test("generated passes: the Delete selected control reads in Welsh, before and after a pass is ticked", async ({ page }) => {
    await serveSite(page, {
      "/api/v1/pass/my-passes": GENERATED_PASSES,
      "/api/v1/bundle": { bundles: [{ bundleId: "resident-vat", allocated: true }] },
    });
    await page.goto("http://localhost:3000/cy/bundles.html", { waitUntil: "load" });
    await expect(page.locator("#generatedPassesList .pass-select").first()).toBeVisible();
    const button = page.locator("#deleteSelectedPassesBtn");
    await expect(button).toHaveText("Dileu’r rhai a ddewiswyd");
    await page.locator("#generatedPassesList .pass-select").first().check();
    await expect(button).toHaveText("Dileu’r rhai a ddewiswyd (1)");
    await expect(page.locator("#generatedPassesList")).toContainText("Pob un o’r 1 tocyn");
    const card = page.locator("#generatedPassesList [data-pass-code]").first();
    await expect(card.locator('[data-figure="filed"] dt')).toHaveText("Wedi ffeilio");
    await expect(card.locator('[data-figure="last-used"] dd')).toHaveText("28 Hyd 2026");
    await expect(card.locator(".pass-terms li").nth(0)).toHaveText("Defnyddiwch ef o 1 Awst 2026 tan 1 Awst 2027");
    await expect(card.locator(".pass-terms li").nth(1)).toHaveText("Hyd at 25 defnydd, 1 i bob cyfrif");
    await expect(card.locator(".pass-copy-link")).toHaveText("Copïo’r ddolen");
    const cardLines = (await card.innerText()).split("\n").map((line) => line.trim());
    for (const english of ["Filed", "Uses", "Subscribers", "Last used", "Copy Link", "View QR", "Post", "Digital"])
      expect(cardLines).not.toContain(english);
    await page.locator("#generatedPassesList .pass-select").first().uncheck();
    await expect(button).toHaveText("Dileu’r rhai a ddewiswyd");
  });

  for (const [kind, name, receipt] of [
    ["accounts", ACCOUNTS_RECEIPT_NAME, ACCOUNTS_RECEIPT],
    ["Company Tax Return", CT_RECEIPT_NAME, CT_RECEIPT],
  ]) {
    test(`a past ${kind} filing: every filed line of the record reads in Welsh`, async ({ page }) => {
      await serveSite(page, { "/api/v1/hmrc/receipt/": receipt, "/api/v1/bundle": { bundles: [] } });
      await page.goto(`http://localhost:3000/cy/companies-house/filings.html?receipt=${encodeURIComponent(name)}`, { waitUntil: "load" });
      await expect(page.locator("#filingContent")).not.toBeEmpty();
      const text = await page.locator("#filingContent").innerText();
      expect(text).toMatch(/Ffeiliwyd \d/);
      expect(text).not.toMatch(/\bFiled\b/);
    });
  }

  for (const [result, welsh, english] of [
    ["canceled", "Cafodd y taliad ei ganslo. Gallwch roi cynnig arall arni pan fyddwch yn barod.", "Checkout was canceled"],
    ["success", "Mae’r tanysgrifiad yn weithredol! Mae eich Bundle wedi’i ychwanegu.", "Subscription activated"],
  ]) {
    test(`a ${result} checkout's status reads in Welsh`, async ({ page }) => {
      await serveSite(page, { "/api/v1/bundle": { bundles: [] } });
      await page.goto(`http://localhost:3000/cy/bundles.html?checkout=${result}`, { waitUntil: "load" });
      const status = page.locator("#statusMessagesContainer");
      await expect(status).toContainText(welsh);
      await expect(status).not.toContainText(english);
    });
  }

  test("the feedback button's sending, thanks and try-again states read in Welsh", async ({ page }) => {
    await serveSite(page, { "/api/v1/bundle": { bundles: [] } }, { "/api/v1/interest": 500 });
    await page.route("**/lib/feature-flags.js", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: 'window.featureFlags = { getFeature: async () => ({ enabled: true, message: "Neges" }) };',
      }),
    );
    await page.goto("http://localhost:3000/cy/bundles.html", { waitUntil: "load" });
    const join = page.locator("#feedbackEngagementBtn");
    await expect(join).toBeVisible();
    await join.click();
    await expect(join).toHaveText("Rhowch gynnig arall arni");
    await page.unroute("**/*");
    await serveSite(page, { "/api/v1/bundle": { bundles: [] } });
    await page.route("**/lib/feature-flags.js", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: 'window.featureFlags = { getFeature: async () => ({ enabled: true, message: "Neges" }) };',
      }),
    );
    await join.click();
    await expect(join).toHaveText("Diolch! Byddwn mewn cysylltiad cyn bo hir.");
  });

  test("a held subscription's info line and Manage button read in Welsh", async ({ page }) => {
    await serveSite(page, {
      "/api/v1/bundle": {
        bundles: [
          {
            bundleId: "resident-vat",
            allocated: true,
            tokensGranted: 100,
            tokensRemaining: 90,
            tokenResetAt: "2026-12-01T00:00:00.000Z",
            stripeSubscriptionId: "sub_1",
          },
        ],
      },
    });
    await page.goto("http://localhost:3000/cy/bundles.html", { waitUntil: "load" });
    const current = page.locator("#currentBundles");
    await expect(current).toContainText("100 credyd wedi’u dyrannu · 90 ar ôl · yn adnewyddu 1 Rhagfyr 2026");
    await expect(current.locator("[data-manage-subscription]")).toHaveText("Rheoli’r tanysgrifiad");
    await expect(current).toContainText("O’ch cynllun neu’ch tocynnau");
    for (const english of ["tokens allocated", "remaining", "refreshes", "Manage Subscription", "From your plan"]) {
      await expect(current).not.toContainText(english);
    }
  });
});
