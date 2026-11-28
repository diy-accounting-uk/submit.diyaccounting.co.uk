// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/itsaHmrcAccount.browser.test.js
//
// The Income Tax pages use the HMRC account the signed-in user's bundles choose. sessionStorage can
// hold another tab's account until the bundle read answers, so a page waits for that read before it
// shows the synthetic indicator, names the account on a request or starts the HMRC sign-in, and no
// page removes the account on a cancel or a failed request.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const LIVE_HOST = "api.service.hmrc.gov.uk";
const SANDBOX_HOST = "test-api.service.hmrc.gov.uk";

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

// The pages that hold a request while the reader signs in to HMRC, by the form that sends it and the
// sessionStorage key that holds it.
const REQUEST_PAGES = [
  { page: "businessDetails.html", form: "itsaBusinessDetailsForm", pendingKey: "pendingBusinessDetailsRequest" },
  { page: "obligations.html", form: "itsaObligationsForm", pendingKey: "pendingObligationsRequest" },
  { page: "selfEmploymentPeriod.html", form: "itsaSelfEmploymentPeriodForm", pendingKey: "pendingSelfEmploymentPeriodRequest" },
  {
    page: "selfEmploymentPeriodAmend.html",
    form: "itsaSelfEmploymentPeriodAmendForm",
    pendingKey: "pendingSelfEmploymentPeriodAmendRequest",
  },
  { page: "selfEmploymentPeriodView.html", form: "itsaSelfEmploymentPeriodViewForm", pendingKey: "pendingSelfEmploymentPeriodViewRequest" },
  { page: "selfEmploymentPeriods.html", form: "itsaSelfEmploymentPeriodsForm", pendingKey: "pendingSelfEmploymentPeriodsRequest" },
  { page: "ukPropertyPeriod.html", form: "itsaUkPropertyPeriodForm", pendingKey: "pendingUkPropertyPeriodRequest" },
  { page: "ukPropertyPeriodAmend.html", form: "itsaUkPropertyPeriodAmendForm", pendingKey: "pendingUkPropertyPeriodAmendRequest" },
  { page: "ukPropertyPeriodView.html", form: "itsaUkPropertyPeriodViewForm", pendingKey: "pendingUkPropertyPeriodViewRequest" },
  { page: "ukPropertyPeriods.html", form: "itsaUkPropertyPeriodsForm", pendingKey: "pendingUkPropertyPeriodsRequest" },
];

const PENDING_REQUEST = {
  nino: "AA123456A",
  businessId: "XAIS12345678901",
  taxYear: "2025-26",
  periodId: "2025-04-06_2025-07-05",
  submissionId: "4557ecb5-fd32-48cc-81f5-e6acd1099f3c",
};

