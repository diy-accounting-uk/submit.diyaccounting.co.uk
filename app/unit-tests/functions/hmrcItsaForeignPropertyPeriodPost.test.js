// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaForeignPropertyPeriodPost.test.js
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
  ingestHandler as handler,
  workerHandler as worker,
  buildForeignPropertyPeriodRequestBody,
  buildForeignPropertyCumulativeRequestBody,
  findForeignPropertyPeriodBodyErrors,
} from "@app/functions/hmrc/hmrcItsaForeignPropertyPeriodPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678910";
const DATED_TAX_YEAR = "2024-25";
const COUNTRY_TAX_YEAR = "2025-26";
const PROPERTY_TAX_YEAR = "2026-27";

const FRANCE_ENTRY = {
  countryCode: "FRA",
  income: { rentIncome: { rentAmount: 1000 }, foreignTaxCreditRelief: false },
  expenses: { repairsAndMaintenance: 100 },
};
const SPAIN_ENTRY = {
  countryCode: "ESP",
  income: { rentIncome: { rentAmount: 500 }, foreignTaxCreditRelief: true },
  expenses: { consolidatedExpenses: 50 },
};

function datedBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    taxYear: DATED_TAX_YEAR,
    fromDate: "2024-04-06",
    toDate: "2024-07-05",
    foreignFhlEea: { income: { rentAmount: 300 }, expenses: { consolidatedExpenses: 30 } },
    foreignNonFhlProperty: [FRANCE_ENTRY, SPAIN_ENTRY],
    ...overrides,
  };
}

function cumulativeBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    taxYear: COUNTRY_TAX_YEAR,
    fromDate: "2025-04-06",
    toDate: "2025-07-05",
    foreignProperty: [FRANCE_ENTRY, SPAIN_ENTRY],
    ...overrides,
  };
}

function postEvent(body) {
  return buildHmrcEvent({ body, headers: { authorization: "Bearer test-token" } });
}

describe("buildForeignPropertyPeriodRequestBody", () => {
  test("carries the dates, the FHL in the EEA section and the country entries", () => {
    const body = buildForeignPropertyPeriodRequestBody(DATED_TAX_YEAR, datedBody());
    expect(body.fromDate).toBe("2024-04-06");
    expect(body.toDate).toBe("2024-07-05");
    expect(body.foreignFhlEea).toEqual({ income: { rentAmount: 300 }, expenses: { consolidatedExpenses: 30 } });
    expect(body.foreignNonFhlProperty.map((entry) => entry.countryCode)).toEqual(["FRA", "ESP"]);
  });

  test("leaves out an empty FHL section and an entry with no figures", () => {
    const body = buildForeignPropertyPeriodRequestBody(
      DATED_TAX_YEAR,
      datedBody({ foreignFhlEea: { income: {} }, foreignNonFhlProperty: [FRANCE_ENTRY, { countryCode: "ITA" }] }),
    );
    expect(body).not.toHaveProperty("foreignFhlEea");
    expect(body.foreignNonFhlProperty).toHaveLength(1);
  });

  test("rounds amounts to two places and keeps an answered zero and an answered false", () => {
    const body = buildForeignPropertyPeriodRequestBody(DATED_TAX_YEAR, {
      fromDate: "2024-04-06",
      toDate: "2024-07-05",
      foreignNonFhlProperty: [
        { countryCode: "FRA", income: { rentIncome: { rentAmount: 10.456 }, premiumsOfLeaseGrant: 0, foreignTaxCreditRelief: false } },
      ],
    });
    expect(body.foreignNonFhlProperty[0].income).toEqual({
      rentIncome: { rentAmount: 10.46 },
      premiumsOfLeaseGrant: 0,
      foreignTaxCreditRelief: false,
    });
  });

  test("refuses itemised and consolidated expenses together in the FHL section", () => {
    expect(() =>
      buildForeignPropertyPeriodRequestBody(
        DATED_TAX_YEAR,
        datedBody({ foreignFhlEea: { expenses: { consolidatedExpenses: 5, travelCosts: 1 } } }),
      ),
    ).toThrow(/both itemised expenses and consolidated expenses/);
  });

  test("refuses a repeated country", () => {
    expect(() =>
      buildForeignPropertyPeriodRequestBody(DATED_TAX_YEAR, datedBody({ foreignNonFhlProperty: [FRANCE_ENTRY, FRANCE_ENTRY] })),
    ).toThrow(/more than one entry/);
  });
});

