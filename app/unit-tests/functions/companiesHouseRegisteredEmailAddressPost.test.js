// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseRegisteredEmailAddressPost.test.js
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

import { ingestHandler as companiesHouseRegisteredEmailAddressPostHandler } from "@app/functions/companies-house/companiesHouseRegisteredEmailAddressPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

const VALID_BODY = {
  registeredEmailAddress: "filings@example.co.uk",
  acceptAppropriateEmailAddressStatement: true,
};

const RESOURCE_RESPONSE = {
  data: {
    registered_email_address: "filings@example.co.uk",
    accept_appropriate_email_address_statement: true,
    etag: "new-etag",
    kind: "registered-email-address",
    created_at: "2026-01-01T09:00:00Z",
  },
  links: { self: "/transactions/017100005912/registered-email-address" },
};

function fakeHeaders(headers = {}) {
  return {
    get: (name) => headers[name.toLowerCase()] || null,
    forEach: (callback) => {
      Object.entries(headers).forEach(([key, value]) => callback(value, key));
    },
  };
}

function mockChResponse(fetchMock, { ok, status, body = {} }) {
  fetchMock.mockResolvedValueOnce({ ok, status, json: () => Promise.resolve(body), headers: fakeHeaders() });
}

function buildEvent({ pathParameters = { transactionId: "017100005912" }, body = VALID_BODY, headers = {}, method = "POST" } = {}) {
  return buildLambdaEvent({
    method,
    path: "/api/v1/companies-house/transaction/017100005912/registered-email-address",
    pathParameters,
    body,
    headers: { Authorization: "Bearer test-ch-access-token", ...headers },
  });
}

describe("companiesHouseRegisteredEmailAddressPost ingestHandler", () => {
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

  test("files the email address change and maps the response out of the data wrapper", async () => {
    mockChResponse(mockFetch, { ok: true, status: 201, body: RESOURCE_RESPONSE });
    const response = await companiesHouseRegisteredEmailAddressPostHandler(buildEvent());
    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.registeredEmailAddress).toBe("filings@example.co.uk");
    expect(body.acceptAppropriateEmailAddressStatement).toBe(true);
    expect(body.etag).toBe("new-etag");
    expect(body.createdAt).toBe("2026-01-01T09:00:00Z");
    expect(body.links).toEqual(RESOURCE_RESPONSE.links);

    const [requestedUrl, requestInit] = mockFetch.mock.calls[0];
    expect(requestedUrl).toBe(
      "https://api-sandbox.company-information.service.gov.uk/transactions/017100005912/registered-email-address",
    );
    expect(JSON.parse(requestInit.body)).toEqual({
      registered_email_address: "filings@example.co.uk",
      accept_appropriate_email_address_statement: true,
    });
  });

  test("rejects a missing registeredEmailAddress with 400", async () => {
    const response = await companiesHouseRegisteredEmailAddressPostHandler(
      buildEvent({ body: { ...VALID_BODY, registeredEmailAddress: "" } }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("rejects a malformed registeredEmailAddress with 400", async () => {
    const response = await companiesHouseRegisteredEmailAddressPostHandler(
      buildEvent({ body: { ...VALID_BODY, registeredEmailAddress: "not-an-email" } }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("rejects an unticked statement with 400", async () => {
    const response = await companiesHouseRegisteredEmailAddressPostHandler(
      buildEvent({ body: { ...VALID_BODY, acceptAppropriateEmailAddressStatement: false } }),
    );
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("section 88A(2)");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("maps a 403 (transaction closed or no existing address) to our 409 with the upstream body", async () => {
    mockChResponse(mockFetch, { ok: false, status: 403, body: { errors: [{ error: "transaction-closed" }] } });
    const response = await companiesHouseRegisteredEmailAddressPostHandler(buildEvent());
    expect(response.statusCode).toBe(409);
    const body = parseResponseBody(response);
    expect(body.responseBody).toEqual({ errors: [{ error: "transaction-closed" }] });
  });

  test("maps a 401 from Companies House to our 401", async () => {
    mockChResponse(mockFetch, { ok: false, status: 401, body: { errors: [{ error: "invalid-token" }] } });
    const response = await companiesHouseRegisteredEmailAddressPostHandler(buildEvent());
    expect(response.statusCode).toBe(401);
  });

  test("returns 401 when no Companies House access token is present", async () => {
    const response = await companiesHouseRegisteredEmailAddressPostHandler(buildEvent({ headers: { Authorization: "" } }));
    expect(response.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("maps an unexpected status from Companies House to 500", async () => {
    mockChResponse(mockFetch, { ok: false, status: 503, body: { error: "service-unavailable" } });
    const response = await companiesHouseRegisteredEmailAddressPostHandler(buildEvent());
    expect(response.statusCode).toBe(500);
  });

  test("returns 401 when the Authorization Bearer token for Cognito is missing entirely", async () => {
    const event = buildEvent();
    delete event.requestContext.authorizer;
    const response = await companiesHouseRegisteredEmailAddressPostHandler(event);
    expect(response.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHouseRegisteredEmailAddressPostHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseRegisteredEmailAddressPostHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
