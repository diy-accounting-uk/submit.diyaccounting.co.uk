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

async function serveRealSite(page, onApiRequest = () => {}, missingScripts = []) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      onApiRequest(route.request());
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }
    if (missingScripts.some((script) => url.pathname.endsWith(`/${script}`))) {
      await route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" });
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

// The bundle read that decides the HMRC account (developer-mode.js) answers after 2 seconds, and the
// page's own bundle reads (through the API client, which marks them) after 100 ms, so a page that
// builds on its own read before the decision is seen doing so.
const decidingReadAnswersLast = (request) => (request.headers()["x-initial-request"] ? 100 : 2000);

// The environment and the bundle read answer after the page's own scripts have run, as on a
// deployed site, so a page that decides before those answers is seen deciding.
const answerLate = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

// storedAccount is what sessionStorage holds when the page opens: by default the account the bundles
// choose, as after a page that has read them; null for a new tab. A bundleAnswerMs of null is a bundle
// read that never answers; a function gives the time for each read from its request. bundlesSynthetic says, as each
// bundle read is sent, whether the bundles are synthetic; bundleStatus gives each read's HTTP status.
// query is the page's query string. onApiRequest is called with each request to another /api route.
// missingScripts names the site scripts that fail to load.
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
    tokensRemaining,
    bundleStatus = () => 200,
    query = "",
    onApiRequest,
    missingScripts,
  },
) {
  await serveRealSite(page, onApiRequest, missingScripts);
  await serveSubmitEnv(page, hmrcBaseUri);
  await page.route("**/api/v1/bundle", async (route) => {
    const answerMs = typeof bundleAnswerMs === "function" ? bundleAnswerMs(route.request()) : bundleAnswerMs;
    if (answerMs === null) return;
    const tokens = tokensRemaining === undefined ? {} : { allocated: true, tokensGranted: tokensRemaining, tokensRemaining };
    const bundles = bundlesSynthetic() ? [{ bundleId: "day-guest", qualifiers: { synthetic: true }, ...tokens }] : [];
    const status = bundleStatus();
    await answerLate(answerMs);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(status === 200 ? { bundles, ...(tokensRemaining === undefined ? {} : { tokensRemaining }) } : {}),
    });
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
  await page.goto(`http://localhost:3000/${welsh ? "cy/" : ""}hmrc/vat/${pageName}${query}`, { waitUntil: "domcontentloaded" });
}

const VAT_PAGES = [
  "submitVat.html",
  "vatObligations.html",
  "vatLiabilities.html",
  "vatPayments.html",
  "vatPenalties.html",
  "viewVatReturn.html",
];

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
    await openVatPage(page, "submitVat.html", { synthetic: true, storedAccount: null, bundleAnswerMs: decidingReadAnswersLast });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
    await expect(page.locator("#syntheticIndicator")).toBeVisible();
    expect(await page.evaluate(() => [...window.__shownStatuses])).toEqual(["sandbox"]);
  });

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
    await openVatPage(page, "submitVat.html", { synthetic: false, storedAccount: "synthetic", bundleAnswerMs: decidingReadAnswersLast });
    await expect(page.locator("p.hint[data-feature-status]").first()).toBeVisible();
    await expect(page.locator("#syntheticObligationsOption")).toBeHidden();
    expect(await page.evaluate(() => window.__optionShown)).toBe(false);
  });

  test("turning developer options on while the bundles are read again never shows the option for the account that is going", async ({
    page,
  }) => {
    let bundlesAreSynthetic = true;
    let answerMs = 300;
    let bundleReads = 0;
    await openVatPage(page, "submitVat.html", {
      synthetic: true,
      bundlesSynthetic: () => bundlesAreSynthetic,
      bundleAnswerMs: () => {
        bundleReads += 1;
        return answerMs;
      },
    });
    await expect(page.locator("p.hint[data-feature-status]").first()).toHaveAttribute("data-feature-status", "sandbox");
    await expect(page.locator("#syntheticObligationsOption")).toBeHidden();

    const readsBefore = bundleReads;
    bundlesAreSynthetic = false;
    answerMs = 1500;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("bundle-changed")));
    await expect.poll(() => bundleReads).toBeGreaterThan(readsBefore);
    await page.evaluate(() => {
      window.__optionShown = false;
      const watch = () => {
        if (document.getElementById("syntheticObligationsOption").style.display === "flex") window.__optionShown = true;
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
      sessionStorage.setItem("showDeveloperOptions", "true");
      window.dispatchEvent(new CustomEvent("developer-mode-changed", { detail: { enabled: true } }));
    });
    await expect(page.locator("p.hint[data-feature-status]").first()).toHaveAttribute("data-feature-status", "production");
    await page.waitForTimeout(500);
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

test.describe("The synthetic indicator and the test data link follow the decided account", () => {
  for (const pageName of VAT_PAGES) {
    test(`${pageName} takes them away when the account changes to live and shows them when it changes to synthetic`, async ({ page }) => {
      let bundlesAreSynthetic = true;
      await openVatPage(page, pageName, { synthetic: true, bundlesSynthetic: () => bundlesAreSynthetic });
      const banner = page.locator("p.hint[data-feature-status]").first();
      const marks = page.locator("#syntheticIndicator, #testDataLink");
      await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
      await expect(page.locator("#syntheticIndicator")).toBeVisible();
      await expect(marks).toHaveCount(2);
      for (const mark of await marks.all()) await expect(mark).toHaveClass(/visible/);

      bundlesAreSynthetic = false;
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("bundle-changed")));
      await expect(banner).toHaveAttribute("data-feature-status", "production");
      await expect(page.locator("#syntheticIndicator")).toBeHidden();
      for (const mark of await marks.all()) await expect(mark).not.toHaveClass(/visible/);

      bundlesAreSynthetic = true;
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("bundle-changed")));
      await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
      await expect(page.locator("#syntheticIndicator")).toBeVisible();
      for (const mark of await marks.all()) await expect(mark).toHaveClass(/visible/);
    });
  }
});

