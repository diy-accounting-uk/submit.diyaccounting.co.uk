// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/commissionJourneys.behaviour.test.js
//
// One click-through per referrer kind on the simulator lane: the referrer subscribes and generates a pass, a second
// account redeems it (Request) and subscribes, and the commission lines are read after each event the simulator
// stands in for: a paid invoice, a refund, a cancel and the release run at a chosen clock.
//
// The operator dashboard's "Affiliates by group" table is built from the analytics lake into a published snapshot,
// which the simulator lane does not have, so the lines are read from the simulator-only commission route
// (the same state, hold reasons and amounts the table groups).

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
  timestamp,
  takeScreenshot,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  initMockAuth,
  logOutAndExpectToBeLoggedOut,
  submitMockAuth,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { goToBundlesPage, ensureBundleViaCheckout } from "./steps/behaviour-bundle-steps.js";
import { goToGenerateDigitalPassPage, generatePass } from "./steps/behaviour-pass-generation-steps.js";

dotenvConfigIfNotBlank({ path: ".env" });

const screenshotPath = "target/behaviour-test-results/screenshots/commission-journeys-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3500);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);

// The four journeys share one server and one table, so a release run also re-evaluates an earlier journey's held
// line. A journey asserts the lines of its own redeemer, and from the run only how many it released.

const FAMILY_EMAIL = process.env.FAMILY_AFFILIATE_EMAILS.split(",")[0].trim();

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(900_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "commissionJourneysBehaviour" });
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

async function loginAs(page, { username, email }) {
  await goToHomePageExpectNotLoggedIn(page, baseUrl, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await initMockAuth(page, screenshotPath);
  await page.locator('input[name="username"]').fill(username);
  await page.locator('textarea[name="claims"]').fill(JSON.stringify({ email }));
  await submitMockAuth(page, screenshotPath);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);
}

const subOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("userInfo")).sub);

async function referrerGeneratesPass(page, referrer) {
  await loginAs(page, referrer);
  await goToBundlesPage(page, screenshotPath);
  await ensureBundleViaCheckout(page, "resident-vat", screenshotPath, { skipPass: true });
  const referrerSub = await subOf(page);
  await goToGenerateDigitalPassPage(page, baseUrl, screenshotPath);
  const code = await generatePass(page, screenshotPath);
  expect(code).toBeTruthy();
  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
  return { referrerSub, code };
}

async function redeemerRequestsThenSubscribes(page, redeemer, code) {
  await loginAs(page, redeemer);
  await goToBundlesPage(page, screenshotPath);
  await page.locator("#passInput").fill(code);
  await page.locator("#redeemPassBtn").click();
  await expect(page.locator("#passStatus")).toBeVisible({ timeout: 15000 });
  const request = page.locator('button.service-btn:has-text("Request Week pass"):not([disabled])');
  await expect(request).toBeVisible({ timeout: 10000 });
  await request.click();
  await expect(page.locator('button[data-remove-bundle-id="week-guest"]')).toBeVisible({ timeout: 15000 });
  await takeScreenshot(page, { path: `${screenshotPath}/${timestamp()}-redeemed.png`, readerView: true });
  await ensureBundleViaCheckout(page, "resident-vat", screenshotPath, { skipPass: true });
  const redeemerSub = await subOf(page);
  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
  return redeemerSub;
}

function commissionApi(page, redeemerSub) {
  return async (action, fields = {}) => {
    const response = await page.request.post(new URL("/api/v1/simulator/commission", baseUrl).toString(), {
      data: { action, redeemerSub, ...fields },
    });
    expect(response.ok(), `${action}: ${await response.text()}`).toBe(true);
    return response.json();
  };
}

const view = (lines) => lines.map(({ state, tier, form, amountPence, holdReasons }) => ({ state, tier, form, amountPence, holdReasons }));
const lastRelease = (lines) => new Date(Math.max(...lines.map((line) => new Date(line.releaseAt).getTime())));
const justBefore = (lines) => new Date(Math.min(...lines.map((line) => new Date(line.releaseAt).getTime())) - 1);

const held = (tier, form, amountPence) => ({ state: "held", tier, form, amountPence, holdReasons: [] });

