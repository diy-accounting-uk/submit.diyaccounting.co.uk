// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/steps/behaviour-companies-house-filing-steps.js
// Steps for the two Companies House filing journeys: change registered office address and
// change registered email address. Both share the same OAuth sign-in (GOV.UK One Login on the
// sandbox, one form on the simulator) and the same review/result view ids.

import { expect, test } from "@playwright/test";
import { TOTP, Secret } from "otpauth";
import { loggedClick, loggedFill, timestamp, takeScreenshot } from "../helpers/behaviour-helpers.js";
import { createTestCompany, deleteTestCompany } from "../../scripts/companies-house-test-company.js";

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-companies-house-filing-steps";

// The canned user only the simulator's OAuth stand-in accepts (see
// app/http-simulator/routes/companies-house-oauth.js).
const simulatorSignInCredentials = {
  userId: "synthetic-companies-house-user@test.diyaccounting.co.uk",
  password: "test-password",
};

/**
 * True when this run talks to the simulator's own Companies House OAuth stand-in rather than a
 * real identity service. The http-simulator only starts when TEST_HTTP_SIMULATOR=run, which only
 * .env.simulator sets; DIY_SUBMIT_ENV_FILEPATH naming .env.simulator is the same signal read a
 * second way, for a run that inherited the variable from a parent process.
 */
export function isCompaniesHouseSimulatorLane(envFilePath) {
  return process.env.TEST_HTTP_SIMULATOR === "run" || (envFilePath ?? "").includes(".env.simulator");
}

/**
 * The company the read-only lookup journeys look up. The simulator serves an invented company
 * under 00000001, the number Companies House's own filing API guide uses in its examples (see
 * app/http-simulator/scenarios/companies.js). Every other lane reads the live public data API,
 * where the record looked up is DIY Accounting Limited's own.
 */
export function companiesHouseLookupFixture(envFilePath) {
  if (isCompaniesHouseSimulatorLane(envFilePath)) {
    return { searchTerm: "Simulator Example", companyName: "SIMULATOR EXAMPLE COMPANY LIMITED", companyNumber: "00000001" };
  }
  return { searchTerm: "DIY Accounting", companyName: "DIY ACCOUNTING LIMITED", companyNumber: "06846849" };
}

/**
 * The Companies House sign-in the suite uses. Real credentials in the environment always win.
 * Outside the simulator lane, with no real credentials set, this throws rather than trying the
 * canned simulator user against a real identity service, where it cannot work.
 */
export function resolveCompaniesHouseSignInCredentials(companyAuthCode, envFilePath) {
  const userId = process.env.TEST_COMPANIES_HOUSE_USER_ID;
  const password = process.env.TEST_COMPANIES_HOUSE_PASSWORD;
  if (userId && password) {
    return { userId, password, companyAuthCode, totpSecret: process.env.TEST_COMPANIES_HOUSE_TOTP_SECRET };
  }
  if (userId || password) {
    throw new Error("Set both TEST_COMPANIES_HOUSE_USER_ID and TEST_COMPANIES_HOUSE_PASSWORD, or neither.");
  }
  if (isCompaniesHouseSimulatorLane(envFilePath)) {
    return { ...simulatorSignInCredentials, companyAuthCode: companyAuthCode ?? "test-auth-code", totpSecret: undefined };
  }
  throw new Error(
    "TEST_COMPANIES_HOUSE_USER_ID and TEST_COMPANIES_HOUSE_PASSWORD must be set to sign in to Companies House " +
      "outside the simulator lane. The canned simulator user only works against the simulator's OAuth stand-in.",
  );
}

/**
 * Creates a fresh sandbox test company for a run outside the simulator lane, using Companies
 * House's test data generator. On the simulator the suite keeps its canned fixture company, so
 * this returns nulls and provisions nothing.
 */
export async function provisionCompaniesHouseTestCompany(envFilePath) {
  if (isCompaniesHouseSimulatorLane(envFilePath)) {
    return { companyNumber: null, authCode: null, apiKey: null };
  }
  const apiKey = process.env.COMPANIES_HOUSE_SANDBOX_API_KEY;
  if (!apiKey) {
    throw new Error(
      "COMPANIES_HOUSE_SANDBOX_API_KEY must be set to create a Companies House sandbox test company outside the simulator lane.",
    );
  }
  const { companyNumber, authCode } = await createTestCompany(apiKey);
  return { companyNumber, authCode, apiKey };
}

/** Deletes the company `provisionCompaniesHouseTestCompany` created, a no-op on the simulator. */
export async function releaseCompaniesHouseTestCompany({ companyNumber, authCode, apiKey }) {
  if (!companyNumber) {
    return;
  }
  await deleteTestCompany(apiKey, companyNumber, authCode);
}

