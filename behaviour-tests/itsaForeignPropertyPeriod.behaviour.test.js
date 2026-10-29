// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/itsaForeignPropertyPeriod.behaviour.test.js

import { test } from "./helpers/playwrightTestWithout.js";
import { expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  createHmrcTestUser,
  createHmrcTestBusiness,
  getEnvVarAndLog,
  isSyntheticMode,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
  saveHmrcTestUserToFiles,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePageExpectNotLoggedIn, goToHomePageUsingMainNav } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  logOutAndExpectToBeLoggedOut,
  verifyLoggedInStatus,
} from "./steps/behaviour-login-steps.js";
import { ensureBundleViaPassApi } from "./steps/behaviour-bundle-steps.js";
import {
  addItsaForeignProperty,
  changeItsaForeignPropertyAmendRent,
  endItsaForeignProperty,
  fillInItsaBusinessDetails,
  fillInItsaForeignPropertyPeriod,
  initItsaBusinessDetails,
  initItsaForeignPropertyPeriod,
  initItsaForeignPropertyPeriodAmend,
  listItsaForeignPropertyPeriods,
  loadAndFillItsaForeignPropertyPropertyRents,
  loadItsaForeignPropertyCurrentTotal,
  loadItsaForeignPropertyDetails,
  loadItsaForeignPropertyPeriodForAmend,
  submitItsaBusinessDetailsForm,
  submitItsaForeignPropertyPeriodAmendForm,
  submitItsaForeignPropertyPeriodForm,
  useFirstListedForeignPropertyPeriod,
  verifyItsaBusinessDetailsResults,
  verifyItsaForeignPropertyPeriodAmendResults,
  verifyItsaForeignPropertyPeriodResults,
  viewItsaForeignPropertyCurrentTotal,
  viewItsaForeignPropertyPeriodFromList,
} from "./steps/behaviour-hmrc-itsa-steps.js";
import {
  acceptCookiesHmrc,
  completeHmrcReauthIfPresented,
  fillInHmrcAuth,
  goToHmrcAuth,
  grantPermissionHmrcAuth,
  initHmrcAuth,
  submitHmrcAuth,
} from "./steps/behaviour-hmrc-steps.js";
import { exportAllTables } from "./helpers/dynamodb-export.js";
import {
  assertHmrcApiRequestExists,
  assertConsistentHashedSub,
  assertEssentialFraudPreventionHeadersPresent,
  countHmrcApiRequestValues,
  assertFraudPreventionHeaders,
  intentionallyNotSuppliedHeaders,
} from "./helpers/dynamodb-assertions.js";
import {
  appendTraceparentTxt,
  appendUserSubTxt,
  appendHashedUserSubTxt,
  deleteTraceparentTxt,
  deleteUserSubTxt,
  deleteHashedUserSubTxt,
  extractUserSubFromLocalStorage,
} from "./helpers/fileHelper.js";

dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, HMRC API credentials

const screenshotPath = "target/behaviour-test-results/screenshots/itsa-foreign-property-period-behaviour-test";

const originalEnv = { ...process.env };