// The bundle read answers after the page's own scripts have run, as on a deployed site, so a page
// that reads the account before that answer is seen reading the stale one.
const answerLate = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// storedAccount is what sessionStorage holds when the page opens: null for a new tab. A
// bundleAnswerMs of null is a bundle read that never answers. hmrcAnswer is the status every HMRC
// call answers with. pending is a request held from before an HMRC sign-in, which the page resumes.
// hmrcHost is the HMRC service a live account's calls go to: the live API, or the test API as on ci.
// setSyntheticBundle changes what the bundle read answers, so a test can change the bundles and
// dispatch bundle-changed.
async function openItsaPage(
  page,
  pageName,
  {
    synthetic,
    storedAccount = synthetic ? "synthetic" : null,
    bundleAnswerMs = 1500,
    hmrcAnswer = 500,
    pending = null,
    hmrcHost = LIVE_HOST,
    welsh = false,
  },
) {
  const seen = { hmrcCalls: [], signIns: [] };
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === LIVE_HOST || url.hostname === SANDBOX_HOST) {
      seen.signIns.push(url.hostname);
      await route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>HMRC</body></html>" });
      return;
    }
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname === "/submit.env") {
      const committed = fs.readFileSync(path.join(PUBLIC_ROOT, "submit.env"), "utf-8");
      const body = committed
        .replace(/^HMRC_BASE_URI=.*$/m, `HMRC_BASE_URI=https://${hmrcHost}`)
        .replace(/^HMRC_SANDBOX_BASE_URI=.*$/m, `HMRC_SANDBOX_BASE_URI=https://${SANDBOX_HOST}`);
      await route.fulfill({ status: 200, contentType: "text/plain", body });
      return;
    }
    if (url.pathname === "/api/v1/bundle") {
      if (bundleAnswerMs === null) return;
      await answerLate(bundleAnswerMs);
      const heldIncomeTaxPass = { bundleId: "resident-pro", allocated: true };
      const bundles = syntheticBundle
        ? [{ bundleId: "day-guest", qualifiers: { synthetic: true } }, heldIncomeTaxPass]
        : [heldIncomeTaxPass];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bundles }) });
      return;
    }
    if (url.pathname.startsWith("/api/v1/hmrc/itsa/")) {
      seen.hmrcCalls.push(request.headers()["hmrcaccount"] ?? null);
      await route.fulfill({
        status: hmrcAnswer,
        contentType: "application/json",
        body: JSON.stringify({ message: "HMRC is unavailable" }),
      });
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
  let syntheticBundle = synthetic;
  await page.exposeFunction("setSyntheticBundle", (value) => {
    syntheticBundle = value;
  });
  await page.addInitScript(
    ({ account, held }) => {
      if (sessionStorage.getItem("itsaHmrcAccountTestOpened")) return;
      sessionStorage.setItem("itsaHmrcAccountTestOpened", "true");
      localStorage.setItem("cognitoIdToken", "test-id-token");
      if (account) sessionStorage.setItem("hmrcAccount", account);
      if (held) {
        sessionStorage.setItem("hmrcGrantId", "test-grant");
        sessionStorage.setItem(held.key, JSON.stringify(held.request));
      }
    },
    { account: storedAccount, held: pending },
  );
  await page.addInitScript(() => {
    // Every status the reader can see, frame by frame.
    window.__shownStatuses = new Set();
    const watch = () => {
      const banner = document.querySelector("p.hint[data-feature-status]");
      if (banner && !banner.hidden) window.__shownStatuses.add(banner.getAttribute("data-feature-status"));
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://localhost:3000/${welsh ? "cy/" : ""}hmrc/itsa/${pageName}`, { waitUntil: "domcontentloaded" });
  return seen;
}

// Sends the page's form, or presses its button, with no HMRC grant held, so the page starts the HMRC sign-in.
async function startSignIn(page, formId, buttonId, request = PENDING_REQUEST) {
  await page.waitForFunction(() => window.formErrors && window.authUrlBuilder && window.hmrcScopeCheck);
  await page.evaluate(
    ({ formId, buttonId, request }) => {
      window.formErrors.requireFields = () => true;
      const form = document.getElementById(formId);
      for (const [name, value] of Object.entries(request)) {
        const field = form.querySelector(`[name="${name}"], #${name}`);
        if (!field) continue;
        if (field.tagName === "SELECT" && ![...field.options].some((option) => option.value === value)) field.add(new Option(value, value));
        field.value = value;
      }
      if (buttonId) document.getElementById(buttonId).click();
      else form.requestSubmit();
    },
    { formId, buttonId, request },
  );
}

function bundleReadSettled(page) {
  return page.evaluate(() => window.readHmrcAccount());
}

test.describe("An Income Tax page holding a request uses the HMRC account the bundles chose", () => {
  for (const { page: pageName, form, pendingKey } of REQUEST_PAGES) {
    test(`a synthetic account opening ${pageName} in a new tab sees the synthetic indicator`, async ({ page }) => {
      await openItsaPage(page, pageName, { synthetic: true, storedAccount: null });
      await expect(page.locator("#syntheticIndicator")).toBeVisible();
    });

    test(`a live account whose tab holds a synthetic account signs in to live HMRC from ${pageName}`, async ({ page }) => {
      const seen = await openItsaPage(page, pageName, { synthetic: false, storedAccount: "synthetic" });
      await startSignIn(page, form);
      await expect.poll(() => seen.signIns, { timeout: 10_000 }).toEqual([LIVE_HOST]);
      await expect(page.locator("#syntheticIndicator")).toBeHidden();
    });

    test(`cancelling a request on ${pageName} keeps the HMRC account the bundles chose`, async ({ page }) => {
      await openItsaPage(page, pageName, { synthetic: true });
      expect(await bundleReadSettled(page)).toBe("synthetic");
      await page.evaluate(() => cancelRequest());
      expect(await page.evaluate(() => sessionStorage.getItem("hmrcAccount"))).toBe("synthetic");
    });

    test(`a failed request on ${pageName} names the synthetic account and keeps it`, async ({ page }) => {
      const seen = await openItsaPage(page, pageName, {
        synthetic: true,
        storedAccount: null,
        pending: { key: pendingKey, request: PENDING_REQUEST },
      });
      await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), pendingKey), { timeout: 10_000 }).toBeNull();
      expect(seen.hmrcCalls).toEqual(["synthetic"]);
      expect(await page.evaluate(() => sessionStorage.getItem("hmrcAccount"))).toBe("synthetic");
    });

    test(`${pageName} says the account is not decided and signs in nowhere when the bundle read never answers`, async ({ page }) => {
      const seen = await openItsaPage(page, pageName, { synthetic: false, storedAccount: "synthetic", bundleAnswerMs: null });
      await startSignIn(page, form);
      const banner = page.locator("p.hint[data-feature-status]").first();
      await expect(banner).toContainText("Status: checking your account.", { timeout: 20_000 });
      await page.waitForTimeout(1000);
      expect(seen.signIns).toEqual([]);
    });
  }
});

