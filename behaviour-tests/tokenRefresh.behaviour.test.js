// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/tokenRefresh.behaviour.test.js
//
// Exercises the lazy-token-refresh path in bundleGet which issues
// dynamodb:UpdateItem against the bundles table. The CDK IAM grant for this
// path was missing in the 2026-04 production incident (see REPORT_INCIDENT_BUNDLES.md).
// This test fails with HTTP 500 from GET /api/v1/bundle if the grant is ever
// reverted. Sandbox-safe against -ci and -prod: each run allocates and mutates
// only the freshly minted Cognito test user's own bundle row (unique hashedSub),
// then clears it at the end of the test.

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import { clickLogIn, loginWithCognitoOrMockAuth, verifyLoggedInStatus } from "./steps/behaviour-login-steps.js";
import { goToBundlesPage, ensureBundlePresent, clearBundles } from "./steps/behaviour-bundle-steps.js";
import { hashSub, initializeSalt } from "@app/services/subHasher.js";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

dotenvConfigIfNotBlank({ path: ".env" });

const screenshotPath = "target/behaviour-test-results/screenshots/token-refresh-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const envName = getEnvVarAndLog("envName", "ENVIRONMENT_NAME", "local");
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3500);
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

const TEST_BUNDLE = "invited-guest"; // catalogue has tokenRefreshInterval = "P1M"

test.setTimeout(300_000);

test.beforeAll(async () => {
  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = { ...originalEnv };

  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);

  if (bundleTableName) {
    await initializeSalt();
  } else {
    throw new Error("BUNDLE_DYNAMODB_TABLE_NAME not set; tokenRefresh behaviour test requires direct DynamoDB access.");
  }
});

test.afterAll(async () => {
  if (serverProcess) serverProcess.kill();
  if (mockOAuth2Process) mockOAuth2Process.kill();
  try {
    await dynamoControl?.stop?.();
  } catch {}
});

async function extractUserSub(page) {
  return page.evaluate(() => {
    const token = localStorage.getItem("cognitoIdToken");
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.sub;
    } catch {
      return null;
    }
  });
}

async function forceExpireTokenResetAt(userSub, bundleId) {
  const hashedSub = hashSub(userSub);
  const region = process.env.AWS_REGION || "eu-west-2";
  const endpoint = process.env.DYNAMODB_ENDPOINT || undefined;
  const client = new DynamoDBClient({ region, ...(endpoint ? { endpoint } : {}) });
  const docClient = DynamoDBDocumentClient.from(client);
  await docClient.send(
    new UpdateCommand({
      TableName: bundleTableName,
      Key: { hashedSub, bundleId },
      UpdateExpression: "SET tokenResetAt = :past",
      ExpressionAttributeValues: {
        ":past": "1970-01-01T00:00:00.000Z",
      },
    }),
  );
  return hashedSub;
}

async function fetchBundleApi(page) {
  return page.evaluate(async () => {
    const idToken = localStorage.getItem("cognitoIdToken");
    if (!idToken) return { status: 0, body: { error: "No auth token" } };
    const response = await fetch("/api/v1/bundle", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    let body;
    try {
      body = await response.json();
    } catch (err) {
      body = { parseError: err.message };
    }
    return { status: response.status, body };
  });
}

test("GET /api/v1/bundle refreshes tokens when tokenResetAt has elapsed", async ({ page }) => {
  addOnPageLogging(page);

  await goToHomePageExpectNotLoggedIn(page, baseUrl, screenshotPath);
  await consentToDataCollection(page, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);

  await goToBundlesPage(page, screenshotPath);
  await clearBundles(page, screenshotPath);
  await ensureBundlePresent(page, "Invited Guest", screenshotPath, { testPass: true });

  const userSub = await extractUserSub(page);
  expect(userSub, "expected a Cognito sub in the id token").toBeTruthy();

  // Step 1: confirm the baseline GET succeeds with the fresh bundle (tokenResetAt in the future).
  const before = await fetchBundleApi(page);
  expect(before.status).toBe(200);
  const beforeBundle = (before.body.bundles || []).find((b) => b.bundleId === TEST_BUNDLE && b.allocated);
  expect(beforeBundle, "expected invited-guest allocated for test user").toBeTruthy();

  // Step 2: force-expire the bundle's tokenResetAt via direct DynamoDB UpdateItem.
  const hashedSub = await forceExpireTokenResetAt(userSub, TEST_BUNDLE);
  console.log(`tokenRefresh test: forced tokenResetAt into the past for hashedSub=${hashedSub}`);

  // Step 3: GET /api/v1/bundle must now trigger the server-side resetTokens UpdateItem.
  // Before the IAM fix this returned 500 (dynamodb:UpdateItem AccessDenied on prod-env-bundles).
  const after = await fetchBundleApi(page);
  await page.screenshot({ path: `${screenshotPath}/after-expire-fetch.png` });
  expect(after.status, `GET /api/v1/bundle must return 200 after forced tokenResetAt expiry; body=${JSON.stringify(after.body)}`).toBe(200);

  const refreshed = (after.body.bundles || []).find((b) => b.bundleId === TEST_BUNDLE && b.allocated);
  expect(refreshed, "allocated invited-guest bundle missing from refreshed response").toBeTruthy();
  expect(refreshed.tokensConsumed, "tokensConsumed should be 0 after lazy refresh").toBe(0);
  expect(Number(refreshed.tokensGranted || 0), "tokensGranted should be > 0 after lazy refresh").toBeGreaterThan(0);
  expect(new Date(refreshed.tokenResetAt).getTime()).toBeGreaterThan(Date.now());

  await clearBundles(page, screenshotPath);
});
