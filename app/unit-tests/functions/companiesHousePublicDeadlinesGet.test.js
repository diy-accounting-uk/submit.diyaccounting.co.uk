// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHousePublicDeadlinesGet.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock } from "@app/test-helpers/mockHelpers.js";

const mockEmitMetric = vi.fn();
vi.mock("@app/lib/emfMetrics.js", () => ({ emitMetric: (...args) => mockEmitMetric(...args) }));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: vi.fn().mockResolvedValue({}) }) },
  PutCommand: class {},
  QueryCommand: class {},
  DeleteCommand: class {},
  GetCommand: class {},
  UpdateCommand: class {},
}));
vi.mock("@aws-sdk/client-dynamodb", () => ({ DynamoDBClient: class {} }));

import {
  ingestHandler,
  deadlinesFromProfile,
  COMPANIES_HOUSE_429_METRIC,
  ORIGIN_REQUEST_METRIC,
  METRICS_NAMESPACE,
  FOUND_CACHE_SECONDS,
} from "@app/functions/companies-house/companiesHousePublicDeadlinesGet.js";

const PROFILE = {
  company_number: "00000006",
  company_name: "EXAMPLE LIMITED",
  company_status: "active",
  type: "ltd",
  date_of_creation: "2009-04-16",
  registered_office_address: { address_line_1: "1 Private Street", postal_code: "AB1 2CD" },
  sic_codes: ["62020"],
  officers: { href: "/company/00000006/officers" },
  accounts: {
    next_accounts: { due_on: "2027-03-31", period_end_on: "2026-06-30", period_start_on: "2025-07-01" },
    last_accounts: { type: "micro-entity", made_up_to: "2025-06-30" },
  },
  confirmation_statement: { next_due: "2027-04-30", last_made_up_to: "2026-04-16" },
};

let mockFetch;

function headers(map) {
  return {
    get: (name) => map[name.toLowerCase()] || null,
    forEach: (callback) => Object.entries(map).forEach(([key, value]) => callback(value, key)),
  };
}

function upstream(status, body, map = {}) {
  mockFetch.mockResolvedValueOnce({ ok: status < 400, status, json: () => Promise.resolve(body), headers: headers(map) });
}

function get(queryStringParameters) {
  return buildLambdaEvent({ method: "GET", path: "/api/v1/public/company-deadlines", queryStringParameters, authorizer: {} });
}

const originRequestMetrics = () =>
  mockEmitMetric.mock.calls.map(([metric]) => metric).filter((metric) => metric.metricName === ORIGIN_REQUEST_METRIC);

