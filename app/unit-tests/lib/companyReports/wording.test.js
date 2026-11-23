// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/companyReports/wording.test.js

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { bannedWordsIn, BANNED_WORDS, REPORT_BANNED_WORDS, REPORT_BANNED_WORDS_CY } from "@app/lib/companyReports/wording.js";
import { REPORT_NAMES } from "@app/functions/companies-house/companiesHouseCompanyReportGet.js";

const REPORTS_DIR = path.join(process.cwd(), "app/lib/companyReports");
const PAGE = path.join(process.cwd(), "web/public/companies-house/companyReports.page.js");

const SEARCH_PAGE = path.join(process.cwd(), "web/public/companies-house/companySearch.page.js");
const LITERAL_SITE_TEXT = /\bsiteText\(\s*"([^"]+)",\s*"((?:[^"\\]|\\.)*)"/g;
// The page's own wrapper passes its arguments on to window.siteText; every other call names its id
// and its English as literals, so the test reads every sentence the page can show.
const SITE_TEXT_WRAPPER = "const siteText = (id, english, values) => (window.siteText ? window.siteText(id, english, values) : english);";

// Every siteText("<id>", "<English>") the reports page shows, and the search page's strings of the
// reports, as [id, English].
function pageStrings() {
  const page = [...fs.readFileSync(PAGE, "utf-8").matchAll(LITERAL_SITE_TEXT)];
  const search = [...fs.readFileSync(SEARCH_PAGE, "utf-8").matchAll(LITERAL_SITE_TEXT)].filter(
    ([, id]) => id.startsWith("ch.reports.") || id === "ch.drill.nav-reports",
  );
  return [...page, ...search].map(([, id, english]) => [id, english]);
}

function welshText() {
  const source = fs.readFileSync(path.join(process.cwd(), "web/public/lib/welsh-text.js"), "utf-8");
  const window = {};
  new Function("window", source)(window);
  return window.WELSH_TEXT;
}

const reportOf = (id) => REPORT_NAMES.find((name) => id.startsWith(`ch.reports.${name}.`));

describe("the words a company report may use", () => {
  it("finds a word that rates the company, in any case, as a whole word", () => {
    expect(bannedWordsIn(["Net assets showed a Healthy rise."])).toEqual(["healthy"]);
    expect(bannedWordsIn(["The position improved; trading was strong."])).toEqual(["strong", "improved"]);
    expect(bannedWordsIn(["Goodwill: £1,200. Stronghold Ltd."])).toEqual([]);
  });

  it("adds each report's own words to the shared list for that report only", () => {
    expect(bannedWordsIn(["Processed 30 days after the usual time limit, so it was late."], "filings")).toEqual(["late"]);
    expect(bannedWordsIn(["Filed on time."], "filings")).toEqual(["on time"]);
    expect(bannedWordsIn(["Jane Smith joined the board."], "people")).toEqual(["joined"]);
    expect(bannedWordsIn(["Jane Smith joined the board."], "filings")).toEqual([]);
  });

  it("names its own words only for reports the route answers", () => {
    expect(Object.keys(REPORT_BANNED_WORDS).every((report) => REPORT_NAMES.includes(report))).toBe(true);
    expect(BANNED_WORDS.length).toBeGreaterThan(0);
  });

  it("passes the text each report module shows", async () => {
    const modules = fs.readdirSync(REPORTS_DIR).filter((file) => file.endsWith(".js") && file !== "wording.js");
    for (const file of modules) {
      const report = path.basename(file, ".js");
      const { REPORT_WORDING } = await import(path.join(REPORTS_DIR, file));
      expect(Array.isArray(REPORT_WORDING), `${file} exports REPORT_WORDING`).toBe(true);
      expect(bannedWordsIn(REPORT_WORDING, report), file).toEqual([]);
    }
  });

  it("passes every sentence the reports page shows, with each report's own words on its rows", () => {
    const strings = pageStrings();
    expect(strings.length).toBeGreaterThan(40);
    expect(strings.map(([id]) => id)).toContain("ch.drill.nav-reports");
    for (const [id, english] of strings) {
      expect(bannedWordsIn([english], reportOf(id)), id).toEqual([]);
    }
  });

  it("passes the Welsh of every sentence the reports page shows, against the Welsh list", () => {
    const welsh = welshText();
    for (const [id] of pageStrings()) {
      expect(welsh[id], `${id} has Welsh`).toBeTruthy();
      expect(bannedWordsIn([welsh[id]], reportOf(id), "cy"), id).toEqual([]);
    }
  });

  it("finds a Welsh word in any of its forms, and leaves the register's own words alone", () => {
    expect(bannedWordsIn(["Mae’r sefyllfa’n gryf."], undefined, "cy")).toEqual(["gryf"]);
    expect(bannedWordsIn(["Arwystl i sicrhau dyled."], "charges", "cy")).toEqual(["dyled"]);
    expect(bannedWordsIn(["Arian sy’n ddyledus i’r cwmni."], "charges", "cy")).toEqual([]);
    expect(bannedWordsIn(["Ffeiliwyd yn hwyr."], "filings", "cy")).toEqual(["hwyr"]);
    expect(Object.keys(REPORT_BANNED_WORDS_CY).sort()).toEqual(Object.keys(REPORT_BANNED_WORDS).sort());
  });

  it("names the id and the English of every siteText call as literals, so this test reads every sentence", () => {
    const source = fs.readFileSync(PAGE, "utf-8").replace(SITE_TEXT_WRAPPER, "");
    const calls = source.match(/\bsiteText\(/g) || [];
    const literals = [...source.matchAll(LITERAL_SITE_TEXT)];
    expect(calls.length).toBe(literals.length);
  });

  it("puts no text on the page that does not come through siteText", () => {
    const source = fs.readFileSync(PAGE, "utf-8");
    const rawText = [
      ...source.matchAll(/\.textContent\s*=\s*(["'`])/g),
      ...source.matchAll(/\belement\(\s*"[^"]+",\s*[^,()]+,\s*(["'`])/g),
      ...source.matchAll(/\.(?:innerHTML|innerText|insertAdjacentHTML)\b/g),
      ...source.matchAll(/createTextNode\(\s*(["'`])/g),
    ];
    expect(rawText.map(([match]) => match)).toEqual([]);
  });
});
