// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/dueListBusinessPut.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dueListEvent, responseBody } from "@app/test-helpers/dueListRouteDoubles.js";

const mockEnforceBundles = vi.fn();
vi.mock("@app/services/bundleManagement.js", async (importOriginal) => ({
  ...(await importOriginal()),
  enforceBundles: (...args) => mockEnforceBundles(...args),
}));
const storedAs = (id, fields) => ({ hashedSub: "h", sk: `business#${id}`, businessId: id, ...fields });
const mockPutBusiness = vi.fn(async (userSub, { id, ...fields }) => ({ item: storedAs(id, fields), created: true }));
const mockDeleteBusiness = vi.fn();
vi.mock("@app/data/dynamoDbDueListRepository.js", async (importOriginal) => {
  const { DueListFullError, DueListBusyError } = await importOriginal();
  return {
    DueListFullError,
    DueListBusyError,
    putBusiness: (...args) => mockPutBusiness(...args),
    deleteBusiness: (...args) => mockDeleteBusiness(...args),
  };
});
vi.mock("@app/services/subHasher.js", async (importOriginal) => ({ ...(await importOriginal()), initializeSalt: async () => {} }));

const { ingestHandler } = await import("@app/functions/account/dueListBusinessPut.js");
const { BundleEntitlementError } = await import("@app/services/bundleManagement.js");
const { DueListFullError, DueListBusyError } = await import("@app/data/dynamoDbDueListRepository.js");

const put = (id, body) => dueListEvent({ method: "PUT", path: `/api/v1/due-list/businesses/${id}`, pathParameters: { id }, body });
const del = (id) => dueListEvent({ method: "DELETE", path: `/api/v1/due-list/businesses/${id}`, pathParameters: { id } });