const envFilePath = getEnvVarAndLog("envFilePath", "DIY_SUBMIT_ENV_FILEPATH", null);
const envName = getEnvVarAndLog("envName", "ENVIRONMENT_NAME", "local");
const httpServerPort = getEnvVarAndLog("serverPort", "TEST_SERVER_HTTP_PORT", 3000);
const runTestServer = getEnvVarAndLog("runTestServer", "TEST_SERVER_HTTP", null);
const runMockOAuth2 = getEnvVarAndLog("runMockOAuth2", "TEST_MOCK_OAUTH2", null);
const testAuthProvider = getEnvVarAndLog("testAuthProvider", "TEST_AUTH_PROVIDER", null);
const testAuthUsername = getEnvVarAndLog("testAuthUsername", "TEST_AUTH_USERNAME", null);
const testAuthPassword = getEnvVarAndLog("testAuthPassword", "TEST_AUTH_PASSWORD", null);
const baseUrl = getEnvVarAndLog("baseUrl", "DIY_SUBMIT_BASE_URL", null);
const hmrcTestNino = getEnvVarAndLog("hmrcTestNino", "TEST_HMRC_NINO", null);
const hmrcTestUsername = getEnvVarAndLog("hmrcTestUsername", "TEST_HMRC_USERNAME", null);
const hmrcTestPassword = getEnvVarAndLog("hmrcTestPassword", "TEST_HMRC_PASSWORD", null);
const runDynamoDb = getEnvVarAndLog("runDynamoDb", "TEST_DYNAMODB", null);
const bundleTableName = getEnvVarAndLog("bundleTableName", "BUNDLE_DYNAMODB_TABLE_NAME", null);
const hmrcApiRequestsTableName = getEnvVarAndLog("hmrcApiRequestsTableName", "HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", null);
const receiptsTableName = getEnvVarAndLog("receiptsTableName", "RECEIPTS_DYNAMODB_TABLE_NAME", null);
// Enable fraud prevention header validation in synthetic mode (required for HMRC API compliance testing)
const runFraudPreventionHeaderValidation = isSyntheticMode();
// The dated 2024-25 filing and the probe assertions below hold for our own HTTP simulator
// (app/http-simulator/routes/itsa-foreign-property-*.js) and not for the real HMRC sandbox.
// isSyntheticMode() can't tell the two apart, so use TEST_HTTP_SIMULATOR (only .env.simulator
// sets it to "run") to gate them out of any lane that talks to the real sandbox.
const usingHttpSimulator = getEnvVarAndLog("usingHttpSimulator", "TEST_HTTP_SIMULATOR", null) === "run";

let mockOAuth2Process;
let serverProcess;
let dynamoControl;
let userSub = null;
let observedTraceparent = null;

test.setTimeout(1200_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "itsaForeignPropertyPeriodBehaviour" });
});

test.beforeAll(async ({ page }, testInfo) => {
  console.log("Starting beforeAll hook...");

  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = {
    ...originalEnv,
  };

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  deleteUserSubTxt(outputDir);
  deleteHashedUserSubTxt(outputDir);
  deleteTraceparentTxt(outputDir);

  dynamoControl = await runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName);
  mockOAuth2Process = await runLocalOAuth2Server(runMockOAuth2);
  serverProcess = await runLocalHttpServer(runTestServer, httpServerPort);

  console.log("beforeAll hook completed successfully");
});

test.afterAll(async () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (mockOAuth2Process) {
    mockOAuth2Process.kill();
  }
  try {
    await dynamoControl?.stop?.();
  } catch {}
});

test.afterEach(async ({ page }, testInfo) => {
  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });
  appendUserSubTxt(outputDir, testInfo, userSub);
  await appendHashedUserSubTxt(outputDir, testInfo, userSub);
  appendTraceparentTxt(outputDir, testInfo, observedTraceparent);
});

// Sends one cumulative update straight through the page's own HMRC service, bypassing the form,
// and returns what HMRC answered. The sandbox probes below use it to ask HMRC questions the form
// would not let a person ask: a country code the page might not offer, and a body that omits an entry.
async function sendCumulativeUpdate(page, period, testScenario = null) {
  return await page.evaluate(
    async ({ period, testScenario }) => {
      const accessToken = sessionStorage.getItem("hmrcAccessToken");
      const govClientHeaders = await window.getGovClientHeaders();
      try {
        await window.putForeignPropertyPeriod(period, accessToken, govClientHeaders, false, testScenario);
        return { ok: true };
      } catch (error) {
        return { ok: false, status: error.status, message: error.message };
      }
    },
    { period, testScenario },
  );
}

async function readCumulativeTotal(page, query, testScenario = null) {
  return await page.evaluate(
    async ({ query, testScenario }) => {
      const accessToken = sessionStorage.getItem("hmrcAccessToken");
      const govClientHeaders = await window.getGovClientHeaders();
      try {
        return { ok: true, summary: await window.getForeignPropertyPeriod(query, accessToken, govClientHeaders, false, testScenario) };
      } catch (error) {
        return { ok: false, status: error.status, message: error.message };
      }
    },
    { query, testScenario },
  );
}

function countryEntry(countryCode, rentAmount) {
  return { countryCode, income: { rentIncome: { rentAmount } }, expenses: {} };
}

