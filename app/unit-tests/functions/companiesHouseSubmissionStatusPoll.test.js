// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseSubmissionStatusPoll.test.js
// The scheduled presenter poll against the XML Gateway simulator: real envelopes in, the
// simulator's real answers out. The DynamoDB repositories and the activity charges are in-memory
// stand-ins, and the receipt email request is recorded.

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
// A test can rewrite the simulator's answer, to send a status the simulator never sends.
let rewriteGatewayAnswer = (xml) => xml;

vi.mock("@app/services/companiesHouseSend.js", () => ({
  sendXmlToCompaniesHouse: async (url, init) => {
    gatewayRequests.push(init.body);
    const response = await request(simulatorApp)
      .post(GATEWAY_PATH)
      .set({ "Content-Type": "text/xml", ...init.headers })
      .send(init.body);
    return { ok: true, status: response.status, data: rewriteGatewayAnswer(response.text), headers: {}, duration: 1 };
  },
}));

const asyncRequests = new Map();
// A test sets this to make the next put of the given status throw, as DynamoDB does when throttled.
let failNextAsyncPut = null;
vi.mock("@app/data/dynamoDbAsyncRequestRepository.js", () => ({
  putAsyncRequest: async (userSub, requestId, status, data, tableName, retention = { hours: 1 }) => {
    if (failNextAsyncPut === status) {
      failNextAsyncPut = null;
      throw Object.assign(new Error("Rate of requests exceeds the allowed throughput"), { name: "ProvisionedThroughputExceededException" });
    }
    const existing = asyncRequests.get(`${userSub}/${requestId}`);
    const createdAt = existing?.createdAt ?? new Date().toISOString();
    asyncRequests.set(`${userSub}/${requestId}`, { requestId, status, data, retention, createdAt });
  },
  getAsyncRequest: async (userSub, requestId) => asyncRequests.get(`${userSub}/${requestId}`) ?? null,
}));

const filingStates = new Map();
let pollState = {};
vi.mock("@app/data/dynamoDbCompaniesHousePendingFilerRepository.js", () => ({
  putPendingFiling: async ({ submissionNumber, userSub, kind }) => filingStates.set(submissionNumber, { userSub, kind }),
  getPendingFiling: async (submissionNumber) => {
    if (!filingStates.has(submissionNumber)) return null;
    const { userSub, kind } = filingStates.get(submissionNumber);
    return { userSub, kind };
  },
}));
vi.mock("@app/data/dynamoDbCompaniesHouseFilingStateRepository.js", async (importOriginal) => {
  const { FINAL_STATUS_CLAIM_STALE_MINUTES } = await importOriginal();
  return {
    FILING_STATE_RETENTION: { days: 100 },
    claimFinalStatus: async (submissionNumber, { now = new Date() } = {}) => {
      const state = filingStates.get(submissionNumber) ?? {};
      const staleBefore = now.getTime() - FINAL_STATUS_CLAIM_STALE_MINUTES * 60 * 1000;
      if (state.claimedAt !== undefined && state.claimedAt >= staleBefore) return false;
      filingStates.set(submissionNumber, { ...state, claimedAt: now.getTime() });
      return true;
    },
    releaseFinalStatus: async (submissionNumber) => {
      const { claimedAt, ...rest } = filingStates.get(submissionNumber) ?? {};
      filingStates.set(submissionNumber, rest);
    },
    claimPresenterPollSlot: async ({ nowSeconds, intervalSeconds }) => {
      if (pollState.nextPollAt !== undefined && pollState.nextPollAt > nowSeconds) return false;
      pollState = { nextPollAt: nowSeconds + intervalSeconds };
      return true;
    },
    deferPresenterPoll: async (nextPollAt) => {
      if (pollState.nextPollAt < nextPollAt) pollState.nextPollAt = nextPollAt;
    },
  };
});
const { FINAL_STATUS_CLAIM_STALE_MINUTES } = await vi.importActual("@app/data/dynamoDbCompaniesHouseFilingStateRepository.js");

