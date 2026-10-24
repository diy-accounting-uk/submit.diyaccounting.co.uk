// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/itsa-submission-record.js
// The Income Tax annual submissions and the quarterly period summaries, laid out as submission
// records in the house style of submission-record.css and framed as a customer copy. The module
// holds no page state: a page passes in the figures it sent or HMRC returned, and gets markup
// back. Every value is checked before it prints, so a field HMRC leaves out shows a dash, a date
// that is not a date is left out, and nothing prints "undefined", "null" or "NaN".

import { customerCopyHtml, escapeRecordText, recordAmount, recordHeading, recordTable } from "./submission-record.js";
import { ABSENT, formatLongDate, formatNino, formatTimestamp } from "./itsa-calculation-record.js";

export { mountCopy } from "./itsa-calculation-record.js";

const KIND_NAMES = {
  "self-employment": "Self-employment",
  "uk-property": "UK property",
};

const FIELD_LABELS = {
  // Annual adjustments
  "includedNonTaxableProfits": "Included non-taxable profits",
  "basisAdjustment": "Basis period adjustment",
  "accountingAdjustment": "Accounting adjustment",
  "outstandingBusinessIncome": "Outstanding business income",
  "balancingChargeBpra": "Balancing charge (business premises renovation allowance)",
  "balancingChargeOther": "Balancing charge (other)",
  "goodsAndServicesOwnUse": "Goods and services for own use",
  "transitionProfitAmount": "Transition profit amount",
  "transitionProfitAccelerationAmount": "Transition profit acceleration amount",
  "balancingCharge": "Balancing charge",
  "privateUseAdjustment": "Private use adjustment",
  "businessPremisesRenovationAllowanceBalancingCharges": "Business premises renovation allowance balancing charges",
  "nonResidentLandlord": "Non-resident landlord",
  "rentARoom: jointlyLet": "Rent a room: jointly let",
  // Annual allowances
  "tradingIncomeAllowance": "Trading income allowance",
  "propertyIncomeAllowance": "Property income allowance",
  "annualInvestmentAllowance": "Annual investment allowance",
  "capitalAllowanceMainPool": "Capital allowance, main pool",
  "capitalAllowanceSpecialRatePool": "Capital allowance, special rate pool",
  "businessPremisesRenovationAllowance": "Business premises renovation allowance",
  "enhancedCapitalAllowance": "Enhanced capital allowance",
  "allowanceOnSales": "Allowance on sales",
  "capitalAllowanceSingleAssetPool": "Capital allowance, single asset pool",
  "zeroEmissionsCarAllowance": "Zero emissions car allowance",
  "otherCapitalAllowance": "Other capital allowance",
  "costOfReplacingDomesticItems": "Cost of replacing domestic items",
  // Non-financial details
  "class4NicsExemptionReason": "Class 4 National Insurance exemption reason",
  // Period income
  "turnover": "Turnover",
  "periodAmount": "Rental income",
  "otherIncome": "Other property income",
  // Period expenses
  "consolidatedExpenses": "Total expenses",
  "costOfGoods": "Cost of goods",
  "paymentsToSubcontractors": "Payments to subcontractors",
  "wagesAndStaffCosts": "Wages, salaries and other staff costs",
  "carVanTravelExpenses": "Car, van and travel expenses",
  "premisesRunningCosts": "Rent, rates, power and insurance costs",
  "maintenanceCosts": "Repairs and renewals of property and equipment",
  "adminCosts": "Phone, fax, stationery and other office costs",
  "businessEntertainmentCosts": "Business entertainment costs",
  "advertisingCosts": "Advertising costs",
  "interestOnBankOtherLoans": "Interest on bank and other loans",
  "financeCharges": "Bank, credit card and other financial charges",
  "irrecoverableDebts": "Irrecoverable debts written off",
  "professionalFees": "Accountancy, legal and other professional fees",
  "depreciation": "Depreciation and loss/profit on sales of assets",
  "otherExpenses": "Other expenses",
  "repairsAndMaintenance": "Repairs and maintenance",
  "financialCosts": "Financial costs",
  "costOfServices": "Cost of services",
  "residentialFinancialCost": "Residential financial costs",
  "residentialFinancialCostsCarriedForward": "Residential financial costs carried forward",
  "travelCosts": "Travel costs",
};

