// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/hmrcCtPendingReturnCheck.test.js
// The scheduled Company Tax Return status check with the page's own poll: the markers and the
// async requests are in-memory stand-ins, and the Transaction Engine answers are canned.

import { describe, test, beforeEach, expect, vi } from "vitest";

const markers = new Map();
const claims = [];
let refuseClaims = false;
vi.mock("@app/data/dynamoDbCtPendingReturnRepository.js", () => ({
  listPendingCtReturns: async () => [...markers.values()],
  openPendingCtFiler: async (marker) => marker.sealedFiler.replace("sealed:", ""),
  claimPendingCtCheck: async (correlationId, { now, intervalSeconds }) => {
    claims.push({ correlationId, now, intervalSeconds });
    return !refuseClaims;
  },
  deletePendingCtReturn: async (correlationId) => {
    markers.delete(correlationId);
  },
}));

const asyncRequests = new Map();
const asyncPuts = [];
vi.mock("@app/data/dynamoDbAsyncRequestRepository.js", () => ({
  putAsyncRequest: async (userSub, requestId, status, data, tableName, retention) => {
    asyncPuts.push({ userSub, requestId, status, data, retention });
    const existing = asyncRequests.get(`${userSub}/${requestId}`);
    asyncRequests.set(`${userSub}/${requestId}`, { status, data, createdAt: existing?.createdAt ?? new Date().toISOString() });
  },
  getAsyncRequest: async (userSub, requestId) => asyncRequests.get(`${userSub}/${requestId}`) ?? null,
  // The conditional write, in one step: pending becomes recording for the first caller only.
  claimRecording: async (userSub, requestId) => {
    const item = asyncRequests.get(`${userSub}/${requestId}`);
    if (item?.status !== "pending") return false;
    asyncRequests.set(`${userSub}/${requestId}`, { ...item, status: "recording", recordingSince: new Date().toISOString() });
    return true;
  },
  releaseRecording: async (userSub, requestId) => {
    const item = asyncRequests.get(`${userSub}/${requestId}`);
    if (item?.status === "recording") asyncRequests.set(`${userSub}/${requestId}`, { ...item, status: "pending" });
  },
  RECORDING_CLAIM_STALE_MINUTES: 20,
}));

const mockPutReceipt = vi.fn();
vi.mock("@app/data/dynamoDbReceiptRepository.js", () => ({ putReceipt: (...args) => mockPutReceipt(...args) }));
const mockRequestCustomerEmail = vi.fn();
vi.mock("@app/lib/customerEmailRequest.js", () => ({ requestCustomerEmail: (...args) => mockRequestCustomerEmail(...args) }));
vi.mock("@app/lib/activityAlert.js", () => ({
  publishActivityEvent: vi.fn().mockResolvedValue(undefined),
  resolveActorClass: () => "customer",
}));
vi.mock("@app/services/tokenEnforcement.js", () => ({ chargeTokenOnSuccess: vi.fn() }));

const mockPost = vi.fn();
vi.mock("@app/services/hmrcTransactionEngine.js", async (importOriginal) => ({
  ...(await importOriginal()),
  postToTransactionEngine: (...args) => mockPost(...args),
}));

const mockLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn() }));
vi.mock("@app/lib/logger.js", async (importOriginal) => ({ ...(await importOriginal()), createLogger: () => mockLogger }));

import { checkPendingCtReturns, CT_PENDING_CHECK_INTERVAL_SECONDS } from "@app/services/hmrcCtPendingReturnCheck.js";
import { pollCtSubmission } from "@app/services/hmrcCtSubmissionStatus.js";
import { CT_RETURN_KIND } from "@app/services/ctReturnKind.js";
import { chargeTokenOnSuccess } from "@app/services/tokenEnforcement.js";
import { publishActivityEvent } from "@app/lib/activityAlert.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const IRMARK_BASE64 = "AAECAwQFBgcICQoLDA0ODxAREhM=";
const IRMARK_BASE32 = "AAAQEAYEAUDAOCAJBIFQYDIOB4IBCEQT";

