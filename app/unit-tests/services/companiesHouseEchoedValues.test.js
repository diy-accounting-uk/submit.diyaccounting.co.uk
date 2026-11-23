// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseEchoedValues.test.js
// A rejection read after the reader has left keeps no name, address or company name the filing
// sent: the submit Lambda keeps a keyed hash of each word of them, and the poll takes each word
// whose hash it holds out of the reason before it is stored or answered.

import { describe, test, beforeAll, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockPostToGateway = vi.fn();
const mockParseGatewayResponse = vi.fn();
vi.mock("@app/services/companiesHouseXmlGateway.js", async (importOriginal) => ({
  ...(await importOriginal()),
  resolvePresenterCredentials: async () => ({ presenterId: "presenter-id", presenterCode: "presenter-code" }),
  postToGateway: (...args) => mockPostToGateway(...args),
  parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
}));

vi.mock("@app/data/dynamoDbCompaniesHouseFilingStateRepository.js", () => ({
  FILING_STATE_RETENTION: { days: 100 },
  claimPresenterPollSlot: async () => true,
  deferPresenterPoll: vi.fn(),
  claimFinalStatus: async () => true,
  releaseFinalStatus: vi.fn(),
}));

vi.mock("@app/data/dynamoDbCompaniesHousePendingFilerRepository.js", () => ({
  getPendingFiling: async (submissionNumber) => ({ submissionNumber, userSub: "user-1", kind: "psc-cessation" }),
  putPendingFiling: vi.fn(),
}));

const mockGetAsyncRequest = vi.fn();
const mockPutAsyncRequest = vi.fn();
vi.mock("@app/data/dynamoDbAsyncRequestRepository.js", () => ({
  getAsyncRequest: (...args) => mockGetAsyncRequest(...args),
  putAsyncRequest: (...args) => mockPutAsyncRequest(...args),
}));

const { initializeSalt } = await import("@app/services/subHasher.js");
const { echoedValuesOf, withoutEchoedValues, statusWithoutEchoedValues, ECHO_REMOVED } =
  await import("@app/services/companiesHouseEchoedValues.js");
const { pollPresenterSubmissions } = await import("@app/services/companiesHousePresenterPoll.js");
const { pollSubmission } = await import("@app/services/companiesHouseSubmissionStatus.js");

// A PSC cessation as the shared form route reads it.
const CESSATION = {
  companyNumber: "06846849",
  companyName: "BRAMWELL ENGINEERING LIMITED",
  companyAuthCode: "SIMCS01",
  dateSigned: "2026-11-20",
  kind: "individual-person-with-significant-control",
  title: "Mrs",
  forename: "Eleanor",
  otherForenames: "Mary",
  surname: "Bramwell",
  dobMonth: 1,
  dobYear: 1970,
  cessationDate: "2026-11-01",
};

const REJECTION = {
  rejectCode: "9998",
  description: "The person named, Eleanor Mary BRAMWELL, does not match the register of Bramwell Engineering Limited.",
  instanceNumber: "1",
};
const WITHOUT_ECHO = `The person named, ${ECHO_REMOVED}, does not match the register of ${ECHO_REMOVED} Limited.`;

beforeAll(async () => {
  await initializeSalt();
});

describe("the keyed hashes of what a filing sent", () => {
  test("hold a hash of each word of the names and the company name, and none of the words", () => {
    const echoed = echoedValuesOf(CESSATION, "user-1");
    const stored = JSON.stringify(echoed);
    for (const word of ["Eleanor", "Mary", "Bramwell", "BRAMWELL", "SIMCS01", "06846849"]) expect(stored).not.toContain(word);
    expect(echoed.saltVersion).toBeTruthy();
    // Eleanor, Mary, Bramwell and Engineering; "Limited" is a word of Companies House's own sentences.
    expect(echoed.hashes).toHaveLength(4);
  });

  test("differ between two accounts that send the same name", () => {
    expect(echoedValuesOf(CESSATION, "user-1").hashes).not.toEqual(echoedValuesOf(CESSATION, "user-2").hashes);
  });

  test("read every string under a field of names or addresses, and nothing of a code, a date or a choice", () => {
    const accounts = {
      companyName: "ACME LTD",
      directors: ["Alan James Morgan"],
      registeredOffice: { addressLine1: "22 While Road", cityOrTown: "Sutton Coldfield", postalCode: "B72 1ND" },
      dateOfApproval: "2026-09-01",
      accountingPolicies: "Prepared under FRS 102 section 1A.",
    };
    const echoed = echoedValuesOf(accounts, "user-1");
    const text = withoutEchoedValues("Alan Morgan of Sutton Coldfield, While Road, under FRS 102 for ACME LTD", echoed, "user-1");
    // The words of one place read as one removal, so Sutton Coldfield, While Road is one.
    expect(text).toBe(`${ECHO_REMOVED} of ${ECHO_REMOVED}, under FRS 102 for ${ECHO_REMOVED} LTD`);
  });

  test("are none for a request with no name or address", () => {
    expect(echoedValuesOf({ companyNumber: "06846849", dateSigned: "2026-11-20" }, "user-1")).toBeUndefined();
  });
});

describe("a rejection's reason without what the filing sent", () => {
  test("takes out each echoed word, whatever its case, and keeps the rest and the figures", () => {
    const echoed = echoedValuesOf(CESSATION, "user-1");
    expect(withoutEchoedValues(REJECTION.description, echoed, "user-1")).toBe(WITHOUT_ECHO);
    expect(withoutEchoedValues("Error 9998 on 2026-11-01", echoed, "user-1")).toBe("Error 9998 on 2026-11-01");
  });

  test("keeps the reason as it is under another account's hashes, and with no hashes", () => {
    expect(withoutEchoedValues(REJECTION.description, echoedValuesOf(CESSATION, "user-2"), "user-1")).toBe(REJECTION.description);
    expect(statusWithoutEchoedValues({ statusCode: "REJECT", rejections: [REJECTION] }, undefined, "user-1").rejections).toEqual([
      REJECTION,
    ]);
  });
});

describe("a poll that reads a rejection echoing a PSC's surname", () => {
  let echoedValues;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME = "test-companies-house-accounts-async-requests-table";
    process.env.COMPANIES_HOUSE_GATEWAY_TEST = "true";
    echoedValues = echoedValuesOf(CESSATION, "user-1");
    mockGetAsyncRequest.mockResolvedValue({
      requestId: "00001A",
      status: "pending",
      createdAt: "2026-11-20T10:00:00Z",
      data: { kind: "psc-cessation", echoedValues },
    });
    mockPostToGateway.mockResolvedValue({ ok: true, status: 200, data: "<GovTalkMessage/>", headers: {}, duration: 1 });
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ submissionNumber: "00001A", statusCode: "REJECT", companyNumber: "06846849", rejections: [REJECTION] }],
    });
  });

  test("the presenter poll stores the rejection without the surname", async () => {
    mockParseGatewayResponse
      .mockReturnValueOnce({
        errors: [],
        statuses: [{ submissionNumber: "00001A", statusCode: "REJECT", companyNumber: "06846849", rejections: [REJECTION] }],
      })
      .mockReturnValueOnce({ errors: [], statuses: [] });

    const result = await pollPresenterSubmissions();

    expect(result.outcomes).toEqual([{ submissionNumber: "00001A", statusCode: "REJECT", outcome: "recorded" }]);
    const [[, , status, stored]] = mockPutAsyncRequest.mock.calls;
    expect(status).toBe("failed");
    expect(stored.rejections[0].description).toBe(WITHOUT_ECHO);
    expect(JSON.stringify(stored)).not.toMatch(/bramwell|eleanor/i);
  });

  test("the page poll stores and answers the rejection without the surname", async () => {
    const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "psc-cessation" });

    expect(result.data.rejections[0].description).toBe(WITHOUT_ECHO);
    const [[, , , stored]] = mockPutAsyncRequest.mock.calls;
    expect(JSON.stringify(stored)).not.toMatch(/bramwell|eleanor/i);
  });
});
