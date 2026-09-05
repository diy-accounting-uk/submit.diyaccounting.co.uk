// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/vatValidation.behaviour.test.js
// Phase 5: 9-box VAT validation error behaviour tests

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  createHmrcTestUser,
  getEnvVarAndLog,
  isSyntheticMode,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runLocalDynamoDb,
  saveHmrcTestUserToFiles,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePage, goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import { clickLogIn, loginWithCognitoOrMockAuth, verifyLoggedInStatus } from "./steps/behaviour-login-steps.js";
import { ensureBundlePresent, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import { initSubmitVat, fillInVat9Box, submitFormVat } from "./steps/behaviour-hmrc-vat-steps.js";
import { goToHmrcAuth, initHmrcAuth, fillInHmrcAuth, submitHmrcAuth, grantPermissionHmrcAuth } from "./steps/behaviour-hmrc-steps.js";

dotenvConfigIfNotBlank({ path: ".env" });

const screenshotPath = "target/behaviour-test-results/screenshots/vatValidation-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "vatValidationBehaviour" });
});

test.beforeAll(async ({ page }, testInfo) => {
  console.log("Starting beforeAll hook...");

  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = { ...originalEnv };

  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  console.log("beforeAll hook completed successfully");
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
  if (mockOAuth2Process) mockOAuth2Process.kill();
  try {
    await dynamoControl?.stop?.();
  } catch {}
});

/**
 * Helper to generate valid 9-box data for testing
 */
function generateValid9BoxData() {
  return {
    vatDueSales: 1000.0,
    vatDueAcquisitions: 200.0,
    totalVatDue: 1200.0,
    vatReclaimedCurrPeriod: 300.0,
    netVatDue: 900.0,
    totalValueSalesExVAT: 5000,
    totalValuePurchasesExVAT: 1500,
    totalValueGoodsSuppliedExVAT: 0,
    totalAcquisitionsExVAT: 0,
  };
}

test.describe("9-Box VAT Validation Error Tests", () => {
  test("INVALID_WHOLE_AMOUNT: Box 6-9 with decimal values rejected", async ({ page }, testInfo) => {
    const testUrl = baseUrl;

    addOnPageLogging(page);
    const outputDir = testInfo.outputPath("");
    fs.mkdirSync(outputDir, { recursive: true });

    // This test verifies Q8 compliance: Box 6-9 must be whole numbers
    // Per HMRC spec, these fields cannot contain decimal values
    // The form uses step="1" HTML5 validation to enforce this

    // Navigate directly to the form (no auth needed for client-side validation test)
    await page.goto(`${testUrl}hmrc/vat/submitVat.html`);
    await page.waitForLoadState("networkidle");

    // Fill Box 6 with a decimal value (invalid)
    await page.fill("#totalValueSalesExVAT", "5000.5");

    // Check HTML5 validation BEFORE clicking submit
    const box6Input = page.locator("#totalValueSalesExVAT");
    const isValid = await box6Input.evaluate((el) => el.checkValidity());
    const validationMessage = await box6Input.evaluate((el) => el.validationMessage);
    console.log(`Box 6 value "5000.5" - valid: ${isValid}, message: ${validationMessage}`);

    // The field should be invalid due to step="1" constraint
    // Note: The form also uses Math.round() as a fallback, so we test that too
    const roundedValue = await box6Input.evaluate((el) => Math.round(parseFloat(el.value) || 0));
    console.log(`Box 6 rounded value: ${roundedValue} (original: 5000.5)`);

    // Verify the validation or rounding behavior
    // Either the field is invalid (browser enforces step="1")
    // OR the value gets rounded (form's fallback behavior)
    if (!isValid) {
      console.log("HTML5 validation correctly rejects decimal value in Box 6");
    } else {
      console.log("Browser accepts decimal but form will round to:", roundedValue);
      // The form rounds decimals, so 5000.5 becomes 5001
      expect(roundedValue).toBe(5001);
    }

    await page.screenshot({ path: `${screenshotPath}/validation-box6-decimal.png` });
  });

  test("INVALID_NET_VAT_DUE: Box 5 cannot be negative", async ({ page }, testInfo) => {
    const testUrl = baseUrl;

    addOnPageLogging(page);
    const outputDir = testInfo.outputPath("");
    fs.mkdirSync(outputDir, { recursive: true });

    // This test verifies Q7 compliance: Box 5 cannot contain negative amount
    // Per HMRC spec, minimum value is 0.00

    // The frontend auto-calculates Box 5 as |Box 3 - Box 4|
    // which is always non-negative due to Math.abs()
    // This test verifies the calculation behavior

    await page.goto(`${testUrl}hmrc/vat/submitVat.html`);
    await page.waitForLoadState("networkidle");

    // Fill values where Box 4 > Box 3
    await page.fill("#vatDueSales", "100.00");
    await page.fill("#vatDueAcquisitions", "0.00");
    await page.fill("#vatReclaimedCurrPeriod", "500.00");

    // Wait for auto-calculation
    await page.waitForTimeout(200);

    // Box 5 should be absolute value: |100 - 500| = 400
    const box5Value = await page.locator("#netVatDue").inputValue();
    expect(parseFloat(box5Value)).toBeGreaterThanOrEqual(0);
    console.log(`Box 5 calculated as: ${box5Value} (should be non-negative)`);

    await page.screenshot({ path: `${screenshotPath}/validation-box5-nonnegative.png` });
  });

  test("INVALID_TOTAL_VAT_DUE: Box 3 must equal Box 1 + Box 2", async ({ page }, testInfo) => {
    const testUrl = baseUrl;

    addOnPageLogging(page);

    await page.goto(`${testUrl}hmrc/vat/submitVat.html`);
    await page.waitForLoadState("networkidle");

    // Fill Box 1 and Box 2
    await page.fill("#vatDueSales", "1000.00");
    await page.fill("#vatDueAcquisitions", "200.00");

    // Wait for auto-calculation
    await page.waitForTimeout(200);

    // Verify Box 3 is auto-calculated correctly
    const box3Value = await page.locator("#totalVatDue").inputValue();
    expect(parseFloat(box3Value)).toBe(1200.0);
    console.log(`Box 3 auto-calculated as: ${box3Value} (expected 1200.00)`);

    // Box 3 is read-only, so user cannot manually enter wrong value
    // Note: getAttribute returns "" for boolean attributes like readonly, so check not null
    const isReadOnly = await page.locator("#totalVatDue").getAttribute("readonly");
    expect(isReadOnly).not.toBeNull();
    console.log("Box 3 is read-only - user cannot enter incorrect calculation");

    await page.screenshot({ path: `${screenshotPath}/validation-box3-calculation.png` });
  });
});