const EXEMPTION_REASON_LABELS = {
  "non-resident": "Non-resident",
  "trustee": "Trustee",
  "diver": "Diver",
  "over-state-pension-age": "Over State Pension age",
};

const ANNUAL_SECTIONS = [
  {
    key: "adjustments",
    heading: "Adjustments",
    explanation:
      "These are the adjustments to the year's profit that you sent. A figure you left at 0 was not sent, so it does not appear.",
  },
  {
    key: "allowances",
    heading: "Allowances",
    explanation:
      "These are the allowances you claimed for the year. HMRC accepts the trading or property income allowance, or the itemised allowances, but not both.",
  },
  {
    key: "nonFinancials",
    heading: "Other details",
    explanation: "These details do not change the amounts. HMRC uses them to apply the right rules to the year.",
  },
];

function isAmount(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecordObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function labelFor(path) {
  const key = path.join(": ");
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return path.map((part) => FIELD_LABELS[part] || humanise(part)).join(": ");
}

// Every figure a group holds, one level of nesting flattened into "Group: field" labels.
// A key that is undefined was not sent, so it has no row; a key that is present but unreadable
// keeps its row and shows a dash.
function collectEntries(group, path = []) {
  if (!isRecordObject(group)) return [];
  return Object.entries(group).flatMap(([key, value]) => {
    if (value === undefined) return [];
    if (isRecordObject(value)) return collectEntries(value, [...path, key]);
    return [{ path: [...path, key], value }];
  });
}

function textCell(text) {
  return { html: escapeRecordText(text), bracketed: false };
}

function valueCell(entry) {
  const { value } = entry;
  const leaf = entry.path[entry.path.length - 1];
  if (isAmount(value)) return recordAmount(value, { decimals: 2 });
  if (typeof value === "boolean") return textCell(value ? "Yes" : "No");
  if (leaf === "class4NicsExemptionReason" && nonEmptyText(value)) {
    return textCell(EXEMPTION_REASON_LABELS[value.trim()] || humanise(value));
  }
  if (typeof value === "string" && formatLongDate(value)) return textCell(formatLongDate(value));
  return textCell(ABSENT);
}

function entriesTable(columnHeading, entries, idPrefix) {
  return recordTable({
    columns: [columnHeading],
    rows: entries.map((entry) => {
      const cell = valueCell(entry);
      const id = `${idPrefix}-${entry.path.join("-")}`;
      return {
        label: labelFor(entry.path),
        cells: [{ ...cell, html: `<span id="${id}">${cell.html}</span>` }],
      };
    }),
  });
}

function referenceLines({ nino, businessId }) {
  const lines = [];
  const formattedNino = formatNino(nino);
  if (formattedNino) lines.push(`National Insurance number ${escapeRecordText(formattedNino)}`);
  const id = nonEmptyText(businessId);
  if (id) lines.push(`Business ID ${escapeRecordText(id)}`);
  return lines;
}

/**
 * The customer copy of an annual submission as saved: the adjustments, allowances and other
 * details that were sent, the business and the date HMRC accepted them. HMRC answers a save
 * without an id of its own, so the business ID is the reference.
 *
 * @param {object} input
 * @param {"self-employment"|"uk-property"} input.kind
 * @param {string} [input.nino]
 * @param {string} [input.businessId]
 * @param {string} [input.taxYear] - e.g. "2024-25"
 * @param {string} [input.savedAt] - ISO timestamp of the save
 * @param {{adjustments?: object, allowances?: object, nonFinancials?: object}} [input.sent]
 * @param {{href: string, text: string}[]} [input.links]
 * @returns {string}
 */
export function annualCopyHtml({ kind, nino, businessId, taxYear, savedAt, sent, links = [] }) {
  const year = nonEmptyText(taxYear);
  const saved = formatTimestamp(savedAt);
  const kindName = KIND_NAMES[kind] || "Business";
  const groups = isRecordObject(sent) ? sent : {};
  const columnHeading = year || "Amount";

  const recordHead = recordHeading({
    nameHtml: escapeRecordText(`${kindName} annual submission`),
    referenceHtml: referenceLines({ nino, businessId }),
    title: year ? `Tax year ${year}` : "Tax year",
    subtitleHtml: escapeRecordText(saved ? `Saved with HMRC on ${saved}` : "Saved with HMRC"),
  });

  const sections = ANNUAL_SECTIONS.map((section, index) => {
    const entries = collectEntries(groups[section.key]);
    const body =
      entries.length > 0
        ? entriesTable(columnHeading, entries, `annual-${section.key}`)
        : `<p class="no-data">You sent no ${section.heading.toLowerCase()} for this year.</p>`;
    return {
      heading: section.heading,
      explanation: section.explanation,
      recordHtml: (index === 0 ? recordHead : "") + body,
    };
  });

  return customerCopyHtml({
    title: year
      ? `Your copy of the ${kindName.toLowerCase()} annual submission for ${year}`
      : `Your copy of the ${kindName.toLowerCase()} annual submission`,
    reference: { label: "Business ID", value: nonEmptyText(businessId) || ABSENT },
    status: { kind: "accepted", text: "Accepted by HMRC" },
    date: saved || "Not recorded",
    sections,
    links,
  });
}

function periodDates(period) {
  const dates = isRecordObject(period?.periodDates) ? period.periodDates : {};
  const from = formatLongDate(dates.periodStartDate ?? period?.fromDate);
  const to = formatLongDate(dates.periodEndDate ?? period?.toDate);
  return { from, to };
}

// The period's income and expenses, for the self-employment summary and for the UK property
// summary in its dated and cumulative shapes.
function periodGroups(period) {
  if (!isRecordObject(period)) return { income: {}, expenses: {}, propertyType: null };
  if (isRecordObject(period.ukProperty)) {
    return { income: period.ukProperty.income, expenses: period.ukProperty.expenses, propertyType: "UK property" };
  }
  if (isRecordObject(period.ukFhlProperty)) {
    return { income: period.ukFhlProperty.income, expenses: period.ukFhlProperty.expenses, propertyType: "Furnished holiday letting" };
  }
  if (isRecordObject(period.ukNonFhlProperty)) {
    return { income: period.ukNonFhlProperty.income, expenses: period.ukNonFhlProperty.expenses, propertyType: "UK property" };
  }
  return { income: period.periodIncome, expenses: period.periodExpenses, propertyType: null };
}

const KNOWN_INCOME_KEYS = {
  "self-employment": ["turnover", "other"],
  "uk-property": ["periodAmount", "otherIncome"],
};

const INCOME_LABEL_OVERRIDES = {
  "self-employment": { other: "Other income" },
  "uk-property": {},
};

const EXPENSE_LABEL_OVERRIDES = {
  "uk-property": {
    premisesRunningCosts: "Rent, rates, insurance and ground rent",
    financialCosts: "Loan interest and other financial costs",
    professionalFees: "Legal, management and other professional fees",
    costOfServices: "Costs of services provided, including wages",
    other: "Other property expenses",
  },
  "self-employment": {},
};

function withKnownKeys(group, keys) {
  const source = isRecordObject(group) ? group : {};
  const known = keys.map((key) => ({ path: [key], value: source[key] }));
  const extra = collectEntries(source).filter((entry) => !keys.includes(entry.path[0]));
  return [...known, ...extra];
}

function periodTable(columnHeading, entries, idPrefix, overrides) {
  return recordTable({
    columns: [columnHeading],
    rows: entries.map((entry) => {
      const cell = valueCell(entry);
      return {
        label: overrides[entry.path[0]] && entry.path.length === 1 ? overrides[entry.path[0]] : labelFor(entry.path),
        cells: [{ ...cell, html: `<span id="${idPrefix}-${entry.path.join("-")}">${cell.html}</span>` }],
      };
    }),
  });
}

/**
 * The customer copy of a period summary as HMRC holds it: the period, the income and the
 * expenses. The reference is the ID the customer asked for, or "Year to date" for a cumulative
 * tax year.
 *
 * @param {object} input
 * @param {"self-employment"|"uk-property"} input.kind
 * @param {object} input.period - HMRC's period summary
 * @param {string} [input.nino]
 * @param {string} [input.businessId]
 * @param {string} [input.taxYear]
 * @param {string} [input.periodId] - the period or submission ID the customer asked for; empty for a cumulative tax year
 * @param {string} [input.idLabel] - what HMRC calls that ID, "Period ID" or "Submission ID"
 * @param {string} [input.retrievedAt] - ISO timestamp of the retrieval
 * @param {{href: string, text: string}[]} [input.links]
 * @returns {string}
 */
export function periodCopyHtml({ kind, period, nino, businessId, taxYear, periodId, idLabel = "Period ID", retrievedAt, links = [] }) {
  const kindName = KIND_NAMES[kind] || "Business";
  const year = nonEmptyText(taxYear);
  const retrieved = formatTimestamp(retrievedAt);
  const { from, to } = periodDates(period);
  const { income, expenses, propertyType } = periodGroups(period);
  let periodLine = null;
  if (from && to) periodLine = `${from} to ${to}`;
  else if (to) periodLine = `Year to ${to}`;
  const reference = nonEmptyText(periodId) || "Year to date";

  const referenceHtml = referenceLines({ nino, businessId });
  referenceHtml.push(`${nonEmptyText(periodId) ? idLabel : "Reporting"} ${escapeRecordText(reference)}`);

  const recordHead = recordHeading({
    nameHtml: escapeRecordText(`${kindName} quarterly update`),
    referenceHtml,
    title: year ? `Tax year ${year}` : "Tax year",
    subtitleHtml: escapeRecordText([periodLine, propertyType].filter(Boolean).join(". ") || "Period summary held by HMRC"),
  });

  const columnHeading = periodLine || year || "Amount";
  const expenseEntries = collectEntries(expenses);

  return customerCopyHtml({
    title: periodLine
      ? `Your copy of the ${kindName.toLowerCase()} update for ${periodLine}`
      : `Your copy of the ${kindName.toLowerCase()} update`,
    reference: { label: nonEmptyText(periodId) ? idLabel : "Reporting", value: reference },
    status: { kind: "accepted", text: "Held by HMRC" },
    date: retrieved ? `Retrieved ${retrieved}` : "Not recorded",
    sections: [
      {
        heading: "Income",
        explanation:
          "This is the income HMRC holds for the period. A dash means HMRC holds no figure. A cumulative year shows the running total from the start of the tax year.",
        recordHtml:
          recordHead +
          periodTable(
            columnHeading,
            withKnownKeys(income, KNOWN_INCOME_KEYS[kind] || []),
            "period-income",
            INCOME_LABEL_OVERRIDES[kind] || {},
          ),
      },
      {
        heading: "Expenses",
        explanation: "These are the expenses HMRC holds for the period. HMRC holds either one total or the itemised costs.",
        recordHtml:
          expenseEntries.length > 0
            ? periodTable(columnHeading, expenseEntries, "period-expenses", EXPENSE_LABEL_OVERRIDES[kind] || {})
            : `<p class="no-data">HMRC holds no expenses for this period.</p>`,
      },
    ],
    links,
  });
}
