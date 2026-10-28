// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaForeignPropertyPeriodPut.test.js
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
  buildAmendForeignPropertyPeriodRequestBody,
} from "@app/functions/hmrc/hmrcItsaForeignPropertyPeriodPut.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678910";
const DATED_TAX_YEAR = "2024-25";
const COUNTRY_TAX_YEAR = "2025-26";
const PROPERTY_TAX_YEAR = "2026-27";
const SUBMISSION_ID = "4557ecb5-fd32-48cc-81f5-e6acd1099f3c";

const FRANCE_ENTRY = { countryCode: "FRA", income: { foreignTaxCreditRelief: false }, expenses: { repairsAndMaintenance: 100 } };

function amendBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    taxYear: DATED_TAX_YEAR,
    submissionId: SUBMISSION_ID,
    foreignFhlEea: { expenses: { consolidatedExpenses: 30 } },
    foreignNonFhlProperty: [FRANCE_ENTRY],
    ...overrides,
  };
}

function putEvent(body) {
  return buildHmrcEvent({ body, headers: { authorization: "Bearer test-token" } });
}

describe("buildAmendForeignPropertyPeriodRequestBody", () => {
  test("carries the FHL in the EEA section and the country entries, with no dates", () => {
    const body = buildAmendForeignPropertyPeriodRequestBody(DATED_TAX_YEAR, { fromDate: "2024-04-06", ...amendBody() });
    expect(body).toEqual({
      foreignFhlEea: { expenses: { consolidatedExpenses: 30 } },
      foreignNonFhlProperty: [FRANCE_ENTRY],
    });
  });

  test("refuses a repeated country", () => {
    expect(() =>
      buildAmendForeignPropertyPeriodRequestBody(DATED_TAX_YEAR, { foreignNonFhlProperty: [FRANCE_ENTRY, FRANCE_ENTRY] }),
    ).toThrow(/more than one entry/);
  });
});

describe("hmrcItsaForeignPropertyPeriodPut ingestHandler", () => {
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

  test("returns 400 when the submissionId is missing for a dated year", async () => {
    const response = await handler(putEvent(amendBody({ submissionId: undefined })));
    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response).message).toContain("submissionId");
  });

  test("returns 400 for a repeated country without calling HMRC", async () => {
    const response = await handler(putEvent(amendBody({ foreignNonFhlProperty: [FRANCE_ENTRY, FRANCE_ENTRY] })));
    expect(response.statusCode).toBe(400);
    expect(mockFetch.mock.calls.filter(([url]) => String(url).includes("/individuals/"))).toHaveLength(0);
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to ITSA", async () => {
    const event = putEvent(amendBody());
    event.requestContext.http.path = "/api/v1/hmrc/itsa/foreign-property/period";
    const response = await handler(event);
    expect(response.statusCode).toBe(403);
    expect(parseResponseBody(response).code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch.mock.calls.filter(([url]) => String(url).includes("/individuals/"))).toHaveLength(0);
  });

  test("PUTs the dated amendment to the submission path", async () => {
    mockHmrcSuccess(mockFetch, undefined);
    const response = await handler(putEvent(amendBody()));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ model: "dated" });
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toContain(
      `/individuals/business/property/foreign/${VALID_NINO}/${VALID_BUSINESS_ID}/period/${DATED_TAX_YEAR}/${SUBMISSION_ID}`,
    );
    expect(calledInit.method).toBe("PUT");
    expect(calledInit.headers.Accept).toBe("application/vnd.hmrc.6.0+json");
    expect(Object.keys(JSON.parse(calledInit.body)).sort()).toEqual(["foreignFhlEea", "foreignNonFhlProperty"]);
  });

  test("PUTs the 2025-26 corrected total by country with no submissionId", async () => {
    mockHmrcSuccess(mockFetch, undefined);
    const response = await handler(
      putEvent(
        amendBody({
          taxYear: COUNTRY_TAX_YEAR,
          submissionId: undefined,
          foreignFhlEea: undefined,
          foreignNonFhlProperty: undefined,
          foreignProperty: [FRANCE_ENTRY],
        }),
      ),
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ model: "cumulative" });
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(calledUrl).toContain(`/individuals/business/property/foreign/${VALID_NINO}/${VALID_BUSINESS_ID}/cumulative/${COUNTRY_TAX_YEAR}`);
    expect(JSON.parse(calledInit.body).foreignProperty[0].countryCode).toBe("FRA");
  });

  test("PUTs the 2026-27 corrected total by property", async () => {
    mockHmrcSuccess(mockFetch, undefined);
    const response = await handler(
      putEvent(
        amendBody({
          taxYear: PROPERTY_TAX_YEAR,
          submissionId: undefined,
          foreignFhlEea: undefined,
          foreignNonFhlProperty: undefined,
          foreignProperty: [{ propertyId: "P1", expenses: { travelCosts: 4 } }],
        }),
      ),
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).foreignProperty[0].propertyId).toBe("P1");
  });

  test("returns the HMRC message for a 400", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_BOTH_EXPENSES_SUPPLIED", message: "Both expenses" });
    const response = await handler(putEvent(amendBody()));
    expect(response.statusCode).toBe(400);
  });
});

describe("hmrcItsaForeignPropertyPeriodPut worker", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    vi.clearAllMocks();
  });

  test("processes an SQS message and marks the request completed", async () => {
    mockHmrcSuccess(mockFetch, undefined);
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
              submissionId: SUBMISSION_ID,
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
  });
});
