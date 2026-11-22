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

// page-chrome.js gives the text in the reader's language; under Node, and without it, the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

function inWelsh() {
  return globalThis.siteLanguage?.chrome?.() === "cy";
}

export const ABSENT = "—";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// HMRC's Welsh month names; Chromium's Intl has no Welsh dates.
const WELSH_MONTHS = [
  "Ionawr",
  "Chwefror",
  "Mawrth",
  "Ebrill",
  "Mai",
  "Mehefin",
  "Gorffennaf",
  "Awst",
  "Medi",
  "Hydref",
  "Tachwedd",
  "Rhagfyr",
];

const calculationTypeLabels = () => ({
  "in-year": siteText("itsa.calc-type-in-year", "In-year estimate"),
  "intent-to-finalise": siteText("itsa.calc-type-intent", "Intent to finalise"),
  "final-declaration": siteText("itsa.final-declaration", "Final declaration"),
});

const incomeSourceTypeLabels = () => ({
  "self-employment": siteText("itsa.self-employment", "Self-employment"),
  "uk-property": siteText("itsa.uk-property", "UK property"),
  "foreign-property": siteText("itsa.foreign-property", "Foreign property"),
  "uk-property-fhl": siteText("itsa.uk-fhl", "UK furnished holiday letting"),
});

const businessFigureRows = () => [
  ["taxableProfit", siteText("itsa.field-taxable-profit", "Taxable profit")],
  ["totalBroughtForwardIncomeTaxLosses", siteText("itsa.brought-forward-losses", "Brought forward losses")],
  ["broughtForwardIncomeTaxLossesUsed", siteText("itsa.brought-forward-losses-used", "Brought forward losses used")],
  ["adjustedIncomeTaxLoss", siteText("itsa.adjusted-loss", "Adjusted loss")],
  ["taxableProfitAfterIncomeTaxLossesDeduction", siteText("itsa.profit-after-losses", "Taxable profit after losses deducted")],
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
  return `${day} ${(inWelsh() ? WELSH_MONTHS : MONTHS)[month - 1]} ${year}`;
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
  if (inWelsh()) {
    const month = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", month: "numeric" }).format(moment));
    return `${parts.day} ${WELSH_MONTHS[month - 1]} ${parts.year} am ${parts.hour}:${parts.minute}`;
  }
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
  return calculationTypeLabels()[text] || humanise(text);
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
  const name =
    nonEmptyText(source.incomeSourceName) ||
    (type ? incomeSourceTypeLabels()[type] || humanise(type) : siteText("itsa.business", "Business"));
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
    columns: [nonEmptyText(taxYear) || siteText("widget.field-amount", "Amount")],
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
    rows: businessFigureRows().map(([key, label]) => ({
      label,
      cells: entries.map((entry) => figureCell(entry[key], "money")),
    })),
  });
}

function periodLine(metadata) {
  const from = formatLongDate(metadata.periodFrom);
  const to = formatLongDate(metadata.periodTo);
  return from && to ? siteText("widget.date-range", "{start} to {end}", { start: from, end: to }) : null;
}

