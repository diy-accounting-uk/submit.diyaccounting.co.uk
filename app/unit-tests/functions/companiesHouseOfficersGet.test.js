// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseOfficersGet.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
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
    constructor(_config) {}
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

import { ingestHandler as companiesHouseOfficersGetHandler } from "@app/functions/companies-house/companiesHouseOfficersGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

const EXAMPLE_OFFICERS_RESPONSE = {
  active_count: 1,
  resigned_count: 0,
  items: [
    {
      name: "EXAMPLE, Alice",
      officer_role: "director",
      appointed_on: "2015-01-01",
      resigned_on: null,
      date_of_birth: { month: 1, year: 1970 },
      nationality: "British",
      country_of_residence: "England",
      identity_verification_details: { appointment_verification_end_on: "9999-12-31" },
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
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(body), headers: fakeHeaders(headers) });
}

function mockCompaniesHouseError(fetchMock, status, body, headers = {}) {
  fetchMock.mockResolvedValueOnce({ ok: false, status, json: () => Promise.resolve(body), headers: fakeHeaders(headers) });
}

function eventForCompanyNumber(companyNumber) {
  const event = buildHmrcEvent({ pathParameters: { companyNumber } });
  event.requestContext.http.method = "GET";
  return event;
}

describe("companiesHouseOfficersGet ingestHandler", () => {
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
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [], Count: 0 };
      }
      return {};
    });
  });

  test("returns the mapped officers for a valid company number", async () => {
    mockCompaniesHouseSuccess(mockFetch, EXAMPLE_OFFICERS_RESPONSE);
    const response = await companiesHouseOfficersGetHandler(eventForCompanyNumber("00000001"));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.companyNumber).toBe("00000001");
    expect(body.activeCount).toBe(1);
    expect(body.officers).toHaveLength(1);
    expect(body.officers[0]).toMatchObject({
      name: "EXAMPLE, Alice",
      officerRole: "director",
      appointedOn: "2015-01-01",
      dateOfBirth: { month: 1, year: 1970 },
    });
    expect(body.officers[0].identityVerificationDetails).toEqual({ appointment_verification_end_on: "9999-12-31" });
  });

  test("requests the officers path for the given company number", async () => {
    mockCompaniesHouseSuccess(mockFetch, EXAMPLE_OFFICERS_RESPONSE);
    await companiesHouseOfficersGetHandler(eventForCompanyNumber("00000001"));
    const requestedUrl = mockFetch.mock.calls[0][0];
    expect(requestedUrl).toContain("/company/00000001/officers");
  });

  test("rejects a malformed company number with 400", async () => {
    const response = await companiesHouseOfficersGetHandler(eventForCompanyNumber("bad-number"));
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 404 when Companies House has no such company", async () => {
    mockCompaniesHouseError(mockFetch, 404, { errors: [{ error: "officers-not-found", type: "ch:service" }] });
    const response = await companiesHouseOfficersGetHandler(eventForCompanyNumber("99999999"));
    expect(response.statusCode).toBe(404);
  });

  test("returns 429 with Retry-After when Companies House throttles the key", async () => {
    mockCompaniesHouseError(mockFetch, 429, { error: "rate-limited" }, { "retry-after": "300" });
    const response = await companiesHouseOfficersGetHandler(eventForCompanyNumber("42942942"));
    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("300");
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const event = eventForCompanyNumber("00000001");
    event.requestContext.http.method = "HEAD";
    const response = await companiesHouseOfficersGetHandler(event);
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
