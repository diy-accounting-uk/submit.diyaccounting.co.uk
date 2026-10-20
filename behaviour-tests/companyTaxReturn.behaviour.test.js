// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/companyTaxReturn.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import fs from "node:fs";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  isSyntheticMode,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePage, goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  verifyLoggedInStatus,
  logOutAndExpectToBeLoggedOut,
} from "./steps/behaviour-login-steps.js";
import { ensureBundlePresent, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import { enterCompanyNumberAndLookUp, verifyCompanyLookedUp } from "./steps/behaviour-companies-house-accounts-steps.js";
import {
  goToFileCompanyTaxReturn,
  fillInCompanyTaxReturnForm,
  previewCompanyTaxReturn,
  setCtGovTestScenario,
  enterGatewayCredentialsAndSubmit,
  verifyReturnAccepted,
  verifyReturnRejectedAndRetryable,
} from "./steps/behaviour-hmrc-company-tax-return-steps.js";
import { companiesHouseLookupFixture } from "./steps/behaviour-companies-house-filing-steps.js";
import { buildCtReturnExportFromBook, FIXTURE_UTR } from "@app/test-helpers/ctReturnFixture.js";

dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, real credentials for the ci/prod lanes

const screenshotPath = "target/behaviour-test-results/screenshots/company-tax-return-behaviour-test";

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

const { companyNumber, companyName } = companiesHouseLookupFixture(envFilePath);

const gatewayCredentials = { userId: "dummy-gateway-user", password: "dummy-gateway-password" };

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "companyTaxReturnBehaviour" });
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

async function signInWithResidentBundle(page, testUrl) {
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
}

async function reachPreview(page, testInfo) {
  addOnPageLogging(page);
  fs.mkdirSync(testInfo.outputPath(""), { recursive: true });

  const bookExport = await buildCtReturnExportFromBook();

  await signInWithResidentBundle(page, baseUrl);
  await goToFileCompanyTaxReturn(page, screenshotPath);
  await enterCompanyNumberAndLookUp(page, companyNumber, screenshotPath);
  await verifyCompanyLookedUp(page, companyName, companyNumber, screenshotPath);
  await fillInCompanyTaxReturnForm(page, { utr: FIXTURE_UTR, bookExport, declarantName: bookExport.director.name }, screenshotPath);
  await previewCompanyTaxReturn(page, screenshotPath);
}

test("Click through: file the Company Tax Return and see HMRC accept it with its IRmark", async ({ page }, testInfo) => {
  await reachPreview(page, testInfo);
  await enterGatewayCredentialsAndSubmit(page, gatewayCredentials, screenshotPath);
  await verifyReturnAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: file the Company Tax Return shows the error HMRC returns and allows another attempt", async ({ page }, testInfo) => {
  await reachPreview(page, testInfo);
  await setCtGovTestScenario(page, "CT600_REJECT_IRMARK", screenshotPath);
  await enterGatewayCredentialsAndSubmit(page, gatewayCredentials, screenshotPath);
  await verifyReturnRejectedAndRetryable(page, "2021", screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});
