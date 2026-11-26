// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/filing-result-record.js
// What a confirmation statement and a Company Tax Return show on the page that filed them: the
// filed content as a record in the house style of submission-record.css, framed as a customer
// copy. The module holds no page state: a page passes in what it sent and what the authority
// answered, and gets markup back.

import { customerCopyHtml, escapeRecordText, recordAmount, recordHeading, recordTable } from "./submission-record.js";
import { ABSENT, ctCopyTitle, ctReceiptRecord, ctRecordTitle, longDateText, page, textLine } from "./filing-record.js";
import { boxRow } from "./ct600-fields.js";

// page-chrome.js gives the text in the chosen language; without it the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

// A function, so the link text is read in the chrome's language when a copy is drawn.
const receiptsLink = () => ({ href: "../hmrc/receipt/receipts.html", text: siteText("ch.record.all-receipts", "All your receipts") });
const TAX_BOXES = [440, 475, 528];

function longDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (!isoDate || Number.isNaN(date.getTime())) return ABSENT;
  return longDateText(date, { utc: true });
}

/** Today as the customer reads a date, e.g. "24 October 2026". */
export function todayText() {
  return longDateText(new Date());
}

function textTable(lines) {
  return `<table class="statement">\n<tbody>\n${lines.map(([label, value]) => textLine(label, value)).join("\n")}\n</tbody>\n</table>`;
}

function statementStatus(statusCode) {
  if (statusCode === "ACCEPT") return { kind: "accepted", text: siteText("ch.record.accepted", "Accepted by Companies House") };
  if (statusCode === "REJECT") return { kind: "rejected", text: siteText("ch.record.rejected", "Rejected by Companies House") };
  return { kind: "pending", text: siteText("ch.record.pending", "With Companies House") };
}

function changedOrConfirmed(changed) {
  return changed ? siteText("ch.cs.changed", "Changed from the register") : siteText("ch.record.confirmed", "Confirmed as on the register");
}

/**
 * The customer copy of a confirmation statement as filed.
 * @param {object} filed
 * @param {{companyName: string, companyNumber: string}} filed.company
 * @param {object} filed.payload - the statement the page sent
 * @param {boolean} filed.shareholdingsChanged - whether the shareholdings sent differ from the register's
 * @param {{name: string, role: string, verification: string}[]} filed.officers - as confirmed
 * @param {{name: string, control: string, notifiedOn: string}[]} filed.pscs - as confirmed
 * @param {{submissionNumber: string, statusCode: string}} filed.outcome
 * @param {string} filed.dateText
 * @returns {string}
 */
