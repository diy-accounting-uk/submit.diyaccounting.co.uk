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
  "foreign-property": "Foreign property",
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
  "zeroEmissionsGoodsVehicleAllowance": "Zero emissions goods vehicle allowance",
  "electricChargePointAllowance": "Electric charge point allowance",
  "periodOfGraceAdjustment": "Period of grace adjustment",
  "structuredBuildingAllowance": "Structures and Buildings Allowance",
  "enhancedStructuredBuildingAllowance": "Freeport Structures and Buildings Allowance",
  "firstYear: qualifyingDate": "Date the building first qualified",
  "firstYear: qualifyingAmountExpenditure": "Qualifying expenditure",
  // Non-financial details
  "class4NicsExemptionReason": "Class 4 National Insurance exemption reason",
  // Period income
  "turnover": "Turnover",
  "periodAmount": "Rental income",
  "otherIncome": "Other property income",
  // Foreign property period income
  "rentIncome: rentAmount": "Rental income",
  "rentAmount": "Rental income",
  "otherPropertyIncome": "Other property income",
  "premiumsOfLeaseGrant": "Premiums for the grant of a lease",
  "foreignTaxPaidOrDeducted": "Foreign tax taken off or paid",
  "specialWithholdingTaxOrUkTaxPaid": "UK tax taken off",
  "foreignTaxCreditRelief": "Claim foreign tax credit relief",
  "broughtFwdResidentialFinancialCost": "Unused residential finance costs brought forward",
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
  // Losses and claims
  "broughtForwardLosses": "Losses brought forward",
  "carryForward: currentYearLosses": "This year's loss carried forward",
  "carryForward: previousYearsLosses": "Earlier years' losses carried forward",
  "carrySideways: currentYearGeneralIncome": "Set against this year's other income",
  "carryBack: previousYearGeneralIncome": "Carried back against the previous year's income",
  "carryBack: earlyYearLosses": "Early year losses carried back",
  "carryBack: terminalLosses": "Terminal losses carried back",
  "preferenceOrder: applyFirst": "Applies first",
  // Tax liability adjustments
  "carryBackLossesDecrease: incomeTax": "Income tax decreased",
  "carryBackLossesDecrease: class4": "Class 4 National Insurance decreased",
  "carryBackLossesDecrease: capitalGainsTax": "Capital gains tax decreased",
};

// The building a Structures and Buildings Allowance claim names: text, not a figure.
const BUILDING_TEXT_KEYS = ["name", "number", "postcode"];