export async function goToChangeRegisteredOffice(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = "Change Registered Office Address (Companies House)";
  await test.step(`The user navigates to ${activityButtonText} and sees the company number form`, async () => {
    await page.waitForTimeout(500);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-go-to-change-office.png` });
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting Change Registered Office Address", {
      screenshotPath,
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-go-to-change-office.png` });
    await expect(page.locator("#companyForm")).toBeVisible();
  });
}

export async function goToChangeRegisteredEmail(page, screenshotPath = defaultScreenshotPath) {
  const activityButtonText = "Change Registered Email Address (Companies House)";
  await test.step(`The user navigates to ${activityButtonText} and sees the company number form`, async () => {
    await page.waitForTimeout(500);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-go-to-change-email.png` });
    await loggedClick(page, `button:has-text('${activityButtonText}')`, "Starting Change Registered Email Address", {
      screenshotPath,
      timeout: 60000,
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-go-to-change-email.png` });
    await expect(page.locator("#companyForm")).toBeVisible();
  });
}

export async function enterCompanyNumber(page, companyNumber, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user enters company number ${companyNumber}`, async () => {
    await loggedFill(page, "#companyNumber", companyNumber, "Company number", { screenshotPath });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-enter-company-number.png` });
    await loggedClick(page, "#companyLookupBtn", "Look up / check eligibility", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-enter-company-number.png` });
  });
}

export async function verifyCurrentAddressShown(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the current registered office address and the new address form", async () => {
    await expect(page.locator("#formView")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#currentAddressList")).not.toBeEmpty({ timeout: 15000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-current-address-shown.png` });
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
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-fill-in-new-address.png` });
  });
}

export async function acceptOfficeAddressStatement(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user accepts the appropriate address statement and continues to review", async () => {
    await loggedClick(page, "#acceptOfficeStatement", "Accept the section 86(2) appropriate address statement", { screenshotPath });
    await loggedClick(page, "#continueBtn", "Continue", { screenshotPath });
    await expect(page.locator("#reviewView")).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-accept-office-statement.png` });
  });
}

export async function fillInNewRegisteredEmail(page, email, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user fills in the new registered email address ${email}`, async () => {
    await loggedFill(page, "#registeredEmailAddress", email, "New registered email address", { screenshotPath });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-fill-in-new-email.png` });
  });
}

export async function acceptEmailAddressStatement(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user accepts the appropriate email address statement and continues to review", async () => {
    await loggedClick(page, "#acceptEmailStatement", "Accept the section 88A(2) appropriate email address statement", { screenshotPath });
    await loggedClick(page, "#continueBtn", "Continue", { screenshotPath });
    await expect(page.locator("#reviewView")).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-accept-email-statement.png` });
  });
}

export async function verifyEligibilityAccepted(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the company is eligible and is offered the new email address form", async () => {
    await expect(page.locator("#formView")).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-eligibility-accepted.png` });
  });
}

export async function verifyEligibilityRejected(page, expectedMessageFragment, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees the eligibility stop naming "${expectedMessageFragment}"`, async () => {
    await expect(page.locator("#statusMessagesContainer")).toContainText(expectedMessageFragment, { timeout: 15000 });
    await expect(page.locator("#companyView")).toBeVisible({ timeout: 15000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-eligibility-rejected.png` });
  });
}

const oneLoginLinkSelector = 'a:has-text("Go to GOV.UK One Login")';

async function clickContinue(page, description, screenshotPath) {
  await loggedClick(page, 'button:has-text("Continue")', description, { screenshotPath });
}

/** Types the six-digit authenticator code on GOV.UK One Login's enter-authenticator-app-code page. */
export async function handleCompaniesHouseAuthenticatorChallenge(page, totpSecret, screenshotPath = defaultScreenshotPath) {
  if (!totpSecret) {
    throw new Error("TEST_COMPANIES_HOUSE_TOTP_SECRET must be set: the Companies House sandbox sign-in asks for an authenticator code.");
  }

  await test.step("The user enters the GOV.UK One Login authenticator app code", async () => {
    await page.waitForSelector("#code", { state: "visible", timeout: 30000 });
    const totp = new TOTP({ secret: Secret.fromBase32(totpSecret), algorithm: "SHA1", digits: 6, period: 30 });
    await loggedFill(page, "#code", totp.generate(), "GOV.UK One Login authenticator code", { screenshotPath });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-authenticator-code-entered.png` });
    await clickContinue(page, "Continue after the authenticator code", screenshotPath);
    // The redirect to Companies House happens but the click's own navigation wait can time out,
    // so wait on the address leaving the code page instead of on a load state.
    await page.waitForURL((url) => !url.pathname.endsWith("/enter-authenticator-app-code"), { timeout: 30000, waitUntil: "commit" });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-authenticator-challenge-completed.png` });
  });
}

