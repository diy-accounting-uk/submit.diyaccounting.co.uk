// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/formErrors.browser.test.js
// An empty submit on each ITSA form raises the error summary, an inline message and aria-invalid.

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { serveMoneyInput, serveFormErrors, serveSelfEmploymentExpenses } from "./hmrcFieldTableAssets.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const FORMS = [
  ["adjustments.html", "itsaBsasTriggerForm", "triggerBtn"],
  ["annualSubmission.html", "itsaAnnualLoadForm", "loadBtn"],
  ["businessDetails.html", "itsaBusinessDetailsForm", "retrieveBtn"],
  ["dashboard.html", "businessPickerForm", "findBusinessesBtn"],
  ["finalDeclaration.html", "itsaFinalDeclarationRetrieveForm", "retrieveBtn"],
  ["lossesAndClaims.html", "itsaLossesLoadForm", "loadBtn"],
  ["obligations.html", "itsaObligationsForm", "retrieveBtn"],
  ["selfEmploymentPeriod.html", "itsaSelfEmploymentPeriodForm", "submitBtn"],
  ["selfEmploymentPeriodAmend.html", "itsaSelfEmploymentPeriodAmendForm", "submitBtn"],
  ["selfEmploymentPeriodView.html", "itsaSelfEmploymentPeriodViewForm", "retrieveBtn"],
  ["selfEmploymentPeriods.html", "itsaSelfEmploymentPeriodsForm", "retrieveBtn"],
  ["taxCalculation.html", "itsaCalculationTriggerForm", "triggerBtn"],
  ["taxLiabilityAdjustments.html", "itsaAdjustmentsLoadForm", "loadBtn"],
  ["ukPropertyAdjustments.html", "itsaBsasTriggerForm", "triggerBtn"],
  ["ukPropertyAnnualSubmission.html", "itsaAnnualLoadForm", "loadBtn"],
  ["ukPropertyPeriod.html", "itsaUkPropertyPeriodForm", "submitBtn"],
  ["ukPropertyPeriodAmend.html", "itsaUkPropertyPeriodAmendForm", "submitBtn"],
  ["ukPropertyPeriodView.html", "itsaUkPropertyPeriodViewForm", "retrieveBtn"],
  ["ukPropertyPeriods.html", "itsaUkPropertyPeriodsForm", "retrieveBtn"],
];

async function openPage(page, fileName) {
  await page.addInitScript(() => {
    window.showStatus = () => {};
    window.hideStatus = () => {};
    window.showLoading = () => {};
    window.hideLoading = () => {};
    window.generateRandomState = () => "test-state";
    window.getGovClientHeaders = () => Promise.resolve({});
    window.authorizedFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    window.hmrcScopeCheck = {
      isTokenSufficient: () => Promise.resolve(true),
      getOAuthScopeString: () => Promise.resolve("read:self-assessment"),
      clearHmrcToken: () => {},
    };
  });
  await page.route("**/*.js", async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    } else {
      await route.continue();
    }
  });
  await serveMoneyInput(page);
  await serveFormErrors(page);
  await serveSelfEmploymentExpenses(page);
  const url = `http://localhost:3000/hmrc/itsa/${fileName}`;
  const html = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/itsa", fileName), "utf-8");
  await page.route(url, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
}

for (const [fileName, formId, submitId] of FORMS) {
  test.describe(`Form errors - ${fileName}`, () => {
    test("an empty submit shows the summary, inline messages and aria-invalid, and each link focuses its field", async ({ page }) => {
      await openPage(page, fileName);
      await page.locator(`#${submitId}`).click();

      const summary = page.locator("#form-error-summary");
      await expect(summary).toBeVisible();
      await expect(summary).toHaveAttribute("role", "alert");
      await expect(summary.locator("h2")).toHaveText("There is a problem");
      await expect(summary).toBeFocused();
      expect(await page.locator(`#${formId} #form-error-summary`).count()).toBe(1);

      const targets = await summary.locator("a").evaluateAll((links) => links.map((link) => link.getAttribute("href").slice(1)));
      expect(targets).toContain("nino");
      for (const id of targets) {
        await expect(page.locator(`#${id}`)).toHaveAttribute("aria-invalid", "true");
        await expect(page.locator(`#${id}-error`)).toBeVisible();
        await expect(page.locator(`#${id}`)).toHaveAttribute("aria-describedby", new RegExp(`${id}-error`));
      }
      for (const id of targets) {
        await summary.locator(`a[href="#${id}"]`).click();
        await expect(page.locator(`#${id}`)).toBeFocused();
      }
    });
  });
}
