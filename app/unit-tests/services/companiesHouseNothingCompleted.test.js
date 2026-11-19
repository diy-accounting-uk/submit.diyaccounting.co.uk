// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseNothingCompleted.test.js
// The gateway answers a GetSubmissionStatus poll with Error 8026 when it has no accepted or
// rejected submission to report. Both polls read that as nothing decided yet and log no error;
// every other gateway error is still logged as one.

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
  claimFinalStatus: vi.fn(),
  releaseFinalStatus: vi.fn(),
}));

const mockGetAsyncRequest = vi.fn();
const mockPutAsyncRequest = vi.fn();
vi.mock("@app/data/dynamoDbAsyncRequestRepository.js", () => ({
  getAsyncRequest: (...args) => mockGetAsyncRequest(...args),
  putAsyncRequest: (...args) => mockPutAsyncRequest(...args),
}));

const { pollPresenterSubmissions } = await import("@app/services/companiesHousePresenterPoll.js");
const { pollSubmission } = await import("@app/services/companiesHouseSubmissionStatus.js");

// The live gateway's answer, with its text spaced as it sends it.
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

const NOTHING_COMPLETED = {
  number: 8026,
  text: "No Accepted or Rejected documents found in system.  However, there could be documents we are currently processing in the system.",
};
const OTHER_FATAL = { number: 502, text: "Authentication failure" };

function answer(error) {
  mockPostToGateway.mockResolvedValue({ ok: true, status: 200, data: gatewayErrorAnswer(error), headers: {}, duration: 1 });
}

describe("a gateway answer that nothing is decided yet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME = "test-companies-house-accounts-async-requests-table";
    process.env.COMPANIES_HOUSE_GATEWAY_TEST = "false";
  });

  test("the presenter poll reads Error 8026 as nothing completed, logs no error and acknowledges nothing", async () => {
    answer(NOTHING_COMPLETED);

    const result = await pollPresenterSubmissions();

    expect(result).toEqual({ polled: true, acknowledged: false, outcomes: [] });
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockPostToGateway).toHaveBeenCalledTimes(1);
  });

  test("the presenter poll still logs another fatal gateway error and returns it", async () => {
    answer(OTHER_FATAL);

    const result = await pollPresenterSubmissions();

    expect(result).toMatchObject({ polled: true, acknowledged: false, errors: [expect.objectContaining({ number: 502 })] });
    expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ errors: [expect.objectContaining({ number: 502 })] }));
  });

  test("the page poll of a pending filing reads Error 8026 as still pending and logs no error", async () => {
    mockGetAsyncRequest.mockResolvedValue({ status: "pending", createdAt: new Date().toISOString(), data: { kind: "accounts" } });
    answer(NOTHING_COMPLETED);

    const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "accounts" });

    expect(result).toEqual({ data: { submissionNumber: "00001A", statusCode: "PENDING", rejections: [] } });
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockPutAsyncRequest).not.toHaveBeenCalled();
  });

  test("the page poll still logs another fatal gateway error and returns it", async () => {
    mockGetAsyncRequest.mockResolvedValue({ status: "pending", createdAt: new Date().toISOString(), data: { kind: "accounts" } });
    answer(OTHER_FATAL);

    const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "accounts" });

    expect(result).toEqual({ errors: [expect.objectContaining({ number: 502 })], submissionNumber: "00001A" });
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
