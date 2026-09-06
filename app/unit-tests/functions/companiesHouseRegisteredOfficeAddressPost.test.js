// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/companiesHouseRegisteredOfficeAddressPost.test.js
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

import { ingestHandler as companiesHouseRegisteredOfficeAddressPostHandler } from "@app/functions/companies-house/companiesHouseRegisteredOfficeAddressPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

const VALID_BODY = {
  premises: "13",
  addressLine1: "Bedford Road",
  addressLine2: "",
  locality: "Leeds",
  region: "West Yorkshire",
  postalCode: "LS12 3AB",
  country: "England",
  acceptAppropriateOfficeAddressStatement: true,
  referenceEtag: "diy-accounting-etag-1",
};

const RESOURCE_RESPONSE = {
  premises: "13",
  address_line_1: "Bedford Road",
  address_line_2: "",
  locality: "Leeds",
  region: "West Yorkshire",
  postal_code: "LS12 3AB",
  country: "England",
  accept_appropriate_office_address_statement: true,
  etag: "new-etag",
  kind: "registered-office-address",
  links: { self: "/transactions/017100005912/registered-office-address" },
};

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

function buildEvent({ pathParameters = { transactionId: "017100005912" }, body = VALID_BODY, headers = {}, method = "POST" } = {}) {
  return buildLambdaEvent({
    method,
    path: "/api/v1/companies-house/transaction/017100005912/registered-office-address",
    pathParameters,
    body,
    headers: { Authorization: "Bearer test-ch-access-token", ...headers },
  });
}

describe("companiesHouseRegisteredOfficeAddressPost ingestHandler", () => {
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

  test("files the address change and maps the response", async () => {
    mockChResponse(mockFetch, { ok: true, status: 201, body: RESOURCE_RESPONSE });
    const response = await companiesHouseRegisteredOfficeAddressPostHandler(buildEvent());
    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.addressLine1).toBe("Bedford Road");
    expect(body.postalCode).toBe("LS12 3AB");
    expect(body.acceptAppropriateOfficeAddressStatement).toBe(true);
    expect(body.etag).toBe("new-etag");
    expect(body.links).toEqual(RESOURCE_RESPONSE.links);

    const [requestedUrl, requestInit] = mockFetch.mock.calls[0];
    expect(requestedUrl).toBe(
      "https://api-sandbox.company-information.service.gov.uk/transactions/017100005912/registered-office-address",
    );
    const sentBody = JSON.parse(requestInit.body);
    expect(sentBody).toEqual({
      premises: "13",
      address_line_1: "Bedford Road",
      address_line_2: "",
      locality: "Leeds",
      region: "West Yorkshire",
      postal_code: "LS12 3AB",
      country: "England",
      accept_appropriate_office_address_statement: true,
      reference_etag: "diy-accounting-etag-1",
    });
  });

  test.each(["premises", "addressLine1", "locality", "country", "postalCode", "referenceEtag"])(
    "rejects a missing %s with 400",
    async (field) => {
      const body = { ...VALID_BODY, [field]: "" };
      const response = await companiesHouseRegisteredOfficeAddressPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    },
  );

  test("rejects a country outside the enum with 400", async () => {
    const response = await companiesHouseRegisteredOfficeAddressPostHandler(
      buildEvent({ body: { ...VALID_BODY, country: "France" } }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("rejects an unticked statement with 400", async () => {
    const response = await companiesHouseRegisteredOfficeAddressPostHandler(
      buildEvent({ body: { ...VALID_BODY, acceptAppropriateOfficeAddressStatement: false } }),
    );
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("section 86(2)");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("maps an upstream 400 carrying the errors array", async () => {
    mockChResponse(mockFetch, { ok: false, status: 400, body: { errors: [{ error: "postal-code-invalid" }] } });
    const response = await companiesHouseRegisteredOfficeAddressPostHandler(buildEvent());
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.errors).toEqual([{ error: "postal-code-invalid" }]);
  });

  test("maps a 409 to our 409 already-holds conflict", async () => {
    mockChResponse(mockFetch, { ok: false, status: 409, body: { errors: [{ error: "already-has-resource" }] } });
    const response = await companiesHouseRegisteredOfficeAddressPostHandler(buildEvent());
    expect(response.statusCode).toBe(409);
    const body = parseResponseBody(response);
    expect(body.message).toContain("already holds");
  });

  test("maps a 403 to our 409 transaction-closed conflict", async () => {
    mockChResponse(mockFetch, { ok: false, status: 403, body: { errors: [{ error: "transaction-closed" }] } });
    const response = await companiesHouseRegisteredOfficeAddressPostHandler(buildEvent());
    expect(response.statusCode).toBe(409);
    const body = parseResponseBody(response);
    expect(body.message).toContain("closed");
  });

  test("maps a 401 from Companies House to our 401", async () => {
    mockChResponse(mockFetch, { ok: false, status: 401, body: { errors: [{ error: "invalid-token" }] } });
    const response = await companiesHouseRegisteredOfficeAddressPostHandler(buildEvent());
    expect(response.statusCode).toBe(401);
  });

  test("returns 401 when no Companies House access token is present", async () => {
    const response = await companiesHouseRegisteredOfficeAddressPostHandler(buildEvent({ headers: { Authorization: "" } }));
    expect(response.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("maps an unexpected status from Companies House to 500", async () => {
    mockChResponse(mockFetch, { ok: false, status: 503, body: { error: "service-unavailable" } });
    const response = await companiesHouseRegisteredOfficeAddressPostHandler(buildEvent());
    expect(response.statusCode).toBe(500);
  });

  test("returns 401 when the Authorization Bearer token for Cognito is missing entirely", async () => {
    const event = buildEvent();
    delete event.requestContext.authorizer;
    const response = await companiesHouseRegisteredOfficeAddressPostHandler(event);
    expect(response.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHouseRegisteredOfficeAddressPostHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseRegisteredOfficeAddressPostHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
