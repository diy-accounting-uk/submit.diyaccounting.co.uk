// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaUkPropertyPeriodPost.test.js
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

import {
  ingestHandler as hmrcItsaUkPropertyPeriodPostHandler,
  buildUkPropertyPeriodRequestBody,
  buildUkPropertyCumulativeRequestBody,
} from "@app/functions/hmrc/hmrcItsaUkPropertyPeriodPost.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("buildUkPropertyPeriodRequestBody", () => {
  test("includes fromDate, toDate and both property types when populated", () => {
    const body = buildUkPropertyPeriodRequestBody({
      fromDate: "2024-04-06",
      toDate: "2024-07-05",
      ukFhlProperty: {
        income: { periodAmount: 1000, otherIncome: 0 },
        expenses: { repairsAndMaintenance: 100 },
      },
      ukNonFhlProperty: {
        income: { periodAmount: 500, rentARoom: { rentsReceived: 200 } },
        expenses: { consolidatedExpenses: 50 },
      },
    });
    expect(body).toEqual({
      fromDate: "2024-04-06",
      toDate: "2024-07-05",
      ukFhlProperty: {
        income: { periodAmount: 1000, otherIncome: 0 },
        expenses: { repairsAndMaintenance: 100 },
      },
      ukNonFhlProperty: {
        income: { periodAmount: 500, rentARoom: { rentsReceived: 200 } },
        expenses: { consolidatedExpenses: 50 },
      },
    });
  });

  test("omits a property type entirely when the caller entered nothing for it", () => {
    const body = buildUkPropertyPeriodRequestBody({
      fromDate: "2024-04-06",
      toDate: "2024-07-05",
      ukFhlProperty: { income: {}, expenses: {} },
      ukNonFhlProperty: { income: { periodAmount: 500 } },
    });
    expect(body).not.toHaveProperty("ukFhlProperty");
    expect(body.ukNonFhlProperty).toEqual({ income: { periodAmount: 500 } });
  });

  test("nests rentARoom under income and expenses only when the caller entered it", () => {
    const body = buildUkPropertyPeriodRequestBody({
      fromDate: "2024-04-06",
      toDate: "2024-07-05",
      ukNonFhlProperty: {
        income: { periodAmount: 100, rentARoom: { rentsReceived: 40 } },
        expenses: { repairsAndMaintenance: 20, rentARoom: { amountClaimed: 10 } },
      },
    });
    expect(body.ukNonFhlProperty.income.rentARoom).toEqual({ rentsReceived: 40 });
    expect(body.ukNonFhlProperty.expenses.rentARoom).toEqual({ amountClaimed: 10 });
  });

  test("sends amounts as numbers rounded to 2 decimal places, never as strings", () => {
    const body = buildUkPropertyPeriodRequestBody({
      fromDate: "2024-04-06",
      toDate: "2024-07-05",
      ukNonFhlProperty: { income: { periodAmount: "1000.005" } },
    });
    expect(typeof body.ukNonFhlProperty.income.periodAmount).toBe("number");
    expect(body.ukNonFhlProperty.income.periodAmount).toBe(1000.01);
  });

  test("returns just fromDate and toDate when neither property type carries anything", () => {
    const body = buildUkPropertyPeriodRequestBody({ fromDate: "2024-04-06", toDate: "2024-07-05" });
    expect(body).toEqual({ fromDate: "2024-04-06", toDate: "2024-07-05" });
  });
});