export function confirmationStatementCopyHtml({ company, payload, shareholdingsChanged, officers, pscs, outcome, dateText }) {
  const heading = recordHeading({
    nameHtml: escapeRecordText(company.companyName),
    referenceHtml: [
      escapeRecordText(
        siteText("ch.record.company-number-line", "Company registration number {number}", { number: company.companyNumber }),
      ),
    ],
    title: siteText("ch.record.cs-title", "Confirmation statement"),
    subtitleHtml: escapeRecordText(siteText("ch.record.made-up-to-line", "Made up to {date}", { date: longDate(payload.reviewDate) })),
  });
  const accepted = siteText("ch.cs.accepted", "Accepted");
  const answers = [
    [siteText("ch.cs.summary-lawful", "Lawful purpose statement"), payload.lawfulPurposeStatementAccepted ? accepted : ABSENT],
    [siteText("ch.cs.summary-confirmation", "Statement of confirmation"), payload.stateConfirmationAccepted ? accepted : ABSENT],
    [
      siteText("ch.cs.summary-sic", "Nature of business (SIC codes)"),
      payload.sicCodes ? payload.sicCodes.join(", ") : changedOrConfirmed(false),
    ],
    [siteText("ch.cs.summary-email", "Registered email address"), payload.registeredEmailAddress ?? changedOrConfirmed(false)],
    [siteText("ch.cs.summary-capital", "Statement of capital"), changedOrConfirmed(Boolean(payload.statementOfCapital))],
    [siteText("ch.cs.summary-shareholders", "Shareholders"), changedOrConfirmed(shareholdingsChanged)],
  ];
  const directors = payload.directors.map((director) =>
    [director.forename, director.otherForenames, director.surname].filter(Boolean).join(" ").toUpperCase(),
  );
  const confirmation = page(
    `${heading}${textTable([
      [siteText("ch.search.column-company", "Company"), company.companyName],
      [siteText("ch.record.company-number", "Company registration number"), company.companyNumber],
      [siteText("ch.record.made-up-to", "Made up to"), longDate(payload.reviewDate)],
      ...answers,
      [siteText("ch.cs.summary-directors", "Directors verifying their identity"), directors.join(", ")],
    ])}`,
  );
  const people = (title, rows, columns) =>
    page(
      recordHeading({
        nameHtml: escapeRecordText(company.companyName),
        title,
        subtitleHtml: escapeRecordText(
          siteText("ch.record.as-confirmed-on", "As confirmed on {date}", { date: longDate(payload.reviewDate) }),
        ),
      }) +
        (rows.length
          ? textTable(rows.map((row) => columns(row)))
          : textTable([[siteText("ch.record.none-on-register", "None on the register"), ABSENT]])),
    );
  const submission = receiptPage(outcome.submissionNumber, company.companyNumber, statementStatus(outcome.statusCode).text, dateText);
  return customerCopyHtml({
    title: siteText("ch.record.cs-copy-title", "Your copy of the confirmation statement for {company}", { company: company.companyName }),
    reference: { label: siteText("ch.record.submission-number", "Submission number"), value: String(outcome.submissionNumber ?? ABSENT) },
    status: statementStatus(outcome.statusCode),
    date: dateText,
    sections: [
      {
        heading: siteText("ch.record.cs-as-filed", "The statement as filed"),
        explanation: siteText(
          "ch.record.cs-explanation",
          "This is what you confirmed to Companies House: the company, the date the statement is made up to, and your answers. Anything marked as confirmed is unchanged on the register.",
        ),
        recordHtml: confirmation,
      },
      {
        heading: siteText("ch.record.officers-as-confirmed", "Officers as confirmed"),
        explanation: siteText(
          "ch.record.officers-explanation",
          "These are the company's current officers on the register when you filed, and whether each has verified their identity.",
        ),
        recordHtml: people(siteText("ch.record.officers", "Officers"), officers, (row) => [row.name, `${row.role}. ${row.verification}`]),
      },
      {
        heading: siteText("ch.record.pscs-as-confirmed", "People with significant control as confirmed"),
        explanation: siteText(
          "ch.record.pscs-explanation",
          "These are the people with significant control on the register when you filed, with how they control the company.",
        ),
        recordHtml: people(siteText("ch.record.pscs", "People with significant control"), pscs, (row) => [
          row.name,
          siteText("ch.record.psc-row", "{control}. Notified {date}", { control: row.control, date: row.notifiedOn }),
        ]),
      },
      {
        heading: siteText("ch.record.receipt-title", "Receipt from Companies House"),
        explanation: siteText(
          "ch.record.cs-receipt-explanation",
          "Companies House gave this filing a submission number. Quote it if you write to Companies House about this statement.",
        ),
        recordHtml: submission,
      },
    ],
    links: [{ href: "companySearch.html", text: siteText("ch.record.look-up-another", "Look up another company") }, receiptsLink()],
  });
}

function figureCell(value, options) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return { html: ABSENT, bracketed: true };
  return recordAmount(amount, { decimals: Number.isInteger(amount) ? 0 : 2, ...options });
}

export const IRMARK_MISMATCH_WARNING = siteText(
  "ch.ct.record-irmark-mismatch",
  "HMRC accepted the return, but the IRmark on HMRC's receipt is different from the one we calculated. Keep the receipt. Contact support if you need the difference explained.",
);

