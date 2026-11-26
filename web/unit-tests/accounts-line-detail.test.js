// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @vitest-environment happy-dom

// web/unit-tests/accounts-line-detail.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderAccountsLines } from "../public/lib/accounts-line-detail.js";
import { MICRO_PAGE_LINES, SMALL_PAGE_LINES } from "../public/lib/accounts-page-lines.js";
import { referenceText } from "../public/lib/field-detail.js";

function pageDocument(name) {
  const html = readFileSync(join(process.cwd(), "web/public/companies-house", name), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}

describe("the accounts pages' lines", () => {
  for (const [name, lines] of [
    ["fileMicroEntityAccounts.html", MICRO_PAGE_LINES],
    ["fileSmallCompanyAccounts.html", SMALL_PAGE_LINES],
  ]) {
    test(`every figure row of ${name} has a register entry, a referenced label and, for this year, a note and a disclosure`, () => {
      const doc = pageDocument(name);
      renderAccountsLines(doc, lines, "1");
      const detailRows = doc.querySelectorAll("tr.ledger__detail").length;
      expect(detailRows).toBeGreaterThan(5);
      renderAccountsLines(doc, lines, "1");
      expect(doc.querySelectorAll("tr.ledger__detail").length, "a second render adds no second detail row").toBe(detailRows);
      const headings = [...doc.querySelectorAll("table.ledger tbody th[scope='row']")].filter((heading) =>
        heading.closest("tr").querySelector("input[id^='current'], input[id^='prior']"),
      );
      expect(headings.length).toBeGreaterThan(10);
      for (const heading of headings) {
        const id = heading.closest("tr").querySelector("input[id]").id;
        expect(heading.querySelector(".line-label").textContent, id).toMatch(/^(Balance sheet|Profit and loss) (item|note) [\w.()]+: /);
        expect(heading.dataset.lineLabel, id).toMatch(/\S/);
        expect(heading.querySelector("p, details"), id).toBeNull();
        const detail = heading.closest("tr").nextElementSibling;
        if (id.startsWith("current")) {
          expect(detail.classList.contains("ledger__detail"), id).toBe(true);
          expect(detail.querySelector("p.hint a"), id).not.toBeNull();
          expect(detail.querySelector("details.field-source"), id).not.toBeNull();
          expect(doc.getElementById(id).getAttribute("aria-describedby"), id).toContain(detail.querySelector("p.hint").id);
        } else {
          expect(detail?.classList.contains("ledger__detail") ?? false, id).toBe(false);
        }
      }
    });
  }

  test("a shared profit and loss line takes the item of the format chosen", () => {
    expect(referenceText(SMALL_PAGE_LINES.interestReceivable)).toBe("Profit and loss item 10");
    const doc = pageDocument("fileSmallCompanyAccounts.html");
    renderAccountsLines(doc, SMALL_PAGE_LINES, "2");
    const tax = doc.getElementById("currentTax").closest("tr").querySelector(".line-label");
    expect(tax.textContent).toBe("Profit and loss item 15: Tax on profit or loss");
  });

  test("a row whose line has no register entry stops the page from rendering a wrong label", () => {
    const doc = pageDocument("fileMicroEntityAccounts.html");
    const { capitalAndReserves, ...withoutOne } = MICRO_PAGE_LINES;
    expect(capitalAndReserves.reference).toBe("μBS1 K");
    expect(() => renderAccountsLines(doc, withoutOne, "1")).toThrow("capitalAndReserves");
  });
});
