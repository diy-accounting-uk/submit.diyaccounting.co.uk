// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/filing-result-record.js
// What a confirmation statement and a Company Tax Return show on the page that filed them: the
// filed content as a record in the house style of submission-record.css, framed as a customer
// copy. The module holds no page state: a page passes in what it sent and what the authority
// answered, and gets markup back.

import { customerCopyHtml, escapeRecordText, recordAmount, recordHeading, recordTable } from "./submission-record.js";
import { ABSENT, ctReceiptRecord, page, textLine } from "./filing-record.js";
import { boxRow } from "./ct600-fields.js";

const RECEIPTS_LINK = { href: "../hmrc/receipt/receipts.html", text: "All your receipts" };
const TAX_BOXES = [440, 475, 528];

function longDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (!isoDate || Number.isNaN(date.getTime())) return ABSENT;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Today as the customer reads a date, e.g. "24 October 2026". */
export function todayText() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function textTable(lines) {
  return `<table class="statement">\n<tbody>\n${lines.map(([label, value]) => textLine(label, value)).join("\n")}\n</tbody>\n</table>`;
}

function statementStatus(statusCode) {
  if (statusCode === "ACCEPT") return { kind: "accepted", text: "Accepted by Companies House" };
  if (statusCode === "REJECT") return { kind: "rejected", text: "Rejected by Companies House" };
  return { kind: "pending", text: "With Companies House" };
}

function changedOrConfirmed(changed) {
  return changed ? "Changed from the register" : "Confirmed as on the register";
}

/**
 * The customer copy of a confirmation statement as filed.
 * @param {object} filed
 * @param {{companyName: string, companyNumber: string}} filed.company
 * @param {object} filed.payload - the statement the page sent
 * @param {{name: string, role: string, verification: string}[]} filed.officers - as confirmed
 * @param {{name: string, control: string, notifiedOn: string}[]} filed.pscs - as confirmed
 * @param {{submissionNumber: string, statusCode: string}} filed.outcome
 * @param {string} filed.dateText
 * @returns {string}
 */
export function confirmationStatementCopyHtml({ company, payload, officers, pscs, outcome, dateText }) {
  const heading = recordHeading({
    nameHtml: escapeRecordText(company.companyName),
    referenceHtml: [`Company number ${escapeRecordText(company.companyNumber)}`],
    title: "Confirmation statement",
    subtitleHtml: `Made up to ${escapeRecordText(longDate(payload.reviewDate))}`,
  });
  const answers = [
    ["Lawful purpose statement", payload.lawfulPurposeStatementAccepted ? "Accepted" : ABSENT],
    ["Statement of confirmation", payload.stateConfirmationAccepted ? "Accepted" : ABSENT],
    ["Nature of business (SIC codes)", payload.sicCodes ? payload.sicCodes.join(", ") : changedOrConfirmed(false)],
    ["Registered email address", payload.registeredEmailAddress ?? changedOrConfirmed(false)],
    ["Statement of capital", changedOrConfirmed(Boolean(payload.statementOfCapital))],
    ["Shareholders", changedOrConfirmed(Boolean(payload.shareholdings))],
  ];
  const directors = payload.directors.map((director) =>
    [director.forename, director.otherForenames, director.surname].filter(Boolean).join(" "),
  );
  const confirmation = page(
    `${heading}${textTable([
      ["Company", company.companyName],
      ["Company number", company.companyNumber],
      ["Made up to", longDate(payload.reviewDate)],
      ...answers,
      ["Directors verifying their identity", directors.join(", ")],
    ])}`,
  );
  const people = (title, rows, columns) =>
    page(
      recordHeading({
        nameHtml: escapeRecordText(company.companyName),
        title,
        subtitleHtml: `As confirmed on ${escapeRecordText(longDate(payload.reviewDate))}`,
      }) + (rows.length ? textTable(rows.map((row) => columns(row))) : textTable([["None on the register", ABSENT]])),
    );
  const submission = page(
    `${recordHeading({
      nameHtml: "Companies House receipt",
      referenceHtml: [`Submission number ${escapeRecordText(outcome.submissionNumber)}`],
      title: "Receipt from Companies House",
      subtitleHtml: `Filed ${escapeRecordText(dateText)}`,
    })}${textTable([
      ["Submission number", outcome.submissionNumber],
      ["Company number", company.companyNumber],
      ["Status", statementStatus(outcome.statusCode).text],
      ["Filed on", dateText],
    ])}`,
  );
  return customerCopyHtml({
    title: `Your copy of the confirmation statement for ${company.companyName}`,
    reference: { label: "Submission number", value: String(outcome.submissionNumber ?? ABSENT) },
    status: statementStatus(outcome.statusCode),
    date: dateText,
    sections: [
      {
        heading: "The statement as filed",
        explanation:
          "This is what you confirmed to Companies House: the company, the date the statement is made up to, and your answers. Anything marked as confirmed is unchanged on the register.",
        recordHtml: confirmation,
      },
      {
        heading: "Officers as confirmed",
        explanation:
          "These are the company's current officers on the register when you filed, and whether each has verified their identity.",
        recordHtml: people("Officers", officers, (row) => [row.name, `${row.role}. ${row.verification}`]),
      },
      {
        heading: "People with significant control as confirmed",
        explanation: "These are the people with significant control on the register when you filed, with how they control the company.",
        recordHtml: people("People with significant control", pscs, (row) => [row.name, `${row.control}. Notified ${row.notifiedOn}`]),
      },
      {
        heading: "Receipt from Companies House",
        explanation: "Companies House gave this filing a submission number. Quote it if you write to Companies House about this statement.",
        recordHtml: submission,
      },
    ],
    links: [{ href: "companySearch.html", text: "Look up another company" }, RECEIPTS_LINK],
  });
}

