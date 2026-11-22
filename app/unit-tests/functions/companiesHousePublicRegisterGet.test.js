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

import {
  ingestHandler,
  COMPANIES_HOUSE_429_METRIC,
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

function headers(map) {
  return {
    get: (name) => map[name.toLowerCase()] || null,
    forEach: (callback) => Object.entries(map).forEach(([key, value]) => callback(value, key)),
  };
}

function answer({ status = 200, json, text, headers: map = {} }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => (json === undefined ? Promise.reject(new Error("not JSON")) : Promise.resolve(json)),
    text: () => Promise.resolve(text ?? JSON.stringify(json ?? {})),
    headers: headers(map),
  };
}

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
      () => ({ status: 302, json: {}, headers: { location: "https://s3.example/a.xhtml" } }),
    ],
    [(url) => url === "https://s3.example/a.xhtml", () => ({ text: IXBRL })],
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
});