// A tab that holds an HMRC grant and opens a page on a period, so the page has a request to send.
const PERIOD_QUERY = "?vrn=176540158&periodStart=2026-01-01&periodEnd=2026-03-31";
async function holdHmrcGrant(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("hmrcGrantId", "grant-123");
    sessionStorage.setItem("hmrcTokenScope", "write:vat read:vat");
  });
}
const hmrcRequestsOf = (requests) => requests.filter((request) => new URL(request.url()).pathname.startsWith("/api/v1/hmrc/"));

test.describe("An account the bundle read has not decided", () => {
  for (const pageName of VAT_PAGES) {
    test(`${pageName} says the account is not decided and sends nothing when the bundle read never answers`, async ({ page }) => {
      const requests = [];
      await holdHmrcGrant(page);
      await openVatPage(page, pageName, {
        synthetic: false,
        storedAccount: "synthetic",
        bundleAnswerMs: null,
        query: PERIOD_QUERY,
        onApiRequest: (request) => requests.push(request),
      });
      const banner = page.locator("p.hint[data-feature-status]").first();
      await expect(banner).toBeVisible({ timeout: 20_000 });
      await expect(banner).toHaveAttribute("data-feature-status", "undecided");
      await expect(banner).toHaveAttribute("role", "status");
      await expect(banner).toContainText("Status: checking your account.");
      await expect(banner).toContainText("Nothing is sent to HMRC");
      await expect(page.locator("#syntheticIndicator")).toBeHidden();
      await page.waitForTimeout(1000);
      expect(hmrcRequestsOf(requests)).toHaveLength(0);
    });
  }

  for (const synthetic of [true, false]) {
    test(`the view return page sends its request for the ${synthetic ? "synthetic" : "live"} account once a failed bundle read answers`, async ({
      page,
    }) => {
      const requests = [];
      let bundleStatus = 500;
      await holdHmrcGrant(page);
      await openVatPage(page, "viewVatReturn.html", {
        synthetic,
        storedAccount: synthetic ? null : "synthetic",
        bundleStatus: () => bundleStatus,
        query: PERIOD_QUERY,
        onApiRequest: (request) => requests.push(request),
      });
      const banner = page.locator("p.hint[data-feature-status]").first();
      await expect(banner).toHaveAttribute("data-feature-status", "undecided");
      await expect(banner).toBeVisible();
      await page.waitForTimeout(1000);
      expect(hmrcRequestsOf(requests)).toHaveLength(0);

      bundleStatus = 200;
      await expect(banner).toHaveAttribute("data-feature-status", synthetic ? "sandbox" : "production", { timeout: 15_000 });
      await expect.poll(() => hmrcRequestsOf(requests).length).toBeGreaterThan(0);
      for (const request of hmrcRequestsOf(requests)) {
        expect(request.headers()["hmrcaccount"]).toBe(synthetic ? "synthetic" : undefined);
      }
      expect(await page.evaluate(() => [...window.__shownStatuses])).toEqual(["undecided", synthetic ? "sandbox" : "production"]);
    });
  }

  test("a bundle read the server refuses sends the reader to sign in, with no HMRC request and no synthetic account", async ({ page }) => {
    const requests = [];
    await holdHmrcGrant(page);
    await openVatPage(page, "viewVatReturn.html", {
      synthetic: false,
      storedAccount: "synthetic",
      bundleStatus: () => 401,
      query: PERIOD_QUERY,
      onApiRequest: (request) => requests.push(request),
    });
    await page.waitForURL("**/auth/login.html**");
    expect(hmrcRequestsOf(requests)).toHaveLength(0);
  });

  for (const pageName of VAT_PAGES) {
    test(`${pageName} says the account is not decided and sends nothing when developer-mode.js does not load`, async ({ page }) => {
      const requests = [];
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await holdHmrcGrant(page);
      await openVatPage(page, pageName, {
        synthetic: true,
        query: PERIOD_QUERY,
        missingScripts: ["developer-mode.js"],
        onApiRequest: (request) => requests.push(request),
      });
      const banner = page.locator("p.hint[data-feature-status]").first();
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute("data-feature-status", "undecided");
      await expect(banner).toContainText("Nothing is sent to HMRC");
      const form = page.locator("form").first();
      await form.evaluate((element) => element.requestSubmit());
      await page.waitForTimeout(1500);
      expect(hmrcRequestsOf(requests)).toHaveLength(0);
      expect(pageErrors).toEqual([]);
    });
  }

  test("the Welsh obligations page says in Welsh that the account is not decided", async ({ page }) => {
    await openVatPage(page, "vatObligations.html", { synthetic: false, welsh: true, bundleStatus: () => 500 });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "undecided");
    await expect(banner).toContainText("Statws: wrthi’n gwirio’ch cyfrif.");
    await expect(banner).toContainText("Nid oes dim yn cael ei anfon at CThEF");
  });
});

