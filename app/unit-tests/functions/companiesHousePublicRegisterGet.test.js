// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHousePublicRegisterGet.test.js
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
const mockIncrementRateCounter = vi.fn();
const mockGetCachedValue = vi.fn();
const mockPutCachedValue = vi.fn();
vi.mock("@app/data/dynamoDbSecurityStateRepository.js", () => ({
  incrementRateCounter: (...args) => mockIncrementRateCounter(...args),
  getCachedValue: (...args) => mockGetCachedValue(...args),
  putCachedValue: (...args) => mockPutCachedValue(...args),
}));

import {
  ingestHandler,
  COMPANIES_HOUSE_429_METRIC,
  ORIGIN_REQUEST_METRIC,
  REGISTER_DEADLINE_MS,
  PUBLIC_BUDGET_SPENT_METRIC,
  FOUND_CACHE_SECONDS,
} from "@app/functions/companies-house/companiesHousePublicRegisterGet.js";
import { MAX_DOCUMENT_RESPONSE_BYTES } from "@app/services/companiesHouseFiledAccounts.js";

const API = "https://api.company-information.service.gov.uk";
const DOCUMENT_API = "https://document-api.company-information.service.gov.uk";
const IXBRL =
  '<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"><body><ix:nonNumeric name="bus:EntityCurrentLegalOrRegisteredName">EXAMPLE LTD</ix:nonNumeric></body></html>';

const PROFILE = {
  company_number: "00000006",
  company_name: "EXAMPLE LIMITED",
  company_status: "active",
  type: "ltd",
  date_of_creation: "2009-04-16",
  registered_office_address: { premises: "1", address_line_1: "Example Street", locality: "Exampletown", postal_code: "AB1 2CD" },
  sic_codes: ["62020"],
  accounts: {
    next_accounts: { due_on: "2027-03-31", period_end_on: "2026-06-30", period_start_on: "2025-07-01" },
    last_accounts: { type: "micro-entity", period_start_on: "2024-07-01", period_end_on: "2025-06-30" },
  },
};

// Every personal field the public register answers for an officer; only three may reach the caller.
const OFFICERS = {
  items: [
    {
      name: "EXAMPLE, Alex",
      officer_role: "director",
      appointed_on: "2009-04-16",
      date_of_birth: { month: 3, year: 1970 },
      nationality: "British",
      country_of_residence: "England",
      occupation: "Director",
      address: { address_line_1: "2 Service Road", postal_code: "ZZ9 9ZZ" },
      identity_verification_details: { preferred_name: "Alex" },
      links: { officer: { appointments: "/officers/abc/appointments" } },
    },
    { name: "FORMER, Sam", officer_role: "secretary", appointed_on: "2009-04-16", resigned_on: "2015-01-01", nationality: "Welsh" },
  ],
};

function accountsItem({ transactionId, documentId, paperFiled = false }) {
  return {
    transaction_id: transactionId,
    category: "accounts",
    type: "AA",
    description: "accounts-with-accounts-type-micro-entity",
    description_values: { made_up_date: "2025-06-30" },
    date: "2025-11-02",
    pages: 4,
    ...(paperFiled ? { paper_filed: true } : {}),
    links: { document_metadata: `${DOCUMENT_API}/document/${documentId}` },
  };
}

let mockFetch;
let routes;
let metadata;

// An answer as fetch gives it: a Response with a body stream and real headers.
function answer({ status = 200, json, text, headers = {} }) {
  return new Response(text ?? (json === undefined ? "" : JSON.stringify(json)), { status, headers });
}

const SIGNED_S3_FILE = "https://s3.eu-west-2.amazonaws.com/document-api-images/docs/DOCIXBRL/a.xhtml?X-Amz-Signature=SIGNATUREEXAMPLE";

function get(number) {
  return ingestHandler(buildLambdaEvent({ method: "GET", path: "/api/v1/public/company-register", queryStringParameters: { number } }));
}

