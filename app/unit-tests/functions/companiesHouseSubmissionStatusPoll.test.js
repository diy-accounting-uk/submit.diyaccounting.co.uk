// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseSubmissionStatusPoll.test.js
// The scheduled presenter poll against the XML Gateway simulator: real envelopes in, the
// simulator's real answers out. The two DynamoDB repositories are in-memory stand-ins, and the
// receipt write (which asks for the receipt email) is recorded.

import { describe, test, beforeEach, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { setupTestEnv } from "@app/test-helpers/mockHelpers.js";
import { apiEndpoint as xmlGatewaySimulatorEndpoint, GATEWAY_PATH } from "@app/http-simulator/routes/companies-house-xmlgw.js";
import { resetAccountsFilings, SIMULATOR_PRESENTER_ID, SIMULATOR_PRESENTER_CODE } from "@app/http-simulator/scenarios/accounts-filing.js";
import { resetConfirmationStatementFilings } from "@app/http-simulator/scenarios/confirmation-statement.js";
import { resetPscVerificationStatementFilings } from "@app/http-simulator/scenarios/psc-verification-statement.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const simulatorApp = express();
xmlGatewaySimulatorEndpoint(simulatorApp);
const gatewayRequests = [];

vi.mock("@app/services/companiesHouseSend.js", () => ({
  sendXmlToCompaniesHouse: async (url, init) => {
    gatewayRequests.push(init.body);
    const response = await request(simulatorApp)
      .post(GATEWAY_PATH)
      .set({ "Content-Type": "text/xml", ...init.headers })
      .send(init.body);
    return { ok: true, status: response.status, data: response.text, headers: {}, duration: 1 };
  },
}));

const asyncRequests = new Map();
vi.mock("@app/data/dynamoDbAsyncRequestRepository.js", () => ({
  putAsyncRequest: async (userSub, requestId, status, data, tableName, retention = { hours: 1 }) => {
    const existing = asyncRequests.get(`${userSub}/${requestId}`);
    asyncRequests.set(`${userSub}/${requestId}`, { requestId, status, data, retention, createdAt: existing?.createdAt ?? "now" });
  },
  getAsyncRequest: async (userSub, requestId) => asyncRequests.get(`${userSub}/${requestId}`) ?? null,
}));

const filingStates = new Map();
let pollState = {};
vi.mock("@app/data/dynamoDbCompaniesHousePendingFilerRepository.js", () => ({
  putPendingFiling: async ({ submissionNumber, userSub, kind }) => filingStates.set(submissionNumber, { userSub, kind, claimed: false }),
  getPendingFiling: async (submissionNumber) => (filingStates.has(submissionNumber) ? { ...filingStates.get(submissionNumber) } : null),
}));
vi.mock("@app/data/dynamoDbCompaniesHouseFilingStateRepository.js", () => ({
  FILING_STATE_RETENTION: { days: 100 },
  claimFinalStatus: async (submissionNumber) => {
    const state = filingStates.get(submissionNumber) ?? {};
    if (state.claimed) return false;
    filingStates.set(submissionNumber, { ...state, claimed: true });
    return true;
  },
  releaseFinalStatus: async (submissionNumber) =>
    filingStates.set(submissionNumber, { ...filingStates.get(submissionNumber), claimed: false }),
  claimPresenterPollSlot: async ({ nowSeconds, intervalSeconds }) => {
    if (pollState.nextPollAt !== undefined && pollState.nextPollAt > nowSeconds) return false;
    pollState = { nextPollAt: nowSeconds + intervalSeconds };
    return true;
  },
  deferPresenterPoll: async (nextPollAt) => {
    if (pollState.nextPollAt < nextPollAt) pollState.nextPollAt = nextPollAt;
  },
}));

const mockRecordFiledReceipt = vi.fn();
vi.mock("@app/services/filedReceipt.js", () => ({
  recordFiledReceipt: (...args) => mockRecordFiledReceipt(...args),
}));

const mockPublishActivityEvent = vi.fn();
vi.mock("@app/lib/activityAlert.js", () => ({
  publishActivityEvent: (...args) => mockPublishActivityEvent(...args),
  resolveActorClass: () => "test-user",
}));

const mockChargeTokenOnSuccess = vi.fn();
vi.mock("@app/services/tokenEnforcement.js", () => ({
  chargeTokenOnSuccess: (...args) => mockChargeTokenOnSuccess(...args),
}));

const { handler } = await import("@app/functions/companies-house/companiesHouseSubmissionStatusPoll.js");
const { recordSubmissionInProgress } = await import("@app/services/companiesHouseSubmissionInProgress.js");
const { pollSubmission } = await import("@app/services/companiesHouseSubmissionStatus.js");
const { MINIMUM_PRESENTER_POLL_SECONDS } = await import("@app/services/companiesHousePresenterPoll.js");
const { buildAccountsSubmission, buildConfirmationStatementSubmission, parseGatewayResponse } =
  await import("@app/services/companiesHouseXmlGateway.js");

const USER_SUB = "filer-sub-1";

async function fileAccounts(submissionNumber, { scenario, ownPresenter = false } = {}) {
  await recordSubmissionInProgress({
    userSub: USER_SUB,
    submissionNumber,
    kind: "accounts",
    underOwnPresenter: ownPresenter,
    data: { filedDocument: "<html>accounts</html>", chargeActivityId: "file-micro-entity-accounts" },
  });
  const envelope = buildAccountsSubmission({
    presenterId: SIMULATOR_PRESENTER_ID,
    presenterCode: SIMULATOR_PRESENTER_CODE,
    companyNumber: "02706061",
    companyName: "TEST COMPANY LIMITED",
    companyAuthenticationCode: "ABC123",
    packageReference: "0012",
    submissionNumber,
    dateSigned: "2026-06-30",
    ixbrl: "<html>accounts</html>",
  });
  const response = await request(simulatorApp)
    .post(GATEWAY_PATH)
    .set({ "Content-Type": "text/xml", ...(scenario ? { "Gov-Test-Scenario": scenario } : {}) })
    .send(envelope);
  expect(parseGatewayResponse(response.text).qualifier).toBe("acknowledgement");
}

function gatewayClasses() {
  return gatewayRequests.map((xml) => /<Class>([^<]+)<\/Class>/.exec(xml)[1]);
}

function allowNextPoll() {
  pollState = {};
}

describe("companiesHouseSubmissionStatusPoll handler", () => {
  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_XMLGW_URI: "http://simulator.test/v1-0/xmlgw/Gateway",
        RECEIPTS_DYNAMODB_TABLE_NAME: "test-receipts-table",
        COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: "test-companies-house-accounts-async-requests-table",
        COMPANIES_HOUSE_PRESENTER_ID: SIMULATOR_PRESENTER_ID,
        COMPANIES_HOUSE_PRESENTER_CODE: SIMULATOR_PRESENTER_CODE,
        COMPANIES_HOUSE_GATEWAY_TEST: "false",
      }),
    );
    resetAccountsFilings();
    resetConfirmationStatementFilings();
    resetPscVerificationStatementFilings();
    asyncRequests.clear();
    filingStates.clear();
    pollState = {};
    gatewayRequests.length = 0;
    vi.clearAllMocks();
  });

  test("an accepted filing the reader left pending gets its receipt and email, then the poll is acknowledged", async () => {
    await fileAccounts("PRS001");

    const result = await handler();

    expect(result).toMatchObject({ polled: true, acknowledged: true });
    expect(result.outcomes).toEqual([{ submissionNumber: "PRS001", statusCode: "ACCEPT", outcome: "recorded" }]);
    expect(mockRecordFiledReceipt).toHaveBeenCalledTimes(1);
    expect(mockRecordFiledReceipt.mock.calls[0][0]).toMatchObject({
      userSub: USER_SUB,
      receiptKind: "accounts",
      receipt: { kind: "companies-house-accounts", statusCode: "ACCEPT", filedDocument: "<html>accounts</html>" },
    });
    expect(asyncRequests.get(`${USER_SUB}/PRS001`)).toMatchObject({ status: "completed" });
    expect(mockPublishActivityEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "companies-house-accounts-accepted" }));
    expect(mockChargeTokenOnSuccess).toHaveBeenCalledWith(USER_SUB, "file-micro-entity-accounts");
    expect(gatewayClasses()).toEqual(["GetSubmissionStatus", "StatusAck"]);
  });

  test("the presenter poll names no submission and no company", async () => {
    await handler();

    const [statusRequest] = gatewayRequests;
    expect(statusRequest).toContain(`<PresenterID>${SIMULATOR_PRESENTER_ID}</PresenterID>`);
    expect(statusRequest).not.toContain("<SubmissionNumber>");
    expect(statusRequest).not.toContain("<CompanyNumber>");
  });

  test("a rejected filing keeps its reject reasons for the filings list and sends no receipt", async () => {
    await fileAccounts("PRS002", { scenario: "ACCOUNTS_REJECTED" });

    const result = await handler();

    expect(result.outcomes).toEqual([{ submissionNumber: "PRS002", statusCode: "REJECT", outcome: "recorded" }]);
    const stored = asyncRequests.get(`${USER_SUB}/PRS002`);
    expect(stored).toMatchObject({ status: "failed", retention: { days: 100 } });
    expect(stored.data.rejections[0]).toMatchObject({ rejectCode: "1", description: "Random Test mode rejection" });
    expect(mockRecordFiledReceipt).not.toHaveBeenCalled();
    expect(mockChargeTokenOnSuccess).not.toHaveBeenCalled();
  });

  test("an acknowledged submission is not answered again on the next poll", async () => {
    await fileAccounts("PRS003");
    await handler();
    allowNextPoll();

    const second = await handler();

    expect(second).toMatchObject({ polled: true, acknowledged: false, outcomes: [] });
    expect(mockRecordFiledReceipt).toHaveBeenCalledTimes(1);
  });

  test("a filing still pending is left out of the presenter poll", async () => {
    await fileAccounts("PRS004", { scenario: "PENDING_FOREVER" });

    const result = await handler();

    expect(result.outcomes).toEqual([]);
    expect(asyncRequests.get(`${USER_SUB}/PRS004`)).toMatchObject({ status: "pending", retention: { days: 100 } });
  });

  test("when the page recorded the outcome first, the presenter poll sends no second email", async () => {
    await fileAccounts("PRS005");
    await pollSubmission({ userSub: USER_SUB, submissionNumber: "PRS005", kind: "accounts" });
    await pollSubmission({ userSub: USER_SUB, submissionNumber: "PRS005", kind: "accounts" });
    expect(mockRecordFiledReceipt).toHaveBeenCalledTimes(1);

    const result = await handler();

    expect(result.outcomes).toEqual([{ submissionNumber: "PRS005", statusCode: "ACCEPT", outcome: "already-recorded" }]);
    expect(result.acknowledged).toBe(true);
    expect(mockRecordFiledReceipt).toHaveBeenCalledTimes(1);
  });

  test("a filing under the customer's own presenter has no filing state, so the presenter poll leaves it to the page", async () => {
    await fileAccounts("PRS006", { ownPresenter: true });

    expect(filingStates.has("PRS006")).toBe(false);
    const result = await handler();
    expect(result.outcomes).toEqual([{ submissionNumber: "PRS006", statusCode: "ACCEPT", outcome: "not-ours" }]);
    expect(mockRecordFiledReceipt).not.toHaveBeenCalled();
  });

  test("a confirmation statement is recorded under its own kind and accepted event", async () => {
    await recordSubmissionInProgress({
      userSub: USER_SUB,
      submissionNumber: "PRS007",
      kind: "confirmation-statement",
      underOwnPresenter: false,
    });
    const envelope = buildConfirmationStatementSubmission({
      presenterId: SIMULATOR_PRESENTER_ID,
      presenterCode: SIMULATOR_PRESENTER_CODE,
      companyNumber: "06846849",
      companyName: "TEST COMPANY LIMITED",
      companyAuthenticationCode: "ABC123",
      packageReference: "0012",
      submissionNumber: "PRS007",
      dateSigned: "2026-06-30",
      statementXml: "<ConfirmationAndVerificationStatement><ReviewDate>2026-06-01</ReviewDate></ConfirmationAndVerificationStatement>",
    });
    await request(simulatorApp).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(envelope);

    const result = await handler();

    expect(result.outcomes).toEqual([{ submissionNumber: "PRS007", statusCode: "ACCEPT", outcome: "recorded" }]);
    expect(mockRecordFiledReceipt.mock.calls[0][0]).toMatchObject({ receiptKind: "confirmation-statement" });
    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "companies-house-confirmation-statement-accepted" }),
    );
  });

  test("a failed record holds the acknowledgement back and gives the claim back, so the next poll tries again", async () => {
    await fileAccounts("PRS008");
    mockRecordFiledReceipt.mockRejectedValueOnce(new Error("receipts table unavailable"));

    const first = await handler();

    expect(first).toMatchObject({ polled: true, acknowledged: false });
    expect(first.outcomes).toEqual([{ submissionNumber: "PRS008", statusCode: "ACCEPT", outcome: "error" }]);
    expect(gatewayClasses()).toEqual(["GetSubmissionStatus"]);
    expect(filingStates.get("PRS008").claimed).toBe(false);

    allowNextPoll();
    const second = await handler();
    expect(second.outcomes).toEqual([{ submissionNumber: "PRS008", statusCode: "ACCEPT", outcome: "recorded" }]);
    expect(second.acknowledged).toBe(true);
  });

  test("a second run inside the poll interval does not reach the gateway", async () => {
    await handler();
    gatewayRequests.length = 0;

    const second = await handler();

    expect(second).toEqual({ polled: false });
    expect(gatewayRequests).toHaveLength(0);
    expect(pollState.nextPollAt - Math.floor(Date.now() / 1000)).toBeGreaterThan(MINIMUM_PRESENTER_POLL_SECONDS - 5);
  });

  test("the test gateway mode sets GatewayTest on the poll and on the acknowledgement", async () => {
    process.env.COMPANIES_HOUSE_GATEWAY_TEST = "true";
    await fileAccounts("PRS009");

    await handler();

    expect(gatewayRequests).toHaveLength(2);
    for (const xml of gatewayRequests) expect(xml).toContain("<GatewayTest>1</GatewayTest>");
    const { synthetic } = mockRecordFiledReceipt.mock.calls[0][0];
    expect(synthetic).toBe(true);
  });

  test("a gateway authorisation failure is reported and nothing is acknowledged", async () => {
    process.env.COMPANIES_HOUSE_PRESENTER_CODE = "not-the-right-code";

    const result = await handler();

    expect(result).toMatchObject({ polled: true, acknowledged: false });
    expect(result.errors[0]).toMatchObject({ number: 502 });
    expect(gatewayClasses()).toEqual(["GetSubmissionStatus"]);
  });
});
