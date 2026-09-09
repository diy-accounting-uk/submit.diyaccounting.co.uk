// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/hmrcItsaSelfEmploymentAnnualPut.test.js
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
    constructor(_config) {
      // no-op in unit tests
    }
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

import {
  ingestHandler as hmrcItsaSelfEmploymentAnnualPutHandler,
  buildAnnualSubmissionRequestBody,
} from "@app/functions/hmrc/hmrcItsaSelfEmploymentAnnualPut.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678901";
const VALID_TAX_YEAR = "2023-24";

function buildAnnualBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    taxYear: VALID_TAX_YEAR,
    adjustments: { includedNonTaxableProfits: 200 },
    ...overrides,
  };
}

function buildAnnualEvent({ body = {}, headers = {} } = {}) {
  return buildHmrcEvent({
    body: buildAnnualBody(body),
    headers: { authorization: "Bearer test-token", ...headers },
  });
}

describe("buildAnnualSubmissionRequestBody", () => {
  test("omits empty adjustments/allowances/nonFinancials sections entirely", () => {
    const body = buildAnnualSubmissionRequestBody({
      adjustments: {},
      allowances: { annualInvestmentAllowance: 500 },
      nonFinancials: {},
    });
    expect(body).toEqual({ allowances: { annualInvestmentAllowance: 500 } });
  });

  test("rounds money values to 2 decimal places", () => {
    const body = buildAnnualSubmissionRequestBody({ adjustments: { includedNonTaxableProfits: 100.005 } });
    expect(body.adjustments.includedNonTaxableProfits).toBe(100.01);
  });

  test("accepts the itemised allowance form", () => {
    const body = buildAnnualSubmissionRequestBody({
      allowances: { annualInvestmentAllowance: 500, capitalAllowanceMainPool: 100 },
    });
    expect(body).toEqual({ allowances: { annualInvestmentAllowance: 500, capitalAllowanceMainPool: 100 } });
  });

  test("accepts the trading income allowance form on its own", () => {
    const body = buildAnnualSubmissionRequestBody({ allowances: { tradingIncomeAllowance: 200 } });
    expect(body).toEqual({ allowances: { tradingIncomeAllowance: 200 } });
  });

  test("accepts a structured building allowance array alongside the itemised allowances", () => {
    const structuredBuildingAllowance = [
      { amount: 100, building: { postcode: "SW1A 2AA" } },
    ];
    const body = buildAnnualSubmissionRequestBody({
      allowances: { annualInvestmentAllowance: 500, structuredBuildingAllowance },
    });
    expect(body.allowances.structuredBuildingAllowance).toEqual(structuredBuildingAllowance);
  });

  test("rejects tradingIncomeAllowance together with an itemised allowance", () => {
    expect(() =>
      buildAnnualSubmissionRequestBody({
        allowances: { tradingIncomeAllowance: 200, annualInvestmentAllowance: 500 },
      }),
    ).toThrow(/Both allowances and trading allowances/);
  });

  test("rejects tradingIncomeAllowance together with a structured building allowance", () => {
    expect(() =>
      buildAnnualSubmissionRequestBody({
        allowances: {
          tradingIncomeAllowance: 200,
          structuredBuildingAllowance: [{ amount: 100, building: { postcode: "SW1A 2AA" } }],
        },
      }),
    ).toThrow(/Both allowances and trading allowances/);
  });

  test("rejects an entirely empty body", () => {
    expect(() => buildAnnualSubmissionRequestBody({})).toThrow(/An empty or non-matching body/);
  });

  test("rejects a body whose only sections are empty", () => {
    expect(() => buildAnnualSubmissionRequestBody({ adjustments: {}, allowances: {}, nonFinancials: {} })).toThrow(
      /An empty or non-matching body/,
    );
  });
});

let mockFetch;

