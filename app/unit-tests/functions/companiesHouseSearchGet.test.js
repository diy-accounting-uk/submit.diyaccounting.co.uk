// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/companiesHouseSearchGet.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent, buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock } from "@app/test-helpers/mockHelpers.js";

// ---------------------------------------------------------------------------
// Mock AWS DynamoDB used by bundle management to avoid real AWS calls
// ---------------------------------------------------------------------------
const mockSend = vi.fn();

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

// Captures the secret ARN requested so tests can assert Secrets Manager was consulted
const mockSecretsManagerSend = vi.fn().mockResolvedValue({ SecretString: "secrets-manager-ch-key" });
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send(...args) {
      return mockSecretsManagerSend(...args);
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

// Defer importing the ingestHandler until after mocks are defined
import { ingestHandler as companiesHouseSearchGetHandler } from "@app/functions/companies-house/companiesHouseSearchGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

const SEARCH_RESULTS = {
  total_results: 1,
  items_per_page: 20,
  start_index: 0,
  items: [
    {
      company_number: "06846849",
      title: "DIY ACCOUNTING LIMITED",
      company_status: "active",
      company_type: "ltd",
      date_of_creation: "2009-04-16",
      address_snippet: "1 Some Street, Leeds, LS1 1AA",
    },
  ],
};

function fakeHeaders(headers) {
  return {
    get: (name) => headers[name.toLowerCase()] || null,
    forEach: (callback) => {
      Object.entries(headers).forEach(([key, value]) => callback(value, key));
    },
  };
}

function mockCompaniesHouseSuccess(fetchMock, body, headers = {}) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    headers: fakeHeaders(headers),
  });
}

function mockCompaniesHouseError(fetchMock, status, body, headers = {}) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve(body),
    headers: fakeHeaders(headers),
  });
}

