// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/diyaGlStorage.behaviour.test.js
//
// Drives the DIYA-GL storage API's four routes as the diya-gl.co.uk pages do: sign in through the
// Cognito hosted UI on the DIYA-GL app client (the audience the books authoriser accepts), then
// navigate to a page on the diya-gl.co.uk origin and call the API from there with fetch, so the
// browser enforces the same CORS the deployed API answers with. A caller without a subscription
// gets the sandbox tier, which accepts the save, so the case needs no checkout.

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import crypto from "node:crypto";
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
import { signInWithDiyaGlHostedUi, deleteDiyaGlBook } from "./steps/behaviour-diya-gl-subscription-steps.js";

dotenvConfigIfNotBlank({ path: ".env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ZIP_BASE64 = fs.readFileSync(path.join(__dirname, "../fixtures/diya-gl/diya-gl-example.zip")).toString("base64");

const screenshotPath = "target/behaviour-test-results/screenshots/diya-gl-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const testAuthPassword = getEnvVarAndLog("testAuthPassword", "TEST_AUTH_PASSWORD", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const diyaGlBaseUrl = getEnvVarAndLog("diyaGlBaseUrl", "DIYA_GL_BASE_URL", null);
const cognitoBaseUri = getEnvVarAndLog("cognitoBaseUri", "COGNITO_BASE_URI", null);
const cognitoDiyaGlClientId = getEnvVarAndLog("cognitoDiyaGlClientId", "COGNITO_DIYA_GL_CLIENT_ID", null);
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

test("create, read latest, 412 on a stale ETag, then delete a book from the diya-gl.co.uk origin", async ({ page }) => {
  test.skip(
    runTestServer === "run",
    "the local server has no DIYA-GL storage routes, so the books API exists only on a deployed environment; skipping.",
  );
  if (!diyaGlBaseUrl) {
    throw new Error("Environment variable DIYA_GL_BASE_URL is not set; the env file for a deployed lane must name the diya-gl host.");
  }

  if (!cognitoDiyaGlClientId || !cognitoBaseUri) {
    throw new Error("COGNITO_BASE_URI and COGNITO_DIYA_GL_CLIENT_ID must be set; the books routes accept only the DIYA-GL app client.");
  }

  addOnPageLogging(page);

  /* ******************************************** */
  /*  SIGN IN THROUGH THE DIYA-GL APP CLIENT  */
  /* ******************************************** */

  const { idToken } = await signInWithDiyaGlHostedUi(
    page,
    {
      cognitoBaseUri,
      booksClientId: cognitoDiyaGlClientId,
      redirectUri: new URL("ltd.html", diyaGlBaseUrl).toString(),
      testAuthUsername,
      testAuthPassword,
    },
    screenshotPath,
  );
  expect(idToken).toBeTruthy();

  /* ************************************************** */
  /*  DRIVE THE API FROM THE SPREADSHEETS SITE'S ORIGIN  */
  /* ************************************************** */

  await page.goto(diyaGlBaseUrl);

  const apiBaseUrl = new URL("api/v1/books", baseUrl).toString();
  // A fresh id each run: the durable test user keeps its books, and a save over an existing book
  // without its current ETag answers 412.
  const bookId = crypto.randomUUID();

  try {
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
  } finally {
    await deleteDiyaGlBook({ apiBase: new URL("api/v1", baseUrl).toString().replace(/\/$/, ""), idToken, bookId });
  }
});
