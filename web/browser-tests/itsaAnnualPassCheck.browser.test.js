// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/itsaAnnualPassCheck.browser.test.js
//
// The Income Tax year-end pages (annual submissions, adjustments, losses and claims, tax liability
// adjustments, foreign property details and the final declaration) check for a pass before they send
// anything to HMRC or leave for the HMRC sign-in. A refusal for want of a pass offers a day pass and
// keeps the HMRC grant for the retry.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "web/public");
const GRANT_ID = "0a1b2c3d-0a1b-4a1b-8a1b-0a1b2c3d4e5f";
const ORIGIN = "http://localhost:3000";

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".toml": "text/x-toml",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const HELD_PRO_PASS = [{ bundleId: "resident-pro", allocated: true, tokensGranted: 10, tokensRemaining: 10 }];
const ENTITLEMENT_REFUSAL = {
  message: "Forbidden - missing or insufficient bundle entitlement",
  error: { code: "BUNDLE_ENTITLEMENT_REQUIRED" },
};

// The real page with the API answered here. Returns the requests that would reach HMRC.
async function openItsaPage(page, pagePath, { bundles = [], answer, session = {} } = {}) {
  const hmrcRequests = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      let reply = { status: 200, body: {} };
      if (url.pathname === "/api/v1/bundle") reply = { status: 200, body: { bundles } };
      else if (url.pathname.startsWith("/api/v1/hmrc/")) {
        hmrcRequests.push(`${route.request().method()} ${url.pathname}`);
        reply = answer || reply;
      }
      await route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
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
  await page.addInitScript((stored) => {
    localStorage.setItem("siteLanguage", "en");
    localStorage.setItem("cognitoIdToken", "test-id-token");
    for (const [key, value] of Object.entries(stored)) sessionStorage.setItem(key, value);
  }, session);
  await page.goto(`${ORIGIN}${pagePath}`, { waitUntil: "load" });
  return hmrcRequests;
}

const grantSession = (extra = {}) => ({ hmrcGrantId: GRANT_ID, hmrcTokenScope: "write:self-assessment read:self-assessment", ...extra });

async function expectPassNeeded(page) {
  const message = page.locator("#statusMessagesContainer .status-message.status-error");
  await expect(message).toContainText("You need a pass for this");
  await expect(message).toContainText("Nothing has been sent to HMRC.");
  await expect(message.getByRole("link", { name: "Get a day pass" })).toHaveAttribute("href", "/bundles.html");
}

const grantKept = (page) => page.evaluate(() => sessionStorage.getItem("hmrcGrantId"));
const stored = (page, key) => page.evaluate((k) => sessionStorage.getItem(k), key);

async function fillCriteria(page, taxYear) {
  await page.fill("#nino", "AA123456A");
  if (await page.locator("#businessId").count()) await page.fill("#businessId", "XAIS12345678910");
  await page.selectOption("#taxYear", taxYear ? { label: taxYear } : { index: 1 });
}

// Pages that load a record, then save it: both steps go to HMRC and both are checked.
function describeLoadAndSavePage(title, pagePath, pendingLoadKey, pendingLoad) {
  test.describe(`${title} pass check`, () => {
    test("with no pass, loading sends nothing and leaves for no HMRC sign-in", async ({ page }) => {
      const hmrcRequests = await openItsaPage(page, pagePath);
      await fillCriteria(page);
      await page.locator("#loadBtn").click();

      await expectPassNeeded(page);
      expect(page.url()).toBe(`${ORIGIN}${pagePath}`);
      expect(hmrcRequests).toEqual([]);
      expect(await stored(page, pendingLoadKey)).toBeNull();
    });

    test("with no pass, a load stored before the HMRC sign-in is not sent and the grant stays", async ({ page }) => {
      const hmrcRequests = await openItsaPage(page, pagePath, {
        session: grantSession({ [pendingLoadKey]: JSON.stringify(pendingLoad) }),
      });

      await expectPassNeeded(page);
      expect(hmrcRequests).toEqual([]);
      expect(await grantKept(page)).toBe(GRANT_ID);
      expect(await stored(page, pendingLoadKey)).toBeNull();
    });

    test("a request refused for want of a pass offers a day pass and keeps the HMRC grant", async ({ page }) => {
      const hmrcRequests = await openItsaPage(page, pagePath, {
        bundles: HELD_PRO_PASS,
        session: grantSession({ [pendingLoadKey]: JSON.stringify(pendingLoad) }),
        answer: { status: 403, body: ENTITLEMENT_REFUSAL },
      });

      await expectPassNeeded(page);
      expect(hmrcRequests.length).toBeGreaterThan(0);
      expect(await grantKept(page)).toBe(GRANT_ID);
    });
  });
}

const LOAD_REQUEST = {
  nino: "AA123456A",
  businessId: "XAIS12345678910",
  taxYear: "2025-26",
  testScenario: "",
  runFraudPreventionHeaderValidation: false,
};

