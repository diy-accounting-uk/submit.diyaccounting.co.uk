// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/practiceLicence.behaviour.test.js
//
// A practice (a resident-pro subscriber) adds two clients and files a VAT return for each
// through the submission MCP's own run_for_clients, over mcp/lib/batch-tools.js and
// mcp/lib/practice-tools.js exactly as the MCP server would call them. Signing in to Submit and
// minting an HMRC access token still go through the browser (postVatReturn.behaviour.test.js's
// own path); the practice and filing calls that follow run as plain Node fetches through the MCP
// library, not page.evaluate calls, so this proves the MCP's own contract rather than the UI's.
//
// The two clients share the sandbox's pre-authorised VRN (app/http-simulator/routes/
// agent-authorisation.js's PRE_AUTHORISED_CLIENT_IDS) so GET .../authorisation resolves each
// straight to "authorised" from HMRC's relationships endpoint. Reaching that endpoint at all
// needs the practice's own agent reference number on file, which only the invitation endpoint
// ever sets - so a third, throwaway client is invited once purely to record the ARN, then
// archived before the two real clients are listed, so it never appears in run_for_clients' rows.

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
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
import { ensureBundleViaCheckout, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import { initSubmitVat, fillInVat, submitFormVat, completeVat } from "./steps/behaviour-hmrc-vat-steps.js";
import {
  acceptCookiesHmrc,
  fillInHmrcAuth,
  goToHmrcAuth,
  grantPermissionHmrcAuth,
  initHmrcAuth,
  submitHmrcAuth,
} from "./steps/behaviour-hmrc-steps.js";
import { addClient, clientAuthorisationStatus, inviteClient } from "../mcp/lib/practice-tools.js";
import { runForClients } from "../mcp/lib/batch-tools.js";
import { callSubmitApi } from "../mcp/lib/submit-tools.js";

dotenvConfigIfNotBlank({ path: ".env" });

const screenshotPath = "target/behaviour-test-results/screenshots/practice-licence-behaviour-test";

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
// Any non-empty string satisfies the simulator's agent-authorisation stand-in; the real HMRC
// sandbox needs a test agent's own ARN here instead.
const practiceArn = getEnvVarAndLog("practiceArn", "TEST_HMRC_AGENT_ARN", "XARN0000067");

const hmrcVatDueAmount = "1000.00";

// The client identifier the simulator's agent-authorisation stand-in always answers "already
// authorised" for (app/http-simulator/routes/agent-authorisation.js's PRE_AUTHORISED_CLIENT_IDS),
// so both clients' GET .../authorisation calls resolve without a client-side acceptance step.
const PRE_AUTHORISED_VRN = "999999999";

// The simulator's default obligations (app/http-simulator/scenarios/obligations.js) always carry
// one open period at these dates; the earlier Jan-Mar period is already fulfilled, so filing
// against it 409s. Used both for the token-minting submission and the two clients' own returns.
const OPEN_OBLIGATION_PERIOD = { periodStart: "2017-04-01", periodEnd: "2017-06-30" };

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "practiceLicenceBehaviour" });
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