function withHistory(items) {
  routes.unshift([
    (url) => url.startsWith(`${API}/company/00000006/filing-history?`),
    () => ({ json: { total_count: items.length, items } }),
  ]);
}

beforeEach(() => {
  Object.assign(
    process.env,
    setupTestEnv({
      COMPANIES_HOUSE_BASE_URI: API,
      COMPANIES_HOUSE_DOCUMENT_BASE_URI: DOCUMENT_API,
      COMPANIES_HOUSE_API_KEY: "env-ch-api-key",
    }),
  );
  delete process.env.COMPANIES_HOUSE_API_KEY_ARN;
  vi.resetAllMocks();
  mockFetch = setupFetchMock();
  metadata = {
    DOCIXBRL: { resources: { "application/pdf": { content_length: 900 }, "application/xhtml+xml": { content_length: IXBRL.length } } },
    DOCPDF: { resources: { "application/pdf": { content_length: 1200 } } },
  };
  routes = [
    [(url) => url === `${API}/company/00000006`, () => ({ json: PROFILE })],
    [(url) => url.startsWith(`${API}/company/00000006/officers`), () => ({ json: OFFICERS })],
    [
      (url) => url === `${DOCUMENT_API}/document/DOCIXBRL/content`,
      () => ({ status: 302, json: {}, headers: { location: SIGNED_S3_FILE } }),
    ],
    [(url) => url === SIGNED_S3_FILE, () => ({ text: IXBRL })],
    [(url) => url.startsWith(`${DOCUMENT_API}/document/`), (url) => ({ json: metadata[url.split("/document/")[1]] })],
  ];
  mockFetch.mockImplementation(async (url, init) => {
    const route = routes.find(([test]) => test(String(url), init));
    if (!route) throw new Error(`unexpected request ${url}`);
    return answer(route[1](String(url), init));
  });
});