function figureCell(value, options) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return { html: ABSENT, bracketed: true };
  return recordAmount(amount, { decimals: Number.isInteger(amount) ? 0 : 2, ...options });
}

/**
 * The customer copy of an accepted Company Tax Return as filed.
 * @param {object} filed
 * @param {{companyName: string, companyNumber: string}} filed.company
 * @param {string} filed.utr
 * @param {object} filed.boxes - the reviewed CT600 boxes
 * @param {{label: string, value: number, deduction?: boolean, style?: string}[]} filed.computation - the tax computation lines
 * @param {object} filed.outcome - HMRC's accepted answer: correlationId, irmark, irmarkReceipt, receiptId
 * @param {string} filed.dateText
 * @returns {string}
 */
export function ctResultCopyHtml({ company, utr, boxes, computation, outcome, dateText }) {
  const periodEnd = String(boxes[35] ?? "");
  const heading = recordHeading({
    nameHtml: escapeRecordText(company.companyName),
    referenceHtml: [`Unique Taxpayer Reference ${escapeRecordText(utr)}`, `Company number ${escapeRecordText(company.companyNumber)}`],
    title: "Company Tax Return (CT600)",
    subtitleHtml: `Return period ${escapeRecordText(longDate(boxes[30]))} to ${escapeRecordText(longDate(periodEnd))}`,
  });
  const taxRows = TAX_BOXES.filter((box) => boxes[box] !== undefined).map((box) => ({
    label: `Box ${box}: ${boxRow(box).label}`,
    cells: [figureCell(boxes[box])],
    style: box === TAX_BOXES.findLast((candidate) => boxes[candidate] !== undefined) ? "total" : undefined,
  }));
  const table = recordTable({
    columns: [periodEnd.slice(0, 4) || "Period"],
    rows: [
      { label: "Tax computation", style: "heading" },
      ...computation.map((line) => ({
        label: line.label,
        cells: [figureCell(line.value, { deduction: line.deduction })],
        style: line.style,
      })),
      { label: "Tax due", style: "heading" },
      ...taxRows,
    ],
  });
  const receipt = { ...outcome, utr, successMessage: undefined };
  return customerCopyHtml({
    title: "Your copy of the Company Tax Return",
    reference: { label: "IRmark receipt", value: String(outcome.irmarkReceipt ?? outcome.irmark ?? ABSENT) },
    status: { kind: "accepted", text: "Accepted by HMRC" },
    date: dateText,
    sections: [
      {
        heading: "The return as filed",
        explanation:
          "These are the figures HMRC received: the return period, the tax computation that works out the profit, and the tax due. Check them against your records.",
        recordHtml: page(heading + table),
      },
      {
        heading: "Receipt from HMRC",
        explanation:
          "The IRmark receipt is HMRC's proof that it received the return unchanged. The correlation ID is the reference to quote if you ask HMRC about this filing.",
        recordHtml: ctReceiptRecord(receipt, dateText),
      },
    ],
    links: [
      ...(outcome.receiptId
        ? [{ href: `filings.html?receipt=${encodeURIComponent(outcome.receiptId + ".json")}`, text: "See the full filed copy" }]
        : []),
      RECEIPTS_LINK,
    ],
  });
}

/** The record status of a Companies House transaction, from the status of each filing in it. */
export function transactionStatus(transaction) {
  const filings = transaction.filings || [];
  if (filings.some((entry) => entry.status === "rejected")) return { kind: "rejected", text: "Rejected by Companies House" };
  if (filings.length > 0 && filings.every((entry) => entry.status === "accepted"))
    return { kind: "accepted", text: "Accepted by Companies House" };
  return { kind: "pending", text: "With Companies House" };
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
      nameHtml: `Company number ${escapeRecordText(companyNumber)}`,
      title,
      subtitleHtml: `Submitted ${escapeRecordText(dateText)}`,
    })}${textTable([["Company number", companyNumber], ...details])}`,
  );
  const receiptRecord = page(
    `${recordHeading({
      nameHtml: "Companies House receipt",
      referenceHtml: [`Submission number ${escapeRecordText(transaction.transactionId)}`],
      title: "Receipt from Companies House",
      subtitleHtml: `Filed ${escapeRecordText(dateText)}`,
    })}${textTable([
      ["Submission number", transaction.transactionId],
      ["Company number", companyNumber],
      ["Status", status.text],
      ["Filed on", dateText],
    ])}`,
  );
  return customerCopyHtml({
    title: `Your copy of the ${title.charAt(0).toLowerCase()}${title.slice(1)}`,
    reference: { label: "Submission number", value: String(transaction.transactionId ?? ABSENT) },
    status,
    date: dateText,
    sections: [
      {
        heading: "The change as submitted",
        explanation: "This is what you asked Companies House to record on the register.",
        recordHtml: changeRecord,
      },
      {
        heading: "Receipt from Companies House",
        explanation: "Companies House gave this filing a submission number. Quote it if you write to Companies House about this change.",
        recordHtml: receiptRecord,
      },
    ],
    links: [{ href: "companySearch.html", text: "Look up another company" }, RECEIPTS_LINK],
  });
}
