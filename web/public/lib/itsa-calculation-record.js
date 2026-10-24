// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/itsa-calculation-record.js
// HMRC's Income Tax calculation, and the final declaration made on it, laid out as submission
// records in the house style of submission-record.css and framed as a customer copy. The module
// holds no page state: a page passes in HMRC's response and the figure rows it built from it,
// and gets markup back. Every value is checked before it prints, so a field HMRC leaves out
// shows a dash, a date HMRC leaves out is left out, and nothing prints "undefined" or "NaN".

import {
  customerCopyHtml,
  escapeRecordAttribute,
  escapeRecordText,
  recordAmount,
  recordHeading,
  recordTable,
} from "./submission-record.js";

export const ABSENT = "—";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const CALCULATION_TYPE_LABELS = {
  "in-year": "In-year estimate",
  "intent-to-finalise": "Intent to finalise",
  "final-declaration": "Final declaration",
};

const INCOME_SOURCE_TYPE_LABELS = {
  "self-employment": "Self-employment",
  "uk-property": "UK property",
  "foreign-property": "Foreign property",
  "uk-property-fhl": "UK furnished holiday letting",
};

const BUSINESS_FIGURE_ROWS = [
  ["taxableProfit", "Taxable profit"],
  ["totalBroughtForwardIncomeTaxLosses", "Brought forward losses"],
  ["broughtForwardIncomeTaxLossesUsed", "Brought forward losses used"],
  ["adjustedIncomeTaxLoss", "Adjusted loss"],
  ["taxableProfitAfterIncomeTaxLossesDeduction", "Taxable profit after losses deducted"],
];

