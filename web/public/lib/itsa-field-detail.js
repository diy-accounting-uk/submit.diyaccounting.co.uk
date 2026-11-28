// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/itsa-field-detail.js
// The field pattern of field-detail.js on an Income Tax page: each field's label led by its form
// reference, its note with the link to the form's notes, and its "In DIY Accounting's spreadsheets"
// disclosure. A field in a ledger row takes the note and the disclosure in a detail row under it,
// as the accounts pages' lines do; a field in a form group takes the note above its input and the
// disclosure below it.

import { labelWithReference, noteOf, sourceDisclosure } from "./field-detail.js";

/**
 * Give each field on the page its reference, note and disclosure, once; a field rendered again
 * takes them again.
 * @param {Document} doc
 * @param {Record<string, object>} fields - register entries by the id of their input
 */
export function applyFieldDetail(doc, fields) {
  for (const [inputId, entry] of Object.entries(fields)) {
    const input = doc.getElementById(inputId);
    const label = doc.querySelector(`label[for="${inputId}"]`);
    if (!input || !label || input.dataset.fieldDetail === "applied") continue;
    input.dataset.fieldDetail = "applied";
    const field = { ...entry, id: inputId, label: label.textContent.trim() };
    label.textContent = labelWithReference(field);
    const detailId = `${inputId}-field`;
    const note = noteOf(field, detailId);
    const disclosure = sourceDisclosure(field, { id: detailId });
    const row = input.closest("tr");
    if (row) {
      const detail = doc.createElement("tr");
      detail.className = "ledger__detail";
      const cell = doc.createElement("td");
      cell.colSpan = row.cells.length;
      cell.append(note, disclosure);
      detail.append(cell);
      row.after(detail);
    } else {
      const control = input.closest(".input-prefix") ?? input;
      control.before(note);
      control.after(disclosure);
    }
    if (!note.hidden) {
      const described = (input.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      input.setAttribute("aria-describedby", [...described, `${detailId}-hint`].join(" "));
    }
  }
}
