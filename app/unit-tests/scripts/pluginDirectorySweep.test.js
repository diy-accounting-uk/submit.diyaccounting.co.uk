// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/pluginDirectorySweep.test.js

import { describe, expect, it } from "vitest";
import { connectorRecords, sweepTerms, toCsv } from "../../../scripts/plugin-directory-sweep.mjs";

const record = (title, slug, oneLiner, author, popularityScore) => ({
  _id: `wf.${slug}`,
  title,
  slug,
  oneLiner,
  author,
  popularityScore,
  categories: ["finance"],
});

// The marketplace serves its data as strings pushed to self.__next_f, cut at arbitrary points.
function pageOf(records) {
  const stream = `25:["$","main",null,{"data":{"items":${JSON.stringify(records)}}}]\n`;
  const cut = Math.floor(stream.length / 2);
  return [stream.slice(0, cut), stream.slice(cut)]
    .map((part) => `<script>self.__next_f.push(${JSON.stringify([1, part])})</script>`)
    .join("");
}

const RECORDS = [
  record("Pennylane", "pennylane", "Accounting and VAT for small firms", "Pennylane", 900),
  record("Carta", "carta", "Cap tables, {equity} and VAT records", "Carta", 3000),
  record("DIY Accounting Submit", "diy-accounting-submit", "MTD VAT return, ready for HMRC", "DIY Accounting Limited", 10),
  record("Gmail", "gmail", "Draft replies", "Google", 50000),
];

describe("plugin-directory-sweep", () => {
  it("reads each connector record once from chunks that split a record", () => {
    const records = connectorRecords(pageOf([...RECORDS, RECORDS[0]]));
    expect(records.map((entry) => entry.slug)).toEqual(["pennylane", "carta", "diy-accounting-submit", "gmail"]);
    expect(records[1]).toEqual({
      title: "Carta",
      slug: "carta",
      oneLiner: "Cap tables, {equity} and VAT records",
      author: "Carta",
      popularityScore: 3000,
    });
  });

  it("counts a term over title, one-liner and author, and ranks us by popularity among the matches", () => {
    const rows = sweepTerms(connectorRecords(pageOf(RECORDS)), ["vat", "mtd", "google", "landlord"]);
    expect(rows).toEqual([
      { directory: "claude", term: "vat", matches: 3, ourPosition: 3, firstFive: ["Carta", "Pennylane", "DIY Accounting Submit"] },
      { directory: "claude", term: "mtd", matches: 1, ourPosition: 1, firstFive: ["DIY Accounting Submit"] },
      { directory: "claude", term: "google", matches: 1, ourPosition: null, firstFive: ["Gmail"] },
      { directory: "claude", term: "landlord", matches: 0, ourPosition: null, firstFive: [] },
    ]);
  });

  it("writes one CSV row per term, quoting a field that holds a comma", () => {
    const csv = toCsv([{ directory: "claude", term: "vat", matches: 2, ourPosition: null, firstFive: ["Carta, Inc", "Pennylane"] }]);
    expect(csv).toBe('directory,term,matches,our position,first five\nclaude,vat,2,,"Carta, Inc; Pennylane"\n');
  });

  it("fails with a clear message when the page holds no connector record", () => {
    const page = `<script>self.__next_f.push(${JSON.stringify([1, '25:["$","main",null,{"data":{"items":[]}}]'])})</script>`;
    expect(() => connectorRecords(page)).toThrow(/No connector record found in the marketplace page/);
    expect(() => connectorRecords("<html></html>")).toThrow(/the page's shape has changed/);
  });
});