test("Click through: File a Foreign Property Quarterly Update with HMRC", async ({ page }, testInfo) => {
  const testUrl = baseUrl;

  addOnPageLogging(page);

  const outputDir = testInfo.outputPath("");
  fs.mkdirSync(outputDir, { recursive: true });

  page.on("response", (response) => {
    try {
      if (observedTraceparent) return;
      const headers = response.headers?.() ?? {};
      const h = typeof headers === "function" ? headers() : headers;
      const tp = (h && (h["traceparent"] || h["Traceparent"])) || null;
      if (tp) {
        observedTraceparent = tp;
      }
    } catch (_e) {
      // ignore header parsing errors
    }
  });

  /* ************************* */
  /* HMRC TEST USER CREATION   */
  /* ************************* */

  let createdBusinessId = null;
  let testUsername = hmrcTestUsername;
  let testPassword = hmrcTestPassword;
  let testNino = hmrcTestNino;

  // HMRC obligations and business ids are unpredictable - never hardcode either. The run's
  // own test user, minted with both mtd-vat and mtd-income-tax, supplies a NINO; the
  // businessId comes from a real Business Details read further down.
  if (!hmrcTestUsername) {
    console.log("[HMRC Test User] Synthetic mode detected without full credentials - creating test user");
    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID || process.env.HMRC_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET || process.env.HMRC_CLIENT_SECRET;

    if (!hmrcClientId) {
      throw new Error("HMRC_SANDBOX_CLIENT_ID or HMRC_CLIENT_ID is required to create test users");
    }
    if (!hmrcClientSecret) {
      throw new Error("HMRC_SANDBOX_CLIENT_SECRET or HMRC_CLIENT_SECRET is required to create test users");
    }

    const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, {
      serviceNames: ["mtd-vat", "mtd-income-tax"],
    });

    testUsername = testUser.userId;
    testPassword = testUser.password;
    testNino = testUser.nino;

    if (!testNino) {
      throw new Error("HMRC test user creation did not return a nino for the mtd-income-tax service");
    }

    // A business this run owns. Gov-Test-Scenario returns a canned one every run shares, so its
    // period summaries and annual submissions are whatever the last run left behind; this one
    // starts empty, which is what lets the suite file into state it set up itself.
    createdBusinessId = await createHmrcTestBusiness(hmrcClientId, hmrcClientSecret, testNino, {
      typeOfBusiness: "foreign-property",
      taxYear: "2025-26",
      // User-restricted endpoints: the token is obtained as this user, through HMRC's authorize
      // page, so the run needs the credentials it just minted.
      userId: testUsername,
      password: testPassword,
      // DIY_SUBMIT_BASE_URL carries a trailing slash, and HMRC rejects the double slash that
      // makes with "redirect_uri is invalid". The app and itsa-sandbox-year.js both strip it.
      redirectUri: `${baseUrl.replace(/\/$/, "")}/activities/submitVatCallback.html`,
      outDir: screenshotPath,
    });

    const repoRoot = path.resolve(process.cwd());
    saveHmrcTestUserToFiles(testUser, outputDir, repoRoot);
  }

  /* ****** */
  /*  HOME  */
  /* ****** */

  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);

  /* ******* */
  /*  LOGIN  */
  /* ******* */

  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);

  /* ********* */
  /*  BUNDLES  */
  /* ********* */

  await ensureBundleViaPassApi(page, "resident", screenshotPath, { testPass: true });
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ***************************************** */
  /*  GET BUSINESS DETAILS - NEEDED FOR businessId  */
  /* ***************************************** */

  await initItsaBusinessDetails(page, screenshotPath);
  // The foreign-property business created for this test user above is what this read returns, so the
  // businessId below belongs to this run and carries no submissions it did not make.
  const businessDetailsQuery = { hmrcNino: testNino, runFraudPreventionHeaderValidation };
  await fillInItsaBusinessDetails(page, businessDetailsQuery, screenshotPath);
  await submitItsaBusinessDetailsForm(page, screenshotPath);

  await acceptCookiesHmrc(page, screenshotPath);
  await goToHmrcAuth(page, screenshotPath);
  await initHmrcAuth(page, screenshotPath);
  await fillInHmrcAuth(page, testUsername, testPassword, screenshotPath);
  await submitHmrcAuth(page, screenshotPath);
  await grantPermissionHmrcAuth(page, screenshotPath);

  await verifyItsaBusinessDetailsResults(page, screenshotPath);
  // HMRC's sandbox Business Details API serves canned data: it returns XBIS12345678901 whatever
  // the nino, and never the business the Test Support API just created. So the page read below is
  // journey coverage, and the businessId this run files against is the one it was given at
  // creation - the only id that names a business this run actually owns.
  const businessId = createdBusinessId;
  if (!businessId) {
    throw new Error("No business was created for this run - cannot file a property quarterly update without a businessId");
  }
  await goToHomePageUsingMainNav(page, screenshotPath);

  /* ************************************************ */
  /*  FILE A CUMULATIVE UPDATE FOR TWO COUNTRIES      */
  /* ************************************************ */

  // 2025-26 reports one running total for the year, keyed by country. France itemises its
  // expenses and Spain gives one total, so the request carries both shapes of an entry.
  const taxYear = "2025-26";
  // STATEFUL asks the HMRC sandbox (and the simulator) to keep what is sent, so the load below
  // has something to read back. A live account never carries a sandbox header.
  const storeScenario = isSyntheticMode() ? "STATEFUL" : undefined;

  await initItsaForeignPropertyPeriod(page, screenshotPath);
  await fillInItsaForeignPropertyPeriod(
    page,
    {
      hmrcNino: testNino,
      businessId,
      taxYear,
      entries: [
        { countryCode: "FRA", rentAmount: 1000, premisesRunningCosts: 200 },
        { countryCode: "ESP", rentAmount: 500, consolidatedExpenses: 100 },
      ],
      testScenario: storeScenario,
      runFraudPreventionHeaderValidation,
    },
    screenshotPath,
  );
  await submitItsaForeignPropertyPeriodForm(page, screenshotPath);
  // The update needs write:self-assessment; Business Details above only granted
  // read:self-assessment, so this click just cleared that token and asked HMRC for a wider one.
  await completeHmrcReauthIfPresented(page, testUsername, testPassword, screenshotPath);
  await verifyItsaForeignPropertyPeriodResults(page, screenshotPath);

  /* ******************************* */
  /*  LOAD THE CURRENT TOTAL         */
  /* ******************************* */

  await initItsaForeignPropertyPeriod(page, screenshotPath);
  await fillInItsaForeignPropertyPeriod(
    page,
    { hmrcNino: testNino, businessId, taxYear, testScenario: storeScenario, runFraudPreventionHeaderValidation },
    screenshotPath,
  );
  const loadedEntries = await loadItsaForeignPropertyCurrentTotal(page, screenshotPath);
  console.log(`[Foreign property] The current total loaded ${loadedEntries} entries`);
  expect(loadedEntries).toBeGreaterThan(0);

  /* ***************************************************** */
  /*  AMEND THE TOTAL, LIST THE PERIODS AND VIEW THE TOTAL */
  /* ***************************************************** */

  // These pages send HMRC's named retrieve scenario for a synthetic account themselves.
  // 2025-26 has no submission ID: the amendment replaces the year's running total, so it loads
  // that total, corrects one figure and sends every entry again.
  const amendedRent = 1200;
  await initItsaForeignPropertyPeriodAmend(page, screenshotPath);
  const amendEntries = await loadItsaForeignPropertyPeriodForAmend(
    page,
    { hmrcNino: testNino, businessId, taxYear, runFraudPreventionHeaderValidation },
    screenshotPath,
  );
  expect(amendEntries).toBeGreaterThan(0);
  await changeItsaForeignPropertyAmendRent(page, 0, amendedRent, screenshotPath);
  await submitItsaForeignPropertyPeriodAmendForm(page, screenshotPath);
  await verifyItsaForeignPropertyPeriodAmendResults(page, screenshotPath);

  const listedEntries = await listItsaForeignPropertyPeriods(
    page,
    { hmrcNino: testNino, businessId, taxYear, runFraudPreventionHeaderValidation },
    screenshotPath,
  );
  expect(listedEntries).toBeGreaterThan(0);
  await viewItsaForeignPropertyCurrentTotal(
    page,
    { hmrcNino: testNino, businessId, taxYear, runFraudPreventionHeaderValidation },
    screenshotPath,
  );

  /* *********************************************** */
  /*  SANDBOX PROBES: COUNTRY CODES AND OMITTED ENTRY */
  /* *********************************************** */

  // Which HMRC accepts, and whether a cumulative update that leaves out an entry clears that
  // entry's figures, are answers only HMRC holds. The probes send the requests straight through
  // the page's HMRC service and record what came back; they assert only where the answer is ours.
  const probes = { countryCodes: {}, omittedEntry: {} };
  const period = (foreignProperty) => ({ nino: testNino, businessId, taxYear, foreignProperty });

  await sendCumulativeUpdate(page, period([countryEntry("FRA", 1000), countryEntry("ESP", 500)]), storeScenario);
  probes.omittedEntry.secondPut = await sendCumulativeUpdate(page, period([countryEntry("FRA", 1000)]), storeScenario);
  probes.omittedEntry.read = await readCumulativeTotal(page, { nino: testNino, businessId, taxYear }, storeScenario);
  const heldAfterOmission = (probes.omittedEntry.read.summary?.foreignProperty || []).map((entry) => entry.countryCode);
  probes.omittedEntry.countriesHeldAfterOmittingEsp = heldAfterOmission;
  probes.omittedEntry.espClearedOrDropped = probes.omittedEntry.read.ok ? !heldAfterOmission.includes("ESP") : null;

  for (const countryCode of ["JEY", "GGY", "IMN"]) {
    probes.countryCodes[countryCode] = await sendCumulativeUpdate(page, period([countryEntry(countryCode, 100)]));
  }
  console.log(`[Foreign property probes] ${JSON.stringify(probes)}`);
  fs.writeFileSync(path.join(outputDir, "foreign-property-probes.json"), JSON.stringify(probes, null, 2), "utf-8");
  if (usingHttpSimulator) {
    for (const countryCode of ["JEY", "GGY", "IMN"]) {
      expect(probes.countryCodes[countryCode].ok, `${countryCode} accepted by the simulator`).toBe(true);
    }
  }

  /* ************************************************* */
  /*  FILE A DATED PERIOD WITH FHL IN THE EEA          */
  /* ************************************************* */

  // 2024-25 and before send dated periods and carry the furnished holiday lettings section. The
  // sandbox year for this business holds no obligation for that period, so only the simulator runs it.
  if (usingHttpSimulator) {
    await initItsaForeignPropertyPeriod(page, screenshotPath);
    await fillInItsaForeignPropertyPeriod(
      page,
      {
        hmrcNino: testNino,
        businessId,
        taxYear: "2024-25",
        fromDate: "2024-04-06",
        toDate: "2024-07-05",
        fhl: { rentAmount: 800, premisesRunningCosts: 100 },
        entries: [{ countryCode: "DEU", rentAmount: 300 }],
        runFraudPreventionHeaderValidation,
      },
      screenshotPath,
    );
    await submitItsaForeignPropertyPeriodForm(page, screenshotPath);
    await verifyItsaForeignPropertyPeriodResults(page, screenshotPath);
  }

  // The dated period just filed is listed, chosen and viewed by its submission ID.
  if (usingHttpSimulator) {
    const datedListed = await listItsaForeignPropertyPeriods(
      page,
      { hmrcNino: testNino, businessId, taxYear: "2024-25", runFraudPreventionHeaderValidation },
      screenshotPath,
    );
    expect(datedListed).toBeGreaterThan(0);
    await useFirstListedForeignPropertyPeriod(page, screenshotPath);
    await viewItsaForeignPropertyPeriodFromList(page, { runFraudPreventionHeaderValidation }, screenshotPath);
  }

  /* ***************************************************************** */
  /*  2026-27: ADD TWO PROPERTIES, FILE ONE UPDATE FOR BOTH, END ONE   */
  /* ***************************************************************** */

  // From 2026-27 HMRC keys the entries by property, so the properties are added first on the
  // details page. The sandbox year this business was created for holds no 2026-27 obligation,
  // so only the simulator runs it.
  const propertyYear = "2026-27";
  const properties = [
    { propertyName: "Lyon apartment", countryCode: "FRA" },
    { propertyName: "Malaga villa", countryCode: "ESP" },
  ];
  const endedProperty = { propertyName: "Malaga villa", endDate: "2026-12-31", endReason: "disposal" };
  if (usingHttpSimulator) {
    await loadItsaForeignPropertyDetails(
      page,
      { hmrcNino: testNino, businessId, taxYear: propertyYear, runFraudPreventionHeaderValidation },
      screenshotPath,
    );
    for (const property of properties) await addItsaForeignProperty(page, property, screenshotPath);

    await initItsaForeignPropertyPeriod(page, screenshotPath);
    await fillInItsaForeignPropertyPeriod(
      page,
      { hmrcNino: testNino, businessId, taxYear: propertyYear, runFraudPreventionHeaderValidation },
      screenshotPath,
    );
    await loadAndFillItsaForeignPropertyPropertyRents(page, { "Lyon apartment": 2000, "Malaga villa": 750 }, screenshotPath);
    await submitItsaForeignPropertyPeriodForm(page, screenshotPath);
    await verifyItsaForeignPropertyPeriodResults(page, screenshotPath);

    await loadItsaForeignPropertyDetails(
      page,
      { hmrcNino: testNino, businessId, taxYear: propertyYear, runFraudPreventionHeaderValidation },
      screenshotPath,
    );
    await endItsaForeignProperty(page, endedProperty, screenshotPath);
  }

  /* ****************** */
  /*  Extract user sub  */
  /* ****************** */

  userSub = await extractUserSubFromLocalStorage(page, testInfo);

  /* ********* */
  /*  LOG OUT  */
  /* ********* */

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);

  /* ****************** */
  /*  TEST CONTEXT JSON */
  /* ****************** */

  const testContext = {
    testId: "itsaForeignPropertyPeriodBehaviour",
    name: testInfo.title,
    title: "File a Foreign Property Quarterly Update (HMRC: Property Business PUT/POST)",
    description:
      "Files a foreign property cumulative update for two countries with HMRC, loads the total back, and asks the sandbox which country codes it accepts and whether an omitted entry is cleared.",
    hmrcApis: [
      { url: "/api/v1/hmrc/itsa/business/details", method: "GET" },
      { url: "/api/v1/hmrc/itsa/foreign-property/period", method: "PUT" },
      { url: "/api/v1/hmrc/itsa/foreign-property/period", method: "GET" },
      { url: "/api/v1/hmrc/itsa/foreign-property/period", method: "POST" },
      { url: "/api/v1/hmrc/itsa/uk-property/periods", method: "GET" },
      { url: "/api/v1/hmrc/itsa/foreign-property/details", method: "GET" },
      { url: "/api/v1/hmrc/itsa/foreign-property/details", method: "POST" },
      { url: "/api/v1/hmrc/itsa/foreign-property/details", method: "PUT" },
      { url: "/test/fraud-prevention-headers/validate", method: "GET" },
    ],
    env: {
      envName,
      baseUrl,
      serverPort: httpServerPort,
      runTestServer,
      runMockOAuth2,
      testAuthProvider,
      testAuthUsername,
      bundleTableName,
      hmrcApiRequestsTableName,
      receiptsTableName,
      runDynamoDb,
    },
    testData: {
      hmrcTestUsername: testUsername,
      hmrcTestPassword: testPassword ? "***MASKED***" : "<not provided>",
      testUserGenerated: isSyntheticMode() && !hmrcTestUsername,
      businessId,
      userSub,
      observedTraceparent,
      testUrl,
      isSyntheticMode: isSyntheticMode(),
      intentionallyNotSuppliedHeaders,
    },
    artefactsDir: outputDir,
    screenshotPath,
    testStartTime: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(path.join(outputDir, "testContext.json"), JSON.stringify(testContext, null, 2), "utf-8");
  } catch (_e) {}

  /* ****************** */
  /*  FIGURES (SCREENSHOTS) */
  /* ****************** */

  const { selectKeyScreenshots, copyScreenshots, generateFiguresMetadata, writeFiguresJson } = await import("./helpers/figures-helper.js");

  const keyScreenshotPatterns = [
    "00.*focus.*submitting.*foreign.*property.*quarterly.*update.*form",
    "01.*foreign-property-period-submit",
    "02.*foreign-property-period-results",
    "00.*focus.*a.*developer.*test.*scenario",
  ];

  const screenshotDescriptions = {
    "00.*focus.*submitting.*foreign.*property.*quarterly.*update.*form": "Filling in the quarterly update form",
    "01.*foreign-property-period-submit": "Submitting the quarterly update form",
    "02.*foreign-property-period-results": "Viewing the quarterly update result",
    "00.*focus.*a.*developer.*test.*scenario": "Submitting the quarterly update form with a test scenario",
  };

  const selectedScreenshots = selectKeyScreenshots(screenshotPath, keyScreenshotPatterns, 5);
  console.log(`[Figures]: Selected ${selectedScreenshots.length} key screenshots from ${screenshotPath}`);

  const copiedScreenshots = copyScreenshots(screenshotPath, outputDir, selectedScreenshots);
  console.log(`[Figures]: Copied ${copiedScreenshots.length} screenshots to ${outputDir}`);

  const figures = generateFiguresMetadata(copiedScreenshots, screenshotDescriptions);
  writeFiguresJson(outputDir, figures);

  /* **************** */
  /*  EXPORT DYNAMODB */
  /* **************** */

  if (runDynamoDb === "run" || runDynamoDb === "useExisting") {
    console.log("[DynamoDB Export]: Starting export of all tables...");
    try {
      const exportResults = await exportAllTables(
        outputDir,
        dynamoControl.endpoint,
        {
          bundleTableName,
          hmrcApiRequestsTableName,
          receiptsTableName,
        },
        userSub,
      );
      console.log("[DynamoDB Export]: Export completed:", exportResults);
    } catch (error) {
      console.error("[DynamoDB Export]: Failed to export tables:", error);
    }
  }

  /* ********************************** */
  /*  ASSERT DYNAMODB HMRC API REQUESTS */
  /* ********************************** */

  if (runDynamoDb === "run" || runDynamoDb === "useExisting") {
    const hmrcApiRequestsFile = path.join(outputDir, "hmrc-api-requests.jsonl");

    const oauthRequests = assertHmrcApiRequestExists(hmrcApiRequestsFile, "POST", "/oauth/token", "OAuth token exchange");
    console.log(`[DynamoDB Assertions]: Found ${oauthRequests.length} OAuth token exchange request(s)`);

    const cumulativeRequests = assertHmrcApiRequestExists(
      hmrcApiRequestsFile,
      "PUT",
      `/individuals/business/property/foreign/${testNino}/${businessId}/cumulative/${taxYear}`,
      "ITSA foreign property cumulative update",
    );
    console.log(`[DynamoDB Assertions]: Found ${cumulativeRequests.length} foreign property cumulative PUT request(s)`);
    cumulativeRequests.forEach((cumulativeRequest, index) => {
      assertEssentialFraudPreventionHeadersPresent(cumulativeRequest, `PUT foreign property cumulative request ${index + 1}`);
    });

    // The form's request is the one that carries Spain on one total of expenses; the probes send
    // bare income entries and the export is not in the order the requests were sent.
    const sentBodies = cumulativeRequests.map((cumulativeRequest) => ({
      cumulativeRequest,
      body: JSON.parse(cumulativeRequest.httpRequest.body),
    }));
    const formRequest = sentBodies.find(({ body }) =>
      body.foreignProperty.some((entry) => entry.countryCode === "ESP" && entry.expenses?.consolidatedExpenses === 100),
    );
    const amendRequest = sentBodies.find(({ body }) =>
      body.foreignProperty.some((entry) => entry.income?.rentIncome?.rentAmount === amendedRent),
    );
    expect(amendRequest, "the amendment's cumulative update").toBeDefined();
    expect(amendRequest.body.foreignProperty).toHaveLength(amendEntries);
    expect(countHmrcApiRequestValues(amendRequest.cumulativeRequest, { "httpResponse.statusCode": 204 })).toBe(1);
    expect(formRequest, "the form's cumulative update").toBeDefined();
    const formEntries = Object.fromEntries(formRequest.body.foreignProperty.map((entry) => [entry.countryCode, entry]));
    expect(Object.keys(formEntries).sort()).toEqual(["ESP", "FRA"]);
    expect(formEntries.FRA.income.rentIncome.rentAmount).toBe(1000);
    expect(formEntries.FRA.expenses.premisesRunningCosts).toBe(200);
    expect(formEntries.FRA.expenses.consolidatedExpenses).toBeUndefined();
    expect(formEntries.ESP.income.rentIncome.rentAmount).toBe(500);
    expect(formEntries.ESP.expenses.consolidatedExpenses).toBe(100);
    expect(formEntries.ESP.expenses.premisesRunningCosts).toBeUndefined();
    expect(countHmrcApiRequestValues(formRequest.cumulativeRequest, { "httpResponse.statusCode": 204 })).toBe(1);

    if (usingHttpSimulator) {
      const datedRequests = assertHmrcApiRequestExists(
        hmrcApiRequestsFile,
        "POST",
        `/individuals/business/property/foreign/${testNino}/${businessId}/period/2024-25`,
        "ITSA foreign property dated period",
      );
      expect(datedRequests.length).toBe(1);
      assertEssentialFraudPreventionHeadersPresent(datedRequests[0], "POST foreign property dated period request");
      const datedBody = JSON.parse(datedRequests[0].httpRequest.body);
      expect(datedBody.foreignFhlEea.income.rentAmount).toBe(800);
      expect(datedBody.foreignFhlEea.expenses.premisesRunningCosts).toBe(100);
      expect(datedBody.foreignNonFhlProperty.map((entry) => entry.countryCode)).toEqual(["DEU"]);
      expect(countHmrcApiRequestValues(datedRequests[0], { "httpResponse.statusCode": 201 })).toBe(1);
    }

    if (usingHttpSimulator) {
      const businessPath = `/individuals/business/property/foreign/${testNino}/${businessId}`;
      const addRequests = assertHmrcApiRequestExists(
        hmrcApiRequestsFile,
        "POST",
        `${businessPath}/details/${propertyYear}`,
        "ITSA foreign property details create",
      );
      expect(addRequests.map((request) => JSON.parse(request.httpRequest.body).propertyName).sort()).toEqual(
        properties.map((property) => property.propertyName).sort(),
      );
      addRequests.forEach((request, index) => {
        assertEssentialFraudPreventionHeadersPresent(request, `POST foreign property details request ${index + 1}`);
      });
      const propertyIds = addRequests.map((request) => request.httpResponse.body.propertyId);
      expect(propertyIds.every(Boolean)).toBe(true);

      const propertyYearRequests = assertHmrcApiRequestExists(
        hmrcApiRequestsFile,
        "PUT",
        `${businessPath}/cumulative/${propertyYear}`,
        "ITSA foreign property cumulative update by property",
      );
      expect(propertyYearRequests).toHaveLength(1);
      assertEssentialFraudPreventionHeadersPresent(propertyYearRequests[0], "PUT foreign property cumulative request for 2026-27");
      const propertyBody = JSON.parse(propertyYearRequests[0].httpRequest.body);
      expect(propertyBody.foreignProperty.map((entry) => entry.propertyId).sort()).toEqual([...propertyIds].sort());
      expect(propertyBody.foreignProperty.map((entry) => entry.income.rentIncome.rentAmount).sort((a, b) => a - b)).toEqual([750, 2000]);
      expect(propertyBody.foreignProperty.every((entry) => entry.countryCode === undefined)).toBe(true);

      const endedPropertyId = addRequests.find(
        (request) => JSON.parse(request.httpRequest.body).propertyName === endedProperty.propertyName,
      ).httpResponse.body.propertyId;
      const endRequests = assertHmrcApiRequestExists(
        hmrcApiRequestsFile,
        "PUT",
        `/individuals/business/property/foreign/${testNino}/details/${endedPropertyId}/${propertyYear}`,
        "ITSA foreign property details end",
      );
      assertEssentialFraudPreventionHeadersPresent(endRequests[0], "PUT foreign property details request");
      expect(JSON.parse(endRequests[0].httpRequest.body)).toMatchObject({
        propertyName: endedProperty.propertyName,
        endDate: endedProperty.endDate,
        endReason: endedProperty.endReason,
      });
      expect(countHmrcApiRequestValues(endRequests[0], { "httpResponse.statusCode": 204 })).toBe(1);
    }

    if (runFraudPreventionHeaderValidation) {
      await assertFraudPreventionHeaders(hmrcApiRequestsFile, true, true, false, userSub);
    }

    const hashedSubs = await assertConsistentHashedSub(hmrcApiRequestsFile, "ITSA Foreign Property Period test", {
      filterByUserSub: userSub,
    });
    console.log(`[DynamoDB Assertions]: Found ${hashedSubs.length} unique hashedSub value(s): ${hashedSubs.join(", ")}`);
  }
});
