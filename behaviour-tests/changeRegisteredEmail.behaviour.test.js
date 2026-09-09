// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/changeRegisteredEmail.behaviour.test.js

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
  goToChangeRegisteredEmail,
  enterCompanyNumber,
  authoriseWithCompaniesHouse,
  verifyEligibilityAccepted,
  verifyEligibilityRejected,
  fillInNewRegisteredEmail,
  acceptEmailAddressStatement,
  submitFiling,
  verifyFilingAccepted,
  isCompaniesHouseSimulatorLane,
  resolveCompaniesHouseSignInCredentials,
  provisionCompaniesHouseTestCompany,
  releaseCompaniesHouseTestCompany,
} from "./steps/behaviour-companies-house-filing-steps.js";

dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, real credentials for the ci/prod lanes

const screenshotPath = "target/behaviour-test-results/screenshots/change-registered-email-behaviour-test";

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
const noRegisteredEmailCompanyNumber = "00000001";
const newEmailAddress = "filings@example.co.uk";

let companiesHouseCredentials;
let testCompany;

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "changeRegisteredEmailBehaviour" });
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

test("Click through: change registered email address end to end and see the filing accepted", async ({ page }, testInfo) => {
  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);

  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);

  await goToChangeRegisteredEmail(page, screenshotPath);

  // The eligibility check itself carries Companies House OAuth scopes, so entering the company
  // number is what triggers the sign-in-and-permission redirect - before the eligibility answer
  // is known.
  await enterCompanyNumber(page, existingCompanyNumber, screenshotPath);
  await authoriseWithCompaniesHouse(page, companiesHouseCredentials, screenshotPath);
  await verifyEligibilityAccepted(page, screenshotPath);

  await fillInNewRegisteredEmail(page, newEmailAddress, screenshotPath);
  await acceptEmailAddressStatement(page, screenshotPath);

  // The token already covers this company and resource, so no further redirect happens here.
  await submitFiling(page, screenshotPath);
  await verifyFilingAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: change registered email address stops when the company has no registered email address to change", async ({
  page,
}, testInfo) => {
  test.skip(
    !isCompaniesHouseSimulatorLane(envFilePath),
    "The no-registered-email-address company number is a simulator-only fixture; only the simulator lane can reproduce it.",
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

  await goToChangeRegisteredEmail(page, screenshotPath);
  await enterCompanyNumber(page, noRegisteredEmailCompanyNumber, screenshotPath);
  await authoriseWithCompaniesHouse(page, companiesHouseCredentials, screenshotPath);
  await verifyEligibilityRejected(page, "no registered email address", screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});
