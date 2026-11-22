// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/companyReports/wording.test.js

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { bannedWordsIn, BANNED_WORDS, REPORT_BANNED_WORDS } from "@app/lib/companyReports/wording.js";
import { REPORT_NAMES } from "@app/functions/companies-house/companiesHouseCompanyReportGet.js";

const REPORTS_DIR = path.join(process.cwd(), "app/lib/companyReports");
const PAGE = path.join(process.cwd(), "web/public/companies-house/companyReports.page.js");

// Every siteText("<id>", "<English>") the reports page shows, as [id, English].
function pageStrings() {
  const source = fs.readFileSync(PAGE, "utf-8");
  return [...source.matchAll(/\bsiteText\(\s*"([^"]+)",\s*"((?:[^"\\]|\\.)*)"/g)].map(([, id, english]) => [id, english]);
}

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
    for (const [id, english] of strings) {
      const report = REPORT_NAMES.find((name) => id.startsWith(`ch.reports.${name}.`));
      expect(bannedWordsIn([english], report), id).toEqual([]);
    }
  });
});
