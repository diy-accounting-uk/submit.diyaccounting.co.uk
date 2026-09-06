// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/companiesHouseTransactionGet.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock } from "@app/test-helpers/mockHelpers.js";

const mockSend = vi.fn();

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
    DeleteCommand: class {
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

import { ingestHandler as companiesHouseTransactionGetHandler } from "@app/functions/companies-house/companiesHouseTransactionGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

const TRANSACTION_RESPONSE = {
  id: "017100005912",
  status: "closed",
  company_number: "06846849",
  company_name: "DIY ACCOUNTING LIMITED",
  created_at: "2026-01-01T09:00:00Z",
  closed_at: "2026-01-01T09:05:00Z",
  filings: {
    "sub-123": {
      type: "AD01",
      description: "Change of registered office address",
      status: "processing",
      reject_reasons: [],
      processed_at: null,
    },
  },
};

function fakeHeaders(headers = {}) {
  return {
    get: (name) => headers[name.toLowerCase()] || null,
    forEach: (callback) => {
      Object.entries(headers).forEach(([key, value]) => callback(value, key));
    },
  };
}

function mockChSuccess(fetchMock, status, body, headers = {}) {
  fetchMock.mockResolvedValueOnce({ ok: true, status, json: () => Promise.resolve(body), headers: fakeHeaders(headers) });
}

function mockChError(fetchMock, status, body, headers = {}) {
  fetchMock.mockResolvedValueOnce({ ok: false, status, json: () => Promise.resolve(body), headers: fakeHeaders(headers) });
}

function buildEvent({ pathParameters = { transactionId: "017100005912" }, headers = {}, method = "GET" } = {}) {
  return buildLambdaEvent({
    method,
    path: "/api/v1/companies-house/transaction/017100005912",
    pathParameters,
    headers: { Authorization: "Bearer test-ch-access-token", ...headers },
  });
}

describe("companiesHouseTransactionGet ingestHandler", () => {
  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_FILING_BASE_URI: "https://api-sandbox.company-information.service.gov.uk",
        ENVIRONMENT_NAME: "test",
      }),
    );
    mockFetch = setupFetchMock();
    vi.clearAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [], Count: 0 };
      }
      return {};
    });
  });

  test("returns the transaction with filings mapped from the keyed object into an array", async () => {
    mockChSuccess(mockFetch, 200, TRANSACTION_RESPONSE);
    const response = await companiesHouseTransactionGetHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.transactionId).toBe("017100005912");
    expect(body.companyNumber).toBe("06846849");
    expect(body.createdAt).toBe("2026-01-01T09:00:00Z");
    expect(body.closedAt).toBe("2026-01-01T09:05:00Z");
    expect(body.filings).toEqual([
      {
        id: "sub-123",
        type: "AD01",
        description: "Change of registered office address",
        status: "processing",
        rejectReasons: [],
        processedAt: null,
      },
    ]);

    const [requestedUrl, requestInit] = mockFetch.mock.calls[0];
    expect(requestedUrl).toBe("https://api-sandbox.company-information.service.gov.uk/transactions/017100005912");
    expect(requestInit.method).toBe("GET");
    expect(requestInit.headers.Authorization).toBe("Bearer test-ch-access-token");
  });

  test("rejects a missing transactionId with 400", async () => {
    const response = await companiesHouseTransactionGetHandler(buildEvent({ pathParameters: {} }));
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 401 when no Companies House access token is present", async () => {
    const response = await companiesHouseTransactionGetHandler(buildEvent({ headers: { Authorization: "" } }));
    expect(response.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("maps a 404 from Companies House to our 404", async () => {
    mockChError(mockFetch, 404, { errors: [{ error: "transaction-not-found", type: "ch:service" }] });
    const response = await companiesHouseTransactionGetHandler(buildEvent());
    expect(response.statusCode).toBe(404);
  });

  test("maps a 401 from Companies House to our 401", async () => {
    mockChError(mockFetch, 401, { errors: [{ error: "invalid-token", type: "ch:service" }] });
    const response = await companiesHouseTransactionGetHandler(buildEvent());
    expect(response.statusCode).toBe(401);
  });

  test("maps an unexpected status from Companies House to 500", async () => {
    mockChError(mockFetch, 503, { error: "service-unavailable" });
    const response = await companiesHouseTransactionGetHandler(buildEvent());
    expect(response.statusCode).toBe(500);
  });

  test("returns 401 when the Authorization Bearer token for Cognito is missing entirely", async () => {
    const event = buildEvent();
    delete event.requestContext.authorizer;
    const response = await companiesHouseTransactionGetHandler(event);
    expect(response.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHouseTransactionGetHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseTransactionGetHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
