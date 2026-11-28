// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/hmrc/vat/submitVat.detail.js
// What the VAT return form says about each box and about a failure: each box's note links to its
// section of VAT Notice 700/12 and is followed by the "In DIY Accounting's spreadsheets"
// disclosure; a failed return or Assist check shows the failure panel under the status messages.
// submitVat.page.js calls window.vatFilingFailure.

import { VAT_BOX_FIELDS, noticeUrl } from "../../lib/vat-fields.js";
import { addPicturedCells, parseSheetCells, sourceDisclosure } from "../../lib/field-detail.js";
import { classifyHmrcVatFailure, showFailureDetail } from "../../lib/filing-failure.js";

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

addPicturedCells(VAT_BOX_FIELDS.filter((field) => field.source).flatMap((field) => parseSheetCells(field.source.thisYear)));

function noticeLink(doc, box) {
  const link = doc.createElement("a");
  link.href = noticeUrl(box);
  link.target = "_blank";
  link.rel = "noopener";
  link.dataset.notice = String(box);
  link.textContent = siteText("vat.notice-link", "VAT Notice 700/12, box {box}", { box });
  return link;
}

/** Add each box's notice link to its note, and its spreadsheet disclosure after the note. */
export function addBoxDetail(doc) {
  const welsh = globalThis.siteLanguage?.chrome?.() === "cy";
  for (const field of VAT_BOX_FIELDS) {
    const hint = doc.getElementById(`${field.id}-hint`);
    if (!hint || hint.querySelector("a[data-notice]")) continue;
    const text = hint.textContent.trim();
    const inEnglish = welsh ? [" ", Object.assign(doc.createElement("span"), { className: "lang-mark", textContent: "(yn Saesneg)" })] : [];
    hint.append(text && !/[.!?]$/.test(text) ? ". " : " ", noticeLink(doc, field.box), ...inEnglish, ".");

    // The register entry without its box, so the disclosure reads this table's cell and no other.
    const details = sourceDisclosure(
      { id: field.id, source: field.source },
      field.source ? { rows: [{ title: siteText("vat.source-first-quarter", "First quarter"), value: field.source.thisYear }] } : {},
    );
    if (field.source) {
      const later = doc.createElement("p");
      later.className = "field-source__note";
      later.textContent = siteText("vat.source-later-quarters", "Sheets VATQtr2 to VATQtr5 hold the same cell for the later quarters.");
      details.append(later);
    }
    hint.after(details);
  }
}

function answersText() {
  return siteText("vat.failure-answers", "Your answers are still in this form and saved in this browser until you close the tab.");
}

/** Show the failure panel for a VAT return that did not go through, or an Assist check that failed. */
function showFailure(error, sent) {
  return showFailureDetail(document, { sent, answers: answersText(), failure: classifyHmrcVatFailure(error) });
}

window.vatFilingFailure = { show: showFailure };

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => addBoxDetail(document));
else addBoxDetail(document);
