// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @vitest-environment happy-dom

// web/unit-tests/confirmation-statement-fields.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONFIRMATION_STATEMENT_FIELDS,
  DIRECTOR_PERSONAL_CODE_FIELD,
  PSC_PERSONAL_CODE_FIELD,
  showConfirmationStatementFields,
  showFieldDetail,
} from "../public/lib/confirmation-statement-fields.js";
import { referenceText, sourceLinksOf } from "../public/lib/field-detail.js";

// The page's markup without its scripts and stylesheets, which the test DOM does not load.
const PAGE_HTML = readFileSync(join(process.cwd(), "web/public/companies-house/fileConfirmationStatement.html"), "utf-8").replace(
  /<script[\s\S]*?<\/script>|<link[^>]*>/g,
  "",
);

describe("the confirmation statement's field register", () => {
  test("every field names a section of the Companies Act 2006 and links to it", () => {
    for (const field of [...CONFIRMATION_STATEMENT_FIELDS, DIRECTOR_PERSONAL_CODE_FIELD, PSC_PERSONAL_CODE_FIELD]) {
      const section = field.reference.replace(/^CA /, "");
      expect(referenceText(field)).toBe(`Companies Act section ${section}`);
      expect(sourceLinksOf(field)).toEqual([
        { href: `https://www.legislation.gov.uk/ukpga/2006/46/section/${section}`, text: `Companies Act 2006, section ${section}` },
      ]);
      expect(field.hint).toMatch(/\.$/);
    }
  });

  test("the lawful purpose statement's section keeps both of its letters", () => {
    const lawful = CONFIRMATION_STATEMENT_FIELDS.find((field) => field.id === "lawfulPurposeStatement");
    expect(referenceText(lawful)).toBe("Companies Act section 853BA");
  });

  test("every field of the review form is an input on the page, with its label", () => {
    const doc = new DOMParser().parseFromString(PAGE_HTML, "text/html");
    for (const field of CONFIRMATION_STATEMENT_FIELDS) {
      expect(doc.getElementById(field.id), field.id).not.toBeNull();
      expect(doc.querySelector(`label[for="${field.id}"]`), field.id).not.toBeNull();
    }
  });
});

describe("showing a field's reference and note", () => {
  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(PAGE_HTML, "text/html").body.innerHTML;
  });

  test("the label leads with its section and the note replaces the earlier hint", () => {
    showConfirmationStatementFields(document);
    expect(document.querySelector('label[for="sicCodes"]').textContent).toBe("Companies Act section 853C: SIC codes");
    const notes = document.querySelectorAll("#sicCodes-hint");
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toContain("Enter up to four, separated by commas.");
    expect(notes[0].querySelector("a").getAttribute("href")).toBe("https://www.legislation.gov.uk/ukpga/2006/46/section/853C");
    expect(document.getElementById("sicCodes").getAttribute("aria-describedby")).toBe("sicCodes-hint");
  });

  test("a money field keeps its format hint and is described by both", () => {
    showConfirmationStatementFields(document);
    expect(document.getElementById("totalAmountUnpaid").getAttribute("aria-describedby")).toBe(
      "totalAmountUnpaid-hint totalAmountUnpaid-money-hint",
    );
    expect(document.getElementById("totalAmountUnpaid-money-hint")).not.toBeNull();
  });

  test("a tick box's note follows the choice, and showing it twice adds nothing", () => {
    showConfirmationStatementFields(document);
    showConfirmationStatementFields(document);
    const label = document.querySelector('label[for="lawfulPurposeStatement"]');
    expect(label.textContent).toMatch(/^Companies Act section 853BA: The company confirms/);
    expect(label.textContent.match(/Companies Act section/g)).toHaveLength(1);
    expect(label.closest(".choice").nextElementSibling.id).toBe("lawfulPurposeStatement-hint");
  });

  test("a director row's personal code takes the director's note by its row id", () => {
    document.getElementById("directorRowsContainer").innerHTML =
      '<label for="directorPersonalCode-0">Companies House personal code</label><input id="directorPersonalCode-0" />';
    showFieldDetail(document, DIRECTOR_PERSONAL_CODE_FIELD, "directorPersonalCode-0");
    expect(document.querySelector('label[for="directorPersonalCode-0"]').textContent).toBe(
      "Companies Act section 1110A: Companies House personal code",
    );
    expect(document.getElementById("directorPersonalCode-0").getAttribute("aria-describedby")).toBe("directorPersonalCode-0-hint");
  });
});