describe("buildUkPropertyCumulativeRequestBody", () => {
  test("wraps income and expenses in ukProperty, at the top level dates sit alongside it", () => {
    const body = buildUkPropertyCumulativeRequestBody({
      fromDate: "2025-04-06",
      toDate: "2025-07-05",
      income: { periodAmount: 1000, otherIncome: 0 },
      expenses: { repairsAndMaintenance: 100 },
    });
    expect(body).toEqual({
      fromDate: "2025-04-06",
      toDate: "2025-07-05",
      ukProperty: {
        income: { periodAmount: 1000, otherIncome: 0 },
        expenses: { repairsAndMaintenance: 100 },
      },
    });
  });

  test("omits fromDate/toDate entirely when neither is supplied", () => {
    const body = buildUkPropertyCumulativeRequestBody({ income: { periodAmount: 1000 } });
    expect(body).not.toHaveProperty("fromDate");
    expect(body).not.toHaveProperty("toDate");
  });

  test("a zero the caller entered survives, a field never answered is omitted", () => {
    const body = buildUkPropertyCumulativeRequestBody({ income: { periodAmount: 0 }, expenses: {} });
    expect(body.ukProperty.income).toEqual({ periodAmount: 0 });
    expect(body.ukProperty).not.toHaveProperty("expenses");
  });

  test("nests rentARoom under income and expenses only when the caller entered it", () => {
    const body = buildUkPropertyCumulativeRequestBody({
      income: { periodAmount: 100, rentARoom: { rentsReceived: 40 } },
      expenses: { repairsAndMaintenance: 20, rentARoom: { amountClaimed: 10 } },
    });
    expect(body.ukProperty.income.rentARoom).toEqual({ rentsReceived: 40 });
    expect(body.ukProperty.expenses.rentARoom).toEqual({ amountClaimed: 10 });
  });
});

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678910";
const VALID_TAX_YEAR = "2023-24";

function buildPeriodBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    taxYear: VALID_TAX_YEAR,
    fromDate: "2024-04-06",
    toDate: "2024-07-05",
    ukNonFhlProperty: { income: { periodAmount: 1000 }, expenses: { repairsAndMaintenance: 100 } },
    ...overrides,
  };
}

let mockFetch;

describe("hmrcItsaUkPropertyPeriodPost ingestHandler", () => {
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

  test("returns 400 when nino is missing", async () => {
    const event = buildHmrcEvent({
      body: buildPeriodBody({ nino: undefined }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("nino");
  });

  test("returns 400 when businessId is missing", async () => {
    const event = buildHmrcEvent({
      body: buildPeriodBody({ businessId: undefined }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 when taxYear is missing or malformed", async () => {
    const missing = buildHmrcEvent({
      body: buildPeriodBody({ taxYear: undefined }),
      headers: { authorization: "Bearer test-token" },
    });
    expect((await hmrcItsaUkPropertyPeriodPostHandler(missing)).statusCode).toBe(400);

    const malformed = buildHmrcEvent({
      body: buildPeriodBody({ taxYear: "not-a-year" }),
      headers: { authorization: "Bearer test-token" },
    });
    expect((await hmrcItsaUkPropertyPeriodPostHandler(malformed)).statusCode).toBe(400);
  });

  test("returns 400 when fromDate or toDate are missing or malformed", async () => {
    const missingFrom = buildHmrcEvent({
      body: buildPeriodBody({ fromDate: undefined }),
      headers: { authorization: "Bearer test-token" },
    });
    expect((await hmrcItsaUkPropertyPeriodPostHandler(missingFrom)).statusCode).toBe(400);

    const badTo = buildHmrcEvent({
      body: buildPeriodBody({ toDate: "not-a-date" }),
      headers: { authorization: "Bearer test-token" },
    });
    expect((await hmrcItsaUkPropertyPeriodPostHandler(badTo)).statusCode).toBe(400);
  });

  test("returns 200 with the model and the submissionId on success", async () => {
    mockHmrcSuccess(mockFetch, { submissionId: "4557ecb5-fd32-48cc-81f5-e6acd1099f3c" });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodPostHandler(event);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ model: "dated", submissionId: "4557ecb5-fd32-48cc-81f5-e6acd1099f3c" });
  });

  test("calls HMRC with the v6.0 Accept header at the typed uk-property path with taxYear", async () => {
    mockHmrcSuccess(mockFetch, { submissionId: "s-1" });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaUkPropertyPeriodPostHandler(event);

    expect(mockFetch).toHaveBeenCalled();
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.headers.Accept).toBe("application/vnd.hmrc.6.0+json");
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain(`/individuals/business/property/uk/${VALID_NINO}/${VALID_BUSINESS_ID}/period/${VALID_TAX_YEAR}`);
  });

  test("publishes the itsa-uk-property-period-created event with the hashed sub, never the raw sub", async () => {
    mockHmrcSuccess(mockFetch, { submissionId: "s-1" });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaUkPropertyPeriodPostHandler(event);

    const filedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "itsa-uk-property-period-created";
    });
    expect(filedCalls).toHaveLength(1);
    const rawDetail = filedCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"test-sub"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });

  test("returns a client error when HMRC rejects the period summary", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_OVERLAPPING", message: "The submission overlaps another period" });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodPostHandler(event);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(mockFetch).toHaveBeenCalled();
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to file a quarterly update", async () => {
    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/itsa/uk-property/period";
    const response = await hmrcItsaUkPropertyPeriodPostHandler(event);
    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 202 when x-wait-time-ms=0 (async initiation)", async () => {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-itsa", tokensGranted: 100, tokensConsumed: 0 }], Count: 1 };
      }
      if (cmd instanceof lib.UpdateCommand) {
        return { Attributes: { bundleId: "resident-itsa", tokensGranted: 100, tokensConsumed: 1 } };
      }
      return {};
    });

    const event = buildHmrcEvent({
      body: buildPeriodBody(),
      headers: {
        "authorization": "Bearer test-token",
        "x-wait-time-ms": "0",
        "x-initial-request": "true",
      },
    });
    const response = await hmrcItsaUkPropertyPeriodPostHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });
});

