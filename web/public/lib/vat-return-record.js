// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/vat-return-record.js
// The record of a VAT return in the submission-record house style: the nine boxes as HMRC
// prints them, the period and the declaration. The receipts page and the return view both fill
// it. The browser helper lives in submission-record.js; this module adds the VAT content.

import { escapeRecordAttribute, escapeRecordText, recordAmount, recordHeading, recordTable } from "./submission-record.js";

const ABSENT = "—";
const MONEY_BOXES_TO = 5;
const ROW_STYLES = { 3: "subtotal", 5: "total" };

// One printed page of the record, with the page's margins.
function page(html) {
  return `<div class="page">\n${html}\n</div>`;
}

function isAmount(value) {
  if (value === undefined || value === null || value === "" || typeof value === "boolean") return false;
  return Number.isFinite(Number(value));
}

// A box HMRC left out shows a dash, never a nought it did not send.
function boxCell(box, value) {
  if (!isAmount(value)) return { html: ABSENT, bracketed: true };
  return recordAmount(Number(value), { decimals: box <= MONEY_BOXES_TO ? 2 : 0 });
}

/**
 * The rows of the boxes from first to last, each labelled with its box number first.
 * @param {object} data - HMRC's VAT return, keyed by field name
 * @param {{box: number, field: string, label: string}[]} boxes - the catalogue of the nine boxes
 * @param {number} first
 * @param {number} last
 */
export function vatBoxRows(data, boxes, first, last) {
  return boxes
    .filter((box) => box.box >= first && box.box <= last)
    .map((box) => ({
      label: `Box ${box.box}: ${box.label}`,
      cells: [boxCell(box.box, data[box.field])],
      style: ROW_STYLES[box.box],
      box,
    }));
}

// A table of box rows, with each row carrying the box's field name and a stable id so a test or a
// link can find it. Each body row of the table is one line that starts with "<tr".
function boxTable(data, boxes, first, last, columnHeading) {
  const rows = vatBoxRows(data, boxes, first, last);
  const lines = recordTable({ columns: [columnHeading], rows }).split("\n");
  let index = 0;
  return lines
    .map((line) => {
      if (!line.startsWith("<tr")) return line;
      const { box } = rows[index];
      index += 1;
      return line.replace("<tr", `<tr id="vatReturnBox${box.box}" data-hmrc-field="${escapeRecordAttribute(box.field)}"`);
    })
    .join("\n");
}

/**
 * The record sections of a VAT return.
 * @param {object} options
 * @param {object} options.data - HMRC's VAT return
 * @param {object[]} options.boxes - the nine-box catalogue
 * @param {string} options.vatNumber - may be empty
 * @param {string} options.periodHtml - already escaped, e.g. "<strong>1 Jul 2026 to 30 Sep 2026</strong>"
 * @param {string} options.declarationHtml - already escaped: the closing line of the record
 * @returns {{moneyHtml: string, turnoverHtml: string, declarationHtml: string}}
 */
export function vatReturnRecordSections({ data, boxes, vatNumber, periodHtml, declarationHtml }) {
  const reference = vatNumber ? [`VAT registration number ${escapeRecordText(vatNumber)}`] : [];
  const heading = recordHeading({
    nameHtml: "VAT return",
    referenceHtml: reference,
    title: "Value Added Tax return",
    subtitleHtml: `Period: ${periodHtml}`,
  });
  return {
    moneyHtml: page(`${heading}${boxTable(data, boxes, 1, MONEY_BOXES_TO, "VAT due")}`),
    turnoverHtml: page(`<h3>Turnover, in whole pounds</h3>\n${boxTable(data, boxes, MONEY_BOXES_TO + 1, 9, "Value")}`),
    declarationHtml: page(`<p class="approval">${declarationHtml}</p>`),
  };
}

function receiptLine(label, value) {
  const text = value === undefined || value === null || String(value).trim() === "" ? "Not returned by HMRC" : String(value).trim();
  return `<tr><td class="label">${escapeRecordText(label)}</td><td class="label text-value">${escapeRecordText(text)}</td></tr>`;
}

/**
 * The record of the receipt HMRC returned for a VAT return, as HMRC returned it.
 * @param {object} receipt
 * @param {string} receipt.processingDateText - the processing date as the customer reads it
 * @param {string} [receipt.formBundleNumber]
 * @param {string} [receipt.paymentIndicator]
 * @param {string} [receipt.chargeRefNumber]
 * @returns {string}
 */
export function vatReceiptRecordHtml({ processingDateText, formBundleNumber, paymentIndicator, chargeRefNumber }) {
  const heading = recordHeading({
    nameHtml: "VAT return receipt",
    referenceHtml: formBundleNumber ? [`Form bundle number ${escapeRecordText(formBundleNumber)}`] : [],
    title: "Receipt from HMRC",
    subtitleHtml: `Processed ${escapeRecordText(processingDateText)}`,
  });
  const lines = [
    receiptLine("Processing date", processingDateText),
    receiptLine("Form bundle number", formBundleNumber),
    receiptLine("Payment indicator", paymentIndicator),
    receiptLine("Charge reference number", chargeRefNumber),
  ].join("\n");
  return page(`${heading}<table class="statement">\n<tbody>\n${lines}\n</tbody>\n</table>`);
}
