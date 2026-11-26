// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/filing-record.js
// The customer copy of a Companies House accounts filing and of a Company Tax Return, in the
// house style of submission-record.css. The filed documents show as filed, each in a frame of its
// own. The receipt that the gateway or HMRC returned shows as a record. The module holds no page
// state: a page passes in the stored receipt and gets markup back.

import { customerCopyHtml, escapeRecordAttribute, escapeRecordText, recordAmount, recordHeading } from "./submission-record.js";
import { CT600_BOX_ROWS, TEXT_BOXES } from "./ct600-fields.js";
import { longDateText } from "./long-period.js";

export const ACCOUNTS_KIND = "companies-house-accounts";
export const CT_RETURN_KIND = "company-tax-return";

export const ABSENT = "—";

// page-chrome.js gives the text in the chosen language; without it (under Node, or a test that stubs
// the chrome) the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

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
  return longDateText(match[1].slice(0, 10));
}

export function page(html) {
  return `<div class="page">\n${html}\n</div>`;
}

export function textLine(label, value) {
  const text = value === undefined || value === null || String(value).trim() === "" ? ABSENT : String(value).trim();
  return `<tr><td class="label">${escapeRecordText(label)}</td><td class="label text-value">${escapeRecordText(text)}</td></tr>`;
}

