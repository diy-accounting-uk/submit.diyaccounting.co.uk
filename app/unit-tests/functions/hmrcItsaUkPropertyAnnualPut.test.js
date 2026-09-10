// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaUkPropertyAnnualPut.test.js
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
  ingestHandler as hmrcItsaUkPropertyAnnualPutHandler,
  buildUkPropertyAnnualRequestBody,
  UkPropertyAnnualSubmissionValidationError,
} from "@app/functions/hmrc/hmrcItsaUkPropertyAnnualPut.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("buildUkPropertyAnnualRequestBody", () => {
  test("wraps adjustments and allowances in ukProperty", () => {
    const body = buildUkPropertyAnnualRequestBody({
      adjustments: { balancingCharge: 100 },
      allowances: { annualInvestmentAllowance: 200 },
    });
    expect(body).toEqual({
      ukProperty: {
        adjustments: { balancingCharge: 100 },
        allowances: { annualInvestmentAllowance: 200 },
      },
    });
  });

  test("keeps a false nonResidentLandlord in the body, and drops it when unanswered", () => {
    const answered = buildUkPropertyAnnualRequestBody({ adjustments: { nonResidentLandlord: false } });
    expect(answered.ukProperty.adjustments).toEqual({ nonResidentLandlord: false });

    expect(() => buildUkPropertyAnnualRequestBody({ adjustments: {} })).toThrow(UkPropertyAnnualSubmissionValidationError);
  });

  test("keeps a false rentARoom.jointlyLet nested under adjustments", () => {
    const body = buildUkPropertyAnnualRequestBody({
      adjustments: { balancingCharge: 10, rentARoom: { jointlyLet: false } },
    });
    expect(body.ukProperty.adjustments.rentARoom).toEqual({ jointlyLet: false });
  });

  test("drops an unanswered rentARoom.jointlyLet", () => {
    const body = buildUkPropertyAnnualRequestBody({
      adjustments: { balancingCharge: 10, rentARoom: {} },
    });
    expect(body.ukProperty.adjustments).not.toHaveProperty("rentARoom");
  });

  test("accepts propertyIncomeAllowance on its own", () => {
    const body = buildUkPropertyAnnualRequestBody({ allowances: { propertyIncomeAllowance: 1000 } });
    expect(body.ukProperty.allowances).toEqual({ propertyIncomeAllowance: 1000 });
  });

  test("accepts the itemised allowances including structured building allowance arrays", () => {
    const structuredBuildingAllowance = [
      {
        amount: 100,
        firstYear: { qualifyingDate: "2020-01-01", qualifyingAmountExpenditure: 500 },
        building: { name: "Unit 1", number: "1", postcode: "AB1 2CD" },
      },
    ];
    const body = buildUkPropertyAnnualRequestBody({
      allowances: { annualInvestmentAllowance: 200, structuredBuildingAllowance },
    });
    expect(body.ukProperty.allowances).toEqual({ annualInvestmentAllowance: 200, structuredBuildingAllowance });
  });

  test("rejects propertyIncomeAllowance alongside the itemised allowances", () => {
    expect(() =>
      buildUkPropertyAnnualRequestBody({
        allowances: { propertyIncomeAllowance: 1000, annualInvestmentAllowance: 200 },
      }),
    ).toThrow(/RULE_BOTH_ALLOWANCES_SUPPLIED|Both allowances/);
  });

  test("rejects propertyIncomeAllowance alongside a privateUseAdjustment", () => {
    expect(() =>
      buildUkPropertyAnnualRequestBody({
        adjustments: { privateUseAdjustment: 50 },
        allowances: { propertyIncomeAllowance: 1000 },
      }),
    ).toThrow(/private use adjustment/);
  });

  test("rejects an entirely empty body", () => {
    expect(() => buildUkPropertyAnnualRequestBody({})).toThrow(/empty or non-matching body/);
  });

  test("sends amounts as numbers rounded to 2 decimal places", () => {
    const body = buildUkPropertyAnnualRequestBody({ adjustments: { balancingCharge: "100.005" } });
    expect(body.ukProperty.adjustments.balancingCharge).toBe(100.01);
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
    adjustments: { balancingCharge: 100 },
    ...overrides,
  };
}

let mockFetch;

describe("hmrcItsaUkPropertyAnnualPut ingestHandler", () => {
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

  test("returns 400 for an empty body", async () => {
    const event = buildHmrcEvent({
      body: buildAnnualBody({ adjustments: undefined }),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyAnnualPutHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("calls the typed uk-property annual path with the v6.0 Accept header", async () => {
    mockHmrcSuccess(mockFetch, {});

    const event = buildHmrcEvent({
      body: buildAnnualBody(),
      headers: { authorization: "Bearer test-token" },
    });
    await hmrcItsaUkPropertyAnnualPutHandler(event);

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain(`/individuals/business/property/uk/${VALID_NINO}/${VALID_BUSINESS_ID}/annual/${VALID_TAX_YEAR}`);
    const calledInit = mockFetch.mock.calls[0][1];
    expect(calledInit.headers.Accept).toBe("application/vnd.hmrc.6.0+json");
  });

  test("returns 200 on success", async () => {
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-itsa", tokensGranted: 100, tokensConsumed: 0 }], Count: 1 };
      }
      return {};
    });
    mockHmrcSuccess(mockFetch, {});

    const event = buildHmrcEvent({
      body: buildAnnualBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyAnnualPutHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns a client error when HMRC rejects the submission", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_PROPERTY_INCOME_ALLOWANCE", message: "Not allowed together" });

    const event = buildHmrcEvent({
      body: buildAnnualBody(),
      headers: { authorization: "Bearer test-token" },
    });
    const response = await hmrcItsaUkPropertyAnnualPutHandler(event);
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to file the annual submission", async () => {
    const event = buildHmrcEvent({
      body: buildAnnualBody(),
      headers: { authorization: "Bearer test-token" },
    });
    event.requestContext.http.path = "/api/v1/hmrc/itsa/uk-property/annual";
    const response = await hmrcItsaUkPropertyAnnualPutHandler(event);
    expect(response.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