test.describe("The submit page while the account is decided", () => {
  test("a VRN typed before the account is decided loads its obligations once it is", async ({ page }) => {
    const requests = [];
    await holdHmrcGrant(page);
    await openVatPage(page, "submitVat.html", {
      synthetic: false,
      bundleAnswerMs: 3000,
      onApiRequest: (request) => requests.push(request),
    });
    await page.locator("#vatNumber").fill("176540158");
    expect(hmrcRequestsOf(requests)).toHaveLength(0);
    await expect(page.locator("p.hint[data-feature-status]").first()).toBeVisible();
    await expect
      .poll(() => hmrcRequestsOf(requests).map((request) => new URL(request.url()).searchParams.get("vrn")))
      .toContain("176540158");
    await expect(page.locator("#connectHmrcBtn")).toBeHidden();
  });
});

test.describe("The bundle read's time limit in a browser without AbortSignal.timeout", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      delete AbortSignal.timeout;
    });
  });

  test("a synthetic account reads sandbox", async ({ page }) => {
    await openVatPage(page, "vatObligations.html", { synthetic: true, storedAccount: null });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
    expect(await page.evaluate(() => window.readHmrcAccount())).toBe("synthetic");
  });

  test("a bundle read that never answers ends at the time limit", async ({ page }) => {
    await openVatPage(page, "vatObligations.html", { synthetic: false, storedAccount: "synthetic", bundleAnswerMs: null });
    const started = Date.now();
    await expect(page.locator("p.hint[data-feature-status]").first()).toHaveAttribute("data-feature-status", "undecided", {
      timeout: 20_000,
    });
    expect(Date.now() - started).toBeGreaterThan(6000);
  });
});

