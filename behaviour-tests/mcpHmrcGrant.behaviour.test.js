// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/mcpHmrcGrant.behaviour.test.js
//
// An HMRC grant the MCP starts itself, as a chat client meets it: request_hmrc_authorisation answers
// HMRC's link, the user walks HMRC's consent pages in a browser that is not signed in to Submit,
// lands on Submit's callback page, and the MCP then lists VAT obligations with no token argument.
// Every tool call goes through a real MCP client over an in-memory transport, against the local
// server. On the simulator lane the HTTP simulator plays HMRC.

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { createSession } from "../mcp/lib/book-tools.js";
import { callHarnessTool } from "../mcp/lib/harness.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
} from "./helpers/behaviour-helpers.js";
import { fillInHmrcAuth, goToHmrcAuth, grantPermissionHmrcAuth, initHmrcAuth, submitHmrcAuth } from "./steps/behaviour-hmrc-steps.js";

dotenvConfigIfNotBlank({ path: ".env" });

const screenshotPath = "target/behaviour-test-results/screenshots/mcp-hmrc-grant-behaviour-test";
const SIMULATOR_VRN = "111222333";
const USER_SUB = "mcp-hmrc-grant-behaviour-user";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);
const usingHttpSimulator = getEnvVarAndLog("usingHttpSimulator", "TEST_HTTP_SIMULATOR", null) === "run";

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "mcpHmrcGrantBehaviour" });
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

function unsignedJwt(sub) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const issuedAt = Math.floor(Date.now() / 1000);
  const claims = { sub, email: `${sub}@example.com`, iat: issuedAt, exp: issuedAt + 3600 };
  return [encode({ alg: "none", typ: "JWT" }), encode(claims), ""].join(".");
}

async function callTool(session, tool, args) {
  const answer = await callHarnessTool(session, tool, args);
  expect(answer.ok, `${tool}: ${JSON.stringify(answer.result)}`).toBe(true);
  return answer.result;
}

test("the MCP starts an HMRC grant, the user consents in the browser, and the VAT tools file with no token argument", async ({ page }) => {
  test.skip(!usingHttpSimulator, "the bearer is an unsigned local token, which only the local server accepts");
  addOnPageLogging(page);

  const bearer = unsignedJwt(USER_SUB);
  process.env.DIYA_SUBMIT_BASE_URL = baseUrl;
  const session = createSession({ credentials: { accessToken: async () => bearer, idToken: async () => bearer }, pollBudgetMs: 30_000 });
  const bundle = await fetch(new URL("api/v1/bundle", baseUrl), {
    method: "POST",
    headers: { "Authorization": `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ bundleId: "day-guest" }),
  });
  expect(bundle.ok).toBe(true);

  await test.step("A VAT tool with no grant names the authorisation tool", async () => {
    const refused = await callHarnessTool(session, "list_vat_obligations", { vrn: SIMULATOR_VRN, status: "O" });
    expect(refused.ok).toBe(false);
    expect(String(refused.result)).toContain("request_hmrc_authorisation");
  });

  const authorisation = await test.step("The chat asks for HMRC's link", async () => {
    const answer = await callTool(session, "request_hmrc_authorisation", { services: ["vat"], hmrcAccount: "synthetic" });
    expect(answer.scope).toBe("read:vat write:vat");
    expect(new URL(answer.url).searchParams.get("state")).toMatch(/^mcp\./);
    expect(JSON.stringify(answer)).not.toContain(session.hmrcGrant.grantId);
    return answer;
  });

  await test.step("A VAT tool before the user consents says the grant is not finished", async () => {
    const pending = await callHarnessTool(session, "list_vat_obligations", { vrn: SIMULATOR_VRN, status: "O" });
    expect(pending.ok).toBe(false);
    expect(String(pending.result)).toContain("not finished granting HMRC access");
  });

  await test.step("The user opens the link and grants access on HMRC's pages", async () => {
    await page.goto(authorisation.url);
    await goToHmrcAuth(page, screenshotPath);
    await initHmrcAuth(page, screenshotPath);
    await fillInHmrcAuth(page, "mcp-grant-user", "mcp-grant-password", screenshotPath);
    await submitHmrcAuth(page, screenshotPath);
    await grantPermissionHmrcAuth(page, screenshotPath);
  });

  await test.step("Submit's callback page stores the grant and sends the user back to the chat", async () => {
    await expect(page).toHaveURL(/\/activities\/submitVatCallback\.html$/);
    await expect(page.locator("#statusMessagesContainer")).toContainText("HMRC access granted. Go back to your chat to carry on.");
    const stored = await page.evaluate(() => sessionStorage.getItem("hmrcAccessToken"));
    expect(stored).toBeNull();
    await page.screenshot({ path: `${screenshotPath}/callback-granted.png` });
  });

  await test.step("The chat lists the open obligations with no token argument", async () => {
    const listed = await callTool(session, "list_vat_obligations", { vrn: SIMULATOR_VRN, status: "O" });
    const obligations = listed.obligations ?? listed.hmrcResponse?.obligations;
    expect(Array.isArray(obligations)).toBe(true);
    expect(obligations.length).toBeGreaterThan(0);
  });

  await test.step("The used link cannot be replayed", async () => {
    const replay = await fetch(new URL("api/v1/mcp/hmrc-grants/callback", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "replayed-code", state: new URL(authorisation.url).searchParams.get("state") }),
    });
    expect(replay.status).toBe(409);
  });
});
