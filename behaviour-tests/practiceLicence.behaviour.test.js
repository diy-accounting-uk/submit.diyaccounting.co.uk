// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/practiceLicence.behaviour.test.js
//
// A practice (a resident-pro subscriber) adds two clients and files a VAT return for each
// through the submission MCP's own run_for_clients, over mcp/lib/batch-tools.js and
// mcp/lib/practice-tools.js exactly as the MCP server would call them. Signing in to Submit and
// the consent half of the MCP's HMRC grant still go through the browser; the practice and filing
// calls that follow run as plain Node fetches through the MCP library, not page.evaluate calls,
// so this proves the MCP's own contract rather than the UI's.
//
// The two clients share the sandbox's pre-authorised VRN (app/http-simulator/routes/
// agent-authorisation.js's PRE_AUTHORISED_CLIENT_IDS) so GET .../authorisation resolves each
// straight to "authorised" from HMRC's relationships endpoint. Reaching that endpoint at all
// needs the practice's own agent reference number on file, which only the invitation endpoint
// ever sets - so a third, throwaway client is invited once purely to record the ARN, then
// archived before the two real clients are listed, so it never appears in run_for_clients' rows.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  acceptHmrcAgentInvitation,
  addOnPageLogging,
  createHmrcTestAgent,
  createHmrcTestUser,
  getEnvVarAndLog,
  isSyntheticMode,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
  runStripeListen,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn, goToHomePageUsingMainNav } from "./steps/behaviour-steps.js";
import { clickLogIn, loginWithCognitoOrMockAuth, verifyLoggedInStatus } from "./steps/behaviour-login-steps.js";
import { ensureBundleViaCheckout, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import { connectPracticeToHmrcInBrowser, grantMcpHmrcAccessInBrowser } from "./steps/behaviour-mcp-hmrc-grant-steps.js";
import { callHarnessTool } from "../mcp/lib/harness.js";
import { addClient, clientAuthorisationStatus, inviteClient } from "../mcp/lib/practice-tools.js";
import { runForClients } from "../mcp/lib/batch-tools.js";
import { callSubmitApi, hmrcAccessTokenFor } from "../mcp/lib/submit-tools.js";
import { createSession } from "../mcp/lib/book-tools.js";

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
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);
// Any non-empty string satisfies the simulator's agent-authorisation stand-in. With
// HMRC_ACCOUNT=synthetic the test creates a test agent and uses that agent's own ARN instead.
let practiceArn = getEnvVarAndLog("practiceArn", "TEST_HMRC_AGENT_ARN", "XARN0000067");
const synthetic = isSyntheticMode();
const usesHmrcSandbox = String(process.env.HMRC_AGENT_AUTHORISATION_BASE_URI || "").includes("service.hmrc.gov.uk");

// The client identifier the simulator's agent-authorisation stand-in always answers "already
// authorised" for (app/http-simulator/routes/agent-authorisation.js's PRE_AUTHORISED_CLIENT_IDS),
// so both clients' GET .../authorisation calls resolve without a client-side acceptance step.
const PRE_AUTHORISED_VRN = "999999999";
const SIMULATOR_KNOWN_FACT = "2015-01-01";

// The simulator's default obligations (app/http-simulator/scenarios/obligations.js) always carry
// one open period at these dates; the earlier Jan-Mar period is already fulfilled, so filing
// against it 409s.
const OPEN_OBLIGATION_PERIOD = { periodStart: "2017-04-01", periodEnd: "2017-06-30" };

let mockOAuth2Process;
let serverProcess;
let stripeListenProcess;
let dynamoControl;
let mcpCredentialsDir;

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
  // The signing secret must be in env before the server starts: the webhook handler caches the
  // first one it reads. Without the forwarded webhook the resident-pro checkout never grants.
  stripeListenProcess = await runStripeListen(new URL("api/v1/billing/webhook", baseUrl).href);
  if (stripeListenProcess) {
    process.env.STRIPE_TEST_WEBHOOK_SECRET = stripeListenProcess.secret;
  }
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
  if (stripeListenProcess) stripeListenProcess.kill();
  if (mockOAuth2Process) mockOAuth2Process.kill();
  try {
    await dynamoControl?.stop?.();
  } catch {}
  if (mcpCredentialsDir) rmSync(mcpCredentialsDir, { recursive: true, force: true });
});

