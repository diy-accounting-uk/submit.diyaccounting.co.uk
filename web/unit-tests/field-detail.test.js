// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @vitest-environment happy-dom

// web/unit-tests/field-detail.test.js

import { describe, test, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  ACCOUNTS_TEXT_FIELDS,
  BALANCE_SHEET_FIELDS,
  CT600_FORM_FIELDS,
  DONATIONS_PAID_FIELD,
  CT600_BOX_ROWS,
  FIXED_ASSET_CLASSES,
  FIXED_ASSET_FIELDS,
  LOAN_ROW_FIELDS,
  MICRO_BALANCE_SHEET_FIELDS,
  MICRO_PROFIT_AND_LOSS_FIELDS,
  MICRO_STATEMENT_FIELD,
  PAGE_QUESTION_FIELDS,
  PROFIT_AND_LOSS_FIELDS,
  REPAYMENT_ROW_FIELDS,
  STATEMENT_FIELDS,
  noteSheetCell,
} from "../public/lib/ct600-fields.js";
import {
  labelWithReference,
  noteOf,
  parseSheetCells,
  referenceText,
  sourceDisclosure,
  sourceImagePath,
  sourceLinkOf,
} from "../public/lib/field-detail.js";

const FIELDS = [
  ...CT600_FORM_FIELDS,
  DONATIONS_PAID_FIELD,
  ...MICRO_PROFIT_AND_LOSS_FIELDS,
  ...MICRO_BALANCE_SHEET_FIELDS,
  ...PROFIT_AND_LOSS_FIELDS,
  ...BALANCE_SHEET_FIELDS,
  ...FIXED_ASSET_CLASSES,
  ...FIXED_ASSET_FIELDS,
  ...STATEMENT_FIELDS,
  MICRO_STATEMENT_FIELD,
  ...ACCOUNTS_TEXT_FIELDS,
  ...LOAN_ROW_FIELDS,
  ...REPAYMENT_ROW_FIELDS,
  ...PAGE_QUESTION_FIELDS,
];

describe("the reference, the note and the spreadsheet disclosure of a field", () => {
  test.each(FIELDS.map((field) => [field.id, field]))("%s has a reference, a label led by it and a source link", (id, field) => {
    expect(referenceText(field)).toMatch(/\S/);
    expect(labelWithReference(field)).toContain(field.label);
    expect(sourceLinkOf(field)?.href).toMatch(/^https:\/\//);
  });

  test("references read as the format's items, the Act's sections, the CT600A's boxes and the return's boxes", () => {
    const line = (list, id) => list.find((field) => field.id === id);
    expect(labelWithReference(line(BALANCE_SHEET_FIELDS, "stocks"))).toBe("Balance sheet item C.I: Stocks");
    expect(labelWithReference(line(PROFIT_AND_LOSS_FIELDS, "turnover"))).toBe("Profit and loss item 1: Turnover");
    expect(labelWithReference(line(MICRO_PROFIT_AND_LOSS_FIELDS, "otherCharges"))).toBe("Profit and loss item F: Other charges");
    expect(referenceText(line(LOAN_ROW_FIELDS, "Amount"))).toBe("CT600A A10");
    expect(referenceText(line(ACCOUNTS_TEXT_FIELDS, "averageEmployees"))).toBe("Companies Act section 411");
    expect(referenceText(line(CT600_FORM_FIELDS, "specialRatePoolAnnualInvestmentAllowance"))).toBe("Boxes 690 and 695");
    expect(referenceText({ id: "turnover", box: 145 })).toBe("Box 145");
    expect(() => referenceText({ id: "unknown", reference: "Somewhere else" })).toThrow("unknown");
  });

  test("a label that already names its box, in English or in Welsh, is not led by it again", () => {
    expect(labelWithReference({ box: 3, label: "Box 3: Tax reference" })).toBe("Box 3: Tax reference");
    expect(labelWithReference({ box: 3, label: "Blwch 3: Cyfeirnod treth" })).toBe("Blwch 3: Cyfeirnod treth");
    expect(labelWithReference({ box: 160, label: "Trading losses brought forward" })).toBe("Box 160: Trading losses brought forward");
  });

  test("a sheetCell reads as its cells, with each sign, on one sheet or several", () => {
    expect(parseSheetCells("Financialaccounts.xlsx!PubP&L!F16+F44-E43")).toEqual([
      { sign: "+", file: "Financialaccounts.xlsx", sheet: "PubP&L", cell: "F16" },
      { sign: "+", file: "Financialaccounts.xlsx", sheet: "PubP&L", cell: "F44" },
      { sign: "-", file: "Financialaccounts.xlsx", sheet: "PubP&L", cell: "E43" },
    ]);
    expect(
      parseSheetCells("Financialaccounts.xlsx!PubBalSht!E29-Financialaccounts.xlsx!OpenAccounts!E30").map(({ sheet }) => sheet),
    ).toEqual(["PubBalSht", "OpenAccounts"]);
    expect(() => parseSheetCells("F9")).toThrow("Not a sheetCell");
    expect(sourceImagePath({ sheet: "PubP&L", cell: "F9" })).toBe("/images/ct600-sources/PubPandL-F9.webp");
  });

  test("the note ends with its source link, and the disclosure is closed with the cells, the label and a picture of each cell", () => {
    const field = MICRO_PROFIT_AND_LOSS_FIELDS.find(({ id }) => id === "otherCharges");
    const note = noteOf(field, "microCurrentOtherCharges");
    expect(note.id).toBe("microCurrentOtherCharges-hint");
    expect(note.querySelector("a").getAttribute("href")).toBe(field.termSource);
    const disclosure = sourceDisclosure(field, { id: "microCurrentOtherCharges" });
    expect(disclosure.hasAttribute("open")).toBe(false);
    expect(disclosure.querySelector("summary").textContent).toBe("In DIY Accounting's spreadsheets");
    expect(disclosure.querySelector("dl").textContent).toContain("F16 + F44 − E43 (worked from these cells)");
    expect(disclosure.querySelector("dl").textContent).toContain("B16 + B44 − A43");
    expect(disclosure.querySelector(".field-source__note").textContent).toBe(field.source.differenceNote);
    expect([...disclosure.querySelectorAll("img")].map((image) => image.getAttribute("src"))).toHaveLength(6);
  });

  test("a field the spreadsheets do not hold says so in its disclosure", () => {
    const rate = LOAN_ROW_FIELDS.find(({ id }) => id === "Rate");
    expect(sourceDisclosure(rate, { id: "loanRate1" }).textContent).toContain("The spreadsheets have no cell for this.");
  });

  test("every picture a disclosure shows is a file in the site, and a cell with no picture shows none", () => {
    const disclosures = [...CT600_BOX_ROWS.filter((row) => row.source), ...FIELDS].map((field) => sourceDisclosure(field, { id: "x" }));
    const sources = disclosures.flatMap((disclosure) => [...disclosure.querySelectorAll("img")].map((image) => image.getAttribute("src")));
    expect(sources.length).toBeGreaterThan(90);
    for (const src of sources) expect(existsSync(join(process.cwd(), "web/public", src)), src).toBe(true);
    const [{ sheet, cell }] = parseSheetCells(noteSheetCell("plantMachinery", "additions"));
    expect(sourceImagePath({ sheet, cell })).toBeNull();
  });
});