describe("companiesHouseSearchGet ingestHandler", () => {
  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_BASE_URI: "https://api.company-information.service.gov.uk",
        COMPANIES_HOUSE_API_KEY: "env-ch-api-key",
      }),
    );
    delete process.env.COMPANIES_HOUSE_API_KEY_ARN;
    mockFetch = setupFetchMock();
    vi.resetAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSecretsManagerSend.mockResolvedValue({ SecretString: "secrets-manager-ch-key" });
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [], Count: 0 };
      }
      return {};
    });
  });

  test("returns matching companies for a search term", async () => {
    mockCompaniesHouseSuccess(mockFetch, SEARCH_RESULTS);
    const event = buildHmrcEvent({ queryStringParameters: { q: "diy accounting" } });
    event.requestContext.http.method = "GET";
    const response = await companiesHouseSearchGetHandler(event);
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].companyNumber).toBe("06846849");
  });

  test("maps snake_case upstream fields to camelCase response fields", async () => {
    mockCompaniesHouseSuccess(mockFetch, SEARCH_RESULTS);
    const event = buildHmrcEvent({ queryStringParameters: { q: "diy accounting" } });
    event.requestContext.http.method = "GET";
    const response = await companiesHouseSearchGetHandler(event);
    const body = parseResponseBody(response);
    expect(body.items[0]).toEqual({
      companyNumber: "06846849",
      title: "DIY ACCOUNTING LIMITED",
      companyStatus: "active",
      companyType: "ltd",
      dateOfCreation: "2009-04-16",
      addressSnippet: "1 Some Street, Leeds, LS1 1AA",
    });
    expect(body.totalResults).toBe(1);
  });

  test("rejects a blank search term with 400", async () => {
    const event = buildHmrcEvent({ queryStringParameters: { q: "" } });
    event.requestContext.http.method = "GET";
    const response = await companiesHouseSearchGetHandler(event);
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("rejects a search term over 160 characters with 400", async () => {
    const event = buildHmrcEvent({ queryStringParameters: { q: "a".repeat(161) } });
    event.requestContext.http.method = "GET";
    const response = await companiesHouseSearchGetHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("clamps items per page to 50", async () => {
    mockCompaniesHouseSuccess(mockFetch, SEARCH_RESULTS);
    const event = buildHmrcEvent({ queryStringParameters: { q: "diy", itemsPerPage: "500" } });
    event.requestContext.http.method = "GET";
    await companiesHouseSearchGetHandler(event);
    const requestedUrl = new URL(mockFetch.mock.calls[0][0]);
    expect(requestedUrl.searchParams.get("items_per_page")).toBe("50");
  });

  test("sends the API key as the basic-auth username with an empty password", async () => {
    mockCompaniesHouseSuccess(mockFetch, SEARCH_RESULTS);
    const event = buildHmrcEvent({ queryStringParameters: { q: "diy" } });
    event.requestContext.http.method = "GET";
    await companiesHouseSearchGetHandler(event);
    const requestHeaders = mockFetch.mock.calls[0][1].headers;
    const expected = `Basic ${Buffer.from("env-ch-api-key:").toString("base64")}`;
    expect(requestHeaders.Authorization).toBe(expected);
  });

  test("reads the API key from Secrets Manager when only the ARN is set", async () => {
    delete process.env.COMPANIES_HOUSE_API_KEY;
    process.env.COMPANIES_HOUSE_API_KEY_ARN = "arn:aws:secretsmanager:eu-west-2:123456789012:secret:test/companies-house/api_key";
    mockCompaniesHouseSuccess(mockFetch, SEARCH_RESULTS);
    const event = buildHmrcEvent({ queryStringParameters: { q: "diy" } });
    event.requestContext.http.method = "GET";
    await companiesHouseSearchGetHandler(event);
    expect(mockSecretsManagerSend).toHaveBeenCalled();
    const requestHeaders = mockFetch.mock.calls[0][1].headers;
    const expected = `Basic ${Buffer.from("secrets-manager-ch-key:").toString("base64")}`;
    expect(requestHeaders.Authorization).toBe(expected);
  });

  test("prefers the environment variable key over the Secrets Manager ARN", async () => {
    process.env.COMPANIES_HOUSE_API_KEY_ARN = "arn:aws:secretsmanager:eu-west-2:123456789012:secret:test/companies-house/api_key";
    mockCompaniesHouseSuccess(mockFetch, SEARCH_RESULTS);
    const event = buildHmrcEvent({ queryStringParameters: { q: "diy" } });
    event.requestContext.http.method = "GET";
    await companiesHouseSearchGetHandler(event);
    expect(mockSecretsManagerSend).not.toHaveBeenCalled();
    const requestHeaders = mockFetch.mock.calls[0][1].headers;
    const expected = `Basic ${Buffer.from("env-ch-api-key:").toString("base64")}`;
    expect(requestHeaders.Authorization).toBe(expected);
  });

  test("returns 401 when the caller holds no authorization token", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      queryStringParameters: { q: "diy" },
      authorizer: { authorizer: {} },
    });
    const response = await companiesHouseSearchGetHandler(event);
    expect(response.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 429 with Retry-After when Companies House throttles the key", async () => {
    mockCompaniesHouseError(mockFetch, 429, { error: "rate-limited" }, { "retry-after": "300" });
    const event = buildHmrcEvent({ queryStringParameters: { q: "diy" } });
    event.requestContext.http.method = "GET";
    const response = await companiesHouseSearchGetHandler(event);
    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("300");
  });

  test("returns 500 when Companies House rejects the API key", async () => {
    mockCompaniesHouseError(mockFetch, 401, { error: "invalid-key" });
    const event = buildHmrcEvent({ queryStringParameters: { q: "diy" } });
    event.requestContext.http.method = "GET";
    const response = await companiesHouseSearchGetHandler(event);
    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response);
    expect(body.message).toBe("Companies House rejected our API key");
  });
});
