// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/companiesHouse/fileMicroEntityAccounts.behaviour.test.js

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
  goToFileMicroEntityAccounts,
  goToFileSmallCompanyAccounts,
  fillInSmallCompanyAccountsForm,
  verifyPreviewContains,
  enterCompanyNumberAndLookUp,
  verifyCompanyLookedUp,
  fillInAccountsForm,
  previewAccounts,
  setGovTestScenario,
  enterCompanyAuthCodeAndSubmit,
  verifyFilingAccepted,
  verifyFilingRejected,
} from "../steps/behaviour-companies-house-accounts-steps.js";
import { companiesHouseLookupFixture } from "../steps/behaviour-companies-house-filing-steps.js";

dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, real credentials for the ci/prod lanes

const screenshotPath = "target/behaviour-test-results/screenshots/file-micro-entity-accounts-behaviour-test";

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

function balancedYear({ fixedAssets, currentAssets, creditorsWithinOneYear, calledUpShareCapital, profitAndLossAccount }) {
  const creditorsAfterOneYear = 0;
  const capitalAndReserves = fixedAssets + (currentAssets - creditorsWithinOneYear) - creditorsAfterOneYear;
  return {
    fixedAssets,
    currentAssets,
    creditorsWithinOneYear,
    creditorsAfterOneYear,
    calledUpShareCapital,
    profitAndLossAccount,
    capitalAndReserves,
  };
}

function buildAccounts() {
  return {
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    balanceSheet: {
      currentYear: balancedYear({
        fixedAssets: 1000,
        currentAssets: 5000,
        creditorsWithinOneYear: 2000,
        calledUpShareCapital: 100,
        profitAndLossAccount: 3900,
      }),
      priorYear: balancedYear({
        fixedAssets: 900,
        currentAssets: 3500,
        creditorsWithinOneYear: 1500,
        calledUpShareCapital: 100,
        profitAndLossAccount: 1900,
      }),
    },
    averageEmployees: 2,
    director: { name: "Jo Director", dateApproved: "2026-01-15" },
  };
}

function buildSmallCompanyAccounts({ withComparatives = false } = {}) {
  const currentYear = {
    profitAndLoss: { turnover: 20000, costOfSales: 5000, administrativeExpenses: 12000, interestReceivable: 0, tax: 600 },
    balanceSheet: {
      fixedAssets: 1000,
      stocks: 500,
      debtors: 2500,
      cashAtBank: 2000,
      tradeCreditors: 1000,
      corporationTax: 700,
      otherCreditors: 300,
      creditorsAfterOneYear: 0,
      calledUpShareCapital: 100,
      profitAndLossAccount: 3900,
    },
  };
  const priorYear = {
    profitAndLoss: { turnover: 15000, costOfSales: 4000, administrativeExpenses: 10000, interestReceivable: 0, tax: 200 },
    balanceSheet: {
      fixedAssets: 900,
      stocks: 400,
      debtors: 1500,
      cashAtBank: 1600,
      tradeCreditors: 900,
      corporationTax: 500,
      otherCreditors: 100,
      creditorsAfterOneYear: 0,
      calledUpShareCapital: 100,
      profitAndLossAccount: 2800,
    },
  };
  return {
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    currentYear,
    ...(withComparatives ? { priorYear } : {}),
    principalActivity: "Software consultancy",
    accountingPolicies: "The accounts are prepared under the historical cost convention.",
    averageEmployees: 2,
    directors: ["Jo Director", "Alex Jones"],
    dateApproved: "2026-01-15",
  };
}

const companyAuthCode = "AB12CD";

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "fileMicroEntityAccountsBehaviour" });
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

test("Click through: file micro-entity accounts end to end and see the filing accepted", async ({ page }, testInfo) => {
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

  await goToFileMicroEntityAccounts(page, screenshotPath);
  await enterCompanyNumberAndLookUp(page, companyNumber, screenshotPath);
  await verifyCompanyLookedUp(page, companyName, companyNumber, screenshotPath);
  await fillInAccountsForm(page, buildAccounts(), screenshotPath);
  await previewAccounts(page, screenshotPath);
  await enterCompanyAuthCodeAndSubmit(page, companyAuthCode, screenshotPath);
  await verifyFilingAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: file micro-entity accounts shows the reject reason Companies House returns", async ({ page }, testInfo) => {
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

  await goToFileMicroEntityAccounts(page, screenshotPath);
  await enterCompanyNumberAndLookUp(page, companyNumber, screenshotPath);
  await verifyCompanyLookedUp(page, companyName, companyNumber, screenshotPath);
  await fillInAccountsForm(page, buildAccounts(), screenshotPath);
  await previewAccounts(page, screenshotPath);
  await setGovTestScenario(page, "ACCOUNTS_REJECTED", screenshotPath);
  await enterCompanyAuthCodeAndSubmit(page, companyAuthCode, screenshotPath);
  await verifyFilingRejected(page, "1", screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
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

test("Click through: file small company accounts in full with comparatives and see the filing accepted", async ({ page }, testInfo) => {
  addOnPageLogging(page);
  fs.mkdirSync(testInfo.outputPath(""), { recursive: true });

  await signInWithResidentBundle(page, baseUrl);
  await goToFileSmallCompanyAccounts(page, screenshotPath);
  await enterCompanyNumberAndLookUp(page, companyNumber, screenshotPath);
  await verifyCompanyLookedUp(page, companyName, companyNumber, screenshotPath);
  await fillInSmallCompanyAccountsForm(page, buildSmallCompanyAccounts({ withComparatives: true }), {}, screenshotPath);
  await previewAccounts(page, screenshotPath);
  await verifyPreviewContains(
    page,
    ["core:TurnoverRevenue", "Profit and loss account", "Directors' report", 'contextRef="y2024"'],
    ["section 444(5A)"],
    screenshotPath,
  );
  await enterCompanyAuthCodeAndSubmit(page, companyAuthCode, screenshotPath);
  await verifyFilingAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: file filleted small company accounts and see the filing accepted", async ({ page }, testInfo) => {
  addOnPageLogging(page);
  fs.mkdirSync(testInfo.outputPath(""), { recursive: true });

  await signInWithResidentBundle(page, baseUrl);
  await goToFileSmallCompanyAccounts(page, screenshotPath);
  await enterCompanyNumberAndLookUp(page, companyNumber, screenshotPath);
  await verifyCompanyLookedUp(page, companyName, companyNumber, screenshotPath);
  await fillInSmallCompanyAccountsForm(page, buildSmallCompanyAccounts(), { filleted: true }, screenshotPath);
  await previewAccounts(page, screenshotPath);
  await verifyPreviewContains(
    page,
    ["section 444(5A)", "core:NetAssetsLiabilities"],
    ["core:TurnoverRevenue", "Directors' report"],
    screenshotPath,
  );
  await enterCompanyAuthCodeAndSubmit(page, companyAuthCode, screenshotPath);
  await verifyFilingAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});