describeLoadAndSavePage("Self-employment annual submission", "/hmrc/itsa/annualSubmission.html", "pendingAnnualLoadRequest", LOAD_REQUEST);
describeLoadAndSavePage(
  "UK property annual submission",
  "/hmrc/itsa/ukPropertyAnnualSubmission.html",
  "pendingUkPropertyAnnualLoadRequest",
  LOAD_REQUEST,
);
describeLoadAndSavePage("Losses and claims", "/hmrc/itsa/lossesAndClaims.html", "pendingLossesLoadRequest", {
  ...LOAD_REQUEST,
  typeOfBusiness: "self-employment",
});

describeLoadAndSavePage("Tax liability adjustments", "/hmrc/itsa/taxLiabilityAdjustments.html", "pendingAdjustmentsLoadRequest", {
  nino: "AA123456A",
  taxYear: "2025-26",
  testScenario: "",
  runFraudPreventionHeaderValidation: false,
});

// Pages that ask HMRC for a year-end summary, then send an adjustment to it.
function describeAdjustmentPage(title, pagePath, pendingTriggerKey, pendingAdjustKey, shapes = {}) {
  const triggerRequest = shapes.trigger || {
    triggerDetails: {
      nino: "AA123456A",
      businessId: "XAIS12345678910",
      accountingPeriodStartDate: "2025-04-06",
      accountingPeriodEndDate: "2026-04-05",
      typeOfBusiness: "self-employment",
    },
    taxYear: "2025-26",
    testScenario: "",
    runFraudPreventionHeaderValidation: false,
  };
  const adjustRequest = shapes.adjust || {
    adjustDetails: { nino: "AA123456A", calculationId: "calc-1", taxYear: "2025-26", zeroAdjustments: true },
    testScenario: "",
    runFraudPreventionHeaderValidation: false,
  };

  test.describe(`${title} pass check`, () => {
    test("with no pass, requesting the summary sends nothing and leaves for no HMRC sign-in", async ({ page }) => {
      const hmrcRequests = await openItsaPage(page, pagePath, { session: grantSession() });
      await fillCriteria(page);
      await page.fill("#accountingPeriodStartDate", "2025-04-06");
      await page.fill("#accountingPeriodEndDate", "2026-04-05");
      await page.locator("#triggerBtn").click();

      await expectPassNeeded(page);
      expect(page.url()).toBe(`${ORIGIN}${pagePath}`);
      expect(hmrcRequests).toEqual([]);
      expect(await grantKept(page)).toBe(GRANT_ID);
      expect(await stored(page, pendingTriggerKey)).toBeNull();
    });

    test("with no pass, a request stored before the HMRC sign-in is not sent and the grant stays", async ({ page }) => {
      const hmrcRequests = await openItsaPage(page, pagePath, {
        session: grantSession({ [pendingAdjustKey]: JSON.stringify(adjustRequest) }),
      });

      await expectPassNeeded(page);
      expect(hmrcRequests).toEqual([]);
      expect(await grantKept(page)).toBe(GRANT_ID);
      expect(await stored(page, pendingAdjustKey)).toBeNull();
    });

    test("a request refused for want of a pass offers a day pass and keeps the HMRC grant", async ({ page }) => {
      const hmrcRequests = await openItsaPage(page, pagePath, {
        bundles: HELD_PRO_PASS,
        session: grantSession({ [pendingTriggerKey]: JSON.stringify(triggerRequest) }),
        answer: { status: 403, body: ENTITLEMENT_REFUSAL },
      });

      await expectPassNeeded(page);
      expect(hmrcRequests.length).toBeGreaterThan(0);
      expect(await grantKept(page)).toBe(GRANT_ID);
    });
  });
}

describeAdjustmentPage(
  "Self-employment adjustments",
  "/hmrc/itsa/adjustments.html",
  "pendingBsasTriggerRequest",
  "pendingBsasAdjustRequest",
);
describeAdjustmentPage(
  "UK property adjustments",
  "/hmrc/itsa/ukPropertyAdjustments.html",
  "pendingUkPropertyBsasTriggerRequest",
  "pendingUkPropertyBsasAdjustRequest",
);

describeAdjustmentPage(
  "Foreign property adjustments",
  "/hmrc/itsa/foreignPropertyAdjustments.html",
  "pendingForeignPropertyBsasRequest",
  "pendingForeignPropertyBsasRequest",
  {
    trigger: {
      action: "trigger",
      criteria: {
        nino: "AA123456A",
        businessId: "XAIS12345678910",
        taxYear: "2025-26",
        accountingPeriodStartDate: "2025-04-06",
        accountingPeriodEndDate: "2026-04-05",
        testScenario: null,
        runFraudPreventionHeaderValidation: false,
      },
    },
    adjust: {
      action: "adjust",
      adjustDetails: { nino: "AA123456A", calculationId: "calc-1", taxYear: "2025-26", zeroAdjustments: true },
      testScenario: null,
      runFraudPreventionHeaderValidation: false,
    },
  },
);