function base64OfText(text) {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// The filed document in a frame of its own, so that its styles and the page's cannot touch, and a
// link that saves the exact bytes Submit built. HMRC's guidance says never to save iXBRL from a browser.
function documentFrame(title, document, fileName) {
  const frame = `<iframe class="filed-document" title="${escapeRecordAttribute(title)}" sandbox="allow-same-origin" srcdoc="${escapeRecordAttribute(document)}"></iframe>`;
  const href = `data:application/xhtml+xml;charset=utf-8;base64,${base64OfText(document)}`;
  const linkText = siteText("ch.record.download", "Download {title}", { title: title.charAt(0).toLowerCase() + title.slice(1) });
  const advice = siteText(
    "ch.record.download-advice",
    "Save this file with your records. Do not save the document from your browser's page, because a browser changes it.",
  );
  const download = `<p class="filed-document-download"><a download="${escapeRecordAttribute(fileName)}" href="${href}">${escapeRecordText(linkText)}</a>. ${escapeRecordText(advice)}</p>`;
  return frame + download;
}

function missingDocumentRecord(name) {
  return page(
    recordHeading({
      nameHtml: escapeRecordText(name),
      title: siteText("ch.record.not-kept", "Not kept"),
      subtitleHtml: escapeRecordText(
        siteText("ch.record.not-kept-why", "This filing was made before the site kept a copy of the filed document."),
      ),
    }),
  );
}

function accountsReceiptRecord(receipt, dateText) {
  const heading = recordHeading({
    nameHtml: escapeRecordText(siteText("ch.record.receipt-name", "Companies House receipt")),
    referenceHtml: receipt.submissionNumber
      ? [escapeRecordText(siteText("ch.record.submission-number-line", "Submission number {number}", { number: receipt.submissionNumber }))]
      : [],
    title: siteText("ch.record.receipt-title", "Receipt from Companies House"),
    subtitleHtml: escapeRecordText(siteText("ch.record.filed-on-line", "Filed {date}", { date: dateText })),
  });
  const lines = [
    textLine(siteText("ch.record.submission-number", "Submission number"), receipt.submissionNumber),
    textLine(siteText("ch.record.company-number", "Company number"), receipt.companyNumber),
    textLine(
      siteText("ch.record.status", "Status"),
      receipt.statusCode === "ACCEPT" ? siteText("ch.record.accepted", "Accepted by Companies House") : receipt.statusCode,
    ),
    textLine(siteText("ch.record.filed-on", "Filed on"), dateText),
  ].join("\n");
  return page(`${heading}<table class="statement">\n<tbody>\n${lines}\n</tbody>\n</table>`);
}

/**
 * The customer copy of an accepted Companies House accounts filing.
 * @param {object} receipt - the stored receipt: statusCode, submissionNumber, companyNumber, filedDocument, amended
 * @param {{receiptName: string, linksTo?: {correct: string, again: string}}} options - linksTo.correct is the form that amends these accounts
 * @returns {string}
 */
export function accountsFilingCopyHtml(receipt, { receiptName, linksTo = {} }) {
  const dateText = filingDateText(receiptName);
  const sections = [
    {
      heading: siteText("ch.record.accounts-as-filed", "The accounts as filed"),
      explanation: siteText(
        "ch.record.accounts-explanation",
        "This is the document Companies House received, exactly as we sent it. It holds your balance sheet and the notes you filed. Companies House puts filed accounts on the public register, where anyone can read them.",
      ),
      recordHtml: receipt.filedDocument
        ? documentFrame(
            siteText("ch.record.accounts-frame", "The accounts as they were filed"),
            receipt.filedDocument,
            `accounts-${receipt.submissionNumber ?? "filed"}.xhtml`,
          )
        : missingDocumentRecord(siteText("ch.record.accounts-as-filed", "The accounts as filed")),
    },
    {
      heading: siteText("ch.record.receipt-title", "Receipt from Companies House"),
      explanation: siteText(
        "ch.record.accounts-receipt-explanation",
        "Companies House gave this filing a submission number. Quote it if you write to Companies House about these accounts. Accepted means the accounts are on the register.",
      ),
      recordHtml: accountsReceiptRecord(receipt, dateText),
    },
  ];
  return customerCopyHtml({
    title: receipt.amended
      ? siteText("ch.record.revised-accounts-copy-title", "Your copy of the revised accounts filed at Companies House")
      : siteText("ch.record.accounts-copy-title", "Your copy of the accounts filed at Companies House"),
    reference: { label: siteText("ch.record.submission-number", "Submission number"), value: String(receipt.submissionNumber ?? ABSENT) },
    status: { kind: "accepted", text: siteText("ch.record.accepted", "Accepted by Companies House") },
    date: dateText,
    sections,
    links: [
      linksTo.correct
        ? { href: linksTo.correct, text: siteText("ch.record.amend-accounts", "Amend these accounts") }
        : { href: "fileMicroEntityAccounts.html", text: siteText("ch.record.file-again", "File accounts again with corrected figures") },
      ...(receipt.revisesReceipt
        ? [
            {
              href: `filings.html?receipt=${encodeURIComponent(receipt.revisesReceipt)}`,
              text: siteText("ch.record.original-accounts", "See the original accounts these revise"),
            },
          ]
        : []),
      { href: linksTo.again ?? "companySearch.html", text: siteText("ch.record.look-up-another", "Look up another company") },
      { href: "../hmrc/receipt/receipts.html", text: siteText("ch.record.all-receipts", "All your receipts") },
    ],
  });
}

/**
 * A CT600 box's value as the review and the filed copy show it: a rate with its %, box 329 as Yes,
 * the period's dates in words, other coded boxes as filed; null for an amount.
 */
export function ct600BoxText(box, value) {
  const key = /^\d+$/.test(String(box)) ? Number(box) : box;
  if (!TEXT_BOXES.has(key)) return null;
  if (value === undefined || value === null || value === "") return ABSENT;
  if (key === 340 || key === 390) return `${value}%`;
  if (key === 329) return siteText("ch.ct.yes", "Yes");
  if (key === 4 && String(value) === "0") return siteText("ch.ct.box-4-none", "Not one of the listed types");
  if ((key === 30 || key === 35) && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return longDateText(String(value));
  return String(value);
}

function boxValueCell(box, value) {
  const text = ct600BoxText(box, value);
  if (text !== null) return `<td class="label text-value">${escapeRecordText(text)}</td>`;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `<td class="label text-value">${ABSENT}</td>`;
  const { html } = recordAmount(amount, { decimals: Number.isInteger(amount) ? 0 : 2 });
  return `<td class="figure positive">£${html}</td>`;
}

/**
 * The filed copy's title and its record's title. A return the receipt marks as filed with HMRC's
 * test service says so; a live return, or one filed before receipts recorded the service, does not.
 */
export function ctRecordTitle(testService, parts) {
  return testService
    ? siteText("ch.ct.record-title-test", "Company Tax Return (CT600, HMRC test service){parts}", { parts })
    : siteText("ch.ct.record-title-live", "Company Tax Return (CT600){parts}", { parts });
}

export function ctCopyTitle(testService, parts) {
  return testService
    ? siteText("ch.ct.record-copy-title-test", "Your copy of the Company Tax Return (HMRC test service){parts}", { parts })
    : siteText("ch.ct.record-copy-title-live", "Your copy of the Company Tax Return{parts}", { parts });
}

// " 1 of 2" for one of the two returns of a period of account over 12 months.
function longPeriodTitleSuffix(receipt) {
  return receipt.longPeriod ? siteText("ch.ct.record-of-parts", " {part} of {parts}", receipt.longPeriod) : "";
}

/**
 * The CT600 boxes as the filed copy shows them: the company, its tax reference and registration
 * number, a title and subtitle, then a row per box with its number, HMRC's term and its value.
 * The review before sending renders the same record, with a Change cell on each row.
 * @param {object} record
 * @param {object} record.boxes - the CT600 boxes
 * @param {string} [record.utr]
 * @param {string} [record.companyName] - box 1 when the boxes hold it
 * @param {string} [record.companyNumber] - box 2 when the boxes hold it
 * @param {string} record.title
 * @param {string} record.subtitle
 * @param {(box: number|string) => string} [record.rowId] - the id of a box's row
 * @param {(box: number|string, label: string) => string} [record.changeCellHtml] - a Change cell for a box's row
 * @param {string} [record.tableId]
 */
export function ct600RecordHtml({
  boxes = {},
  utr,
  companyName = boxes[1],
  companyNumber = boxes[2],
  title,
  subtitle,
  rowId = (box) => `ct600Box${box}`,
  changeCellHtml,
  tableId,
}) {
  const heading = recordHeading({
    nameHtml: escapeRecordText(companyName ?? siteText("ch.ct.record-name", "Company Tax Return")),
    referenceHtml: [
      utr ? escapeRecordText(siteText("ch.ct.record-utr-line", "Tax reference {utr}", { utr })) : "",
      companyNumber
        ? escapeRecordText(siteText("ch.ct.record-company-number-line", "Company registration number {number}", { number: companyNumber }))
        : "",
    ].filter(Boolean),
    title,
    subtitleHtml: escapeRecordText(subtitle),
  });
  const rows = Object.keys(boxes)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b))
    .map((key) => {
      const box = /^\d+$/.test(key) ? Number(key) : key;
      const term = CT600_BOX_ROWS.find((row) => row.box === box)?.label ?? ABSENT;
      const reference = escapeRecordText(siteText("ch.ct600.review-box", "Box {box}", { box }));
      const change = changeCellHtml ? changeCellHtml(box, term) : "";
      return `<tr id="${escapeRecordAttribute(rowId(box))}"><td class="label box-reference">${reference}</td><td class="label">${escapeRecordText(term)}</td>${boxValueCell(box, boxes[box])}${change}</tr>`;
    })
    .join("\n");
  const id = tableId ? ` id="${escapeRecordAttribute(tableId)}"` : "";
  return page(`${heading}<table class="statement"${id}>\n<tbody>\n${rows}\n</tbody>\n</table>`);
}

