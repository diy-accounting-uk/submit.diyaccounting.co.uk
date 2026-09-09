// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseRegisteredEmailEligibilityGet.test.js
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

import { ingestHandler as companiesHouseRegisteredEmailEligibilityGetHandler } from "@app/functions/companies-house/companiesHouseRegisteredEmailEligibilityGet.js";

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

function mockChSuccess(fetchMock, body) {
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(body), headers: fakeHeaders() });
}

function mockChError(fetchMock, status, body, headers = {}) {
  fetchMock.mockResolvedValueOnce({ ok: false, status, json: () => Promise.resolve(body), headers: fakeHeaders(headers) });
}

function buildEvent({ pathParameters = { companyNumber: "06846849" }, headers = {}, method = "GET" } = {}) {
  return buildLambdaEvent({
    method,
    path: "/api/v1/companies-house/company/06846849/registered-email-address/eligibility",
    pathParameters,
    headers: { Authorization: "Bearer test-ch-access-token", ...headers },
  });
}

describe("companiesHouseRegisteredEmailEligibilityGet ingestHandler", () => {
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

  test("returns the eligibility status code", async () => {
    mockChSuccess(mockFetch, { eligibility_status_code: "COMPANY_VALID_FOR_SERVICE" });
    const response = await companiesHouseRegisteredEmailEligibilityGetHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.eligibilityStatusCode).toBe("COMPANY_VALID_FOR_SERVICE");

    const [requestedUrl, requestInit] = mockFetch.mock.calls[0];
    expect(requestedUrl).toBe(
      "https://api-sandbox.company-information.service.gov.uk/registered-email-address/company/06846849/eligibility",
    );
    expect(requestInit.headers.Authorization).toBe("Bearer test-ch-access-token");
  });

  test("passes through a non-COMPANY_VALID_FOR_SERVICE status code unchanged", async () => {
    mockChSuccess(mockFetch, { eligibility_status_code: "INVALID_NO_REGISTERED_EMAIL_ADDRESS_EXISTS" });
    const response = await companiesHouseRegisteredEmailEligibilityGetHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.eligibilityStatusCode).toBe("INVALID_NO_REGISTERED_EMAIL_ADDRESS_EXISTS");
  });

  test("rejects a malformed company number with 400", async () => {
    const response = await companiesHouseRegisteredEmailEligibilityGetHandler(
      buildEvent({ pathParameters: { companyNumber: "bad-number" } }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 401 when no Companies House access token is present", async () => {
    const response = await companiesHouseRegisteredEmailEligibilityGetHandler(buildEvent({ headers: { Authorization: "" } }));
    expect(response.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("maps a 404 from Companies House to our 404", async () => {
    mockChError(mockFetch, 404, { errors: [{ error: "company-not-found" }] });
    const response = await companiesHouseRegisteredEmailEligibilityGetHandler(buildEvent());
    expect(response.statusCode).toBe(404);
  });

  test("maps a 400 from Companies House to our 400", async () => {
    mockChError(mockFetch, 400, { errors: [{ error: "bad-request" }] });
    const response = await companiesHouseRegisteredEmailEligibilityGetHandler(buildEvent());
    expect(response.statusCode).toBe(400);
  });

  test("maps a 401 from Companies House to our 401", async () => {
    mockChError(mockFetch, 401, { errors: [{ error: "invalid-token" }] });
    const response = await companiesHouseRegisteredEmailEligibilityGetHandler(buildEvent());
    expect(response.statusCode).toBe(401);
  });

  test("maps an unexpected status from Companies House to 500", async () => {
    mockChError(mockFetch, 503, { error: "service-unavailable" });
    const response = await companiesHouseRegisteredEmailEligibilityGetHandler(buildEvent());
    expect(response.statusCode).toBe(500);
  });

  test("returns 401 when the Authorization Bearer token for Cognito is missing entirely", async () => {
    const event = buildEvent();
    delete event.requestContext.authorizer;
    const response = await companiesHouseRegisteredEmailEligibilityGetHandler(event);
    expect(response.statusCode).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHouseRegisteredEmailEligibilityGetHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseRegisteredEmailEligibilityGetHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
