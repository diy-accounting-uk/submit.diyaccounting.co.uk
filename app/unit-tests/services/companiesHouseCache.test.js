// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseCache.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

// An in-memory cache table with each item's ttl, as the repository stores it.
const table = new Map();
const key = (companyNumber, sk) => `${companyNumber}|${sk}`;
const nowSeconds = () => Math.floor(Date.now() / 1000);

vi.mock("@app/data/dynamoDbCompaniesHouseCacheRepository.js", () => ({
  getCacheEntry: async (companyNumber, sk) => {
    const item = table.get(key(companyNumber, sk));
    return item && item.ttl > nowSeconds() ? { value: structuredClone(item.value), readAt: item.readAt } : null;
  },
  putCacheEntry: async (companyNumber, sk, value, readAt, ttlSeconds) => {
    table.set(key(companyNumber, sk), {
      companyNumber,
      sk,
      value: structuredClone(value),
      readAt,
      ttl: nowSeconds() + ttlSeconds,
      ttlSeconds,
    });
  },
  listCacheKeys: async (companyNumber) => [...table.values()].filter((item) => item.companyNumber === companyNumber).map((item) => item.sk),
  deleteCacheEntry: async (companyNumber, sk) => table.delete(key(companyNumber, sk)),
}));

// A fake Companies House client that answers from a queue and fails if two calls overlap.
let answers = [];
let inFlight = 0;
const calls = [];
vi.mock("@app/services/companiesHouseApi.js", () => ({
  companiesHouseHttpGet: async (endpoint, queryParams) => {
    calls.push({ endpoint, queryParams });
    inFlight += 1;
    if (inFlight > 1) throw new Error("Companies House called in parallel");
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    const next = typeof answers[0] === "function" ? answers.shift()(endpoint, queryParams) : answers.shift();
    return next ?? { ok: true, status: 200, data: {} };
  },
}));

// The shared stop that every lookup on the key reads and writes.
let stopUntil = 0;
const mockStop = vi.fn(async (retryAfter) => {
  stopUntil = Date.now() + (Number.parseInt(retryAfter, 10) || 300) * 1000;
});
vi.mock("@app/services/companiesHouseLookupLimit.js", () => ({
  companiesHouseStopSecondsLeft: async () => Math.max(0, Math.ceil((stopUntil - Date.now()) / 1000)),
  stopCompaniesHouseLookups: (retryAfter) => mockStop(retryAfter),
}));

const mockEmitMetric = vi.fn();
vi.mock("@app/lib/emfMetrics.js", () => ({ emitMetric: (metric) => mockEmitMetric(metric) }));

const {
  cachedCompaniesHouseGet,
  cachedCompaniesHouseGetAllPages,
  withCompaniesHouseCallLimit,
  invalidateCompany,
  KINDS,
  NOT_FOUND_SECONDS,
  figuresSk,
  cacheSk,
} = await import("@app/services/companiesHouseCache.js");

const OFFICER = {
  name: "SMITH, Carol",
  officer_role: "director",
  appointed_on: "2020-01-01",
  date_of_birth: { month: 1, year: 1970 },
  nationality: "British",
  country_of_residence: "England",
  occupation: "Director",
  address: { premises: "1", postal_code: "AB1 2CD" },
  former_names: [{ forenames: "Carol", surname: "Jones" }],
};
const ok = (data) => ({ ok: true, status: 200, data });

