// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseRegisteredOfficeAddressGet.test.js
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

import { ingestHandler as companiesHouseRegisteredOfficeAddressGetHandler } from "@app/functions/companies-house/companiesHouseRegisteredOfficeAddressGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

const ADDRESS_RESPONSE = {
  etag: "example-company-etag-1",
  premises: "1",
  address_line_1: "1 Example Street",
  address_line_2: "",
  locality: "Cardiff",
  region: "",
  postal_code: "CF14 3UZ",
  country: "United Kingdom",
};

function fakeHeaders(headers = {}) {
  return {
    get: (name) => headers[name.toLowerCase()] || null,
    forEach: (callback) => {
      Object.entries(headers).forEach(([key, value]) => callback(value, key));
    },
  };
}

function mockChSuccess(fetchMock, body, headers = {}) {
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(body), headers: fakeHeaders(headers) });
}

function mockChError(fetchMock, status, body, headers = {}) {
  fetchMock.mockResolvedValueOnce({ ok: false, status, json: () => Promise.resolve(body), headers: fakeHeaders(headers) });
}

function buildEvent({ pathParameters = { companyNumber: "00000001" }, method = "GET" } = {}) {
  return buildLambdaEvent({
    method,
    path: "/api/v1/companies-house/company/00000001/registered-office-address",
    pathParameters,
  });
}

describe("companiesHouseRegisteredOfficeAddressGet ingestHandler", () => {
  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_BASE_URI: "https://api.company-information.service.gov.uk",
        COMPANIES_HOUSE_API_KEY: "env-ch-api-key",
        ENVIRONMENT_NAME: "test",
      }),
    );
    delete process.env.COMPANIES_HOUSE_API_KEY_ARN;
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

  test("returns the registered office address with its etag", async () => {
    mockChSuccess(mockFetch, ADDRESS_RESPONSE);
    const response = await companiesHouseRegisteredOfficeAddressGetHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.etag).toBe("example-company-etag-1");
    expect(body.premises).toBe("1");
    expect(body.addressLine1).toBe("1 Example Street");
    expect(body.locality).toBe("Cardiff");
    expect(body.postalCode).toBe("CF14 3UZ");
    expect(body.country).toBe("United Kingdom");

    const requestedUrl = mockFetch.mock.calls[0][0];
    expect(requestedUrl).toContain("/company/00000001/registered-office-address");
  });

  test("rejects a malformed company number with 400", async () => {
    const response = await companiesHouseRegisteredOfficeAddressGetHandler(
      buildEvent({ pathParameters: { companyNumber: "bad-number" } }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 404 when Companies House has no such company", async () => {
    mockChError(mockFetch, 404, { errors: [{ error: "registered-office-address-not-found", type: "ch:service" }] });
    const response = await companiesHouseRegisteredOfficeAddressGetHandler(buildEvent());
    expect(response.statusCode).toBe(404);
  });

  test("returns 429 with Retry-After when Companies House throttles the key", async () => {
    mockChError(mockFetch, 429, { error: "rate-limited" }, { "retry-after": "300" });
    const response = await companiesHouseRegisteredOfficeAddressGetHandler(buildEvent());
    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("300");
  });

  test("returns 401 when the Authorization Bearer token for Cognito is missing entirely", async () => {
    const event = buildEvent();
    delete event.requestContext.authorizer;
    const response = await companiesHouseRegisteredOfficeAddressGetHandler(event);
    expect(response.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHouseRegisteredOfficeAddressGetHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseRegisteredOfficeAddressGetHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
