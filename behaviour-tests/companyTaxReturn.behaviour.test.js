// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/companyTaxReturn.behaviour.test.js

import { expect } from "@playwright/test";
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
import {
  enterCompanyNumberAndLookUp,
  verifyCompanyLookedUp,
  writeBuiltIxbrlFile,
} from "./steps/behaviour-companies-house-accounts-steps.js";
import {
  goToFileCompanyTaxReturn,
  fillInCompanyTaxReturnForm,
  fillInCompanyTaxReturnFormFromIxbrl,
  typeInCompanyTaxReturnForm,
  changeAnAnswerFromTheReview,
  previewCompanyTaxReturn,
  setCtGovTestScenario,
  enterGatewayCredentialsAndSubmit,
  verifyMicroEntityReview,
  verifyReturnAccepted,
  verifyReturnRejectedAndRetryable,
  chooseToSendToCompaniesHouseAndHmrc,
  verifyJointReview,
  enterJointCredentialsAndSubmit,
  submitJointExpectingGatewayError,
  verifyBothAccepted,
  verifyAccountsLocked,
  verifyCompaniesHouseRejected,
  verifyNothingFiledAtCompaniesHouse,
  clearGovTestScenario,
  returnToReviewToSendAgain,
  verifyOnlyTheTaxReturnIsLeftToSend,
  resendTheTaxReturn,
  verifyCompaniesHouseAccepted,
  verifyCompaniesHouseStillPending,
  sendTheTaxReturnNow,
  waitForCompaniesHouse,
  countRequestsTo,
  readReceiptsOfTheFilings,
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

async function reachCompanyForm(page, testInfo) {
  addOnPageLogging(page);
  fs.mkdirSync(testInfo.outputPath(""), { recursive: true });

  await signInWithResidentBundle(page, baseUrl);
  await goToFileCompanyTaxReturn(page, screenshotPath);
  await enterCompanyNumberAndLookUp(page, companyNumber, screenshotPath);
  await verifyCompanyLookedUp(page, companyName, companyNumber, screenshotPath);
}

async function reachPreview(page, testInfo) {
  const bookExport = await buildCtReturnExportFromBook();
  await reachCompanyForm(page, testInfo);
  await fillInCompanyTaxReturnForm(page, { utr: FIXTURE_UTR, declarantName: bookExport.director.name }, screenshotPath);
  await previewCompanyTaxReturn(page, screenshotPath);
}

test("Click through: file the Company Tax Return from a book, change an answer from the review and see HMRC accept it with its IRmark", async ({
  page,
}, testInfo) => {
  await reachPreview(page, testInfo);
  await changeAnAnswerFromTheReview(page, { fieldId: "declarantStatus", value: "Finance Director" }, screenshotPath);
  await enterGatewayCredentialsAndSubmit(page, gatewayCredentials, screenshotPath);
  await verifyReturnAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: file a micro-entity's Company Tax Return from a book and see HMRC accept it", async ({ page }, testInfo) => {
  const bookExport = await buildCtReturnExportFromBook();
  await reachCompanyForm(page, testInfo);
  await fillInCompanyTaxReturnForm(page, { utr: FIXTURE_UTR, declarantName: bookExport.director.name, regime: "micro" }, screenshotPath);
  await previewCompanyTaxReturn(page, screenshotPath);
  await verifyMicroEntityReview(page, screenshotPath);
  await enterGatewayCredentialsAndSubmit(page, gatewayCredentials, screenshotPath);
  await verifyReturnAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: file a micro-entity's Company Tax Return from an iXBRL accounts document and see HMRC accept it", async ({
  page,
}, testInfo) => {
  const ixbrlFile = writeBuiltIxbrlFile("micro-entity-accounts", { companyNumber, companyName }, testInfo.outputPath("ixbrl"));
  await reachCompanyForm(page, testInfo);
  await fillInCompanyTaxReturnFormFromIxbrl(
    page,
    {
      ixbrlFile,
      expectedStatus: "(FRS 102 2026 taxonomy) for the period 2025-04-01 to 2026-03-31.",
      utr: FIXTURE_UTR,
      declarantName: "Antony Christopher Cartwright",
    },
    screenshotPath,
  );
  await previewCompanyTaxReturn(page, screenshotPath);
  await verifyMicroEntityReview(page, screenshotPath);
  await enterGatewayCredentialsAndSubmit(page, gatewayCredentials, screenshotPath);
  await verifyReturnAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: type the Company Tax Return, change an answer from the review and see HMRC accept it", async ({ page }, testInfo) => {
  await reachCompanyForm(page, testInfo);
  await typeInCompanyTaxReturnForm(page, screenshotPath);
  await previewCompanyTaxReturn(page, screenshotPath);
  await changeAnAnswerFromTheReview(page, { fieldId: "declarantStatus", value: "Finance Director" }, screenshotPath);
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

const companyAuthCode = "AB12CD";
const JOINT_FILING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function reachJointReview(page, testInfo, { copy = "full", receives }) {
  await reachCompanyForm(page, testInfo);
  await typeInCompanyTaxReturnForm(page, screenshotPath);
  await chooseToSendToCompaniesHouseAndHmrc(page, { copy }, screenshotPath);
  await previewCompanyTaxReturn(page, screenshotPath);
  await verifyJointReview(page, { receives }, screenshotPath);
}

test("Click through: file the accounts at Companies House and the Company Tax Return at HMRC together, and see both receipts under one filing", async ({
  page,
}, testInfo) => {
  const accountsPosts = await countRequestsTo(page, "/api/v1/companies-house/accounts", "POST");
  const returnPosts = await countRequestsTo(page, "/api/v1/hmrc/ct/return", "POST");
  await reachJointReview(page, testInfo, { receives: "The full accounts, including the profit and loss account" });
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);
  await verifyAccountsLocked(page, screenshotPath);
  expect([accountsPosts.count, returnPosts.count]).toEqual([1, 1]);

  const receipts = await readReceiptsOfTheFilings(page);
  const accounts = receipts.find((entry) => entry.kind === "companies-house-accounts");
  const taxReturn = receipts.find((entry) => entry.kind === "company-tax-return");
  expect(accounts.receipt.jointFilingId).toMatch(JOINT_FILING_ID_PATTERN);
  expect(taxReturn.receipt.jointFilingId).toBe(accounts.receipt.jointFilingId);
  expect(taxReturn.listedJointFilingId).toBe(accounts.receipt.jointFilingId);
  expect(accounts.receipt.filedDocument).toContain("FullAccounts");

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: the filleted copy goes to Companies House and the full accounts go to HMRC", async ({ page }, testInfo) => {
  await reachJointReview(page, testInfo, {
    copy: "filleted",
    receives: "Filleted accounts. The profit and loss account and the directors' report are left out",
  });
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);

  const receipts = await readReceiptsOfTheFilings(page);
  const accounts = receipts.find((entry) => entry.kind === "companies-house-accounts");
  const taxReturn = receipts.find((entry) => entry.kind === "company-tax-return");
  expect(accounts.receipt.filedDocument).toContain("FilletedAccounts");
  expect(Buffer.from(taxReturn.receipt.filed.accountsIxbrl, "utf8").toString()).toContain("FullAccounts");

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: a Companies House gateway error and a rejection send nothing to HMRC, and the fixed accounts then go to both", async ({
  page,
}, testInfo) => {
  const returnPosts = await countRequestsTo(page, "/api/v1/hmrc/ct/return", "POST");
  await reachJointReview(page, testInfo, { receives: "The full accounts" });

  await setCtGovTestScenario(page, "SCHEMA_FAILURE", screenshotPath);
  await submitJointExpectingGatewayError(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyNothingFiledAtCompaniesHouse(page, screenshotPath);

  await setCtGovTestScenario(page, "ACCOUNTS_REJECTED", screenshotPath);
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyCompaniesHouseRejected(page, screenshotPath);
  expect(returnPosts.count).toBe(0);

  await returnToReviewToSendAgain(page, screenshotPath);
  await clearGovTestScenario(page);
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: HMRC rejects the Company Tax Return after Companies House accepts the accounts, and only the return is sent again", async ({
  page,
}, testInfo) => {
  const accountsPosts = await countRequestsTo(page, "/api/v1/companies-house/accounts", "POST");
  await reachJointReview(page, testInfo, { receives: "The full accounts" });

  await setCtGovTestScenario(page, "CT600_REJECT_IRMARK", screenshotPath);
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyCompaniesHouseAccepted(page, screenshotPath);
  await verifyReturnRejectedAndRetryable(page, "2021", screenshotPath);
  await verifyOnlyTheTaxReturnIsLeftToSend(page, screenshotPath);

  await clearGovTestScenario(page);
  await changeAnAnswerFromTheReview(page, { fieldId: "declarantStatus", value: "Finance Director" }, screenshotPath);
  await resendTheTaxReturn(page, { password: gatewayCredentials.password }, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);
  await verifyAccountsLocked(page, screenshotPath);
  expect(accountsPosts.count).toBe(1);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: send the Company Tax Return while Companies House is pending, then see Companies House accept and lock the accounts", async ({
  page,
}, testInfo) => {
  await reachJointReview(page, testInfo, { receives: "The full accounts" });

  await setCtGovTestScenario(page, "PENDING_FOREVER", screenshotPath);
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyCompaniesHouseStillPending(page, screenshotPath);
  await sendTheTaxReturnNow(page, screenshotPath);

  await clearGovTestScenario(page);
  await waitForCompaniesHouse(page, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);
  await verifyAccountsLocked(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});