/**
 * The customer copy of an accepted Company Tax Return as filed.
 * @param {object} filed
 * @param {{companyName: string, companyNumber: string}} filed.company
 * @param {string} filed.utr
 * @param {object} filed.boxes - the reviewed CT600 boxes
 * @param {{label: string, value: number, deduction?: boolean, style?: string}[]} filed.computation - the tax computation lines
 * @param {object} filed.outcome - HMRC's accepted answer: correlationId, irmark, irmarkReceipt, receiptId, gatewayTest
 * @param {string} filed.dateText
 * @param {{part: number, parts: number}} [filed.longPeriod] - set when the return is one of the two of a period of account over 12 months
 * @returns {string}
 */
export function ctResultCopyHtml({ company, utr, boxes, computation, outcome, dateText, longPeriod }) {
  const live = outcome.gatewayTest === false;
  const ofParts = longPeriod ? siteText("ch.ct.record-of-parts", " {part} of {parts}", longPeriod) : "";
  const periodEnd = String(boxes[35] ?? "");
  const heading = recordHeading({
    nameHtml: escapeRecordText(company.companyName),
    referenceHtml: [
      escapeRecordText(siteText("ch.ct.record-utr-line", "Tax reference {utr}", { utr })),
      escapeRecordText(
        siteText("ch.record.company-number-line", "Company registration number {number}", { number: company.companyNumber }),
      ),
    ],
    title: ctRecordTitle(live, ofParts),
    subtitleHtml: escapeRecordText(
      siteText("ch.ct.record-period", "Period of the return {start} to {end}", { start: longDate(boxes[30]), end: longDate(periodEnd) }),
    ),
  });
  const taxRows = TAX_BOXES.filter((box) => boxes[box] !== undefined).map((box) => ({
    label: siteText("ch.ct.record-box-line", "{label} (box {box})", { box, label: boxRow(box).label }),
    cells: [figureCell(boxes[box])],
    style: box === TAX_BOXES.findLast((candidate) => boxes[candidate] !== undefined) ? "total" : undefined,
  }));
  const table = recordTable({
    columns: [periodEnd.slice(0, 4) || siteText("ch.ct.record-period-column", "Period")],
    rows: [
      { label: siteText("ch.ct.record-computation", "Tax computation"), style: "heading" },
      ...computation.map((line) => ({
        label: line.label,
        cells: [figureCell(line.value, { deduction: line.deduction })],
        style: line.style,
      })),
      { label: siteText("ch.ct.tax-due", "Tax due"), style: "heading" },
      ...taxRows,
    ],
  });
  const receipt = { ...outcome, utr, successMessage: undefined };
  return customerCopyHtml({
    title: ctCopyTitle(live, ofParts),
    reference: {
      label: siteText("ch.ct.record-irmark-receipt", "IRmark receipt"),
      value: String(outcome.irmarkReceipt ?? outcome.irmark ?? ABSENT),
    },
    status: { kind: "accepted", text: siteText("ch.ct.record-accepted", "Accepted by HMRC") },
    date: dateText,
    sections: [
      {
        heading: siteText("ch.ct.record-as-filed", "The return as filed"),
        explanation: siteText(
          "ch.ct.record-result-explanation",
          "These are the figures HMRC received: the return period, the tax computation that works out the profit, and the tax due. Check them against your records.",
        ),
        recordHtml: page(heading + table),
      },
      {
        heading: siteText("ch.ct.record-receipt-title", "Receipt from HMRC"),
        explanation: siteText(
          "ch.ct.record-receipt-explanation",
          "This receipt is the company's proof that it filed the return. Keep it with the company's records. The IRmark receipt shows HMRC received the return unchanged. The correlation ID is the reference to quote if you ask HMRC about this filing.",
        ),
        warning: outcome.irmarkReceiptMismatch ? IRMARK_MISMATCH_WARNING : undefined,
        recordHtml: ctReceiptRecord(receipt, dateText),
      },
    ],
    links: [
      ...(outcome.receiptId
        ? [
            {
              href: `filings.html?receipt=${encodeURIComponent(outcome.receiptId + ".json")}`,
              text: siteText("ch.ct.record-see-full", "See the full filed copy"),
            },
          ]
        : []),
      receiptsLink(),
    ],
  });
}

