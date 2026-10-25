// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/filing-record.js
// The customer copy of a Companies House accounts filing and of a Company Tax Return, in the
// house style of submission-record.css. The filed documents show as filed, each in a frame of its
// own. The receipt that the gateway or HMRC returned shows as a record. The module holds no page
// state: a page passes in the stored receipt and gets markup back.

import { customerCopyHtml, escapeRecordAttribute, escapeRecordText, recordAmount, recordHeading } from "./submission-record.js";
import { CT600_BOX_ROWS, TEXT_BOXES } from "./ct600-fields.js";

export const ACCOUNTS_KIND = "companies-house-accounts";
export const CT_RETURN_KIND = "company-tax-return";

export const ABSENT = "—";
const RECEIPT_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)-/;

/** The filing kinds this module draws a customer copy for. */
export function isFilingReceipt(receipt) {
  return Boolean(receipt) && (receipt.kind === ACCOUNTS_KIND || receipt.kind === CT_RETURN_KIND);
}

/**
 * The date a receipt was stored, as the customer reads it, taken from the receipt's name.
 * @param {string} receiptName - e.g. "2026-10-24T10:15:00.000Z-00001A.json"
 * @returns {string} e.g. "24 October 2026", or a dash when the name carries no date
 */
export function filingDateText(receiptName) {
  const match = RECEIPT_TIMESTAMP.exec(String(receiptName ?? ""));
  const date = match ? new Date(match[1]) : null;
  if (!date || Number.isNaN(date.getTime())) return ABSENT;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function page(html) {
  return `<div class="page">\n${html}\n</div>`;
}

export function textLine(label, value) {
  const text = value === undefined || value === null || String(value).trim() === "" ? ABSENT : String(value).trim();
  return `<tr><td class="label">${escapeRecordText(label)}</td><td class="label text-value">${escapeRecordText(text)}</td></tr>`;
}

// The filed document in a frame of its own, so that its styles and the page's cannot touch.
function documentFrame(title, document) {
  return `<iframe class="filed-document" title="${escapeRecordAttribute(title)}" sandbox="allow-same-origin" srcdoc="${escapeRecordAttribute(document)}"></iframe>`;
}

function missingDocumentRecord(name) {
  return page(
    recordHeading({
      nameHtml: escapeRecordText(name),
      title: "Not kept",
      subtitleHtml: "This filing was made before the site kept a copy of the filed document.",
    }),
  );
}

function accountsReceiptRecord(receipt, dateText) {
  const heading = recordHeading({
    nameHtml: "Companies House receipt",
    referenceHtml: receipt.submissionNumber ? [`Submission number ${escapeRecordText(receipt.submissionNumber)}`] : [],
    title: "Receipt from Companies House",
    subtitleHtml: `Filed ${escapeRecordText(dateText)}`,
  });
  const lines = [
    textLine("Submission number", receipt.submissionNumber),
    textLine("Company number", receipt.companyNumber),
    textLine("Status", receipt.statusCode === "ACCEPT" ? "Accepted by Companies House" : receipt.statusCode),
    textLine("Filed on", dateText),
  ].join("\n");
  return page(`${heading}<table class="statement">\n<tbody>\n${lines}\n</tbody>\n</table>`);
}

/**
 * The customer copy of an accepted Companies House accounts filing.
 * @param {object} receipt - the stored receipt: statusCode, submissionNumber, companyNumber, filedDocument
 * @param {{receiptName: string, linksTo?: {correct: string, again: string}}} options
 * @returns {string}
 */
export function accountsFilingCopyHtml(receipt, { receiptName, linksTo = {} }) {
  const dateText = filingDateText(receiptName);
  const sections = [
    {
      heading: "The accounts as filed",
      explanation:
        "This is the document Companies House received, exactly as we sent it. It holds your balance sheet and the notes you filed. Companies House puts filed accounts on the public register, where anyone can read them.",
      recordHtml: receipt.filedDocument
        ? documentFrame("The accounts as they were filed", receipt.filedDocument)
        : missingDocumentRecord("The accounts as filed"),
    },
    {
      heading: "Receipt from Companies House",
      explanation:
        "Companies House gave this filing a submission number. Quote it if you write to Companies House about these accounts. Accepted means the accounts are on the register.",
      recordHtml: accountsReceiptRecord(receipt, dateText),
    },
  ];
  return customerCopyHtml({
    title: "Your copy of the accounts filed at Companies House",
    reference: { label: "Submission number", value: String(receipt.submissionNumber ?? ABSENT) },
    status: { kind: "accepted", text: "Accepted by Companies House" },
    date: dateText,
    sections,
    links: [
      { href: linksTo.correct ?? "fileMicroEntityAccounts.html", text: "File accounts again with corrected figures" },
      { href: linksTo.again ?? "companySearch.html", text: "Look up another company" },
      { href: "../hmrc/receipt/receipts.html", text: "All your receipts" },
    ],
  });
}

function boxValueCell(box, value) {
  if (TEXT_BOXES.has(box)) {
    let text = value;
    if (box === 340 || box === 390) text = `${value}%`;
    if (box === 329) text = "Yes";
    return `<td class="label text-value">${escapeRecordText(text ?? ABSENT)}</td>`;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `<td class="label text-value">${ABSENT}</td>`;
  const { html } = recordAmount(amount, { decimals: Number.isInteger(amount) ? 0 : 2 });
  return `<td class="figure positive">£${html}</td>`;
}

function ct600Record(receipt, dateText) {
  const heading = recordHeading({
    nameHtml: escapeRecordText(receipt.filed?.boxes?.[1] ?? "Company Tax Return"),
    referenceHtml: [
      receipt.utr ? `Unique Taxpayer Reference ${escapeRecordText(receipt.utr)}` : "",
      receipt.filed?.boxes?.[2] ? `Company number ${escapeRecordText(receipt.filed.boxes[2])}` : "",
    ].filter(Boolean),
    title: "Company Tax Return (CT600)",
    subtitleHtml: `Filed ${escapeRecordText(dateText)}`,
  });
  const boxes = receipt.filed?.boxes ?? {};
  const rows = Object.keys(boxes)
    .map(Number)
    .sort((a, b) => a - b)
    .map((box) => {
      const label = CT600_BOX_ROWS.find((row) => row.box === box)?.label ?? "Box";
      const boxLabel = escapeRecordText("Box " + box + ": " + label);
      return `<tr id="ct600Box${box}"><td class="label">${boxLabel}</td>${boxValueCell(box, boxes[box])}</tr>`;
    })
    .join("\n");
  return page(`${heading}<table class="statement">\n<tbody>\n${rows}\n</tbody>\n</table>`);
}

export function ctReceiptRecord(receipt, dateText) {
  const heading = recordHeading({
    nameHtml: "HMRC receipt for a Company Tax Return",
    referenceHtml: receipt.correlationId ? [`Correlation ID ${escapeRecordText(receipt.correlationId)}`] : [],
    title: "Receipt from HMRC",
    subtitleHtml: `Filed ${escapeRecordText(dateText)}`,
  });
  const lines = [
    textLine("IRmark receipt", receipt.irmarkReceipt),
    textLine("IRmark we sent", receipt.irmark),
    textLine("Correlation ID", receipt.correlationId),
    textLine("Unique Taxpayer Reference", receipt.utr),
    textLine("HMRC's message", receipt.successMessage),
    textLine("Filed on", dateText),
  ].join("\n");
  return page(`${heading}<table class="statement">\n<tbody>\n${lines}\n</tbody>\n</table>`);
}

/**
 * The customer copy of an accepted Company Tax Return.
 * @param {object} receipt - the stored receipt: correlationId, irmark, irmarkReceipt, utr, filed
 * @param {{receiptName: string, linksTo?: {correct: string}}} options
 * @returns {string}
 */
export function ctFilingCopyHtml(receipt, { receiptName, linksTo = {} }) {
  const dateText = filingDateText(receiptName);
  const filed = receipt.filed;
  const sections = [
    {
      heading: "The return as filed",
      explanation:
        "These are the boxes of the CT600 that HMRC received. Each box has the number it has on the HMRC form. Check the figures against your records.",
      recordHtml: filed?.boxes ? ct600Record(receipt, dateText) : missingDocumentRecord("The return as filed"),
    },
    {
      heading: "The tax computations as filed",
      explanation: "This is the document that works out your taxable profit. HMRC reads it with the return.",
      recordHtml: filed?.computationsIxbrl
        ? documentFrame("The tax computations as they were filed", filed.computationsIxbrl)
        : missingDocumentRecord("The tax computations as filed"),
    },
    {
      heading: "The accounts filed with the return",
      explanation: "HMRC takes the company's accounts with the return. They are the same figures you filed at Companies House.",
      recordHtml: filed?.accountsIxbrl
        ? documentFrame("The accounts as they were filed with the return", filed.accountsIxbrl)
        : missingDocumentRecord("The accounts filed with the return"),
    },
    {
      heading: "Receipt from HMRC",
      explanation:
        "The IRmark receipt is HMRC's proof that it received the return unchanged. The correlation ID is the reference to quote if you ask HMRC about this filing.",
      recordHtml: ctReceiptRecord(receipt, dateText),
    },
  ];
  return customerCopyHtml({
    title: "Your copy of the Company Tax Return",
    reference: { label: "IRmark receipt", value: String(receipt.irmarkReceipt ?? receipt.irmark ?? ABSENT) },
    status: { kind: "accepted", text: "Accepted by HMRC" },
    date: dateText,
    sections,
    links: [
      { href: linksTo.correct ?? "fileCompanyTaxReturn.html", text: "View the CT600 page to file another return" },
      { href: "../hmrc/receipt/receipts.html", text: "All your receipts" },
    ],
  });
}

/** The customer copy for any stored filing receipt, or null when the receipt is not a filing. */
export function filingCopyHtml(receipt, options) {
  if (receipt?.kind === ACCOUNTS_KIND) return accountsFilingCopyHtml(receipt, options);
  if (receipt?.kind === CT_RETURN_KIND) return ctFilingCopyHtml(receipt, options);
  return null;
}