test("A practice adds two clients and submits a VAT return for each through run_for_clients", async ({ page }) => {
  addOnPageLogging(page);

  /* ************************************************* */
  /*  HMRC TEST USER — only needed to mint an access    */
  /*  token; the two practice clients use a fixed VRN   */
  /* ************************************************* */
  let currentTestUsername = hmrcTestUsername;
  let currentTestPassword = hmrcTestPassword;
  let tokenMintingVatNumber = hmrcTestVatNumber;
  if (!hmrcTestUsername) {
    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;
    if (!hmrcClientId || !hmrcClientSecret) {
      throw new Error("HMRC_SANDBOX_CLIENT_ID/SECRET (or HMRC_CLIENT_ID/SECRET) required to create test users");
    }
    const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, { serviceNames: ["mtd-vat"] });
    currentTestUsername = testUser.userId;
    currentTestPassword = testUser.password;
    tokenMintingVatNumber = testUser.vrn;
  }

  /* ****************************************************************** */
  /*  SIGN IN + GRANT RESIDENT PRO — a real checkout (or its simulator  */
  /*  auto-complete), so the bundle carries an active subscription      */
  /*  status: the practice-client-scope check needs that, not just the  */
  /*  bundle's presence (app/services/diyaGlEntitlement.js).            */
  /* ****************************************************************** */
  await goToHomePageExpectNotLoggedIn(page, baseUrl, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);
  await goToBundlesPage(page, screenshotPath);
  await ensureBundleViaCheckout(page, "resident-pro", screenshotPath, { testPass: true });
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ******************************************************************* */
  /*  MINT AN HMRC ACCESS TOKEN — one page-driven VAT submission cycle,  */
  /*  the same shape postVatReturn.behaviour.test.js uses for its first  */
  /*  submission, run here purely to populate sessionStorage's token.    */
  /* ******************************************************************* */
  await initSubmitVat(page, screenshotPath);
  await fillInVat(page, tokenMintingVatNumber, OPEN_OBLIGATION_PERIOD, hmrcVatDueAmount, null, false, screenshotPath, false);
  await submitFormVat(page, screenshotPath);
  await acceptCookiesHmrc(page, screenshotPath);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, currentTestUsername, currentTestPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);
  await completeVat(page, baseUrl, null, screenshotPath);

  const hmrcAccessToken = await page.evaluate(() => sessionStorage.getItem("hmrcAccessToken"));
  expect(hmrcAccessToken, "no HMRC access token was minted by the page-driven submission").toBeTruthy();
  const practiceSessionToken = await page.evaluate(() => localStorage.getItem("cognitoAccessToken"));
  expect(practiceSessionToken, "no Cognito access token was found after sign-in").toBeTruthy();

  /* ***************************************************************** */
  /*  EVERYTHING FROM HERE RUNS THROUGH THE MCP'S OWN LIBRARY CALLS,   */
  /*  THE SAME FUNCTIONS THE MCP SERVER ITSELF CALLS.                  */
  /* ***************************************************************** */
  process.env.DIYA_SUBMIT_BASE_URL = baseUrl;
  process.env.DIYA_SUBMIT_ACCESS_TOKEN = practiceSessionToken;
  const session = {};

  // A throwaway client, invited once so the invite endpoint records the practice's ARN. Its own
  // invitation is left pending (the simulator never accepts one), so it is archived immediately
  // and never appears in the practice's client list run_for_clients loops over.
  const bootstrapClient = await addClient(session, { displayName: "ARN bootstrap", vrn: PRE_AUTHORISED_VRN });
  await inviteClient(session, {
    clientId: bootstrapClient.client.clientId,
    service: "MTD-VAT",
    knownFact: "2015-01-01",
    hmrcAccessToken,
    arn: practiceArn,
  });
  await callSubmitApi(`/api/v1/practice/clients/${encodeURIComponent(bootstrapClient.client.clientId)}`, { method: "DELETE" });

  const clientA = await addClient(session, { displayName: "Practice Client A", vrn: PRE_AUTHORISED_VRN });
  const clientB = await addClient(session, { displayName: "Practice Client B", vrn: PRE_AUTHORISED_VRN });

  const statusA = await clientAuthorisationStatus(session, {
    clientId: clientA.client.clientId,
    service: "MTD-VAT",
    hmrcAccessToken,
  });
  const statusB = await clientAuthorisationStatus(session, {
    clientId: clientB.client.clientId,
    service: "MTD-VAT",
    hmrcAccessToken,
  });
  expect(statusA.status).toBe("authorised");
  expect(statusB.status).toBe("authorised");

  /* ******************************************************************* */
  /*  RUN_FOR_CLIENTS: one submit_vat_return call per client in the list  */
  /* ******************************************************************* */
  const result = await runForClients(session, {
    tool: "submit_vat_return",
    args: {
      ...OPEN_OBLIGATION_PERIOD,
      hmrcAccessToken,
      hmrcAccount: "synthetic",
      allowSyntheticObligations: true,
      vatDueSales: 1000,
      vatDueAcquisitions: 0,
      vatReclaimedCurrPeriod: 0,
      totalValueSalesExVAT: 1000,
      totalValuePurchasesExVAT: 0,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
    },
  });

  expect(result.tool).toBe("submit_vat_return");
  const rowClientIds = result.rows.map((row) => row.clientId).sort();
  expect(rowClientIds).toEqual([clientA.client.clientId, clientB.client.clientId].sort());
  expect(result.summary).toEqual({ total: 2, ok: 2, failed: 0 });
  for (const row of result.rows) {
    expect(row.ok, `client ${row.clientId} failed: ${row.error}`).toBe(true);
    expect(row.result.receiptId).toBeTruthy();
  }

  /* ****************************************************************** */
  /*  EACH CLIENT'S RECEIPT SHOWS UP ON THAT CLIENT'S OWN RECEIPT LIST  */
  /* ****************************************************************** */
  for (const row of result.rows) {
    const receiptsForClient = await callSubmitApi(`/api/v1/hmrc/receipt?clientId=${encodeURIComponent(row.clientId)}`);
    const receiptIds = receiptsForClient.receipts.map((receipt) => receipt.receiptId);
    expect(receiptIds).toContain(row.result.receiptId);
  }
});