function message(correlationId, qualifier, functionName, { errors = "", body = "" } = {}) {
  return {
    ok: true,
    status: 200,
    data: `<?xml version="1.0"?><GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><EnvelopeVersion>2.0</EnvelopeVersion><Header><MessageDetails><Class>HMRC-CT-CT600</Class><Qualifier>${qualifier}</Qualifier><Function>${functionName}</Function><CorrelationID>${correlationId}</CorrelationID><Transformation>XML</Transformation></MessageDetails></Header><GovTalkDetails><Keys/>${errors}</GovTalkDetails><Body>${body}</Body></GovTalkMessage>`,
  };
}
const acknowledgement = (id) => message(id, "acknowledgement", "submit");
const success = (id) =>
  message(id, "response", "submit", {
    body: `<SuccessResponse xmlns="http://www.inlandrevenue.gov.uk/SuccessResponse"><IRmarkReceipt><dsig:Signature xmlns:dsig="http://www.w3.org/2000/09/xmldsig#"><dsig:SignedInfo><dsig:Reference><dsig:DigestValue>${IRMARK_BASE64}</dsig:DigestValue></dsig:Reference></dsig:SignedInfo></dsig:Signature><Message code="0000">Received</Message></IRmarkReceipt></SuccessResponse>`,
  });
const rejection = (id) =>
  message(id, "error", "submit", {
    errors: `<GovTalkErrors><Error><RaisedBy>ChRIS</RaisedBy><Number>3001</Number><Type>business</Type><Text>Business validation errors</Text></Error></GovTalkErrors>`,
  });
const deleteResponse = (id) => message(id, "response", "delete");

function sendReturn(correlationId, userSub, { sentDaysAgo = 1, nextPollAt = new Date(Date.now() - 1000).toISOString() } = {}) {
  const sentAt = new Date(Date.now() - sentDaysAgo * DAY_MS).toISOString();
  markers.set(correlationId, { correlationId, sentAt, sealedFiler: `sealed:${userSub}` });
  asyncRequests.set(`${userSub}/${correlationId}`, {
    status: "pending",
    createdAt: sentAt,
    data: {
      kind: CT_RETURN_KIND,
      pollUrl: "https://example.test/poll",
      pollIntervalSeconds: 10,
      nextPollAt,
      gatewayTest: true,
      messageClass: "HMRC-CT-CT600",
      utr: "8596148860",
      irmark: IRMARK_BASE32,
    },
  });
  return sentAt;
}

const polls = () => mockPost.mock.calls.filter(([, xml]) => xml.includes("<Qualifier>poll</Qualifier>"));