// The receipts table: a conditional put leaves a stored receipt as it is.
const receipts = new Map();
let failNextReceiptPut = false;
vi.mock("@app/data/dynamoDbReceiptRepository.js", () => ({
  putReceipt: async () => {
    throw new Error("the Companies House record writes its receipt with putReceiptIfNew");
  },
  putReceiptIfNew: async (userSub, receiptId, receipt) => {
    if (failNextReceiptPut) {
      failNextReceiptPut = false;
      throw new Error("receipts table unavailable");
    }
    if (receipts.has(`${userSub}/${receiptId}`)) return false;
    receipts.set(`${userSub}/${receiptId}`, receipt);
    return true;
  },
}));

const mockRequestCustomerEmail = vi.fn();
vi.mock("@app/lib/customerEmailRequest.js", () => ({
  requestCustomerEmail: (...args) => mockRequestCustomerEmail(...args),
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

// Activity charges: a paid charge is marked used once; a second mark finds it used.
const activityCharges = new Map();
const mockMarkChargeUsed = vi.fn(async (userSub, activityId, subjectKey) => {
  const key = `${userSub}/${activityId}/${subjectKey}`;
  if (activityCharges.get(key) !== "paid") return false;
  activityCharges.set(key, "used");
  return true;
});
vi.mock("@app/services/activityCharges.js", () => ({
  markChargeUsed: (...args) => mockMarkChargeUsed(...args),
}));

const { handler } = await import("@app/functions/companies-house/companiesHouseSubmissionStatusPoll.js");
const { recordSubmissionInProgress, recordOutcomeUnknown } = await import("@app/services/companiesHouseSubmissionInProgress.js");
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

function storedReceipts() {
  return [...receipts.values()];
}

function receiptEmails() {
  return mockRequestCustomerEmail.mock.calls.map(([request]) => request);
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
    receipts.clear();
    activityCharges.clear();
    failNextAsyncPut = null;
    failNextReceiptPut = false;
    pollState = {};
    gatewayRequests.length = 0;
    rewriteGatewayAnswer = (xml) => xml;
    vi.clearAllMocks();
  });

  test("an accepted filing the reader left pending gets its receipt and email, then the poll is acknowledged", async () => {
    await fileAccounts("PRS001");

    const result = await handler();

    expect(result).toMatchObject({ polled: true, acknowledged: true });
    expect(result.outcomes).toEqual([{ submissionNumber: "PRS001", statusCode: "ACCEPT", outcome: "recorded" }]);
    expect(storedReceipts()).toEqual([
      expect.objectContaining({ kind: "companies-house-accounts", statusCode: "ACCEPT", filedDocument: "<html>accounts</html>" }),
    ]);
    expect(receiptEmails()).toEqual([
      expect.objectContaining({
        kind: "submission-receipt",
        userSub: USER_SUB,
        data: expect.objectContaining({ receiptKind: "accounts" }),
      }),
    ]);
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
    expect(storedReceipts()).toEqual([]);
    expect(mockChargeTokenOnSuccess).not.toHaveBeenCalled();
  });

  test("an acknowledged submission is not answered again on the next poll", async () => {
    await fileAccounts("PRS003");
    await handler();
    allowNextPoll();

    const second = await handler();

    expect(second).toMatchObject({ polled: true, acknowledged: false, outcomes: [] });
    expect(storedReceipts()).toHaveLength(1);
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
    expect(storedReceipts()).toHaveLength(1);

    const result = await handler();

    expect(result.outcomes).toEqual([{ submissionNumber: "PRS005", statusCode: "ACCEPT", outcome: "already-recorded" }]);
    expect(result.acknowledged).toBe(true);
    expect(storedReceipts()).toHaveLength(1);
  });

  test("a filing under the customer's own presenter has no filing state, so the presenter poll leaves it to the page", async () => {
    await fileAccounts("PRS006", { ownPresenter: true });

    expect(filingStates.has("PRS006")).toBe(false);
    const result = await handler();
    expect(result.outcomes).toEqual([{ submissionNumber: "PRS006", statusCode: "ACCEPT", outcome: "not-ours" }]);
    expect(storedReceipts()).toEqual([]);
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
    expect(receiptEmails()[0].data).toMatchObject({ receiptKind: "confirmation-statement" });
    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "companies-house-confirmation-statement-accepted" }),
    );
  });

  test("a failed record holds the acknowledgement back and gives the claim back, so the next poll tries again", async () => {
    await fileAccounts("PRS008");
    failNextReceiptPut = true;

    const first = await handler();

    expect(first).toMatchObject({ polled: true, acknowledged: false });
    expect(first.outcomes).toEqual([{ submissionNumber: "PRS008", statusCode: "ACCEPT", outcome: "error" }]);
    expect(gatewayClasses()).toEqual(["GetSubmissionStatus"]);
    expect(filingStates.get("PRS008").claimedAt).toBeUndefined();

    allowNextPoll();
    const second = await handler();
    expect(second.outcomes).toEqual([{ submissionNumber: "PRS008", statusCode: "ACCEPT", outcome: "recorded" }]);
    expect(second.acknowledged).toBe(true);
  });

  test("a record whose completed write fails stores one receipt, sends one email and charges one token after the retry", async () => {
    await fileAccounts("PRS011");
    failNextAsyncPut = "completed";

    const first = await handler();

    expect(first).toMatchObject({ polled: true, acknowledged: false });
    expect(first.outcomes).toEqual([{ submissionNumber: "PRS011", statusCode: "ACCEPT", outcome: "error" }]);
    expect(storedReceipts()).toHaveLength(1);
    expect(asyncRequests.get(`${USER_SUB}/PRS011`)).toMatchObject({ status: "pending" });
    expect(mockChargeTokenOnSuccess).not.toHaveBeenCalled();

    allowNextPoll();
    const second = await handler();

    expect(second.outcomes).toEqual([{ submissionNumber: "PRS011", statusCode: "ACCEPT", outcome: "recorded" }]);
    expect(second.acknowledged).toBe(true);
    expect(storedReceipts()).toHaveLength(1);
    expect(receiptEmails()).toHaveLength(1);
    expect(mockChargeTokenOnSuccess).toHaveBeenCalledTimes(1);
    const [receiptKey] = receipts.keys();
    expect(asyncRequests.get(`${USER_SUB}/PRS011`).data.receiptId).toBe(receiptKey.slice(`${USER_SUB}/`.length));
  });

  test("a status another poll has claimed but not stored is not acknowledged, and is recorded when that record fails", async () => {
    await fileAccounts("PRS013");
    // The page poll has claimed the final status and is still writing it.
    filingStates.set("PRS013", { ...filingStates.get("PRS013"), claimedAt: Date.now() });

    const first = await handler();

    expect(first).toMatchObject({ polled: true, acknowledged: false });
    expect(first.outcomes).toEqual([{ submissionNumber: "PRS013", statusCode: "ACCEPT", outcome: "being-recorded" }]);
    expect(gatewayClasses()).toEqual(["GetSubmissionStatus"]);

    // The page poll's record fails and gives the claim back.
    const { claimedAt, ...released } = filingStates.get("PRS013");
    filingStates.set("PRS013", released);
    allowNextPoll();
    const second = await handler();

    expect(second.outcomes).toEqual([{ submissionNumber: "PRS013", statusCode: "ACCEPT", outcome: "recorded" }]);
    expect(second.acknowledged).toBe(true);
    expect(storedReceipts()).toHaveLength(1);
    expect(mockChargeTokenOnSuccess).toHaveBeenCalledTimes(1);
  });

  test("a claim older than the stale limit counts as given back, so a failed release cannot hold the filing", async () => {
    await fileAccounts("PRS014");
    filingStates.set("PRS014", {
      ...filingStates.get("PRS014"),
      claimedAt: Date.now() - (FINAL_STATUS_CLAIM_STALE_MINUTES + 1) * 60 * 1000,
    });

    const result = await handler();

    expect(result.outcomes).toEqual([{ submissionNumber: "PRS014", statusCode: "ACCEPT", outcome: "recorded" }]);
    expect(result.acknowledged).toBe(true);
    expect(storedReceipts()).toHaveLength(1);
    expect(asyncRequests.get(`${USER_SUB}/PRS014`)).toMatchObject({ status: "completed" });
  });

  test("a page poll that loses the claim answers pending until the other poll has stored the outcome", async () => {
    await fileAccounts("PRS015");
    // The simulator answers the first poll by number PENDING and the next ACCEPT.
    await pollSubmission({ userSub: USER_SUB, submissionNumber: "PRS015", kind: "accounts" });
    filingStates.set("PRS015", { ...filingStates.get("PRS015"), claimedAt: Date.now() });

    const whileClaimed = await pollSubmission({ userSub: USER_SUB, submissionNumber: "PRS015", kind: "accounts" });

    expect(whileClaimed.data).toEqual({ submissionNumber: "PRS015", statusCode: "PENDING", rejections: [] });
    expect(storedReceipts()).toEqual([]);

    // Once the other poll has stored the outcome, the page gets its receipt id.
    await handler();
    const { claimedAt, ...released } = filingStates.get("PRS015");
    filingStates.set("PRS015", released);
    allowNextPoll();
    await handler();
    const afterStored = await pollSubmission({ userSub: USER_SUB, submissionNumber: "PRS015", kind: "accounts" });
    expect(afterStored.data).toMatchObject({ statusCode: "ACCEPT", receiptId: expect.stringMatching(/Z-PRS015$/) });
  });

  test("a confirmation statement accepted after its envelope got no answer marks its paid fee used once", async () => {
    const feeCharge = { activityId: "file-confirmation-statement", subjectKey: "06846849:2026-06-01" };
    activityCharges.set(`${USER_SUB}/${feeCharge.activityId}/${feeCharge.subjectKey}`, "paid");
    await recordSubmissionInProgress({
      userSub: USER_SUB,
      submissionNumber: "PRS016",
      kind: "confirmation-statement",
      underOwnPresenter: false,
      data: { feeCharge },
    });
    await recordOutcomeUnknown({ userSub: USER_SUB, submissionNumber: "PRS016", kind: "confirmation-statement", data: { feeCharge } });
    const envelope = buildConfirmationStatementSubmission({
      presenterId: SIMULATOR_PRESENTER_ID,
      presenterCode: SIMULATOR_PRESENTER_CODE,
      companyNumber: "06846849",
      companyName: "TEST COMPANY LIMITED",
      companyAuthenticationCode: "ABC123",
      packageReference: "0012",
      submissionNumber: "PRS016",
      dateSigned: "2026-06-30",
      statementXml: "<ConfirmationAndVerificationStatement><ReviewDate>2026-06-01</ReviewDate></ConfirmationAndVerificationStatement>",
    });
    await request(simulatorApp).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(envelope);
    failNextAsyncPut = "completed";

    await handler();
    allowNextPoll();
    const second = await handler();

    expect(second.outcomes).toEqual([{ submissionNumber: "PRS016", statusCode: "ACCEPT", outcome: "recorded" }]);
    expect(activityCharges.get(`${USER_SUB}/${feeCharge.activityId}/${feeCharge.subjectKey}`)).toBe("used");
    const marked = await Promise.all(mockMarkChargeUsed.mock.results.map(({ value }) => value));
    expect(marked.filter(Boolean)).toHaveLength(1);
    expect(mockMarkChargeUsed).toHaveBeenCalledWith(USER_SUB, feeCharge.activityId, feeCharge.subjectKey);
  });

  test("a poll that answers a status that is not final is not acknowledged, so the gateway answers it again", async () => {
    await fileAccounts("PRS012");
    rewriteGatewayAnswer = (xml) => xml.replace("<StatusCode>ACCEPT</StatusCode>", "<StatusCode>PARKED</StatusCode>");

    const first = await handler();

    expect(first).toMatchObject({ polled: true, acknowledged: false });
    expect(first.outcomes).toEqual([{ submissionNumber: "PRS012", statusCode: "PARKED", outcome: "not-final" }]);
    expect(gatewayClasses()).toEqual(["GetSubmissionStatus"]);

    rewriteGatewayAnswer = (xml) => xml;
    allowNextPoll();
    const second = await handler();
    expect(second.outcomes).toEqual([{ submissionNumber: "PRS012", statusCode: "ACCEPT", outcome: "recorded" }]);
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
    const { synthetic } = receiptEmails()[0];
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
