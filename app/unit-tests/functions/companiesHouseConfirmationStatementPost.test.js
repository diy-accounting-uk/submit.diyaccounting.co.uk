// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseConfirmationStatementPost.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";
import {
  INVALID_COMPANY_AUTHENTICATION_CODE_MESSAGE,
  INVALID_COMPANY_AUTHENTICATION_CODE_REASON,
} from "@app/lib/companiesHouseGatewayErrors.js";

const mockSend = vi.fn();

const loggedLines = [];
vi.mock("@app/lib/logger.js", async (importOriginal) => {
  const actual = await importOriginal();
  const capture =
    (level) =>
    (...args) =>
      loggedLines.push({ level, args });
  const capturingLogger = {
    trace: capture("trace"),
    debug: capture("debug"),
    info: capture("info"),
    warn: capture("warn"),
    error: capture("error"),
    fatal: capture("fatal"),
  };
  return { ...actual, createLogger: () => capturingLogger };
});

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class QueryCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    QueryCommand,
    PutCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
    GetCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
    UpdateCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor() {}
  },
}));

const mockEventBridgeSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockEventBridgeSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockBuildConfirmationStatementSubmission = vi.fn();
const mockBuildPaymentPeriodsRequest = vi.fn();
const mockParsePaymentPeriodsResponse = vi.fn();
const mockAllocateSubmissionNumber = vi.fn();
const mockResolvePresenterCredentials = vi.fn();
const mockPostToGateway = vi.fn();
const mockParseGatewayResponse = vi.fn();
vi.mock("@app/services/companiesHouseXmlGateway.js", async (importOriginal) => ({
  gatewayRequestNotDelivered: (await importOriginal()).gatewayRequestNotDelivered,
  buildConfirmationStatementSubmission: (...args) => mockBuildConfirmationStatementSubmission(...args),
  buildPaymentPeriodsRequest: (...args) => mockBuildPaymentPeriodsRequest(...args),
  parsePaymentPeriodsResponse: (...args) => mockParsePaymentPeriodsResponse(...args),
  allocateSubmissionNumber: (...args) => mockAllocateSubmissionNumber(...args),
  postToGateway: (...args) => mockPostToGateway(...args),
  parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
  resolvePresenterCredentials: (...args) => mockResolvePresenterCredentials(...args),
}));

// Mock the activity charges service - hasPaidCharge guards a fee-due submission (402 without a
// paid charge), markChargeUsed spends it once the gateway accepts the envelope.
const mockHasPaidCharge = vi.fn();
const mockMarkChargeUsed = vi.fn();
vi.mock("@app/services/activityCharges.js", () => ({
  hasPaidCharge: (...args) => mockHasPaidCharge(...args),
  markChargeUsed: (...args) => mockMarkChargeUsed(...args),
}));

import { ingestHandler as companiesHouseConfirmationStatementPostHandler } from "@app/functions/companies-house/companiesHouseConfirmationStatementPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildStatementBody(overrides = {}) {
  return {
    companyNumber: "00000004",
    companyName: "EXAMPLE CONFIRMATION STATEMENT LIMITED",
    companyAuthCode: "SIMCS01",
    dateSigned: "2026-09-24",
    reviewDate: "2025-09-21",
    lawfulPurposeStatementAccepted: true,
    stateConfirmationAccepted: true,
    directors: [{ personalCode: "CWMPS832223", forename: "ALICE", otherForenames: "MARGARET", surname: "EXAMPLE", dob: "1970-01-01" }],
    ...overrides,
  };
}

const VERIFIED_OFFICER = { identityVerificationDetails: { appointment_verification_end_on: "9999-12-31" } };
const UNVERIFIED_OFFICER = { identityVerificationDetails: { appointment_verification_end_on: null } };

