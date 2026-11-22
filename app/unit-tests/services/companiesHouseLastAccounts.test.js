// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseLastAccounts.test.js
// A company's last filed accounts mapped to the figures of their own year. Every document in
// app/unit-tests/fixtures/filed-accounts/ is mapped: the ones our builders write, ones written as
// other software writes them, and any real filed document added there. expected.json holds the
// figures a document must give; a document it does not name must map to figures that hold together.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, expect, vi, beforeEach } from "vitest";

const mockNewestAccountsFiling = vi.fn();
const mockDocumentOfItem = vi.fn();
vi.mock("@app/services/companiesHouseFiledAccounts.js", () => ({
  newestAccountsFiling: (...args) => mockNewestAccountsFiling(...args),
  documentOfItem: (...args) => mockDocumentOfItem(...args),
}));

const cache = new Map();
const mockGetCachedValue = vi.fn(async (key) => cache.get(key) ?? null);
const mockPutCachedValue = vi.fn(async (key, value) => cache.set(key, value));
vi.mock("@app/data/dynamoDbSecurityStateRepository.js", () => ({
  getCachedValue: (...args) => mockGetCachedValue(...args),
  putCachedValue: (...args) => mockPutCachedValue(...args),
}));

// The newest accounts filing answers this transaction id; each test sets what its document read gives.
const mockFetchLastFiledAccounts = {
  mockResolvedValue(read) {
    if (read.chResponse) mockNewestAccountsFiling.mockResolvedValue({ chResponse: read.chResponse });
    else if (read.problem === "no-accounts") mockNewestAccountsFiling.mockResolvedValue({ problem: "no-accounts" });
    else {
      mockNewestAccountsFiling.mockResolvedValue({ item: { transaction_id: "TX1" } });
      mockDocumentOfItem.mockResolvedValue(read);
    }
  },
};

const { mapLastAccounts, readLastAccounts } = await import("@app/services/companiesHouseLastAccounts.js");

const FIXTURES = "app/unit-tests/fixtures/filed-accounts";
const expected = JSON.parse(readFileSync(join(FIXTURES, "expected.json"), "utf8"));
const documents = readdirSync(FIXTURES).filter((name) => /\.(xhtml|html)$/.test(name));