describe("checkPendingCtReturns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markers.clear();
    asyncRequests.clear();
    asyncPuts.length = 0;
    claims.length = 0;
    refuseClaims = false;
  });

  test("polls each pending return with its stored correlation ID and response end point, as the filer", async () => {
    sendReturn("AAA1", "filer-a");
    sendReturn("BBB2", "filer-b");
    mockPost.mockImplementation(async (url, xml) => acknowledgement(xml.match(/<CorrelationID>(\w+)</)[1]));
    const result = await checkPendingCtReturns();
    expect(result.checked).toBe(2);
    expect(result.outcomes).toEqual([
      { correlationId: "AAA1", outcome: "pending" },
      { correlationId: "BBB2", outcome: "pending" },
    ]);
    expect(polls().map(([url]) => url)).toEqual(["https://example.test/poll", "https://example.test/poll"]);
    expect(polls()[0][1]).toContain("<CorrelationID>AAA1</CorrelationID>");
    expect(asyncRequests.get("filer-b/BBB2").status).toBe("pending");
    expect(markers.size).toBe(2);
  });

  test("an accepted return writes the receipt, the accepted event and the token charge, and drops its marker", async () => {
    sendReturn("AAA1", "filer-a");
    mockPost.mockResolvedValueOnce(success("AAA1")).mockResolvedValueOnce(deleteResponse("AAA1"));
    const { outcomes } = await checkPendingCtReturns();
    expect(outcomes).toEqual([{ correlationId: "AAA1", outcome: "ACCEPT" }]);
    expect(mockPutReceipt).toHaveBeenCalledTimes(1);
    expect(mockPutReceipt.mock.calls[0][0]).toBe("filer-a");
    expect(mockPutReceipt.mock.calls[0][2]).toMatchObject({ statusCode: "ACCEPT", correlationId: "AAA1" });
    expect(publishActivityEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "hmrc-ct-return-accepted", userSub: "filer-a" }));
    expect(chargeTokenOnSuccess).toHaveBeenCalledWith("filer-a", "file-company-tax-return");
    expect(asyncRequests.get("filer-a/AAA1").status).toBe("completed");
    expect(markers.has("AAA1")).toBe(false);
  });

  test("a rejected return records the rejection, charges nothing and drops its marker", async () => {
    sendReturn("AAA1", "filer-a");
    mockPost.mockResolvedValueOnce(rejection("AAA1")).mockResolvedValueOnce(deleteResponse("AAA1"));
    const { outcomes } = await checkPendingCtReturns();
    expect(outcomes).toEqual([{ correlationId: "AAA1", outcome: "REJECT" }]);
    expect(asyncRequests.get("filer-a/AAA1")).toMatchObject({ status: "failed", data: { statusCode: "REJECT" } });
    expect(mockPutReceipt).not.toHaveBeenCalled();
    expect(chargeTokenOnSuccess).not.toHaveBeenCalled();
    expect(markers.has("AAA1")).toBe(false);
  });

  test("a return inside HMRC's poll interval is not asked about", async () => {
    sendReturn("AAA1", "filer-a", { nextPollAt: new Date(Date.now() + 60_000).toISOString() });
    const { outcomes } = await checkPendingCtReturns();
    expect(outcomes).toEqual([{ correlationId: "AAA1", outcome: "pending" }]);
    expect(mockPost).not.toHaveBeenCalled();
    expect(asyncPuts).toHaveLength(0);
  });

  test("a return another run checked within the interval is skipped", async () => {
    sendReturn("AAA1", "filer-a");
    refuseClaims = true;
    const { outcomes } = await checkPendingCtReturns();
    expect(outcomes).toEqual([{ correlationId: "AAA1", outcome: "checked-recently" }]);
    expect(mockPost).not.toHaveBeenCalled();
    expect(claims[0].intervalSeconds).toBe(CT_PENDING_CHECK_INTERVAL_SECONDS);
  });

  test("a return waiting 30 days is recorded as no answer from HMRC, without asking, and its marker goes", async () => {
    sendReturn("AAA1", "filer-a", { sentDaysAgo: 30 });
    const { outcomes } = await checkPendingCtReturns();
    expect(outcomes).toEqual([{ correlationId: "AAA1", outcome: "NO_ANSWER" }]);
    expect(mockPost).not.toHaveBeenCalled();
    expect(asyncRequests.get("filer-a/AAA1")).toMatchObject({ status: "failed", data: { statusCode: "NO_ANSWER", correlationId: "AAA1" } });
    expect(chargeTokenOnSuccess).not.toHaveBeenCalled();
    expect(markers.has("AAA1")).toBe(false);
  });

  test("a run in the day after the 30-day wait records no answer, before the pending request's retention ends", async () => {
    sendReturn("AAA1", "filer-a", { sentDaysAgo: 30 + 10 / (24 * 60) });
    const { outcomes } = await checkPendingCtReturns();
    expect(outcomes).toEqual([{ correlationId: "AAA1", outcome: "NO_ANSWER" }]);
  });

  test("a marker whose request is gone is dropped", async () => {
    sendReturn("AAA1", "filer-a");
    asyncRequests.clear();
    const { outcomes } = await checkPendingCtReturns();
    expect(outcomes).toEqual([{ correlationId: "AAA1", outcome: "not-held" }]);
    expect(markers.has("AAA1")).toBe(false);
  });

  test("a failed poll of one return is logged, keeps its marker, and the next return is still checked", async () => {
    sendReturn("AAA1", "filer-a");
    sendReturn("BBB2", "filer-b");
    mockPost.mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce(acknowledgement("BBB2"));
    const { outcomes } = await checkPendingCtReturns();
    expect(outcomes).toEqual([
      { correlationId: "AAA1", outcome: "error" },
      { correlationId: "BBB2", outcome: "pending" },
    ]);
    expect(markers.has("AAA1")).toBe(true);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ hmrcCorrelationId: "AAA1", error: "socket hang up" }));
  });

  test("the page's poll and the scheduled check reading one final answer at once record it once", async () => {
    sendReturn("AAA1", "filer-a");
    // Each poll waits until both have asked, so both read the return as pending and get the answer.
    const waitingPolls = [];
    mockPost.mockImplementation(async (url, xml) => {
      if (xml.includes("<Function>delete</Function>")) return deleteResponse("AAA1");
      await new Promise((resolve) => {
        waitingPolls.push(resolve);
        if (waitingPolls.length === 2) waitingPolls.forEach((release) => release());
      });
      return success("AAA1");
    });

    const [page, scheduled] = await Promise.all([pollCtSubmission({ userSub: "filer-a", correlationId: "AAA1" }), checkPendingCtReturns()]);

    expect(polls()).toHaveLength(2);
    expect(mockPutReceipt).toHaveBeenCalledTimes(1);
    expect(mockRequestCustomerEmail).toHaveBeenCalledTimes(1);
    expect(publishActivityEvent.mock.calls.filter(([event]) => event.event === "hmrc-ct-return-accepted")).toHaveLength(1);
    expect(chargeTokenOnSuccess).toHaveBeenCalledTimes(1);
    expect(asyncRequests.get("filer-a/AAA1").status).toBe("completed");
    expect([page.data.statusCode, scheduled.outcomes[0].outcome]).toContain("ACCEPT");
  });
});