function buildEvent({ body = buildStatementBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/confirmation-statement",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHouseConfirmationStatementPost ingestHandler", () => {
  beforeEach(() => {
    loggedLines.length = 0;
    delete process.env.COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS;
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_XMLGW_URI: "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
        COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: "test-companies-house-accounts-async-requests-table",
        COMPANIES_HOUSE_PACKAGE_REFERENCE: "0012",
        ENVIRONMENT_NAME: "test",
      }),
    );
    vi.clearAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-pro", subscriptionStatus: "active" }], Count: 1 };
      }
      return {};
    });
    mockAllocateSubmissionNumber.mockResolvedValue("00001A");
    mockResolvePresenterCredentials.mockResolvedValue({ presenterId: "presenter-id", presenterCode: "presenter-code" });
    mockBuildConfirmationStatementSubmission.mockReturnValue("<GovTalkMessage>submission</GovTalkMessage>");
    mockBuildPaymentPeriodsRequest.mockReturnValue("<GovTalkMessage>PaymentPeriodsRequest</GovTalkMessage>");
    // Payment period already paid by default, so the fee gate does not apply unless a test says
    // otherwise - hasPaidCharge/markChargeUsed are then never reached.
    mockParsePaymentPeriodsResponse.mockReturnValue({ periods: [{ periodPaid: true }] });
    mockPostToGateway.mockResolvedValue({ ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 });
    mockParseGatewayResponse.mockReturnValue({ errors: [], statuses: [], gatewayTimestamp: "2026-09-24T10:00:00Z", pollInterval: 1 });
    mockHasPaidCharge.mockResolvedValue(true);
    mockMarkChargeUsed.mockResolvedValue(true);
  });

  test("builds the statement body, submits the envelope and returns the submission number", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.submissionNumber).toBe("00001A");
    expect(body.gatewayTimestamp).toBe("2026-09-24T10:00:00Z");
    expect(body.pollInterval).toBe(1);

    expect(mockBuildConfirmationStatementSubmission).toHaveBeenCalledTimes(1);
    const [submissionArgs] = mockBuildConfirmationStatementSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      presenterId: "presenter-id",
      presenterCode: "presenter-code",
      companyNumber: "00000004",
      companyName: "EXAMPLE CONFIRMATION STATEMENT LIMITED",
      companyAuthenticationCode: "SIMCS01",
      packageReference: "0012",
      submissionNumber: "00001A",
      dateSigned: "2026-09-24",
      gatewayTest: false,
    });
    expect(submissionArgs.statementXml).toContain("<ReviewDate>2025-09-21</ReviewDate>");

    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>submission</GovTalkMessage>", {});
  });

  test("keeps the filing pending and answers its number when the gateway never answers the sent envelope", async () => {
    mockPostToGateway.mockImplementation(async (xml) => {
      if (xml === "<GovTalkMessage>submission</GovTalkMessage>") throw new Error("The operation was aborted due to timeout");
      return { ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 };
    });

    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    expect(parseResponseBody(response).submissionNumber).toBe("00001A");
    const lib = await import("@aws-sdk/lib-dynamodb");
    const writes = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand && cmd.input.ExpressionAttributeValues?.[":status"])
      .map((cmd) => cmd.input.ExpressionAttributeValues);
    expect(writes.map((values) => values[":status"])).toEqual(["pending", "pending"]);
    expect(writes.at(-1)[":data"]).toMatchObject({ kind: "confirmation-statement", outcomeUnknown: true });
  });

  test("keeps a paid fee unspent with the pending filing when the gateway never answers, so a late acceptance spends it", async () => {
    mockParsePaymentPeriodsResponse.mockReturnValue({ periods: [{ periodPaid: false }] });
    mockHasPaidCharge.mockResolvedValue(true);
    mockPostToGateway.mockImplementation(async (xml) => {
      if (xml === "<GovTalkMessage>submission</GovTalkMessage>") throw new Error("The operation was aborted due to timeout");
      return { ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 };
    });

    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    expect(mockMarkChargeUsed).not.toHaveBeenCalled();
    const lib = await import("@aws-sdk/lib-dynamodb");
    const writes = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand && cmd.input.ExpressionAttributeValues?.[":status"])
      .map((cmd) => cmd.input.ExpressionAttributeValues);
    const feeCharge = { activityId: "file-confirmation-statement", subjectKey: "00000004:2025-09-21" };
    expect(writes.map((values) => values[":data"].feeCharge)).toEqual([feeCharge, feeCharge]);
  });

  test("keeps no fee with a filing whose payment period Companies House already has paid", async () => {
    mockParsePaymentPeriodsResponse.mockReturnValue({ periods: [{ periodPaid: true }] });

    await companiesHouseConfirmationStatementPostHandler(buildEvent());

    const lib = await import("@aws-sdk/lib-dynamodb");
    const pending = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .find((cmd) => cmd instanceof lib.UpdateCommand && cmd.input.ExpressionAttributeValues?.[":status"] === "pending");
    expect(pending.input.ExpressionAttributeValues[":data"]).not.toHaveProperty("feeCharge");
  });

  test("marks the filing failed when the connection to the gateway was refused, so nothing was delivered", async () => {
    mockPostToGateway.mockImplementation(async (xml) => {
      if (xml === "<GovTalkMessage>submission</GovTalkMessage>") {
        throw Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:443"), { code: "ECONNREFUSED", syscall: "connect" }),
        });
      }
      return { ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 };
    });

    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());

    expect(response.statusCode).toBe(500);
    const lib = await import("@aws-sdk/lib-dynamodb");
    const statuses = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand && cmd.input.ExpressionAttributeValues?.[":status"])
      .map((cmd) => cmd.input.ExpressionAttributeValues[":status"]);
    expect(statuses).toEqual(["pending", "failed"]);
  });

  test("forwards a Gov-Test-Scenario header to the gateway call", async () => {
    await companiesHouseConfirmationStatementPostHandler(buildEvent({ headers: { "Gov-Test-Scenario": "CS_INSUFFICIENT_FUNDS" } }));
    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>submission</GovTalkMessage>", {
      "Gov-Test-Scenario": "CS_INSUFFICIENT_FUNDS",
    });
  });

  test("sets gatewayTest true when COMPANIES_HOUSE_GATEWAY_TEST is true", async () => {
    process.env.COMPANIES_HOUSE_GATEWAY_TEST = "true";
    await companiesHouseConfirmationStatementPostHandler(buildEvent());
    const [submissionArgs] = mockBuildConfirmationStatementSubmission.mock.calls[0];
    expect(submissionArgs.gatewayTest).toBe(true);
  });

  test("submits ConfirmationStatement (v1-3) with no directors when every officer is already verified", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({
        body: buildStatementBody({ directors: undefined, officers: [VERIFIED_OFFICER, VERIFIED_OFFICER] }),
      }),
    );
    expect(response.statusCode).toBe(201);

    const [submissionArgs] = mockBuildConfirmationStatementSubmission.mock.calls[0];
    expect(submissionArgs.formIdentifier).toBe("ConfirmationStatement");
    expect(submissionArgs.statementXml).toMatch(/^<ConfirmationStatement /);
    expect(submissionArgs.statementXml).not.toContain("VerificationStatement");
  });

  test("submits ConfirmationAndVerificationStatement (v1-0) with the directors' codes when an officer is unverified", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ officers: [VERIFIED_OFFICER, UNVERIFIED_OFFICER] }) }),
    );
    expect(response.statusCode).toBe(201);

    const [submissionArgs] = mockBuildConfirmationStatementSubmission.mock.calls[0];
    expect(submissionArgs.formIdentifier).toBe("ConfirmationAndVerificationStatement");
    expect(submissionArgs.statementXml).toMatch(/^<ConfirmationAndVerificationStatement /);
    expect(submissionArgs.statementXml).toContain("<VerificationStatement>");
  });

  test("rejects when the lawful purpose statement is not accepted", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ lawfulPurposeStatementAccepted: false }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects when the statement of confirmation is not accepted", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ stateConfirmationAccepted: false }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects officers that are not an array", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ officers: "not-an-array" }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects an officers entry that is not an object", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ officers: [VERIFIED_OFFICER, "not-an-object"] }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects a company authentication code that is too short", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ companyAuthCode: "AB" }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("refuses a Welsh lower-case letter in a shareholder's address or a director's name, naming the field and the letter", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({
        body: buildStatementBody({
          shareholdings: [
            {
              shareClass: "ORDINARY",
              numberHeld: 100,
              shareholders: [
                { surname: "JONES", address: { premise: "3", street: "Ffordd Glyndŵr", postTown: "Machynlleth", country: "GB-WLS" } },
              ],
            },
          ],
          directors: [{ personalCode: "CWMPS832223", forename: "Siân", otherForenames: "MAIR", surname: "EXAMPLE", dob: "1970-01-01" }],
        }),
      }),
    );
    expect(response.statusCode).toBe(400);
    const { message } = parseResponseBody(response);
    expect(message).toContain("shareholdings[0].shareholders[0].address.street has characters Companies House does not accept: ŵ");
    expect(message).toContain("directors[0].forename has characters Companies House does not accept: â");
    expect(message).not.toMatch(/Glynd|Siân/);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("refuses a shareholder's surname over the 160 characters its schema allows, naming the field and the limit", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({
        body: buildStatementBody({
          shareholdings: [{ shareClass: "ORDINARY", numberHeld: 100, shareholders: [{ surname: "A".repeat(161) }] }],
        }),
      }),
    );
    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response).message).toContain("shareholdings[0].shareholders[0].surname must be at most 160 characters");
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  const ECHOED = {
    errors: [{ raisedBy: "Gateway", number: "604", type: "fatal", text: "Director ALICE MARGARET EXAMPLE has no verified identity" }],
    statuses: [],
  };
  const CLEANED = [
    {
      raisedBy: "Gateway",
      number: "604",
      type: "fatal",
      text: "Director [a value of the request] [a value of the request] [a value of the request] has no verified identity",
    },
  ];

  test("a rejected payment periods query whose text echoes a director's name answers the code with the name taken out", async () => {
    mockParseGatewayResponse.mockReturnValue(ECHOED);
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response).errors).toEqual(CLEANED);
  });

  test("a rejected submission whose text echoes a director's name keeps the code and takes the name out of the answer, the state and the event", async () => {
    mockParseGatewayResponse.mockReturnValueOnce({ errors: [], statuses: [] }).mockReturnValue(ECHOED);
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response).errors).toEqual(CLEANED);
    const kept = JSON.stringify([mockSend.mock.calls, mockEventBridgeSend.mock.calls]);
    expect(kept).toContain("604");
    expect(kept).not.toMatch(/ALICE|MARGARET/);
  });

  test("rejects a director's personal code that is not 11 characters", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({
        body: buildStatementBody({ directors: [{ personalCode: "TOOSHORT", forename: "ALICE", surname: "EXAMPLE", dob: "1970-01-01" }] }),
      }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects a director's personal code that is all digits", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({
        body: buildStatementBody({
          directors: [{ personalCode: "12345678951", forename: "ALICE", surname: "EXAMPLE", dob: "1970-01-01" }],
        }),
      }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects more than four SIC codes", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ sicCodes: ["11111", "22222", "33333", "44444", "55555"] }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("marks the submission failed and returns 500 when the gateway rejects the envelope", async () => {
    mockParseGatewayResponse
      .mockReturnValueOnce({ errors: [], statuses: [], gatewayTimestamp: "2026-09-24T10:00:00Z", pollInterval: 1 }) // PaymentPeriodsRequest
      .mockReturnValueOnce({
        errors: [{ raisedBy: "Gateway", number: 5006, type: "fatal", text: "Insufficient Funds" }],
      }); // submission
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response);
    expect(body.errors[0].number).toBe(5006);
  });

  test("returns 400 with the gateway errors when the submission reports the company authentication code as invalid", async () => {
    mockParseGatewayResponse
      .mockReturnValueOnce({ errors: [], statuses: [], gatewayTimestamp: "2026-09-24T10:00:00Z", pollInterval: 1 })
      .mockReturnValueOnce({
        errors: [{ raisedBy: "CompanyDataRequest", number: 9999, type: "fatal", text: "Invalid CompanyAuthenticationCode", location: "" }],
      });
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.reason).toBe(INVALID_COMPANY_AUTHENTICATION_CODE_REASON);
    expect(body.message).toBe(INVALID_COMPANY_AUTHENTICATION_CODE_MESSAGE);
    expect(body.errors[0].text).toBe("Invalid CompanyAuthenticationCode");
  });

  test("returns 400 with the gateway errors when the payment periods response reports the company authentication code as invalid", async () => {
    mockParseGatewayResponse.mockReturnValueOnce({
      errors: [{ raisedBy: "PaymentPeriodsRequest", number: 9999, type: "fatal", text: "Invalid CompanyAuthenticationCode", location: "" }],
    });
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.reason).toBe(INVALID_COMPANY_AUTHENTICATION_CODE_REASON);
    expect(body.message).toBe(INVALID_COMPANY_AUTHENTICATION_CODE_MESSAGE);
    expect(body.errors[0].text).toBe("Invalid CompanyAuthenticationCode");
    expect(mockBuildConfirmationStatementSubmission).not.toHaveBeenCalled();
  });

  test("returns 500 for another gateway error that shares number 9999", async () => {
    mockParseGatewayResponse
      .mockReturnValueOnce({ errors: [], statuses: [], gatewayTimestamp: "2026-09-24T10:00:00Z", pollInterval: 1 })
      .mockReturnValueOnce({ errors: [{ raisedBy: "Gateway", number: 9999, type: "fatal", text: "No presenter ID supplied" }] });
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(500);
  });

  test("returns 402 when the payment period is unpaid and no activity charge has been paid", async () => {
    mockParsePaymentPeriodsResponse.mockReturnValue({ periods: [{ periodPaid: false }] });
    mockHasPaidCharge.mockResolvedValue(false);
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(402);
    const body = parseResponseBody(response);
    expect(body.code).toBe("fee-due");
    expect(mockHasPaidCharge).toHaveBeenCalledWith(expect.any(String), "file-confirmation-statement", "00000004:2025-09-21");
    expect(mockBuildConfirmationStatementSubmission).not.toHaveBeenCalled();
  });

  test("submits and marks the activity charge used when the payment period is unpaid but already paid for", async () => {
    mockParsePaymentPeriodsResponse.mockReturnValue({ periods: [{ periodPaid: false }] });
    mockHasPaidCharge.mockResolvedValue(true);
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(201);
    expect(mockMarkChargeUsed).toHaveBeenCalledWith(expect.any(String), "file-confirmation-statement", "00000004:2025-09-21");
  });

  test("does not mark a charge used when the payment period was already paid through Companies House", async () => {
    mockParsePaymentPeriodsResponse.mockReturnValue({ periods: [{ periodPaid: true }] });
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(201);
    expect(mockHasPaidCharge).not.toHaveBeenCalled();
    expect(mockMarkChargeUsed).not.toHaveBeenCalled();
  });

  test("skips the fee gate entirely when the company number is in COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS", async () => {
    process.env.COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS = "00000004";
    mockParsePaymentPeriodsResponse.mockReturnValue({ periods: [{ periodPaid: false }] });
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(201);
    expect(mockBuildPaymentPeriodsRequest).not.toHaveBeenCalled();
    expect(mockHasPaidCharge).not.toHaveBeenCalled();
    expect(mockMarkChargeUsed).not.toHaveBeenCalled();
  });

  test("skips the fee gate when the company number is one of several in the comma-separated list, with whitespace tolerated", async () => {
    process.env.COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS = "01234567, 00000004 ,00000011";
    mockParsePaymentPeriodsResponse.mockReturnValue({ periods: [{ periodPaid: false }] });
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(201);
    expect(mockBuildPaymentPeriodsRequest).not.toHaveBeenCalled();
    expect(mockHasPaidCharge).not.toHaveBeenCalled();
    expect(mockMarkChargeUsed).not.toHaveBeenCalled();
  });

  test("does not skip the fee gate for a company number not in COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS", async () => {
    process.env.COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS = "01234567";
    mockParsePaymentPeriodsResponse.mockReturnValue({ periods: [{ periodPaid: false }] });
    mockHasPaidCharge.mockResolvedValue(false);
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(402);
    expect(mockBuildPaymentPeriodsRequest).toHaveBeenCalled();
  });

  test("waives nothing when COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS is unset or empty", async () => {
    delete process.env.COMPANIES_HOUSE_CS_FEE_WAIVED_COMPANY_NUMBERS;
    mockParsePaymentPeriodsResponse.mockReturnValue({ periods: [{ periodPaid: false }] });
    mockHasPaidCharge.mockResolvedValue(false);
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(402);
    expect(mockBuildPaymentPeriodsRequest).toHaveBeenCalled();
  });

  describe("under the customer's own presenter", () => {
    const OWN_PRESENTER = { id: "OWN-PRES-7731", code: "OwnSecretCode#42" };

    test("presents under the customer's presenter, skips the Submit checkout and never resolves our presenter", async () => {
      mockParsePaymentPeriodsResponse.mockReturnValue({ periods: [{ periodPaid: false }] });
      mockHasPaidCharge.mockResolvedValue(false);
      const response = await companiesHouseConfirmationStatementPostHandler(
        buildEvent({ body: buildStatementBody({ ownPresenter: OWN_PRESENTER }) }),
      );
      expect(response.statusCode).toBe(201);
      expect(mockResolvePresenterCredentials).not.toHaveBeenCalled();
      expect(mockBuildPaymentPeriodsRequest).not.toHaveBeenCalled();
      expect(mockHasPaidCharge).not.toHaveBeenCalled();
      expect(mockMarkChargeUsed).not.toHaveBeenCalled();
      expect(mockBuildConfirmationStatementSubmission).toHaveBeenCalledWith(
        expect.objectContaining({ presenterId: OWN_PRESENTER.id, presenterCode: OWN_PRESENTER.code }),
      );
    });

    test("still presents under our presenter and charges when no own presenter is sent", async () => {
      mockParsePaymentPeriodsResponse.mockReturnValue({ periods: [{ periodPaid: false }] });
      mockHasPaidCharge.mockResolvedValue(false);
      const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
      expect(response.statusCode).toBe(402);
      expect(mockResolvePresenterCredentials).toHaveBeenCalled();
    });

    test("rejects an own presenter that is missing its authentication code", async () => {
      const response = await companiesHouseConfirmationStatementPostHandler(
        buildEvent({ body: buildStatementBody({ ownPresenter: { id: OWN_PRESENTER.id } }) }),
      );
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("presenter authentication code");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("rejects an own presenter that is missing its id", async () => {
      const response = await companiesHouseConfirmationStatementPostHandler(
        buildEvent({ body: buildStatementBody({ ownPresenter: { code: OWN_PRESENTER.code } }) }),
      );
      expect(response.statusCode).toBe(400);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("keeps the own presenter out of every stored record, event and log line", async () => {
      await companiesHouseConfirmationStatementPostHandler(buildEvent({ body: buildStatementBody({ ownPresenter: OWN_PRESENTER }) }));
      const everythingWritten = JSON.stringify({
        stored: mockSend.mock.calls.map(([command]) => command?.input),
        events: mockEventBridgeSend.mock.calls.map(([command]) => command?.input),
        logged: loggedLines,
      });
      expect(loggedLines.length).toBeGreaterThan(0);
      expect(everythingWritten).not.toContain(OWN_PRESENTER.id);
      expect(everythingWritten).not.toContain(OWN_PRESENTER.code);
    });

    test("keeps the own presenter out of the log when the gateway call fails", async () => {
      mockPostToGateway.mockRejectedValue(new Error("gateway down"));
      const response = await companiesHouseConfirmationStatementPostHandler(
        buildEvent({ body: buildStatementBody({ ownPresenter: OWN_PRESENTER }) }),
      );
      // The envelope left, so the filing is kept pending under its number.
      expect(response.statusCode).toBe(201);
      const everythingWritten = JSON.stringify({
        stored: mockSend.mock.calls.map(([command]) => command?.input),
        logged: loggedLines,
      });
      expect(everythingWritten).not.toContain(OWN_PRESENTER.id);
      expect(everythingWritten).not.toContain(OWN_PRESENTER.code);
    });
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseConfirmationStatementPostHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
