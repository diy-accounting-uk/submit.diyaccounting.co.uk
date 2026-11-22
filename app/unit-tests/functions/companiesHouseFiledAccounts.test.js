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

const mockLookupLimitReached = vi.fn().mockResolvedValue(false);
vi.mock("@app/services/companiesHouseLookupLimit.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, lookupLimitReached: (...args) => mockLookupLimitReached(...args) };
});

import { ingestHandler as filingHistoryHandler } from "@app/functions/companies-house/companiesHouseFilingHistoryGet.js";
import { ingestHandler as filedAccountsHandler } from "@app/functions/companies-house/companiesHouseFiledAccountsGet.js";
import { ingestHandler as filedDocumentHandler } from "@app/functions/companies-house/companiesHouseFiledDocumentGet.js";
import { FILED_ACCOUNTS_METADATA_LIMIT, MAX_DOCUMENT_RESPONSE_BYTES } from "@app/services/companiesHouseFiledAccounts.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const API = "https://api.company-information.service.gov.uk";
const DOCUMENT_API = "https://document-api.company-information.service.gov.uk";
const IXBRL =
  '<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"><body><ix:nonNumeric name="bus:EntityCurrentLegalOrRegisteredName">EXAMPLE LTD</ix:nonNumeric></body></html>';

// An answer as fetch gives it: a Response with a body stream and real headers.
function answer({ status = 200, json, text, stream, headers = {} }) {
  return new Response(stream ?? text ?? (json === undefined ? "" : JSON.stringify(json)), { status, headers });
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
    expect(body.truncated).toBe(false);
    expect(body.filings.map((filing) => filing.transactionId)).toEqual(["TXSOFTWARE", "TXPAPER", "TXAMENDED"]);
    expect(pages).toEqual([null, null]);
    expect(body.filings[0]).toEqual(
      expect.objectContaining({ transactionId: "TXSOFTWARE", type: "AA", category: "accounts", paperFiled: false, hasDocument: true }),
    );
  });

  test("reads at most five pages of 100 filings and says the history is truncated", async () => {
    const totalCount = 750;
    const all = Array.from({ length: totalCount }, (_, index) => ({
      ...SOFTWARE_SET,
      transaction_id: `TX${String(index).padStart(4, "0")}`,
    }));
    const reads = [];
    routes.unshift([
      (url) => url.startsWith(`${API}/company/00000001/filing-history?`),
      (url) => {
        const params = new URL(url).searchParams;
        const startIndex = Number(params.get("start_index"));
        const perPage = Number(params.get("items_per_page"));
        reads.push(startIndex);
        return { json: { total_count: totalCount, items: all.slice(startIndex, startIndex + perPage) } };
      },
    ]);
    const response = await filingHistoryHandler(event({ companyNumber: "00000001" }));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(reads).toEqual([0, 100, 200, 300, 400]);
    expect(body.totalCount).toBe(totalCount);
    expect(body.truncated).toBe(true);
    expect(body.filings).toHaveLength(500);
    expect(body.filings[0].transactionId).toBe("TX0000");
    expect(body.filings[499].transactionId).toBe("TX0499");
  });

  test("answers a JSON 429, calling no Companies House route, when the account has used its share of the API key", async () => {
    mockLookupLimitReached.mockResolvedValueOnce(true);
    const response = await filingHistoryHandler(event({ companyNumber: "00000001" }));
    expect(response.statusCode).toBe(429);
    expect(JSON.parse(response.body).message).toBe("Too many Companies House lookups just now. Try again in a few minutes.");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockLookupLimitReached).toHaveBeenLastCalledWith(expect.any(String), 5);
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

  test("reads document metadata for the newest sets one at a time and leaves an older set's iXBRL mark out", async () => {
    const count = FILED_ACCOUNTS_METADATA_LIMIT + 2;
    const sets = Array.from({ length: count }, (_, index) => ({
      ...SOFTWARE_SET,
      transaction_id: `TXSET${index}`,
      description_values: { made_up_date: `${2040 - index}-04-30` },
    }));
    routes.unshift([
      (url) => url.startsWith(`${API}/company/00000001/filing-history?`),
      () => ({ json: { total_count: count, items: sets } }),
    ]);
    let inFlight = 0;
    let mostInFlight = 0;
    const metadataRoute = routes[routes.length - 1];
    routes[routes.length - 1] = [
      metadataRoute[0],
      (url, init) => {
        inFlight++;
        mostInFlight = Math.max(mostInFlight, inFlight);
        return metadataRoute[1](url, init);
      },
    ];
    mockFetch.mockImplementation(async (url, init) => {
      const route = routes.find(([test]) => test(String(url), init));
      if (!route) throw new Error(`unexpected request ${url}`);
      const result = answer(route[1](String(url), init));
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight = Math.max(0, inFlight - (String(url).startsWith(`${DOCUMENT_API}/document/`) ? 1 : 0));
      return result;
    });

    const response = await filedAccountsHandler(event({ companyNumber: "00000001" }));
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    const metadataReads = mockFetch.mock.calls.filter(([url]) => String(url).startsWith(`${DOCUMENT_API}/document/`));
    expect(metadataReads).toHaveLength(FILED_ACCOUNTS_METADATA_LIMIT);
    expect(mostInFlight).toBe(1);
    expect(body.truncated).toBe(false);
    expect(body.filedAccounts).toHaveLength(count);
    expect(body.filedAccounts.slice(0, FILED_ACCOUNTS_METADATA_LIMIT).every((set) => set.ixbrl === true)).toBe(true);
    for (const older of body.filedAccounts.slice(FILED_ACCOUNTS_METADATA_LIMIT)) {
      expect(older).not.toHaveProperty("ixbrl");
      expect(older).toEqual(
        expect.objectContaining({ madeUpDate: expect.any(String), filedOn: "2025-11-02", accountsType: "micro-entity" }),
      );
    }
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

const SIGNED_S3_FILE =
  "https://s3.eu-west-2.amazonaws.com/document-api-images/docs/DOCSOFTWARE/application-xhtml.xhtml?X-Amz-Credential=AKIAEXAMPLE&X-Amz-Security-Token=TOKENEXAMPLE&X-Amz-Signature=SIGNATUREEXAMPLE";

describe("companiesHouseFiledDocumentGet ingestHandler", () => {
  function filing(item) {
    routes.unshift([(url) => url === `${API}/company/00000001/filing-history/${item.transaction_id}`, () => ({ json: item })]);
  }

  function contentRedirectsTo(location) {
    routes.unshift([
      (url) => url === `${DOCUMENT_API}/document/DOCSOFTWARE/content`,
      () => ({ status: 302, json: {}, headers: { location } }),
    ]);
  }

  test.each([
    ["another host", "https://files.example/docs/DOCSOFTWARE.xhtml"],
    ["http on a host other than the Document API's", "http://s3.eu-west-2.amazonaws.com/document-api-images/docs/DOCSOFTWARE.xhtml"],
    ["a host that only ends like Amazon S3's", "https://s3.eu-west-2.amazonaws.com.files.example/docs/DOCSOFTWARE.xhtml"],
    ["Amazon S3 on another port", "https://s3.eu-west-2.amazonaws.com:8443/docs/DOCSOFTWARE.xhtml"],
  ])("answers a JSON 502 and fetches nothing when the Document API redirects to %s", async (_label, location) => {
    filing(SOFTWARE_SET);
    contentRedirectsTo(location);
    const response = await filedDocumentHandler(event({ companyNumber: "00000001", transactionId: "TXSOFTWARE" }));
    expect(response.statusCode).toBe(502);
    expect(response.headers["Content-Type"]).toBe("application/json");
    expect(mockFetch.mock.calls.map(([url]) => String(url))).not.toContain(location);
  });

  test("answers a JSON 502 when the file's host redirects again, and follows it nowhere", async () => {
    filing(SOFTWARE_SET);
    contentRedirectsTo(SIGNED_S3_FILE);
    routes.unshift([
      (url) => url === SIGNED_S3_FILE,
      (url, init) => {
        expect(init.redirect).toBe("error");
        throw new TypeError("fetch failed");
      },
    ]);
    const response = await filedDocumentHandler(event({ companyNumber: "00000001", transactionId: "TXSOFTWARE" }));
    expect(response.statusCode).toBe(502);
    expect(response.headers["Content-Type"]).toBe("application/json");
    expect(mockFetch.mock.calls.at(-1)[0]).toBe(SIGNED_S3_FILE);
  });

  test.each([
    ["Amazon S3, path style", SIGNED_S3_FILE],
    [
      "Amazon S3, virtual-hosted style",
      "https://document-api-images.s3.eu-west-2.amazonaws.com/docs/DOCSOFTWARE.xhtml?X-Amz-Signature=SIGNATUREEXAMPLE",
    ],
    ["the configured Document API itself", `${DOCUMENT_API}/document/DOCSOFTWARE/file?type=application%2Fxhtml%2Bxml`],
  ])("fetches the file when the Document API redirects to %s", async (_label, location) => {
    filing(SOFTWARE_SET);
    contentRedirectsTo(location);
    routes.unshift([(url) => url === location, () => ({ text: IXBRL })]);
    const response = await filedDocumentHandler(event({ companyNumber: "00000001", transactionId: "TXSOFTWARE" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response).document).toBe(IXBRL);
  });

  test("records the file fetch by its host and path template, without the signed query", async () => {
    filing(SOFTWARE_SET);
    contentRedirectsTo(SIGNED_S3_FILE);
    routes.unshift([(url) => url === SIGNED_S3_FILE, () => ({ text: IXBRL })]);
    await filedDocumentHandler(event({ companyNumber: "00000001", transactionId: "TXSOFTWARE" }));
    const records = mockSend.mock.calls
      .map(([command]) => command.input)
      .filter((input) => String(input?.TableName).includes("integration-calls"))
      .map((input) => input.Item);
    const fileRecord = records.find((item) => item.api === "GET /document/{documentId}/file");
    expect(fileRecord).toEqual(expect.objectContaining({ raw: expect.objectContaining({ host: "s3.eu-west-2.amazonaws.com" }) }));
    const written = JSON.stringify(records);
    for (const secret of ["SIGNATUREEXAMPLE", "TOKENEXAMPLE", "AKIAEXAMPLE", "X-Amz-"]) expect(written).not.toContain(secret);
  });

  test("answers the iXBRL text of a software-filed set, fetching the file without the API key", async () => {
    filing(SOFTWARE_SET);
    routes.unshift([
      (url) => url === `${DOCUMENT_API}/document/DOCSOFTWARE/content`,
      (url, init) => {
        expect(init.headers.Accept).toBe("application/xhtml+xml");
        expect(init.redirect).toBe("manual");
        return { status: 302, json: {}, headers: { location: SIGNED_S3_FILE } };
      },
    ]);
    routes.unshift([
      (url) => url === SIGNED_S3_FILE,
      (url, init) => {
        expect(init.headers.Authorization).toBeUndefined();
        expect(init.redirect).toBe("error");
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

  test("answers a JSON 413 for a document larger than its metadata states, reading no more than the limit", async () => {
    filing(SOFTWARE_SET);
    contentRedirectsTo(SIGNED_S3_FILE);
    let enqueued = 0;
    routes.unshift([
      (url) => url === SIGNED_S3_FILE,
      () => ({
        stream: new ReadableStream({
          pull(controller) {
            enqueued += 1024 * 1024;
            controller.enqueue(new Uint8Array(1024 * 1024));
          },
        }),
      }),
    ]);
    const response = await filedDocumentHandler(event({ companyNumber: "00000001", transactionId: "TXSOFTWARE" }));
    expect(response.statusCode).toBe(413);
    expect(parseResponseBody(response).code).toBe("DOCUMENT_TOO_LARGE");
    expect(enqueued).toBeLessThan(MAX_DOCUMENT_RESPONSE_BYTES + 3 * 1024 * 1024);
  });

  test("answers a JSON 504 when the document's body stalls after its headers", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      filing(SOFTWARE_SET);
      contentRedirectsTo(SIGNED_S3_FILE);
      routes.unshift([
        (url) => url === SIGNED_S3_FILE,
        (url, init) => ({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("<html>"));
              init.signal.addEventListener("abort", () => controller.error(new DOMException("The operation was aborted.", "AbortError")));
            },
          }),
        }),
      ]);
      const pending = filedDocumentHandler(event({ companyNumber: "00000001", transactionId: "TXSOFTWARE" }));
      await vi.advanceTimersByTimeAsync(25_000);
      const response = await pending;
      expect(response.statusCode).toBe(504);
      expect(response.headers["Content-Type"]).toBe("application/json");
    } finally {
      vi.useRealTimers();
    }
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
