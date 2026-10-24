// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Generated from app/lib/submissionRecord.js by scripts/generate-submission-record.mjs. Edit the source and run
// npm run generate:submission-record.

// The render helper for every submission record, in the house style that
// web/public/submission-record.css defines. The record functions write the plain record: the
// entity's name and reference, the title and period, the statement tables with their figures,
// and the approval line. customerCopyHtml puts DIY Accounting's frame around a record and
// leaves the record unchanged. This module imports nothing, so that the iXBRL builders under
// Node and the site pages in a browser run the same code. The browser copy,
// web/public/lib/submission-record.js, is written from this file by
// scripts/generate-submission-record.mjs.

const STATUS_KINDS = new Set(["accepted", "sent", "pending", "rejected"]);

/**
 * Text made safe to place in XHTML element content.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeRecordText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Text made safe to place in a double-quoted XHTML attribute.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeRecordAttribute(value) {
  return escapeRecordText(value).replace(/"/g, "&quot;");
}

/**
 * A figure as printed in a statement column, shown in brackets when it is a deduction from the
 * lines above it or a negative amount (but not both).
 * @param {string} contentHtml - the figure's markup: a tagged iXBRL fact, or escaped text
 * @param {number} value
 * @param {{deduction?: boolean}} [options]
 * @returns {{html: string, bracketed: boolean}}
 */
export function recordFigure(contentHtml, value, { deduction = false } = {}) {
  const bracketed = value !== 0 && deduction !== value < 0;
  return { html: bracketed ? `(${contentHtml})` : contentHtml, bracketed };
}

/**
 * An amount for a record that carries no tagged facts: the absolute value with thousands
 * separators, in brackets as recordFigure decides.
 * @param {number} value
 * @param {{decimals?: number, deduction?: boolean}} [options]
 * @returns {{html: string, bracketed: boolean}}
 */
export function recordAmount(value, { decimals = 0, deduction = false } = {}) {
  const text = Math.abs(value).toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return recordFigure(escapeRecordText(text), value, { deduction });
}

/**
 * One statement laid out as printed accounts: a label column, an optional note column and one
 * right-aligned figure column per heading, with a pound sign under each heading.
 *
 * Each row is {label, note?, cells?, style?, indent?}: cells holds one recordFigure() result (or
 * null for a blank cell) per column; style is "heading" (a label with no figures), "subtotal" (a
 * rule above the figures) or "total" (a rule above and a double rule below).
 *
 * @param {object} table
 * @param {string[]} table.columns - the heading of each figure column, e.g. ["2025", "2024"]
 * @param {boolean} [table.notes] - whether the table carries a note column
 * @param {object[]} table.rows
 * @returns {string}
 */
export function recordTable({ columns, notes = false, rows }) {
  const noteHeading = notes ? '<th class="note">Note</th>' : "";
  const headings = columns.map((heading) => `<th class="figure">${escapeRecordText(heading)}</th>`).join("");
  const pounds = columns.map(() => '<th class="figure">£</th>').join("");
  const body = rows
    .map((row) => {
      const rowClass = row.style ? ` class="${row.style}"` : "";
      const labelClass = row.indent ? ' class="label indent"' : ' class="label"';
      const noteText = row.note ? escapeRecordText(String(row.note)) : "";
      const noteCell = notes ? `<td class="note">${noteText}</td>` : "";
      const cells = (row.cells ?? columns.map(() => null))
        .map((cell) => {
          if (!cell) return '<td class="figure"></td>';
          return `<td class="figure${cell.bracketed ? "" : " positive"}">${cell.html}</td>`;
        })
        .join("");
      return `<tr${rowClass}><td${labelClass}>${escapeRecordText(row.label)}</td>${noteCell}${cells}</tr>`;
    })
    .join("\n");
  return `<table class="statement">
<thead><tr><th class="label"></th>${noteHeading}${headings}</tr><tr><th class="label"></th>${notes ? '<th class="note"></th>' : ""}${pounds}</tr></thead>
<tbody>
${body}
</tbody>
</table>`;
}

/**
 * The heading every page of a record carries: the entity's name, its references (registered
 * number, VAT registration number, UTR, National Insurance number), the page's title and the
 * line under it.
 * @param {object} heading
 * @param {string} heading.nameHtml - already escaped, may hold a tagged fact
 * @param {string[]} [heading.referenceHtml] - one line per reference, already escaped
 * @param {string} heading.title
 * @param {string} heading.subtitleHtml - already escaped, may hold a tagged fact
 * @returns {string}
 */
export function recordHeading({ nameHtml, referenceHtml = [], title, subtitleHtml }) {
  const references = referenceHtml.map((line) => `<p class="reference">${line}</p>\n`).join("");
  return `<p class="entity">${nameHtml}</p>
${references}<h2>${escapeRecordText(title)}</h2>
<p class="subtitle">${subtitleHtml}</p>
`;
}

/**
 * The customer copy: the record's sections, each unchanged inside a .submission-record sheet,
 * framed by the brand, the submission's number, status and date, a plain explanation beside
 * each section, and the links back into the journey.
 *
 * @param {object} copy
 * @param {string} copy.title - e.g. "Your copy of the VAT return for July to September 2026"
 * @param {{label: string, value: string}} copy.reference - e.g. {label: "Form bundle number", value: "123456789012"}
 * @param {{kind: "accepted"|"sent"|"pending"|"rejected", text: string}} copy.status
 * @param {string} copy.date - the date as the customer reads it, e.g. "24 October 2026"
 * @param {{heading?: string, explanation?: string, recordHtml: string}[]} copy.sections
 * @param {{href: string, text: string}[]} [copy.links]
 * @returns {string}
 */
export function customerCopyHtml({ title, reference, status, date, sections, links = [] }) {
  if (!STATUS_KINDS.has(status.kind)) throw new Error(`Unknown submission status kind: ${status.kind}`);
  const sectionHtml = sections
    .map((section) => {
      const label = section.heading ?? title;
      const heading = section.heading ? `<h3 class="customer-copy-section-heading">${escapeRecordText(section.heading)}</h3>\n` : "";
      const explanation = section.explanation ? `<p class="customer-copy-explanation">${escapeRecordText(section.explanation)}</p>\n` : "";
      return `<section class="customer-copy-section" aria-label="${escapeRecordAttribute(label)}">
${heading}${explanation}<div class="customer-copy-sheet" role="region" tabindex="0" aria-label="${escapeRecordAttribute(`The record: ${label}`)}"><div class="submission-record">
${section.recordHtml}
</div></div>
</section>`;
    })
    .join("\n");
  const linkItems = links
    .map((link) => `<li><a href="${escapeRecordAttribute(link.href)}">${escapeRecordText(link.text)}</a></li>`)
    .join("");
  const linksHtml = links.length ? `\n<nav class="customer-copy-links" aria-label="What to do next"><ul>${linkItems}</ul></nav>` : "";
  return `<article class="customer-copy">
<header class="customer-copy-header">
<p class="customer-copy-brand">DIY Accounting Submit</p>
<h2 class="customer-copy-title">${escapeRecordText(title)}</h2>
<dl class="customer-copy-submission">
<div><dt>${escapeRecordText(reference.label)}</dt><dd>${escapeRecordText(reference.value)}</dd></div>
<div><dt>Status</dt><dd class="customer-copy-status" data-status="${status.kind}">${escapeRecordText(status.text)}</dd></div>
<div><dt>Date</dt><dd>${escapeRecordText(date)}</dd></div>
</dl>
</header>
${sectionHtml}${linksHtml}
</article>`;
}