describe("hmrcItsaSelfEmploymentAnnualPut ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
    vi.resetAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [], Count: 0 };
      }
      if (cmd instanceof lib.PutCommand) {
        return {};
      }
      if (cmd instanceof lib.DeleteCommand) {
        return {};
      }
      if (cmd instanceof lib.GetCommand) {
        return { Item: null };
      }
      return {};
    });
  });

  test("returns 400 when taxYear is missing from body", async () => {
    const event = buildAnnualEvent({ body: { taxYear: undefined } });
    const response = await hmrcItsaSelfEmploymentAnnualPutHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("taxYear");
  });

  test("returns 400 for invalid businessId format", async () => {
    const event = buildAnnualEvent({ body: { businessId: "not-a-business-id" } });
    const response = await hmrcItsaSelfEmploymentAnnualPutHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 for an entirely empty body without ever calling HMRC", async () => {
    const event = buildAnnualEvent({ body: { adjustments: undefined } });
    const response = await hmrcItsaSelfEmploymentAnnualPutHandler(event);
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 400 when both allowance forms are supplied, without ever calling HMRC", async () => {
    const event = buildAnnualEvent({
      body: { allowances: { tradingIncomeAllowance: 200, annualInvestmentAllowance: 500 } },
    });
    const response = await hmrcItsaSelfEmploymentAnnualPutHandler(event);
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 200 on success", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildAnnualEvent();
    const response = await hmrcItsaSelfEmploymentAnnualPutHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("calls HMRC with PUT and the correct endpoint path", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildAnnualEvent();
    await hmrcItsaSelfEmploymentAnnualPutHandler(event);

    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[0][0];
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.method).toBe("PUT");
    expect(calledUrl).toContain(`/individuals/business/self-employment/${VALID_NINO}/${VALID_BUSINESS_ID}/annual/${VALID_TAX_YEAR}`);
  });

  test("publishes the itsa-annual-submission-filed event with the hashed sub, never the raw sub", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildAnnualEvent();
    await hmrcItsaSelfEmploymentAnnualPutHandler(event);

    const filedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "itsa-annual-submission-filed";
    });
    expect(filedCalls).toHaveLength(1);
    const rawDetail = filedCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"test-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });

  test("returns 400 when HMRC answers with a 400", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_TAX_YEAR_NOT_SUPPORTED" });

    const event = buildAnnualEvent();
    const response = await hmrcItsaSelfEmploymentAnnualPutHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to ITSA self-employment", async () => {
    const event = buildAnnualEvent();
    event.requestContext.http.path = "/api/v1/hmrc/itsa/self-employment/annual";
    const response = await hmrcItsaSelfEmploymentAnnualPutHandler(event);
    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 202 when x-wait-time-ms=0 (async initiation)", async () => {
    const event = buildAnnualEvent({ headers: { "x-wait-time-ms": "0", "x-initial-request": "true" } });
    const response = await hmrcItsaSelfEmploymentAnnualPutHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("returns 200 when processing completes synchronously (large x-wait-time-ms)", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildAnnualEvent({ headers: { "x-wait-time-ms": "30000", "x-initial-request": "true" } });
    const response = await hmrcItsaSelfEmploymentAnnualPutHandler(event);
    expect(response.statusCode).toBe(200);
  });
});

import { workerHandler as hmrcItsaSelfEmploymentAnnualPutWorker } from "@app/functions/hmrc/hmrcItsaSelfEmploymentAnnualPut.js";

describe("hmrcItsaSelfEmploymentAnnualPut worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("successfully processes SQS message and marks as completed", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = {
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              nino: VALID_NINO,
              businessId: VALID_BUSINESS_ID,
              taxYear: VALID_TAX_YEAR,
              adjustments: { includedNonTaxableProfits: 200 },
              allowances: {},
              nonFinancials: {},
              hmrcAccessToken: "token",
              govClientHeaders: {},
              hmrcAccount: "live",
              userSub: "user-123",
            },
          }),
          messageId: "msg-789",
        },
      ],
    };

    await hmrcItsaSelfEmploymentAnnualPutWorker(event);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const updateCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.UpdateCommand);
    expect(updateCalls.length).toBeGreaterThan(0);
    const completedCall = updateCalls.find((call) => call[0].input.ExpressionAttributeValues[":status"] === "completed");
    expect(completedCall).toBeDefined();
  });
});
