// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/mcpPrepareVatReturn.behaviour.test.js
//
// The hand-off from an assistant to the browser: derive_vat_return and prepare_vat_return run
// through a real MCP client over an in-memory transport on a book opened in the session, the link
// the second tool answers opens the VAT form with the seven figures and the two computed boxes
// filled, the user declares and files, and the receipt shows. Run on the simulator lane, where the
// HTTP simulator plays HMRC.

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { createSession, openBook } from "../mcp/lib/book-tools.js";
import { callHarnessTool } from "../mcp/lib/harness.js";
import {
  addOnPageLogging,
  createHmrcTestUser,
  getEnvVarAndLog,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn, goToHomePageUsingMainNav } from "./steps/behaviour-steps.js";
import { clickLogIn, loginWithCognitoOrMockAuth, verifyLoggedInStatus } from "./steps/behaviour-login-steps.js";
import { ensureBundlePresent, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import { completeVat, submitFormVat, verifyVatSubmission } from "./steps/behaviour-hmrc-vat-steps.js";
import {
  acceptCookiesHmrc,
  fillInHmrcAuth,
  goToHmrcAuth,
  grantPermissionHmrcAuth,
  initHmrcAuth,
  submitHmrcAuth,
} from "./steps/behaviour-hmrc-steps.js";
import { allowSyntheticObligationsOnForm } from "./steps/behaviour-books-import-steps.js";

dotenvConfigIfNotBlank({ path: ".env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOK_FIXTURE_DIRECTORY = path.join(__dirname, "../mcp/test/fixtures/brickwork-pro-ltd-vat");
const PERIOD_END = "2025-09-30";
const screenshotPath = "target/behaviour-test-results/screenshots/mcp-prepare-vat-return-behaviour-test";

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
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);
const usingHttpSimulator = getEnvVarAndLog("usingHttpSimulator", "TEST_HTTP_SIMULATOR", null) === "run";

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(600_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "mcpPrepareVatReturnBehaviour" });
});

test.beforeAll(async () => {
  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }
  process.env = { ...originalEnv };
  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
  if (mockOAuth2Process) mockOAuth2Process.kill();
  try {
    await dynamoControl?.stop?.();
  } catch {}
});

async function callTool(session, tool, args) {
  const answer = await callHarnessTool(session, tool, args);
  expect(answer.ok, `${tool}: ${JSON.stringify(answer.result)}`).toBe(true);
  return answer.result;
}

test("the assistant derives a VAT return, hands the figures to the browser, and the user files them there", async ({ page }, testInfo) => {
  test.skip(!usingHttpSimulator, "the filing runs against the HTTP simulator's HMRC");
  addOnPageLogging(page);
  process.env.DIYA_SUBMIT_BASE_URL = baseUrl;

  let testUsername = hmrcTestUsername;
  let testPassword = hmrcTestPassword;
  let testVatNumber = hmrcTestVatNumber;
  if (!testUsername) {
    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;
    if (!hmrcClientId || !hmrcClientSecret) {
      throw new Error("HMRC_SANDBOX_CLIENT_ID/SECRET (or HMRC_CLIENT_ID/SECRET) required to create test users");
    }
    const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, { serviceNames: ["mtd-vat"] });
    testUsername = testUser.userId;
    testPassword = testUser.password;
    testVatNumber = testUser.vrn;
  }

  const session = createSession();
  await openBook(session, { path: BOOK_FIXTURE_DIRECTORY });

  const derived = await test.step("The assistant derives the return", async () =>
    callTool(session, "derive_vat_return", { periodEnd: PERIOD_END }));

  const prepared = await test.step("The assistant prepares the hand-off", async () => {
    const answer = await callTool(session, "prepare_vat_return", { periodEnd: PERIOD_END });
    expect(answer.figures).toEqual({
      vatDueSales: derived.hmrc.vatDueSales,
      vatDueAcquisitions: derived.hmrc.vatDueAcquisitions,
      vatReclaimedCurrPeriod: derived.hmrc.vatReclaimedCurrPeriod,
      totalValueSalesExVAT: derived.hmrc.totalValueSalesExVAT,
      totalValuePurchasesExVAT: derived.hmrc.totalValuePurchasesExVAT,
      totalValueGoodsSuppliedExVAT: derived.hmrc.totalValueGoodsSuppliedExVAT,
      totalAcquisitionsExVAT: derived.hmrc.totalAcquisitionsExVAT,
    });
    expect(new URL(answer.link).origin).toBe(new URL(baseUrl).origin);
    expect(new URL(answer.link).pathname).toBe("/hmrc/vat/submitVat.html");
    expect(answer.instruction).toContain("Nothing has been filed");
    return answer;
  });

  await goToHomePageExpectNotLoggedIn(page, baseUrl, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);
  await goToBundlesPage(page, screenshotPath);
  await ensureBundlePresent(page, "Day pass", screenshotPath, { testPass: true });
  await goToHomePageUsingMainNav(page, screenshotPath);

  await test.step("The user opens the link and the form shows the figures", async () => {
    await page.goto(prepared.link);
    await expect(page.locator("#booksImportStatus")).toContainText(
      `for the period ${prepared.period.periodStart} to ${prepared.period.periodEnd}`,
      {
        timeout: 30_000,
      },
    );
    await expect(page.locator("#periodStart")).toHaveValue(prepared.period.periodStart);
    await expect(page.locator("#periodEnd")).toHaveValue(prepared.period.periodEnd);
    for (const [field, figure] of Object.entries(prepared.figures)) {
      await expect(page.locator(`#${field}`)).toHaveValue(String(figure));
    }
    await expect(page.locator("#totalVatDue")).toHaveValue(derived.hmrc.totalVatDue.toFixed(2));
    await expect(page.locator("#netVatDue")).toHaveValue(derived.hmrc.netVatDue.toFixed(2));
    await page.screenshot({ path: `${screenshotPath}/handoff-form-filled.png` });
  });

  await page.locator("#vatNumber").fill(testVatNumber);
  await page.locator("#declaration").check();
  await allowSyntheticObligationsOnForm(page);

  await submitFormVat(page, screenshotPath);
  await acceptCookiesHmrc(page, screenshotPath);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, testUsername, testPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);

  await completeVat(page, baseUrl, null, screenshotPath);
  await verifyVatSubmission(page, null, screenshotPath);
});