test("A practice adds two clients and submits a VAT return for each through run_for_clients", async ({ page }) => {
  addOnPageLogging(page);

  /* ************************************************* */
  /*  HMRC TEST USER — only needed to grant the MCP's   */
  /*  HMRC access; the practice clients use a fixed VRN */
  /* ************************************************* */
  let currentTestUsername = hmrcTestUsername;
  let currentTestPassword = hmrcTestPassword;
  let hmrcClientVrn = PRE_AUTHORISED_VRN;
  let hmrcClientKnownFact = SIMULATOR_KNOWN_FACT;
  if (!hmrcTestUsername) {
    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;
    if (!hmrcClientId || !hmrcClientSecret) {
      throw new Error("HMRC_SANDBOX_CLIENT_ID/SECRET (or HMRC_CLIENT_ID/SECRET) required to create test users");
    }
    const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, { serviceNames: ["mtd-vat"] });
    currentTestUsername = testUser.userId;
    currentTestPassword = testUser.password;
    if (usesHmrcSandbox) {
      // HMRC's sandbox resolves the invited client from its own records, so the client is the
      // test organisation just created and the known fact is its VAT registration date.
      hmrcClientVrn = testUser.vrn;
      hmrcClientKnownFact = testUser.vatRegistrationDate;
    }
  }

  /* *********************************************************************** */
  /*  HMRC TEST AGENT — the agent the practice page signs in to HMRC as; its  */
  /*  ARN is the practice's agent reference number.                           */
  /* *********************************************************************** */
  let agentUsername = currentTestUsername;
  let agentPassword = currentTestPassword;
  if (synthetic) {
    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;
    const testAgent = await createHmrcTestAgent(hmrcClientId, hmrcClientSecret);
    practiceArn = testAgent.arn;
    agentUsername = testAgent.userId;
    agentPassword = testAgent.password;
  }

  /* ****************************************************************** */
  /*  SIGN IN + GRANT RESIDENT PRO — a real checkout (or its simulator  */
  /*  auto-complete), so the bundle carries an active subscription      */
  /*  status: the practice-client-scope check needs that, not just the  */
  /*  bundle's presence (app/services/diyaGlEntitlement.js). resident-  */
  /*  pro is visible directly (enable=always, allocation=on-           */
  /*  subscription) — no pass needed.                                  */
  /* ****************************************************************** */
  await goToHomePageExpectNotLoggedIn(page, baseUrl, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);
  await goToBundlesPage(page, screenshotPath);
  await ensureBundleViaCheckout(page, "resident-pro", screenshotPath, { skipPass: true });
  await goToHomePageUsingMainNav(page, screenshotPath);

  const practiceSessionToken = await page.evaluate(() => localStorage.getItem("cognitoAccessToken"));
  expect(practiceSessionToken, "no Cognito access token was found after sign-in").toBeTruthy();
  const practiceIdToken = await page.evaluate(() => localStorage.getItem("cognitoIdToken"));
  expect(practiceIdToken, "no Cognito id token was found after sign-in").toBeTruthy();
  // The simulator's mock token endpoint (app/functions/non-lambda-mocks/mockTokenPost.js) issues
  // no refresh token, so loginWithMockCallback.html never stores one; a real Cognito exchange
  // (proxy, ci, prod) always does. auth.js's cachedOrRefreshed only checks this field is present
  // before serving the cached access/id token below, and this test's tokens never approach their
  // expiry, so a placeholder stands in for the simulator lane without ever being sent anywhere.
  const practiceRefreshToken = (await page.evaluate(() => localStorage.getItem("cognitoRefreshToken"))) || "unused-in-this-lane";

  /* ***************************************************************** */
  /*  EVERYTHING FROM HERE RUNS THROUGH THE MCP'S OWN LIBRARY CALLS,   */
  /*  THE SAME FUNCTIONS THE MCP SERVER ITSELF CALLS. auth.js's        */
  /*  accessToken()/idToken() read a signed-in session from            */
  /*  DIYA_SUBMIT_CONFIG_DIR's credentials.json (overridable for       */
  /*  tests), so the MCP is signed in here by writing the practice     */
  /*  user's own page-driven tokens into a test-scoped copy of that    */
  /*  file, the same shape signIn() itself writes (mcp/test/auth.test  */
  /*  .js). The expiry is set comfortably ahead so accessToken() and   */
  /*  idToken() serve the cached values without a refresh call.        */
  /* ***************************************************************** */
  process.env.DIYA_SUBMIT_BASE_URL = baseUrl;
  mcpCredentialsDir = mkdtempSync(join(tmpdir(), "diya-submit-mcp-practice-licence-"));
  process.env.DIYA_SUBMIT_CONFIG_DIR = mcpCredentialsDir;
  const tokenExpiresAt = Date.now() + 3600_000;
  writeFileSync(
    join(mcpCredentialsDir, "credentials.json"),
    JSON.stringify({
      refreshToken: practiceRefreshToken,
      idToken: practiceIdToken,
      idTokenExpiresAt: tokenExpiresAt,
      accessToken: practiceSessionToken,
      accessTokenExpiresAt: tokenExpiresAt,
    }),
  );
  const session = createSession();

  /* ******************************************************************* */
  /*  START THE SESSION'S HMRC GRANT: invite_client, client_authorisation */
  /*  _status and submit_vat_return all read their token from the grant,  */
  /*  so the user consents on HMRC's pages first, for the agent and VAT   */
  /*  services together.                                                  */
  /* ******************************************************************* */
  const authorisation = await callHarnessTool(session, "request_hmrc_authorisation", {
    services: ["vat", "agent"],
    hmrcAccount: "synthetic",
  });
  expect(authorisation.ok, `request_hmrc_authorisation: ${JSON.stringify(authorisation.result)}`).toBe(true);
  await grantMcpHmrcAccessInBrowser(page, authorisation.result.url, agentUsername, agentPassword, screenshotPath);

  // HMRC's sandbox refuses a second invitation for an organisation while the first is pending, so
  // each invited client on the sandbox is its own VAT test organisation.
  async function clientIdentity() {
    if (!usesHmrcSandbox) return { vrn: hmrcClientVrn, knownFact: hmrcClientKnownFact };
    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;
    const organisation = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, { serviceNames: ["mtd-vat"] });
    return { vrn: organisation.vrn, knownFact: organisation.vatRegistrationDate };
  }

  // A throwaway client, invited once so the invite endpoint records the practice's ARN. Its own
  // invitation is left pending (the simulator never accepts one), so it is archived immediately
  // and never appears in the practice's client list run_for_clients loops over.
  const bootstrapIdentity = await clientIdentity();
  const bootstrapClient = await addClient(session, { displayName: "ARN bootstrap", vrn: bootstrapIdentity.vrn });
  await inviteClient(session, {
    clientId: bootstrapClient.client.clientId,
    service: "MTD-VAT",
    knownFact: bootstrapIdentity.knownFact,
    arn: practiceArn,
  });
  await callSubmitApi(session, `/api/v1/practice/clients/${encodeURIComponent(bootstrapClient.client.clientId)}`, { method: "DELETE" });

  // The simulator's relationship check needs the known fact given with an invitation, so each
  // client is invited and the invitation cancelled; the stored known fact then lets the check run.
  // On the sandbox the invitation is accepted instead, and the status check reads it as accepted.
  async function addClientWithRelationshipCheckable(displayName) {
    const identity = await clientIdentity();
    const added = await addClient(session, { displayName, vrn: identity.vrn });
    const invited = await inviteClient(session, { clientId: added.client.clientId, service: "MTD-VAT", knownFact: identity.knownFact });
    if (usesHmrcSandbox) {
      await acceptHmrcAgentInvitation(invited.invitationId);
      return added;
    }
    const { accessToken } = await hmrcAccessTokenFor(session, "cancel_invitation");
    await callSubmitApi(
      session,
      `/api/v1/practice/clients/${encodeURIComponent(added.client.clientId)}/authorisation/invitations?service=MTD-VAT`,
      { method: "DELETE", customAuthorizer: true, headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return added;
  }
  const clientA = await addClientWithRelationshipCheckable("Practice Client A");
  const clientB = await addClientWithRelationshipCheckable("Practice Client B");

  const statusA = await clientAuthorisationStatus(session, { clientId: clientA.client.clientId, service: "MTD-VAT" });
  const statusB = await clientAuthorisationStatus(session, { clientId: clientB.client.clientId, service: "MTD-VAT" });
  const grantedStatus = usesHmrcSandbox ? "accepted" : "authorised";
  expect(statusA.status).toBe(grantedStatus);
  expect(statusB.status).toBe(grantedStatus);

  /* ******************************************************************* */
  /*  RUN_FOR_CLIENTS: one submit_vat_return call per client in the list  */
  /* ******************************************************************* */
  const result = await runForClients(session, {
    tool: "submit_vat_return",
    args: {
      ...OPEN_OBLIGATION_PERIOD,
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
    const receiptsForClient = await callSubmitApi(session, `/api/v1/hmrc/receipt?clientId=${encodeURIComponent(row.clientId)}`);
    const receiptIds = receiptsForClient.receipts.map((receipt) => receipt.receiptId);
    expect(receiptIds).toContain(row.result.receiptId);
  }

  /* ****************************************************************** */
  /*  THE PRACTICE PAGE: the licence line, Connect to HMRC as the       */
  /*  agent, and an invitation sent from the page.                      */
  /* ****************************************************************** */
  const webIdentity = await clientIdentity();
  const webClient = await addClient(session, { displayName: "Practice Web Client", vrn: webIdentity.vrn });
  await page.evaluate(() => sessionStorage.setItem("hmrcAccount", "synthetic"));
  await page.goto(`${baseUrl}/practice.html`);
  await expect(page.locator("#licenceLine")).toHaveText("Your practice holds the Resident Pro licence.");
  await expect(page.locator("#hmrcConnectionLine")).toContainText("Not connected to HMRC");
  await connectPracticeToHmrcInBrowser(page, agentUsername, agentPassword, screenshotPath);

  const webClientRow = page.locator("#clientsTableBody tr", { hasText: "Practice Web Client" });
  await expect(webClientRow.locator(".check-status-btn")).toHaveCount(0);
  await page.locator("#arnInput").fill(practiceArn);
  const vatCell = webClientRow.locator(`.auth-cell[data-client-id="${webClient.client.clientId}"][data-service="MTD-VAT"]`);
  await vatCell.locator(".invite-toggle-btn").click();
  await vatCell.locator(".invite-known-fact").fill(webIdentity.knownFact);
  await vatCell.locator(".invite-send-btn").click();
  await expect(vatCell.locator(".auth-status")).toHaveText("Pending");
  await expect(vatCell.locator(".check-status-btn")).toBeEnabled();
});