async function signInWithGovUkOneLogin(page, { userId, password, totpSecret }, screenshotPath) {
  await loggedClick(page, oneLoginLinkSelector, "Go to GOV.UK One Login", { screenshotPath });
  await loggedClick(page, "#sign-in-button", "Sign in to GOV.UK One Login", { screenshotPath });
  await loggedFill(page, "#email", userId, "GOV.UK One Login email address", { screenshotPath });
  await clickContinue(page, "Continue after the email address", screenshotPath);
  await loggedFill(page, "#password", password, "GOV.UK One Login password", { screenshotPath });
  await clickContinue(page, "Continue after the password", screenshotPath);
  await handleCompaniesHouseAuthenticatorChallenge(page, totpSecret, screenshotPath);
}

// A scope that names a company adds this page between One Login and the permission page.
async function enterCompanyAuthCodeIfAsked(page, companyAuthCode, screenshotPath) {
  await page.locator("#auth_code, #is_auth_confirmed").first().waitFor({ state: "visible", timeout: 30000 });
  if ((await page.locator("#auth_code").count()) === 0) {
    return;
  }
  if (!companyAuthCode) {
    throw new Error("Companies House asked for the company authentication code and none was supplied.");
  }
  await loggedFill(page, "#auth_code", companyAuthCode, "Company authentication code", { screenshotPath });
  await loggedClick(page, "#submit", "Continue after the company authentication code", { screenshotPath });
}

async function authoriseOnRealSandbox(page, credentials, screenshotPath) {
  await signInWithGovUkOneLogin(page, credentials, screenshotPath);
  await enterCompanyAuthCodeIfAsked(page, credentials.companyAuthCode, screenshotPath);
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-03-authorise-application.png` });
  await loggedClick(page, "#is_auth_confirmed", "Allow access", { screenshotPath });
}

async function authoriseOnSimulator(page, { userId, password, companyAuthCode }, screenshotPath) {
  await loggedFill(page, "#userId", userId, "Companies House email address", { screenshotPath });
  await loggedFill(page, "#password", password, "Companies House password", { screenshotPath });
  await loggedFill(page, "#companyAuthCode", companyAuthCode, "Company authentication code", { screenshotPath });
  await loggedClick(page, "#givePermission", "Give permission", { screenshotPath });
}

export async function authoriseWithCompaniesHouse(page, credentials, screenshotPath = defaultScreenshotPath) {
  await test.step("The user signs in to Companies House and grants permission", async () => {
    await page.waitForLoadState("networkidle");
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-authorise-with-companies-house.png` });
    await page.locator(`${oneLoginLinkSelector}, #userId`).first().waitFor({ state: "visible", timeout: 15000 });
    const startUrl = page.url();
    if (await page.locator("#userId").count()) {
      await authoriseOnSimulator(page, credentials, screenshotPath);
    } else {
      await authoriseOnRealSandbox(page, credentials, screenshotPath);
    }
    await page.waitForURL((url) => url.href !== startUrl && !/\/oauth2\/|signin\.account\.gov\.uk/.test(url.href), {
      timeout: 30000,
      waitUntil: "commit",
    });
    await page.waitForLoadState("networkidle");
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-04-authorise-with-companies-house.png` });
  });
}

export async function submitFiling(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user reviews and files the change with Companies House", async () => {
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-submit-filing.png` });
    await loggedClick(page, "#submitFilingBtn", "File with Companies House", { screenshotPath });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-02-submit-filing.png` });
  });
}

export async function verifyFilingAccepted(page, screenshotPath = defaultScreenshotPath) {
  await test.step("The user sees the filing accepted", async () => {
    await expect(page.locator("#resultView")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#filingResult")).toContainText("accepted", { timeout: 20000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-filing-accepted.png` });
  });
}

export async function verifyValidationErrorShown(page, expectedFragment, screenshotPath = defaultScreenshotPath) {
  await test.step(`The user sees a validation error naming "${expectedFragment}"`, async () => {
    await expect(page.locator("#validationErrors")).toBeVisible({ timeout: 20000 });
    await expect(page.locator("#validationErrors")).toContainText(expectedFragment, { timeout: 20000 });
    await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-01-validation-error-shown.png` });
  });
}
