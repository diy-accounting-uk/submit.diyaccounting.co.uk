// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/steps/behaviour-hmrc-itsa-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, loggedFocus, loggedSelectOption, timestamp, isSyntheticMode } from "../helpers/behaviour-helpers.js";
import { waitForSuccessOrError } from "../helpers/waitForSuccessOrError.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-hmrc-itsa-steps";

export async function initItsaBusinessDetails(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = "Self Assessment (HMRC)";
  await test.step(`The user navigates to ${activityButtonText} and sees the business details form`, async () => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-business-details.png` });
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting ITSA Business Details", {
      screenshotPath,
      timeout: 60000,
    });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-business-details.png` });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-business-details.png` });
    // The activity button opens the ITSA dashboard (the first .html path listed for the
    // self-employed activity - see catalog-service.js), which links out to each ITSA page.
    await loggedClick(page, "a:has-text('Go to Business Details')", "Going to Business Details from the dashboard", {
      screenshotPath,
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-business-details.png` });
    await expect(page.locator("#itsaBusinessDetailsForm")).toBeVisible();
  });
}

export async function fillInItsaBusinessDetails(page, businessDetailsQuery = {}, screenshotPath = defaultScreenshotPath) {
  await test.step("The user fills in the Business Details form with a National Insurance number", async () => {
    const { hmrcNino, testScenario, runFraudPreventionHeaderValidation } = businessDetailsQuery || {};
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-business-details-fill-in.png` });

    const testDataLink = page.locator("#testDataLink.visible");
    const isTestDataLinkVisible = await testDataLink.isVisible().catch(() => false);

    if (isSyntheticMode() && isTestDataLinkVisible) {
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-business-details-click-test-data.png` });
      await loggedClick(page, "#testDataLink a", "Clicking add test data link", { screenshotPath });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-business-details-test-data-added.png` });

      await expect(page.locator("#nino")).not.toHaveValue("");
    }

    await page.waitForTimeout(100);
    await loggedFill(page, "#nino", hmrcNino, "Entering National Insurance number", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-business-details-fill-in.png` });
    await page.waitForTimeout(50);

    if (testScenario || runFraudPreventionHeaderValidation) {
      if (isSyntheticMode()) {
        await page.waitForFunction(() => sessionStorage.getItem("hmrcAccount") === "synthetic", { timeout: 10000 });
      }
      await page.evaluate(() => {
        sessionStorage.setItem("showDeveloperOptions", "true");
        document.body.classList.add("developer-mode");
        window.dispatchEvent(new CustomEvent("developer-mode-changed", { detail: { enabled: true } }));
      });
      console.log("Enabled developer mode for test scenario");

      const devSection = page.locator("#developerSection");
      await expect(devSection).toBeVisible({ timeout: 5000 });
      await page.keyboard.press("PageDown");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-business-details-fill-in.png` });
      if (testScenario) {
        await loggedSelectOption(page, "#testScenario", String(testScenario), "a developer test scenario", {
          screenshotPath,
        });
      }
      if (runFraudPreventionHeaderValidation) {
        await page.locator("#runFraudPreventionHeaderValidation").check();
        console.log("Checked runFraudPreventionHeaderValidation checkbox");
      }
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-business-details-filled-in.png` });
    }

    await loggedFocus(page, "#retrieveBtn", "Retrieve button", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-business-details-fill-in-pagedown.png` });
    await expect(page.locator("#retrieveBtn")).toBeVisible();
  });
}

export async function submitItsaBusinessDetailsForm(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits the Business Details form", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-business-details-submit.png` });
    // Clicking retrieve may trigger HMRC OAuth redirect (if no valid token with sufficient scope).
    await Promise.all([
      page.waitForURL(/.*/, { timeout: 15000 }),
      loggedClick(page, "#retrieveBtn", "Submitting Business Details form", { screenshotPath }),
    ]);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-business-details-submit.png` });
  });
}

export async function verifyItsaBusinessDetailsResults(page, businessDetailsQuery, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees Business Details results displayed", async () => {
    if (arguments.length === 2 && typeof businessDetailsQuery === "string") {
      screenshotPath = businessDetailsQuery;
      businessDetailsQuery = {};
    }
    const { testScenario } = businessDetailsQuery || {};
    const hasScenario = !!testScenario;

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-business-details-results.png` });
    if (hasScenario) {
      switch (testScenario) {
        case "NOT_FOUND":
          await page.waitForTimeout(500);
          const businessDetailsResults = page.locator("#businessDetailsResults");
          await expect(businessDetailsResults).toBeHidden();
          break;
        case "SUBMIT_API_HTTP_500":
        case "SUBMIT_HMRC_API_HTTP_500":
          await page.locator("#loadingSpinner").waitFor({ state: "hidden", timeout: 30_000 });
          break;
        default:
          await waitForSuccessOrError(page, {
            successSelector: "#businessDetailsResults",
            description: `Business Details results (${testScenario})`,
            timeout: 450_000,
            screenshotPath,
          });
          await expect(page.locator("#businessDetailsResults")).toBeVisible();
          break;
      }
      return;
    }
    await waitForSuccessOrError(page, {
      successSelector: "#businessDetailsResults",
      description: "Business Details results",
      timeout: 450_000,
      screenshotPath,
    });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-business-details-results.png` });
    const resultsContainer = page.locator("#businessDetailsResults");
    await expect(resultsContainer).toBeVisible();

    const businessDetailsTable = page.locator("#businessDetailsTable");
    await expect(businessDetailsTable).toBeVisible();

    const rowLocator = page.locator("#businessDetailsTable table tbody tr");
    const rowCount = await rowLocator.count();
    // Relaxed assertion: real HMRC data varies by test user. Validate shape of any rows
    // returned, but don't require any - a test user with no ITSA businesses is still valid.
    if (rowCount === 0) {
      console.log("[verifyItsaBusinessDetailsResults] No businesses returned - this is acceptable for some test scenarios");
      return;
    }
    console.log(`[verifyItsaBusinessDetailsResults] Found ${rowCount} business(es) - validating shape`);

    for (let i = 0; i < rowCount; i++) {
      const r = rowLocator.nth(i);
      const typeOfBusiness = (await r.locator("td").nth(0).innerText()).trim();
      const businessId = (await r.locator("td").nth(2).innerText()).trim();
      expect(typeOfBusiness.length).toBeGreaterThan(0);
      expect(businessId.length).toBeGreaterThan(0);
    }
  });
}

// Obligations does not have its own home-page activity button - the "Self Assessment (HMRC)"
// button opens the ITSA dashboard, which links to this page. This step navigates directly,
// the way behaviour-bundle-steps.js does for usage.html.
export async function initItsaObligations(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user navigates to the ITSA Obligations page and sees the obligations form", async () => {
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/hmrc/itsa/obligations.html`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-obligations.png` });
    await expect(page.locator("#itsaObligationsForm")).toBeVisible();
  });
}

export async function fillInItsaObligations(page, obligationsQuery = {}, screenshotPath = defaultScreenshotPath) {
  await test.step("The user fills in the Obligations form with a National Insurance number", async () => {
    const { hmrcNino, typeOfBusiness, businessId, status, testScenario, runFraudPreventionHeaderValidation } = obligationsQuery || {};
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-obligations-fill-in.png` });

    const testDataLink = page.locator("#testDataLink.visible");
    const isTestDataLinkVisible = await testDataLink.isVisible().catch(() => false);

    if (isSyntheticMode() && isTestDataLinkVisible) {
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-obligations-click-test-data.png` });
      await loggedClick(page, "#testDataLink a", "Clicking add test data link", { screenshotPath });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-obligations-test-data-added.png` });

      await expect(page.locator("#nino")).not.toHaveValue("");
    }

    await page.waitForTimeout(100);
    await loggedFill(page, "#nino", hmrcNino, "Entering National Insurance number", { screenshotPath });
    if (typeOfBusiness) await loggedSelectOption(page, "#typeOfBusiness", String(typeOfBusiness), "a business type filter", { screenshotPath });
    if (businessId) await loggedFill(page, "#businessId", businessId, "Entering business ID filter", { screenshotPath });
    if (status) await loggedSelectOption(page, "#status", String(status), "a status filter", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-obligations-fill-in.png` });
    await page.waitForTimeout(50);

    if (testScenario || runFraudPreventionHeaderValidation) {
      if (isSyntheticMode()) {
        await page.waitForFunction(() => sessionStorage.getItem("hmrcAccount") === "synthetic", { timeout: 10000 });
      }
      await page.evaluate(() => {
        sessionStorage.setItem("showDeveloperOptions", "true");
        document.body.classList.add("developer-mode");
        window.dispatchEvent(new CustomEvent("developer-mode-changed", { detail: { enabled: true } }));
      });
      console.log("Enabled developer mode for test scenario");

      const devSection = page.locator("#developerSection");
      await expect(devSection).toBeVisible({ timeout: 5000 });
      await page.keyboard.press("PageDown");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-obligations-fill-in.png` });
      if (testScenario) {
        await loggedSelectOption(page, "#testScenario", String(testScenario), "a developer test scenario", {
          screenshotPath,
        });
      }
      if (runFraudPreventionHeaderValidation) {
        await page.locator("#runFraudPreventionHeaderValidation").check();
        console.log("Checked runFraudPreventionHeaderValidation checkbox");
      }
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-obligations-filled-in.png` });
    }

    await loggedFocus(page, "#retrieveBtn", "Retrieve button", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-obligations-fill-in-pagedown.png` });
    await expect(page.locator("#retrieveBtn")).toBeVisible();
  });
}

