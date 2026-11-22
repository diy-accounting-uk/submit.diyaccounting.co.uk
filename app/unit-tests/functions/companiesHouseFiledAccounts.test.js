// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseFiledAccounts.test.js
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

import { ingestHandler as filingHistoryHandler } from "@app/functions/companies-house/companiesHouseFilingHistoryGet.js";
import { ingestHandler as filedAccountsHandler } from "@app/functions/companies-house/companiesHouseFiledAccountsGet.js";
import { ingestHandler as filedDocumentHandler } from "@app/functions/companies-house/companiesHouseFiledDocumentGet.js";
import { MAX_DOCUMENT_RESPONSE_BYTES } from "@app/services/companiesHouseFiledAccounts.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const API = "https://api.company-information.service.gov.uk";
const DOCUMENT_API = "https://document-api.company-information.service.gov.uk";
const IXBRL =
  '<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"><body><ix:nonNumeric name="bus:EntityCurrentLegalOrRegisteredName">EXAMPLE LTD</ix:nonNumeric></body></html>';

function fakeHeaders(headers) {
  return {
    get: (name) => headers[name.toLowerCase()] || null,
    forEach: (callback) => {
      Object.entries(headers).forEach(([key, value]) => callback(value, key));
    },
  };
}

function answer({ status = 200, json, text, headers = {} }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => (json === undefined ? Promise.reject(new Error("not JSON")) : Promise.resolve(json)),
    text: () => Promise.resolve(text ?? JSON.stringify(json ?? {})),
    headers: fakeHeaders(headers),
  };
}

function accountsItem({ transactionId, type = "AA", description, madeUpDate, date, documentId, paperFiled = false }) {
  return {
    transaction_id: transactionId,
    category: "accounts",
    type,
    description,
    description_values: { made_up_date: madeUpDate },
    date,
    pages: 4,
    ...(paperFiled ? { paper_filed: true } : {}),
    links: { self: `/company/00000001/filing-history/${transactionId}`, document_metadata: `${DOCUMENT_API}/document/${documentId}` },
  };
}

const SOFTWARE_SET = accountsItem({
  transactionId: "TXSOFTWARE",
  description: "accounts-with-accounts-type-micro-entity",
  madeUpDate: "2025-04-30",
  date: "2025-11-02",
  documentId: "DOCSOFTWARE",
});
const PAPER_SET = accountsItem({
  transactionId: "TXPAPER",
  description: "accounts-with-accounts-type-total-exemption-full",
  madeUpDate: "2024-04-30",
  date: "2024-12-15",
  documentId: "DOCPAPER",
  paperFiled: true,
});
const AMENDED_SET = accountsItem({
  transactionId: "TXAMENDED",
  type: "AAMD",
  description: "accounts-amended-with-accounts-type-micro-entity",
  madeUpDate: "2023-04-30",
  date: "2024-02-01",
  documentId: "DOCAMENDED",
});

const METADATA = {
  DOCSOFTWARE: { resources: { "application/pdf": { content_length: 900 }, "application/xhtml+xml": { content_length: IXBRL.length } } },
  DOCPAPER: { resources: { "application/pdf": { content_length: 1200 } } },
  DOCAMENDED: { resources: { "application/pdf": { content_length: 900 }, "application/xhtml+xml": { content_length: 800 } } },
};

let mockFetch;
let routes;

// Answers each request by the first route whose test matches its URL; a request no route matches fails the test.
function routeFetch() {
  mockFetch.mockImplementation(async (url, init) => {
    const route = routes.find(([test]) => test(String(url), init));
    if (!route) throw new Error(`unexpected request ${url}`);
    return answer(route[1](String(url), init));
  });
}

function event(pathParameters) {
  const built = buildHmrcEvent({ pathParameters });
  built.requestContext.http.method = "GET";
  return built;
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
  mockFetch = setupFetchMock();
  vi.resetAllMocks();
  mockEventBridgeSend.mockResolvedValue({});
  mockSend.mockImplementation(async (cmd) => {
    const lib = await import("@aws-sdk/lib-dynamodb");
    if (cmd instanceof lib.QueryCommand) return { Items: [], Count: 0 };
    return {};
  });
  routes = [
    [
      (url) => url.startsWith(`${DOCUMENT_API}/document/`) && !url.endsWith("/content"),
      (url) => {
        const id = url.split("/document/")[1];
        return METADATA[id] ? { json: METADATA[id] } : { status: 404, json: { error: "document-not-found" } };
      },
    ],
  ];
  routeFetch();
});

