// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseTransactionPost.test.js
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

import { ingestHandler as companiesHouseTransactionPostHandler } from "@app/functions/companies-house/companiesHouseTransactionPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

const OPEN_TRANSACTION_RESPONSE = {
  id: "017100005912",
  status: "open",
  company_number: "06846849",
  company_name: "DIY ACCOUNTING LIMITED",
  links: { self: "/transactions/017100005912" },
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
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: fakeHeaders(headers),
  });
}

function mockChError(fetchMock, status, body, headers = {}) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve(body),
    headers: fakeHeaders(headers),
  });
}

function buildEvent({ body = {}, headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/transaction",
    body,
    headers: { Authorization: "Bearer test-ch-access-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHouseTransactionPost ingestHandler", () => {
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

  test("opens a transaction and maps the response", async () => {
    mockChSuccess(mockFetch, 201, OPEN_TRANSACTION_RESPONSE);
    const response = await companiesHouseTransactionPostHandler(
      buildEvent({ body: { companyNumber: "06846849", description: "Change of registered office address" } }),
    );
    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.transactionId).toBe("017100005912");
    expect(body.status).toBe("open");
    expect(body.companyNumber).toBe("06846849");
    expect(body.companyName).toBe("DIY ACCOUNTING LIMITED");
    expect(body.links).toEqual(OPEN_TRANSACTION_RESPONSE.links);

    const [requestedUrl, requestInit] = mockFetch.mock.calls[0];
    expect(requestedUrl).toBe("https://api-sandbox.company-information.service.gov.uk/transactions");
    expect(requestInit.method).toBe("POST");
    expect(requestInit.headers.Authorization).toBe("Bearer test-ch-access-token");
    expect(JSON.parse(requestInit.body)).toEqual({
      company_number: "06846849",
      description: "Change of registered office address",
    });
  });

  test("passes an optional reference through to Companies House", async () => {
    mockChSuccess(mockFetch, 201, OPEN_TRANSACTION_RESPONSE);
    await companiesHouseTransactionPostHandler(
      buildEvent({
        body: { companyNumber: "06846849", description: "Change of registered office address", reference: "case-42" },
      }),
    );
    const [, requestInit] = mockFetch.mock.calls[0];
    expect(JSON.parse(requestInit.body).reference).toBe("case-42");
  });

  test("rejects a malformed company number with 400", async () => {
    const response = await companiesHouseTransactionPostHandler(
      buildEvent({ body: { companyNumber: "bad", description: "Change of registered office address" } }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("rejects a missing description with 400", async () => {
    const response = await companiesHouseTransactionPostHandler(buildEvent({ body: { companyNumber: "06846849" } }));
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Missing description");
  });

  test("rejects a description over 200 characters with 400", async () => {
    const response = await companiesHouseTransactionPostHandler(
      buildEvent({ body: { companyNumber: "06846849", description: "x".repeat(201) } }),
    );
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("at most 200 characters");
  });

  test("returns 401 when no Companies House access token is present", async () => {
    const response = await companiesHouseTransactionPostHandler(
      buildEvent({
        body: { companyNumber: "06846849", description: "Change of registered office address" },
        headers: { Authorization: "" },
      }),
    );
    expect(response.statusCode).toBe(401);
    const body = parseResponseBody(response);
    expect(body.error?.code || body.code).toBe("COMPANIES_HOUSE_UNAUTHORIZED");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("maps a 401 from Companies House to our 401", async () => {
    mockChError(mockFetch, 401, { errors: [{ error: "invalid-token", type: "ch:service" }] });
    const response = await companiesHouseTransactionPostHandler(
      buildEvent({ body: { companyNumber: "06846849", description: "Change of registered office address" } }),
    );
    expect(response.statusCode).toBe(401);
  });

  test("maps a 429 from Companies House with Retry-After", async () => {
    mockChError(mockFetch, 429, { error: "rate-limited" }, { "retry-after": "300" });
    const response = await companiesHouseTransactionPostHandler(
      buildEvent({ body: { companyNumber: "06846849", description: "Change of registered office address" } }),
    );
    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("300");
  });

  test("maps an unexpected status from Companies House to 500", async () => {
    mockChError(mockFetch, 503, { error: "service-unavailable" });
    const response = await companiesHouseTransactionPostHandler(
      buildEvent({ body: { companyNumber: "06846849", description: "Change of registered office address" } }),
    );
    expect(response.statusCode).toBe(500);
  });

  test("returns 401 when the Authorization Bearer token for Cognito is missing entirely", async () => {
    const response = await companiesHouseTransactionPostHandler(
      buildEvent({ body: { companyNumber: "06846849", description: "Change" }, authorizer: {} }),
    );
    expect(response.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHouseTransactionPostHandler(
      buildEvent({ body: { companyNumber: "06846849", description: "Change of registered office address" } }),
    );
    expect(response.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseTransactionPostHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