function isAmount(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function humanise(text) {
  const words = String(text)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A date as the customer reads it, "5 April 2025", or null when the value is not a calendar date.
 * @param {unknown} value - an ISO date, or an ISO timestamp (only its date is read)
 * @returns {string|null}
 */
export function formatLongDate(value) {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/**
 * A timestamp in UK time as the customer reads it, "24 October 2026 at 14:03", or null when the
 * value is not a timestamp.
 * @param {unknown} value
 * @returns {string|null}
 */
export function formatTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(moment)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year} at ${parts.hour}:${parts.minute}`;
}

/**
 * A National Insurance number in the groups HMRC prints it, or the text as given when it is not
 * in that shape, or null when there is none.
 * @param {unknown} nino
 * @returns {string|null}
 */
export function formatNino(nino) {
  const text = nonEmptyText(nino);
  if (!text) return null;
  const compact = text.replace(/\s+/g, "").toUpperCase();
  const match = /^([A-Z]{2})(\d{2})(\d{2})(\d{2})([A-Z])$/.exec(compact);
  return match ? match.slice(1).join(" ") : text;
}

/**
 * @param {unknown} calculationType - e.g. "intent-to-finalise"
 * @returns {string|null}
 */
export function calculationTypeLabel(calculationType) {
  const text = nonEmptyText(calculationType);
  if (!text) return null;
  return CALCULATION_TYPE_LABELS[text] || humanise(text);
}

/**
 * The name a customer knows a business by: its name, else its kind of income, and its id in
 * brackets when HMRC gave one.
 * @param {{incomeSourceName?: unknown, incomeSourceType?: unknown, incomeSourceId?: unknown}} entry
 * @returns {string}
 */
export function businessLabel(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  const type = nonEmptyText(source.incomeSourceType);
  const name = nonEmptyText(source.incomeSourceName) || (type ? INCOME_SOURCE_TYPE_LABELS[type] || humanise(type) : "Business");
  const id = nonEmptyText(source.incomeSourceId);
  return id ? `${name} (${id})` : name;
}

function figureCell(value, kind, valueId) {
  let figure;
  if (kind === "percent" && isAmount(value)) figure = { html: `${escapeRecordText(value)}%`, bracketed: false };
  else if (kind !== "percent" && isAmount(value)) figure = recordAmount(value, { decimals: 2 });
  else figure = { html: ABSENT, bracketed: false };
  if (!valueId) return figure;
  return { ...figure, html: `<span id="${escapeRecordAttribute(valueId)}">${figure.html}</span>` };
}

function rowsTable(taxYear, rows) {
  return recordTable({
    columns: [nonEmptyText(taxYear) || "Amount"],
    rows: rows.map((row) => ({
      label: String(row.label ?? ""),
      style: row.total ? "total" : undefined,
      cells: [figureCell(row.value, row.kind, row.valueId)],
    })),
  });
}

function businessesTable(businesses) {
  const entries = businesses.filter((entry) => entry && typeof entry === "object");
  return recordTable({
    columns: entries.map(businessLabel),
    rows: BUSINESS_FIGURE_ROWS.map(([key, label]) => ({
      label,
      cells: entries.map((entry) => figureCell(entry[key], "money")),
    })),
  });
}

function periodLine(metadata) {
  const from = formatLongDate(metadata.periodFrom);
  const to = formatLongDate(metadata.periodTo);
  return from && to ? `${from} to ${to}` : null;
}

function heading({ title, nino, metadata, taxYear, subtitleParts }) {
  const referenceHtml = [];
  const formattedNino = formatNino(nino);
  if (formattedNino) referenceHtml.push(`National Insurance number ${escapeRecordText(formattedNino)}`);
  const calculationId = nonEmptyText(metadata.calculationId);
  if (calculationId) referenceHtml.push(`Calculation ID ${escapeRecordText(calculationId)}`);
  const year = nonEmptyText(taxYear) || nonEmptyText(metadata.taxYear);
  return recordHeading({
    nameHtml: escapeRecordText(title),
    referenceHtml,
    title: year ? `Tax year ${year}` : "Tax year",
    subtitleHtml: escapeRecordText(subtitleParts.filter(Boolean).join(". ") || "Calculated by HMRC"),
  });
}

function safeMetadata(calculation) {
  const metadata = calculation && typeof calculation === "object" ? calculation.metadata : null;
  return metadata && typeof metadata === "object" ? metadata : {};
}

function safeCalc(calculation) {
  const calc = calculation && typeof calculation === "object" ? calculation.calculation : null;
  return calc && typeof calc === "object" ? calc : {};
}

const TOTAL_LABEL = "Total Income Tax and National Insurance due";

const EXPLAIN_TOTAL =
  "This is the amount HMRC calculates you owe for the tax year, Income Tax and National Insurance together. It changes when you send HMRC more figures.";
const EXPLAIN_BREAKDOWN =
  "Income Tax and National Insurance are shown on their own lines. Tax already deducted is tax that you or others have already paid on this income.";
const EXPLAIN_ALLOWANCES =
  "Allowances and deductions reduce the income that HMRC taxes. HMRC chose these lines from the figures you and others have sent. A dash means HMRC gave no figure.";
const EXPLAIN_BUSINESSES =
  "There is one column for each business that HMRC counted. A brought forward loss shows where HMRC used a loss from an earlier year against this year's profit.";

/**
 * The customer copy of HMRC's calculation: a record in four sections, each with a plain
 * explanation beside it.
 *
 * @param {object} input
 * @param {object} input.calculation - HMRC's retrieve-calculation response
 * @param {string} [input.nino]
 * @param {string} [input.taxYear] - e.g. "2024-25"
 * @param {string} [input.calculationType] - the type the customer asked for
 * @param {{field: string, label: string, value: unknown, kind?: string, total?: boolean, valueId?: string}[]} input.breakdownRows
 * @param {{field: string, label: string, value: unknown, kind?: string}[]} input.allowanceRows
 * @param {{href: string, text: string}[]} [input.links]
 * @returns {string}
 */
export function calculationCopyHtml({ calculation, nino, taxYear, calculationType, breakdownRows, allowanceRows, links = [] }) {
  const metadata = safeMetadata(calculation);
  const calc = safeCalc(calculation);
  const year = nonEmptyText(taxYear) || nonEmptyText(metadata.taxYear);
  const type = nonEmptyText(calculationType) || nonEmptyText(metadata.calculationType);
  const timestamp = formatTimestamp(metadata.calculationTimestamp);
  const isFinalise = type === "intent-to-finalise";

  const totalDue =
    calc.taxCalculation && typeof calc.taxCalculation === "object" ? calc.taxCalculation.totalIncomeTaxAndNicsDue : undefined;
  const recordHead = heading({
    title: "Income Tax calculation",
    nino,
    metadata,
    taxYear: year,
    subtitleParts: [calculationTypeLabel(type), periodLine(metadata), timestamp ? `Calculated by HMRC on ${timestamp}` : null],
  });

  const sections = [
    {
      heading: "What is due",
      explanation: EXPLAIN_TOTAL,
      recordHtml:
        recordHead +
        rowsTable(year, [{ label: TOTAL_LABEL, value: totalDue, total: true, valueId: "totalIncomeTaxAndNicsDue", kind: "money" }]),
    },
    {
      heading: "Income Tax and National Insurance",
      explanation: EXPLAIN_BREAKDOWN,
      recordHtml: rowsTable(year, breakdownRows),
    },
    {
      heading: "Allowances and deductions",
      explanation: EXPLAIN_ALLOWANCES,
      recordHtml:
        allowanceRows.length > 0
          ? rowsTable(year, allowanceRows)
          : `<p class="no-data">HMRC's calculation carries no allowances or deductions.</p>`,
    },
  ];

  const businesses = Array.isArray(calc.businessProfitAndLoss) ? calc.businessProfitAndLoss : [];
  if (businesses.some((entry) => entry && typeof entry === "object")) {
    sections.push({ heading: "Your businesses", explanation: EXPLAIN_BUSINESSES, recordHtml: businessesTable(businesses) });
  }

  return customerCopyHtml({
    title: year ? `Your copy of the Income Tax calculation for ${year}` : "Your copy of the Income Tax calculation",
    reference: { label: "Calculation ID", value: nonEmptyText(metadata.calculationId) || ABSENT },
    status: {
      kind: "pending",
      text: isFinalise ? "Calculated by HMRC, not yet declared" : "Estimate calculated by HMRC",
    },
    date: timestamp || "Not given by HMRC",
    sections,
    links,
  });
}

