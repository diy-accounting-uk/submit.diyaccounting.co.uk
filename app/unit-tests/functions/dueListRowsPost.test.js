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
const mockPutRows = vi.fn(async () => ({ written: 1, refreshed: 0, removed: 0, unwritten: [] }));
vi.mock("@app/data/dynamoDbDueListRepository.js", async (importOriginal) => {
  const { DueListBusinessMissingError, DueListFullError, DueListBusyError } = await importOriginal();
  return { DueListBusinessMissingError, DueListFullError, DueListBusyError, putRows: (...args) => mockPutRows(...args) };
});
vi.mock("@app/services/subHasher.js", async (importOriginal) => ({ ...(await importOriginal()), initializeSalt: async () => {} }));

const { ingestHandler } = await import("@app/functions/account/dueListRowsPost.js");
const { BundleEntitlementError } = await import("@app/services/bundleManagement.js");
const { DueListBusinessMissingError, DueListFullError, DueListBusyError } = await import("@app/data/dynamoDbDueListRepository.js");

const ROW = {
  type: "vat-return",
  filterType: "taxes",
  periodStart: "2026-07-01",
  periodEnd: "2026-09-30",
  dueDate: "2026-11-07",
  kind: "filing",
  source: "hmrc",
};
const post = (body) => dueListEvent({ method: "POST", path: "/api/v1/due-list/rows", body });

describe("functions/dueListRowsPost", () => {
  beforeEach(() => {
    mockEnforceBundles.mockReset().mockResolvedValue({ userSub: "user-1" });
    mockPutRows.mockClear();
  });

  test("stores the rows with the server's read time and records on the business when HMRC was read", async () => {
    const before = Date.now();
    const response = await ingestHandler(post({ businessId: "v1", rows: [ROW] }));

    expect(response.statusCode).toBe(200);
    const [userSub, rows, replaces, options] = mockPutRows.mock.calls[0];
    expect(userSub).toBe("user-1");
    expect(rows).toEqual([{ ...ROW, businessId: "v1", readAt: expect.any(String) }]);
    expect(Date.parse(rows[0].readAt)).toBeGreaterThanOrEqual(before);
    expect(typeof replaces).toBe("function");
    expect(options).toEqual({ forBusiness: { id: "v1", set: { hmrcReadAt: rows[0].readAt } } });
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
  });

  test.each([
    [{ ...ROW, source: "computed" }, "rows[0].source must be hmrc"],
    [{ ...ROW, dueDate: "07/11/2026" }, "rows[0].dueDate must be YYYY-MM-DD"],
    [{ ...ROW, kind: "reminder" }, "rows[0].kind must be filing or payment"],
    [{ ...ROW, periodEnd: "30/09/2026" }, "rows[0].periodEnd must be YYYY-MM-DD"],
    [{ ...ROW, periodEnd: "2026-02-31" }, "rows[0].periodEnd must be YYYY-MM-DD"],
    [{ ...ROW, dueDate: "2026-11-31" }, "rows[0].dueDate must be YYYY-MM-DD"],
  ])("refuses the row %j with a JSON 400", async (row, reason) => {
    const response = await ingestHandler(post({ businessId: "v1", rows: [row] }));
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(responseBody(response))).toContain(reason);
  });

  test.each([
    [{ ...ROW, type: "123456789" }, "rows[0].type must be one of accounts, confirmation-statement"],
    [{ ...ROW, type: "ab123456c" }, "rows[0].type must be one of"],
    [{ ...ROW, type: "taxes" }, "rows[0].type must be one of"],
    [{ ...ROW, type: "identity-verification", filterType: "people" }, "rows[0].type must be one of"],
    [{ ...ROW, filterType: "123456789" }, "rows[0].filterType must be taxes for vat-return"],
    [{ ...ROW, filterType: "people" }, "rows[0].filterType must be taxes for vat-return"],
    [{ ...ROW, filterType: null }, "rows[0].filterType must be taxes for vat-return"],
  ])("refuses the row %j, whose type or filter is not one the due list names, and stores nothing", async (row, reason) => {
    const response = await ingestHandler(post({ businessId: "v1", rows: [row] }));

    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(responseBody(response))).toContain(reason);
    expect(mockPutRows).not.toHaveBeenCalled();
  });

  test("stores the filter of the row's type when the page sends none", async () => {
    const { filterType, ...row } = ROW;

    await ingestHandler(post({ businessId: "v1", rows: [row, { ...row, type: "confirmation-statement" }] }));

    expect(filterType).toBe("taxes");
    expect(mockPutRows.mock.calls[0][1].map((stored) => stored.filterType)).toEqual(["taxes", "shareholders"]);
  });

  test.each(["123456789", "GB123456789", "1234567890", "12345678", "SC123456", "AB123456C", "ab-12-34-56-c", "123-456-789"])(
    "refuses the business id %s, which has the form of an identifier, and stores nothing",
    async (businessId) => {
      const response = await ingestHandler(post({ businessId, rows: [ROW] }));

      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(responseBody(response))).toContain("not a VAT number, a UTR, a National Insurance number or a company number");
      expect(mockPutRows).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["the same type and period end", [ROW, { ...ROW, dueDate: "2026-11-08" }]],
    [
      "the same type and due date with no period end",
      [
        { type: "sa-balancing-payment", dueDate: "2028-01-31", kind: "payment", source: "hmrc" },
        { type: "sa-balancing-payment", dueDate: "2028-01-31", kind: "payment", source: "hmrc" },
      ],
    ],
  ])("refuses two rows of %s with a JSON 400 and stores nothing", async (_, rows) => {
    const response = await ingestHandler(post({ businessId: "v1", rows }));

    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(responseBody(response))).toContain("rows[1] repeats the type and period of rows[0]");
    expect(mockPutRows).not.toHaveBeenCalled();
  });

  test("keys a row with no period end by its due date", async () => {
    const { periodStart, periodEnd, ...finalDeclaration } = {
      ...ROW,
      type: "itsa-final-declaration",
      filterType: "taxes",
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

  test("answers a JSON 404 when the write finds the business is not on the account's list", async () => {
    mockPutRows.mockRejectedValueOnce(new DueListBusinessMissingError());

    const response = await ingestHandler(post({ businessId: "other", rows: [ROW] }));

    expect(response.statusCode).toBe(404);
    expect(responseBody(response).message).toBe("No such business on the due list");
  });

  test("answers a JSON 409 when other writes kept changing the same items", async () => {
    mockPutRows.mockRejectedValueOnce(new DueListBusyError());

    const response = await ingestHandler(post({ businessId: "v1", rows: [ROW] }));

    expect(response.statusCode).toBe(409);
    expect(responseBody(response)).toMatchObject({ reason: "due_list_busy" });
  });

  test("answers a JSON 409 when the write is refused because the account holds 500 rows", async () => {
    mockPutRows.mockRejectedValueOnce(new DueListFullError("rows"));

    const response = await ingestHandler(post({ businessId: "v1", rows: [ROW] }));

    expect(response.statusCode).toBe(409);
    expect(responseBody(response)).toMatchObject({ message: "The due list holds at most 500 rows", reason: "due_list_rows_full" });
  });

  test("answers a JSON 403 for an account without the due list activity", async () => {
    mockEnforceBundles.mockRejectedValue(new BundleEntitlementError("Forbidden", { code: "BUNDLE_FORBIDDEN" }));
    expect((await ingestHandler(post({ businessId: "v1", rows: [ROW] }))).statusCode).toBe(403);
    expect(mockPutRows).not.toHaveBeenCalled();
  });
});
