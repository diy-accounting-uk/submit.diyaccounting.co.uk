// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/ixdsFixtures.test.js
// The committed Inline XBRL document set fixtures are the ones the test helper builds from the small
// company case, so they carry its figures.

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import { ixdsTwoFileSets } from "../../app/test-helpers/accountsDocumentCases.js";

describe("the committed two-file document sets", () => {
  for (const [directory, files] of Object.entries(ixdsTwoFileSets())) {
    for (const [name, content] of Object.entries(files)) {
      test(`${directory}/${name} is the set the helper builds`, () => {
        expect(fs.readFileSync(`web/browser-tests/fixtures/${directory}/${name}`, "utf8")).toBe(content);
      });
    }
  }

  test("the prior profit and loss reserve moves to the current one by the profit for the year", () => {
    const first = fs.readFileSync("web/browser-tests/fixtures/ixds-two-file/accounts-1.xhtml", "utf8");
    const second = fs.readFileSync("web/browser-tests/fixtures/ixds-two-file/accounts-2.xhtml", "utf8");
    const figure = (text, context) => Number(new RegExp(`contextRef="${context}"[^>]*>([\\d,]+)<`).exec(text)[1].replace(/,/g, ""));
    const reserve = (year) => figure(first, `e${year}-profit-and-loss-account`);
    const profit = Number(/name="core:ProfitLoss" contextRef="y2025"[^>]*>([\d,]+)</.exec(second)[1].replace(/,/g, ""));
    expect(reserve(2025) - reserve(2024)).toBe(profit);
  });
});