describe("mapLastAccounts over the filed documents", () => {
  test("the directory holds documents of both regimes, from our builders and from other software", () => {
    expect(documents.length).toBeGreaterThanOrEqual(4);
    expect(documents.filter((name) => name.startsWith("other-software-")).length).toBeGreaterThanOrEqual(2);
  });

  test.each(documents)("%s maps to the figures of its own year", (name) => {
    const mapped = mapLastAccounts(readFileSync(join(FIXTURES, name), "utf8"));
    expect(["micro", "small"]).toContain(mapped.regime);
    expect(mapped.period.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const figures = Object.values(mapped.balanceSheet);
    expect(figures.length).toBeGreaterThan(0);
    figures.forEach((figure) => expect(Number.isFinite(figure)).toBe(true));
    expect(mapped.balanceSheet.netAssets).toBe(mapped.balanceSheet.capitalAndReserves);
    if (mapped.profitAndLoss) {
      Object.values(mapped.profitAndLoss.figures).forEach((figure) => expect(Number.isFinite(figure)).toBe(true));
    }
    if (expected[name]) expect(mapped).toMatchObject(expected[name]);
  });

  test("another software's prefixes, context ids, scale, sign and repeated fact read as the same figures", () => {
    const mapped = mapLastAccounts(readFileSync(join(FIXTURES, "other-software-micro-entity-both-years.xhtml"), "utf8"));
    expect(mapped.balanceSheet).toMatchObject({ fixedAssets: 1000, profitAndLossAccount: -600, capitalAndReserves: -500 });
  });

  test("a document with its own year only maps, with no prior year needed", () => {
    const mapped = mapLastAccounts(readFileSync(join(FIXTURES, "other-software-small-company-current-year-only.xhtml"), "utf8"));
    expect(mapped.balanceSheet.capitalAndReserves).toBe(20000);
  });

  test("a document that is not accounts throws", () => {
    expect(() => mapLastAccounts("<html><body>Scanned accounts</body></html>")).toThrow();
  });
});

describe("readLastAccounts", () => {
  const SET = { transactionId: "TX1", madeUpDate: "2026-06-30", filedOn: "2026-09-20", paperFiled: false };

  beforeEach(() => {
    mockNewestAccountsFiling.mockReset();
    mockDocumentOfItem.mockReset();
    cache.clear();
    mockPutCachedValue.mockClear();
    delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
  });

  test("answers the mapped figures of an iXBRL set", async () => {
    mockFetchLastFiledAccounts.mockResolvedValue({
      set: SET,
      document: readFileSync(join(FIXTURES, "builder-micro-entity-both-years.xhtml"), "utf8"),
    });
    const answer = await readLastAccounts("09876543");
    expect(answer.outcome).toBe("mapped");
    expect(answer.set).toEqual(SET);
    expect(answer.accounts).toMatchObject(expected["builder-micro-entity-both-years.xhtml"]);
  });

  test.each([
    [{ problem: "no-accounts" }, "none"],
    [{ problem: "no-ixbrl", set: { ...SET, paperFiled: true } }, "paper"],
    [{ problem: "no-ixbrl", set: SET }, "no-ixbrl"],
    [{ problem: "too-large", set: SET }, "too-large"],
  ])("answers why there are no figures for %j", async (read, outcome) => {
    mockFetchLastFiledAccounts.mockResolvedValue(read);
    const answer = await readLastAccounts("09876543");
    expect(answer.outcome).toBe(outcome);
    expect(answer.accounts).toBeUndefined();
  });

  test("answers unreadable, with the reason, for a document that does not read as accounts", async () => {
    mockFetchLastFiledAccounts.mockResolvedValue({ set: SET, document: "<html><body>Scanned accounts</body></html>" });
    const answer = await readLastAccounts("09876543");
    expect(answer.outcome).toBe("unreadable");
    expect(answer.reason).toEqual(expect.any(String));
  });

  test("answers unreadable for a document whose markup is nested too deeply to read", async () => {
    const depth = 50000;
    const document = `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"><body>${"<div>".repeat(depth)}x${"</div>".repeat(depth)}</body></html>`;
    mockFetchLastFiledAccounts.mockResolvedValue({ set: SET, document });
    const answer = await readLastAccounts("09876543");
    expect(answer.outcome).toBe("unreadable");
    expect(answer.reason).toBe("The document's markup is nested too deeply to read.");
  });

  test("answers unreadable, and no figures, for a document that states another company's number", async () => {
    mockFetchLastFiledAccounts.mockResolvedValue({
      set: SET,
      document: readFileSync(join(FIXTURES, "builder-micro-entity-both-years.xhtml"), "utf8"),
    });
    const answer = await readLastAccounts("04549236");
    expect(answer.outcome).toBe("unreadable");
    expect(answer.accounts).toBeUndefined();
    expect(answer.reason).toBe("The document states the company number 09876543, not 04549236.");
  });

  test("answers a reason of at most 300 characters when the document's own text is quoted in it", async () => {
    const document = readFileSync(join(FIXTURES, "builder-micro-entity-both-years.xhtml"), "utf8").replace(
      /(<ix:nonFraction[^>]*format=")[^"]*(")/,
      `$1ixt:${"x".repeat(5000)}$2`,
    );
    mockFetchLastFiledAccounts.mockResolvedValue({ set: SET, document });
    const answer = await readLastAccounts("09876543");
    expect(answer.outcome).toBe("unreadable");
    expect(answer.reason.length).toBeLessThanOrEqual(301);
    expect(answer.reason.endsWith("…")).toBe(true);
  });

  test("answers a repeat for the same filing from its cache, reading no document", async () => {
    process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
    mockFetchLastFiledAccounts.mockResolvedValue({
      set: SET,
      document: readFileSync(join(FIXTURES, "builder-micro-entity-both-years.xhtml"), "utf8"),
    });
    const first = await readLastAccounts("09876543");
    const second = await readLastAccounts("09876543");
    expect(second).toEqual(first);
    expect(mockDocumentOfItem).toHaveBeenCalledTimes(1);
    expect(mockPutCachedValue).toHaveBeenCalledWith("lastaccounts#09876543#TX1", first, 7 * 24 * 60 * 60);
  });

  test.each([
    [{ problem: "no-ixbrl", set: { ...SET, paperFiled: true } }, "paper", 7 * 24 * 60 * 60],
    [{ problem: "no-ixbrl", set: SET }, "no-ixbrl", 7 * 24 * 60 * 60],
    [{ problem: "too-large", set: SET }, "too-large", 60 * 60],
    [{ set: SET, document: "<html><body>Scanned accounts</body></html>" }, "unreadable", 60 * 60],
  ])("keeps the answer for %j in the cache for as long as its outcome holds", async (read, outcome, seconds) => {
    process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
    mockFetchLastFiledAccounts.mockResolvedValue(read);
    const answer = await readLastAccounts("09876543");
    expect(answer.outcome).toBe(outcome);
    expect(mockPutCachedValue).toHaveBeenCalledWith("lastaccounts#09876543#TX1", answer, seconds);
  });

  test("reads the document when the cache cannot be read or written", async () => {
    process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
    mockGetCachedValue.mockRejectedValueOnce(new Error("no such table"));
    mockPutCachedValue.mockRejectedValueOnce(new Error("no such table"));
    mockFetchLastFiledAccounts.mockResolvedValue({
      set: SET,
      document: readFileSync(join(FIXTURES, "builder-micro-entity-both-years.xhtml"), "utf8"),
    });
    expect((await readLastAccounts("09876543")).outcome).toBe("mapped");
  });

  test("does not cache a failed read from Companies House", async () => {
    process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
    mockNewestAccountsFiling.mockResolvedValue({ item: { transaction_id: "TX9" } });
    mockDocumentOfItem.mockResolvedValue({ chResponse: { ok: false, status: 429 } });
    await readLastAccounts("09876543");
    expect(cache.has("lastaccounts#09876543#TX9")).toBe(false);
  });

  test("passes on a failed read from Companies House", async () => {
    const chResponse = { ok: false, status: 429 };
    mockFetchLastFiledAccounts.mockResolvedValue({ chResponse });
    expect(await readLastAccounts("09876543")).toEqual({ chResponse });
  });
});
