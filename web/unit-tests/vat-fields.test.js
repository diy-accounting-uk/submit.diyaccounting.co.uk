// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/vat-fields.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as vatFields from "../public/lib/vat-fields.js";
import { namedCells, sourceImageName, SOURCE_IMAGE_DIRECTORY } from "../public/lib/ct600-source-cells.js";

const { VAT_BOX_FIELDS, noticeUrl, vatBoxField } = vatFields;
const page = fs.readFileSync(path.join(process.cwd(), "web/public/hmrc/vat/submitVat.html"), "utf8");

describe("the VAT return's box table", () => {
  test("names the nine boxes in order, each a field of the return form with a note", () => {
    expect(VAT_BOX_FIELDS.map((field) => field.box)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const field of VAT_BOX_FIELDS) {
      expect(page).toContain(`id="${field.id}"`);
      expect(page).toContain(`id="${field.id}-hint"`);
    }
    expect(vatBoxField("netVatDue").box).toBe(5);
  });

  test("links each box to its section of VAT Notice 700/12", () => {
    expect(noticeUrl(4)).toBe("https://www.gov.uk/guidance/how-to-fill-in-and-submit-your-vat-return-vat-notice-70012#filling-in-box-4");
  });

  test("puts boxes 1 to 7 on the first quarter's sheet of the VAT workbook, with a picture of each cell", () => {
    const cells = namedCells(vatFields, {});
    expect(cells.map(({ cell }) => cell)).toEqual(["G9", "G11", "G13", "G15", "G17", "G21", "G23"]);
    for (const cell of cells) {
      expect(cell).toMatchObject({ file: "Vatreturns.xlsx", sheet: "VATQtr1" });
      expect(fs.existsSync(path.join(process.cwd(), "web/public", SOURCE_IMAGE_DIRECTORY, sourceImageName(cell)))).toBe(true);
    }
    expect(VAT_BOX_FIELDS.filter((field) => !field.source).map((field) => field.box)).toEqual([8, 9]);
  });
});