function heading({ title, nino, metadata, taxYear, subtitleParts }) {
  const referenceHtml = [];
  const formattedNino = formatNino(nino);
  if (formattedNino)
    referenceHtml.push(siteText("itsa.record-nino", "National Insurance number {nino}", { nino: escapeRecordText(formattedNino) }));
  const calculationId = nonEmptyText(metadata.calculationId);
  if (calculationId)
    referenceHtml.push(siteText("itsa.record-calculation-id", "Calculation ID {id}", { id: escapeRecordText(calculationId) }));
  const year = nonEmptyText(taxYear) || nonEmptyText(metadata.taxYear);
  return recordHeading({
    nameHtml: escapeRecordText(title),
    referenceHtml,
    title: year ? siteText("itsa.record-tax-year", "Tax year {year}", { year }) : siteText("itsa.tax-year", "Tax year"),
    subtitleHtml: escapeRecordText(subtitleParts.filter(Boolean).join(". ") || siteText("itsa.calculated-by-hmrc", "Calculated by HMRC")),
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

const totalLabel = () => siteText("itsa.total-due", "Total Income Tax and National Insurance due");

const explainTotal = () =>
  siteText(
    "itsa.record-explain-total",
    "This is the amount HMRC calculates you owe for the tax year, Income Tax and National Insurance together. It changes when you send HMRC more figures.",
  );
const explainBreakdown = () =>
  siteText(
    "itsa.record-explain-breakdown",
    "Income Tax and National Insurance are shown on their own lines. Tax already deducted is tax that you or others have already paid on this income.",
  );
const explainAllowances = () =>
  siteText(
    "itsa.record-explain-allowances",
    "Allowances and deductions reduce the income that HMRC taxes. HMRC chose these lines from the figures you and others have sent. A dash means HMRC gave no figure.",
  );
const explainBusinesses = () =>
  siteText(
    "itsa.record-explain-businesses",
    "There is one column for each business that HMRC counted. A brought forward loss shows where HMRC used a loss from an earlier year against this year's profit.",
  );

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
    title: siteText("itsa.income-tax-calculation", "Income Tax calculation"),
    nino,
    metadata,
    taxYear: year,
    subtitleParts: [
      calculationTypeLabel(type),
      periodLine(metadata),
      timestamp ? siteText("itsa.record-calculated-on", "Calculated by HMRC on {date}", { date: timestamp }) : null,
    ],
  });

  const sections = [
    {
      heading: siteText("itsa.record-what-is-due", "What is due"),
      explanation: explainTotal(),
      recordHtml:
        recordHead +
        rowsTable(year, [{ label: totalLabel(), value: totalDue, total: true, valueId: "totalIncomeTaxAndNicsDue", kind: "money" }]),
    },
    {
      heading: siteText("itsa.record-tax-and-nics", "Income Tax and National Insurance"),
      explanation: explainBreakdown(),
      recordHtml: rowsTable(year, breakdownRows),
    },
    {
      heading: siteText("itsa.record-allowances", "Allowances and deductions"),
      explanation: explainAllowances(),
      recordHtml:
        allowanceRows.length > 0
          ? rowsTable(year, allowanceRows)
          : `<p class="no-data">${siteText("itsa.record-no-allowances", "HMRC's calculation carries no allowances or deductions.")}</p>`,
    },
  ];

  const businesses = Array.isArray(calc.businessProfitAndLoss) ? calc.businessProfitAndLoss : [];
  if (businesses.some((entry) => entry && typeof entry === "object")) {
    sections.push({
      heading: siteText("itsa.record-your-businesses", "Your businesses"),
      explanation: explainBusinesses(),
      recordHtml: businessesTable(businesses),
    });
  }

  return customerCopyHtml({
    title: year
      ? siteText("itsa.record-calculation-copy-year", "Your copy of the Income Tax calculation for {year}", { year })
      : siteText("itsa.record-calculation-copy", "Your copy of the Income Tax calculation"),
    reference: { label: siteText("itsa.calculation-id", "Calculation ID"), value: nonEmptyText(metadata.calculationId) || ABSENT },
    status: {
      kind: "pending",
      text: isFinalise
        ? siteText("itsa.record-not-yet-declared", "Calculated by HMRC, not yet declared")
        : siteText("itsa.record-estimate", "Estimate calculated by HMRC"),
    },
    date: timestamp || siteText("itsa.record-not-given", "Not given by HMRC"),
    sections,
    links,
  });
}

// The declaration as the reader made it, in the words of the page's tick box, which are HMRC's own;
// a Welsh reader made it in the Welsh of those words.
function declarationWording() {
  return siteText(
    "itsa.declaration-wording",
    "I declare that the information and tax return I have submitted are (taken together) correct and complete to the best of my knowledge. I understand that I may have to pay financial penalties and face prosecution if I give false information.",
  );
}

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
    title: siteText("itsa.final-declaration", "Final declaration"),
    nino,
    metadata,
    taxYear: year,
    subtitleParts: [
      periodLine(metadata),
      filed ? siteText("itsa.record-declared-on", "Declared on {date}", { date: filed }) : null,
      calculatedAt ? siteText("itsa.record-based-on", "Based on the calculation HMRC made on {date}", { date: calculatedAt }) : null,
    ],
  });

  const breakdown = Array.isArray(breakdownRows) ? breakdownRows : [];
  const breakdownSection = breakdown.some((row) => isAmount(row.value))
    ? [
        {
          heading: siteText("itsa.record-how-made-up", "How the total is made up"),
          explanation: explainBreakdown(),
          recordHtml: rowsTable(year, breakdown),
        },
      ]
    : [];

  return customerCopyHtml({
    title: year
      ? siteText("itsa.record-declaration-copy-year", "Your copy of the final declaration for {year}", { year })
      : siteText("itsa.record-declaration-copy", "Your copy of the final declaration"),
    reference: { label: siteText("itsa.calculation-id", "Calculation ID"), value: nonEmptyText(metadata.calculationId) || ABSENT },
    status: { kind: "accepted", text: siteText("itsa.accepted-by-hmrc", "Accepted by HMRC") },
    date: filed || siteText("itsa.record-not-recorded", "Not recorded"),
    sections: [
      {
        heading: siteText("itsa.record-what-you-declared", "What you declared"),
        explanation: siteText(
          "itsa.record-explain-declared",
          "This is the total that you confirmed. It comes from the calculation HMRC made, which is named by the calculation ID above.",
        ),
        recordHtml:
          recordHead + rowsTable(year, [{ label: totalLabel(), value: totalDue, total: true, valueId: "declaredTotalDue", kind: "money" }]),
      },
      ...breakdownSection,
      {
        heading: siteText("itsa.record-your-confirmation", "Your confirmation"),
        explanation: siteText(
          "itsa.record-explain-confirmation",
          "You ticked this statement before you sent the declaration. HMRC holds your Self Assessment return for the year as filed.",
        ),
        recordHtml: `<div class="page"><p class="approval">${escapeRecordText(declarationWording())}</p></div>`,
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
