// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/companiesHousePageIds.test.js
// Every Companies House page, English and Welsh, gives each element its own id, so a label, a hint
// or an aria-describedby names one element.

import { describe, test, expect } from "vitest";
import fs from "fs";
import path from "path";

const FOLDERS = ["web/public/companies-house", "web/public/cy/companies-house"];

const pages = FOLDERS.flatMap((folder) =>
  fs
    .readdirSync(folder)
    .filter((name) => name.endsWith(".html"))
    .map((name) => path.join(folder, name)),
);

function duplicateIds(html) {
  const counts = new Map();
  for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([id]) => id);
}

describe("Companies House page ids", () => {
  test("the pages are found in both languages", () => {
    expect(pages.filter((page) => page.includes("/cy/")).length).toBeGreaterThan(10);
    expect(pages.filter((page) => !page.includes("/cy/")).length).toBeGreaterThan(10);
  });

  test.each(pages)("%s has no id twice", (page) => {
    expect(duplicateIds(fs.readFileSync(page, "utf8"))).toEqual([]);
  });

  test("an id given twice is found", () => {
    expect(duplicateIds('<p id="hint"></p><input id="field" /><p id="hint"></p>')).toEqual(["hint"]);
  });
});