// The foreign property period pages, by the form that sends their request (or the button that loads
// one), the sessionStorage key that holds it while the reader signs in to HMRC, and the request held.
const FOREIGN_PROPERTY_PAGES = [
  {
    page: "foreignPropertyPeriod.html",
    form: "itsaForeignPropertyPeriodForm",
    button: "loadCurrentTotalBtn",
    pendingKey: "pendingForeignPropertyPeriodRequest",
    request: { action: "loadTotal", criteria: PENDING_REQUEST },
  },
  {
    page: "foreignPropertyPeriodAmend.html",
    form: "itsaForeignPropertyPeriodAmendForm",
    button: "loadBtn",
    pendingKey: "pendingForeignPropertyPeriodAmendRequest",
    request: { action: "load", criteria: PENDING_REQUEST },
  },
  {
    page: "foreignPropertyPeriodView.html",
    form: "itsaForeignPropertyPeriodViewForm",
    pendingKey: "pendingForeignPropertyPeriodViewRequest",
    request: PENDING_REQUEST,
  },
  {
    page: "foreignPropertyPeriods.html",
    form: "itsaForeignPropertyPeriodsForm",
    pendingKey: "pendingForeignPropertyPeriodsRequest",
    request: PENDING_REQUEST,
  },
];

test.describe("A foreign property period page uses the HMRC account the bundles chose", () => {
  for (const { page: pageName, form, button, pendingKey, request } of FOREIGN_PROPERTY_PAGES) {
    test(`a synthetic account opening ${pageName} in a new tab sees the synthetic indicator`, async ({ page }) => {
      await openItsaPage(page, pageName, { synthetic: true, storedAccount: null });
      await expect(page.locator("#syntheticIndicator")).toBeVisible();
    });

    test(`a live account whose tab holds a synthetic account signs in to live HMRC from ${pageName}`, async ({ page }) => {
      const seen = await openItsaPage(page, pageName, { synthetic: false, storedAccount: "synthetic" });
      await startSignIn(page, form, button);
      await expect.poll(() => seen.signIns, { timeout: 10_000 }).toEqual([LIVE_HOST]);
      await expect(page.locator("#syntheticIndicator")).toBeHidden();
    });

    test(`the Cancel button on ${pageName} keeps the HMRC account the bundles chose`, async ({ page }) => {
      await openItsaPage(page, pageName, { synthetic: true });
      expect(await bundleReadSettled(page)).toBe("synthetic");
      await page.evaluate(() => document.getElementById("cancelRequestBtn").click());
      expect(await page.evaluate(() => sessionStorage.getItem("hmrcAccount"))).toBe("synthetic");
    });

    test(`a failed request on ${pageName} names the synthetic account and keeps it`, async ({ page }) => {
      const seen = await openItsaPage(page, pageName, {
        synthetic: true,
        storedAccount: null,
        bundleAnswerMs: 4000,
        pending: { key: pendingKey, request },
      });
      await expect.poll(() => seen.hmrcCalls.length, { timeout: 10_000 }).toBeGreaterThan(0);
      expect(seen.hmrcCalls).toEqual(["synthetic"]);
      expect(await page.evaluate(() => sessionStorage.getItem("hmrcAccount"))).toBe("synthetic");
    });

    test(`${pageName} says the account is not decided and signs in nowhere when the bundle read never answers`, async ({ page }) => {
      const seen = await openItsaPage(page, pageName, { synthetic: false, storedAccount: "synthetic", bundleAnswerMs: null });
      await startSignIn(page, form, button);
      const banner = page.locator("p.hint[data-feature-status]").first();
      await expect(banner).toContainText("Status: checking your account.", { timeout: 20_000 });
      await page.waitForTimeout(1000);
      expect(seen.signIns).toEqual([]);
    });
  }
});

