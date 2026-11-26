// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseNotYetIndexed.test.js
// Companies House can answer the first GetSubmissionStatus polls after a submission with Error 8023,
// "EF documents not found", until it has indexed the submission. In the first hour the page poll
// reads that as pending, and after it as an error; the presenter poll records nothing for it.

import { describe, test, beforeEach, expect, vi } from "vitest";

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
vi.mock("@app/lib/logger.js", async (importOriginal) => ({ ...(await importOriginal()), createLogger: () => mockLogger }));

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
  claimFinalStatus: vi.fn(),
  releaseFinalStatus: vi.fn(),
}));

const mockGetAsyncRequest = vi.fn();
const mockPutAsyncRequest = vi.fn();
vi.mock("@app/data/dynamoDbAsyncRequestRepository.js", () => ({
  getAsyncRequest: (...args) => mockGetAsyncRequest(...args),
  putAsyncRequest: (...args) => mockPutAsyncRequest(...args),
  recordStatusCheck: vi.fn(),
}));

const { pollPresenterSubmissions } = await import("@app/services/companiesHousePresenterPoll.js");
const { pollSubmission, NEVER_RECEIVED_REJECT_CODE } = await import("@app/services/companiesHouseSubmissionStatus.js");

// The live gateway's answer to a poll of a submission it has not yet indexed.
function gatewayErrorAnswer({ number, text }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>GetSubmissionStatus</Class>
      <Qualifier>error</Qualifier>
      <TransactionID>TX1</TransactionID>
      <GatewayTimestamp>2026-11-19T07:00:00</GatewayTimestamp>
    </MessageDetails>
    <SenderDetails/>
  </Header>
  <GovTalkDetails>
    <Keys/>
    <GovTalkErrors>
      <Error>
        <RaisedBy>CompaniesHouse</RaisedBy>
        <Number>${number}</Number>
        <Type>fatal</Type>
        <Text>${text}</Text>
      </Error>
    </GovTalkErrors>
  </GovTalkDetails>
  <Body/>
</GovTalkMessage>`;
}

const NOT_YET_INDEXED = { number: 8023, text: "EF documents not found" };
const OTHER_FATAL = { number: 502, text: "Authentication failure" };

// One more GovTalk error, for an answer that carries two.
function errorElement({ number, text }) {
  return `<Error><RaisedBy>CompaniesHouse</RaisedBy><Number>${number}</Number><Type>fatal</Type><Text>${text}</Text></Error>`;
}

const SENT_AT = new Date("2026-11-25T23:26:50Z");
const MINUTE_MS = 60 * 1000;

function answer(error) {
  mockPostToGateway.mockResolvedValue({ ok: true, status: 200, data: gatewayErrorAnswer(error), headers: {}, duration: 1 });
}

function pendingFiling() {
  mockGetAsyncRequest.mockResolvedValue({ status: "pending", createdAt: SENT_AT.toISOString(), data: { kind: "accounts" } });
}

describe("a gateway answer that the submission is not yet indexed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME = "test-companies-house-accounts-async-requests-table";
    process.env.COMPANIES_HOUSE_GATEWAY_TEST = "false";
  });

  test("the page poll five seconds after the submission reads Error 8023 as pending and logs no error", async () => {
    pendingFiling();
    answer(NOT_YET_INDEXED);

    const result = await pollSubmission({
      userSub: "user-1",
      submissionNumber: "000001",
      kind: "accounts",
      now: new Date(SENT_AT.getTime() + 5000),
    });

    expect(result).toEqual({ data: { submissionNumber: "000001", statusCode: "PENDING", rejections: [], notYetIndexed: true } });
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockPutAsyncRequest).not.toHaveBeenCalled();
  });

  test("the page poll 59 minutes after the submission still reads Error 8023 as pending", async () => {
    pendingFiling();
    answer(NOT_YET_INDEXED);

    const result = await pollSubmission({
      userSub: "user-1",
      submissionNumber: "000001",
      kind: "accounts",
      now: new Date(SENT_AT.getTime() + 59 * MINUTE_MS),
    });

    expect(result.data).toMatchObject({ statusCode: "PENDING", notYetIndexed: true });
  });

  test("the page poll an hour after the submission returns Error 8023 as an error and logs it", async () => {
    pendingFiling();
    answer(NOT_YET_INDEXED);

    const result = await pollSubmission({
      userSub: "user-1",
      submissionNumber: "000001",
      kind: "accounts",
      now: new Date(SENT_AT.getTime() + 60 * MINUTE_MS),
    });

    expect(result).toEqual({ errors: [expect.objectContaining({ number: 8023 })], submissionNumber: "000001" });
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Companies House gateway returned errors while polling", submissionNumber: "000001" }),
    );
    expect(mockPutAsyncRequest).not.toHaveBeenCalled();
  });

  test("the page poll returns Error 8023 beside another error as an error", async () => {
    pendingFiling();
    mockPostToGateway.mockResolvedValue({
      ok: true,
      status: 200,
      data: gatewayErrorAnswer(NOT_YET_INDEXED).replace("</GovTalkErrors>", `${errorElement(OTHER_FATAL)}</GovTalkErrors>`),
      headers: {},
      duration: 1,
    });

    const result = await pollSubmission({
      userSub: "user-1",
      submissionNumber: "000001",
      kind: "accounts",
      now: new Date(SENT_AT.getTime() + 5000),
    });

    expect(result).toEqual({
      errors: [expect.objectContaining({ number: 8023 }), expect.objectContaining({ number: 502 })],
      submissionNumber: "000001",
    });
    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockPutAsyncRequest).not.toHaveBeenCalled();
  });

  test("the page poll of a request that is not pending returns Error 8023 as an error inside the hour", async () => {
    mockGetAsyncRequest.mockResolvedValue({
      status: "failed",
      createdAt: SENT_AT.toISOString(),
      data: {
        kind: "accounts",
        submissionNumber: "000001",
        statusCode: "REJECT",
        rejections: [
          { rejectCode: NEVER_RECEIVED_REJECT_CODE, description: "Companies House did not receive this filing.", instanceNumber: "1" },
        ],
      },
    });
    answer(NOT_YET_INDEXED);

    const result = await pollSubmission({
      userSub: "user-1",
      submissionNumber: "000001",
      kind: "accounts",
      now: new Date(SENT_AT.getTime() + 5000),
    });

    expect(result).toEqual({ errors: [expect.objectContaining({ number: 8023 })], submissionNumber: "000001" });
    expect(mockPutAsyncRequest).not.toHaveBeenCalled();
  });

  test("the presenter poll returns another error beside Error 8023 as errors and acknowledges nothing", async () => {
    mockPostToGateway.mockResolvedValue({
      ok: true,
      status: 200,
      data: gatewayErrorAnswer(NOT_YET_INDEXED).replace("</GovTalkErrors>", `${errorElement(OTHER_FATAL)}</GovTalkErrors>`),
      headers: {},
      duration: 1,
    });

    const result = await pollPresenterSubmissions();

    expect(result).toEqual({ polled: true, acknowledged: false, errors: [expect.objectContaining({ number: 502 })] });
    expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ errors: [expect.objectContaining({ number: 502 })] }));
    expect(mockPostToGateway).toHaveBeenCalledTimes(1);
  });

  test("the presenter poll records and acknowledges nothing for Error 8023 and logs no error", async () => {
    answer(NOT_YET_INDEXED);

    const result = await pollPresenterSubmissions();

    expect(result).toEqual({ polled: true, acknowledged: false, outcomes: [] });
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockPutAsyncRequest).not.toHaveBeenCalled();
    expect(mockPostToGateway).toHaveBeenCalledTimes(1);
  });
});
