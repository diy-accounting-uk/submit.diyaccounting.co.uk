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
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    GetCommand,
    PutCommand,
    UpdateCommand,
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

import { pollSubmission } from "@app/services/companiesHouseSubmissionStatus.js";
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
        return {};
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
      statuses: [{ statusCode: "PENDING", submissionNumber: "00001A", companyNumber: "06846849", rejections: [] }],
    });

    const result = await pollSubmission({
      userSub: "user-1",
      submissionNumber: "00001A",
      kind: "confirmation-statement",
      acceptedEvent: "companies-house-confirmation-statement-accepted",
      acceptedSummary: "Companies House confirmation statement accepted",
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

  test("forwards a Gov-Test-Scenario to the gateway call", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "PENDING", submissionNumber: "00001A", companyNumber: "06846849", rejections: [] }],
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

  test("writes a receipt and an async request kind on ACCEPT, and publishes acceptedEvent", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [{ statusCode: "ACCEPT", submissionNumber: "00001A", companyNumber: "06846849", rejections: [] }],
    });

    const result = await pollSubmission({
      userSub: "user-1",
      submissionNumber: "00001A",
      kind: "confirmation-statement",
      acceptedEvent: "companies-house-confirmation-statement-accepted",
      acceptedSummary: "Companies House confirmation statement accepted",
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

  test("stores failed and returns the rejections on REJECT, without publishing acceptedEvent", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [],
      statuses: [
        {
          statusCode: "REJECT",
          submissionNumber: "00001A",
          companyNumber: "06846849",
          rejections: [{ rejectCode: "11686", description: "shareholders required", instanceNumber: "1" }],
        },
      ],
    });

    const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "confirmation-statement" });

    expect(result.data.statusCode).toBe("REJECT");
    expect(result.data.rejections[0].rejectCode).toBe("11686");
    expect(mockEventBridgeSend).not.toHaveBeenCalled();
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
