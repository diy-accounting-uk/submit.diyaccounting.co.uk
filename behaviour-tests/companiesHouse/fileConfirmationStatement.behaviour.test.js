// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/companiesHouse/fileConfirmationStatement.behaviour.test.js

import { test } from "../helpers/playwrightTestWithout.js";
import fs from "node:fs";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  isSyntheticMode,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
} from "../helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePage, goToHomePageExpectNotLoggedIn } from "../steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  verifyLoggedInStatus,
  logOutAndExpectToBeLoggedOut,
} from "../steps/behaviour-login-steps.js";
import { ensureBundlePresent, goToBundlesPage } from "../steps/behaviour-bundle-steps.js";
import {
  confirmationStatementCompanyFixture,
  resolveConfirmationStatementCompanyAuthCode,
  goToFileConfirmationStatement,
  enterCompanyNumberAndLookUp,
  verifyCompanyLookedUp,
  enterCompanyAuthCodeAndReadRegister,
  verifyReviewFormPopulated,
  tryPreviewWithBlankPersonalCodes,
  fillInDirectorPersonalCodes,
  acceptLawfulPurposeStatement,
  previewConfirmationStatement,
  setGovTestScenario,
  submitConfirmationStatementFiling,
  verifyFilingAccepted,
  verifyFilingRejected,
  payConfirmationStatementFeeDirectly,
  payAndSubmitViaSimulatorCheckout,
} from "../steps/behaviour-companies-house-confirmation-steps.js";
import { isCompaniesHouseSimulatorLane } from "../steps/behaviour-companies-house-filing-steps.js";

dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, real credentials for the ci/prod lanes

const screenshotPath = "target/behaviour-test-results/screenshots/file-confirmation-statement-behaviour-test";

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

const { companyNumber, companyName } = confirmationStatementCompanyFixture(envFilePath);
const companyAuthCode = resolveConfirmationStatementCompanyAuthCode(envFilePath);
// The simulator's PaymentPeriodsRequest answers unpaid unless the caller sends its own
// Gov-Test-Scenario, which the submit route's fee-gate check never forwards (that header is for
// the submission itself) - so every simulator-lane submit needs the fee paid first. Outside the
// simulator this filing is on the operator's own company, covered by
// COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS.
const simulatorLane = isCompaniesHouseSimulatorLane(envFilePath);

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "fileConfirmationStatementBehaviour" });
});

test.beforeAll(async () => {
  console.log("Starting beforeAll hook...");

  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = {
    ...originalEnv,
  };
  // Unset outside a real deployment (CDK wires it from DiyaGlStack's allowed origins plus this
  // deployment's own origin - see billingReturnUrl.js) - the local server needs its own origin
  // listed so the checkout redirect in payAndSubmitViaSimulatorCheckout lands back on this page
  // rather than falling back to the site root.
  if (baseUrl) {
    process.env.BILLING_RETURN_URL_ORIGINS = new URL(baseUrl).origin;
  }

  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);

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
});