export async function submitItsaObligationsForm(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits the Obligations form", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-obligations-submit.png` });
    // Clicking retrieve may trigger HMRC OAuth redirect (if no valid token with sufficient scope).
    await Promise.all([
      page.waitForURL(/.*/, { timeout: 15000 }),
      loggedClick(page, "#retrieveBtn", "Submitting Obligations form", { screenshotPath }),
    ]);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-obligations-submit.png` });
  });
}

export async function verifyItsaObligationsResults(page, obligationsQuery, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees Obligations results displayed", async () => {
    if (arguments.length === 2 && typeof obligationsQuery === "string") {
      screenshotPath = obligationsQuery;
      obligationsQuery = {};
    }
    const { testScenario } = obligationsQuery || {};
    const hasScenario = !!testScenario;

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-obligations-results.png` });
    if (hasScenario) {
      switch (testScenario) {
        case "NOT_FOUND":
        case "NO_OBLIGATIONS_FOUND":
          await page.waitForTimeout(500);
          const obligationsResults = page.locator("#obligationsResults");
          await expect(obligationsResults).toBeHidden();
          break;
        case "SUBMIT_API_HTTP_500":
        case "SUBMIT_HMRC_API_HTTP_500":
          await page.locator("#loadingSpinner").waitFor({ state: "hidden", timeout: 30_000 });
          break;
        default:
          await waitForSuccessOrError(page, {
            successSelector: "#obligationsResults",
            description: `Obligations results (${testScenario})`,
            timeout: 450_000,
            screenshotPath,
          });
          await expect(page.locator("#obligationsResults")).toBeVisible();
          break;
      }
      return;
    }
    await waitForSuccessOrError(page, {
      successSelector: "#obligationsResults",
      description: "Obligations results",
      timeout: 450_000,
      screenshotPath,
    });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-obligations-results.png` });
    const resultsContainer = page.locator("#obligationsResults");
    await expect(resultsContainer).toBeVisible();

    const obligationsTable = page.locator("#obligationsTable");
    await expect(obligationsTable).toBeVisible();

    const rowLocator = page.locator("#obligationsTable table tbody tr");
    const rowCount = await rowLocator.count();
    // Relaxed assertion: real HMRC data varies by test user and obligations are unpredictable.
    // Validate the shape of any rows returned, never a specific period or status.
    if (rowCount === 0) {
      console.log("[verifyItsaObligationsResults] No obligations returned - this is acceptable for some test scenarios");
      return;
    }
    console.log(`[verifyItsaObligationsResults] Found ${rowCount} obligation(s) - validating shape`);

    for (let i = 0; i < rowCount; i++) {
      const r = rowLocator.nth(i);
      const typeOfBusiness = (await r.locator("td").nth(0).innerText()).trim();
      const businessId = (await r.locator("td").nth(1).innerText()).trim();
      const status = (await r.locator("td").nth(5).innerText()).trim();
      expect(typeOfBusiness.length).toBeGreaterThan(0);
      expect(businessId.length).toBeGreaterThan(0);
      expect(status.length).toBeGreaterThan(0);
    }
  });
}

// Self-Employment Period, like Obligations, has no home-page activity button of its own -
// only the dashboard links to it - so navigate to it directly, the way
// behaviour-bundle-steps.js does for usage.html.
export async function initItsaSelfEmploymentPeriod(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user navigates to the File a Quarterly Update page and sees the period form", async () => {
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/hmrc/itsa/selfEmploymentPeriod.html`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-self-employment-period.png` });
    await expect(page.locator("#itsaSelfEmploymentPeriodForm")).toBeVisible();
  });
}

export async function fillInItsaSelfEmploymentPeriod(page, periodQuery = {}, screenshotPath = defaultScreenshotPath) {
  await test.step("The user fills in the quarterly update form", async () => {
    const {
      hmrcNino,
      businessId,
      periodStartDate,
      periodEndDate,
      turnover,
      testScenario,
      runFraudPreventionHeaderValidation,
    } = periodQuery || {};
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-self-employment-period-fill-in.png` });

    const testDataLink = page.locator("#testDataLink.visible");
    const isTestDataLinkVisible = await testDataLink.isVisible().catch(() => false);

    if (isSyntheticMode() && isTestDataLinkVisible && !businessId) {
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-self-employment-period-click-test-data.png` });
      await loggedClick(page, "#testDataLink a", "Clicking add test data link", { screenshotPath });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-self-employment-period-test-data-added.png` });

      await expect(page.locator("#nino")).not.toHaveValue("");
    } else {
      await loggedFill(page, "#nino", hmrcNino, "Entering National Insurance number", { screenshotPath });
      if (businessId) await loggedFill(page, "#businessId", businessId, "Entering business ID", { screenshotPath });
      if (periodStartDate) await loggedFill(page, "#periodStartDate", periodStartDate, "Entering period start date", { screenshotPath });
      if (periodEndDate) await loggedFill(page, "#periodEndDate", periodEndDate, "Entering period end date", { screenshotPath });
      if (turnover !== undefined) await loggedFill(page, "#turnover", String(turnover), "Entering turnover", { screenshotPath });
    }

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-04-self-employment-period-fill-in.png` });
    await page.waitForTimeout(50);

    if (testScenario || runFraudPreventionHeaderValidation) {
      if (isSyntheticMode()) {
        await page.waitForFunction(() => sessionStorage.getItem("hmrcAccount") === "synthetic", { timeout: 10000 });
      }
      await page.evaluate(() => {
        sessionStorage.setItem("showDeveloperOptions", "true");
        document.body.classList.add("developer-mode");
        window.dispatchEvent(new CustomEvent("developer-mode-changed", { detail: { enabled: true } }));
      });
      console.log("Enabled developer mode for test scenario");

      const devSection = page.locator("#developerSection");
      await expect(devSection).toBeVisible({ timeout: 5000 });
      await page.keyboard.press("PageDown");
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-05-self-employment-period-fill-in.png` });
      if (testScenario) {
        await loggedSelectOption(page, "#testScenario", String(testScenario), "a developer test scenario", {
          screenshotPath,
        });
      }
      if (runFraudPreventionHeaderValidation) {
        await page.locator("#runFraudPreventionHeaderValidation").check();
        console.log("Checked runFraudPreventionHeaderValidation checkbox");
      }
      await page.screenshot({ path: `${screenshotPath}/${timestamp()}-06-self-employment-period-filled-in.png` });
    }

    await loggedFocus(page, "#submitBtn", "Submit button", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-07-self-employment-period-fill-in-pagedown.png` });
    await expect(page.locator("#submitBtn")).toBeVisible();
  });
}

export async function submitItsaSelfEmploymentPeriodForm(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user submits the quarterly update form", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-self-employment-period-submit.png` });
    // Clicking submit may trigger HMRC OAuth redirect (if no valid token with sufficient scope).
    await Promise.all([
      page.waitForURL(/.*/, { timeout: 15000 }),
      loggedClick(page, "#submitBtn", "Submitting quarterly update form", { screenshotPath }),
    ]);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-self-employment-period-submit.png` });
  });
}

export async function verifyItsaSelfEmploymentPeriodResults(page, periodQuery, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the quarterly update filing result", async () => {
    if (arguments.length === 2 && typeof periodQuery === "string") {
      screenshotPath = periodQuery;
      periodQuery = {};
    }
    const { testScenario } = periodQuery || {};
    const hasScenario = !!testScenario;

    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-self-employment-period-results.png` });
    if (hasScenario) {
      switch (testScenario) {
        case "NOT_FOUND":
        case "OVERLAPPING_PERIOD":
        case "MISALIGNED_PERIOD":
        case "NOT_CONTIGUOUS_PERIOD":
        case "DUPLICATE_SUBMISSION":
        case "TAX_YEAR_NOT_SUPPORTED":
          await page.waitForTimeout(500);
          const selfEmploymentPeriodResults = page.locator("#selfEmploymentPeriodResults");
          await expect(selfEmploymentPeriodResults).toBeHidden();
          break;
        case "SUBMIT_API_HTTP_500":
        case "SUBMIT_HMRC_API_HTTP_500":
          await page.locator("#loadingSpinner").waitFor({ state: "hidden", timeout: 30_000 });
          break;
        default:
          await waitForSuccessOrError(page, {
            successSelector: "#selfEmploymentPeriodResults",
            description: `Quarterly update result (${testScenario})`,
            timeout: 450_000,
            screenshotPath,
          });
          await expect(page.locator("#selfEmploymentPeriodResults")).toBeVisible();
          break;
      }
      return;
    }
    await waitForSuccessOrError(page, {
      successSelector: "#selfEmploymentPeriodResults",
      description: "Quarterly update result",
      timeout: 450_000,
      screenshotPath,
    });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-self-employment-period-results.png` });
    const resultsContainer = page.locator("#selfEmploymentPeriodResults");
    await expect(resultsContainer).toBeVisible();

    const periodId = (await page.locator("#periodIdResult").innerText()).trim();
    expect(periodId.length).toBeGreaterThan(0);
  });
}
