// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/companyTaxReturn.behaviour.test.js

import { expect } from "@playwright/test";
import { test } from "./helpers/playwrightTestWithout.js";
import fs from "node:fs";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import {
  addOnPageLogging,
  getEnvVarAndLog,
  isSyntheticMode,
  runLocalDynamoDb,
  runLocalHttpServer,
  runLocalOAuth2Server,
} from "./helpers/behaviour-helpers.js";
import { consentToDataCollection, goToHomePage, goToHomePageExpectNotLoggedIn } from "./steps/behaviour-steps.js";
import {
  clickLogIn,
  loginWithCognitoOrMockAuth,
  verifyLoggedInStatus,
  logOutAndExpectToBeLoggedOut,
} from "./steps/behaviour-login-steps.js";
import { ensureBundlePresent, goToBundlesPage } from "./steps/behaviour-bundle-steps.js";
import {
  enterCompanyNumberAndLookUp,
  verifyCompanyLookedUp,
  writeBuiltIxbrlFile,
} from "./steps/behaviour-companies-house-accounts-steps.js";
import {
  goToFileCompanyTaxReturn,
  fillInCompanyTaxReturnForm,
  fillInCompanyTaxReturnFormFromIxbrl,
  typeInCompanyTaxReturnForm,
  changeAnAnswerFromTheReview,
  previewCompanyTaxReturn,
  setCtGovTestScenario,
  enterGatewayCredentialsAndSubmit,
  enterEtsCredentialsAndSubmit,
  hideEtsCredentialsInScreenshots,
  ETS_EVIDENCE_DIRECTORY,
  verifyReturnAcceptedByEtsWithItsReceipt,
  readStoredReturnReceipt,
  verifyMicroEntityReview,
  verifyReturnAccepted,
  verifyReturnRejectedAndRetryable,
  previewWithAnswersMissingAndUnreconciled,
  fixTheAnswersAndPreview,
  previewWithAnOwnWorkingTheTaxDoesNotMatch,
  takeApprovalBriefScreenshot,
  verifyLargeCompanyReviewWithLoans,
  chooseToSendToCompaniesHouseAndHmrc,
  verifyJointReview,
  enterJointCredentialsAndSubmit,
  submitJointExpectingGatewayError,
  verifyBothAccepted,
  verifyAccountsLocked,
  verifyCompaniesHouseRejected,
  verifyNothingFiledAtCompaniesHouse,
  clearGovTestScenario,
  returnToReviewToSendAgain,
  verifyOnlyTheTaxReturnIsLeftToSend,
  resendTheTaxReturn,
  verifyCompaniesHouseAccepted,
  verifyCompaniesHouseStillPending,
  sendTheTaxReturnNow,
  reloadWhileCompaniesHouseIsPending,
  sendTheTaxReturnAfterCompaniesHouseAccepts,
  waitForCompaniesHouse,
  countRequestsTo,
  readReceiptsOfTheFilings,
  captureRequestBodies,
  startAmendingTheFiling,
  reviseTheAccounts,
  changeTheTaxAnswerAndReview,
  verifyAmendedSendStep,
  describeTheRevisionAndSend,
  verifyRevisedAccountsAndAmendedReturnAccepted,
  verifyAmendedReturnAccepted,
  verifyRevisedAccountsRejected,
} from "./steps/behaviour-hmrc-company-tax-return-steps.js";
import { companiesHouseLookupFixture } from "./steps/behaviour-companies-house-filing-steps.js";
import {
  buildCtReturnExportFromBook,
  FIXTURE_UTR,
  DIRECTORS_ADVANCE_TERMS,
  LARGE_COMPANY_FIXTURE_BOOK_DIRECTORY,
} from "@app/test-helpers/ctReturnFixture.js";
import { readEtsPageCredentials } from "./helpers/etsPageCredentials.js";

dotenvConfigIfNotBlank({ path: ".env" }); // Not checked in, real credentials for the ci/prod lanes

const screenshotPath = "target/behaviour-test-results/screenshots/company-tax-return-behaviour-test";

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

