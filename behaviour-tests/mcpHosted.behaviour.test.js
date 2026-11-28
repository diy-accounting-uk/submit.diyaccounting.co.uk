// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/mcpHosted.behaviour.test.js
//
// The hosted MCP connector as a chat client meets it: the tool list without a token, then the 401
// challenge to a tools/call, the protected resource and authorization server metadata, dynamic client
// registration, the consent page, sign-in through the Cognito Hosted UI, the code caught on a
// loopback redirect, the token exchange and one refresh, then tools/list and a derivation over a
// book saved to the signed-in user's cloud storage. Every URL derives from DIY_SUBMIT_BASE_URL.
//
// The simulator lane has no upstream authorization server for the MCP client, so it runs the
// steps up to the redirect to the upstream authorize URL; the sign-in and everything after it
// need TEST_AUTH_PROVIDER=cognito-native.

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { createSession, openBook, saveBook } from "../mcp/lib/book-tools.js";
import { HOSTED_TOOL_NAMES } from "../mcp/lib/hosted-tools.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
} from "./helpers/behaviour-helpers.js";
import { companiesHouseLookupFixture, isCompaniesHouseSimulatorLane } from "./steps/behaviour-companies-house-filing-steps.js";
import { COMPANY_AUTHENTICATION_CODE } from "@app/http-simulator/fixtures/register.js";
import {
  clickLogIn,
  fillInHostedUINativeAuth,
  handleTotpChallenge,
  loginWithCognitoOrMockAuth,
  submitHostedUINativeAuth,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";

dotenvConfigIfNotBlank({ path: ".env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOK_FIXTURE_DIRECTORY = path.join(__dirname, "../mcp/test/fixtures/brickwork-pro-ltd-vat");
const REVISED_ACCOUNTS_CASE = JSON.parse(
  readFileSync(path.join(__dirname, "../scripts/fixtures/companies-house-test-service-cases.json"), "utf8"),
).find((testCase) => testCase.name === "micro-entity-accounts-revised");
const LOOPBACK_PORT = 53682;
const LOOPBACK_REDIRECT_URI = `http://127.0.0.1:${LOOPBACK_PORT}/callback`;

const screenshotPath = "target/behaviour-test-results/screenshots/mcp-hosted-behaviour-test";

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

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "mcpHostedBehaviour" });
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

const siteHost = () => new URL(baseUrl).host;
const siteUrl = (pathname) => new URL(pathname, baseUrl).toString();

function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function postForm(url, fields) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
    body: new URLSearchParams(fields).toString(),
  });
  return { response, body: await response.json() };
}

