// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHousePscGet.test.js
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

import { ingestHandler as companiesHousePscGetHandler } from "@app/functions/companies-house/companiesHousePscGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

const EXAMPLE_PSC_RESPONSE = {
  active_count: 1,
  ceased_count: 0,
  items: [
    {
      name: "Alice Example",
      kind: "individual-person-with-significant-control",
      natures_of_control: ["ownership-of-shares-50-to-75-percent"],
      notified_on: "2016-04-06",
      ceased_on: null,
      date_of_birth: { month: 1, year: 1970 },
      nationality: "British",
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

describe("companiesHousePscGet ingestHandler", () => {
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

  test("returns the mapped PSCs for a valid company number", async () => {
    mockCompaniesHouseSuccess(mockFetch, EXAMPLE_PSC_RESPONSE);
    const response = await companiesHousePscGetHandler(eventForCompanyNumber("00000001"));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.companyNumber).toBe("00000001");
    expect(body.activeCount).toBe(1);
    expect(body.pscs).toHaveLength(1);
    expect(body.pscs[0]).toMatchObject({
      name: "Alice Example",
      kind: "individual-person-with-significant-control",
      naturesOfControl: ["ownership-of-shares-50-to-75-percent"],
      notifiedOn: "2016-04-06",
    });
  });

  test("requests the persons-with-significant-control path for the given company number", async () => {
    mockCompaniesHouseSuccess(mockFetch, EXAMPLE_PSC_RESPONSE);
    await companiesHousePscGetHandler(eventForCompanyNumber("00000001"));
    const requestedUrl = mockFetch.mock.calls[0][0];
    expect(requestedUrl).toContain("/company/00000001/persons-with-significant-control");
  });

  test("rejects a malformed company number with 400", async () => {
    const response = await companiesHousePscGetHandler(eventForCompanyNumber("bad-number"));
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 404 when Companies House has no such company", async () => {
    mockCompaniesHouseError(mockFetch, 404, { errors: [{ error: "persons-with-significant-control-not-found", type: "ch:service" }] });
    const response = await companiesHousePscGetHandler(eventForCompanyNumber("99999999"));
    expect(response.statusCode).toBe(404);
  });

  test("returns 429 with Retry-After when Companies House throttles the key", async () => {
    mockCompaniesHouseError(mockFetch, 429, { error: "rate-limited" }, { "retry-after": "300" });
    const response = await companiesHousePscGetHandler(eventForCompanyNumber("42942942"));
    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("300");
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const event = eventForCompanyNumber("00000001");
    event.requestContext.http.method = "HEAD";
    const response = await companiesHousePscGetHandler(event);
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
