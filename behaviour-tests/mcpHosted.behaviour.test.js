// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/mcpHosted.behaviour.test.js
//
// The hosted MCP connector as a chat client meets it: an unauthenticated POST to /mcp, the 401
// challenge, the protected resource and authorization server metadata, dynamic client
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
import { fillInHostedUINativeAuth, handleTotpChallenge, submitHostedUINativeAuth } from "./steps/behaviour-login-steps.js";

dotenvConfigIfNotBlank({ path: ".env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOK_FIXTURE_DIRECTORY = path.join(__dirname, "../mcp/test/fixtures/brickwork-pro-ltd-vat");
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

  const unauthenticated = await fetch(mcpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
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

test("a chat client connects, signs in, refreshes, lists the hosted tools and derives a VAT return from a cloud book", async ({
  page,
  context,
}) => {
  test.skip(testAuthProvider !== "cognito-native", "the sign-in needs the Cognito Hosted UI with a native test user");
  addOnPageLogging(page);

  const { mcpUrl, tokenUrl, clientId, pkce, state } = await discoverRegisterAndConsent(page);

  /* ******************************************************* */
  /*  SIGN IN, THEN CATCH THE LOOPBACK REDIRECT AND ITS CODE   */
  /* ******************************************************* */

  const caught = new Promise((resolve) => {
    context.route(`http://127.0.0.1:${LOOPBACK_PORT}/**`, (route) => {
      resolve(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/plain", body: "caught" });
    });
  });
  await fillInHostedUINativeAuth(page, testAuthUsername, testAuthPassword, screenshotPath);
  await submitHostedUINativeAuth(page, screenshotPath);
  if (process.env.TEST_AUTH_TOTP_SECRET) {
    await handleTotpChallenge(page, process.env.TEST_AUTH_TOTP_SECRET, screenshotPath);
  }
  const redirected = new URL(await caught);
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
  const accessToken = refreshed.body.access_token;

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
