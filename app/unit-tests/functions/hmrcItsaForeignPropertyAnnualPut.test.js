// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaForeignPropertyAnnualPut.test.js
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
  ingestHandler as hmrcItsaForeignPropertyAnnualPutHandler,
  buildForeignPropertyAnnualRequestBody,
  findForeignPropertyAnnualBodyErrors,
} from "@app/functions/hmrc/hmrcItsaForeignPropertyAnnualPut.js";
import { ForeignPropertyValidationError } from "@app/lib/foreignPropertyBody.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const SBA_ROW = {
  amount: 100,
  firstYear: { qualifyingDate: "2020-01-01", qualifyingAmountExpenditure: 500 },
  building: { name: "Unit 1", number: "1", postcode: "AB1 2CD" },
};

describe("buildForeignPropertyAnnualRequestBody", () => {
  test("2024-25 sends foreignFhlEea beside the countries, each keyed by countryCode", () => {
    const body = buildForeignPropertyAnnualRequestBody("2024-25", {
      foreignFhlEea: {
        adjustments: { balancingCharge: 10, periodOfGraceAdjustment: false },
        allowances: { annualInvestmentAllowance: 20 },
      },
      foreignProperty: [
        { countryCode: "FRA", adjustments: { balancingCharge: 100 }, allowances: { annualInvestmentAllowance: 200 } },
        { countryCode: "ESP", allowances: { propertyIncomeAllowance: 1000 } },
      ],
    });
    expect(body).toEqual({
      foreignFhlEea: {
        adjustments: { balancingCharge: 10, periodOfGraceAdjustment: false },
        allowances: { annualInvestmentAllowance: 20 },
      },
      foreignProperty: [
        { countryCode: "FRA", adjustments: { balancingCharge: 100 }, allowances: { annualInvestmentAllowance: 200 } },
        { countryCode: "ESP", allowances: { propertyIncomeAllowance: 1000 } },
      ],
    });
  });

  test("2024-25 accepts the two allowances only that year takes", () => {
    const body = buildForeignPropertyAnnualRequestBody("2024-25", {
      foreignProperty: [{ countryCode: "FRA", allowances: { zeroEmissionsGoodsVehicleAllowance: 5, electricChargePointAllowance: 6 } }],
    });
    expect(body.foreignProperty[0].allowances).toEqual({ zeroEmissionsGoodsVehicleAllowance: 5, electricChargePointAllowance: 6 });
  });

  test("2024-25 accepts a body of foreignFhlEea alone", () => {
    const body = buildForeignPropertyAnnualRequestBody("2024-25", { foreignFhlEea: { adjustments: { balancingCharge: 10 } } });
    expect(body).toEqual({ foreignFhlEea: { adjustments: { balancingCharge: 10 } } });
  });

  test("2025-26 keys each entry by countryCode and refuses foreignFhlEea", () => {
    const body = buildForeignPropertyAnnualRequestBody("2025-26", {
      foreignProperty: [{ countryCode: "FRA", allowances: { costOfReplacingDomesticItems: 30 } }],
    });
    expect(body).toEqual({ foreignProperty: [{ countryCode: "FRA", allowances: { costOfReplacingDomesticItems: 30 } }] });
    expect(() =>
      buildForeignPropertyAnnualRequestBody("2025-26", {
        foreignFhlEea: { adjustments: { balancingCharge: 10 } },
        foreignProperty: [{ countryCode: "FRA", adjustments: { balancingCharge: 1 } }],
      }),
    ).toThrow(/foreignFhlEea is only available up to tax year 2024-25/);
  });

  test.each(["zeroEmissionsGoodsVehicleAllowance", "electricChargePointAllowance"])("2025-26 refuses %s", (name) => {
    expect(() =>
      buildForeignPropertyAnnualRequestBody("2025-26", { foreignProperty: [{ countryCode: "FRA", allowances: { [name]: 5 } }] }),
    ).toThrow(new RegExp(`${name} is only available up to tax year 2024-25`));
  });

  test("2026-27 keys each entry by propertyId and refuses countryCode", () => {
    const body = buildForeignPropertyAnnualRequestBody("2026-27", {
      foreignProperty: [{ propertyId: "8e8b8450-dc1b-4360-8109-7067337b42cb", adjustments: { privateUseAdjustment: 12.345 } }],
    });
    expect(body).toEqual({
      foreignProperty: [{ propertyId: "8e8b8450-dc1b-4360-8109-7067337b42cb", adjustments: { privateUseAdjustment: 12.35 } }],
    });
    expect(() =>
      buildForeignPropertyAnnualRequestBody("2026-27", { foreignProperty: [{ countryCode: "FRA", adjustments: { balancingCharge: 1 } }] }),
    ).toThrow(/identifies an entry by propertyId/);
  });

  test("2026-27 refuses an allowance only 2024-25 takes", () => {
    expect(() =>
      buildForeignPropertyAnnualRequestBody("2026-27", {
        foreignProperty: [{ propertyId: "p1", allowances: { electricChargePointAllowance: 5 } }],
      }),
    ).toThrow(/electricChargePointAllowance is only available up to tax year 2024-25/);
  });

  test.each(["2024-25", "2025-26", "2026-27"])("%s passes Structures and Buildings Allowance rows through per entry", (taxYear) => {
    const key = taxYear === "2026-27" ? { propertyId: "p1" } : { countryCode: "FRA" };
    const other = taxYear === "2026-27" ? { propertyId: "p2" } : { countryCode: "ESP" };
    const body = buildForeignPropertyAnnualRequestBody(taxYear, {
      foreignProperty: [
        { ...key, allowances: { structuredBuildingAllowance: [SBA_ROW, { ...SBA_ROW, amount: 7.005 }] } },
        { ...other, allowances: { structuredBuildingAllowance: [SBA_ROW] } },
      ],
    });
    expect(body.foreignProperty[0].allowances.structuredBuildingAllowance).toEqual([SBA_ROW, { ...SBA_ROW, amount: 7.01 }]);
    expect(body.foreignProperty[1].allowances.structuredBuildingAllowance).toEqual([SBA_ROW]);
  });

  test("leaves out an entry with no figures and an empty section", () => {
    const body = buildForeignPropertyAnnualRequestBody("2025-26", {
      foreignProperty: [
        { countryCode: "FRA", adjustments: {}, allowances: { annualInvestmentAllowance: "" } },
        { countryCode: "ESP", adjustments: { balancingCharge: 5 }, allowances: {} },
      ],
    });
    expect(body).toEqual({ foreignProperty: [{ countryCode: "ESP", adjustments: { balancingCharge: 5 } }] });
  });

  test("refuses a repeated country before HMRC", () => {
    expect(() =>
      buildForeignPropertyAnnualRequestBody("2025-26", {
        foreignProperty: [
          { countryCode: "FRA", adjustments: { balancingCharge: 1 } },
          { countryCode: "FRA", adjustments: { balancingCharge: 2 } },
        ],
      }),
    ).toThrow(/appears in more than one entry/);
  });

  test("refuses propertyIncomeAllowance beside the itemised allowances in one entry", () => {
    expect(() =>
      buildForeignPropertyAnnualRequestBody("2025-26", {
        foreignProperty: [{ countryCode: "FRA", allowances: { propertyIncomeAllowance: 1000, annualInvestmentAllowance: 200 } }],
      }),
    ).toThrow(/Both allowances and property income allowance/);
    expect(() =>
      buildForeignPropertyAnnualRequestBody("2025-26", {
        foreignProperty: [{ countryCode: "FRA", allowances: { propertyIncomeAllowance: 1000, structuredBuildingAllowance: [SBA_ROW] } }],
      }),
    ).toThrow(/Both allowances and property income allowance/);
  });

  test("allows propertyIncomeAllowance in one entry and itemised allowances in another", () => {
    const body = buildForeignPropertyAnnualRequestBody("2025-26", {
      foreignProperty: [
        { countryCode: "FRA", allowances: { propertyIncomeAllowance: 1000 } },
        { countryCode: "ESP", allowances: { annualInvestmentAllowance: 200 } },
      ],
    });
    expect(body.foreignProperty).toHaveLength(2);
  });

  test("refuses propertyIncomeAllowance beside a privateUseAdjustment", () => {
    expect(() =>
      buildForeignPropertyAnnualRequestBody("2025-26", {
        foreignProperty: [{ countryCode: "FRA", adjustments: { privateUseAdjustment: 50 }, allowances: { propertyIncomeAllowance: 1000 } }],
      }),
    ).toThrow(/private use adjustment/);
  });

  test("refuses propertyIncomeAllowance beside the other allowances in foreignFhlEea", () => {
    expect(() =>
      buildForeignPropertyAnnualRequestBody("2024-25", {
        foreignFhlEea: { allowances: { propertyIncomeAllowance: 1000, annualInvestmentAllowance: 5 } },
      }),
    ).toThrow(/Both allowances and property income allowance/);
  });

  test("refuses an empty body", () => {
    expect(() => buildForeignPropertyAnnualRequestBody("2025-26", {})).toThrow(/empty or non-matching body/);
    expect(() => buildForeignPropertyAnnualRequestBody("2025-26", { foreignProperty: [{ countryCode: "FRA" }] })).toThrow(
      ForeignPropertyValidationError,
    );
  });
});

