// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockRunAthenaQuery = vi.fn();
vi.mock("@app/functions/analytics/rawExportPublish.js", () => ({
  runAthenaQuery: (...args) => mockRunAthenaQuery(...args),
  toObjects: ({ header, rows }) => rows.map((row) => Object.fromEntries(header.map((column, index) => [column, row[index]]))),
}));

const mockGetPassFigures = vi.fn();
const mockPutPassFigures = vi.fn();
vi.mock("@app/data/dynamoDbPassRepository.js", () => ({
  getPassFigures: (...args) => mockGetPassFigures(...args),
  putPassFigures: (...args) => mockPutPassFigures(...args),
}));

import { handler, toFigures, figuresChanged } from "@app/functions/analytics/passFiguresPublish.js";

const HEADER = ["code", "pass_type_id", "uses", "new_accounts", "filed", "subscribers", "paid_charges", "last_used"];

describe("passFiguresPublish", () => {
  beforeEach(() => {
    mockRunAthenaQuery.mockReset();
    mockGetPassFigures.mockReset();
    mockPutPassFigures.mockReset();
    process.env.ATHENA_WORK_GROUP_NAME = "test-analytics";
    process.env.GLUE_DATABASE_NAME = "test_analytics";
  });

  test("toFigures turns the view's text columns into numbers", () => {
    expect(
      toFigures({
        code: "a",
        pass_type_id: "digital-pass",
        uses: "7",
        new_accounts: "4",
        filed: "3",
        subscribers: "2",
        paid_charges: "5",
        last_used: "t",
      }),
    ).toEqual({ code: "a", uses: 7, newAccounts: 4, filed: 3, subscribers: 2, paidCharges: 5, lastUsed: "t" });
  });

  test("figuresChanged is true for a missing item and false when every figure matches", () => {
    const figures = { code: "a", uses: 1, newAccounts: 1, filed: 0, subscribers: 0, paidCharges: 0, lastUsed: "t" };
    expect(figuresChanged(undefined, figures)).toBe(true);
    expect(figuresChanged({ ...figures, computedAt: "earlier" }, figures)).toBe(false);
    expect(figuresChanged({ ...figures, filed: 1 }, figures)).toBe(true);
  });

  test("it queries only the view and writes one figures item per changed pass", async () => {
    mockRunAthenaQuery.mockResolvedValue({
      header: HEADER,
      rows: [
        ["a", "digital-pass", "7", "4", "3", "2", "5", "2026-10-30T10:00:00.000Z"],
        ["b", "physical-pass", "1", "1", "0", "0", "0", "2026-10-29T10:00:00.000Z"],
      ],
    });
    mockGetPassFigures.mockResolvedValue(
      new Map([
        ["b", { code: "b", uses: 1, newAccounts: 1, filed: 0, subscribers: 0, paidCharges: 0, lastUsed: "2026-10-29T10:00:00.000Z" }],
      ]),
    );

    const result = await handler();

    expect(mockRunAthenaQuery).toHaveBeenCalledWith({
      workGroup: "test-analytics",
      database: "test_analytics",
      sql: "SELECT * FROM v_pass_performance",
    });
    expect(mockGetPassFigures).toHaveBeenCalledWith(["a", "b"]);
    expect(mockPutPassFigures).toHaveBeenCalledTimes(1);
    expect(mockPutPassFigures.mock.calls[0][0]).toMatchObject({
      code: "a",
      uses: 7,
      newAccounts: 4,
      filed: 3,
      subscribers: 2,
      paidCharges: 5,
    });
    expect(mockPutPassFigures.mock.calls[0][0].computedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(result).toEqual({ passes: 2, written: 1 });
  });

  test("a result that fills the Athena page is an error, not a silent cut", async () => {
    mockRunAthenaQuery.mockResolvedValue({
      header: HEADER,
      rows: Array.from({ length: 1000 }, (_, index) => [`c${index}`, "p", "1", "1", "0", "0", "0", null]),
    });
    await expect(handler()).rejects.toThrow(/cut short/);
    expect(mockPutPassFigures).not.toHaveBeenCalled();
  });

  test("it fails when the work group is not configured", async () => {
    delete process.env.ATHENA_WORK_GROUP_NAME;
    await expect(handler()).rejects.toThrow(/ATHENA_WORK_GROUP_NAME/);
  });
});