test.describe("The Cancel button on a foreign property period page cancels the request held for the HMRC sign-in", () => {
  for (const { page: pageName, pendingKey } of FOREIGN_PROPERTY_PAGES) {
    test(`the Cancel button on ${pageName} keeps the reader signed in and removes the held request`, async ({ page }) => {
      await openItsaPage(page, pageName, { synthetic: false });
      await page.waitForFunction(() => window.clearSession);
      await page.evaluate((key) => {
        sessionStorage.setItem(key, JSON.stringify({ nino: "AA123456A" }));
        document.getElementById("cancelRequestBtn").click();
      }, pendingKey);
      expect(await page.evaluate(() => localStorage.getItem("cognitoIdToken"))).toBe("test-id-token");
      expect(await page.evaluate((key) => sessionStorage.getItem(key), pendingKey)).toBeNull();
    });
  }
});

// The Income Tax pages that remove nothing, by the form that starts their first request and, where
// the page asks for a later tax year, the request it sends.
const READING_PAGES = [
  { page: "adjustments.html", form: "itsaBsasTriggerForm" },
  { page: "annualSubmission.html", form: "itsaAnnualLoadForm" },
  { page: "dashboard.html", form: "businessPickerForm" },
  { page: "finalDeclaration.html", form: "itsaFinalDeclarationRetrieveForm" },
  { page: "foreignPropertyAdjustments.html", form: "itsaForeignBsasTriggerForm" },
  { page: "foreignPropertyAnnualSubmission.html", form: "itsaForeignAnnualLoadForm" },
  { page: "foreignPropertyDetails.html", form: "foreignPropertyLoadForm", request: { ...PENDING_REQUEST, taxYear: "2026-27" } },
  { page: "lossesAndClaims.html", form: "itsaLossesLoadForm" },
  { page: "taxCalculation.html", form: "itsaCalculationTriggerForm" },
  { page: "taxLiabilityAdjustments.html", form: "itsaAdjustmentsLoadForm" },
  { page: "ukPropertyAdjustments.html", form: "itsaBsasTriggerForm" },
  { page: "ukPropertyAnnualSubmission.html", form: "itsaAnnualLoadForm" },
];

test.describe("The other Income Tax pages use the HMRC account the bundles chose", () => {
  for (const { page: pageName, form, request } of READING_PAGES) {
    test(`a synthetic account opening ${pageName} in a new tab sees the synthetic indicator`, async ({ page }) => {
      await openItsaPage(page, pageName, { synthetic: true, storedAccount: null });
      await expect(page.locator("#syntheticIndicator")).toBeVisible();
    });

    test(`a live account whose tab holds a synthetic account signs in to live HMRC from ${pageName}`, async ({ page }) => {
      const seen = await openItsaPage(page, pageName, { synthetic: false, storedAccount: "synthetic" });
      await startSignIn(page, form, undefined, request);
      await expect.poll(() => seen.signIns, { timeout: 10_000 }).toEqual([LIVE_HOST]);
      await expect(page.locator("#syntheticIndicator")).toBeHidden();
    });

    test(`${pageName} says the account is not decided and signs in nowhere when the bundle read never answers`, async ({ page }) => {
      const seen = await openItsaPage(page, pageName, { synthetic: false, storedAccount: "synthetic", bundleAnswerMs: null });
      await startSignIn(page, form, undefined, request);
      const banner = page.locator("p.hint[data-feature-status]").first();
      await expect(banner).toContainText("Status: checking your account.", { timeout: 20_000 });
      await page.waitForTimeout(1000);
      expect(seen.signIns).toEqual([]);
    });
  }
});

// The pages whose requests go through the shared HMRC service functions while an HMRC grant is held,
// so nothing on the page names the account before the request is sent.
const GRANT_REQUEST_PAGES = READING_PAGES.filter(
  ({ page }) => !["dashboard.html", "finalDeclaration.html", "taxCalculation.html"].includes(page),
);