describe("findForeignPropertyAnnualBodyErrors", () => {
  test("answers no messages for an acceptable body and one message for a refused body", () => {
    expect(
      findForeignPropertyAnnualBodyErrors("2025-26", { foreignProperty: [{ countryCode: "FRA", adjustments: { balancingCharge: 1 } }] }),
    ).toEqual([]);
    expect(findForeignPropertyAnnualBodyErrors("2025-26", {})).toHaveLength(1);
  });
});

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678910";
const VALID_TAX_YEAR = "2023-24";

function buildAnnualBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    taxYear: VALID_TAX_YEAR,
    foreignProperty: [{ countryCode: "FRA", adjustments: { balancingCharge: 100 } }],
    ...overrides,
  };
}

let mockFetch;

function hmrcCalls() {
  return mockFetch.mock.calls.filter((call) => String(call[0]).includes("/individuals/business/"));
}

describe("hmrcItsaForeignPropertyAnnualPut ingestHandler", () => {
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

  test("returns 400 for a body that carries an allowance the tax year does not take", async () => {
    const event = buildHmrcEvent({
      body: buildAnnualBody({
        taxYear: "2025-26",
        foreignProperty: [{ countryCode: "FRA", allowances: { electricChargePointAllowance: 5 } }],
      }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaForeignPropertyAnnualPutHandler(event);
    expect(response.statusCode).toBe(400);
    expect(hmrcCalls()).toHaveLength(0);
  });

  test("sends the 2026-27 body keyed by propertyId to the annual path and answers the model", async () => {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident", tokensGranted: 100, tokensConsumed: 0 }], Count: 1 };
      }
      return {};
    });
    mockHmrcSuccess(mockFetch, {});
    const event = buildHmrcEvent({
      body: buildAnnualBody({
        taxYear: "2026-27",
        foreignProperty: [{ propertyId: "p1", allowances: { annualInvestmentAllowance: 5.555 } }],
      }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaForeignPropertyAnnualPutHandler(event);
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response).model).toBe("cumulative");
    const [calledUrl, calledInit] = hmrcCalls()[0];
    expect(calledUrl).toContain(`/individuals/business/property/foreign/${VALID_NINO}/${VALID_BUSINESS_ID}/annual/2026-27`);
    expect(calledInit.method).toBe("PUT");
    expect(JSON.parse(calledInit.body)).toEqual({
      foreignProperty: [{ propertyId: "p1", allowances: { annualInvestmentAllowance: 5.56 } }],
    });
  });

  test("returns 400 for an empty body", async () => {
    const event = buildHmrcEvent({
      body: buildAnnualBody({ foreignProperty: undefined }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaForeignPropertyAnnualPutHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("calls the typed foreign-property annual path with the v6.0 Accept header", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildHmrcEvent({
      body: buildAnnualBody(),
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaForeignPropertyAnnualPutHandler(event);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain(`/individuals/business/property/foreign/${VALID_NINO}/${VALID_BUSINESS_ID}/annual/${VALID_TAX_YEAR}`);
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.headers.Accept).toBe("application/vnd.hmrc.6.0+json");
  });

  test.each([
    ["answers HMRC's correlation id from a 204 that carries the header", { "X-CorrelationId": "7a1c-0042" }, "7a1c-0042"],
    ["answers a null correlation id when HMRC sends no header", {}, null],
  ])("%s", async (_name, hmrcHeaders, expected) => {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident", tokensGranted: 100, tokensConsumed: 0 }], Count: 1 };
      }
      return {};
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers(hmrcHeaders),
      json: () => Promise.reject(new Error("no body")),
      text: () => Promise.resolve(""),
    });

    const event = buildHmrcEvent({
      body: buildAnnualBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaForeignPropertyAnnualPutHandler(event);
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response).correlationId).toBe(expected);
  });

  test("returns 200 on success", async () => {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident", tokensGranted: 100, tokensConsumed: 0 }], Count: 1 };
      }
      return {};
    });
    mockHmrcSuccess(mockFetch, {});

    const event = buildHmrcEvent({
      body: buildAnnualBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaForeignPropertyAnnualPutHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns a client error when HMRC rejects the submission", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_PROPERTY_INCOME_ALLOWANCE", message: "Not allowed together" });

    const event = buildHmrcEvent({
      body: buildAnnualBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaForeignPropertyAnnualPutHandler(event);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to file the annual submission", async () => {
    const event = buildHmrcEvent({
      body: buildAnnualBody(),
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/itsa/foreign-property/annual";
    const response = await hmrcItsaForeignPropertyAnnualPutHandler(event);
    expect(response.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

import { workerHandler as hmrcItsaForeignPropertyAnnualPutWorker } from "@app/functions/hmrc/hmrcItsaForeignPropertyAnnualPut.js";

describe("hmrcItsaForeignPropertyAnnualPut worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  function buildWorkerEvent() {
    return {
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              nino: "AB123456C",
              hmrcAccessToken: "token",
              govClientHeaders: {},
              hmrcAccount: "live",
              userSub: "user-123",
              businessId: "XAIS12345678901",
              taxYear: "2023-24",
              foreignProperty: [
                { countryCode: "FRA", adjustments: { balancingCharge: 100 }, allowances: { annualInvestmentAllowance: 200 } },
              ],
            },
          }),
          messageId: "msg-789",
        },
      ],
    };
  }

  async function asyncRequestWrites(status) {
    const lib = await import("@aws-sdk/lib-dynamodb");
    return mockSend.mock.calls.filter(
      (call) => call[0] instanceof lib.UpdateCommand && call[0].input.ExpressionAttributeValues[":status"] === status,
    );
  }

  test("successfully processes SQS message and marks as completed", async () => {
    mockHmrcSuccess(mockFetch, {});

    await hmrcItsaForeignPropertyAnnualPutWorker(buildWorkerEvent());

    const completed = await asyncRequestWrites("completed");
    expect(completed).toHaveLength(1);
    expect(completed[0][0].input.ExpressionAttributeValues[":data"].hmrcResponse.status).toBe(200);
  });

  test("records a terminal error in the async request and does not re-throw it", async () => {
    mockFetch.mockRejectedValueOnce(new Error("HMRC rejected the request"));

    await expect(hmrcItsaForeignPropertyAnnualPutWorker(buildWorkerEvent())).resolves.toBeUndefined();

    const failed = await asyncRequestWrites("failed");
    expect(failed).toHaveLength(1);
    expect(failed[0][0].input.ExpressionAttributeValues[":data"].message).toContain("HMRC rejected the request");
    expect(await asyncRequestWrites("completed")).toHaveLength(0);
  });

  test("re-throws a retryable error for SQS redelivery and writes no outcome", async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("connection reset"), { code: "ECONNRESET" }));

    await expect(hmrcItsaForeignPropertyAnnualPutWorker(buildWorkerEvent())).rejects.toThrow("connection reset");

    expect(await asyncRequestWrites("failed")).toHaveLength(0);
    expect(await asyncRequestWrites("completed")).toHaveLength(0);
  });
});
