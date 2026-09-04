// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/companiesHouseCompanyGet.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock } from "@app/test-helpers/mockHelpers.js";

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

import { ingestHandler as companiesHouseCompanyGetHandler } from "@app/functions/companies-house/companiesHouseCompanyGet.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let mockFetch;

const DIY_ACCOUNTING_PROFILE = {
  company_number: "06846849",
  company_name: "DIY ACCOUNTING LIMITED",
  company_status: "active",
  type: "ltd",
  date_of_creation: "2009-04-16",
  jurisdiction: "england-wales",
  registered_office_address: {
    address_line_1: "1 Some Street",
    locality: "Leeds",
    postal_code: "LS1 1AA",
    country: "United Kingdom",
  },
  sic_codes: ["62012"],
  accounts: {
    next_accounts: {
      due_on: "2027-01-31",
      period_end_on: "2026-04-30",
    },
  },
  confirmation_statement: {
    next_due: "2027-04-30",
    next_made_up_to: "2026-04-16",
  },
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

function eventForCompanyNumber(companyNumber) {
  const event = buildHmrcEvent({ pathParameters: { companyNumber } });
  event.requestContext.http.method = "GET";
  return event;
}

describe("companiesHouseCompanyGet ingestHandler", () => {
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

  test("returns the company profile for a valid company number", async () => {
    mockCompaniesHouseSuccess(mockFetch, DIY_ACCOUNTING_PROFILE);
    const response = await companiesHouseCompanyGetHandler(eventForCompanyNumber("06846849"));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.companyName).toBe("DIY ACCOUNTING LIMITED");
    expect(body.companyNumber).toBe("06846849");
  });

  test("left-pads a short numeric company number to eight digits", async () => {
    mockCompaniesHouseSuccess(mockFetch, DIY_ACCOUNTING_PROFILE);
    await companiesHouseCompanyGetHandler(eventForCompanyNumber("6846849"));
    const requestedUrl = mockFetch.mock.calls[0][0];
    expect(requestedUrl).toContain("/company/06846849");
  });

  test("accepts a company number with a jurisdiction prefix", async () => {
    mockCompaniesHouseSuccess(mockFetch, { ...DIY_ACCOUNTING_PROFILE, company_number: "SC000000" });
    const response = await companiesHouseCompanyGetHandler(eventForCompanyNumber("SC000000"));
    expect(response.statusCode).toBe(200);
    const requestedUrl = mockFetch.mock.calls[0][0];
    expect(requestedUrl).toContain("/company/SC000000");
  });

  test("rejects a malformed company number with 400", async () => {
    const response = await companiesHouseCompanyGetHandler(eventForCompanyNumber("bad-number"));
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Invalid company number");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 404 when Companies House has no such company", async () => {
    mockCompaniesHouseError(mockFetch, 404, { errors: [{ error: "company-profile-not-found", type: "ch:service" }] });
    const response = await companiesHouseCompanyGetHandler(eventForCompanyNumber("99999999"));
    expect(response.statusCode).toBe(404);
  });

  test("returns 429 with Retry-After when Companies House throttles the key", async () => {
    mockCompaniesHouseError(mockFetch, 429, { error: "rate-limited" }, { "retry-after": "300" });
    const response = await companiesHouseCompanyGetHandler(eventForCompanyNumber("42942942"));
    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("300");
  });

  test("maps the accounts and confirmation statement due dates into the response", async () => {
    mockCompaniesHouseSuccess(mockFetch, DIY_ACCOUNTING_PROFILE);
    const response = await companiesHouseCompanyGetHandler(eventForCompanyNumber("06846849"));
    const body = parseResponseBody(response);
    expect(body.accountsNextDue).toBe("2027-01-31");
    expect(body.accountsNextPeriodEnd).toBe("2026-04-30");
    expect(body.confirmationStatementNextDue).toBe("2027-04-30");
    expect(body.confirmationStatementNextMadeUpTo).toBe("2026-04-16");
    expect(body.sicCodes).toEqual(["62012"]);
    expect(body.registeredOfficeAddress).toEqual(DIY_ACCOUNTING_PROFILE.registered_office_address);
  });
});