describe("companiesHouseFilingHistoryGet ingestHandler", () => {
  test("reads every page of the filing history and maps each filing", async () => {
    const pages = [];
    routes.unshift([
      (url) => url.startsWith(`${API}/company/00000001/filing-history?`),
      (url) => {
        const startIndex = Number(new URL(url).searchParams.get("start_index"));
        pages.push(new URL(url).searchParams.get("category"));
        return { json: { total_count: 3, items: [SOFTWARE_SET, PAPER_SET, AMENDED_SET].slice(startIndex, startIndex + 2) } };
      },
    ]);
    // Companies House answers two items a page here, so the three filings take two reads.
    const response = await filingHistoryHandler(event({ companyNumber: "00000001" }));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.totalCount).toBe(3);
    expect(body.filings.map((filing) => filing.transactionId)).toEqual(["TXSOFTWARE", "TXPAPER", "TXAMENDED"]);
    expect(pages).toEqual([null, null]);
    expect(body.filings[0]).toEqual(
      expect.objectContaining({ transactionId: "TXSOFTWARE", type: "AA", category: "accounts", paperFiled: false, hasDocument: true }),
    );
  });

  test("answers Companies House's 404 for an unknown company as JSON", async () => {
    routes.unshift([
      (url) => url.includes("/company/99999999/filing-history"),
      () => ({ status: 404, json: { errors: [{ error: "not-found" }] } }),
    ]);
    const response = await filingHistoryHandler(event({ companyNumber: "99999999" }));
    expect(response.statusCode).toBe(404);
    expect(response.headers["Content-Type"]).toBe("application/json");
  });

  test("rejects a malformed company number with 400", async () => {
    const response = await filingHistoryHandler(event({ companyNumber: "not-a-number!" }));
    expect(response.statusCode).toBe(400);
  });
});

