// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockReadMetadata = vi.fn();
const mockGetVersion = vi.fn();
vi.mock("@app/data/s3DiyaGlRepository.js", () => ({
  readMetadata: (...args) => mockReadMetadata(...args),
  getVersion: (...args) => mockGetVersion(...args),
}));

const mockReadBookSource = vi.fn();
vi.mock("@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js", () => ({
  readBookSource: (...args) => mockReadBookSource(...args),
}));

vi.mock("@diy-accounting-uk/diya-gl/dist/app/lib/products.js", () => ({
  PRODUCTS: { ltd: {} },
}));

const mockDeriveMicroEntityAccounts = vi.fn();
vi.mock("@app/services/microEntityAccounts.js", () => ({
  deriveMicroEntityAccounts: (...args) => mockDeriveMicroEntityAccounts(...args),
}));

const mockS3Send = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send(...args) {
      return mockS3Send(...args);
    }
  },
  PutObjectCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const { handler } = await import("../../functions/analytics/companyBookPull.js");

const BOOK_ID = "company-book-id";
const OWNER_PREFIX = "a".repeat(64);
const BOOK = { documentInfo: {} };
const LINES = [];
const ACCOUNTS = { companyName: "DIY Accounting Limited", balanceSheet: { currentYear: {}, priorYear: {} } };

function stubBook({ retention = "resident", latestVersion = 3 } = {}) {
  mockReadMetadata.mockResolvedValue({ metadata: { retention, latestVersion }, metaETag: "meta-etag" });
  mockGetVersion.mockResolvedValue({ bytes: Buffer.from("zip-bytes"), etag: "version-etag" });
  mockReadBookSource.mockResolvedValue({ product: "ltd", book: BOOK, lines: LINES });
  mockDeriveMicroEntityAccounts.mockResolvedValue(ACCOUNTS);
}

describe("companyBookPull", () => {
  beforeEach(() => {
    mockReadMetadata.mockReset();
    mockGetVersion.mockReset();
    mockReadBookSource.mockReset();
    mockDeriveMicroEntityAccounts.mockReset();
    mockS3Send.mockReset();
    mockS3Send.mockResolvedValue({});

    process.env.COMPANY_BOOK_ID = BOOK_ID;
    process.env.COMPANY_BOOK_OWNER_PREFIX = OWNER_PREFIX;
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "test-lake-bucket";
  });

  afterEach(() => {
    delete process.env.COMPANY_BOOK_ID;
    delete process.env.COMPANY_BOOK_OWNER_PREFIX;
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    vi.restoreAllMocks();
  });

  test("reads metadata then the latest version, both under the configured prefix and book id", async () => {
    stubBook({ latestVersion: 5 });

    await handler({ date: "2026-09-25" });

    expect(mockReadMetadata).toHaveBeenCalledWith(OWNER_PREFIX, BOOK_ID);
    expect(mockGetVersion).toHaveBeenCalledWith(OWNER_PREFIX, BOOK_ID, 5);
  });

  test("throws when the book has no metadata", async () => {
    mockReadMetadata.mockResolvedValue(null);

    await expect(handler({ date: "2026-09-25" })).rejects.toThrow(/No book/);
    expect(mockGetVersion).not.toHaveBeenCalled();
  });

  test("throws when the book's retention is sandbox", async () => {
    stubBook({ retention: "sandbox" });

    await expect(handler({ date: "2026-09-25" })).rejects.toThrow(/retention/);
    expect(mockGetVersion).not.toHaveBeenCalled();
  });

  test("throws when COMPANY_BOOK_ID is blank", async () => {
    delete process.env.COMPANY_BOOK_ID;

    await expect(handler({ date: "2026-09-25" })).rejects.toThrow(/COMPANY_BOOK_ID/);
    expect(mockReadMetadata).not.toHaveBeenCalled();
  });

  test("throws when COMPANY_BOOK_OWNER_PREFIX is blank", async () => {
    delete process.env.COMPANY_BOOK_OWNER_PREFIX;

    await expect(handler({ date: "2026-09-25" })).rejects.toThrow(/COMPANY_BOOK_OWNER_PREFIX/);
    expect(mockReadMetadata).not.toHaveBeenCalled();
  });

  test("throws when ANALYTICS_LAKE_BUCKET_NAME is blank", async () => {
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;

    await expect(handler({ date: "2026-09-25" })).rejects.toThrow(/ANALYTICS_LAKE_BUCKET_NAME/);
    expect(mockReadMetadata).not.toHaveBeenCalled();
  });

  test("writes one line under curated/finance/ carrying the version and ETag", async () => {
    stubBook({ latestVersion: 5 });

    const result = await handler({ date: "2026-09-25" });

    expect(mockS3Send).toHaveBeenCalledTimes(1);
    const call = mockS3Send.mock.calls[0][0].input;
    expect(call.Bucket).toBe("test-lake-bucket");
    expect(call.Key).toBe("curated/finance/dt=2026-09-25/company-accounts.json");

    const lines = call.Body.trimEnd().split("\n");
    expect(lines).toHaveLength(1);
    const observation = JSON.parse(lines[0]);
    expect(observation.latestVersion).toBe(5);
    expect(observation.latestETag).toBe("version-etag");
    expect(observation.accounts).toEqual(ACCOUNTS);

    expect(result.key).toBe("curated/finance/dt=2026-09-25/company-accounts.json");
    expect(result.latestVersion).toBe(5);
    expect(result.latestETag).toBe("version-etag");
  });

  test("defaults the date to today in UTC when no date is given", async () => {
    stubBook();

    const result = await handler();

    const expected = new Date().toISOString().slice(0, 10);
    expect(result.date).toBe(expected);
  });
});