describe("functions/dueListBusinessPut", () => {
  beforeEach(() => {
    mockEnforceBundles.mockReset().mockResolvedValue({ userSub: "user-1" });
    mockPutBusiness.mockClear();
    mockDeleteBusiness.mockReset();
  });

  test("stores a company with its normalised number and a refresh from today", async () => {
    const response = await ingestHandler(put("c1", { kind: "company", label: " Acme Ltd ", companyNumber: "sc000001" }));

    expect(response.statusCode).toBe(200);
    const [, stored] = mockPutBusiness.mock.calls[0];
    expect(stored).toMatchObject({ id: "c1", kind: "company", label: "Acme Ltd", companyNumber: "SC000001", job: "refresh" });
    expect(stored.jobOn).toBe(new Date().toISOString().slice(0, 10));
    expect(responseBody(response).business).not.toHaveProperty("hashedSub");
  });

  test("stores a VAT business with no refresh job, and answers the stored business with the time HMRC was last read", async () => {
    mockPutBusiness.mockResolvedValueOnce({
      item: storedAs("v1", { kind: "vat", label: "Shop", hmrcReadAt: "2026-11-01T10:00:00.000Z" }),
      created: false,
    });

    const response = await ingestHandler(put("v1", { kind: "vat", label: "Shop" }));

    const [, stored] = mockPutBusiness.mock.calls[0];
    expect(stored).toEqual({ id: "v1", kind: "vat", label: "Shop" });
    expect(responseBody(response).business.hmrcReadAt).toBe("2026-11-01T10:00:00.000Z");
  });

  test("answers a JSON 409 when the write is refused because the account holds 50 businesses", async () => {
    mockPutBusiness.mockRejectedValueOnce(new DueListFullError("businesses"));

    const response = await ingestHandler(put("new", { kind: "vat", label: "Shop" }));

    expect(response.statusCode).toBe(409);
    expect(responseBody(response)).toMatchObject({ message: "The due list holds at most 50 businesses", reason: "due_list_full" });
  });

  test("answers a JSON 409 when other writes kept changing the same items", async () => {
    mockPutBusiness.mockRejectedValueOnce(new DueListBusyError());
    mockDeleteBusiness.mockRejectedValueOnce(new DueListBusyError());

    for (const response of [await ingestHandler(put("b1", { kind: "vat", label: "Shop" })), await ingestHandler(del("b1"))]) {
      expect(response.statusCode).toBe(409);
      expect(responseBody(response)).toMatchObject({ reason: "due_list_busy" });
    }
  });

  test.each([
    [{ kind: "company", label: "Acme", companyNumber: "not-a-number" }, "companyNumber must be an 8-character company number"],
    [{ kind: "company", label: "Acme" }, "companyNumber must be an 8-character company number"],
    [{ kind: "vat", label: "Shop", companyNumber: "00000001" }, "A vat business holds no companyNumber"],
    [{ kind: "vat", label: "Shop", vrn: "123456789" }, "A business holds no field vrn"],
    [{ kind: "sole-trader", label: "Me", nino: "AA123456A" }, "A business holds no field nino"],
    [{ kind: "shop", label: "Shop" }, "kind must be one of company, watched, vat, sole-trader"],
    [{ kind: "vat", label: "" }, "label must be text of 1 to 100 characters"],
    [{ kind: "vat", label: "Shop", itsa: true }, "A vat business holds no itsa"],
  ])("refuses %j with a JSON 400 and stores nothing", async (body, reason) => {
    const response = await ingestHandler(put("b1", body));
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(responseBody(response))).toContain(reason);
    expect(mockPutBusiness).not.toHaveBeenCalled();
  });

  test.each([
    "123456789",
    "GB123456789",
    "1234567890",
    "1234567890K",
    "12345678",
    "SC123456",
    "R0000001",
    "AB123456C",
    "ab123456",
    "12-34-56-78",
  ])("refuses the business id %s, which has the form of an identifier, for a write and for a removal", async (id) => {
    for (const response of [await ingestHandler(put(id, { kind: "vat", label: "Shop" })), await ingestHandler(del(id))]) {
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(responseBody(response))).toContain("not a VAT number, a UTR, a National Insurance number or a company number");
    }
    expect(mockPutBusiness).not.toHaveBeenCalled();
    expect(mockDeleteBusiness).not.toHaveBeenCalled();
  });

  test.each(["x-1234567890", "vat-gb-123456789", "jane-qq123456c"])(
    "refuses the business id %s, which holds an identifier inside it, with a JSON 400",
    async (id) => {
      const response = await ingestHandler(put(id, { kind: "vat", label: "Shop" }));
      expect(response.statusCode).toBe(400);
      expect(mockPutBusiness).not.toHaveBeenCalled();
    },
  );

  test.each(["1", "42", "2024", "1234567", "12345678901", "1234567890123"])(
    "takes the business id %s, a number of no identifier's length",
    async (id) => {
      expect((await ingestHandler(put(id, { kind: "vat", label: "Shop" }))).statusCode).toBe(200);
    },
  );

  test.each(["3f2b8c1e-9d4a-4f6b-8a2c-5e7d9b1a0c3f", "shop-1", "b1", "kq7x2m9p"])("takes the made-up business id %s", async (id) => {
    expect((await ingestHandler(put(id, { kind: "vat", label: "Shop" }))).statusCode).toBe(200);
  });

  test("refuses a business id that is not letters, digits or hyphens", async () => {
    const response = await ingestHandler(put("b/1", { kind: "vat", label: "Shop" }));
    expect(response.statusCode).toBe(400);
  });

  test("removes a business and its rows, and answers a JSON 404 for one the account does not hold", async () => {
    mockDeleteBusiness.mockResolvedValueOnce(3).mockResolvedValueOnce(0);

    const removed = await ingestHandler(del("b1"));
    expect(removed.statusCode).toBe(200);
    expect(responseBody(removed)).toMatchObject({ removed: 3 });
    expect(mockDeleteBusiness).toHaveBeenCalledWith("user-1", "b1");

    const missing = await ingestHandler(del("b9"));
    expect(missing.statusCode).toBe(404);
    expect(responseBody(missing).message).toBe("No such business on the due list");
  });

  test("answers a JSON 403 for an account without the due list activity, and changes nothing", async () => {
    mockEnforceBundles.mockRejectedValue(new BundleEntitlementError("Forbidden", { code: "BUNDLE_FORBIDDEN" }));
    expect((await ingestHandler(put("b1", { kind: "vat", label: "Shop" }))).statusCode).toBe(403);
    expect((await ingestHandler(del("b1"))).statusCode).toBe(403);
    expect(mockPutBusiness).not.toHaveBeenCalled();
    expect(mockDeleteBusiness).not.toHaveBeenCalled();
  });
});
