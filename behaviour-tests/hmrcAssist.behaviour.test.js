// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/hmrcAssist.behaviour.test.js
// HMRC Assist feedback on a draft VAT return and on an Income Tax calculation, against the HMRC simulator

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { itsaDefaultMessages, vatDefaultMessages } from "@app/http-simulator/scenarios/assist.js";
import {
  addOnPageLogging,
  createHmrcTestUser,
  getEnvVarAndLog,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
  saveHmrcTestUserToFiles,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import { clickLogIn, loginWithCognitoOrMockAuth, verifyLoggedInStatus } from "./steps/behaviour-login-steps.js";
import { ensureBundleViaPassApi } from "./steps/behaviour-bundle-steps.js";
import { completeVat, initSubmitVat, verifyVatSubmission } from "./steps/behaviour-hmrc-vat-steps.js";
import {
  fillInItsaCalculationTrigger,
  initItsaTaxCalculation,
  submitItsaCalculationTriggerForm,
  verifyItsaCalculationResults,
} from "./steps/behaviour-hmrc-itsa-steps.js";
import {
  acceptCookiesHmrc,
  completeHmrcReauthIfPresented,
  fillInHmrcAuth,
  goToHmrcAuth,
  grantPermissionHmrcAuth,
  initHmrcAuth,
  submitHmrcAuth,
} from "./steps/behaviour-hmrc-steps.js";
import {
  connectToHmrcFromVatForm,
  fillInVatBoxesForOpenPeriod,
  recordAssistTraffic,
  requestHmrcAssistFeedback,
  sendTestScenarioOn,
  verifyAssistMessagesInOrder,
} from "./steps/behaviour-hmrc-assist-steps.js";
import { exportAllTables } from "./helpers/dynamodb-export.js";
import { readDynamoDbExport } from "./helpers/dynamodb-assertions.js";
import { extractUserSubFromLocalStorage } from "./helpers/fileHelper.js";

dotenvConfigIfNotBlank({ path: ".env" });

const screenshotPath = "target/behaviour-test-results/screenshots/hmrc-assist-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const testAuthPassword = getEnvVarAndLog("testAuthPassword", "TEST_AUTH_PASSWORD", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const hmrcTestUsername = getEnvVarAndLog("hmrcTestUsername", "TEST_HMRC_USERNAME", null);
const hmrcTestPassword = getEnvVarAndLog("hmrcTestPassword", "TEST_HMRC_PASSWORD", null);
const hmrcTestVatNumber = getEnvVarAndLog("hmrcTestVatNumber", "TEST_HMRC_VAT_NUMBER", null);
const hmrcTestNino = getEnvVarAndLog("hmrcTestNino", "TEST_HMRC_NINO", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(600_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "hmrcAssistBehaviour" });
});

test.beforeAll(async ({}, testInfo) => {
  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = { ...originalEnv };

  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);

  fs.mkdirSync(testInfo.outputPath(""), { recursive: true });
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
  if (mockOAuth2Process) mockOAuth2Process.kill();
  try {
    await dynamoControl?.stop?.();
  } catch {}
});

async function signInWithHmrcTestUser(page, testInfo) {
  addOnPageLogging(page);
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  let username = hmrcTestUsername;
  let password = hmrcTestPassword;
  let vrn = hmrcTestVatNumber;
  let nino = hmrcTestNino;

  if (!hmrcTestUsername) {
    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;
    if (!hmrcClientId || !hmrcClientSecret) {
      throw new Error("HMRC client credentials required to create test users");
    }
    const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, { serviceNames: ["mtd-vat", "mtd-income-tax"] });
    username = testUser.userId;
    password = testUser.password;
    vrn = testUser.vrn;
    nino = testUser.nino;
    saveHmrcTestUserToFiles(testUser, outputDir, path.resolve(process.cwd()));
  }

  await goToHomePageExpectNotLoggedIn(page, baseUrl, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);
  await ensureBundleViaPassApi(page, "resident", screenshotPath, { testPass: true });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  return { username, password, vrn, nino, outputDir };
}

async function openVatFormConnectedToHmrc(page, user) {
  await initSubmitVat(page, screenshotPath);
  await connectToHmrcFromVatForm(page, { vrn: user.vrn, username: user.username, password: user.password }, screenshotPath);
}

function readReceipts(outputDir) {
  return readDynamoDbExport(path.join(outputDir, "receipts.jsonl")).map((item) => item.receipt);
}