describe("companiesHousePublicRegisterGet ingestHandler", () => {
  test("answers the profile in the builder's names, the current officers and the last set's iXBRL text, cached for an hour", async () => {
    withHistory([
      accountsItem({ transactionId: "TXIXBRL", documentId: "DOCIXBRL" }),
      accountsItem({ transactionId: "TXOLD", documentId: "DOCPDF" }),
    ]);

    const response = await get("6");

    expect(response.statusCode).toBe(200);
    expect(response.headers["Cache-Control"]).toBe(`public, max-age=${FOUND_CACHE_SECONDS}`);
    expect(parseResponseBody(response)).toEqual({
      profile: {
        companyNumber: "00000006",
        companyName: "EXAMPLE LIMITED",
        dateOfCreation: "2009-04-16",
        registeredOffice: { addressLine1: "1 Example Street", cityOrTown: "Exampletown", postalCode: "AB1 2CD" },
        accountsNextPeriodStart: "2025-07-01",
        accountsNextPeriodEnd: "2026-06-30",
        accountsLastPeriodStart: "2024-07-01",
        accountsLastPeriodEnd: "2025-06-30",
        accountsLastType: "micro-entity",
      },
      officers: [{ name: "EXAMPLE, Alex", officerRole: "director", appointedOn: "2009-04-16" }],
      filedAccounts: { status: "ixbrl", madeUpDate: "2025-06-30", accountsType: "micro-entity", filedOn: "2025-11-02", ixbrl: IXBRL },
    });
  });

  test("answers a JSON 502, not cached, and fetches nothing when the Document API redirects off Amazon S3", async () => {
    withHistory([accountsItem({ transactionId: "TXIXBRL", documentId: "DOCIXBRL" })]);
    routes.unshift([
      (url) => url === `${DOCUMENT_API}/document/DOCIXBRL/content`,
      () => ({ status: 302, json: {}, headers: { location: "https://files.example/a.xhtml" } }),
    ]);

    const response = await get("6");

    expect(response.statusCode).toBe(502);
    expect(response.headers["Cache-Control"]).not.toMatch(/public/);
    expect(mockFetch.mock.calls.some(([url]) => String(url).startsWith("https://files.example"))).toBe(false);
  });

  test("reads one page of the accounts history for a company with more filings than a page holds, and answers the newest set", async () => {
    const history = [
      accountsItem({ transactionId: "TXIXBRL", documentId: "DOCIXBRL" }),
      ...Array.from({ length: 149 }, (_, index) => accountsItem({ transactionId: `TXOLD${index}`, documentId: "DOCPDF" })),
    ];
    const historyReads = [];
    routes.unshift([
      (url) => url.startsWith(`${API}/company/00000006/filing-history?`),
      (url) => {
        const params = new URL(url).searchParams;
        const startIndex = Number(params.get("start_index"));
        historyReads.push(startIndex);
        return {
          json: { total_count: history.length, items: history.slice(startIndex, startIndex + Number(params.get("items_per_page"))) },
        };
      },
    ]);

    const response = await get("6");

    expect(response.statusCode).toBe(200);
    expect(historyReads).toEqual([0]);
    expect(parseResponseBody(response).filedAccounts).toEqual(expect.objectContaining({ status: "ixbrl", ixbrl: IXBRL }));
    const companiesHouseCalls = mockFetch.mock.calls.filter(([url]) => [API, DOCUMENT_API].some((host) => String(url).startsWith(host)));
    expect(companiesHouseCalls).toHaveLength(5);
  });

  test("marks a last set that has a PDF only, and fetches no document content", async () => {
    withHistory([accountsItem({ transactionId: "TXPDF", documentId: "DOCPDF", paperFiled: true })]);

    const response = await get("00000006");

    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response).filedAccounts).toEqual({
      status: "pdf",
      madeUpDate: "2025-06-30",
      accountsType: "micro-entity",
      filedOn: "2025-11-02",
    });
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith("/content"))).toBe(false);
  });

  test("marks a company with no accounts filed", async () => {
    withHistory([]);

    const response = await get("00000006");

    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response).filedAccounts).toEqual({ status: "none" });
  });

  test("answers a JSON 404 for an unknown company, not cached, and reads nothing more", async () => {
    routes.unshift([
      (url) => url === `${API}/company/99999999`,
      () => ({ status: 404, json: { errors: [{ error: "company-profile-not-found" }] } }),
    ]);

    const response = await get("99999999");

    expect(response.statusCode).toBe(404);
    expect(response.headers["Content-Type"]).toBe("application/json");
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("answers a JSON 429 with Retry-After when Companies House rate limits any of the reads", async () => {
    withHistory([]);
    routes.unshift([
      (url) => url.startsWith(`${API}/company/00000006/officers`),
      () => ({ status: 429, json: {}, headers: { "retry-after": "120" } }),
    ]);

    const response = await get("00000006");

    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("120");
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(mockEmitMetric).toHaveBeenCalledWith(expect.objectContaining({ metricName: COMPANIES_HOUSE_429_METRIC }));
  });

  test("answers a JSON 413 for a document over the response limit, without fetching it", async () => {
    withHistory([accountsItem({ transactionId: "TXIXBRL", documentId: "DOCIXBRL" })]);
    metadata.DOCIXBRL.resources["application/xhtml+xml"].content_length = MAX_DOCUMENT_RESPONSE_BYTES + 1;

    const response = await get("00000006");

    expect(response.statusCode).toBe(413);
    expect(parseResponseBody(response)).toEqual(expect.objectContaining({ code: "DOCUMENT_TOO_LARGE", madeUpDate: "2025-06-30" }));
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith("/content"))).toBe(false);
  });

  test("copies no personal field of an officer beyond the name, role and appointment date", async () => {
    withHistory([]);

    const response = await get("00000006");
    const text = response.body;

    expect(Object.keys(parseResponseBody(response).officers[0]).sort()).toEqual(["appointedOn", "name", "officerRole"]);
    for (const value of [
      "1970",
      "British",
      "England",
      "2 Service Road",
      "ZZ9 9ZZ",
      "Welsh",
      "FORMER",
      "preferred_name",
      "appointments",
      "occupation",
    ]) {
      expect(text).not.toContain(value);
    }
  });

  test("answers no officers when the register lists none for a company it holds", async () => {
    withHistory([]);
    routes.unshift([
      (url) => url.startsWith(`${API}/company/00000006/officers`),
      () => ({ status: 404, json: { errors: [{ error: "not-found" }] } }),
    ]);

    const response = await get("00000006");

    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response).officers).toEqual([]);
  });

  test("rejects a malformed company number with a JSON 400 and calls nothing", async () => {
    const response = await get("not-a-number!");
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("answers a JSON 429, not cached, and calls Companies House not at all once public lookups have spent their budget", async () => {
    process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
    mockIncrementRateCounter.mockResolvedValue(101);
    try {
      const response = await get("00000006");
      expect(response.statusCode).toBe(429);
      expect(response.headers["Cache-Control"]).toBe("no-store");
      expect(Number(response.headers["Retry-After"])).toBeGreaterThan(0);
      expect(parseResponseBody(response).message).toMatch(/Try again in a few minutes/);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockIncrementRateCounter).toHaveBeenCalledWith(expect.objectContaining({ identifier: "all-public-lookups", hits: 5 }));
      expect(mockEmitMetric).toHaveBeenCalledWith(expect.objectContaining({ metricName: PUBLIC_BUDGET_SPENT_METRIC }));
    } finally {
      delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
    }
  });

  test("stops lookups on the shared key for the Retry-After Companies House names when it answers 429", async () => {
    process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
    mockIncrementRateCounter.mockResolvedValue(1);
    withHistory([]);
    routes.unshift([
      (url) => url.startsWith(`${API}/company/00000006/officers`),
      () => ({ status: 429, json: {}, headers: { "retry-after": "120" } }),
    ]);
    try {
      const response = await get("00000006");
      expect(response.statusCode).toBe(429);
      expect(mockPutCachedValue).toHaveBeenCalledWith("chlookup#stopped", { until: expect.any(Number) }, 120);
    } finally {
      delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
    }
  });

  test("answers a JSON 429 with the seconds left in a Companies House stop, before any call", async () => {
    process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
    mockGetCachedValue.mockResolvedValue({ until: Date.now() + 75_000 });
    try {
      const response = await get("00000006");
      expect(response.statusCode).toBe(429);
      expect(response.headers["Retry-After"]).toBe("75");
      expect(response.headers["Cache-Control"]).toBe("no-store");
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockIncrementRateCounter).not.toHaveBeenCalled();
      expect(mockEmitMetric).not.toHaveBeenCalledWith(expect.objectContaining({ metricName: PUBLIC_BUDGET_SPENT_METRIC }));
    } finally {
      delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
    }
  });

  test("answers its own JSON 504, not cached, and counts it, when the reads outlast the deadline before the Lambda's time ends", async () => {
    withHistory([accountsItem({ transactionId: "TXIXBRL", documentId: "DOCIXBRL" })]);
    const answerAfter = mockFetch.getMockImplementation();
    // Each read answers inside its own timeout, but the chain of them outlasts the deadline.
    mockFetch.mockImplementation((url, init) => new Promise((resolve) => setTimeout(() => resolve(answerAfter(url, init)), 9_000)));
    vi.useFakeTimers();
    try {
      const pending = get("00000006");
      await vi.advanceTimersByTimeAsync(REGISTER_DEADLINE_MS);
      const response = await pending;
      expect(response.statusCode).toBe(504);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(response.headers["Cache-Control"]).toBe("no-store");
      expect(parseResponseBody(response).message).toMatch(/Try again in a few minutes/);
      expect(mockEmitMetric).toHaveBeenCalledWith(
        expect.objectContaining({ metricName: ORIGIN_REQUEST_METRIC, dimensions: { Outcome: "timeout" } }),
      );
      expect(REGISTER_DEADLINE_MS).toBeLessThan(28_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
