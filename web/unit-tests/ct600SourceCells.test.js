// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/ct600SourceCells.test.js

import { describe, test, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { cellsOfReference, namedCells, sourceImageName } from "../public/lib/ct600-source-cells.js";

const imageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/images/ct600-sources");

describe("cellsOfReference", () => {
  test("reads a single cell", () => {
    expect(cellsOfReference("Financialaccounts.xlsx!CT600!AJ145")).toEqual([
      { file: "Financialaccounts.xlsx", sheet: "CT600", cell: "AJ145", isSum: false },
    ]);
  });

  test("reads a sum whose later cells stay on the first sheet", () => {
    expect(cellsOfReference("Financialaccounts.xlsx!PubP&L!F16+F44-E43").map((c) => `${c.sheet}!${c.cell}`)).toEqual([
      "PubP&L!F16",
      "PubP&L!F44",
      "PubP&L!E43",
    ]);
  });

  test("reads a difference across two sheets", () => {
    const cells = cellsOfReference("Financialaccounts.xlsx!PubBalSht!E29-Financialaccounts.xlsx!OpenAccounts!E30");
    expect(cells.map((c) => `${c.sheet}!${c.cell}`)).toEqual(["PubBalSht!E29", "OpenAccounts!E30"]);
  });

  test("refuses a reference that is not a cell", () => {
    expect(() => cellsOfReference("Financialaccounts.xlsx!CT600!total")).toThrow();
  });
});

describe("the screenshots of the cells the table names", () => {
  const cells = namedCells();

  test("the table names cells", () => {
    expect(cells.length).toBeGreaterThan(50);
  });

  test("every named cell has its image", () => {
    const missing = cells.map(sourceImageName).filter((name) => !existsSync(path.join(imageDirectory, name)));
    expect(missing).toEqual([]);
  });
});
