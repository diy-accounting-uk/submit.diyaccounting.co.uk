// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/dueListRowsPost.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dueListEvent, responseBody } from "@app/test-helpers/dueListRouteDoubles.js";

const mockEnforceBundles = vi.fn();
vi.mock("@app/services/bundleManagement.js", async (importOriginal) => ({
  ...(await importOriginal()),
  enforceBundles: (...args) => mockEnforceBundles(...args),
}));
const mockList = vi.fn();
const mockPutRows = vi.fn(async () => ({ written: 1, refreshed: 0, removed: 0 }));
const mockPutBusiness = vi.fn(async () => ({}));
vi.mock("@app/data/dynamoDbDueListRepository.js", async (importOriginal) => ({
  rowSk: (await importOriginal()).rowSk,
  listBusinessesAndRows: (...args) => mockList(...args),
  putRows: (...args) => mockPutRows(...args),
  putBusiness: (...args) => mockPutBusiness(...args),
}));
vi.mock("@app/services/subHasher.js", async (importOriginal) => ({ ...(await importOriginal()), initializeSalt: async () => {} }));

const { ingestHandler } = await import("@app/functions/account/dueListRowsPost.js");
const { BundleEntitlementError } = await import("@app/services/bundleManagement.js");

const ROW = {
  type: "vat-return",
  filterType: "vat",
  periodStart: "2026-07-01",
  periodEnd: "2026-09-30",
  dueDate: "2026-11-07",
  kind: "filing",
  source: "hmrc",
};
const post = (body) => dueListEvent({ method: "POST", path: "/api/v1/due-list/rows", body });
const BUSINESS = { hashedSub: "h", sk: "business#v1", businessId: "v1", kind: "vat", label: "Shop", sub: "user-1" };

describe("functions/dueListRowsPost", () => {
  beforeEach(() => {
    mockEnforceBundles.mockReset().mockResolvedValue({ userSub: "user-1" });
    mockList.mockReset().mockResolvedValue({ businesses: [BUSINESS], rows: [] });
    mockPutRows.mockClear();
    mockPutBusiness.mockClear();
  });

  test("stores the rows with the server's read time and records on the business when HMRC was read", async () => {
    const before = Date.now();
    const response = await ingestHandler(post({ businessId: "v1", rows: [ROW] }));

    expect(response.statusCode).toBe(200);
    const [userSub, rows, replaces] = mockPutRows.mock.calls[0];
    expect(userSub).toBe("user-1");
    expect(rows).toEqual([{ ...ROW, businessId: "v1", readAt: expect.any(String) }]);
    expect(Date.parse(rows[0].readAt)).toBeGreaterThanOrEqual(before);
    expect(typeof replaces).toBe("function");
    const [, business] = mockPutBusiness.mock.calls[0];
    expect(business).toEqual({ kind: "vat", label: "Shop", id: "v1", hmrcReadAt: rows[0].readAt });
  });

  test("replaces the business's HMRC rows and its computed rows of the same types, and no other business's", async () => {
    await ingestHandler(post({ businessId: "v1", rows: [ROW] }));
    const replaces = mockPutRows.mock.calls[0][2];

    expect(replaces({ businessId: "v1", source: "hmrc", type: "vat-payment" })).toBe(true);
    expect(replaces({ businessId: "v1", source: "computed", type: "vat-return" })).toBe(true);
    expect(replaces({ businessId: "v1", source: "computed", type: "vat-payment" })).toBe(false);
    expect(replaces({ businessId: "v1", source: "user", type: "vat-return" })).toBe(false);
    expect(replaces({ businessId: "v2", source: "hmrc", type: "vat-return" })).toBe(false);
  });

  test.each([
    ["vrn", "123456789"],
    ["nino", "AA123456A"],
    ["periodKey", "18A2"],
    ["amount", 1250.5],
  ])("refuses a row that holds %s with a JSON 400 and stores nothing", async (field, value) => {
    const response = await ingestHandler(post({ businessId: "v1", rows: [{ ...ROW, [field]: value }] }));

    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(responseBody(response))).toContain(`rows[0] holds a field a due list row does not keep: ${field}`);
    expect(mockPutRows).not.toHaveBeenCalled();
    expect(mockPutBusiness).not.toHaveBeenCalled();
  });

  test.each([
    [{ ...ROW, source: "computed" }, "rows[0].source must be hmrc"],
    [{ ...ROW, dueDate: "07/11/2026" }, "rows[0].dueDate must be YYYY-MM-DD"],
    [{ ...ROW, kind: "reminder" }, "rows[0].kind must be filing or payment"],
    [{ ...ROW, periodEnd: "30/09/2026" }, "rows[0].periodEnd must be YYYY-MM-DD"],
  ])("refuses the row %j with a JSON 400", async (row, reason) => {
    const response = await ingestHandler(post({ businessId: "v1", rows: [row] }));
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(responseBody(response))).toContain(reason);
  });

  test("keys a row with no period end by its due date", async () => {
    const { periodStart, periodEnd, ...finalDeclaration } = {
      ...ROW,
      type: "itsa-final-declaration",
      filterType: "itsa",
      dueDate: "2028-01-31",
    };

    const response = await ingestHandler(post({ businessId: "v1", rows: [finalDeclaration] }));

    expect(response.statusCode).toBe(200);
    const [row] = mockPutRows.mock.calls[0][1];
    expect(row).toMatchObject({ type: "itsa-final-declaration", dueDate: "2028-01-31", date: "2028-01-31" });
    expect(row).not.toHaveProperty("periodEnd");
    expect(periodStart && periodEnd).toBeTruthy();
  });

  test("refuses a request field outside the business id and the rows", async () => {
    const response = await ingestHandler(post({ businessId: "v1", rows: [ROW], vrn: "123456789" }));
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(responseBody(response))).toContain("The request holds no field vrn");
  });

  test("answers a JSON 404 for a business the account does not hold", async () => {
    const response = await ingestHandler(post({ businessId: "other", rows: [ROW] }));
    expect(response.statusCode).toBe(404);
    expect(mockPutRows).not.toHaveBeenCalled();
  });

  test("refuses rows that would take the account past 500 rows with a JSON 409", async () => {
    const otherRows = Array.from({ length: 500 }, (unused, index) => ({
      sk: `row#v2#accounts#${index}`,
      businessId: "v2",
      source: "computed",
      type: "accounts",
    }));
    mockList.mockResolvedValue({ businesses: [BUSINESS], rows: otherRows });

    const response = await ingestHandler(post({ businessId: "v1", rows: [ROW] }));

    expect(response.statusCode).toBe(409);
    expect(responseBody(response).message).toBe("The due list holds at most 500 rows");
    expect(mockPutRows).not.toHaveBeenCalled();
  });

  test("counts the rows a write replaces as gone when it checks the 500", async () => {
    const replaced = Array.from({ length: 500 }, (unused, index) => ({
      sk: `row#v1#vat-payment#${index}`,
      businessId: "v1",
      source: "hmrc",
      type: "vat-payment",
    }));
    mockList.mockResolvedValue({ businesses: [BUSINESS], rows: replaced });
    expect((await ingestHandler(post({ businessId: "v1", rows: [ROW] }))).statusCode).toBe(200);
  });

  test("answers a JSON 403 for an account without the due list activity", async () => {
    mockEnforceBundles.mockRejectedValue(new BundleEntitlementError("Forbidden", { code: "BUNDLE_FORBIDDEN" }));
    expect((await ingestHandler(post({ businessId: "v1", rows: [ROW] }))).statusCode).toBe(403);
    expect(mockPutRows).not.toHaveBeenCalled();
  });
});