test("J1 customer credit: a refund reverses one held line and the others become payable at the end of the hold", async ({ page }) => {
  addOnPageLogging(page);
  const { code } = await referrerGeneratesPass(page, { username: "j1-referrer", email: "synthetic-j1-referrer@test.diyaccounting.co.uk" });
  const redeemerSub = await redeemerRequestsThenSubscribes(
    page,
    { username: "j1-redeemer", email: "synthetic-j1-redeemer@test.diyaccounting.co.uk" },
    code,
  );
  const api = commissionApi(page, redeemerSub);

  let outcome;
  for (const month of [0, 1, 2]) outcome = await api("invoicePaid", { month });
  expect(view(outcome.lines)).toEqual([held("customer", "credit", 330), held("customer", "credit", 330), held("customer", "credit", 330)]);

  outcome = await api("refund", { month: 2 });
  expect(view(outcome.lines).map((line) => line.state)).toEqual(["held", "held", "reversed"]);

  outcome = await api("release", { asOf: justBefore(outcome.lines).toISOString() });
  expect(outcome.summary).toMatchObject({ released: 0 });

  outcome = await api("release", { asOf: lastRelease(outcome.lines.slice(0, 2)).toISOString() });
  expect(outcome.summary).toMatchObject({ released: 2 });
  expect(view(outcome.lines).map(({ state, amountPence }) => ({ state, amountPence }))).toEqual([
    { state: "payable", amountPence: 330 },
    { state: "payable", amountPence: 330 },
    { state: "reversed", amountPence: 330 },
  ]);
});

test("J2 family: a cancel inside 30 days and an unapproved affiliate keep the first month held with both reasons", async ({ page }) => {
  addOnPageLogging(page);
  const { code } = await referrerGeneratesPass(page, { username: "j2-referrer", email: FAMILY_EMAIL });
  const redeemerSub = await redeemerRequestsThenSubscribes(
    page,
    { username: "j2-redeemer", email: "synthetic-j2-redeemer@test.diyaccounting.co.uk" },
    code,
  );
  const api = commissionApi(page, redeemerSub);

  let outcome = await api("invoicePaid", { month: 0 });
  expect(view(outcome.lines)).toEqual([held("family", "cash", 1000)]);
  expect(await api("invoicePaid", { month: 1 }).then((body) => body.result)).toEqual({ status: "no-commission" });

  outcome = await api("cancel", { canceledAt: "2026-01-11T00:00:00.000Z" });
  outcome = await api("release", { asOf: lastRelease(outcome.lines).toISOString() });
  expect(outcome.summary).toMatchObject({ released: 0 });
  expect(view(outcome.lines)).toEqual([{ ...held("family", "cash", 1000), holdReasons: ["early_cancel", "affiliate_not_approved"] }]);
});

test("J3 affiliate applied, not approved: the line keeps the customer tier after approval and is payable after a late cancel", async ({
  page,
}) => {
  addOnPageLogging(page);
  const { referrerSub, code } = await referrerGeneratesPass(page, {
    username: "j3-referrer",
    email: "synthetic-j3-referrer@test.diyaccounting.co.uk",
  });
  const redeemerSub = await redeemerRequestsThenSubscribes(
    page,
    { username: "j3-redeemer", email: "synthetic-j3-redeemer@test.diyaccounting.co.uk" },
    code,
  );
  const api = commissionApi(page, redeemerSub);

  await api("affiliate", { referrerSub, tier: "casual", state: "applied" });
  await api("invoicePaid", { month: 0 });
  await api("affiliate", { referrerSub, tier: "casual", state: "approved" });
  await api("invoicePaid", { month: 1 });
  let outcome = await api("invoicePaid", { month: 2 });
  expect(view(outcome.lines)).toEqual([held("customer", "credit", 330), held("customer", "credit", 330), held("customer", "credit", 330)]);

  outcome = await api("cancel", { canceledAt: "2026-02-20T00:00:00.000Z" });
  outcome = await api("release", { asOf: lastRelease(outcome.lines).toISOString() });
  expect(outcome.summary).toMatchObject({ released: 3 });
  expect(view(outcome.lines).map((line) => line.state)).toEqual(["payable", "payable", "payable"]);
});

test("J4 affiliate approved casual: cash lines wait 120 days, then become payable", async ({ page }) => {
  addOnPageLogging(page);
  const { referrerSub, code } = await referrerGeneratesPass(page, {
    username: "j4-referrer",
    email: "synthetic-j4-referrer@test.diyaccounting.co.uk",
  });
  const redeemerSub = await redeemerRequestsThenSubscribes(
    page,
    { username: "j4-redeemer", email: "synthetic-j4-redeemer@test.diyaccounting.co.uk" },
    code,
  );
  const api = commissionApi(page, redeemerSub);

  await api("affiliate", { referrerSub, tier: "casual", state: "approved" });
  let outcome;
  for (const month of [0, 1, 2]) outcome = await api("invoicePaid", { month });
  expect(view(outcome.lines)).toEqual([held("casual", "cash", 330), held("casual", "cash", 330), held("casual", "cash", 330)]);

  outcome = await api("release", { asOf: justBefore(outcome.lines).toISOString() });
  expect(outcome.summary).toMatchObject({ released: 0 });

  outcome = await api("release", { asOf: lastRelease(outcome.lines).toISOString() });
  expect(outcome.summary).toMatchObject({ released: 3 });
  expect(view(outcome.lines).map((line) => line.state)).toEqual(["payable", "payable", "payable"]);
});
