// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/submitVatStatus.browser.test.js
//
// Each VAT page shows one status, from the HMRC service its calls go to: sandbox for a synthetic
// account or when HMRC_BASE_URI is HMRC's test API, production only for the live API. The submit page
// and the read pages agree.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const LIVE_API = "https://api.service.hmrc.gov.uk";
const TEST_API = "https://test-api.service.hmrc.gov.uk";

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

async function serveRealSite(page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
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
}

// The committed submit.env with HMRC_BASE_URI set to the given service, as each environment's deploy writes it.
async function serveSubmitEnv(page, hmrcBaseUri) {
  const committed = fs.readFileSync(path.join(PUBLIC_ROOT, "submit.env"), "utf-8");
  const body = committed.replace(/^HMRC_BASE_URI=.*$/m, `HMRC_BASE_URI=${hmrcBaseUri}`);
  await page.route("**/submit.env", async (route) => {
    await answerLate();
    await route.fulfill({ status: 200, contentType: "text/plain", body });
  });
}

// The environment and the bundle read answer after the page's own scripts have run, as on a
// deployed site, so a page that decides before those answers is seen deciding.
const answerLate = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

// storedAccount is what sessionStorage holds when the page opens: by default the account the bundles
// choose, as after a page that has read them; null for a new tab. A bundleAnswerMs of null is a bundle
// read that never answers. bundlesSynthetic says, at each bundle read, whether the bundles are synthetic.
async function openVatPage(
  page,
  pageName,
  {
    synthetic,
    hmrcBaseUri = LIVE_API,
    welsh = false,
    storedAccount = synthetic ? "synthetic" : null,
    bundleAnswerMs = 300,
    bundlesSynthetic = () => synthetic,
  },
) {
  await serveRealSite(page);
  await serveSubmitEnv(page, hmrcBaseUri);
  await page.route("**/api/v1/bundle", async (route) => {
    if (bundleAnswerMs === null) return;
    await answerLate(bundleAnswerMs);
    const bundles = bundlesSynthetic() ? [{ bundleId: "day-guest", qualifiers: { synthetic: true } }] : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles }) });
  });
  await page.addInitScript((account) => {
    localStorage.setItem("cognitoIdToken", "test-id-token");
    if (account) sessionStorage.setItem("hmrcAccount", account);
    // Every status the reader can see, frame by frame.
    window.__shownStatuses = new Set();
    const watch = () => {
      const banner = document.querySelector("p.hint[data-feature-status]");
      if (banner && !banner.hidden) window.__shownStatuses.add(banner.getAttribute("data-feature-status"));
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }, storedAccount);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://localhost:3000/${welsh ? "cy/" : ""}hmrc/vat/${pageName}`, { waitUntil: "domcontentloaded" });
}

test.describe("Submit VAT status", () => {
  test("a live account reads production", async ({ page }) => {
    await openVatPage(page, "submitVat.html", { synthetic: false });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "production");
    await expect(banner).toContainText("Status: production.");
    await expect(page.locator("#syntheticIndicator")).toBeHidden();
  });

  test("a synthetic account reads sandbox and never production", async ({ page }) => {
    await openVatPage(page, "submitVat.html", { synthetic: true });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
    await expect(banner).toContainText("Status: sandbox.");
    await expect(banner).not.toContainText("production");
    await expect(page.locator("#syntheticIndicator")).toBeVisible();
  });
});

test.describe("The status waits for the bundle read that chooses the HMRC account", () => {
  for (const pageName of ["submitVat.html", "vatObligations.html"]) {
    test(`cancelling a request on ${pageName} keeps the HMRC account the bundles chose`, async ({ page }) => {
      await openVatPage(page, pageName, { synthetic: true });
      await expect(page.locator("p.hint[data-feature-status]").first()).toBeVisible();
      await page.evaluate(() => cancelRequest());
      expect(await page.evaluate(() => sessionStorage.getItem("hmrcAccount"))).toBe("synthetic");
    });
  }

  test("a synthetic account opening the submit page in a new tab sees only the sandbox status, with the synthetic indicator", async ({
    page,
  }) => {
    await openVatPage(page, "submitVat.html", { synthetic: true, storedAccount: null, bundleAnswerMs: 2000 });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
    await expect(page.locator("#syntheticIndicator")).toBeVisible();
    expect(await page.evaluate(() => [...window.__shownStatuses])).toEqual(["sandbox"]);
  });

  for (const pageName of [
    "submitVat.html",
    "vatObligations.html",
    "viewVatReturn.html",
    "vatLiabilities.html",
    "vatPayments.html",
    "vatPenalties.html",
  ]) {
    test(`${pageName} shows its status and uses the live account when the bundle read never answers`, async ({ page }) => {
      await openVatPage(page, pageName, { synthetic: false, storedAccount: "synthetic", bundleAnswerMs: null });
      const banner = page.locator("p.hint[data-feature-status]").first();
      await expect(banner).toBeVisible({ timeout: 20_000 });
      await expect(banner).toHaveAttribute("data-feature-status", "production");
      expect(await page.evaluate(() => window.readHmrcAccount())).toBeNull();
    });
  }

  test("a live account whose tab still holds a synthetic account from before sees only the production status on the obligations page", async ({
    page,
  }) => {
    await openVatPage(page, "vatObligations.html", { synthetic: false, storedAccount: "synthetic", bundleAnswerMs: 2000 });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-feature-status", "production");
    await expect(page.locator("#syntheticIndicator")).toBeHidden();
    expect(await page.evaluate(() => [...window.__shownStatuses])).toEqual(["production"]);
  });
});

const VAT_PAGES = [
  "submitVat.html",
  "vatObligations.html",
  "vatLiabilities.html",
  "vatPayments.html",
  "vatPenalties.html",
  "viewVatReturn.html",
];

