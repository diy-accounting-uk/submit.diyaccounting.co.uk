// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/accounts-line-detail.js
// The micro-entity and small company accounts pages' lines with what the CT600's accounts section
// shows for the same lines: the statutory label led by its format item, the note with its link to
// the Regulations, and the "In DIY Accounting's spreadsheets" disclosure. A line the CT600 also has
// takes its register entry from ct600-fields.js; the lines and their entries are in
// accounts-page-lines.js. A row shows the note and the disclosure once, on this year's figure.

import { labelWithReference, noteOf, sourceDisclosure } from "./field-detail.js";
import { MICRO_PAGE_LINES, SMALL_PAGE_LINES } from "./accounts-page-lines.js";

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

const FIGURE_ID = /^(current|prior)([A-Z]\w*)$/;

/** The line a ledger row holds, by its figure's id, with the reference of the profit and loss format chosen. */
export function lineOfRow(row, lines, format) {
  const input = row.querySelector("input[id]");
  const match = FIGURE_ID.exec(input?.id ?? "");
  if (!match) return null;
  const id = match[2].charAt(0).toLowerCase() + match[2].slice(1);
  const found = lines[id];
  if (!found) throw new Error(`No register entry for the accounts line ${id}`);
  const year = match[1];
  return { year, line: format === "2" && found.referenceInFormat2 ? { ...found, reference: found.referenceInFormat2 } : found };
}

/**
 * Give each ledger row of the page its referenced label and, under this year's row, a full-width row
 * with its note and disclosure; the note describes the row's figures. A row's heading keeps the plain
 * label in data-line-label for the prior-year fill to name.
 */
export function renderAccountsLines(doc, lines, format) {
  const optional = siteText("ch.prior.optional-qualifier", "(optional)");
  for (const heading of doc.querySelectorAll("table.ledger tbody th[scope='row']")) {
    const row = heading.closest("tr");
    const found = lineOfRow(row, lines, format);
    if (!found) continue;
    const { year, line: entry } = found;
    const wasOptional = heading.dataset.optional === "true" || heading.textContent.trim().endsWith(optional);
    heading.dataset.optional = String(wasOptional);
    heading.dataset.lineLabel = entry.label;
    const label = doc.createElement("span");
    label.className = "line-label";
    const referenced = labelWithReference(entry);
    label.textContent = wasOptional ? `${referenced} ${optional}` : referenced;
    heading.replaceChildren(label);
    if (year !== "current") continue;
    const id = `line${entry.id.charAt(0).toUpperCase()}${entry.id.slice(1)}`;
    const earlier = row.nextElementSibling?.classList.contains("ledger__detail") ? row.nextElementSibling : null;
    const wasOpen = Boolean(earlier?.querySelector("details[open]"));
    earlier?.remove();
    const detail = doc.createElement("tr");
    detail.className = "ledger__detail";
    if (row.dataset.profitAndLossFormat) detail.dataset.profitAndLossFormat = row.dataset.profitAndLossFormat;
    detail.hidden = row.hidden;
    const cell = doc.createElement("td");
    cell.colSpan = row.cells.length;
    const disclosure = sourceDisclosure(entry, { id });
    disclosure.open = wasOpen;
    cell.append(noteOf(entry, id), disclosure);
    detail.append(cell);
    row.after(detail);
    for (const input of row.querySelectorAll("input")) {
      const described = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((token) => token && token !== `${id}-hint`);
      input.setAttribute("aria-describedby", [...described, `${id}-hint`].join(" "));
    }
  }
}

function chosenFormat(doc) {
  return doc.querySelector('input[name="profitAndLossFormat"]:checked')?.value ?? "1";
}

if (typeof document !== "undefined") {
  const small = Boolean(document.getElementById("profitAndLossFormat1"));
  const lines = small ? SMALL_PAGE_LINES : MICRO_PAGE_LINES;
  renderAccountsLines(document, lines, chosenFormat(document));
  for (const radio of document.querySelectorAll('input[name="profitAndLossFormat"]')) {
    radio.addEventListener("change", () => renderAccountsLines(document, lines, chosenFormat(document)));
  }
}