const VALID_CUMULATIVE_TAX_YEAR = "2025-26";

describe("hmrcItsaUkPropertyPeriodPost ingestHandler - cumulative tax year", () => {
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
      return {};
    });
  });

  test("calls HMRC with PUT on the cumulative endpoint and answers 200 with the model, no submissionId", async () => {
    mockHmrcSuccess(mockFetch, undefined);

    const event = buildHmrcEvent({
      body: buildPeriodBody({
        taxYear: VALID_CUMULATIVE_TAX_YEAR,
        fromDate: undefined,
        toDate: undefined,
        ukNonFhlProperty: undefined,
        income: { periodAmount: 0 },
        expenses: { repairsAndMaintenance: 100 },
      }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodPostHandler(event);

    expect(mockFetch).toHaveBeenCalled();
    const calledUrl = mockFetch.mock.calls[0][0];
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.method).toBe("PUT");
    expect(calledUrl).toContain(`/individuals/business/property/uk/${VALID_NINO}/${VALID_BUSINESS_ID}/cumulative/${VALID_CUMULATIVE_TAX_YEAR}`);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ model: "cumulative" });
  });

  test("a zero the caller entered survives into the body, a field never answered is omitted", async () => {
    mockHmrcSuccess(mockFetch, undefined);

    const event = buildHmrcEvent({
      body: buildPeriodBody({
        taxYear: VALID_CUMULATIVE_TAX_YEAR,
        fromDate: undefined,
        toDate: undefined,
        ukNonFhlProperty: undefined,
        income: { periodAmount: 0 },
        expenses: {},
      }),
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaUkPropertyPeriodPostHandler(event);

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.ukProperty.income).toEqual({ periodAmount: 0 });
    expect(sentBody.ukProperty).not.toHaveProperty("expenses");
    expect(sentBody).not.toHaveProperty("fromDate");
  });

  test("rejects a fromDate sent without a toDate", async () => {
    const event = buildHmrcEvent({
      body: buildPeriodBody({
        taxYear: VALID_CUMULATIVE_TAX_YEAR,
        toDate: undefined,
        ukNonFhlProperty: undefined,
        income: { periodAmount: 500 },
      }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyPeriodPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("fromDate and toDate must both be present or both be absent");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

import { workerHandler as hmrcItsaUkPropertyPeriodPostWorker } from "@app/functions/hmrc/hmrcItsaUkPropertyPeriodPost.js";

describe("hmrcItsaUkPropertyPeriodPost worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("successfully processes SQS message and marks as completed", async () => {
    mockHmrcSuccess(mockFetch, { submissionId: "s-1" });

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
              fromDate: "2024-04-06",
              toDate: "2024-07-05",
              ukNonFhlProperty: { income: { periodAmount: 1000 } },
              ukFhlProperty: {},
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

    await hmrcItsaUkPropertyPeriodPostWorker(event);

    const lib = await import("@aws-sdk/lib-dynamodb");
    const updateCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.UpdateCommand);
    expect(updateCalls.length).toBeGreaterThan(0);
    const completedCall = updateCalls.find((call) => call[0].input.ExpressionAttributeValues[":status"] === "completed");
    expect(completedCall).toBeDefined();
    expect(completedCall[0].input.ExpressionAttributeValues[":data"].periodSummary).toEqual({ model: "dated", submissionId: "s-1" });
  });
});