function ct600Record(receipt, dateText) {
  return ct600RecordHtml({
    boxes: receipt.filed?.boxes ?? {},
    utr: receipt.utr,
    title: ctRecordTitle(receipt.gatewayTest === true, longPeriodTitleSuffix(receipt)),
    subtitle: siteText("ch.record.filed-on-line", "Filed {date}", { date: dateText }),
  });
}

export function ctReceiptRecord(receipt, dateText) {
  const heading = recordHeading({
    nameHtml: escapeRecordText(siteText("ch.ct.record-receipt-name", "HMRC receipt for a Company Tax Return")),
    referenceHtml: receipt.correlationId
      ? [escapeRecordText(siteText("ch.ct.record-correlation-line", "Correlation ID {id}", { id: receipt.correlationId }))]
      : [],
    title: siteText("ch.ct.record-receipt-title", "Receipt from HMRC"),
    subtitleHtml: escapeRecordText(siteText("ch.record.filed-on-line", "Filed {date}", { date: dateText })),
  });
  const lines = [
    textLine(siteText("ch.ct.record-irmark-receipt", "IRmark receipt"), receipt.irmarkReceipt),
    textLine(siteText("ch.ct.record-irmark-sent", "IRmark we sent"), receipt.irmark),
    textLine(siteText("ch.ct.record-correlation", "Correlation ID"), receipt.correlationId),
    textLine(siteText("ch.ct.record-utr", "Tax reference"), receipt.utr),
    textLine(siteText("ch.ct.record-hmrc-message", "HMRC's message"), receipt.successMessage),
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
      heading: siteText("ch.ct.record-as-filed", "The return as filed"),
      explanation: siteText(
        "ch.ct.record-boxes-explanation",
        "These are the boxes of the CT600 that HMRC received. Each box has the number it has on the HMRC form. Check the figures against your records.",
      ),
      recordHtml: filed?.boxes
        ? ct600Record(receipt, dateText)
        : missingDocumentRecord(siteText("ch.ct.record-as-filed", "The return as filed")),
    },
    {
      heading: siteText("ch.ct.record-computations-as-filed", "The tax computations as filed"),
      explanation: siteText(
        "ch.ct.record-computations-explanation",
        "This is the document that works out your taxable profit. HMRC reads it with the return.",
      ),
      recordHtml: filed?.computationsIxbrl
        ? documentFrame(
            siteText("ch.ct.record-computations-frame", "The tax computations as they were filed"),
            filed.computationsIxbrl,
            `computations-${receipt.correlationId ?? "filed"}.xhtml`,
          )
        : missingDocumentRecord(siteText("ch.ct.record-computations-as-filed", "The tax computations as filed")),
    },
    {
      heading: siteText("ch.ct.record-accounts-with-return", "The accounts filed with the return"),
      explanation: siteText(
        "ch.ct.record-accounts-explanation",
        "HMRC takes the company's accounts with the return. They are the same figures you filed at Companies House.",
      ),
      recordHtml: filed?.accountsIxbrl
        ? documentFrame(
            siteText("ch.ct.record-accounts-frame", "The accounts as they were filed with the return"),
            filed.accountsIxbrl,
            `accounts-${receipt.correlationId ?? "filed"}.xhtml`,
          )
        : missingDocumentRecord(siteText("ch.ct.record-accounts-with-return", "The accounts filed with the return")),
    },
    {
      heading: siteText("ch.ct.record-receipt-title", "Receipt from HMRC"),
      explanation: siteText(
        "ch.ct.record-receipt-explanation",
        "This receipt is the company's proof that it filed the return. Keep it with the company's records. The IRmark receipt shows HMRC received the return unchanged. The correlation ID is the reference to quote if you ask HMRC about this filing.",
      ),
      recordHtml: ctReceiptRecord(receipt, dateText),
    },
  ];
  return customerCopyHtml({
    title: ctCopyTitle(receipt.gatewayTest === true, longPeriodTitleSuffix(receipt)),
    reference: {
      label: siteText("ch.ct.record-irmark-receipt", "IRmark receipt"),
      value: String(receipt.irmarkReceipt ?? receipt.irmark ?? ABSENT),
    },
    status: { kind: "accepted", text: siteText("ch.ct.record-accepted", "Accepted by HMRC") },
    date: dateText,
    sections,
    links: [
      {
        href: linksTo.correct ?? "fileCompanyTaxReturn.html",
        text: siteText("ch.ct.record-file-another", "View the CT600 page to file another return"),
      },
      { href: "../hmrc/receipt/receipts.html", text: siteText("ch.record.all-receipts", "All your receipts") },
    ],
  });
}

/** The customer copy for any stored filing receipt, or null when the receipt is not a filing. */
export function filingCopyHtml(receipt, options) {
  if (receipt?.kind === ACCOUNTS_KIND) return accountsFilingCopyHtml(receipt, options);
  if (receipt?.kind === CT_RETURN_KIND) return ctFilingCopyHtml(receipt, options);
  return null;
}