describe("buildForeignPropertyCumulativeRequestBody", () => {
  test("keys the entries by countryCode in 2025-26", () => {
    const body = buildForeignPropertyCumulativeRequestBody(COUNTRY_TAX_YEAR, cumulativeBody());
    expect(body.fromDate).toBe("2025-04-06");
    expect(body.foreignProperty.map((entry) => entry.countryCode)).toEqual(["FRA", "ESP"]);
  });

  test("keys the entries by propertyId from 2026-27", () => {
    const body = buildForeignPropertyCumulativeRequestBody(PROPERTY_TAX_YEAR, {
      foreignProperty: [{ propertyId: "P1", income: { otherPropertyIncome: 5 } }],
    });
    expect(body).toEqual({ foreignProperty: [{ propertyId: "P1", income: { otherPropertyIncome: 5 } }] });
  });

  test("leaves out the dates unless both are present", () => {
    const body = buildForeignPropertyCumulativeRequestBody(COUNTRY_TAX_YEAR, cumulativeBody({ fromDate: "2025-04-06", toDate: undefined }));
    expect(body).not.toHaveProperty("fromDate");
    expect(body).not.toHaveProperty("toDate");
  });

  test("refuses a countryCode entry in 2026-27", () => {
    expect(() => buildForeignPropertyCumulativeRequestBody(PROPERTY_TAX_YEAR, cumulativeBody())).toThrow(/propertyId/);
  });
});

describe("findForeignPropertyPeriodBodyErrors", () => {
  test("refuses the dated sections in a cumulative year", () => {
    const errors = findForeignPropertyPeriodBodyErrors(COUNTRY_TAX_YEAR, {
      foreignFhlEea: { income: { rentAmount: 1 } },
      foreignNonFhlProperty: [FRANCE_ENTRY],
    });
    expect(errors).toHaveLength(2);
  });

  test("refuses the cumulative list in a dated year", () => {
    expect(findForeignPropertyPeriodBodyErrors(DATED_TAX_YEAR, { foreignProperty: [FRANCE_ENTRY] })[0]).toContain("foreignProperty");
  });

  test("refuses a body with no figures", () => {
    expect(findForeignPropertyPeriodBodyErrors(COUNTRY_TAX_YEAR, { foreignProperty: [{ countryCode: "FRA" }] })).toEqual([
      "No foreign property figures were supplied",
    ]);
  });
});

