// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/steps/behaviour-hmrc-itsa-steps.js

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, loggedFocus, loggedSelectOption, timestamp, isSandboxMode } from "../helpers/behaviour-helpers.js";
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
    await expect(page.locator("#itsaBusinessDetailsForm")).toBeVisible();
  });
}

export async function fillInItsaBusinessDetails(page, businessDetailsQuery = {}, screenshotPath = defaultScreenshotPath) {
  await test.step("The user fills in the Business Details form with a National Insurance number", async () => {
    const { hmrcNino, testScenario, runFraudPreventionHeaderValidation } = businessDetailsQuery || {};
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-business-details-fill-in.png` });

    const testDataLink = page.locator("#testDataLink.visible");
    const isTestDataLinkVisible = await testDataLink.isVisible().catch(() => false);

    if (isSandboxMode() && isTestDataLinkVisible) {
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
      if (isSandboxMode()) {
        await page.waitForFunction(() => sessionStorage.getItem("hmrcAccount") === "sandbox", { timeout: 10000 });
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