// Steps 1 to 5 of a chat client's connection: challenge, metadata, registration, then the
// authorize URL in a browser through the consent page to the upstream authorize redirect.
async function discoverRegisterAndConsent(page) {
  const mcpUrl = siteUrl("mcp");

  const anonymousList = await fetch(mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  expect(anonymousList.status).toBe(200);
  const anonymousTools = (await anonymousList.json()).result.tools.map((tool) => tool.name);
  expect(anonymousTools.length).toBeGreaterThan(0);
  expect(HOSTED_TOOL_NAMES).toEqual(expect.arrayContaining(anonymousTools));

  const unauthenticated = await fetch(mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_books", arguments: {} } }),
  });
  expect(unauthenticated.status).toBe(401);
  const challenge = unauthenticated.headers.get("www-authenticate");
  const resourceMetadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
  expect(resourceMetadataUrl, `resource_metadata in WWW-Authenticate: ${challenge}`).toBeTruthy();
  expect(new URL(resourceMetadataUrl).pathname).toBe("/.well-known/oauth-protected-resource/mcp");

  const protectedResourceResponse = await fetch(siteUrl(new URL(resourceMetadataUrl).pathname));
  expect(protectedResourceResponse.status).toBe(200);
  expect(protectedResourceResponse.headers.get("content-type")).toContain("application/json");
  const protectedResource = await protectedResourceResponse.json();
  expect(protectedResource.resource).toBe(`https://${siteHost()}/mcp`);
  expect(protectedResource.authorization_servers[0]).toBe(`https://${siteHost()}`);

  const authorizationServerResponse = await fetch(siteUrl("/.well-known/oauth-authorization-server"));
  expect(authorizationServerResponse.status).toBe(200);
  expect(authorizationServerResponse.headers.get("content-type")).toContain("application/json");
  const authorizationServer = await authorizationServerResponse.json();
  expect(authorizationServer.issuer).toBe(protectedResource.authorization_servers[0]);
  expect(authorizationServer.code_challenge_methods_supported).toContain("S256");
  const authorizeUrl = new URL(siteUrl(new URL(authorizationServer.authorization_endpoint).pathname));
  const tokenUrl = siteUrl(new URL(authorizationServer.token_endpoint).pathname);
  const registrationUrl = siteUrl(new URL(authorizationServer.registration_endpoint).pathname);

  const registrationResponse = await fetch(registrationUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Hosted MCP behaviour test",
      redirect_uris: [LOOPBACK_REDIRECT_URI],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  expect(registrationResponse.status).toBe(201);
  const registration = await registrationResponse.json();
  expect(registration.client_id).toBeTruthy();

  const pkce = pkcePair();
  const state = randomBytes(16).toString("base64url");
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: registration.client_id,
    redirect_uri: LOOPBACK_REDIRECT_URI,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    scope: "openid email profile",
    resource: protectedResource.resource,
    state,
  }).toString();

  const upstreamAuthorizeRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.host !== siteHost() && url.searchParams.get("redirect_uri") === `https://${siteHost()}/mcp/oauth/callback`;
  });
  await page.goto(authorizeUrl.toString());
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  const upstreamUrl = new URL((await upstreamAuthorizeRequest).url());
  expect(upstreamUrl.searchParams.get("response_type")).toBe("code");
  expect(upstreamUrl.searchParams.get("code_challenge")).toBeTruthy();
  expect(upstreamUrl.searchParams.get("client_id")).toBeTruthy();

  return { mcpUrl, tokenUrl, clientId: registration.client_id, pkce, state };
}

test("an unauthenticated client is challenged, registers, and is sent to the upstream sign-in after consent", async ({ page }) => {
  addOnPageLogging(page);
  await discoverRegisterAndConsent(page);
});

// Steps 6 and 7: the Hosted UI sign-in, the loopback redirect with its code, the token exchange
// and one refresh. Answers the refreshed access token.
async function signInAndRefresh(page, { tokenUrl, clientId, pkce, state }) {
  /* ******************************************************* */
  /*  SIGN IN, THEN CATCH THE LOOPBACK REDIRECT AND ITS CODE   */
  /* ******************************************************* */

  // The facade answers the upstream callback with a redirect to the loopback URI, and the browser
  // follows that redirect at the network layer, where a Playwright route does not run; a listener
  // on the port catches it as the chat client would.
  let redirected;
  const loopback = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("caught");
    redirected = new URL(request.url, LOOPBACK_REDIRECT_URI);
  });
  const caught = new Promise((resolve) => loopback.once("request", () => resolve()));
  await new Promise((resolve) => loopback.listen(LOOPBACK_PORT, "127.0.0.1", resolve));
  try {
    await fillInHostedUINativeAuth(page, testAuthUsername, testAuthPassword, screenshotPath);
    await submitHostedUINativeAuth(page, screenshotPath);
    if (process.env.TEST_AUTH_TOTP_SECRET) {
      await handleTotpChallenge(page, process.env.TEST_AUTH_TOTP_SECRET, screenshotPath);
    }
    await caught;
  } finally {
    await new Promise((resolve) => loopback.close(resolve));
  }
  expect(redirected.origin + redirected.pathname).toBe(LOOPBACK_REDIRECT_URI);
  expect(redirected.searchParams.get("state")).toBe(state);
  expect(redirected.searchParams.get("error")).toBeNull();
  const code = redirected.searchParams.get("code");
  expect(code, `code on ${redirected.toString()}`).toBeTruthy();

  /* ****************************** */
  /*  TOKEN EXCHANGE AND ONE REFRESH */
  /* ****************************** */

  const exchanged = await postForm(tokenUrl, {
    grant_type: "authorization_code",
    code,
    redirect_uri: LOOPBACK_REDIRECT_URI,
    code_verifier: pkce.verifier,
    client_id: clientId,
  });
  expect(exchanged.response.status, JSON.stringify(exchanged.body)).toBe(200);
  expect(exchanged.body.token_type).toBe("Bearer");
  expect(exchanged.body.access_token).toBeTruthy();
  expect(exchanged.body.refresh_token).toBeTruthy();

  const refreshed = await postForm(tokenUrl, {
    grant_type: "refresh_token",
    refresh_token: exchanged.body.refresh_token,
    client_id: clientId,
  });
  expect(refreshed.response.status, JSON.stringify(refreshed.body)).toBe(200);
  expect(refreshed.body.access_token).toBeTruthy();
  expect(refreshed.body.access_token).not.toBe(exchanged.body.access_token);
  return refreshed.body.access_token;
}

