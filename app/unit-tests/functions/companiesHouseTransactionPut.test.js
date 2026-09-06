// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/companiesHouseTransactionPut.test.js
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

import { ingestHandler as companiesHouseTransactionPutHandler } from "@app/functions/companies-house/companiesHouseTransactionPut.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

function fakeHeaders(headers = {}) {
  return {
    get: (name) => headers[name.toLowerCase()] || null,
    forEach: (callback) => {
      Object.entries(headers).forEach(([key, value]) => callback(value, key));
    },
  };
}

function mockChResponse(fetchMock, { ok, status, body = {}, headers = {} }) {
  fetchMock.mockResolvedValueOnce({ ok, status, json: () => Promise.resolve(body), headers: fakeHeaders(headers) });
}

function buildEvent({
  pathParameters = { transactionId: "017100005912" },
  body = { status: "closed" },
  headers = {},
  method = "PUT",
} = {}) {
  return buildLambdaEvent({
    method,
    path: "/api/v1/companies-house/transaction/017100005912",
    pathParameters,
    body,
    headers: { Authorization: "Bearer test-ch-access-token", ...headers },
  });
}

describe("companiesHouseTransactionPut ingestHandler", () => {
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

  test("closes a transaction and answers our 200 for an upstream 204", async () => {
    mockChResponse(mockFetch, { ok: true, status: 204, body: {} });
    const response = await companiesHouseTransactionPutHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body).toEqual({ transactionId: "017100005912", status: "closed" });

    const [requestedUrl, requestInit] = mockFetch.mock.calls[0];
    expect(requestedUrl).toBe("https://api-sandbox.company-information.service.gov.uk/transactions/017100005912");
    expect(requestInit.method).toBe("PUT");
    expect(JSON.parse(requestInit.body)).toEqual({ status: "closed" });
  });

  test("rejects a status other than closed with 400", async () => {
    const response = await companiesHouseTransactionPutHandler(buildEvent({ body: { status: "open" } }));
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("maps a 422 validation failure and keeps location intact", async () => {
    mockChResponse(mockFetch, {
      ok: false,
      status: 422,
      body: {
        validationStatus: {
          is_valid: false,
          errors: [
            {
              type: "ch:validation",
              error: "postal-code-invalid",
              location_type: "json-path",
              location: "$.postal_code",
              error_values: {},
            },
          ],
        },
      },
    });
    const response = await companiesHouseTransactionPutHandler(buildEvent());
    expect(response.statusCode).toBe(422);
    const body = parseResponseBody(response);
    expect(body.isValid).toBe(false);
    expect(body.errors).toEqual([
      {
        type: "ch:validation",
        error: "postal-code-invalid",
        locationType: "json-path",
        location: "$.postal_code",
        errorValues: {},
      },
    ]);
  });

  test("maps a 202 with X-Payment-Required to our 500", async () => {
    mockChResponse(mockFetch, { ok: true, status: 202, body: {}, headers: { "x-payment-required": "true" } });
    const response = await companiesHouseTransactionPutHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response);
    expect(body.message).toContain("payment");
  });

  test("maps a 403 to our 409 already-closed conflict", async () => {
    mockChResponse(mockFetch, { ok: false, status: 403, body: { errors: [{ error: "transaction-already-closed" }] } });
    const response = await companiesHouseTransactionPutHandler(buildEvent());
    expect(response.statusCode).toBe(409);
    const body = parseResponseBody(response);
    expect(body.message).toContain("already closed");
  });

  test("maps a 401 from Companies House to our 401", async () => {
    mockChResponse(mockFetch, { ok: false, status: 401, body: { errors: [{ error: "invalid-token" }] } });
    const response = await companiesHouseTransactionPutHandler(buildEvent());
    expect(response.statusCode).toBe(401);
  });

  test("returns 401 when no Companies House access token is present", async () => {
    const response = await companiesHouseTransactionPutHandler(buildEvent({ headers: { Authorization: "" } }));
    expect(response.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("maps an unexpected status from Companies House to 500", async () => {
    mockChResponse(mockFetch, { ok: false, status: 503, body: { error: "service-unavailable" } });
    const response = await companiesHouseTransactionPutHandler(buildEvent());
    expect(response.statusCode).toBe(500);
  });

  test("returns 401 when the Authorization Bearer token for Cognito is missing entirely", async () => {
    const event = buildEvent();
    delete event.requestContext.authorizer;
    const response = await companiesHouseTransactionPutHandler(event);
    expect(response.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHouseTransactionPutHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseTransactionPutHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