test.describe("An Income Tax page holding an HMRC grant names the account the bundles chose on its request", () => {
  for (const { page: pageName, form, request } of GRANT_REQUEST_PAGES) {
    test(`a live account whose tab holds a synthetic account names no synthetic account on a request from ${pageName}`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        sessionStorage.setItem("hmrcGrantId", "test-grant");
        sessionStorage.setItem("hmrcTokenScope", "read:self-assessment write:self-assessment");
      });
      const seen = await openItsaPage(page, pageName, { synthetic: false, storedAccount: "synthetic", bundleAnswerMs: 3000 });
      await startSignIn(page, form, undefined, request);
      await expect.poll(() => seen.hmrcCalls.length, { timeout: 10_000 }).toBeGreaterThan(0);
      expect(seen.hmrcCalls).not.toContain("synthetic");
      expect(seen.signIns).toEqual([]);
    });
  }
});

const ALL_PAGES = [...REQUEST_PAGES, ...FOREIGN_PROPERTY_PAGES, ...READING_PAGES].map(({ page }) => page);

test.describe("An Income Tax page's status line follows the HMRC service its calls go to", () => {
  for (const pageName of ALL_PAGES) {
    test(`${pageName} shows only the sandbox status to a synthetic account opening it in a new tab`, async ({ page }) => {
      await openItsaPage(page, pageName, { synthetic: true, storedAccount: null });
      const banner = page.locator("p.hint[data-feature-status]").first();
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
      await expect(banner).toHaveAttribute("role", "status");
      await expect(banner).toContainText("Status: sandbox.");
      await expect(banner).toContainText("Nothing you send reaches your real HMRC record.");
      expect(await page.evaluate(() => [...window.__shownStatuses])).toEqual(["sandbox"]);
    });

    test(`${pageName} shows the sandbox status to a live account when HMRC's test API is the service`, async ({ page }) => {
      await openItsaPage(page, pageName, { synthetic: false, storedAccount: "synthetic", hmrcHost: SANDBOX_HOST });
      const banner = page.locator("p.hint[data-feature-status]").first();
      await expect(banner).toBeVisible();
      await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
      await expect(banner).toHaveAttribute("role", "status");
      expect(await page.evaluate(() => [...window.__shownStatuses])).toEqual(["sandbox"]);
    });
  }

  test("the obligations page says the account is not decided when the bundle read never answers", async ({ page }) => {
    await openItsaPage(page, "obligations.html", { synthetic: false, storedAccount: "synthetic", bundleAnswerMs: null });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toHaveAttribute("data-feature-status", "undecided");
    await expect(banner).toContainText("Status: checking your account.");
    await expect(page.locator("#syntheticIndicator")).toBeHidden();
  });

  test("the Welsh obligations page reads the Welsh sandbox status for a synthetic account", async ({ page }) => {
    await openItsaPage(page, "obligations.html", { synthetic: true, storedAccount: null, welsh: true });
    const banner = page.locator("p.hint[data-feature-status]").first();
    await expect(banner).toHaveAttribute("data-feature-status", "sandbox");
    await expect(banner).toHaveAttribute("role", "status");
    await expect(banner).toContainText("Statws: amgylchedd prawf (sandbox).");
    await expect(banner).toContainText("Nid yw dim byd a anfonwch yn cyrraedd eich cofnod CThEF go iawn.");
  });
});

test.describe("The synthetic indicator follows a second decision of the HMRC account", () => {
  for (const pageName of ["obligations.html", "foreignPropertyPeriods.html", "taxCalculation.html"]) {
    test(`${pageName} shows and hides the synthetic indicator as the bundles change`, async ({ page }) => {
      await openItsaPage(page, pageName, { synthetic: false, bundleAnswerMs: 0 });
      expect(await bundleReadSettled(page)).toBeNull();
      const indicator = page.locator("#syntheticIndicator");
      await expect(indicator).toBeHidden();
      await page.evaluate(() => window.setSyntheticBundle(true));
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("bundle-changed")));
      await expect(indicator).toBeVisible();
      await page.evaluate(() => window.setSyntheticBundle(false));
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("bundle-changed")));
      await expect(indicator).toBeHidden();
    });
  }
});