test.describe("A decision still under way holds the account and the status line", () => {
  test("the account read while the bundles are read again is the account that read decides", async ({ page }) => {
    let bundlesAreSynthetic = true;
    let answerMs = 300;
    await openVatPage(page, "vatObligations.html", {
      synthetic: true,
      bundlesSynthetic: () => bundlesAreSynthetic,
      bundleAnswerMs: () => answerMs,
    });
    await expect(page.locator("p.hint[data-feature-status]").first()).toHaveAttribute("data-feature-status", "sandbox");

    bundlesAreSynthetic = false;
    answerMs = 1500;
    const account = await page.evaluate(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "cognitoIdToken" }));
      return window.readHmrcAccount();
    });
    expect(account).toBeNull();
  });

  test("the decision started last stands when an earlier bundle read answers after it", async ({ page }) => {
    let bundlesAreSynthetic = false;
    let answerMs = 300;
    let bundleReads = 0;
    await openVatPage(page, "vatObligations.html", {
      synthetic: false,
      bundlesSynthetic: () => bundlesAreSynthetic,
      bundleAnswerMs: () => {
        bundleReads += 1;
        return answerMs;
      },
    });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "production");

    const readsBefore = bundleReads;
    bundlesAreSynthetic = true;
    answerMs = 1500;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("bundle-changed")));
    await expect.poll(() => bundleReads).toBeGreaterThan(readsBefore);
    bundlesAreSynthetic = false;
    answerMs = 100;
    const account = await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("bundle-changed"));
      return window.readHmrcAccount();
    });
    expect(account).toBeNull();
    await page.waitForTimeout(2000);
    expect(await page.evaluate(() => sessionStorage.getItem("hmrcAccount"))).toBeNull();
    await expect(banner).toHaveAttribute("data-feature-status", "production");
    expect(await page.evaluate(() => [...window.__shownStatuses])).toEqual(["production"]);
  });

  test("a synthetic account sees only the sandbox status while a second bundle read is still under way", async ({ page }) => {
    let answerMs = 300;
    let bundleReads = 0;
    await openVatPage(page, "vatObligations.html", {
      synthetic: true,
      bundleAnswerMs: () => {
        bundleReads += 1;
        return answerMs;
      },
    });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "sandbox");

    const readsBefore = bundleReads;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("bundle-changed")));
    await expect.poll(() => bundleReads).toBeGreaterThan(readsBefore);
    answerMs = 1500;
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("bundle-changed"));
      return window.readHmrcAccount();
    });
    await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
    expect(await page.evaluate(() => [...window.__shownStatuses])).toEqual(["sandbox"]);
  });
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

test.describe("The VAT return page at phone width", () => {
  async function openAtPhoneWidth(page, { synthetic }) {
    await page.addInitScript(() =>
      localStorage.setItem("userInfo", JSON.stringify({ sub: "user1", email: "helen@morgantechnical.example" })),
    );
    await openVatPage(page, "submitVat.html", { synthetic, tokensRemaining: 3 });
    await page.setViewportSize({ width: 390, height: 844 });
  }

  test("the hint under a box's name is lighter than the name", async ({ page }) => {
    await openAtPhoneWidth(page, { synthetic: false });
    const weight = (locator) => locator.evaluate((element) => Number(getComputedStyle(element).fontWeight));
    const name = page.locator('label[for="vatDueSales"]');
    await expect(name).toBeVisible();
    expect(await weight(name)).toBeGreaterThanOrEqual(600);
    expect(await weight(page.locator("#vatDueSales-hint"))).toBeLessThan(500);
  });

  test("beside a synthetic account's wrench the header shows no cut icon and the whole Sign out button", async ({ page }) => {
    await openAtPhoneWidth(page, { synthetic: true });
    await expect(page.locator(".developer-mode-toggle")).toBeVisible();
    await expect(page.locator(".token-balance")).toContainText("3 tokens");
    const signOut = page.locator("a.login-link");
    await expect(signOut).toBeVisible();
    const status = page.locator(".login-status");
    if (await status.isVisible()) {
      const [box, iconBox] = [await status.boundingBox(), await status.locator(".login-person").boundingBox()];
      expect(iconBox.x + iconBox.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
    }
    const [nav, button] = [await page.locator(".header-nav").boundingBox(), await signOut.boundingBox()];
    expect(button.x + button.width).toBeLessThanOrEqual(nav.x + nav.width + 0.5);
  });

  test("a live account's header keeps the signed-in person icon", async ({ page }) => {
    await openAtPhoneWidth(page, { synthetic: false });
    await expect(page.locator(".login-status .login-person")).toBeVisible();
  });
});