test("a chat client connects, signs in, refreshes, lists the hosted tools and derives a VAT return from a cloud book", async ({ page }) => {
  test.skip(testAuthProvider !== "cognito-native", "the sign-in needs the Cognito Hosted UI with a native test user");
  addOnPageLogging(page);

  const { mcpUrl, tokenUrl, clientId, pkce, state } = await discoverRegisterAndConsent(page);
  const accessToken = await signInAndRefresh(page, { tokenUrl, clientId, pkce, state });

  /* ******************************************************************************* */
  /*  SAVE THE BOOK TO THE USER'S CLOUD STORAGE WITH THE CONNECTOR'S OWN ACCESS TOKEN  */
  /* ******************************************************************************* */

  const bookId = randomUUID();
  process.env.DIYA_SUBMIT_BASE_URL = baseUrl;
  const savingSession = createSession({ credentials: { accessToken: async () => accessToken, idToken: async () => null } });
  await openBook(savingSession, { path: BOOK_FIXTURE_DIRECTORY });
  await saveBook(savingSession, { cloud: true, bookId });

  try {
    /* ************************ */
    /*  THE MCP CONVERSATION     */
    /* ************************ */

    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const client = new Client({ name: "mcp-hosted-behaviour-test", version: "1.0.0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([...HOSTED_TOOL_NAMES].sort());
      for (const tool of tools) {
        expect(tool.title, tool.name).toMatch(/\S/);
        expect(Object.keys(tool.annotations ?? {}).sort(), tool.name).toEqual([
          "destructiveHint",
          "openWorldHint",
          "readOnlyHint",
          "title",
        ]);
        expect(tool.annotations.title, tool.name).toBe(tool.title);
      }

      const opened = await client.callTool({ name: "open_book", arguments: { bookId } });
      expect(opened.isError, JSON.stringify(opened.content)).toBeFalsy();
      const derived = await client.callTool({ name: "derive_vat_return", arguments: { periodEnd: "2025-06-30" } });
      expect(derived.isError, JSON.stringify(derived.content)).toBeFalsy();
      expect(derived.structuredContent).toBeDefined();
    } finally {
      await client.close();
    }
  } finally {
    const removed = await fetch(siteUrl(`api/v1/books/${bookId}`), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(removed.status).toBe(200);
  }
});

// The site's own sign-in in a fresh browser context, answering the Cognito ID token the page keeps.
// The pass admin route reads the caller's email claim, which the connector's access token does not carry.
async function siteIdToken(browser) {
  const context = await browser.newContext();
  try {
    const sitePage = await context.newPage();
    addOnPageLogging(sitePage);
    await goToHomePageExpectNotLoggedIn(sitePage, baseUrl, screenshotPath);
    await clickLogIn(sitePage, screenshotPath);
    await loginWithCognitoOrMockAuth(sitePage, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
    await verifyLoggedInStatus(sitePage, screenshotPath);
    await sitePage.waitForFunction(() => Boolean(localStorage.getItem("cognitoIdToken")));
    return await sitePage.evaluate(() => localStorage.getItem("cognitoIdToken"));
  } finally {
    await context.close();
  }
}

test("a chat client files revised micro-entity accounts through the hosted connector with the codes typed on its link", async ({
  page,
  browser,
}) => {
  test.skip(testAuthProvider !== "cognito-native", "the sign-in needs the Cognito Hosted UI with a native test user");
  addOnPageLogging(page);

  const { mcpUrl, tokenUrl, clientId, pkce, state } = await discoverRegisterAndConsent(page);
  const accessToken = await signInAndRefresh(page, { tokenUrl, clientId, pkce, state });

  /* ******************************************************** */
  /*  GRANT THE BUNDLE THAT FILES ACCOUNTS, BY A TEST PASS     */
  /* ******************************************************** */

  const idToken = await siteIdToken(browser);
  const issued = await fetch(siteUrl("api/v1/pass/admin"), {
    method: "POST",
    headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      passTypeId: "resident-ltd",
      bundleId: "resident-ltd",
      validityPeriod: "P1D",
      maxUses: 1,
      createdBy: "behaviour-test",
      testPass: true,
    }),
  });
  const issuedBody = await issued.json();
  expect(issued.status, JSON.stringify(issuedBody)).toBe(200);
  const passCode = issuedBody?.data?.code || issuedBody?.code;
  expect(passCode, JSON.stringify(issuedBody)).toBeTruthy();
  const redeemed = await fetch(siteUrl("api/v1/pass"), {
    method: "POST",
    headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code: passCode }),
  });
  expect(redeemed.ok, `pass redeem answered HTTP ${redeemed.status}`).toBe(true);

  /* ***************************************************************** */
  /*  THE CODES ON THEIR LINK, THEN THE REVISED FILING AND ONE POLL     */
  /* ***************************************************************** */

  const { companyNumber, companyName } = companiesHouseLookupFixture(envFilePath);
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const client = new Client({ name: "mcp-hosted-behaviour-test", version: "1.0.0" });
  await client.connect(transport);
  try {
    const codes = await client.callTool({ name: "request_companies_house_codes", arguments: { kind: "accounts", companyNumber } });
    expect(codes.isError, JSON.stringify(codes.content)).toBeFalsy();
    expect(codes.structuredContent.entryId).toBeTruthy();

    await page.goto(new URL(codes.structuredContent.url, baseUrl).toString());
    // The simulator checks the authentication code its register holds; the other lanes file with their own.
    await page.locator("#companyAuthCode").fill(isCompaniesHouseSimulatorLane(envFilePath) ? COMPANY_AUTHENTICATION_CODE : "AB12CD");
    await page.locator("#saveCodesBtn").click();
    await expect(page.locator("#codesDoneView")).toBeVisible();

    const filed = await client.callTool({
      name: "submit_micro_entity_accounts_sandbox",
      arguments: {
        companyNumber,
        companyName,
        periodStart: REVISED_ACCOUNTS_CASE.periodStart,
        periodEnd: REVISED_ACCOUNTS_CASE.periodEnd,
        balanceSheet: REVISED_ACCOUNTS_CASE.balanceSheet,
        averageEmployees: REVISED_ACCOUNTS_CASE.averageEmployees,
        director: REVISED_ACCOUNTS_CASE.director,
        statementsAccepted: REVISED_ACCOUNTS_CASE.statementsAccepted,
        revision: REVISED_ACCOUNTS_CASE.revision,
        codesEntryId: codes.structuredContent.entryId,
      },
    });
    expect(filed.isError, JSON.stringify(filed.content)).toBeFalsy();
    expect(filed.structuredContent.submissionNumber).toBeTruthy();

    const polled = await client.callTool({
      name: "poll_submission",
      arguments: { kind: "accounts", submissionNumber: filed.structuredContent.submissionNumber },
    });
    expect(polled.isError, JSON.stringify(polled.content)).toBeFalsy();
    expect(polled.structuredContent.statusCode).toBeTruthy();
  } finally {
    await client.close();
  }
});
