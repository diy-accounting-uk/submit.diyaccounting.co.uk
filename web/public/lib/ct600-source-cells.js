// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/ct600-source-cells.js
// The workbook cells the CT600 table names: reads each `source` of ct600-fields.js into
// { file, sheet, cell } records and gives each cell its screenshot's file name and URL.

import * as fields from "./ct600-fields.js";

export const SOURCE_IMAGE_DIRECTORY = "images/ct600-sources";

const CELL_PATTERN = /^[A-Z]{1,3}\d{1,5}$/;

// "Financialaccounts.xlsx!CorporationTax!I16+I17" gives the cells I16 and I17 of CorporationTax.
// "Financialaccounts.xlsx!PubBalSht!E29-Financialaccounts.xlsx!OpenAccounts!E30" gives one cell on each sheet.
export function cellsOfReference(reference) {
  if (!reference) return [];
  const cells = [];
  let file = null;
  let sheet = null;
  const isSum = /[+-]/.test(reference);
  for (const part of reference.split(/[+-]/)) {
    const pieces = part.split("!");
    if (pieces.length >= 3) {
      [file, sheet] = pieces;
    } else if (pieces.length === 2) {
      sheet = pieces[0];
    }
    const cell = pieces[pieces.length - 1];
    if (!file || !sheet || !CELL_PATTERN.test(cell)) throw new Error(`Not a workbook cell reference: ${reference}`);
    cells.push({ file, sheet, cell, isSum });
  }
  return cells;
}

export function sourceImageName({ sheet, cell }) {
  return `${sheet.replace(/&/g, "and")}-${cell}.webp`;
}

export function sourceImageUrl(cellRecord) {
  return `/${SOURCE_IMAGE_DIRECTORY}/${sourceImageName(cellRecord)}`;
}

// Every `source` in the table's exports, whichever list or object it hangs from.
export function allSources(exported = fields) {
  const seen = new Set();
  const sources = [];
  const walk = (value, depth) => {
    if (!value || typeof value !== "object" || seen.has(value) || depth > 6) return;
    seen.add(value);
    if (value.source && typeof value.source === "object") sources.push(value.source);
    for (const inner of Object.values(value)) walk(inner, depth + 1);
  };
  for (const exportedValue of Object.values(exported)) walk(exportedValue, 0);
  return sources;
}

// One record per distinct cell the table names, with the entries that name it.
export function namedCells(exported = fields) {
  const byKey = new Map();
  for (const source of allSources(exported)) {
    for (const key of ["thisYear", "lastYear"]) {
      for (const record of cellsOfReference(source[key])) {
        const id = `${record.file}!${record.sheet}!${record.cell}`;
        if (!byKey.has(id)) byKey.set(id, { ...record, uses: [] });
        byKey.get(id).uses.push({ key, workbookLabel: source.workbookLabel, labelCell: source.labelCell, isSum: record.isSum });
      }
    }
  }
  return [...byKey.values()];
}