const { companyNumber, companyName } = companiesHouseLookupFixture(envFilePath);

// Set only on the ci run that files with HMRC's External Test Service (hmrc-ets-ct600-page.yml).
const etsCredentials = readEtsPageCredentials(process.env);
const ETS_TEST_TITLE_MARKER = "External Test Service";
// No video, no failure screenshot and no trace: none of them is limited to the receipt elements.
if (etsCredentials) test.use({ video: "off", screenshot: "off", trace: "off" });

const gatewayCredentials = { userId: "dummy-gateway-user", password: "dummy-gateway-password" };

let mockOAuth2Process;
let serverProcess;
let dynamoControl;

test.setTimeout(300_000);

test.beforeEach(async ({}, testInfo) => {
  testInfo.annotations.push({ type: "test-id", description: "companyTaxReturnBehaviour" });
  // The ETS credentials select the one ETS journey; without them it is skipped and every other journey runs.
  test.skip(
    testInfo.title.includes(ETS_TEST_TITLE_MARKER) !== Boolean(etsCredentials),
    "The ETS journey runs only with the ETS credentials",
  );
});

test.beforeAll(async () => {
  console.log("Starting beforeAll hook...");

  if (!envFilePath) {
    throw new Error("Environment variable DIY_SUBMIT_ENV_FILEPATH is not set, assuming no environment; not attempting tests.");
  }

  process.env = {
    ...originalEnv,
  };

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

async function signInWithResidentBundle(page, testUrl) {
  await goToHomePageExpectNotLoggedIn(page, testUrl, screenshotPath);
  await clickLogIn(page, screenshotPath);
  await loginWithCognitoOrMockAuth(page, testAuthProvider, testAuthUsername, screenshotPath, testAuthPassword);
  await verifyLoggedInStatus(page, screenshotPath);
  await consentToDataCollection(page, screenshotPath);
  await goToBundlesPage(page, screenshotPath);
  if (isSyntheticMode()) {
    await ensureBundlePresent(page, "Resident Ltd", screenshotPath, { testPass: true });
  }
  await goToHomePage(page, screenshotPath);
}

async function reachCompanyForm(page, testInfo) {
  addOnPageLogging(page);
  fs.mkdirSync(testInfo.outputPath(""), { recursive: true });

  await signInWithResidentBundle(page, baseUrl);
  await goToFileCompanyTaxReturn(page, screenshotPath);
  await enterCompanyNumberAndLookUp(page, companyNumber, screenshotPath);
  await verifyCompanyLookedUp(page, companyName, companyNumber, screenshotPath);
}

async function reachPreview(page, testInfo) {
  const bookExport = await buildCtReturnExportFromBook();
  await reachCompanyForm(page, testInfo);
  await fillInCompanyTaxReturnForm(page, { utr: FIXTURE_UTR, declarantName: bookExport.director.name }, screenshotPath);
  await previewCompanyTaxReturn(page, screenshotPath);
}

test("Click through: file the Company Tax Return from a book, change an answer from the review and see HMRC accept it with its IRmark", async ({
  page,
}, testInfo) => {
  const bookExport = await buildCtReturnExportFromBook();
  await reachCompanyForm(page, testInfo);
  await fillInCompanyTaxReturnForm(page, { utr: FIXTURE_UTR, declarantName: bookExport.director.name }, screenshotPath);
  await takeApprovalBriefScreenshot(page, "small-01-form-filled", { scrollTo: "#currentTurnover" });
  await previewCompanyTaxReturn(page, screenshotPath);
  await takeApprovalBriefScreenshot(page, "small-02-review-boxes", { locator: "#ct600Table" });
  await takeApprovalBriefScreenshot(page, "small-03-review-computation", { locator: "#computationsTable" });
  await changeAnAnswerFromTheReview(page, { fieldId: "declarantStatus", value: "Finance Director" }, screenshotPath);
  await enterGatewayCredentialsAndSubmit(page, gatewayCredentials, screenshotPath, { sendStepPictureName: "small-04-send" });
  await verifyReturnAccepted(page, screenshotPath, { resultPictureName: "small-05-accepted" });

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: file a micro-entity's Company Tax Return from a book and see HMRC accept it", async ({ page }, testInfo) => {
  const bookExport = await buildCtReturnExportFromBook();
  await reachCompanyForm(page, testInfo);
  await fillInCompanyTaxReturnForm(page, { utr: FIXTURE_UTR, declarantName: bookExport.director.name, regime: "micro" }, screenshotPath);
  await takeApprovalBriefScreenshot(page, "micro-01-form-filled", { scrollTo: "#microCurrentTurnover" });
  await previewCompanyTaxReturn(page, screenshotPath);
  await verifyMicroEntityReview(page, screenshotPath);
  await takeApprovalBriefScreenshot(page, "micro-02-review-boxes", { locator: "#ct600Table" });
  await takeApprovalBriefScreenshot(page, "micro-03-review-computation", { locator: "#computationsTable" });
  await enterGatewayCredentialsAndSubmit(page, gatewayCredentials, screenshotPath, { sendStepPictureName: "micro-04-send" });
  await verifyReturnAccepted(page, screenshotPath, { resultPictureName: "micro-05-accepted" });

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: file a larger company's Company Tax Return from a book with a loan to a participator and see HMRC accept it with supplementary page CT600A at the main rate", async ({
  page,
}, testInfo) => {
  await reachCompanyForm(page, testInfo);
  await fillInCompanyTaxReturnForm(
    page,
    {
      utr: FIXTURE_UTR,
      declarantName: "Carol Smith",
      bookDirectory: LARGE_COMPANY_FIXTURE_BOOK_DIRECTORY,
      directorsAdvanceTerms: DIRECTORS_ADVANCE_TERMS,
    },
    screenshotPath,
  );
  await takeApprovalBriefScreenshot(page, "large-01-form-filled", { scrollTo: "#currentTurnover" });
  await previewCompanyTaxReturn(page, screenshotPath);
  await verifyLargeCompanyReviewWithLoans(page, screenshotPath);
  await takeApprovalBriefScreenshot(page, "large-02-review-boxes", { locator: "#ct600Table" });
  await takeApprovalBriefScreenshot(page, "large-03-review-computation", { locator: "#computationsTable" });
  await enterGatewayCredentialsAndSubmit(page, gatewayCredentials, screenshotPath, { sendStepPictureName: "large-04-send" });
  await verifyReturnAccepted(page, screenshotPath, { resultPictureName: "large-05-accepted" });

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: file a micro-entity's Company Tax Return from an iXBRL accounts document and see HMRC accept it", async ({
  page,
}, testInfo) => {
  const ixbrlFile = writeBuiltIxbrlFile("micro-entity-accounts", { companyNumber, companyName }, testInfo.outputPath("ixbrl"));
  await reachCompanyForm(page, testInfo);
  await fillInCompanyTaxReturnFormFromIxbrl(
    page,
    {
      ixbrlFile,
      expectedStatus: "(FRS 102 2026 taxonomy) for the period 2025-04-01 to 2026-03-31.",
      utr: FIXTURE_UTR,
      declarantName: "Antony Christopher Cartwright",
    },
    screenshotPath,
  );
  await previewCompanyTaxReturn(page, screenshotPath);
  await verifyMicroEntityReview(page, screenshotPath);
  await enterGatewayCredentialsAndSubmit(page, gatewayCredentials, screenshotPath);
  await verifyReturnAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: type the Company Tax Return, change an answer from the review and see HMRC accept it", async ({ page }, testInfo) => {
  await reachCompanyForm(page, testInfo);
  await typeInCompanyTaxReturnForm(page, screenshotPath);
  await previewCompanyTaxReturn(page, screenshotPath);
  await changeAnAnswerFromTheReview(page, { fieldId: "declarantStatus", value: "Finance Director" }, screenshotPath);
  await enterGatewayCredentialsAndSubmit(page, gatewayCredentials, screenshotPath);
  await verifyReturnAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: file the Company Tax Return shows the error HMRC returns and allows another attempt", async ({ page }, testInfo) => {
  await reachPreview(page, testInfo);
  await setCtGovTestScenario(page, "CT600_REJECT_IRMARK", screenshotPath);
  await enterGatewayCredentialsAndSubmit(page, gatewayCredentials, screenshotPath);
  await verifyReturnRejectedAndRetryable(page, "2021", screenshotPath, {
    rejectedPictureName: "errors-03-hmrc-rejected",
    tryAgainPictureName: "errors-04-hmrc-rejected-try-again",
  });

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: the form lists the answers that are missing or do not reconcile, and the review opens once they are fixed", async ({
  page,
}, testInfo) => {
  const bookExport = await buildCtReturnExportFromBook();
  await reachCompanyForm(page, testInfo);
  await fillInCompanyTaxReturnForm(page, { utr: FIXTURE_UTR, declarantName: bookExport.director.name }, screenshotPath);
  const kept = await previewWithAnswersMissingAndUnreconciled(page, { pictureNamePrefix: "errors-01-form" }, screenshotPath);
  await fixTheAnswersAndPreview(page, kept, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: the product refuses a Corporation Tax that differs from the worked tax and sends nothing to HMRC", async ({
  page,
}, testInfo) => {
  const bookExport = await buildCtReturnExportFromBook();
  await reachCompanyForm(page, testInfo);
  await fillInCompanyTaxReturnForm(page, { utr: FIXTURE_UTR, declarantName: bookExport.director.name }, screenshotPath);
  await previewWithAnOwnWorkingTheTaxDoesNotMatch(page, { pictureNamePrefix: "errors-02-refusal" }, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: file the Company Tax Return through HMRC's External Test Service and keep the IRmark receipt", async ({
  page,
}, testInfo) => {
  // ETS answers about three minutes after the submission, then the Lambda deletes it.
  test.setTimeout(900_000);
  hideEtsCredentialsInScreenshots(page, etsCredentials);
  const bookExport = await buildCtReturnExportFromBook();
  await reachCompanyForm(page, testInfo);
  await fillInCompanyTaxReturnForm(
    page,
    { utr: etsCredentials.utr, declarantName: bookExport.director.name, utrIsSecret: true },
    screenshotPath,
  );
  await previewCompanyTaxReturn(page, screenshotPath);
  await enterEtsCredentialsAndSubmit(page, etsCredentials);
  const shownIrmark = await verifyReturnAcceptedByEtsWithItsReceipt(page, etsCredentials);

  const stored = await readStoredReturnReceipt(page, shownIrmark);
  expect(stored, "a stored receipt with the IRmark the page showed").toBeTruthy();
  expect(stored.irmarkReceipt).toBeTruthy();
  expect(stored.irmarkReceiptMismatch).toBeUndefined();
  fs.writeFileSync(
    `${ETS_EVIDENCE_DIRECTORY}/ets-receipt-summary.json`,
    JSON.stringify(
      {
        correlationId: stored.correlationId,
        irmark: stored.irmark,
        irmarkReceipt: stored.irmarkReceipt,
        receiptSignature: stored.receiptSignature,
      },
      null,
      2,
    ),
  );

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

const companyAuthCode = "AB12CD";
const JOINT_FILING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function reachJointReview(page, testInfo, { copy = "full", receives }) {
  await reachCompanyForm(page, testInfo);
  await typeInCompanyTaxReturnForm(page, screenshotPath);
  await chooseToSendToCompaniesHouseAndHmrc(page, { copy }, screenshotPath);
  await previewCompanyTaxReturn(page, screenshotPath);
  await verifyJointReview(page, { receives }, screenshotPath);
}

test("Click through: file the accounts at Companies House and the Company Tax Return at HMRC together, and see both receipts under one filing", async ({
  page,
}, testInfo) => {
  const accountsPosts = await countRequestsTo(page, "/api/v1/companies-house/accounts", "POST");
  const returnPosts = await countRequestsTo(page, "/api/v1/hmrc/ct/return", "POST");
  await reachJointReview(page, testInfo, { receives: "The full accounts, including the profit and loss account" });
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);
  await verifyAccountsLocked(page, screenshotPath);
  expect([accountsPosts.count, returnPosts.count]).toEqual([1, 1]);

  const receipts = await readReceiptsOfTheFilings(page);
  const accounts = receipts.find((entry) => entry.kind === "companies-house-accounts");
  const taxReturn = receipts.find((entry) => entry.kind === "company-tax-return");
  expect(accounts.receipt.jointFilingId).toMatch(JOINT_FILING_ID_PATTERN);
  expect(taxReturn.receipt.jointFilingId).toBe(accounts.receipt.jointFilingId);
  expect(taxReturn.listedJointFilingId).toBe(accounts.receipt.jointFilingId);
  expect(accounts.receipt.filedDocument).toContain("FullAccounts");

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: the filleted copy goes to Companies House and the full accounts go to HMRC", async ({ page }, testInfo) => {
  await reachJointReview(page, testInfo, {
    copy: "filleted",
    receives: "Filleted accounts. The profit and loss account and the directors' report are left out",
  });
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);

  const receipts = await readReceiptsOfTheFilings(page);
  const accounts = receipts.find((entry) => entry.kind === "companies-house-accounts");
  const taxReturn = receipts.find((entry) => entry.kind === "company-tax-return");
  expect(accounts.receipt.filedDocument).toContain("FilletedAccounts");
  expect(Buffer.from(taxReturn.receipt.filed.accountsIxbrl, "utf8").toString()).toContain("FullAccounts");

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: a Companies House gateway error and a rejection send nothing to HMRC, and the fixed accounts then go to both", async ({
  page,
}, testInfo) => {
  const returnPosts = await countRequestsTo(page, "/api/v1/hmrc/ct/return", "POST");
  await reachJointReview(page, testInfo, { receives: "The full accounts" });

  await setCtGovTestScenario(page, "SCHEMA_FAILURE", screenshotPath);
  await submitJointExpectingGatewayError(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyNothingFiledAtCompaniesHouse(page, screenshotPath);

  await setCtGovTestScenario(page, "ACCOUNTS_REJECTED", screenshotPath);
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyCompaniesHouseRejected(page, screenshotPath);
  expect(returnPosts.count).toBe(0);

  await returnToReviewToSendAgain(page, screenshotPath);
  await clearGovTestScenario(page);
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: HMRC rejects the Company Tax Return after Companies House accepts the accounts, and only the return is sent again", async ({
  page,
}, testInfo) => {
  const accountsPosts = await countRequestsTo(page, "/api/v1/companies-house/accounts", "POST");
  await reachJointReview(page, testInfo, { receives: "The full accounts" });

  await setCtGovTestScenario(page, "CT600_REJECT_IRMARK", screenshotPath);
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyCompaniesHouseAccepted(page, screenshotPath);
  await verifyReturnRejectedAndRetryable(page, "2021", screenshotPath);
  await verifyOnlyTheTaxReturnIsLeftToSend(page, screenshotPath);

  await clearGovTestScenario(page);
  await changeAnAnswerFromTheReview(page, { fieldId: "declarantStatus", value: "Finance Director" }, screenshotPath);
  await resendTheTaxReturn(page, { password: gatewayCredentials.password }, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);
  await verifyAccountsLocked(page, screenshotPath);
  expect(accountsPosts.count).toBe(1);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: send the Company Tax Return while Companies House is pending, then see Companies House accept and lock the accounts", async ({
  page,
}, testInfo) => {
  await reachJointReview(page, testInfo, { receives: "The full accounts" });

  await setCtGovTestScenario(page, "PENDING_FOREVER", screenshotPath);
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyCompaniesHouseStillPending(page, screenshotPath);
  await sendTheTaxReturnNow(page, screenshotPath);

  await clearGovTestScenario(page);
  await waitForCompaniesHouse(page, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);
  await verifyAccountsLocked(page, screenshotPath);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: reload while Companies House is pending, then see the filing resume, Companies House accept and the accounts lock", async ({
  page,
}, testInfo) => {
  const accountsPosts = await countRequestsTo(page, "/api/v1/companies-house/accounts", "POST");
  await reachJointReview(page, testInfo, { receives: "The full accounts" });

  await setCtGovTestScenario(page, "PENDING_FOREVER", screenshotPath);
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyCompaniesHouseStillPending(page, screenshotPath);
  await reloadWhileCompaniesHouseIsPending(page, screenshotPath);

  await sendTheTaxReturnAfterCompaniesHouseAccepts(page, gatewayCredentials, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);
  await verifyAccountsLocked(page, screenshotPath);
  expect(accountsPosts.count).toBe(1);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

const REVISION_DIFFERENCES = "The average number of employees is restated from 2 to 3.";

test("Click through: amend the accounts and the return from the locked state, and see revised accounts and an amended return under the original filing", async ({
  page,
}, testInfo) => {
  const accountsPosts = await captureRequestBodies(page, "/api/v1/companies-house/accounts", "POST");
  const returnPosts = await captureRequestBodies(page, "/api/v1/hmrc/ct/return", "POST");
  await reachJointReview(page, testInfo, { receives: "The full accounts" });
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);

  await startAmendingTheFiling(page, { accounts: true }, screenshotPath);
  await reviseTheAccounts(page, { approvedOn: "2026-07-01", averageEmployees: "3" }, screenshotPath);
  await previewCompanyTaxReturn(page, screenshotPath);
  await verifyAmendedSendStep(page, { accounts: true }, screenshotPath);
  await describeTheRevisionAndSend(page, { ...gatewayCredentials, companyAuthCode, differences: REVISION_DIFFERENCES }, screenshotPath);
  await verifyRevisedAccountsAndAmendedReturnAccepted(page, screenshotPath);

  expect(accountsPosts.bodies).toHaveLength(2);
  expect(returnPosts.bodies).toHaveLength(2);
  const [originalAccounts, revisedAccounts] = accountsPosts.bodies;
  const [originalReturn, amendedReturn] = returnPosts.bodies;
  expect(originalAccounts.revision).toBeUndefined();
  expect(revisedAccounts.revision).toEqual({ originalDateOfApproval: "2026-06-01", differences: REVISION_DIFFERENCES });
  expect(revisedAccounts.director.dateApproved).toBe("2026-07-01");
  expect(originalReturn.amended).toBeUndefined();
  expect(amendedReturn.amended).toBe(true);
  expect(amendedReturn.revision).toEqual(revisedAccounts.revision);
  expect(revisedAccounts.jointFilingId).toBe(originalAccounts.jointFilingId);
  expect(amendedReturn.jointFilingId).toBe(originalAccounts.jointFilingId);

  const receipts = (await readReceiptsOfTheFilings(page)).filter((entry) => entry.listedJointFilingId === originalAccounts.jointFilingId);
  expect(receipts).toHaveLength(4);
  const revised = receipts.find((entry) => entry.kind === "companies-house-accounts" && entry.listedAmended);
  const amended = receipts.find((entry) => entry.kind === "company-tax-return" && entry.listedAmended);
  expect(revised.receipt.jointFilingId).toBe(originalAccounts.jointFilingId);
  expect(amended.receipt.jointFilingId).toBe(originalAccounts.jointFilingId);
  expect(revised.receipt.filedDocument).toContain("These are revised accounts");
  expect(revised.receipt.filedDocument).toContain(REVISION_DIFFERENCES);
  expect(Buffer.from(amended.receipt.filed.accountsIxbrl, "utf8").toString()).toContain("These are revised accounts");
  expect(receipts.filter((entry) => !entry.listedAmended)).toHaveLength(2);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: amend only the Company Tax Return from the locked state, and the accounts stay as filed", async ({
  page,
}, testInfo) => {
  const accountsPosts = await captureRequestBodies(page, "/api/v1/companies-house/accounts", "POST");
  const returnPosts = await captureRequestBodies(page, "/api/v1/hmrc/ct/return", "POST");
  await reachJointReview(page, testInfo, { receives: "The full accounts" });
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);

  await startAmendingTheFiling(page, { accounts: false }, screenshotPath);
  await changeTheTaxAnswerAndReview(page, { fieldId: "declarantStatus", value: "Finance Director" }, screenshotPath);
  await verifyAmendedSendStep(page, { accounts: false }, screenshotPath);
  await resendTheTaxReturn(page, { password: gatewayCredentials.password }, screenshotPath);
  await verifyAmendedReturnAccepted(page, screenshotPath);

  expect(accountsPosts.bodies).toHaveLength(1);
  expect(returnPosts.bodies).toHaveLength(2);
  expect(returnPosts.bodies[1].amended).toBe(true);
  expect(returnPosts.bodies[1].revision).toBeUndefined();
  expect(returnPosts.bodies[1].jointFilingId).toBe(accountsPosts.bodies[0].jointFilingId);

  const receipts = (await readReceiptsOfTheFilings(page)).filter(
    (entry) => entry.listedJointFilingId === accountsPosts.bodies[0].jointFilingId,
  );
  expect(receipts).toHaveLength(3);
  const amended = receipts.filter((entry) => entry.listedAmended);
  expect(amended.map((entry) => entry.kind)).toEqual(["company-tax-return"]);
  expect(amended[0].receipt.jointFilingId).toBe(accountsPosts.bodies[0].jointFilingId);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: amend a Company Tax Return filed to HMRC alone", async ({ page }, testInfo) => {
  const returnPosts = await captureRequestBodies(page, "/api/v1/hmrc/ct/return", "POST");
  await reachPreview(page, testInfo);
  await enterGatewayCredentialsAndSubmit(page, gatewayCredentials, screenshotPath);
  await verifyReturnAccepted(page, screenshotPath);

  await expect(page.locator("#amendReturnBtn")).toBeVisible();
  await expect(page.locator("#amendAccountsBtn")).toBeHidden();
  await startAmendingTheFiling(page, { accounts: false }, screenshotPath);
  await changeTheTaxAnswerAndReview(page, { fieldId: "declarantStatus", value: "Finance Director" }, screenshotPath);
  await resendTheTaxReturn(page, { password: gatewayCredentials.password }, screenshotPath);
  await verifyAmendedReturnAccepted(page, screenshotPath);

  expect(returnPosts.bodies).toHaveLength(2);
  expect(returnPosts.bodies[0].amended).toBeUndefined();
  expect(returnPosts.bodies[1].amended).toBe(true);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});

