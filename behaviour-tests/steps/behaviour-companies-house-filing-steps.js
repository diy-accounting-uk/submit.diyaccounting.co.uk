// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/steps/behaviour-companies-house-filing-steps.js
// Steps for the two Companies House filing journeys: change registered office address and
// change registered email address. Both share the same OAuth screen (one sign-in-and-permission
// page, unlike HMRC's four-step journey) and the same review/result view ids.

import { expect, test } from "@playwright/test";
import { loggedClick, loggedFill, timestamp } from "../helpers/behaviour-helpers.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-companies-house-filing-steps";

export async function goToChangeRegisteredOffice(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = "Change Registered Office Address (Companies House)";
  await test.step(`The user navigates to ${activityButtonText} and sees the company number form`, async () => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-go-to-change-office.png` });
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting Change Registered Office Address", {
      screenshotPath,
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-go-to-change-office.png` });
    await expect(page.locator("#companyForm")).toBeVisible();
  });
}

export async function goToChangeRegisteredEmail(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = "Change Registered Email Address (Companies House)";
  await test.step(`The user navigates to ${activityButtonText} and sees the company number form`, async () => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-go-to-change-email.png` });
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting Change Registered Email Address", {
      screenshotPath,
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-go-to-change-email.png` });
    await expect(page.locator("#companyForm")).toBeVisible();
  });
}

export async function enterCompanyNumber(page, companyNumber, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user enters company number ${companyNumber}`, async () => {
    await loggedFill(page, "#companyNumber", companyNumber, "Company number", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-enter-company-number.png` });
    await loggedClick(page, "#companyLookupBtn", "Look up / check eligibility", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-enter-company-number.png` });
  });
}

export async function verifyCurrentAddressShown(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the current registered office address and the new address form", async () => {
    await expect(page.locator("#formView")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#currentAddressList")).not.toBeEmpty({ timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-current-address-shown.png` });
  });
}

export async function fillInNewAddress(page, address, screenshotPath = defaultScreenshotPath) {
  await test.step("The user fills in the new registered office address", async () => {
    await loggedFill(page, "#premises", address.premises, "Premises", { screenshotPath });
    await loggedFill(page, "#addressLine1", address.addressLine1, "Address line 1", { screenshotPath });
    if (address.addressLine2) {
      await loggedFill(page, "#addressLine2", address.addressLine2, "Address line 2", { screenshotPath });
    }
    await loggedFill(page, "#locality", address.locality, "Town or city", { screenshotPath });
    if (address.region) {
      await loggedFill(page, "#region", address.region, "County", { screenshotPath });
    }
    await loggedFill(page, "#postalCode", address.postalCode, "Postcode", { screenshotPath });
    if (address.country) {
      await page.selectOption("#country", address.country);
    }
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-fill-in-new-address.png` });
  });
}

export async function acceptOfficeAddressStatement(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user accepts the appropriate address statement and continues to review", async () => {
    await loggedClick(page, "#acceptOfficeStatement", "Accept the section 86(2) appropriate address statement", { screenshotPath });
    await loggedClick(page, "#continueBtn", "Continue", { screenshotPath });
    await expect(page.locator("#reviewView")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-accept-office-statement.png` });
  });
}

export async function fillInNewRegisteredEmail(page, email, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user fills in the new registered email address ${email}`, async () => {
    await loggedFill(page, "#registeredEmailAddress", email, "New registered email address", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-fill-in-new-email.png` });
  });
}

export async function acceptEmailAddressStatement(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user accepts the appropriate email address statement and continues to review", async () => {
    await loggedClick(page, "#acceptEmailStatement", "Accept the section 88A(2) appropriate email address statement", { screenshotPath });
    await loggedClick(page, "#continueBtn", "Continue", { screenshotPath });
    await expect(page.locator("#reviewView")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-accept-email-statement.png` });
  });
}

export async function verifyEligibilityAccepted(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the company is eligible and is offered the new email address form", async () => {
    await expect(page.locator("#formView")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-eligibility-accepted.png` });
  });
}

export async function verifyEligibilityRejected(page, expectedMessageFragment, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees the eligibility stop naming "${expectedMessageFragment}"`, async () => {
    await expect(page.locator("#statusMessagesContainer")).toContainText(expectedMessageFragment, { timeout: 15000 });
    await expect(page.locator("#companyView")).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-eligibility-rejected.png` });
  });
}

export async function authoriseWithCompaniesHouse(page, { userId, password, companyAuthCode }, screenshotPath = defaultScreenshotPath) {
  await test.step("The user signs in to Companies House and grants permission", async () => {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-authorise-with-companies-house.png` });
    await expect(page.locator("#userId")).toBeVisible({ timeout: 15000 });
    await loggedFill(page, "#userId", userId, "Companies House email address", { screenshotPath });
    await loggedFill(page, "#password", password, "Companies House password", { screenshotPath });
    await loggedFill(page, "#companyAuthCode", companyAuthCode, "Company authentication code", { screenshotPath });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-authorise-with-companies-house.png` });
    await Promise.all([page.waitForURL(/.*/, { timeout: 30000 }), loggedClick(page, "#givePermission", "Give permission")]);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-03-authorise-with-companies-house.png` });
  });
}

export async function submitFiling(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user reviews and files the change with Companies House", async () => {
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-submit-filing.png` });
    await loggedClick(page, "#submitFilingBtn", "File with Companies House", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-02-submit-filing.png` });
  });
}

export async function verifyFilingAccepted(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the filing accepted", async () => {
    await expect(page.locator("#resultView")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#filingResult")).toContainText("accepted", { timeout: 20000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-filing-accepted.png` });
  });
}

export async function verifyValidationErrorShown(page, expectedFragment, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees a validation error naming "${expectedFragment}"`, async () => {
    await expect(page.locator("#validationErrors")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#validationErrors")).toContainText(expectedFragment, { timeout: 20000 });
    await page.screenshot({ path: `${screenshotPath}/${timestamp()}-01-validation-error-shown.png` });
  });
}