describeLoadAndSavePage(
  "Foreign property annual submission",
  "/hmrc/itsa/foreignPropertyAnnualSubmission.html",
  "pendingForeignPropertyAnnualRequest",
  {
    action: "load",
    criteria: { ...LOAD_REQUEST, testScenario: null },
  },
);

test.describe("Foreign property details pass check", () => {
  const pagePath = "/hmrc/itsa/foreignPropertyDetails.html";
  const criteria = { ...LOAD_REQUEST, taxYear: "2026-27", testScenario: null };
  const pendingSave = {
    action: "save",
    criteria,
    propertyId: null,
    property: { propertyName: "Villa", countryCode: "FRA" },
  };

  test("with no pass, showing the properties sends nothing and leaves for no HMRC sign-in", async ({ page }) => {
    const hmrcRequests = await openItsaPage(page, pagePath);
    await fillCriteria(page, "2026-27");
    await page.locator("#loadBtn").click();

    await expectPassNeeded(page);
    expect(page.url()).toBe(`${ORIGIN}${pagePath}`);
    expect(hmrcRequests).toEqual([]);
    expect(await stored(page, "pendingForeignPropertyDetailsRequest")).toBeNull();
  });

  test("with no pass, a save stored before the HMRC sign-in is not sent and the grant stays", async ({ page }) => {
    const hmrcRequests = await openItsaPage(page, pagePath, {
      session: grantSession({ pendingForeignPropertyDetailsRequest: JSON.stringify(pendingSave) }),
    });

    await expectPassNeeded(page);
    expect(hmrcRequests).toEqual([]);
    expect(await grantKept(page)).toBe(GRANT_ID);
  });

  test("a save refused for want of a pass offers a day pass and keeps the HMRC grant", async ({ page }) => {
    const hmrcRequests = await openItsaPage(page, pagePath, {
      bundles: HELD_PRO_PASS,
      session: grantSession({ pendingForeignPropertyDetailsRequest: JSON.stringify(pendingSave) }),
      answer: { status: 403, body: ENTITLEMENT_REFUSAL },
    });

    await expectPassNeeded(page);
    expect(hmrcRequests).toEqual(["POST /api/v1/hmrc/itsa/foreign-property/details"]);
    expect(await grantKept(page)).toBe(GRANT_ID);
  });
});

test.describe("Final declaration pass check", () => {
  const pagePath = "/hmrc/itsa/finalDeclaration.html";
  const pendingSubmit = {
    declarationDetails: {
      nino: "AA123456A",
      taxYear: "2025-26",
      calculationId: "calc-1",
      calculationType: "final-declaration",
      totalIncomeTaxAndNicsDue: 100,
    },
    testScenario: "",
    runFraudPreventionHeaderValidation: false,
  };

  test("with no pass, retrieving the calculation sends nothing and leaves for no HMRC sign-in", async ({ page }) => {
    const hmrcRequests = await openItsaPage(page, pagePath);
    await page.fill("#nino", "AA123456A");
    await page.selectOption("#taxYear", { index: 1 });
    await page.fill("#calculationId", "calc-1");
    await page.locator("#retrieveBtn").click();

    await expectPassNeeded(page);
    expect(page.url()).toBe(`${ORIGIN}${pagePath}`);
    expect(hmrcRequests).toEqual([]);
    expect(await stored(page, "pendingFinalDeclarationRetrieveRequest")).toBeNull();
  });

  test("with no pass, a declaration stored before the HMRC sign-in is not sent and the grant stays", async ({ page }) => {
    const hmrcRequests = await openItsaPage(page, pagePath, {
      session: grantSession({ pendingFinalDeclarationSubmitRequest: JSON.stringify(pendingSubmit) }),
    });

    await expectPassNeeded(page);
    expect(hmrcRequests).toEqual([]);
    expect(await grantKept(page)).toBe(GRANT_ID);
    expect(await stored(page, "pendingFinalDeclarationSubmitRequest")).toBeNull();
  });

  test("a declaration refused for want of a pass offers a day pass and keeps the HMRC grant", async ({ page }) => {
    const hmrcRequests = await openItsaPage(page, pagePath, {
      bundles: HELD_PRO_PASS,
      session: grantSession({ pendingFinalDeclarationSubmitRequest: JSON.stringify(pendingSubmit) }),
      answer: { status: 403, body: ENTITLEMENT_REFUSAL },
    });

    await expectPassNeeded(page);
    expect(hmrcRequests.length).toBeGreaterThan(0);
    expect(await grantKept(page)).toBe(GRANT_ID);
  });
});
