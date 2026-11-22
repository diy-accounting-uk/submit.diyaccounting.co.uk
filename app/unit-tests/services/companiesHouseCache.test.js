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

const { cachedCompaniesHouseGet, cachedCompaniesHouseGetAllPages, invalidateCompany, KINDS, NOT_FOUND_SECONDS, figuresSk, cacheSk } =
  await import("@app/services/companiesHouseCache.js");

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