describe("companiesHousePublicDeadlinesGet ingestHandler", () => {
  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_BASE_URI: "https://api.company-information.service.gov.uk",
        COMPANIES_HOUSE_API_KEY: "env-ch-api-key",
      }),
    );
    delete process.env.COMPANIES_HOUSE_API_KEY_ARN;
    vi.resetAllMocks();
    mockFetch = setupFetchMock();
  });

  test("answers a company number with exactly the public fields", async () => {
    upstream(200, PROFILE);
    const response = await ingestHandler(get({ number: "00000006" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({
      companyNumber: "00000006",
      companyName: "EXAMPLE LIMITED",
      companyStatus: "active",
      companyType: "ltd",
      accountsNextDue: "2027-03-31",
      accountsNextPeriodEnd: "2026-06-30",
      confirmationStatementNextDue: "2027-04-30",
      lastAccountsType: "micro-entity",
    });
    expect(response.body).not.toContain("Private Street");
    expect(response.body).not.toContain("62020");
  });

  test("lets CloudFront keep a found answer", async () => {
    upstream(200, PROFILE);
    const response = await ingestHandler(get({ number: "00000006" }));
    expect(response.headers["Cache-Control"]).toBe(`public, max-age=${FOUND_CACHE_SECONDS}`);
  });

  test("pads a short numeric company number to eight characters", async () => {
    upstream(200, PROFILE);
    await ingestHandler(get({ number: "6" }));
    expect(mockFetch.mock.calls[0][0]).toContain("/company/00000006");
  });

  test("leaves absent fields out of the answer for a dormant company with no filings", async () => {
    upstream(200, { company_number: "00000006", company_name: "X", company_status: "dissolved", type: "ltd" });
    const body = parseResponseBody(await ingestHandler(get({ number: "00000006" })));
    expect(body.accountsNextDue).toBeUndefined();
    expect(body.companyStatus).toBe("dissolved");
  });

  test("returns at most five matches with public fields only", async () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      company_number: `0000000${index}`,
      title: `COMPANY ${index}`,
      company_status: "active",
      company_type: "ltd",
      address_snippet: "1 Private Street",
      date_of_creation: "2009-04-16",
    }));
    upstream(200, { items });
    const response = await ingestHandler(get({ q: "company" }));
    const body = parseResponseBody(response);
    expect(body.items).toHaveLength(5);
    expect(body.items[0]).toEqual({ companyNumber: "00000000", companyName: "COMPANY 0", companyStatus: "active", companyType: "ltd" });
    expect(response.body).not.toContain("Private Street");
    expect(mockFetch.mock.calls[0][0]).toContain("items_per_page=5");
  });

  test.each([
    ["no parameter", {}],
    ["both parameters", { number: "00000006", q: "example" }],
    ["a company number of the wrong length", { number: "123456789" }],
    ["a company number with a symbol", { number: "0000-006" }],
    ["a name of one character", { q: "a" }],
    ["a name over the maximum", { q: "a".repeat(101) }],
  ])("answers 400 as JSON for %s and calls nothing", async (_label, query) => {
    const response = await ingestHandler(get(query));
    expect(response.statusCode).toBe(400);
    expect(response.headers["Content-Type"]).toBe("application/json");
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(typeof parseResponseBody(response).message).toBe("string");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("answers 404 as JSON when Companies House has no such company", async () => {
    upstream(404, { errors: [{ error: "company-profile-not-found" }] });
    const response = await ingestHandler(get({ number: "00000006" }));
    expect(response.statusCode).toBe(404);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(response.body).not.toContain("company-profile-not-found");
  });

  test("answers 429 with Retry-After and counts it when Companies House answers 429", async () => {
    upstream(429, {}, { "retry-after": "120" });
    const response = await ingestHandler(get({ number: "00000006" }));
    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("120");
    expect(parseResponseBody(response).message).toContain("few minutes");
    expect(mockEmitMetric).toHaveBeenCalledWith({ namespace: METRICS_NAMESPACE, metricName: COMPANIES_HOUSE_429_METRIC });
  });

  test("tells the caller to wait five minutes when Companies House sends no Retry-After", async () => {
    upstream(429, {});
    const response = await ingestHandler(get({ q: "example" }));
    expect(response.headers["Retry-After"]).toBe("300");
  });

  test("answers 502 as JSON when Companies House fails", async () => {
    upstream(500, { error: "boom" });
    const response = await ingestHandler(get({ number: "00000006" }));
    expect(response.statusCode).toBe(502);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(response.body).not.toContain("boom");
  });

  test("writes one metric for each outcome with its kind", async () => {
    upstream(200, PROFILE);
    await ingestHandler(get({ number: "00000006" }));
    upstream(404, {});
    await ingestHandler(get({ number: "00000007" }));
    upstream(200, { items: [] });
    await ingestHandler(get({ q: "example" }));
    await ingestHandler(get({ q: "x" }));
    expect(originRequestMetrics().map((metric) => metric.dimensions)).toEqual([
      { Kind: "lookup", Outcome: "found" },
      { Kind: "lookup", Outcome: "not_found" },
      { Kind: "search", Outcome: "found" },
      { Kind: "search", Outcome: "invalid" },
    ]);
  });

  test("copies each field by name and passes nothing else through", () => {
    const fields = Object.keys(deadlinesFromProfile(PROFILE));
    expect(fields).toEqual([
      "companyNumber",
      "companyName",
      "companyStatus",
      "companyType",
      "accountsNextDue",
      "accountsNextPeriodEnd",
      "confirmationStatementNextDue",
      "lastAccountsType",
    ]);
  });
});
