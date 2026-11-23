// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseSubmissionStatus.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { setupTestEnv } from "@app/test-helpers/mockHelpers.js";

const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class GetCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class PutCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class UpdateCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class QueryCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    GetCommand,
    PutCommand,
    UpdateCommand,
    QueryCommand,
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

const mockBuildStatusRequest = vi.fn();
const mockResolvePresenterCredentials = vi.fn();
const mockPostToGateway = vi.fn();
const mockParseGatewayResponse = vi.fn();
vi.mock("@app/services/companiesHouseXmlGateway.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildStatusRequest: (...args) => mockBuildStatusRequest(...args),
    resolvePresenterCredentials: (...args) => mockResolvePresenterCredentials(...args),
    postToGateway: (...args) => mockPostToGateway(...args),
    parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
  };
});

const mockDropCompanyCache = vi.fn();
vi.mock("@app/services/companiesHouseCacheDrop.js", () => ({
  dropCompanyCacheAfterAcceptedFiling: (...args) => mockDropCompanyCache(...args),
}));

import { pollSubmission, hasStoredFinalStatus, isNeverReceived } from "@app/services/companiesHouseSubmissionStatus.js";
import { initializeSalt } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("pollSubmission", () => {
  beforeEach(async () => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_XMLGW_URI: "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
        RECEIPTS_DYNAMODB_TABLE_NAME: "test-receipts-table",
        COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: "test-companies-house-accounts-async-requests-table",
        ENVIRONMENT_NAME: "test",
      }),
    );
    vi.clearAllMocks();
    await initializeSalt();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.GetCommand) {
        return { Item: { requestId: cmd.input.Key.requestId, status: "pending" } };
      }
      return {};
    });
    mockResolvePresenterCredentials.mockResolvedValue({ presenterId: "presenter-id", presenterCode: "presenter-code" });
    mockBuildStatusRequest.mockReturnValue("<GovTalkMessage>status request</GovTalkMessage>");
    mockPostToGateway.mockResolvedValue({
      ok: true,
      status: 200,
      data: "<GovTalkMessage>status response</GovTalkMessage>",
      headers: {},
      duration: 1,
    });
  });

  test("polls the gateway and returns the current status while unresolved", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "PENDING", submissionNumber: "00001A", companyNumber: "00000004", rejections: [] }],
    });

    const result = await pollSubmission({
      userSub: "user-1",
      submissionNumber: "00001A",
      kind: "confirmation-statement",
    });

    expect(result.data.statusCode).toBe("PENDING");
    expect(mockBuildStatusRequest).toHaveBeenCalledWith({
      presenterId: "presenter-id",
      presenterCode: "presenter-code",
      submissionNumber: "00001A",
      gatewayTest: false,
    });
    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>status request</GovTalkMessage>", {});
  });

  test("returns notFound without calling the gateway when the user has no request for the submission", async () => {
    mockSend.mockImplementation(async () => ({}));

    const result = await pollSubmission({ userSub: "user-2", submissionNumber: "00001A", kind: "confirmation-statement" });

    expect(result).toEqual({ notFound: true, submissionNumber: "00001A" });
    expect(mockPostToGateway).not.toHaveBeenCalled();
    expect(mockEventBridgeSend).not.toHaveBeenCalled();
  });

  test("returns notFound without calling the gateway when the poll names another kind than the filing's", async () => {
    const lib = await import("@aws-sdk/lib-dynamodb");
    mockSend.mockImplementation(async (cmd) =>
      cmd instanceof lib.GetCommand
        ? { Item: { requestId: "00001A", status: "pending", data: { kind: "psc-verification-statement" } } }
        : {},
    );

    const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "psc-cessation" });

    expect(result).toEqual({ notFound: true, submissionNumber: "00001A" });
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("forwards a Gov-Test-Scenario to the gateway call", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "PENDING", submissionNumber: "00001A", companyNumber: "00000004", rejections: [] }],
    });

    await pollSubmission({
      userSub: "user-1",
      submissionNumber: "00001A",
      govTestScenario: "CS_PERIOD_PAID",
      kind: "confirmation-statement",
    });

    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>status request</GovTalkMessage>", {
      "Gov-Test-Scenario": "CS_PERIOD_PAID",
    });
  });

  test("polls under the customer's own presenter, without resolving ours or recording it", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "REJECT", submissionNumber: "00001A", companyNumber: "00000004", rejections: [] }],
    });

    await pollSubmission({
      userSub: "user-1",
      submissionNumber: "00001A",
      ownPresenter: { presenterId: "OWN-PRES-7731", presenterCode: "OwnSecretCode#42" },
      kind: "confirmation-statement",
    });

    expect(mockResolvePresenterCredentials).not.toHaveBeenCalled();
    expect(mockBuildStatusRequest).toHaveBeenCalledWith(
      expect.objectContaining({ presenterId: "OWN-PRES-7731", presenterCode: "OwnSecretCode#42" }),
    );
    const everythingStored = JSON.stringify(mockSend.mock.calls.map(([command]) => command?.input));
    expect(everythingStored).not.toContain("OWN-PRES-7731");
    expect(everythingStored).not.toContain("OwnSecretCode#42");
  });

  test("writes a receipt and an async request kind on ACCEPT, and publishes the form's accepted event", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "ACCEPT", submissionNumber: "00001A", companyNumber: "00000004", rejections: [] }],
    });

    const result = await pollSubmission({
      userSub: "user-1",
      submissionNumber: "00001A",
      kind: "confirmation-statement",
    });

    expect(result.data.statusCode).toBe("ACCEPT");
    expect(result.data.receiptId).toBeDefined();

    const lib = await import("@aws-sdk/lib-dynamodb");
    const putCalls = mockSend.mock.calls.filter(([cmd]) => cmd instanceof lib.PutCommand);
    expect(putCalls.length).toBeGreaterThan(0);
    const updateCalls = mockSend.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd instanceof lib.UpdateCommand);
    const completedUpdate = updateCalls.find((cmd) => cmd.input?.ExpressionAttributeValues?.[":status"] === "completed");
    expect(completedUpdate.input.ExpressionAttributeValues[":data"]).toMatchObject({ kind: "confirmation-statement" });

    expect(mockEventBridgeSend).toHaveBeenCalled();
  });

  test("drops the cached register answers of the company Companies House names when it accepts a filing", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "ACCEPT", submissionNumber: "00001A", companyNumber: "06846849", rejections: [] }],
    });
    await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "psc-cessation" });
    expect(mockDropCompanyCache).toHaveBeenCalledTimes(1);
    expect(mockDropCompanyCache).toHaveBeenCalledWith("06846849");
  });

  test("drops the cache of the company the filing was sent for when Companies House's status names none", async () => {
    const lib = await import("@aws-sdk/lib-dynamodb");
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof lib.GetCommand) {
        return {
          Item: { requestId: cmd.input.Key.requestId, status: "pending", data: { kind: "officer-resignation", companyNumber: "00000001" } },
        };
      }
      return {};
    });
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "ACCEPT", submissionNumber: "00001A", rejections: [] }],
    });
    await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "officer-resignation" });
    expect(mockDropCompanyCache).toHaveBeenCalledWith("00000001");
  });

  test("an accepted filing is stored as completed even when the cache drop finds nothing to drop", async () => {
    mockDropCompanyCache.mockResolvedValue(null);
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "ACCEPT", submissionNumber: "00001A", companyNumber: "06846849", rejections: [] }],
    });
    const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "accounts" });
    expect(result.data.statusCode).toBe("ACCEPT");
    const lib = await import("@aws-sdk/lib-dynamodb");
    const completed = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand)
      .find((cmd) => cmd.input?.ExpressionAttributeValues?.[":status"] === "completed");
    expect(completed).toBeDefined();
  });

  for (const statusCode of ["REJECT", "PENDING", "PARKED"]) {
    test(`a ${statusCode} drops no cached register answers`, async () => {
      mockParseGatewayResponse.mockReturnValue({
        errors: [],
        statuses: [
          {
            statusCode,
            submissionNumber: "00001A",
            companyNumber: "06846849",
            rejections: statusCode === "REJECT" ? [{ rejectCode: "9999", description: "Refused" }] : [],
          },
        ],
      });
      await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "confirmation-statement" });
      expect(mockDropCompanyCache).not.toHaveBeenCalled();
    });
  }

  test("keeps the filed accounts document with the receipt, and out of the poll answer", async () => {
    const lib = await import("@aws-sdk/lib-dynamodb");
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof lib.GetCommand) {
        return { Item: { requestId: cmd.input.Key.requestId, status: "pending", data: { filedDocument: "<html>accounts</html>" } } };
      }
      return {};
    });
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "ACCEPT", submissionNumber: "00001A", companyNumber: "00000004", rejections: [] }],
    });

    const result = await pollSubmission({
      userSub: "user-1",
      submissionNumber: "00001A",
      kind: "accounts",
    });

    expect(result.data.filedDocument).toBeUndefined();
    const receiptPut = mockSend.mock.calls.map(([cmd]) => cmd).find((cmd) => cmd instanceof lib.PutCommand);
    expect(receiptPut.input.Item.receipt).toMatchObject({
      kind: "companies-house-accounts",
      submissionNumber: "00001A",
      filedDocument: "<html>accounts</html>",
    });
  });

  test("asks for the receipt email in Welsh when the filing was made with the Welsh choice", async () => {
    const lib = await import("@aws-sdk/lib-dynamodb");
    process.env.ACTIVITY_BUS_NAME = process.env.ACTIVITY_BUS_NAME || "test-bus";
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof lib.GetCommand) {
        return { Item: { requestId: cmd.input.Key.requestId, status: "pending", data: { language: "cy" } } };
      }
      return {};
    });
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "ACCEPT", submissionNumber: "00001A", companyNumber: "00000004", rejections: [] }],
    });

    await pollSubmission({
      userSub: "user-1",
      submissionNumber: "00001A",
      kind: "confirmation-statement",
    });

    const emailRequests = mockEventBridgeSend.mock.calls
      .flatMap(([command]) => command.input?.Entries || [])
      .filter((entry) => entry.DetailType === "CustomerEmailRequest")
      .map((entry) => JSON.parse(entry.Detail).payload);
    expect(emailRequests).toEqual([
      expect.objectContaining({
        kind: "submission-receipt",
        data: expect.objectContaining({ receiptKind: "confirmation-statement", language: "cy" }),
      }),
    ]);
  });

  test("stores failed and returns the rejections on REJECT, without publishing an accepted event", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [
        {
          statusCode: "REJECT",
          submissionNumber: "00001A",
          companyNumber: "00000004",
          rejections: [{ rejectCode: "11686", description: "shareholders required", instanceNumber: "1" }],
        },
      ],
    });

    const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "confirmation-statement" });

    expect(result.data.statusCode).toBe("REJECT");
    expect(result.data.rejections[0].rejectCode).toBe("11686");
    expect(mockEventBridgeSend).not.toHaveBeenCalled();
  });

  test("a rejected filing made for a practice client keeps the client on its stored item", async () => {
    const lib = await import("@aws-sdk/lib-dynamodb");
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof lib.GetCommand) {
        return {
          Item: {
            requestId: "00001A",
            status: "pending",
            createdAt: new Date().toISOString(),
            data: { kind: "accounts", clientId: "client-1" },
          },
        };
      }
      return {};
    });
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "REJECT", submissionNumber: "00001A", companyNumber: "00000004", rejections: [{ rejectCode: "1" }] }],
    });

    await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "accounts" });

    const failedWrites = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand && cmd.input.ExpressionAttributeValues?.[":status"] === "failed");
    expect(failedWrites).toHaveLength(1);
    expect(failedWrites[0].input.ExpressionAttributeValues[":data"]).toMatchObject({ statusCode: "REJECT", clientId: "client-1" });
  });

  test("answers pending, records nothing and sends no email while the presenter poll is still recording the final status", async () => {
    const lib = await import("@aws-sdk/lib-dynamodb");
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof lib.GetCommand) return { Item: { requestId: cmd.input.Key.requestId, status: "pending" } };
      if (
        cmd instanceof lib.UpdateCommand &&
        cmd.input.Key?.requestId === "pending#00001A" &&
        cmd.input.ConditionExpression?.startsWith("attribute_not_exists(claimedAt)")
      ) {
        throw Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" });
      }
      return {};
    });
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "ACCEPT", submissionNumber: "00001A", companyNumber: "00000004", rejections: [] }],
    });

    const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "confirmation-statement" });

    expect(result.data).toEqual({ submissionNumber: "00001A", statusCode: "PENDING", rejections: [] });
    expect(mockSend.mock.calls.filter(([cmd]) => cmd instanceof lib.PutCommand)).toHaveLength(0);
    expect(mockEventBridgeSend).not.toHaveBeenCalled();
  });

  test("answers with the receipt the presenter poll recorded when the page loses the claim to it", async () => {
    const lib = await import("@aws-sdk/lib-dynamodb");
    let claimLost = false;
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof lib.GetCommand && cmd.input.TableName === "test-companies-house-accounts-async-requests-table") {
        return claimLost
          ? {
              Item: {
                requestId: "00001A",
                status: "completed",
                data: { statusCode: "ACCEPT", submissionNumber: "00001A", receiptId: "2026-11-18T10:00:00.000Z-00001A" },
              },
            }
          : { Item: { requestId: "00001A", status: "pending" } };
      }
      if (
        cmd instanceof lib.UpdateCommand &&
        cmd.input.Key?.requestId === "pending#00001A" &&
        cmd.input.ConditionExpression?.startsWith("attribute_not_exists(claimedAt)")
      ) {
        claimLost = true;
        throw Object.assign(new Error("The conditional request failed"), { name: "ConditionalCheckFailedException" });
      }
      return {};
    });
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "ACCEPT", submissionNumber: "00001A", companyNumber: "00000004", rejections: [] }],
    });

    const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "accounts" });

    expect(result.data).toMatchObject({ statusCode: "ACCEPT", receiptId: "2026-11-18T10:00:00.000Z-00001A" });
    expect(mockSend.mock.calls.filter(([cmd]) => cmd instanceof lib.PutCommand)).toHaveLength(0);
  });

  describe("a filing whose envelope got no answer and that Companies House has no record of", () => {
    const NOW = new Date("2026-11-18T12:00:00.000Z");
    const minutesAgo = (minutes) => new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();

    async function pollKeptFiling({ createdAt, outcomeUnknown = true }) {
      const lib = await import("@aws-sdk/lib-dynamodb");
      mockSend.mockImplementation(async (cmd) => {
        if (cmd instanceof lib.GetCommand) {
          return {
            Item: {
              requestId: "00001A",
              status: "pending",
              createdAt,
              data: { kind: "accounts", ...(outcomeUnknown ? { outcomeUnknown: true } : {}) },
            },
          };
        }
        return {};
      });
      mockParseGatewayResponse.mockReturnValue({
        errors: [{ raisedBy: "Gateway", number: "", type: "fatal", text: "No Transaction Found", location: "" }],
        statuses: [],
      });
      const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "accounts", now: NOW });
      const failedWrites = mockSend.mock.calls
        .map(([cmd]) => cmd)
        .filter((cmd) => cmd instanceof lib.UpdateCommand && cmd.input.ExpressionAttributeValues?.[":status"] === "failed");
      return { result, failedWrites };
    }

    test("past 30 minutes it is recorded failed, telling the reader to file again, with no charge", async () => {
      const { result, failedWrites } = await pollKeptFiling({ createdAt: minutesAgo(31) });

      expect(result.data).toMatchObject({ statusCode: "REJECT", submissionNumber: "00001A" });
      expect(result.data.rejections[0]).toMatchObject({ rejectCode: "NOT-RECEIVED" });
      expect(result.data.rejections[0].description).toContain("did not receive this filing");
      expect(result.data.rejections[0].description).toContain("File it again");
      expect(failedWrites).toHaveLength(1);
      expect(failedWrites[0].input.ExpressionAttributeValues[":data"]).toMatchObject({ statusCode: "REJECT", kind: "accounts" });
      expect(mockEventBridgeSend).not.toHaveBeenCalled();
    });

    test("inside 30 minutes it stays pending and the poll answers the gateway's error", async () => {
      const { result, failedWrites } = await pollKeptFiling({ createdAt: minutesAgo(10) });
      expect(result.errors[0].text).toBe("No Transaction Found");
      expect(failedWrites).toHaveLength(0);
    });

    test("a filing the gateway acknowledged is not marked failed by No Transaction Found", async () => {
      const { result, failedWrites } = await pollKeptFiling({ createdAt: minutesAgo(31), outcomeUnknown: false });
      expect(result.errors[0].text).toBe("No Transaction Found");
      expect(failedWrites).toHaveLength(0);
    });

    test("after 90 days No Transaction Found proves nothing, so the filing is left as it is", async () => {
      const { result, failedWrites } = await pollKeptFiling({ createdAt: minutesAgo(91 * 24 * 60) });
      expect(result.errors[0].text).toBe("No Transaction Found");
      expect(failedWrites).toHaveLength(0);
    });
  });

  test("gives the claim back when the receipt write fails, so a later poll can record it", async () => {
    const lib = await import("@aws-sdk/lib-dynamodb");
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof lib.GetCommand) return { Item: { requestId: cmd.input.Key.requestId, status: "pending" } };
      if (cmd instanceof lib.PutCommand) throw new Error("receipts table unavailable");
      return {};
    });
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "ACCEPT", submissionNumber: "00001A", companyNumber: "00000004", rejections: [] }],
    });

    await expect(pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "confirmation-statement" })).rejects.toThrow(
      "receipts table unavailable",
    );
    const release = mockSend.mock.calls.map(([cmd]) => cmd).find((cmd) => cmd.input?.UpdateExpression === "REMOVE claimedAt");
    expect(release.input.Key).toEqual({ hashedSub: "companies-house-xmlgw", requestId: "pending#00001A" });
  });

  test("returns the gateway's errors without touching the async request table", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [{ raisedBy: "Gateway", number: 502, type: "fatal", text: "Authorisation Failure" }],
      statuses: [],
    });

    const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "confirmation-statement" });

    expect(result.errors[0].number).toBe(502);
    expect(result.data).toBeUndefined();
  });

  test("short-circuits the gateway call for an already completed async request", async () => {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.GetCommand) {
        return { Item: { status: "completed", data: { statusCode: "ACCEPT", receiptId: "cached-receipt" } } };
      }
      return {};
    });

    const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "confirmation-statement" });

    expect(result.data.receiptId).toBe("cached-receipt");
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });
});

describe("hasStoredFinalStatus", () => {
  const neverReceived = {
    statusCode: "REJECT",
    rejections: [{ rejectCode: "NOT-RECEIVED", description: "Companies House did not receive this filing.", instanceNumber: "1" }],
  };

  test("an accepted filing and a Companies House rejection are final", () => {
    expect(hasStoredFinalStatus({ status: "completed", data: { statusCode: "ACCEPT" } })).toBe(true);
    expect(hasStoredFinalStatus({ status: "failed", data: { statusCode: "REJECT", rejections: [{ rejectCode: "1" }] } })).toBe(true);
  });

  test("the never-received rejection is not final, so a later decision is recorded over it", () => {
    expect(isNeverReceived(neverReceived)).toBe(true);
    expect(hasStoredFinalStatus({ status: "failed", data: neverReceived })).toBe(false);
  });

  test("a send that failed before Companies House had it, and a pending filing, are not final", () => {
    expect(hasStoredFinalStatus({ status: "failed", data: { message: "socket hang up" } })).toBe(false);
    expect(hasStoredFinalStatus({ status: "pending", data: {} })).toBe(false);
    expect(hasStoredFinalStatus(null)).toBe(false);
  });
});