const CLAIM_ORDER_LABELS = {
  "carry-sideways": "Carry sideways first",
  "carry-back": "Carry back first",
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

// "Self-employment" reads in lower case mid-sentence; "UK property" keeps its capitals.
function kindPhrase(kindName) {
  return kindName.startsWith("UK") ? kindName : kindName.toLowerCase();
}

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
    if (Array.isArray(value) && value.length > 0 && value.every(isRecordObject)) {
      return value.flatMap((item, index) => collectEntries(item, [...path, key, `Claim ${index + 1}`]));
    }
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
  if (leaf === "applyFirst" && nonEmptyText(value)) return textCell(CLAIM_ORDER_LABELS[value.trim()] || humanise(value));
  if (typeof value === "string" && formatLongDate(value)) return textCell(formatLongDate(value));
  if (BUILDING_TEXT_KEYS.includes(leaf) && nonEmptyText(value)) return textCell(value.trim());
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

function referenceLines({ nino, businessId, correlationId }) {
  const lines = [];
  const formattedNino = formatNino(nino);
  if (formattedNino) lines.push(`National Insurance number ${escapeRecordText(formattedNino)}`);
  const id = nonEmptyText(businessId);
  if (id) lines.push(`Business ID ${escapeRecordText(id)}`);
  const hmrcCorrelationId = nonEmptyText(correlationId);
  if (hmrcCorrelationId) lines.push(`HMRC correlation ID ${escapeRecordText(hmrcCorrelationId)}`);
  return lines;
}

// One adjustments table and one allowances table for each entry of a foreign property annual
// submission: the EEA furnished holiday lettings (2024-25 and before) and each country or property.
function foreignAnnualSections(entries, columnHeading, recordHead) {
  if (entries.length === 0) {
    return [
      {
        heading: "Adjustments and allowances",
        explanation: "These are the adjustments and allowances you sent.",
        recordHtml: `${recordHead}<p class="no-data">You sent no adjustments or allowances for this year.</p>`,
      },
    ];
  }
  const table = (group, idPrefix, none) => {
    const rows = collectEntries(group);
    return rows.length > 0 ? entriesTable(columnHeading, rows, idPrefix) : `<p class="no-data">${escapeRecordText(none)}</p>`;
  };
  return entries.flatMap((entry, index) => {
    const name = entry.name;
    return [
      {
        heading: `${name}: adjustments`,
        explanation:
          index === 0
            ? "These are the adjustments to the year's profit that you sent, one table for each country or property. A figure you left at 0 was not sent, so it does not appear."
            : "",
        recordHtml:
          (index === 0 ? recordHead : "") +
          table(entry.adjustments, `annual-${entry.id}-adjustments`, `You sent no adjustments for ${name}.`),
      },
      {
        heading: `${name}: allowances`,
        explanation:
          index === 0
            ? "These are the allowances you claimed for the year. HMRC accepts the property income allowance or the itemised allowances, but not both."
            : "",
        recordHtml: table(entry.allowances, `annual-${entry.id}-allowances`, `You sent no allowances for ${name}.`),
      },
    ];
  });
}

/**
 * The customer copy of an annual submission as saved: the adjustments, allowances and other
 * details that were sent, the business and the date HMRC accepted them. HMRC answers a save
 * without an id of its own, so the business ID is the reference and HMRC's correlation ID,
 * when it sent one, is the second reference line.
 *
 * @param {object} input
 * @param {"self-employment"|"uk-property"|"foreign-property"} input.kind
 * @param {string} [input.nino]
 * @param {string} [input.businessId]
 * @param {string} [input.taxYear] - e.g. "2024-25"
 * @param {string} [input.savedAt] - ISO timestamp of the save
 * @param {string|null} [input.correlationId] - HMRC's X-CorrelationId for the save
 * @param {{adjustments?: object, allowances?: object, nonFinancials?: object, entries?: {id: string, name: string, adjustments?: object, allowances?: object}[]}} [input.sent]
 *   a foreign property submission sends entries: one for each country, property or EEA furnished holiday letting section
 * @param {{href: string, text: string}[]} [input.links]
 * @returns {string}
 */
export function annualCopyHtml({ kind, nino, businessId, taxYear, savedAt, correlationId, sent, links = [] }) {
  const year = nonEmptyText(taxYear);
  const saved = formatTimestamp(savedAt);
  const kindName = KIND_NAMES[kind] || "Business";
  const groups = isRecordObject(sent) ? sent : {};
  const columnHeading = year || "Amount";

  const recordHead = recordHeading({
    nameHtml: escapeRecordText(`${kindName} annual submission`),
    referenceHtml: referenceLines({ nino, businessId, correlationId }),
    title: year ? `Tax year ${year}` : "Tax year",
    subtitleHtml: escapeRecordText(saved ? `Saved with HMRC on ${saved}` : "Saved with HMRC"),
  });

  const foreignEntries = Array.isArray(groups.entries) ? groups.entries : [];
  const sections =
    kind === "foreign-property"
      ? foreignAnnualSections(foreignEntries, columnHeading, recordHead)
      : ANNUAL_SECTIONS.map((section, index) => {
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
      ? `Your copy of the ${kindPhrase(kindName)} annual submission for ${year}`
      : `Your copy of the ${kindPhrase(kindName)} annual submission`,
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

const PROPERTY_EXPENSE_LABELS = {
  premisesRunningCosts: "Rent, rates, insurance and ground rent",
  financialCosts: "Loan interest and other financial costs",
  professionalFees: "Legal, management and other professional fees",
  costOfServices: "Costs of services provided, including wages",
  other: "Other property expenses",
};

const EXPENSE_LABEL_OVERRIDES = {
  "foreign-property": PROPERTY_EXPENSE_LABELS,
  "uk-property": PROPERTY_EXPENSE_LABELS,
  "self-employment": {},
};

// The entries of a foreign property period summary: the EEA furnished holiday lettings (2024-25
// and before) and one entry for each country or property, as HMRC returns them in its dated and
// cumulative shapes.
function foreignPeriodEntries(period) {
  if (!isRecordObject(period)) return [];
  const entries = [];
  if (isRecordObject(period.foreignFhlEea)) {
    entries.push({ id: "fhl", name: "Furnished holiday lettings in the EEA", ...period.foreignFhlEea });
  }
  const list = [period.foreignNonFhlProperty, period.foreignProperty].find(Array.isArray) || [];
  list.forEach((entry, index) => {
    if (!isRecordObject(entry)) return;
    let name = `Entry ${index + 1}`;
    if (nonEmptyText(entry.countryCode)) name = globalThis.countryCodes?.countryName(entry.countryCode) ?? entry.countryCode;
    else if (nonEmptyText(entry.propertyId)) name = `Property ${entry.propertyId}`;
    entries.push({ id: String(index + 1), name, income: entry.income, expenses: entry.expenses });
  });
  return entries;
}

// One income table and one expenses table for each entry of a foreign property period.
function foreignPeriodSections(period, columnHeading, firstSectionPrefix) {
  const entries = foreignPeriodEntries(period);
  if (entries.length === 0) {
    return [
      {
        heading: "Income",
        explanation: "This is the income and expenses HMRC holds for the period.",
        recordHtml: `${firstSectionPrefix}<p class="no-data">HMRC holds no figures for this period.</p>`,
      },
    ];
  }
  return entries.flatMap((entry, index) => {
    const incomeEntries = collectEntries(entry.income);
    const expenseEntries = collectEntries(entry.expenses);
    return [
      {
        heading: `${entry.name}: income`,
        explanation:
          index === 0
            ? "This is the income HMRC holds for the period, one table for each country or property. A cumulative year shows the running total from the start of the tax year."
            : "",
        recordHtml:
          (index === 0 ? firstSectionPrefix : "") +
          (incomeEntries.length > 0
            ? periodTable(columnHeading, incomeEntries, `period-${entry.id}-income`, {})
            : `<p class="no-data">HMRC holds no income for ${escapeRecordText(entry.name)}.</p>`),
      },
      {
        heading: `${entry.name}: expenses`,
        explanation: index === 0 ? "HMRC holds either one total or the itemised costs for each country or property." : "",
        recordHtml:
          expenseEntries.length > 0
            ? periodTable(columnHeading, expenseEntries, `period-${entry.id}-expenses`, PROPERTY_EXPENSE_LABELS)
            : `<p class="no-data">HMRC holds no expenses for ${escapeRecordText(entry.name)}.</p>`,
      },
    ];
  });
}

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
 * @param {"self-employment"|"uk-property"|"foreign-property"} input.kind
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

  if (kind === "foreign-property") {
    return customerCopyHtml({
      title: periodLine ? `Your copy of the foreign property update for ${periodLine}` : "Your copy of the foreign property update",
      reference: { label: nonEmptyText(periodId) ? idLabel : "Reporting", value: reference },
      status: { kind: "accepted", text: "Held by HMRC" },
      date: retrieved ? `Retrieved ${retrieved}` : "Not recorded",
      sections: foreignPeriodSections(period, columnHeading, recordHead),
      links,
    });
  }

  const expenseEntries = collectEntries(expenses);

  return customerCopyHtml({
    title: periodLine
      ? `Your copy of the ${kindPhrase(kindName)} update for ${periodLine}`
      : `Your copy of the ${kindPhrase(kindName)} update`,
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

const LOSSES_SECTIONS = [
  {
    heading: "Losses",
    explanation: "These are the losses you told HMRC about for the year. A figure you left at 0 was not sent, so it does not appear.",
    prefix: "losses",
  },
  {
    heading: "Claims",
    explanation:
      "These are the claims you made for the year. A loss can carry forward, be set against this year's other income, or be carried back to an earlier year.",
    prefix: "claims",
  },
];

/**
 * The customer copy of a losses and claims save: the losses and claims that were sent, the
 * business and the date HMRC accepted them. HMRC answers the save with no body and no claim
 * id of its own, so the business ID is the reference and HMRC's correlation ID, when it sent
 * one, is the second reference line.
 *
 * @param {object} input
 * @param {"self-employment"|"uk-property"|"foreign-property"} input.kind
 * @param {string} [input.nino]
 * @param {string} [input.businessId]
 * @param {string} [input.taxYear] - e.g. "2026-27"
 * @param {string} [input.savedAt] - ISO timestamp of the save
 * @param {string|null} [input.correlationId] - HMRC's X-CorrelationId for the save
 * @param {{losses?: object, claims?: object}} [input.sent]
 * @param {{href: string, text: string}[]} [input.links]
 * @returns {string}
 */
export function lossesCopyHtml({ kind, nino, businessId, taxYear, savedAt, correlationId, sent, links = [] }) {
  const year = nonEmptyText(taxYear);
  const saved = formatTimestamp(savedAt);
  const kindName = KIND_NAMES[kind] || "Business";
  const groups = isRecordObject(sent) ? sent : {};
  const columnHeading = year || "Amount";

  const recordHead = recordHeading({
    nameHtml: escapeRecordText(`${kindName} losses and claims`),
    referenceHtml: referenceLines({ nino, businessId, correlationId }),
    title: year ? `Tax year ${year}` : "Tax year",
    subtitleHtml: escapeRecordText(saved ? `Saved with HMRC on ${saved}` : "Saved with HMRC"),
  });

  const sections = LOSSES_SECTIONS.map((section, index) => {
    const group = section.prefix === "losses" ? groups.losses : groups.claims;
    const entries = collectEntries(group);
    const body =
      entries.length > 0
        ? entriesTable(columnHeading, entries, `losses-${section.prefix}`)
        : `<p class="no-data">You sent no ${section.heading.toLowerCase()} for this year.</p>`;
    return {
      heading: section.heading,
      explanation: section.explanation,
      recordHtml: (index === 0 ? recordHead : "") + body,
    };
  });

  return customerCopyHtml({
    title: year
      ? `Your copy of the ${kindPhrase(kindName)} losses and claims for ${year}`
      : `Your copy of the ${kindPhrase(kindName)} losses and claims`,
    reference: { label: "Business ID", value: nonEmptyText(businessId) || ABSENT },
    status: { kind: "accepted", text: "Accepted by HMRC" },
    date: saved || "Not recorded",
    sections,
    links,
  });
}

/**
 * The customer copy of a tax liability adjustments save: the amounts by which a carry-back
 * claim decreases the earlier year's liability, the year and the date HMRC accepted them.
 * HMRC answers the save with no body and no id of its own, so the tax year is the reference
 * and HMRC's correlation ID, when it sent one, is the last reference line.
 *
 * @param {object} input
 * @param {string} [input.nino]
 * @param {string} [input.taxYear] - the earlier year the claim decreases, e.g. "2025-26"
 * @param {string} [input.savedAt] - ISO timestamp of the save
 * @param {string|null} [input.correlationId] - HMRC's X-CorrelationId for the save
 * @param {object} [input.carryBackLossesDecrease]
 * @param {{href: string, text: string}[]} [input.links]
 * @returns {string}
 */
export function adjustmentsCopyHtml({ nino, taxYear, savedAt, correlationId, carryBackLossesDecrease, links = [] }) {
  const year = nonEmptyText(taxYear);
  const saved = formatTimestamp(savedAt);
  const columnHeading = year || "Amount";
  const entries = collectEntries({ carryBackLossesDecrease }).filter((entry) => entry.value !== undefined);

  const recordHead = recordHeading({
    nameHtml: escapeRecordText("Tax liability adjustments"),
    referenceHtml: referenceLines({ nino, correlationId }),
    title: year ? `Tax year ${year}` : "Tax year",
    subtitleHtml: escapeRecordText(saved ? `Saved with HMRC on ${saved}` : "Saved with HMRC"),
  });

  const body =
    entries.length > 0
      ? entriesTable(columnHeading, entries, "adjustments")
      : `<p class="no-data">You sent no carry-back decrease for this year.</p>`;

  return customerCopyHtml({
    title: year ? `Your copy of the tax liability adjustments for ${year}` : "Your copy of the tax liability adjustments",
    reference: { label: "Tax year", value: year || ABSENT },
    status: { kind: "accepted", text: "Accepted by HMRC" },
    date: saved || "Not recorded",
    sections: [
      {
        heading: "Carry-back decrease",
        explanation:
          "These are the amounts by which your carry-back claim decreases the tax due for this earlier year. A figure you left at 0 was not sent, so it does not appear.",
        recordHtml: recordHead + body,
      },
    ],
    links,
  });
}
