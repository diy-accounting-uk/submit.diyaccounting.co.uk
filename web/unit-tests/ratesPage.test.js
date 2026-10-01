// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normaliseText, loadSources } from "../../scripts/tax-sources.mjs";
import {
  PAGE_PATH,
  DATA_PATH,
  ENGINE_MODULES,
  ENGINE_PACKAGE_DIR,
  ENGINE_TAX_SOURCE_DIR,
  ENGINE_TAX_TARGET_DIR,
  RATE_TABLES,
  allRatesFactIds,
  columnsOf,
  engineFileFor,
  evidenceText,
  factId,
  formatFactValue,
  readEngineTable,
  renderRatesData,
  renderRatesHtml,
  renderRatesPage,
} from "../../scripts/build-rates-page.mjs";
import { ENGINE_VERSION, SELF_EMPLOYED, LIMITED_COMPANY, TAX_YEARS, FINANCIAL_YEARS } from "../public/lib/rates/rates-data.js";

const committedPage = readFileSync(PAGE_PATH, "utf8");
const sources = loadSources();

function committedCell(id) {
  const match = committedPage.match(new RegExp(`<td data-fact="${id}">([^<]*)</td>`));
  if (!match) throw new Error(`No cell for ${id} in the committed page`);
  return match[1].replace(/&amp;/g, "&");
}

function valueAt(tables, dottedKey) {
  return dottedKey.split(".").reduce((node, key) => node[key], tables);
}

function isoDates(node) {
  if (node instanceof Date) return node.toISOString().slice(0, 10);
  if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, isoDates(v)]));
  return node;
}

describe("rates page", () => {
  test("the committed page equals the render", async () => {
    expect(committedPage).toBe(await renderRatesPage(sources));
  });

  test("the committed data module equals the render", async () => {
    expect(readFileSync(DATA_PATH, "utf8")).toBe(await renderRatesData());
  });

  test("every engine-backed cell on the committed page shows the engine figure", () => {
    const mismatches = [];
    for (const table of RATE_TABLES) {
      for (const column of columnsOf(table)) {
        const tables = readEngineTable(column);
        for (const row of table.rows.filter((r) => r.engine)) {
          const expected = formatFactValue(valueAt(tables, row.engine), row.format);
          const shown = committedCell(factId(row, column));
          if (shown !== expected) mismatches.push(`${factId(row, column)}: page ${shown}, engine ${expected}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("the data module holds the engine tables for every year", () => {
    for (const year of TAX_YEARS) {
      const parsed = readEngineTable(year);
      expect(SELF_EMPLOYED[year]).toEqual({
        start: isoDates(parsed.tax_year.start),
        end: isoDates(parsed.tax_year.end),
        income_tax: parsed.income_tax,
        national_insurance: parsed.national_insurance,
        capital_allowances: parsed.capital_allowances,
        mileage: parsed.mileage,
        vat: parsed.vat,
      });
    }
    for (const year of FINANCIAL_YEARS) {
      const parsed = readEngineTable(`fy${year}`);
      expect(LIMITED_COMPANY[year]).toEqual({
        start: isoDates(parsed.financial_year.start),
        end: isoDates(parsed.financial_year.end),
        corporation_tax: parsed.corporation_tax,
        corporation_tax_previous_financial_year: parsed.corporation_tax_previous_financial_year,
        capital_allowances: parsed.capital_allowances,
        mileage: parsed.mileage,
        vat: parsed.vat,
      });
    }
  });

  test("every shown figure appears in a source quote listing its fact", () => {
    const missing = [];
    for (const table of RATE_TABLES) {
      for (const column of columnsOf(table)) {
        const tables = readEngineTable(column);
        for (const row of table.rows) {
          const id = factId(row, column);
          const evidence = normaliseText(evidenceText(row, column, tables));
          const supporting = sources.filter((s) => s.facts.includes(id));
          if (!supporting.some((s) => normaliseText(s.quote).includes(evidence)))
            missing.push(`${id}: no source quote contains "${evidence}"`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test("the page shows exactly the declared fact ids", () => {
    const shown = [...committedPage.matchAll(/data-fact="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(shown).toEqual([...allRatesFactIds()].sort());
  });

  test("the engine module copies are byte-equal to the installed package", () => {
    for (const name of ENGINE_MODULES) {
      expect(readFileSync(join(ENGINE_TAX_TARGET_DIR, name), "utf8"), name).toBe(readFileSync(join(ENGINE_TAX_SOURCE_DIR, name), "utf8"));
    }
  });

  test("the data module names the installed engine version", () => {
    expect(ENGINE_VERSION).toBe(JSON.parse(readFileSync(join(ENGINE_PACKAGE_DIR, "package.json"), "utf8")).version);
  });

  test("rendering without sources throws", () => {
    expect(() => renderRatesHtml([])).toThrow(/has no source file/);
  });

  test("the navigation lists the page", () => {
    expect(readFileSync("web/public/widgets/page-chrome.js", "utf8")).toContain(
      '{ label: "HMRC Tax Rates and Allowances", target: "rates.html" }',
    );
  });

  test("each year maps to its engine file", () => {
    expect(engineFileFor("2026-27")).toBe("se-2026-2027.toml");
    expect(engineFileFor("fy2025")).toBe("ltd-2025.toml");
  });
});

describe("formatFactValue", () => {
  test.each([
    [12570, "gbp", "£12,570"],
    [3.65, "gbp", "£3.65"],
    [3.5, "gbp", "£3.50"],
    [0.0875, "percent", "8.75%"],
    [0.165, "percent", "16.5%"],
    [0.45, "pence", "45p"],
    [10000, "miles", "10,000"],
    [0.015, "fraction", "3/200"],
  ])("%s as %s is %s", (value, format, expected) => {
    expect(formatFactValue(value, format)).toBe(expected);
  });
});
