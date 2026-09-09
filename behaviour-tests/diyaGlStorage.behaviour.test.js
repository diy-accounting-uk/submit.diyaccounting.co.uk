// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/diyaGlStorage.behaviour.test.js
//
// Drives the DIYA-GL storage API's four routes as the spreadsheets site's DIYA-GL pages will: sign in
// through Submit's hosted UI, read the id token it leaves in localStorage, then navigate to a page
// on the spreadsheets origin and call the API from there with fetch, so the browser enforces the
// same CORS the deployed API answers with. Before LP-15 lands the DIYA-GL app client, this runs
// against the existing client id, which the DIYA-GL authoriser does not yet accept in production -
// this probe is written and exercised locally but not run against ci in this change.

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
} from "./helpers/behaviour-helpers.js";
import { goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import { clickLogIn, loginWithCognitoOrMockAuth, verifyLoggedInStatus } from "./steps/behaviour-login-steps.js";

dotenvConfigIfNotBlank({ path: ".env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ZIP_BASE64 = fs.readFileSync(path.join(__dirname, "../fixtures/books/diya-gl-example.zip")).toString("base64");

const screenshotPath = "target/behaviour-test-results/screenshots/diya-gl-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const testAuthPassword = getEnvVarAndLog("testAuthPassword", "TEST_AUTH_PASSWORD", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const spreadsheetsBaseUrl = getEnvVarAndLog("spreadsheetsBaseUrl", "SPREADSHEETS_BASE_URL", "http://localhost:3000/");
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "diyaGlBehaviour" });
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

test("create, read latest, 412 on a stale ETag, then delete a book from the spreadsheets origin", async ({ page }) => {
  addOnPageLogging(page);

  /* ******* */
  /*  LOGIN  */
  /* ******* */

  await goToHomePageExpectNotLoggedIn(page, baseUrl, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);

  const idToken = await page.evaluate(() => localStorage.getItem("cognitoIdToken"));
  expect(idToken, "expected a cognitoIdToken in localStorage after login").toBeTruthy();

  /* ************************************************** */
  /*  DRIVE THE API FROM THE SPREADSHEETS SITE'S ORIGIN  */
  /* ************************************************** */

  await page.goto(spreadsheetsBaseUrl);

  const apiBaseUrl = new URL("api/v1/books", baseUrl).toString();
  const bookId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  const created = await page.evaluate(
    async ({ apiBaseUrl, bookId, idToken, zipBase64 }) => {
      const response = await fetch(`${apiBaseUrl}/${bookId}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Behaviour Probe Book",
          product: "ltd",
          periodCoveredStart: "2025-04-01",
          periodCoveredEnd: "2026-03-31",
          provenance: { formatVersion: "1", engineVersion: "1.0.0", taxDataHash: null, templateHash: null, reconciledCommit: null },
          zipBase64,
        }),
      });
      return { status: response.status, body: await response.json(), etag: response.headers.get("ETag") };
    },
    { apiBaseUrl, bookId, idToken, zipBase64: FIXTURE_ZIP_BASE64 },
  );
  expect(created.status).toBe(200);
  const firstETag = created.body.metadata.latestETag;

  const read = await page.evaluate(
    async ({ apiBaseUrl, bookId, idToken }) => {
      const response = await fetch(`${apiBaseUrl}/${bookId}/versions/latest`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      return { status: response.status, body: await response.json() };
    },
    { apiBaseUrl, bookId, idToken },
  );
  expect(read.status).toBe(200);
  expect(read.body.zipBase64).toBe(FIXTURE_ZIP_BASE64);

  const staleConflict = await page.evaluate(
    async ({ apiBaseUrl, bookId, idToken, zipBase64 }) => {
      const response = await fetch(`${apiBaseUrl}/${bookId}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json", "If-Match": "not-the-real-etag" },
        body: JSON.stringify({
          title: "Behaviour Probe Book",
          product: "ltd",
          periodCoveredStart: "2025-04-01",
          periodCoveredEnd: "2026-03-31",
          provenance: {},
          zipBase64,
        }),
      });
      return { status: response.status, body: await response.json() };
    },
    { apiBaseUrl, bookId, idToken, zipBase64: FIXTURE_ZIP_BASE64 },
  );
  expect(staleConflict.status).toBe(412);
  expect(staleConflict.body.code).toBe("etag-mismatch");
  expect(staleConflict.body.latestETag).toBe(firstETag);

  const deleted = await page.evaluate(
    async ({ apiBaseUrl, bookId, idToken }) => {
      const response = await fetch(`${apiBaseUrl}/${bookId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      return { status: response.status, body: await response.json() };
    },
    { apiBaseUrl, bookId, idToken },
  );
  expect(deleted.status).toBe(200);
  expect(deleted.body.bookId).toBe(bookId);
});