test.describe("HMRC Assist on the VAT return", () => {
  test("shows HMRC's messages in order, acknowledges them, then files the return with both receipts stored", async ({ page }, testInfo) => {
    const user = await signInWithHmrcTestUser(page, testInfo);
    const traffic = recordAssistTraffic(page, "vat");

    await openVatFormConnectedToHmrc(page, user);
    await fillInVatBoxesForOpenPeriod(page, undefined, screenshotPath);
    await requestHmrcAssistFeedback(page, screenshotPath);
    await verifyAssistMessagesInOrder(page, vatDefaultMessages(user.vrn), screenshotPath);

    await expect.poll(() => traffic.acknowledgements.map((entry) => entry.status), { timeout: 60000 }).toEqual([204]);
    expect(traffic.reports).toHaveLength(1);
    expect(traffic.reports[0].body.vrn).toBe(user.vrn);
    expect(traffic.acknowledgements[0].body.reportId).toBeTruthy();
    expect(traffic.acknowledgements[0].body.receiptId).toBeTruthy();

    await expect(page.locator("#submitBtn")).toBeEnabled();
    await page.locator("#submitBtn").click();
    await completeHmrcReauthIfPresented(page, user.username, user.password, screenshotPath);
    await completeVat(page, baseUrl, null, screenshotPath);
    await verifyVatSubmission(page, null, screenshotPath);

    const userSub = await extractUserSubFromLocalStorage(page, testInfo);
    if (runDynamoDb === "run" || runDynamoDb === "useExisting") {
      await exportAllTables(
        user.outputDir,
        dynamoControl.endpoint,
        { bundleTableName, hmrcApiRequestsTableName, receiptsTableName },
        userSub,
      );
      const receipts = readReceipts(user.outputDir);
      const assistReceipt = receipts.find((receipt) => receipt.kind === "vat-assist-report");
      expect(assistReceipt, "the stored HMRC Assist report receipt").toBeTruthy();
      expect(assistReceipt.acknowledgedAt, "the acknowledgement time on the report receipt").toBeTruthy();
      expect(assistReceipt.messages).toHaveLength(vatDefaultMessages(user.vrn).length);
      const returnReceipt = receipts.find((receipt) => receipt.formBundleNumber);
      expect(returnReceipt, "the stored VAT return receipt").toBeTruthy();
    }
  });

  test("says HMRC Assist has no feedback when HMRC answers 204, and sends no acknowledgement", async ({ page }, testInfo) => {
    const user = await signInWithHmrcTestUser(page, testInfo);
    const traffic = recordAssistTraffic(page, "vat");
    await sendTestScenarioOn(page, "**/api/v1/hmrc/vat/assist/report", "NO_MESSAGES");

    await openVatFormConnectedToHmrc(page, user);
    await fillInVatBoxesForOpenPeriod(page, undefined, screenshotPath);
    await requestHmrcAssistFeedback(page, screenshotPath);

    await expect(page.locator("#hmrcAssistStatus")).toContainText("no feedback", { timeout: 60000 });
    await expect(page.locator("#hmrcAssistMessages")).toHaveCount(0);
    expect(traffic.reports.map((entry) => entry.status)).toEqual([204]);
    expect(traffic.acknowledgements).toEqual([]);
    await expect(page.locator("#submitBtn")).toBeEnabled();
  });

  test("shows one line when HMRC Assist is unavailable and still allows the return to be submitted", async ({ page }, testInfo) => {
    const user = await signInWithHmrcTestUser(page, testInfo);
    const traffic = recordAssistTraffic(page, "vat");
    await sendTestScenarioOn(page, "**/api/v1/hmrc/vat/assist/report", "SUBMIT_API_HTTP_500");

    await openVatFormConnectedToHmrc(page, user);
    await fillInVatBoxesForOpenPeriod(page, undefined, screenshotPath);
    await requestHmrcAssistFeedback(page, screenshotPath);

    await expect(page.locator("#hmrcAssistStatus")).toContainText("HMRC Assist feedback is unavailable", { timeout: 60000 });
    await expect(page.locator("#hmrcAssistMessages")).toHaveCount(0);
    expect(traffic.reports.map((entry) => entry.status)).toEqual([500]);
    expect(traffic.acknowledgements).toEqual([]);
    await expect(page.locator("#submitBtn")).toBeEnabled();

    await page.locator("#submitBtn").click();
    await completeHmrcReauthIfPresented(page, user.username, user.password, screenshotPath);
    await completeVat(page, baseUrl, null, screenshotPath);
    await verifyVatSubmission(page, null, screenshotPath);
  });

  test("shows no HMRC Assist control when every period is fulfilled", async ({ page }, testInfo) => {
    const user = await signInWithHmrcTestUser(page, testInfo);
    const traffic = recordAssistTraffic(page, "vat");
    await sendTestScenarioOn(page, "**/api/v1/hmrc/vat/obligation*", "QUARTERLY_OBS_04_FULFILLED");

    await initSubmitVat(page, screenshotPath);
    await connectToHmrcFromVatForm(page, { vrn: user.vrn, username: user.username, password: user.password }, screenshotPath);

    await expect(page.locator("#obligationStatus")).toContainText("no open VAT periods", { timeout: 30000 });
    await expect(page.locator("#hmrcAssistCheckBtn")).toBeHidden();
    await expect(page.locator("#submitBtn")).toBeEnabled();
    expect(traffic.reports).toEqual([]);
  });
});

test.describe("HMRC Assist on the Income Tax calculation", () => {
  test("shows HMRC's messages for a calculation and acknowledges them", async ({ page }, testInfo) => {
    const user = await signInWithHmrcTestUser(page, testInfo);
    const traffic = recordAssistTraffic(page, "itsa");

    await initItsaTaxCalculation(page, screenshotPath);
    await fillInItsaCalculationTrigger(
      page,
      { hmrcNino: user.nino, taxYear: "2023-24", calculationType: "intent-to-finalise" },
      screenshotPath,
    );
    await submitItsaCalculationTriggerForm(page, screenshotPath);

    await acceptCookiesHmrc(page, screenshotPath);
    await goToHmrcAuth(page, screenshotPath);
    await initHmrcAuth(page, screenshotPath);
    await fillInHmrcAuth(page, user.username, user.password, screenshotPath);
    await submitHmrcAuth(page, screenshotPath);
    await grantPermissionHmrcAuth(page, screenshotPath);
    await verifyItsaCalculationResults(page, screenshotPath);

    await requestHmrcAssistFeedback(page, screenshotPath);
    await verifyAssistMessagesInOrder(page, itsaDefaultMessages(), screenshotPath);

    await expect.poll(() => traffic.acknowledgements.map((entry) => entry.status), { timeout: 60000 }).toEqual([204]);
    expect(traffic.reports).toHaveLength(1);
    expect(traffic.reports[0].body.nino).toBe(user.nino);
    expect(traffic.acknowledgements[0].body.nino).toBe(user.nino);
    await expect(page.locator("#continueToFinalDeclarationLink")).toBeVisible();
  });
});