async function statusOf(page, pageName, synthetic) {
  await openVatPage(page, pageName, { synthetic });
  const banner = page.locator("p.hint[data-feature-status]").first();
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Status: ");
  return banner.getAttribute("data-feature-status");
}

test.describe("VAT pages agree on the status", () => {
  for (const pageName of VAT_PAGES) {
    test(`${pageName} reads sandbox for a synthetic account`, async ({ page }) => {
      await openVatPage(page, pageName, { synthetic: true });
      const banner = page.locator("p.hint[data-feature-status]").first();
      await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
      await expect(banner).toContainText("Status: sandbox.");
      await expect(banner).not.toContainText("production");
    });
  }

  for (const synthetic of [false, true]) {
    test(`the obligations page shows the submit page's status for a ${synthetic ? "synthetic" : "live"} account`, async ({ page }) => {
      const submitStatus = await statusOf(page, "submitVat.html", synthetic);
      const obligationsStatus = await statusOf(page, "vatObligations.html", synthetic);
      expect(obligationsStatus).toBe(submitStatus);
      expect(obligationsStatus).toBe(synthetic ? "sandbox" : "production");
    });
  }
});

test.describe("The synthetic obligations option follows the decided account", () => {
  test("a live account whose tab still holds a synthetic account never sees the synthetic obligations option", async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem("showDeveloperOptions", "true");
      window.__optionShown = false;
      const watch = () => {
        const option = document.getElementById("syntheticObligationsOption");
        if (option && option.style.display === "flex") window.__optionShown = true;
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    });
    await openVatPage(page, "submitVat.html", { synthetic: false, storedAccount: "synthetic", bundleAnswerMs: 2000 });
    await expect(page.locator("p.hint[data-feature-status]").first()).toBeVisible();
    await expect(page.locator("#syntheticObligationsOption")).toBeHidden();
    expect(await page.evaluate(() => window.__optionShown)).toBe(false);
  });

  test("a synthetic account with developer options on sees the synthetic obligations option once the account is decided", async ({
    page,
  }) => {
    await page.addInitScript(() => sessionStorage.setItem("showDeveloperOptions", "true"));
    await openVatPage(page, "submitVat.html", { synthetic: true, storedAccount: null, bundleAnswerMs: 2000 });
    await expect(page.locator("#syntheticObligationsOption")).toBeVisible();
  });
});

test.describe("A second decision of the HMRC account draws the status line again", () => {
  for (const pageName of ["submitVat.html", "vatObligations.html"]) {
    test(`${pageName} shows sandbox once the bundles change to a synthetic account, and production once they change back`, async ({
      page,
    }) => {
      let bundlesAreSynthetic = false;
      await openVatPage(page, pageName, { synthetic: false, bundlesSynthetic: () => bundlesAreSynthetic });
      const banner = page.locator("p.hint[data-feature-status]").first();
      await expect(banner).toHaveAttribute("data-feature-status", "production");
      const productionText = await banner.textContent();

      bundlesAreSynthetic = true;
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("bundle-changed")));
      await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
      await expect(banner).toContainText("Status: sandbox.");

      bundlesAreSynthetic = false;
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("bundle-changed")));
      await expect(banner).toHaveAttribute("data-feature-status", "production");
      expect(await banner.textContent()).toBe(productionText);
    });
  }
});

test.describe("The status line is announced when it appears", () => {
  for (const welsh of [false, true]) {
    for (const pageName of VAT_PAGES) {
      test(`${welsh ? "the Welsh " : ""}${pageName} gives its status line the status role, before and after the sandbox swap`, async ({
        page,
      }) => {
        await openVatPage(page, pageName, { synthetic: true, welsh });
        const banner = page
          .getByRole("status")
          .filter({ has: page.locator("strong") })
          .first();
        await expect(banner).toBeVisible();
        await expect(page.locator("p.hint[data-feature-status]").first()).toHaveAttribute("role", "status");
        await expect(page.locator("p.hint[data-feature-status]").first()).toHaveAttribute("data-feature-status", "sandbox");
      });
    }
  }
});

test.describe("The status follows the HMRC service the page calls", () => {
  for (const pageName of VAT_PAGES) {
    test(`${pageName} reads sandbox on a test-API base with no test bundle`, async ({ page }) => {
      await openVatPage(page, pageName, { synthetic: false, hmrcBaseUri: TEST_API });
      const banner = page.locator("p.hint[data-feature-status]").first();
      await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
      await expect(banner).toContainText("Status: sandbox.");
      await expect(banner).not.toContainText("real records at HMRC");
      await expect(page.locator("#syntheticIndicator")).toBeHidden();
    });
  }

  test("the obligations page reads production on the live-API base with no test bundle", async ({ page }) => {
    await openVatPage(page, "vatObligations.html", { synthetic: false, hmrcBaseUri: LIVE_API });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toContainText("Status: production.");
    await expect(banner).toHaveAttribute("data-feature-status", "production");
  });

  test("a test bundle reads sandbox on the live-API base", async ({ page }) => {
    await openVatPage(page, "vatObligations.html", { synthetic: true, hmrcBaseUri: LIVE_API });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
    await expect(banner).toContainText("Status: sandbox.");
  });

  test("the Welsh obligations page reads the Welsh sandbox line on a test-API base with no test bundle", async ({ page }) => {
    await openVatPage(page, "vatObligations.html", { synthetic: false, hmrcBaseUri: TEST_API, welsh: true });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
    await expect(banner).toContainText("Statws: amgylchedd prawf (sandbox).");
    await expect(banner).toContainText("Mae hyn yn darllen gwasanaeth prawf CThEF");
  });
});