describe("companiesHouseFiledAccountsGet ingestHandler", () => {
  test("lists each set with its made-up date, filing date, type, amended mark and iXBRL mark", async () => {
    routes.unshift([
      (url) => url.startsWith(`${API}/company/00000001/filing-history?`),
      (url) => {
        expect(new URL(url).searchParams.get("category")).toBe("accounts");
        return { json: { total_count: 3, items: [SOFTWARE_SET, PAPER_SET, AMENDED_SET] } };
      },
    ]);
    const response = await filedAccountsHandler(event({ companyNumber: "00000001" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response).filedAccounts).toEqual(
      [
        {
          transactionId: "TXSOFTWARE",
          madeUpDate: "2025-04-30",
          filedOn: "2025-11-02",
          accountsType: "micro-entity",
          amended: false,
          paperFiled: false,
          pages: 4,
          ixbrl: true,
        },
        {
          transactionId: "TXPAPER",
          madeUpDate: "2024-04-30",
          filedOn: "2024-12-15",
          accountsType: "total-exemption-full",
          amended: false,
          paperFiled: true,
          pages: 4,
          ixbrl: false,
        },
        {
          transactionId: "TXAMENDED",
          madeUpDate: "2023-04-30",
          filedOn: "2024-02-01",
          accountsType: undefined,
          amended: true,
          paperFiled: false,
          pages: 4,
          ixbrl: true,
        },
      ].map((set) => JSON.parse(JSON.stringify(set))),
    );
  });

  test("reads the Document API on its configured host, never the host a filing names", async () => {
    const elsewhere = { ...SOFTWARE_SET, links: { document_metadata: "https://elsewhere.example/document/DOCSOFTWARE" } };
    routes.unshift([
      (url) => url.startsWith(`${API}/company/00000001/filing-history?`),
      () => ({ json: { total_count: 1, items: [elsewhere] } }),
    ]);
    await filedAccountsHandler(event({ companyNumber: "00000001" }));
    const urls = mockFetch.mock.calls.map(([url]) => String(url));
    expect(urls).toContain(`${DOCUMENT_API}/document/DOCSOFTWARE`);
    expect(urls.some((url) => url.includes("elsewhere.example"))).toBe(false);
  });

  test("answers Companies House's 404 for an unknown company as JSON", async () => {
    routes.unshift([(url) => url.includes("/company/99999999/filing-history"), () => ({ status: 404, json: {} })]);
    const response = await filedAccountsHandler(event({ companyNumber: "99999999" }));
    expect(response.statusCode).toBe(404);
  });
});

describe("companiesHouseFiledDocumentGet ingestHandler", () => {
  function filing(item) {
    routes.unshift([(url) => url === `${API}/company/00000001/filing-history/${item.transaction_id}`, () => ({ json: item })]);
  }

  test("answers the iXBRL text of a software-filed set, fetching the file without the API key", async () => {
    filing(SOFTWARE_SET);
    routes.unshift([
      (url) => url === `${DOCUMENT_API}/document/DOCSOFTWARE/content`,
      (url, init) => {
        expect(init.headers.Accept).toBe("application/xhtml+xml");
        expect(init.redirect).toBe("manual");
        return { status: 302, json: {}, headers: { location: "https://s3.example/signed/accounts.xhtml" } };
      },
    ]);
    routes.unshift([
      (url) => url === "https://s3.example/signed/accounts.xhtml",
      (url, init) => {
        expect(init.headers.Authorization).toBeUndefined();
        return { text: IXBRL };
      },
    ]);
    const response = await filedDocumentHandler(event({ companyNumber: "00000001", transactionId: "TXSOFTWARE" }));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body).toEqual(
      expect.objectContaining({ transactionId: "TXSOFTWARE", contentType: "application/xhtml+xml", document: IXBRL, ixbrl: true }),
    );
  });

  test("answers a JSON 404 for a paper-filed set that has no iXBRL document", async () => {
    filing(PAPER_SET);
    const response = await filedDocumentHandler(event({ companyNumber: "00000001", transactionId: "TXPAPER" }));
    expect(response.statusCode).toBe(404);
    expect(parseResponseBody(response)).toEqual(expect.objectContaining({ code: "NO_IXBRL_DOCUMENT", paperFiled: true }));
  });

  test("answers a JSON 404 when the Document API answers 406 for the iXBRL type", async () => {
    filing(SOFTWARE_SET);
    routes.unshift([(url) => url.endsWith("/document/DOCSOFTWARE/content"), () => ({ status: 406, json: {} })]);
    const response = await filedDocumentHandler(event({ companyNumber: "00000001", transactionId: "TXSOFTWARE" }));
    expect(response.statusCode).toBe(404);
    expect(parseResponseBody(response).code).toBe("NO_IXBRL_DOCUMENT");
  });

  test("answers a JSON 413 for a document over the response limit, without fetching it", async () => {
    filing(SOFTWARE_SET);
    METADATA.DOCSOFTWARE.resources["application/xhtml+xml"].content_length = MAX_DOCUMENT_RESPONSE_BYTES + 1;
    try {
      const response = await filedDocumentHandler(event({ companyNumber: "00000001", transactionId: "TXSOFTWARE" }));
      expect(response.statusCode).toBe(413);
      expect(parseResponseBody(response).code).toBe("DOCUMENT_TOO_LARGE");
      expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith("/content"))).toBe(false);
    } finally {
      METADATA.DOCSOFTWARE.resources["application/xhtml+xml"].content_length = IXBRL.length;
    }
  });

  test("answers a JSON 404 for a filing that is not a set of accounts", async () => {
    filing({ ...SOFTWARE_SET, transaction_id: "TXCS01", category: "confirmation-statement", type: "CS01" });
    const response = await filedDocumentHandler(event({ companyNumber: "00000001", transactionId: "TXCS01" }));
    expect(response.statusCode).toBe(404);
    expect(parseResponseBody(response).code).toBe("NOT_ACCOUNTS");
  });

  test("answers Companies House's 404 for an unknown company as JSON", async () => {
    routes.unshift([(url) => url.includes("/company/99999999/filing-history/"), () => ({ status: 404, json: {} })]);
    const response = await filedDocumentHandler(event({ companyNumber: "99999999", transactionId: "TXSOFTWARE" }));
    expect(response.statusCode).toBe(404);
  });

  test("rejects a transaction id with characters outside the id's alphabet", async () => {
    const response = await filedDocumentHandler(event({ companyNumber: "00000001", transactionId: "../etc" }));
    expect(response.statusCode).toBe(400);
  });
});
