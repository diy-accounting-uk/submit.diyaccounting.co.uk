// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { generatedFiles, recordStyleFromStylesheet } from "../../../scripts/generate-submission-record.mjs";
import { customerCopyHtml, recordAmount, recordFigure, recordHeading, recordTable } from "@app/lib/submissionRecord.js";
import { RECORD_STYLE } from "@app/lib/submissionRecordStyle.js";
import { accountsDocumentCases, computationsDocumentCase } from "@app/test-helpers/accountsDocumentCases.js";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");

describe("the generated copies of the submission record style", () => {
  test.each(generatedFiles(ROOT).map((file) => [file.path, file.contents]))("%s is current with its source", (path, contents) => {
    expect(readFileSync(join(ROOT, path), "utf8")).toBe(contents);
  });

  test("every filed document carries the record section of the stylesheet inline", () => {
    const documents = [...accountsDocumentCases().map((testCase) => testCase.xhtml), computationsDocumentCase()];
    for (const xhtml of documents) {
      expect(xhtml).toContain(`<style type="text/css">${RECORD_STYLE}</style>`);
    }
  });

  test("the inline copy removes the scope and reads the bare scope as body", () => {
    const css = `/* record:start */
.submission-record {
  margin: 0;
}
.submission-record table.statement th,
.submission-record table.statement td {
  padding: 1mm
    2mm;
}
/* record:end */
.customer-copy { color: red; }`;
    expect(recordStyleFromStylesheet(css)).toBe("\nbody { margin: 0; }\ntable.statement th, table.statement td { padding: 1mm 2mm; }\n");
  });

  test("the inline copy refuses a record rule outside the scope", () => {
    const css = "/* record:start */\n.page { margin: 0; }\n/* record:end */";
    expect(() => recordStyleFromStylesheet(css)).toThrow(/outside \.submission-record: \.page/);
  });
});

describe("the record", () => {
  test("an amount carries thousands separators and a deduction or a negative shows in brackets", () => {
    expect(recordAmount(1234567)).toEqual({ html: "1,234,567", bracketed: false });
    expect(recordAmount(-1234.5, { decimals: 2 })).toEqual({ html: "(1,234.50)", bracketed: true });
    expect(recordAmount(500, { deduction: true })).toEqual({ html: "(500)", bracketed: true });
    expect(recordAmount(-500, { deduction: true })).toEqual({ html: "500", bracketed: false });
    expect(recordAmount(0, { deduction: true })).toEqual({ html: "0", bracketed: false });
  });

  test("a table has a pound sign under each column heading and a rule class per subtotal and total", () => {
    const html = recordTable({
      columns: ["2026", "2025"],
      rows: [
        { label: "Sales", cells: [recordAmount(1000), recordAmount(900)] },
        { label: "Costs", cells: [recordAmount(400, { deduction: true }), null] },
        { label: "Profit", style: "total", cells: [recordAmount(600), recordAmount(900)] },
      ],
    });
    expect(html).toContain(
      '<th class="figure">2026</th><th class="figure">2025</th></tr><tr><th class="label"></th><th class="figure">£</th>',
    );
    expect(html).toContain('<tr><td class="label">Costs</td><td class="figure">(400)</td><td class="figure"></td></tr>');
    expect(html).toContain('<tr class="total"><td class="label">Profit</td><td class="figure positive">600</td>');
  });

  test("a heading names the entity and each reference on its own line", () => {
    const html = recordHeading({
      nameHtml: "A &amp; B Trading",
      referenceHtml: ["VAT registration number: 123456789"],
      title: "VAT return",
      subtitleHtml: "for the period 1 July 2026 to 30 September 2026",
    });
    expect(html).toBe(
      '<p class="entity">A &amp; B Trading</p>\n<p class="reference">VAT registration number: 123456789</p>\n<h2>VAT return</h2>\n<p class="subtitle">for the period 1 July 2026 to 30 September 2026</p>\n',
    );
  });

  test("a figure keeps tagged markup inside its brackets", () => {
    expect(recordFigure('<ix:nonFraction name="x">5</ix:nonFraction>', -5).html).toBe('(<ix:nonFraction name="x">5</ix:nonFraction>)');
  });
});

describe("the customer copy", () => {
  const recordHtml = '<div class="page"><p class="entity">A &amp; B Trading</p></div>';
  const copy = {
    title: "Your copy of the VAT return",
    reference: { label: "Form bundle number", value: "123456789012" },
    status: { kind: "accepted", text: "Accepted by HMRC" },
    date: "24 October 2026",
    sections: [{ heading: "The nine boxes", explanation: "Box 5 is what you pay <now>.", recordHtml }],
    links: [{ href: '/hmrc/receipt/receipts.html?name=a"b', text: "Back to your receipts" }],
  };

  test("holds the record unchanged inside a record sheet", () => {
    expect(customerCopyHtml(copy)).toContain(`<div class="submission-record">\n${recordHtml}\n</div>`);
  });

  test("shows the submission's number, status in words and date, and escapes what it is given", () => {
    const html = customerCopyHtml(copy);
    expect(html).toContain("<dt>Form bundle number</dt><dd>123456789012</dd>");
    expect(html).toContain('<dd class="customer-copy-status" data-status="accepted">Accepted by HMRC</dd>');
    expect(html).toContain("Box 5 is what you pay &lt;now&gt;.");
    expect(html).toContain('href="/hmrc/receipt/receipts.html?name=a&quot;b"');
  });

  test("refuses a status it has no style for", () => {
    expect(() => customerCopyHtml({ ...copy, status: { kind: "done", text: "Done" } })).toThrow(/Unknown submission status kind: done/);
  });
});
