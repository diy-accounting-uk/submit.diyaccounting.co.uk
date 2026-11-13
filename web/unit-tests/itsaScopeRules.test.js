// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSources } from "../../scripts/tax-sources.mjs";
import {
  FIRST_UPDATE_PERIOD,
  RECORD_FIELDS,
  START_RULES,
  assessScope,
  formatDate,
  formatPounds,
  parseIncome,
  qualifyingIncome,
} from "../public/lib/itsa/scope-rules.js";

const quoteOf = (name) => loadSources().find((source) => source.name === name).quote;
const read = (path) => readFileSync(join(import.meta.dirname, "..", "..", path), "utf8");
const SOURCE_FOR_RULE = { 50000: "itsa-mtd-over-50k", 30000: "itsa-mtd-over-30k", 20000: "itsa-mtd-over-20k" };

describe("the start rules against the source files", () => {
  test("each threshold, tax year and start date is the one in its source quote", () => {
    for (const rule of START_RULES) {
      const quote = quoteOf(SOURCE_FOR_RULE[rule.threshold]);
      expect(quote).toContain(formatPounds(rule.threshold));
      expect(quote).toContain(`${rule.taxYear} tax year`);
      expect(quote).toContain(formatDate(rule.startDate).replace(/^0/, ""));
    }
  });

  test("the first update deadline is the first row of the quarterly table, in the start year", () => {
    const quote = quoteOf("itsa-quarterly-update-deadlines");
    expect(quote.startsWith(`${FIRST_UPDATE_PERIOD} 7 August`)).toBe(true);
    for (const rule of START_RULES) {
      expect(rule.firstUpdateDeadline).toBe(`${rule.startDate.slice(0, 4)}-08-07`);
    }
  });

  test("the records to keep are the ones in the digital records source and the page", () => {
    const html = read("web/public/mtd-income-tax-checker.html");
    expect(RECORD_FIELDS).toHaveLength(3);
    for (const field of RECORD_FIELDS) expect(html).toContain(field);
  });

  test("the qualifying income definition is on the page with its source", () => {
    const html = read("web/public/mtd-income-tax-checker.html").replace(/\s+/g, " ");
    expect(html).toContain(quoteOf("itsa-qualifying-income"));
  });
});

describe("assessScope", () => {
  const years = (a, b, c) => ({
    "2024 to 2025": { selfEmployment: a, property: 0 },
    "2025 to 2026": { selfEmployment: b, property: 0 },
    "2026 to 2027": { selfEmployment: c, property: 0 },
  });

  test("income over 50,000 in 2024 to 2025 starts on 6 April 2026", () => {
    const result = assessScope(years(50001, 0, 0), "2026-11-13");
    expect(result).toMatchObject({ inScope: true, startDate: "2026-04-06", firstUpdateDeadline: "2026-08-07", started: true });
  });

  test("exactly 50,000 is not over the threshold", () => {
    expect(assessScope(years(50000, 0, 0), "2026-11-13").inScope).toBe(false);
  });

  test("income over 30,000 in 2025 to 2026 starts on 6 April 2027", () => {
    const result = assessScope(years(10000, 30001, 0), "2026-11-13");
    expect(result).toMatchObject({ inScope: true, startDate: "2027-04-06", firstUpdateDeadline: "2027-08-07", started: false });
  });

  test("income over 20,000 in 2026 to 2027 starts on 6 April 2028", () => {
    const result = assessScope(years(0, 0, 20001), "2026-11-13");
    expect(result).toMatchObject({ inScope: true, startDate: "2028-04-06", firstUpdateDeadline: "2028-08-07" });
  });

  test("the earliest start date wins", () => {
    expect(assessScope(years(60000, 40000, 25000), "2026-11-13").startDate).toBe("2026-04-06");
  });

  test("self-employment and property income add together", () => {
    const incomes = { "2025 to 2026": { selfEmployment: 20000, property: 10001 } };
    expect(qualifyingIncome(20000, 10001)).toBe(30001);
    expect(assessScope(incomes, "2026-11-13").startDate).toBe("2027-04-06");
  });

  test("income under every threshold is not in scope", () => {
    expect(assessScope(years(49999, 29999, 19999), "2026-11-13")).toMatchObject({ inScope: false });
  });

  test("a deadline before today is marked passed", () => {
    expect(assessScope(years(51000, 0, 0), "2026-08-08").deadlinePassed).toBe(true);
    expect(assessScope(years(51000, 0, 0), "2026-08-07").deadlinePassed).toBe(false);
  });
});

describe("parseIncome", () => {
  test("reads pounds with a sign or commas, and blank as 0", () => {
    expect(parseIncome("£32,500")).toBe(32500);
    expect(parseIncome("")).toBe(0);
    expect(parseIncome("1200.50")).toBe(1200.5);
  });

  test("a negative number or words are not an income", () => {
    expect(parseIncome("-5")).toBeNull();
    expect(parseIncome("lots")).toBeNull();
  });
});

describe("the embed", () => {
  const script = read("web/public/embed/mtd-income-tax-checker.js");

  test("the script builds a frame from its own origin and a link to the full page, with no inline HTML", () => {
    expect(script).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write/);
    const elements = [];
    const fakeScript = {
      src: "https://ci.example.test/embed/mtd-income-tax-checker.js",
      insertAdjacentElement(position, element) {
        elements.push({ position, element });
      },
    };
    const make = (tag) => ({
      tag,
      style: {},
      children: [],
      append(...nodes) {
        this.children.push(...nodes);
      },
    });
    new Function("document", script)({ currentScript: fakeScript, createElement: make });
    expect(elements).toHaveLength(1);
    const [frame, credit] = elements[0].element.children;
    expect(frame.src).toBe("https://ci.example.test/embed/mtd-income-tax-checker.html");
    expect(credit.children[0].href).toBe("https://ci.example.test/mtd-income-tax-checker.html");
    expect(credit.children[0].textContent.length).toBeGreaterThan(10);
  });

  test("the framed page loads the same checker module and no analytics or sign-in script", () => {
    const html = read("web/public/embed/mtd-income-tax-checker.html");
    expect(html).toContain('src="/lib/itsa/scope-checker.js"');
    expect(html).not.toMatch(/analytics|auth-status|submit\.js|session-beacon/);
  });

  test("the full page shows the snippet that loads the embed script", () => {
    const html = read("web/public/mtd-income-tax-checker.html");
    expect(html).toContain(
      "&lt;script src=&quot;https://submit.diyaccounting.co.uk/embed/mtd-income-tax-checker.js&quot;&gt;&lt;/script&gt;",
    );
  });

  test("the checker module builds its elements with no inline HTML", () => {
    expect(read("web/public/lib/itsa/scope-checker.js")).not.toMatch(/innerHTML|insertAdjacentHTML/);
  });
});