export const DECLARATION_WORDING =
  "I confirm this information is correct and complete to the best of my knowledge. I understand I may face financial penalties and prosecution if I give false information.";

/**
 * The customer copy of the final declaration as made: the figures the customer confirmed, the
 * calculation id and timestamp as HMRC returned them, and the declaration wording.
 *
 * @param {object} input
 * @param {object} input.calculation - HMRC's retrieve-calculation response that the customer confirmed
 * @param {string} [input.nino]
 * @param {string} [input.taxYear]
 * @param {string} [input.calculationId] - the id the declaration was made on
 * @param {string} [input.filedAt] - ISO timestamp of the declaration
 * @param {{field: string, label: string, value: unknown, kind?: string, total?: boolean, valueId?: string}[]} [input.breakdownRows] - left out when the page no longer holds the calculation
 * @param {{href: string, text: string}[]} [input.links]
 * @returns {string}
 */
export function declarationCopyHtml({ calculation, nino, taxYear, calculationId, filedAt, breakdownRows = [], links = [] }) {
  const metadata = { ...safeMetadata(calculation) };
  if (nonEmptyText(calculationId)) metadata.calculationId = calculationId;
  const calc = safeCalc(calculation);
  const year = nonEmptyText(taxYear) || nonEmptyText(metadata.taxYear);
  const calculatedAt = formatTimestamp(metadata.calculationTimestamp);
  const filed = formatTimestamp(filedAt);
  const totalDue =
    calc.taxCalculation && typeof calc.taxCalculation === "object" ? calc.taxCalculation.totalIncomeTaxAndNicsDue : undefined;

  const recordHead = heading({
    title: "Final declaration",
    nino,
    metadata,
    taxYear: year,
    subtitleParts: [
      periodLine(metadata),
      filed ? `Declared on ${filed}` : null,
      calculatedAt ? `Based on the calculation HMRC made on ${calculatedAt}` : null,
    ],
  });

  const breakdown = Array.isArray(breakdownRows) ? breakdownRows : [];
  const breakdownSection = breakdown.some((row) => isAmount(row.value))
    ? [{ heading: "How the total is made up", explanation: EXPLAIN_BREAKDOWN, recordHtml: rowsTable(year, breakdown) }]
    : [];

  return customerCopyHtml({
    title: year ? `Your copy of the final declaration for ${year}` : "Your copy of the final declaration",
    reference: { label: "Calculation ID", value: nonEmptyText(metadata.calculationId) || ABSENT },
    status: { kind: "accepted", text: "Accepted by HMRC" },
    date: filed || "Not recorded",
    sections: [
      {
        heading: "What you declared",
        explanation:
          "This is the total that you confirmed. It comes from the calculation HMRC made, which is named by the calculation ID above.",
        recordHtml:
          recordHead + rowsTable(year, [{ label: TOTAL_LABEL, value: totalDue, total: true, valueId: "declaredTotalDue", kind: "money" }]),
      },
      ...breakdownSection,
      {
        heading: "Your confirmation",
        explanation:
          "You ticked this statement before you sent the declaration. HMRC holds your Self Assessment return for the year as filed.",
        recordHtml: `<div class="page"><p class="approval">${escapeRecordText(DECLARATION_WORDING)}</p></div>`,
      },
    ],
    links,
  });
}

/**
 * Puts a customer copy into a container. The markup is parsed, not assigned, so the page never
 * writes a string to innerHTML.
 * @param {Element} container
 * @param {string} html - from calculationCopyHtml or declarationCopyHtml
 */
export function mountCopy(container, html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  container.replaceChildren(...parsed.body.childNodes);
}