test("Click through: file a confirmation statement end to end and see the filing accepted", async ({ page }, testInfo) => {
  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);

  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);

  await goToBundlesPage(page, screenshotPath);
  if (isSyntheticMode()) {
    await ensureBundlePresent(page, "Resident", screenshotPath, { testPass: true });
  }
  await goToHomePage(page, screenshotPath);

  await goToFileConfirmationStatement(page, screenshotPath);
  await enterCompanyNumberAndLookUp(page, companyNumber, screenshotPath);
  await verifyCompanyLookedUp(page, companyName, companyNumber, screenshotPath);
  await enterCompanyAuthCodeAndReadRegister(page, companyAuthCode, screenshotPath);
  await verifyReviewFormPopulated(page, screenshotPath);
  if (simulatorLane) {
    const reviewDate = await page.locator("#reviewDate").inputValue();
    await payConfirmationStatementFeeDirectly(page, { companyNumber, reviewDate }, screenshotPath);
  }
  await fillInDirectorPersonalCodes(page, undefined, screenshotPath);
  await acceptLawfulPurposeStatement(page, screenshotPath);
  await previewConfirmationStatement(page, screenshotPath);
  await submitConfirmationStatementFiling(page, screenshotPath);
  await verifyFilingAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: file a confirmation statement shows the reject reason Companies House returns", async ({ page }, testInfo) => {
  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);

  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);

  await goToBundlesPage(page, screenshotPath);
  if (isSyntheticMode()) {
    await ensureBundlePresent(page, "Resident", screenshotPath, { testPass: true });
  }
  await goToHomePage(page, screenshotPath);

  await goToFileConfirmationStatement(page, screenshotPath);
  await enterCompanyNumberAndLookUp(page, companyNumber, screenshotPath);
  await verifyCompanyLookedUp(page, companyName, companyNumber, screenshotPath);
  await enterCompanyAuthCodeAndReadRegister(page, companyAuthCode, screenshotPath);
  await verifyReviewFormPopulated(page, screenshotPath);
  if (simulatorLane) {
    const reviewDate = await page.locator("#reviewDate").inputValue();
    await payConfirmationStatementFeeDirectly(page, { companyNumber, reviewDate }, screenshotPath);
  }
  await fillInDirectorPersonalCodes(page, undefined, screenshotPath);
  await acceptLawfulPurposeStatement(page, screenshotPath);
  await previewConfirmationStatement(page, screenshotPath);
  await setGovTestScenario(page, "CS_SHAREHOLDERS_REQUIRED", screenshotPath);
  await submitConfirmationStatementFiling(page, screenshotPath);
  await verifyFilingRejected(page, "11686", screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: file a confirmation statement blocks submission when a director's personal code is blank", async ({
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

  await goToBundlesPage(page, screenshotPath);
  if (isSyntheticMode()) {
    await ensureBundlePresent(page, "Resident", screenshotPath, { testPass: true });
  }
  await goToHomePage(page, screenshotPath);

  await goToFileConfirmationStatement(page, screenshotPath);
  await enterCompanyNumberAndLookUp(page, companyNumber, screenshotPath);
  await verifyCompanyLookedUp(page, companyName, companyNumber, screenshotPath);
  await enterCompanyAuthCodeAndReadRegister(page, companyAuthCode, screenshotPath);
  await verifyReviewFormPopulated(page, screenshotPath);
  await tryPreviewWithBlankPersonalCodes(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: file a confirmation statement pays the fee via checkout and sees the filing accepted", async ({ page }, testInfo) => {
  test.skip(!simulatorLane, "Only the simulator lane auto-completes a Stripe checkout without a real card.");

  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);

  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);

  await goToBundlesPage(page, screenshotPath);
  if (isSyntheticMode()) {
    await ensureBundlePresent(page, "Resident", screenshotPath, { testPass: true });
  }
  await goToHomePage(page, screenshotPath);

  await goToFileConfirmationStatement(page, screenshotPath);
  await enterCompanyNumberAndLookUp(page, companyNumber, screenshotPath);
  await verifyCompanyLookedUp(page, companyName, companyNumber, screenshotPath);
  await enterCompanyAuthCodeAndReadRegister(page, companyAuthCode, screenshotPath);
  await verifyReviewFormPopulated(page, screenshotPath);
  await fillInDirectorPersonalCodes(page, undefined, screenshotPath);
  await acceptLawfulPurposeStatement(page, screenshotPath);
  await previewConfirmationStatement(page, screenshotPath);

  // Fee due, no charge paid yet: "Pay and submit" redirects to the simulator's auto-completing
  // checkout and back, landing on authView - the company authentication code is never carried
  // across that round trip, so it is entered again before the filing resumes.
  const reviewDate = await page.locator("#reviewDate").inputValue();
  await payAndSubmitViaSimulatorCheckout(page, { companyAuthCode, companyNumber, reviewDate }, screenshotPath);
  await verifyReviewFormPopulated(page, screenshotPath);
  await fillInDirectorPersonalCodes(page, undefined, screenshotPath);
  await acceptLawfulPurposeStatement(page, screenshotPath);
  await previewConfirmationStatement(page, screenshotPath);
  await submitConfirmationStatementFiling(page, screenshotPath);
  await verifyFilingAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});
