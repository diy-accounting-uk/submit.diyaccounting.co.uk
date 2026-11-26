// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHousePresenterPollCacheDrop.test.js
// The scheduled presenter poll records a filing Companies House accepted while the reader was away.
// It drops that company's cached register answers, keeps the figures of filed sets, and drops nothing
// for a rejection. A drop that fails does not stop the record or the acknowledgement.

import { describe, test, beforeEach, expect, vi } from "vitest";

const mockPostToGateway = vi.fn();
vi.mock("@app/services/companiesHouseXmlGateway.js", async (importOriginal) => ({
  ...(await importOriginal()),
  resolvePresenterCredentials: async () => ({ presenterId: "presenter-id", presenterCode: "presenter-code" }),
  postToGateway: (...args) => mockPostToGateway(...args),
}));

vi.mock("@app/data/dynamoDbCompaniesHouseFilingStateRepository.js", () => ({
  FILING_STATE_RETENTION: { days: 100 },
  claimPresenterPollSlot: async () => true,
  deferPresenterPoll: vi.fn(),
  recordPresenterPollAsked: vi.fn(),
  claimFinalStatus: async () => true,
  releaseFinalStatus: vi.fn(),
}));

const PENDING_REQUEST = {
  status: "pending",
  createdAt: "2026-11-22T09:00:00.000Z",
  data: { kind: "psc-cessation", companyNumber: "04549236" },
};
const mockPutAsyncRequest = vi.fn();
vi.mock("@app/data/dynamoDbAsyncRequestRepository.js", () => ({
  getAsyncRequest: async () => PENDING_REQUEST,
  putAsyncRequest: (...args) => mockPutAsyncRequest(...args),
  recordStatusCheck: vi.fn(),
}));

vi.mock("@app/data/dynamoDbCompaniesHousePendingFilerRepository.js", () => ({
  getPendingFiling: async () => ({ userSub: "user-1", kind: "psc-cessation" }),
}));

vi.mock("@app/services/filedReceipt.js", () => ({
  recordFiledReceiptForSubmission: async () => ({ receiptId: "receipt-1", hashedSub: "hashed-user-1" }),
}));

vi.mock("@app/lib/activityAlert.js", () => ({
  publishActivityEvent: vi.fn(),
  resolveActorClass: () => "customer",
}));

const mockListCacheKeys = vi.fn();
const mockDeleteCacheEntry = vi.fn();
const mockPutCacheEntry = vi.fn();
vi.mock("@app/data/dynamoDbCompaniesHouseCacheRepository.js", () => ({
  listCacheKeys: (...args) => mockListCacheKeys(...args),
  deleteCacheEntry: (...args) => mockDeleteCacheEntry(...args),
  putCacheEntry: (...args) => mockPutCacheEntry(...args),
}));

const { pollPresenterSubmissions } = await import("@app/services/companiesHousePresenterPoll.js");