test("Click through: Companies House rejects the revised accounts, the amended return is not sent, and the fixed revision then goes to both", async ({
  page,
}, testInfo) => {
  const returnPosts = await captureRequestBodies(page, "/api/v1/hmrc/ct/return", "POST");
  await reachJointReview(page, testInfo, { receives: "The full accounts" });
  await enterJointCredentialsAndSubmit(page, { ...gatewayCredentials, companyAuthCode }, screenshotPath);
  await verifyBothAccepted(page, screenshotPath);

  await startAmendingTheFiling(page, { accounts: true }, screenshotPath);
  await reviseTheAccounts(page, { approvedOn: "2026-07-01", averageEmployees: "3" }, screenshotPath);
  await previewCompanyTaxReturn(page, screenshotPath);
  await setCtGovTestScenario(page, "ACCOUNTS_REJECTED", screenshotPath);
  await describeTheRevisionAndSend(page, { ...gatewayCredentials, companyAuthCode, differences: REVISION_DIFFERENCES }, screenshotPath);
  await verifyRevisedAccountsRejected(page, screenshotPath);
  expect(returnPosts.bodies).toHaveLength(1);

  await returnToReviewToSendAgain(page, screenshotPath);
  await clearGovTestScenario(page);
  await describeTheRevisionAndSend(page, { ...gatewayCredentials, companyAuthCode, differences: REVISION_DIFFERENCES }, screenshotPath);
  await verifyRevisedAccountsAndAmendedReturnAccepted(page, screenshotPath);
  expect(returnPosts.bodies).toHaveLength(2);
  expect(returnPosts.bodies[1].amended).toBe(true);

  await logOutAndExpectToBeLoggedOut(page, screenshotPath);
});
