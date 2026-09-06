// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/changeRegisteredOffice.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import fs from "node:fs";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import { clickLogIn, loginWithCognitoOrMockAuth, verifyLoggedInStatus, logOutAndExpectToBeLoggedOut } from "./steps/behaviour-login-steps.js";
import {
  goToChangeRegisteredOffice,
  enterCompanyNumber,
  verifyCurrentAddressShown,
  fillInNewAddress,
  acceptOfficeAddressStatement,
  authoriseWithCompaniesHouse,
  submitFiling,
  verifyFilingAccepted,
  verifyValidationErrorShown,
  isCompaniesHouseSimulatorLane,
  resolveCompaniesHouseSignInCredentials,
  provisionCompaniesHouseTestCompany,
  releaseCompaniesHouseTestCompany,
} from "./steps/behaviour-companies-house-filing-steps.js";

dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, real credentials for the ci/prod lanes

const screenshotPath = "target/behaviour-test-results/screenshots/change-registered-office-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const testAuthPassword = getEnvVarAndLog("testAuthPassword", "TEST_AUTH_PASSWORD", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);

// The simulator's canned company fixture (see app/http-simulator/scenarios/filings.js). Outside
// the simulator lane, beforeAll below replaces this with a freshly created sandbox company.
let existingCompanyNumber = "06846849";
const validationErrorCompanyNumber = "00000422";

const newAddress = {
  premises: "13",
  addressLine1: "Bedford Road",
  locality: "Leeds",
  region: "West Yorkshire",
  postalCode: "LS12 3AB",
  country: "England",
};

let companiesHouseCredentials;
let testCompany;

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "changeRegisteredOfficeBehaviour" });
});

test.beforeAll(async () => {
  console.log("Starting beforeAll hook...");

  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = {
    ...originalEnv,
  };

  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);

  testCompany = await provisionCompaniesHouseTestCompany(envFilePath);
  if (testCompany.companyNumber) {
    existingCompanyNumber = testCompany.companyNumber;
  }
  companiesHouseCredentials = resolveCompaniesHouseSignInCredentials(testCompany.authCode, envFilePath);

  console.log("beforeAll hook completed successfully");
});

test.afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (mockOAuth2Process) {
    mockOAuth2Process.kill();
  }
  try {
    await dynamoControl?.stop?.();
  } catch {}
  await releaseCompaniesHouseTestCompany(testCompany);
});

test("Click through: change registered office address end to end and see the filing accepted", async ({ page }, testInfo) => {
  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);

  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);

  await goToChangeRegisteredOffice(page, screenshotPath);
  await enterCompanyNumber(page, existingCompanyNumber, screenshotPath);
  await verifyCurrentAddressShown(page, screenshotPath);
  await fillInNewAddress(page, newAddress, screenshotPath);
  await acceptOfficeAddressStatement(page, screenshotPath);

  // No Companies House token is held yet, so this redirects to the sign-in-and-permission page.
  await submitFiling(page, screenshotPath);
  await authoriseWithCompaniesHouse(page, companiesHouseCredentials, screenshotPath);
  await verifyFilingAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: change registered office address shows the validation error Companies House returns", async ({ page }, testInfo) => {
  test.skip(
    !isCompaniesHouseSimulatorLane(envFilePath),
    "The 422 validation-error company number is a simulator-only fixture; only the simulator lane can reproduce it.",
  );

  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);

  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);

  await goToChangeRegisteredOffice(page, screenshotPath);
  await enterCompanyNumber(page, validationErrorCompanyNumber, screenshotPath);
  await verifyCurrentAddressShown(page, screenshotPath);
  await fillInNewAddress(page, newAddress, screenshotPath);
  await acceptOfficeAddressStatement(page, screenshotPath);

  await submitFiling(page, screenshotPath);
  await authoriseWithCompaniesHouse(page, companiesHouseCredentials, screenshotPath);
  await verifyValidationErrorShown(page, "postal_code", screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: change registered office address re-authorises with Companies House when the token expires mid-journey", async ({
  page,
}, testInfo) => {
  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);

  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);

  // First pass: complete a filing so the page holds a Companies House token.
  await goToChangeRegisteredOffice(page, screenshotPath);
  await enterCompanyNumber(page, existingCompanyNumber, screenshotPath);
  await verifyCurrentAddressShown(page, screenshotPath);
  await fillInNewAddress(page, newAddress, screenshotPath);
  await acceptOfficeAddressStatement(page, screenshotPath);
  await submitFiling(page, screenshotPath);
  await authoriseWithCompaniesHouse(page, companiesHouseCredentials, screenshotPath);
  await verifyFilingAccepted(page, screenshotPath);

  // Second pass: start a new filing for the same company, then clear the token the page is
  // holding right before submitting - simulating it having expired while the form was open -
  // and confirm the page goes back through the Companies House screens rather than failing.
  await page.click("#startAgainBtn");
  await enterCompanyNumber(page, existingCompanyNumber, screenshotPath);
  await verifyCurrentAddressShown(page, screenshotPath);
  await fillInNewAddress(page, newAddress, screenshotPath);
  await acceptOfficeAddressStatement(page, screenshotPath);

  await page.evaluate(() => sessionStorage.removeItem("companiesHouseAccessToken"));

  await submitFiling(page, screenshotPath);
  await authoriseWithCompaniesHouse(page, companiesHouseCredentials, screenshotPath);
  await verifyFilingAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});
