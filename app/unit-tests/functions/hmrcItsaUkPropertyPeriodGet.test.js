// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaUkPropertyPeriodGet.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";

const mockSend = vi.fn();
const mockSqsSend = vi.fn();

vi.mock("@aws-sdk/client-sqs", () => {
  class SQSClient {
    constructor(_config) {}
    send(cmd) {
      return mockSqsSend(cmd);
    }
  }
  class SendMessageCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { SQSClient, SendMessageCommand };
});

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class PutCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class QueryCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class DeleteCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class GetCommand {
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
    PutCommand,
    QueryCommand,
    DeleteCommand,
    GetCommand,
    UpdateCommand,
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClient {
    constructor(_config) {}
  }
  return { DynamoDBClient };
});

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

import { ingestHandler as hmrcItsaUkPropertyPeriodGetHandler } from "@app/functions/hmrc/hmrcItsaUkPropertyPeriodGet.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678901";
const VALID_TAX_YEAR = "2023-24";
const VALID_SUBMISSION_ID = "4557ecb5-fd32-48cc-81f5-e6acd1099f3c";

let mockFetch;

describe("hmrcItsaUkPropertyPeriodGet ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
    vi.resetAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) return { Items: [], Count: 0 };
      if (cmd instanceof lib.GetCommand) return { Item: null };
      return {};
    });
  });

  test("returns 400 when submissionId is missing", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodGetHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("submissionId");
  });

  test("returns 400 for invalid taxYear format", async () => {
    const event = buildHmrcEvent({
      queryStringParameters: {
        nino: VALID_NINO,
        businessId: VALID_BUSINESS_ID,
        taxYear: "not-a-year",
        submissionId: VALID_SUBMISSION_ID,
      },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodGetHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 200 with the period summary on success", async () => {
    const periodSummary = {
      fromDate: "2023-04-06",
      toDate: "2023-07-05",
      ukNonFhlProperty: { income: { periodAmount: 5000 } },
    };
    mockHmrcSuccess(mockFetch, periodSummary);

    const event = buildHmrcEvent({
      queryStringParameters: {
        nino: VALID_NINO,
        businessId: VALID_BUSINESS_ID,
        taxYear: VALID_TAX_YEAR,
        submissionId: VALID_SUBMISSION_ID,
      },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodGetHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(periodSummary);
  });

  test("calls the typed uk-property path with nino, businessId, taxYear and submissionId", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildHmrcEvent({
      queryStringParameters: {
        nino: VALID_NINO,
        businessId: VALID_BUSINESS_ID,
        taxYear: VALID_TAX_YEAR,
        submissionId: VALID_SUBMISSION_ID,
      },
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaUkPropertyPeriodGetHandler(event);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain(
      `/individuals/business/property/uk/${VALID_NINO}/${VALID_BUSINESS_ID}/period/${VALID_TAX_YEAR}/${VALID_SUBMISSION_ID}`,
    );
  });

  test("publishes the itsa-uk-property-period-queried event with the hashed sub, never the raw sub", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildHmrcEvent({
      queryStringParameters: {
        nino: VALID_NINO,
        businessId: VALID_BUSINESS_ID,
        taxYear: VALID_TAX_YEAR,
        submissionId: VALID_SUBMISSION_ID,
      },
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaUkPropertyPeriodGetHandler(event);

    const queriedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "itsa-uk-property-period-queried";
    });
    expect(queriedCalls).toHaveLength(1);
    const rawDetail = queriedCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"test-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });

  test("returns 400 when HMRC's default not-found answer comes back with no Gov-Test-Scenario", async () => {
    mockHmrcError(mockFetch, 404, { code: "MATCHING_RESOURCE_NOT_FOUND" });

    const event = buildHmrcEvent({
      queryStringParameters: {
        nino: VALID_NINO,
        businessId: VALID_BUSINESS_ID,
        taxYear: VALID_TAX_YEAR,
        submissionId: VALID_SUBMISSION_ID,
      },
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodGetHandler(event);
    // Every HMRC "not found" maps to a client-fixable 400, the way every other read handler
    // in this repo treats it (see http404NotFoundFromHmrcResponse).
    expect(response.statusCode).toBe(400);
  });
});