describe("services/companiesHouseCache", () => {
  beforeEach(() => {
    table.clear();
    answers = [];
    calls.length = 0;
    inFlight = 0;
    stopUntil = 0;
    mockStop.mockClear();
    mockEmitMetric.mockClear();
  });

  test("a miss calls Companies House once and stores the answer trimmed by its kind", async () => {
    answers = [ok({ active_count: 1, items: [OFFICER] })];

    const answer = await cachedCompaniesHouseGet("00000001", "/company/00000001/officers", {}, { kind: "officers" });

    expect(calls).toHaveLength(1);
    expect(answer).toMatchObject({
      ok: true,
      fromCache: false,
      data: { active_count: 1, items: [{ name: "SMITH, Carol", officer_role: "director" }] },
    });
    expect(answer.readAt).toEqual(expect.any(String));
    const stored = table.get("00000001|/company/00000001/officers").value;
    for (const field of ["date_of_birth", "nationality", "country_of_residence", "occupation", "address", "former_names"]) {
      expect(stored.items[0]).not.toHaveProperty(field);
    }
    expect(mockEmitMetric).toHaveBeenCalledWith({
      namespace: "Submit/Business",
      metricName: "CompanyReportsCompaniesHouseCall",
      dimensions: { Kind: "officers" },
    });
  });

  test("a hit makes no call, and two reports reading one entry get the same value", async () => {
    answers = [ok({ items: [OFFICER] })];
    const first = await cachedCompaniesHouseGet("00000001", "/company/00000001/officers", {}, { kind: "officers" });
    const second = await cachedCompaniesHouseGet("00000001", "/company/00000001/officers", {}, { kind: "officers" });

    expect(calls).toHaveLength(1);
    expect(second).toMatchObject({ ok: true, fromCache: true, readAt: first.readAt });
    expect(second.data).toEqual(first.data);
  });

  test("the query is part of the key, in a fixed order", () => {
    expect(cacheSk("/company/00000001/filing-history", { start_index: 100, items_per_page: 100 })).toBe(
      "/company/00000001/filing-history?items_per_page=100&start_index=100",
    );
    expect(cacheSk("/company/00000001", {})).toBe("/company/00000001");
  });

  test("each kind keeps its answer for its own lifetime", async () => {
    const expected = {
      profile: 600,
      filingHistory: 600,
      officers: 3600,
      psc: 3600,
      pscStatements: 3600,
      charges: 3600,
      insolvency: 3600,
      figures: 400 * 86400,
    };
    expect(Object.fromEntries(Object.entries(KINDS).map(([name, kind]) => [name, kind.seconds]))).toEqual(expected);

    answers = [ok({ company_name: "ACME LIMITED", company_number: "00000001" })];
    await cachedCompaniesHouseGet("00000001", "/company/00000001", {}, { kind: "profile" });
    expect(table.get("00000001|/company/00000001").ttlSeconds).toBe(600);
  });

  test("an item whose ttl has passed is a miss", async () => {
    table.set("00000001|/company/00000001", {
      companyNumber: "00000001",
      sk: "/company/00000001",
      value: { company_name: "OLD" },
      readAt: "x",
      ttl: nowSeconds() - 1,
    });
    answers = [ok({ company_name: "NEW" })];

    const answer = await cachedCompaniesHouseGet("00000001", "/company/00000001", {}, { kind: "profile" });

    expect(calls).toHaveLength(1);
    expect(answer.data.company_name).toBe("NEW");
  });

  test("a 404 is kept for ten minutes and answers 404 from the cache", async () => {
    answers = [{ ok: false, status: 404, data: {} }];
    const first = await cachedCompaniesHouseGet("99999999", "/company/99999999", {}, { kind: "profile" });
    const second = await cachedCompaniesHouseGet("99999999", "/company/99999999", {}, { kind: "profile" });

    expect(first).toMatchObject({ ok: false, status: 404, fromCache: false });
    expect(second).toMatchObject({ ok: false, status: 404, fromCache: true });
    expect(calls).toHaveLength(1);
    expect(table.get("99999999|/company/99999999").ttlSeconds).toBe(NOT_FOUND_SECONDS);
    expect(NOT_FOUND_SECONDS).toBe(600);
  });

  test("a 500 is not kept", async () => {
    answers = [{ ok: false, status: 500, data: {} }, ok({ company_name: "ACME LIMITED" })];
    expect(await cachedCompaniesHouseGet("00000001", "/company/00000001", {}, { kind: "profile" })).toEqual({ ok: false, status: 500 });
    expect(table.size).toBe(0);
    expect((await cachedCompaniesHouseGet("00000001", "/company/00000001", {}, { kind: "profile" })).ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  test("a 429 sets the shared stop, and the next call reads the cache only", async () => {
    answers = [ok({ company_name: "ACME LIMITED" })];
    await cachedCompaniesHouseGet("00000001", "/company/00000001", {}, { kind: "profile" });
    answers = [{ ok: false, status: 429, data: {}, headers: { "retry-after": "120" } }];

    const limited = await cachedCompaniesHouseGet("00000001", "/company/00000001/officers", {}, { kind: "officers" });

    expect(limited).toMatchObject({ ok: false, status: 429 });
    expect(limited.retryAfterSeconds).toBeGreaterThan(110);
    expect(mockStop).toHaveBeenCalledWith("120");
    expect(mockEmitMetric).toHaveBeenCalledWith({ namespace: "Submit/Business", metricName: "CompanyReportsCompaniesHouse429" });
    expect(table.has("00000001|/company/00000001/officers")).toBe(false);

    const cached = await cachedCompaniesHouseGet("00000001", "/company/00000001", {}, { kind: "profile" });
    const stopped = await cachedCompaniesHouseGet("00000001", "/company/00000001/charges", {}, { kind: "charges" });
    expect(cached).toMatchObject({ ok: true, fromCache: true });
    expect(stopped).toMatchObject({ ok: false, status: 429 });
    expect(calls).toHaveLength(2);
  });

  test("a stop that has passed stops nothing", async () => {
    stopUntil = Date.now() - 1000;
    answers = [ok({ company_name: "ACME LIMITED" })];
    expect((await cachedCompaniesHouseGet("00000001", "/company/00000001", {}, { kind: "profile" })).ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  test("paging reads one page after another and stops at maxPages", async () => {
    const page = (start) =>
      ok({ total_count: 1000, items: Array.from({ length: 100 }, (unused, index) => ({ transaction_id: `T${start + index}` })) });
    answers = [
      (endpoint, queryParams) => page(queryParams.start_index),
      (endpoint, queryParams) => page(queryParams.start_index),
      (endpoint, queryParams) => page(queryParams.start_index),
    ];

    const answer = await cachedCompaniesHouseGetAllPages(
      "00445790",
      "/company/00445790/filing-history",
      {},
      { kind: "filingHistory", maxPages: 3 },
    );

    expect(calls.map((call) => call.queryParams.start_index)).toEqual([0, 100, 200]);
    expect(calls.every((call) => call.queryParams.items_per_page === 100)).toBe(true);
    expect(answer).toMatchObject({ ok: true, data: { totalCount: 1000, truncated: true } });
    expect(answer.data.items).toHaveLength(300);
  });

  test("paging stops at the last page", async () => {
    answers = [
      ok({ total_count: 150, items: Array.from({ length: 100 }, () => ({})) }),
      ok({ total_count: 150, items: Array.from({ length: 50 }, () => ({})) }),
    ];

    const answer = await cachedCompaniesHouseGetAllPages("00000001", "/company/00000001/filing-history", {}, { kind: "filingHistory" });

    expect(calls).toHaveLength(2);
    expect(answer.data).toMatchObject({ totalCount: 150, truncated: false });
    expect(answer.data.items).toHaveLength(150);
  });

  test("paging reads a list that answers fewer items a page than it asks for, up to its total", async () => {
    const page = (start, length) =>
      ok({ total_results: 120, items: Array.from({ length }, (unused, index) => ({ name: `OFFICER ${start + index}` })) });
    answers = [
      (endpoint, queryParams) => page(queryParams.start_index, 50),
      (endpoint, queryParams) => page(queryParams.start_index, 50),
      (endpoint, queryParams) => page(queryParams.start_index, 20),
    ];

    const answer = await cachedCompaniesHouseGetAllPages("00000001", "/company/00000001/officers", {}, { kind: "officers" });

    expect(calls.map((call) => call.queryParams.start_index)).toEqual([0, 50, 100]);
    expect(answer.data).toMatchObject({ totalCount: 120, truncated: false });
    expect(answer.data.items.map((item) => item.name)).toEqual(Array.from({ length: 120 }, (unused, index) => `OFFICER ${index}`));
  });

  test("paging that meets an empty page short of the total answers what it read as truncated", async () => {
    answers = [ok({ total_count: 150, items: Array.from({ length: 100 }, () => ({})) }), ok({ total_count: 150, items: [] })];

    const answer = await cachedCompaniesHouseGetAllPages("00000001", "/company/00000001/filing-history", {}, { kind: "filingHistory" });

    expect(calls).toHaveLength(2);
    expect(answer.data.truncated).toBe(true);
    expect(answer.data.items).toHaveLength(100);
  });

  test("paging that fails part way answers the failure with the items read before it", async () => {
    answers = [ok({ total_count: 150, items: Array.from({ length: 100 }, () => ({ type: "AA" })) }), { ok: false, status: 502 }];

    const answer = await cachedCompaniesHouseGetAllPages("00000001", "/company/00000001/filing-history", {}, { kind: "filingHistory" });

    expect(answer).toMatchObject({ ok: false, status: 502 });
    expect(answer.partialItems).toHaveLength(100);
  });

  test("a cache that cannot be read or written still answers from Companies House", async () => {
    vi.spyOn(table, "get").mockImplementationOnce(() => {
      throw new Error("table unavailable");
    });
    vi.spyOn(table, "set").mockImplementationOnce(() => {
      throw new Error("table unavailable");
    });
    answers = [ok({ items: [OFFICER] })];

    const answer = await cachedCompaniesHouseGet("00000001", "/company/00000001/officers", {}, { kind: "officers" });

    expect(answer).toMatchObject({ ok: true, fromCache: false, data: { items: [{ name: "SMITH, Carol" }] } });
    expect(table.size).toBe(0);
  });

  describe("an answer larger than one item", () => {
    // A charges answer whose trimmed JSON is about the given number of bytes.
    const chargesOfBytes = (bytes) =>
      ok({
        items: Array.from({ length: Math.ceil(bytes / 10240) }, (unused, index) => ({
          charge_code: `C${index}`,
          classification: "é".repeat(5100),
        })),
      });
    const sksOf = (companyNumber) => [...table.values()].filter((item) => item.companyNumber === companyNumber).map((item) => item.sk);

    test("is stored in parts, and the next view reads the same value with no call", async () => {
      answers = [chargesOfBytes(700 * 1024)];

      const first = await cachedCompaniesHouseGet("00000001", "/company/00000001/charges", {}, { kind: "charges" });
      const second = await cachedCompaniesHouseGet("00000001", "/company/00000001/charges", {}, { kind: "charges" });

      expect(sksOf("00000001").sort()).toEqual([
        "/company/00000001/charges",
        "/company/00000001/charges#part#0",
        "/company/00000001/charges#part#1",
        "/company/00000001/charges#part#2",
      ]);
      const slices = [...table.values()].filter((item) => item.value.slice).map((item) => item.value.slice.length);
      expect(Math.max(...slices)).toBeLessThanOrEqual(300 * 1024);
      expect(calls).toHaveLength(1);
      expect(second).toMatchObject({ ok: true, fromCache: true });
      expect(second.data).toEqual(first.data);
    });

    test("is a miss when one of its parts has gone", async () => {
      answers = [chargesOfBytes(700 * 1024), chargesOfBytes(700 * 1024)];
      await cachedCompaniesHouseGet("00000001", "/company/00000001/charges", {}, { kind: "charges" });
      table.delete("00000001|/company/00000001/charges#part#1");

      const answer = await cachedCompaniesHouseGet("00000001", "/company/00000001/charges", {}, { kind: "charges" });

      expect(answer).toMatchObject({ ok: true, fromCache: false });
      expect(calls).toHaveLength(2);
    });

    test("is deleted with its parts when the company's entries are deleted", async () => {
      answers = [chargesOfBytes(700 * 1024)];
      await cachedCompaniesHouseGet("00000001", "/company/00000001/charges", {}, { kind: "charges" });

      expect(await invalidateCompany("00000001")).toBe(4);
      expect(sksOf("00000001")).toEqual([]);
    });

    test("too large for six parts is answered once, counted, and then refused for its lifetime with no further call", async () => {
      answers = [chargesOfBytes(2 * 1024 * 1024)];

      const lines = [];
      const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => lines.push(String(chunk)) > 0);
      const first = await cachedCompaniesHouseGet("00000001", "/company/00000001/charges", {}, { kind: "charges" }).finally(() =>
        write.mockRestore(),
      );
      expect(lines.join("")).toContain("Companies House answer too large for the cache");
      expect(lines.join("")).not.toContain("00000001");
      const second = await cachedCompaniesHouseGet("00000001", "/company/00000001/charges", {}, { kind: "charges" });
      const third = await cachedCompaniesHouseGet("00000001", "/company/00000001/charges", {}, { kind: "charges" });

      expect(first).toMatchObject({ ok: true, fromCache: false });
      expect(second).toMatchObject({ ok: false, status: 413, tooLarge: true, fromCache: true });
      expect(third).toEqual(second);
      expect(calls).toHaveLength(1);
      expect(sksOf("00000001")).toEqual(["/company/00000001/charges"]);
      expect(table.get("00000001|/company/00000001/charges")).toMatchObject({
        value: { tooLarge: true },
        ttlSeconds: KINDS.charges.seconds,
      });
      expect(mockEmitMetric).toHaveBeenCalledWith({
        namespace: "Submit/Business",
        metricName: "CompanyReportsCacheValueTooLarge",
        dimensions: { Kind: "charges" },
      });
    });
  });

  describe("the calls of one report view", () => {
    const fullPage = (endpoint, queryParams) =>
      ok({ total_count: 5000, items: Array.from({ length: 100 }, (unused, index) => ({ type: `T${queryParams.start_index + index}` })) });
    // A report that reads two long lists, each of more pages than the view may call for.
    const twoLongLists = async () => ({
      filings: await cachedCompaniesHouseGetAllPages(
        "00000001",
        "/company/00000001/filing-history",
        {},
        { kind: "filingHistory", maxPages: 15 },
      ),
      charges: await cachedCompaniesHouseGetAllPages("00000001", "/company/00000001/charges", {}, { kind: "charges", maxPages: 15 }),
    });

    test("stop at the view's limit, and the list cut short answers the items it read", async () => {
      answers = Array.from({ length: 40 }, () => fullPage);

      const report = await withCompaniesHouseCallLimit(20, twoLongLists);

      expect(calls).toHaveLength(20);
      expect(report.filings).toMatchObject({ ok: true, data: { truncated: true } });
      expect(report.filings.data.items).toHaveLength(1500);
      expect(report.charges).toMatchObject({ ok: false, status: 429, callLimitReached: true });
      expect(report.charges.partialItems).toHaveLength(500);
      expect(mockStop).not.toHaveBeenCalled();
    });

    test("do not count an answer read from the cache", async () => {
      answers = Array.from({ length: 40 }, () => fullPage);
      await withCompaniesHouseCallLimit(20, twoLongLists);

      const second = await withCompaniesHouseCallLimit(20, twoLongLists);

      expect(calls).toHaveLength(30);
      expect(second.charges).toMatchObject({ ok: true, data: { truncated: true } });
      expect(second.charges.data.items).toHaveLength(1500);
    });

    test("are counted apart for each view", async () => {
      answers = Array.from({ length: 4 }, () => ok({ items: [] }));
      const view = (companyNumber) =>
        withCompaniesHouseCallLimit(1, async () => [
          await cachedCompaniesHouseGet(companyNumber, `/company/${companyNumber}/officers`, {}, { kind: "officers" }),
          await cachedCompaniesHouseGet(companyNumber, `/company/${companyNumber}/charges`, {}, { kind: "charges" }),
        ]);

      const first = await view("00000001");
      const second = await view("00000002");

      expect([first, second].map((answersOfView) => answersOfView.map((answer) => answer.ok))).toEqual([
        [true, false],
        [true, false],
      ]);
    });

    test("have no limit outside a report view", async () => {
      answers = Array.from({ length: 25 }, () => fullPage);

      const answer = await cachedCompaniesHouseGetAllPages(
        "00000001",
        "/company/00000001/filing-history",
        {},
        { kind: "filingHistory", maxPages: 25 },
      );

      expect(calls).toHaveLength(25);
      expect(answer.ok).toBe(true);
    });
  });

  test("the figures of a filing keep no director and no signer", () => {
    const figures = KINDS.figures.trim({
      transactionId: "T1",
      period: { end: "2026-03-31" },
      balanceSheet: { netAssets: 100 },
      directors: ["SMITH, Carol"],
      signer: "SMITH, Carol",
      documentText: "<html></html>",
    });

    expect(figures).toEqual({ transactionId: "T1", period: { end: "2026-03-31" }, balanceSheet: { netAssets: 100 } });
  });

  test("invalidateCompany deletes the company's entries and keeps its figures", async () => {
    answers = [ok({ company_name: "ACME LIMITED" }), ok({ items: [] }), ok({ company_name: "OTHER" })];
    await cachedCompaniesHouseGet("00000001", "/company/00000001", {}, { kind: "profile" });
    await cachedCompaniesHouseGet("00000001", "/company/00000001/charges", {}, { kind: "charges" });
    await cachedCompaniesHouseGet("00000002", "/company/00000002", {}, { kind: "profile" });
    table.set(`00000001|${figuresSk("TX1")}`, {
      companyNumber: "00000001",
      sk: figuresSk("TX1"),
      value: {},
      readAt: "x",
      ttl: nowSeconds() + 100,
    });

    expect(await invalidateCompany("00000001")).toBe(2);
    expect([...table.values()].map((item) => `${item.companyNumber} ${item.sk}`).sort()).toEqual([
      "00000001 figures#TX1",
      "00000002 /company/00000002",
    ]);
  });

  test("the trims of persons with significant control, charges and insolvency keep no personal details", () => {
    const psc = KINDS.psc.trim({
      items: [
        { ...OFFICER, kind: "individual-person-with-significant-control", natures_of_control: ["ownership-of-shares-75-to-100-percent"] },
      ],
    });
    expect(psc.items[0]).toEqual({
      name: "SMITH, Carol",
      kind: "individual-person-with-significant-control",
      natures_of_control: ["ownership-of-shares-75-to-100-percent"],
    });
    const charges = KINDS.charges.trim({
      items: [{ charge_code: "C1", status: "outstanding", persons_entitled: [{ name: "BANK PLC", address: { premises: "1" } }] }],
    });
    expect(charges.items[0].persons_entitled).toEqual([{ name: "BANK PLC" }]);
    const insolvency = KINDS.insolvency.trim({
      cases: [
        {
          type: "creditors-voluntary-liquidation",
          practitioners: [{ name: "A PRACTITIONER", role: "practitioner", address: { premises: "1" } }],
        },
      ],
    });
    expect(insolvency.cases[0].practitioners).toEqual([{ name: "A PRACTITIONER", role: "practitioner" }]);
  });
});

const { markAcceptedFiling, ACCEPTED_FILING_SK, ACCEPTED_FILING_MARKER_SECONDS, AFTER_ACCEPTED_FILING_SECONDS } =
  await import("@app/services/companiesHouseAcceptedFiling.js");

describe("the cache after an accepted filing", () => {
  const PROFILE = "/company/00000001";
  const readProfile = () => cachedCompaniesHouseGet("00000001", PROFILE, {}, { kind: "profile" });
  const later = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();

  beforeEach(() => {
    table.clear();
    answers = [];
    calls.length = 0;
    stopUntil = 0;
  });

  test("the marker lives at least as long as the longest-lived register answer", () => {
    const registerLifetimes = Object.entries(KINDS)
      .filter(([name]) => name !== "figures")
      .map(([, kind]) => kind.seconds);
    expect(ACCEPTED_FILING_MARKER_SECONDS).toBeGreaterThanOrEqual(Math.max(NOT_FOUND_SECONDS, ...registerLifetimes));
    expect(AFTER_ACCEPTED_FILING_SECONDS).toBe(120);
  });

  test("the marker is one entry holding the acceptance time, kept for the marker's life", async () => {
    const acceptedAt = later(0);
    expect(await markAcceptedFiling("00000001", acceptedAt)).toBe(true);
    expect([...table.values()]).toEqual([
      expect.objectContaining({ sk: ACCEPTED_FILING_SK, value: { acceptedAt }, ttlSeconds: ACCEPTED_FILING_MARKER_SECONDS }),
    ]);
  });

  test("an answer read before the acceptance is read from Companies House again", async () => {
    answers = [{ ok: true, status: 200, data: { company_name: "OLD NAME LIMITED" } }];
    await readProfile();
    await markAcceptedFiling("00000001", later(1));
    answers = [{ ok: true, status: 200, data: { company_name: "NEW NAME LIMITED" } }];

    const answer = await readProfile();

    expect(calls).toHaveLength(2);
    expect(answer).toMatchObject({ fromCache: false, data: { company_name: "NEW NAME LIMITED" } });
  });

  test("an answer read after the acceptance is kept for at most the short lifetime, then served from the cache", async () => {
    await markAcceptedFiling("00000001", later(-1));
    answers = [{ ok: true, status: 200, data: { company_name: "NEW NAME LIMITED" } }];
    await readProfile();
    expect(table.get(key("00000001", cacheSk(PROFILE))).ttlSeconds).toBe(AFTER_ACCEPTED_FILING_SECONDS);

    const answer = await readProfile();

    expect(calls).toHaveLength(1);
    expect(answer.fromCache).toBe(true);
  });

  test("a 404 read while the marker stands is kept for at most the short lifetime", async () => {
    await markAcceptedFiling("00000001", later(-1));
    answers = [{ ok: false, status: 404 }];
    await readProfile();
    expect(table.get(key("00000001", cacheSk(PROFILE))).ttlSeconds).toBe(AFTER_ACCEPTED_FILING_SECONDS);
  });

  test("a company with no marker keeps its answers for their kind's lifetime", async () => {
    await markAcceptedFiling("00000002", later(-1));
    answers = [{ ok: true, status: 200, data: { company_name: "OTHER LIMITED" } }];
    await readProfile();
    expect(table.get(key("00000001", cacheSk(PROFILE))).ttlSeconds).toBe(KINDS.profile.seconds);
  });

  test("the figures of a filed set keep their lifetime and are served while the marker stands", async () => {
    const endpoint = "/document/MzQ1/figures";
    answers = [{ ok: true, status: 200, data: { transactionId: "MzQ1" } }];
    await cachedCompaniesHouseGet("00000001", endpoint, {}, { kind: "figures" });
    await markAcceptedFiling("00000001", later(1));

    const answer = await cachedCompaniesHouseGet("00000001", endpoint, {}, { kind: "figures" });

    expect(answer.fromCache).toBe(true);
    expect(table.get(key("00000001", cacheSk(endpoint))).ttlSeconds).toBe(KINDS.figures.seconds);
  });

  test("the drop of a company's answers keeps its marker", async () => {
    await markAcceptedFiling("00000001", later(-1));
    answers = [{ ok: true, status: 200, data: {} }];
    await readProfile();
    await invalidateCompany("00000001");
    expect([...table.values()].map((item) => item.sk)).toEqual([ACCEPTED_FILING_SK]);
  });
});
