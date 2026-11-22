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
const mockList = vi.fn();
const mockPutBusiness = vi.fn(async (userSub, { id, ...fields }) => ({ hashedSub: "h", sk: `business#${id}`, businessId: id, ...fields }));
const mockDeleteBusiness = vi.fn();
vi.mock("@app/data/dynamoDbDueListRepository.js", () => ({
  listBusinessesAndRows: (...args) => mockList(...args),
  putBusiness: (...args) => mockPutBusiness(...args),
  deleteBusiness: (...args) => mockDeleteBusiness(...args),
}));
vi.mock("@app/services/subHasher.js", async (importOriginal) => ({ ...(await importOriginal()), initializeSalt: async () => {} }));

const { ingestHandler } = await import("@app/functions/account/dueListBusinessPut.js");
const { BundleEntitlementError } = await import("@app/services/bundleManagement.js");

const put = (id, body) => dueListEvent({ method: "PUT", path: `/api/v1/due-list/businesses/${id}`, pathParameters: { id }, body });
const del = (id) => dueListEvent({ method: "DELETE", path: `/api/v1/due-list/businesses/${id}`, pathParameters: { id } });
const businesses = (count) => Array.from({ length: count }, (unused, index) => ({ businessId: `b${index}`, kind: "vat" }));

describe("functions/dueListBusinessPut", () => {
  beforeEach(() => {
    mockEnforceBundles.mockReset().mockResolvedValue({ userSub: "user-1" });
    mockList.mockReset().mockResolvedValue({ businesses: [], rows: [] });
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

  test("stores a VAT business with no refresh job, and keeps the time HMRC was last read when it replaces one", async () => {
    mockList.mockResolvedValue({ businesses: [{ businessId: "v1", kind: "vat", hmrcReadAt: "2026-11-01T10:00:00.000Z" }], rows: [] });

    await ingestHandler(put("v1", { kind: "vat", label: "Shop" }));

    const [, stored] = mockPutBusiness.mock.calls[0];
    expect(stored).toEqual({ id: "v1", kind: "vat", label: "Shop", hmrcReadAt: "2026-11-01T10:00:00.000Z" });
  });

  test("refuses a 51st business with a JSON 409 and stores nothing", async () => {
    mockList.mockResolvedValue({ businesses: businesses(50), rows: [] });

    const response = await ingestHandler(put("new", { kind: "vat", label: "Shop" }));

    expect(response.statusCode).toBe(409);
    expect(responseBody(response).message).toBe("The due list holds at most 50 businesses");
    expect(mockPutBusiness).not.toHaveBeenCalled();
  });

  test("replaces one of 50 businesses, which the cap does not refuse", async () => {
    mockList.mockResolvedValue({ businesses: businesses(50), rows: [] });
    expect((await ingestHandler(put("b3", { kind: "vat", label: "Shop" }))).statusCode).toBe(200);
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