describe("hmrcItsaForeignPropertyPeriodPost ingestHandler", () => {
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

  test("returns 400 when nino, businessId or taxYear are missing", async () => {
    for (const missing of ["nino", "businessId", "taxYear"]) {
      const response = await handler(postEvent(datedBody({ [missing]: undefined })));
      expect(response.statusCode).toBe(400);
    }
  });

  test("returns 400 when a dated year has no fromDate", async () => {
    const response = await handler(postEvent(datedBody({ fromDate: undefined })));
    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response).message).toContain("fromDate");
  });

  test("returns 400 for a repeated country without calling HMRC", async () => {
    const response = await handler(postEvent(datedBody({ foreignNonFhlProperty: [FRANCE_ENTRY, FRANCE_ENTRY] })));
    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response).message).toContain("more than one entry");
    expect(mockFetch.mock.calls.filter(([url]) => String(url).includes("/individuals/"))).toHaveLength(0);
  });

  test("returns 400 for the dated sections in a cumulative year", async () => {
    const response = await handler(postEvent(cumulativeBody({ foreignNonFhlProperty: [FRANCE_ENTRY], foreignProperty: undefined })));
    expect(response.statusCode).toBe(400);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to ITSA", async () => {
    const event = postEvent(datedBody());
    event.requestContext.http.path = "/api/v1/hmrc/itsa/foreign-property/period";
    const response = await handler(event);
    expect(response.statusCode).toBe(403);
    expect(parseResponseBody(response).code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch.mock.calls.filter(([url]) => String(url).includes("/individuals/"))).toHaveLength(0);
  });

  test("POSTs the dated period and answers the model and the submissionId", async () => {
    mockHmrcSuccess(mockFetch, { submissionId: "sub-1" });
    const response = await handler(postEvent(datedBody()));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ model: "dated", submissionId: "sub-1" });

    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toContain(`/individuals/business/property/foreign/${VALID_NINO}/${VALID_BUSINESS_ID}/period/${DATED_TAX_YEAR}`);
    expect(calledInit.method).toBe("POST");
    expect(calledInit.headers.Accept).toBe("application/vnd.hmrc.6.0+json");
    const sent = JSON.parse(calledInit.body);
    expect(sent.foreignFhlEea.income.rentAmount).toBe(300);
    expect(sent.foreignNonFhlProperty).toHaveLength(2);
  });

  test("PUTs the 2025-26 running total by country", async () => {
    mockHmrcSuccess(mockFetch, undefined);
    const response = await handler(postEvent(cumulativeBody()));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ model: "cumulative" });

    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toContain(`/individuals/business/property/foreign/${VALID_NINO}/${VALID_BUSINESS_ID}/cumulative/${COUNTRY_TAX_YEAR}`);
    expect(calledInit.method).toBe("PUT");
    expect(JSON.parse(calledInit.body).foreignProperty.map((entry) => entry.countryCode)).toEqual(["FRA", "ESP"]);
  });

  test("PUTs the 2026-27 running total by property", async () => {
    mockHmrcSuccess(mockFetch, undefined);
    const response = await handler(
      postEvent(
        cumulativeBody({
          taxYear: PROPERTY_TAX_YEAR,
          foreignProperty: [
            { propertyId: "P1", income: { otherPropertyIncome: 5 } },
            { propertyId: "P2", expenses: { travelCosts: 3 } },
          ],
        }),
      ),
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).foreignProperty.map((entry) => entry.propertyId)).toEqual(["P1", "P2"]);
  });

  test("keys the receipt on the submissionId for a dated period and on the tax year for a cumulative one", async () => {
    const lib = await import("@aws-sdk/lib-dynamodb");
    const receiptIds = () =>
      mockSend.mock.calls
        .filter(([cmd]) => cmd instanceof lib.PutCommand && cmd.input.Item?.receiptId)
        .map(([cmd]) => cmd.input.Item.receiptId);

    mockHmrcSuccess(mockFetch, { submissionId: "sub-7" });
    await handler(postEvent(datedBody()));
    expect(receiptIds().some((id) => id.endsWith("-sub-7"))).toBe(true);

    mockSend.mockClear();
    mockHmrcSuccess(mockFetch, undefined);
    await handler(postEvent(cumulativeBody()));
    expect(receiptIds().some((id) => id.endsWith(`-${COUNTRY_TAX_YEAR}`))).toBe(true);
  });

  test("returns the HMRC message for a 400", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_DUPLICATE_COUNTRY_CODE", message: "Duplicate country" });
    const response = await handler(postEvent(datedBody()));
    expect(response.statusCode).toBe(400);
  });
});

describe("hmrcItsaForeignPropertyPeriodPost worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("processes an SQS message and marks the request completed", async () => {
    mockHmrcSuccess(mockFetch, { submissionId: "s-1" });
    await worker({
      Records: [
        {
          body: JSON.stringify({
            userId: "user-123",
            requestId: "req-456",
            payload: {
              nino: VALID_NINO,
              businessId: VALID_BUSINESS_ID,
              taxYear: DATED_TAX_YEAR,
              fromDate: "2024-04-06",
              toDate: "2024-07-05",
              foreignNonFhlProperty: [FRANCE_ENTRY],
              hmrcAccessToken: "token",
              govClientHeaders: {},
              hmrcAccount: "live",
              userSub: "user-123",
            },
          }),
          messageId: "msg-789",
        },
      ],
    });

    const lib = await import("@aws-sdk/lib-dynamodb");
    const completed = mockSend.mock.calls.find(
      (call) => call[0] instanceof lib.UpdateCommand && call[0].input.ExpressionAttributeValues?.[":status"] === "completed",
    );
    expect(completed).toBeDefined();
    expect(completed[0].input.ExpressionAttributeValues[":data"].periodSummary).toEqual({ model: "dated", submissionId: "s-1" });
  });
});
