// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/vat-return-record.js
// The record of a VAT return in the submission-record house style: the nine boxes as HMRC
// prints them, the period and the declaration. The receipts page and the return view both fill
// it. The browser helper lives in submission-record.js; this module adds the VAT content.

import { escapeRecordAttribute, escapeRecordText, recordAmount, recordHeading, recordTable } from "./submission-record.js";

// page-chrome.js gives the text in the reader's language; without it the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

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
      label: siteText("vat.box-row", "Box {box}: {label}", { box: box.box, label: box.label }),
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
  const reference = vatNumber ? [siteText("vat.record-vrn", "VAT registration number {vrn}", { vrn: escapeRecordText(vatNumber) })] : [];
  const heading = recordHeading({
    nameHtml: siteText("vat.record-name", "VAT return"),
    referenceHtml: reference,
    title: siteText("vat.record-title", "Value Added Tax return"),
    subtitleHtml: siteText("vat.record-period", "Period: {period}", { period: periodHtml }),
  });
  return {
    moneyHtml: page(`${heading}${boxTable(data, boxes, 1, MONEY_BOXES_TO, siteText("vat.record-vat-due", "VAT due"))}`),
    turnoverHtml: page(
      `<h3>${siteText("vat.record-turnover", "Turnover, in whole pounds")}</h3>\n${boxTable(data, boxes, MONEY_BOXES_TO + 1, 9, siteText("vat.record-value", "Value"))}`,
    ),
    declarationHtml: page(`<p class="approval">${declarationHtml}</p>`),
  };
}

function receiptLine(label, value) {
  const text =
    value === undefined || value === null || String(value).trim() === ""
      ? siteText("receipt.not-returned", "Not returned by HMRC")
      : String(value).trim();
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
    nameHtml: siteText("receipt.vat-name", "VAT return receipt"),
    referenceHtml: formBundleNumber
      ? [siteText("receipt.form-bundle-ref", "Form bundle number {number}", { number: escapeRecordText(formBundleNumber) })]
      : [],
    title: siteText("receipt.from-hmrc", "Receipt from HMRC"),
    subtitleHtml: siteText("receipt.processed", "Processed {date}", { date: escapeRecordText(processingDateText) }),
  });
  const lines = [
    receiptLine(siteText("receipt.processing-date", "Processing date"), processingDateText),
    receiptLine(siteText("receipt.form-bundle-number", "Form bundle number"), formBundleNumber),
    receiptLine(siteText("receipt.payment-indicator", "Payment indicator"), paymentIndicator),
    receiptLine(siteText("receipt.charge-reference", "Charge reference number"), chargeRefNumber),
  ].join("\n");
  return page(`${heading}<table class="statement">\n<tbody>\n${lines}\n</tbody>\n</table>`);
}
