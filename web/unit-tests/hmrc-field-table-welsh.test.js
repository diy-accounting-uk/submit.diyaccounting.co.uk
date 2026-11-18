// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/hmrc-field-table-welsh.test.js
// With the Welsh choice, the figures table renders every field name, definition and source in Welsh.

import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { scriptStrings } from "../../scripts/build-welsh-pages.mjs";

const PUBLIC_DIR = path.join(process.cwd(), "web/public");

// Every catalogued path holds a figure, so every row, definition and source shows.
function withEveryField(paths) {
  const data = {};
  for (const fieldPath of paths) {
    const parts = fieldPath.split(".");
    let node = data;
    parts.slice(0, -1).forEach((part) => (node = node[part] = node[part] || {}));
    node[parts.at(-1)] = 100;
  }
  return data;
}

// The visible text, without what is marked as English (a field HMRC named that the catalogue does not know).
const visibleText = (html) =>
  html
    .replace(/<([a-z]+)[^>]*lang="en-GB"[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("the HMRC figures table with the Welsh choice", () => {
  let table;
  let welsh;

  beforeAll(async () => {
    globalThis.window = globalThis;
    new Function(fs.readFileSync(path.join(PUBLIC_DIR, "lib/welsh-text.js"), "utf-8"))();
    welsh = window.WELSH_TEXT;
    window.siteText = (id, english, values) => {
      const text = welsh[id] ?? english;
      return values ? text.replace(/\{([a-z]+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole)) : text;
    };
    window.siteLanguage = { chrome: () => "cy", current: () => "cy" };
    await import("../public/lib/money-format.js");
    await import("../public/lib/hmrc-field-table.js");
    table = window.HmrcFieldTable;
  });

  function everyTable() {
    const vatRows = table.VAT_RETURN_BOXES.map((box) => ({ ...box, field: box.field, value: 100 }));
    const groups = [
      table.taxCalculationRows(withEveryField(Object.keys(table.TAX_CALCULATION_FIELDS))),
      table.allowanceRows(withEveryField(Object.keys(table.ALLOWANCE_FIELDS))),
      table.selfEmploymentSummaryRows(withEveryField(Object.keys(table.SELF_EMPLOYMENT_SUMMARY_FIELDS))),
      table.ukPropertySummaryRows(withEveryField(Object.keys(table.UK_PROPERTY_SUMMARY_FIELDS))),
      table.foreignPropertySummaryRows(withEveryField(Object.keys(table.FOREIGN_PROPERTY_SUMMARY_FIELDS))),
      vatRows,
    ];
    return groups.map((rows) => table.renderFieldTable(rows)).join("\n");
  }

  it("shows every definition and source of the catalogue", () => {
    const html = everyTable();
    expect(html.match(/class="field-definition"/g).length).toBeGreaterThanOrEqual(43);
    for (const key of Object.keys(table.SOURCES)) expect(html).toContain(table.SOURCES[key].welshUrl || table.SOURCES[key].url);
  });

  it("renders no field name, definition or source in English", () => {
    const text = visibleText(everyTable());
    const english = scriptStrings()
      .filter(({ file }) => file === "lib/hmrc-field-table.js")
      .flatMap(({ id, source }) => source.split(/\{[a-z]+\}/).map((part) => ({ id, part: part.trim().replace(/[.,;:]$/, "") })))
      .filter(({ id, part }) => part.length > 3 && !welsh[id].includes(part));
    expect(english.length).toBeGreaterThan(100);
    expect(english.filter(({ part }) => text.includes(part)).map(({ id, part }) => `${id}: ${part}`)).toEqual([]);
  });

  it("links a source that GOV.UK publishes in Welsh to its Welsh page", () => {
    expect(table.sourceLink("marriageAllowance")).toContain('href="https://www.gov.uk/lwfans-priodasol"');
    expect(table.sourceLink("dividends")).toContain('href="https://www.gov.uk/treth-ar-ddifidendau"');
    expect(table.sourceLink("giftAid")).toContain('href="https://www.gov.uk/donating-to-charity/gift-aid"');
  });

  it("marks a field that HMRC named and the catalogue does not know as English", () => {
    const html = table.renderFieldTable(table.allowanceRows({ someNewAllowance: 10 }));
    expect(html).toContain('<span class="field-name" lang="en-GB">Some new allowance</span>');
  });
});