function statusAnswer({ statusCode, companyNumber }) {
  const rejection =
    statusCode === "REJECT"
      ? "<Rejections><Reject><RejectCode>9998</RejectCode><Description>Refused</Description><InstanceNumber>1</InstanceNumber></Reject></Rejections>"
      : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  <Header><MessageDetails><Class>GetSubmissionStatus</Class><Qualifier>response</Qualifier><TransactionID>TX1</TransactionID></MessageDetails><SenderDetails/></Header>
  <GovTalkDetails><Keys/></GovTalkDetails>
  <Body>
    <SubmissionStatus xmlns="http://xmlgw.companieshouse.gov.uk">
      <Status>
        <SubmissionNumber>00001A</SubmissionNumber>
        <StatusCode>${statusCode}</StatusCode>${companyNumber ? `\n        <CompanyNumber>${companyNumber}</CompanyNumber>` : ""}${rejection}
      </Status>
    </SubmissionStatus>
  </Body>
</GovTalkMessage>`;
}

const ACK_ANSWER = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  <Header><MessageDetails><Class>StatusAck</Class><Qualifier>response</Qualifier></MessageDetails><SenderDetails/></Header>
  <GovTalkDetails><Keys/></GovTalkDetails>
  <Body/>
</GovTalkMessage>`;

function gatewayAnswers(status) {
  mockPostToGateway
    .mockResolvedValueOnce({ ok: true, status: 200, data: statusAnswer(status), headers: {}, duration: 1 })
    .mockResolvedValueOnce({ ok: true, status: 200, data: ACK_ANSWER, headers: {}, duration: 1 });
}

const CACHED_KEYS = [
  "/company/04549236",
  "/company/04549236/persons-with-significant-control?items_per_page=100&start_index=0",
  "figures#MzQ1",
];

const storedStatuses = () => mockPutAsyncRequest.mock.calls.map(([, , status]) => status);

describe("the scheduled presenter poll and the company cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME = "test-companies-house-accounts-async-requests-table";
    process.env.COMPANIES_HOUSE_GATEWAY_TEST = "false";
    mockListCacheKeys.mockResolvedValue(CACHED_KEYS);
    mockDeleteCacheEntry.mockResolvedValue(undefined);
    mockPutCacheEntry.mockResolvedValue(undefined);
  });

  test("an acceptance it records drops the company's register answers and keeps the figures", async () => {
    gatewayAnswers({ statusCode: "ACCEPT", companyNumber: "04549236" });

    const result = await pollPresenterSubmissions();

    expect(result).toMatchObject({ polled: true, acknowledged: true, outcomes: [expect.objectContaining({ outcome: "recorded" })] });
    expect(mockListCacheKeys).toHaveBeenCalledWith("04549236");
    expect(mockDeleteCacheEntry.mock.calls).toEqual(CACHED_KEYS.slice(0, 2).map((sk) => ["04549236", sk]));
    expect(storedStatuses()).toEqual(["completed"]);
    expect(mockPutCacheEntry.mock.calls.map(([companyNumber, sk]) => [companyNumber, sk])).toEqual([["04549236", "accepted-filing"]]);
  });

  test("a marker write that fails still records the acceptance and acknowledges the poll", async () => {
    gatewayAnswers({ statusCode: "ACCEPT", companyNumber: "04549236" });
    mockPutCacheEntry.mockRejectedValue(new Error("AccessDeniedException"));

    const result = await pollPresenterSubmissions();

    expect(result).toMatchObject({ polled: true, acknowledged: true, outcomes: [expect.objectContaining({ outcome: "recorded" })] });
    expect(storedStatuses()).toEqual(["completed"]);
  });

  test("an acceptance whose status names no company drops the cache of the company the filing was sent for", async () => {
    gatewayAnswers({ statusCode: "ACCEPT" });

    await pollPresenterSubmissions();

    expect(mockListCacheKeys).toHaveBeenCalledWith("04549236");
  });

  test("a rejection it records drops nothing", async () => {
    gatewayAnswers({ statusCode: "REJECT", companyNumber: "04549236" });

    const result = await pollPresenterSubmissions();

    expect(result).toMatchObject({ polled: true, acknowledged: true });
    expect(mockListCacheKeys).not.toHaveBeenCalled();
    expect(mockDeleteCacheEntry).not.toHaveBeenCalled();
    expect(mockPutCacheEntry).not.toHaveBeenCalled();
    expect(storedStatuses()).toEqual(["failed"]);
  });

  test("a drop that fails still records the acceptance and acknowledges the poll", async () => {
    gatewayAnswers({ statusCode: "ACCEPT", companyNumber: "04549236" });
    mockListCacheKeys.mockRejectedValue(new Error("AccessDeniedException"));

    const result = await pollPresenterSubmissions();

    expect(result).toMatchObject({ polled: true, acknowledged: true, outcomes: [expect.objectContaining({ outcome: "recorded" })] });
    expect(storedStatuses()).toEqual(["completed"]);
  });
});
