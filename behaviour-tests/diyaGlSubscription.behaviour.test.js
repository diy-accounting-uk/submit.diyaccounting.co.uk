// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/diyaGlSubscription.behaviour.test.js
//
// The row this proves: a token from the DIYA-GL app client can subscribe through Submit's
// billing checkout and portal, and the subject that checkout enrols is the same subject
// diyaGlEntitlement.entitlementFor(sub) reads back for the storage PUT. Runs on ci only —
// resident-diya-gl is listed for purchase there until the operator lifts it, and there is no
// prod variant yet.
//
// The checkout, portal and books calls run as plain Node fetches rather than page.evaluate calls
// from the browser (see behaviour-diya-gl-subscription-steps.js for why); only the interactive
// hosted-UI sign-in and the real Stripe Checkout page need a browser.

import crypto from "node:crypto";
import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { addOnPageLogging, getEnvVarAndLog, runLocalDynamoDb, runLocalHttpServer, runLocalOAuth2Server } from "./helpers/behaviour-helpers.js";
import { fillAndSubmitStripeTestCard } from "./steps/behaviour-bundle-steps.js";
import {
  signInWithDiyaGlHostedUi,
  postDiyaGlCheckout,
  getDiyaGlBillingPortal,
  putDiyaGlBook,
  getDiyaGlBookLatest,
  deleteDiyaGlBook,
} from "./steps/behaviour-diya-gl-subscription-steps.js";

dotenvConfigIfNotBlank({ path: ".env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ZIP_BASE64 = fs.readFileSync(path.join(__dirname, "../fixtures/books/diya-gl-example.zip")).toString("base64");

const screenshotPath = "target/behaviour-test-results/screenshots/diya-gl-subscription-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);

const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const spreadsheetsBaseUrl = getEnvVarAndLog("spreadsheetsBaseUrl", "SPREADSHEETS_BASE_URL", "http://localhost:3000/");
const cognitoBaseUri = getEnvVarAndLog("cognitoBaseUri", "COGNITO_BASE_URI", null);
const cognitoDiyaGlClientId = getEnvVarAndLog("cognitoDiyaGlClientId", "COGNITO_DIYA_GL_CLIENT_ID", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const testAuthPassword = getEnvVarAndLog("testAuthPassword", "TEST_AUTH_PASSWORD", null);
const entitlementEnforced = getEnvVarAndLog("entitlementEnforced", "DIYA_GL_ENTITLEMENT_ENFORCED", null) === "true";

// One of the four DIYA-GL page paths IdentityStack registers as a books-client callback/logout
// URL (see BOOKS_PAGE_NAMES in IdentityStack.java). The spreadsheets site serves these pages at
// diya-gl/, not books/ — going straight to the real path means no redirect in the sign-in flow.
const diyaGlPageUrl = new URL("diya-gl/ltd.html", spreadsheetsBaseUrl).toString();

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "diyaGlSubscriptionBehaviour" });
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

test("subscribes with a DIYA-GL token, then puts and reads a book", async ({ page }) => {
  test.skip(
    !cognitoDiyaGlClientId,
    "DIYA-GL client credentials (COGNITO_DIYA_GL_CLIENT_ID) are not configured on this environment; skipping.",
  );

  addOnPageLogging(page);

  const apiBase = new URL("api/v1", baseUrl).toString().replace(/\/$/, "");
  // A fresh id each run: the durable test user keeps its books, and a put on an existing book
  // without its current etag answers 412.
  const bookId = crypto.randomUUID();
  const redirectUri = diyaGlPageUrl;

  /* ****************************************** */
  /*  SIGN IN THROUGH THE DIYA-GL APP CLIENT  */
  /* ****************************************** */

  const { idToken } = await signInWithDiyaGlHostedUi(
    page,
    { cognitoBaseUri, booksClientId: cognitoDiyaGlClientId, redirectUri, testAuthUsername, testAuthPassword },
    screenshotPath,
  );
  expect(idToken).toBeTruthy();

  /* ******************************************************** */
  /*  UNENTITLED PUT IS REFUSED, WHEN ENTITLEMENT IS ENFORCED  */
  /* ******************************************************** */

  if (entitlementEnforced) {
    const unentitledPut = await putDiyaGlBook({ apiBase, idToken, bookId, zipBase64: FIXTURE_ZIP_BASE64 });
    expect(unentitledPut.status).toBe(403);
    expect(unentitledPut.body.code).toBe("subscription-required");
  } else {
    test.info().annotations.push({
      type: "skipped-assertion",
      description: "DIYA_GL_ENTITLEMENT_ENFORCED is not true on this environment, so the unentitled-PUT-is-refused step was not exercised.",
    });
  }

  /* ******************************************************************** */
  /*  CHECKOUT WITH THE DIYA-GL TOKEN — THE AUDIENCE CHANGE UNDER TEST  */
  /* ******************************************************************** */

  const checkout = await postDiyaGlCheckout({ apiBase, idToken, bundleId: "resident-diya-gl", returnTo: diyaGlPageUrl });
  expect(checkout.status, `checkout response: ${JSON.stringify(checkout.body)}`).toBe(200);
  expect(checkout.body.checkoutUrl).toContain("checkout.stripe.com");

  /* **************************************** */
  /*  COMPLETE THE STRIPE TEST CHECKOUT PAGE  */
  /* **************************************** */

  await page.goto(checkout.body.checkoutUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await fillAndSubmitStripeTestCard(page, screenshotPath);
  await page.waitForURL((url) => url.toString().startsWith(diyaGlPageUrl) && url.searchParams.get("checkout") === "success", {
    timeout: 120_000,
  });

  /* ******************************************************* */
  /*  THE BROWSER CAME BACK TO THE DIYA-GL PAGE, NOT BUNDLES  */
  /* ******************************************************* */

  expect(page.url()).not.toContain("bundles.html");
  expect(page.url().startsWith(diyaGlPageUrl)).toBe(true);

  /* ******************************************************************* */
  /*  PUT AND READ A BOOK WITH THE SAME TOKEN — RETRIES WHILE THE STRIPE  */
  /*  WEBHOOK CATCHES UP AND GRANTS THE BUNDLE                            */
  /* ******************************************************************* */

  let put;
  const putDeadline = Date.now() + 30_000;
  do {
    put = await putDiyaGlBook({ apiBase, idToken, bookId, zipBase64: FIXTURE_ZIP_BASE64 });
    if (put.status !== 200) await page.waitForTimeout(2_000);
  } while (put.status !== 200 && Date.now() < putDeadline);
  expect(put.status, `put response: ${JSON.stringify(put.body)}`).toBe(200);

  const read = await getDiyaGlBookLatest({ apiBase, idToken, bookId });
  expect(read.status).toBe(200);
  expect(read.body.zipBase64).toBe(FIXTURE_ZIP_BASE64);

  const deleted = await deleteDiyaGlBook({ apiBase, idToken, bookId });
  expect(deleted.status).toBe(200);

  /* ************************************ */
  /*  THE BILLING PORTAL, SAME TOKEN TOO  */
  /* ************************************ */

  const portal = await getDiyaGlBillingPortal({ apiBase, idToken, returnTo: diyaGlPageUrl });
  expect(portal.status, `portal response: ${JSON.stringify(portal.body)}`).toBe(200);
  expect(portal.body.portalUrl).toContain("billing.stripe.com");
});