// The receipt page of a Companies House filing: its submission number, company, status and date.
function receiptPage(submissionNumber, companyNumber, statusText, dateText) {
  return page(
    `${recordHeading({
      nameHtml: escapeRecordText(siteText("ch.record.receipt-name", "Companies House receipt")),
      referenceHtml: [
        escapeRecordText(siteText("ch.record.submission-number-line", "Submission number {number}", { number: submissionNumber })),
      ],
      title: siteText("ch.record.receipt-title", "Receipt from Companies House"),
      subtitleHtml: escapeRecordText(siteText("ch.record.filed-on-line", "Filed {date}", { date: dateText })),
    })}${textTable([
      [siteText("ch.record.submission-number", "Submission number"), submissionNumber],
      [siteText("ch.record.company-number", "Company registration number"), companyNumber],
      [siteText("ch.record.status", "Status"), statusText],
      [siteText("ch.record.filed-on", "Filed on"), dateText],
    ])}`,
  );
}

/** The record status of a Companies House transaction, from the status of each filing in it. */
export function transactionStatus(transaction) {
  const filings = transaction.filings || [];
  if (filings.some((entry) => entry.status === "rejected"))
    return { kind: "rejected", text: siteText("ch.record.rejected", "Rejected by Companies House") };
  if (filings.length > 0 && filings.every((entry) => entry.status === "accepted"))
    return { kind: "accepted", text: siteText("ch.record.accepted", "Accepted by Companies House") };
  return { kind: "pending", text: siteText("ch.record.pending", "With Companies House") };
}

/**
 * The customer copy of a change to a company's registered office address or registered email address.
 * @param {object} filed
 * @param {string} filed.title - e.g. "Change of registered office address"
 * @param {string} filed.companyNumber
 * @param {{transactionId: string, filings?: {status: string}[]}} filed.transaction
 * @param {[string, string][]} filed.details - label and value of each item as submitted
 * @param {string} filed.dateText
 * @returns {string}
 */
export function registeredChangeCopyHtml({ title, companyNumber, transaction, details, dateText }) {
  const status = transactionStatus(transaction);
  const changeRecord = page(
    `${recordHeading({
      nameHtml: escapeRecordText(
        siteText("ch.record.company-number-line", "Company registration number {number}", { number: companyNumber }),
      ),
      title,
      subtitleHtml: escapeRecordText(siteText("ch.record.submitted-line", "Submitted {date}", { date: dateText })),
    })}${textTable([[siteText("ch.record.company-number", "Company registration number"), companyNumber], ...details])}`,
  );
  const receiptRecord = receiptPage(transaction.transactionId, companyNumber, status.text, dateText);
  return customerCopyHtml({
    title: siteText("ch.record.change-copy-title", "Your copy of the {title}", { title: title.charAt(0).toLowerCase() + title.slice(1) }),
    reference: { label: siteText("ch.record.submission-number", "Submission number"), value: String(transaction.transactionId ?? ABSENT) },
    status,
    date: dateText,
    sections: [
      {
        heading: siteText("ch.record.change-as-submitted", "The change as submitted"),
        explanation: siteText("ch.record.change-explanation", "This is what you asked Companies House to record on the register."),
        recordHtml: changeRecord,
      },
      {
        heading: siteText("ch.record.receipt-title", "Receipt from Companies House"),
        explanation: siteText(
          "ch.record.change-receipt-explanation",
          "Companies House gave this filing a submission number. Quote it if you write to Companies House about this change.",
        ),
        recordHtml: receiptRecord,
      },
    ],
    links: [{ href: "companySearch.html", text: siteText("ch.record.look-up-another", "Look up another company") }, receiptsLink()],
  });
}
