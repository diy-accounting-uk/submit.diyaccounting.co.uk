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

// page-chrome.js gives the text in the reader's language; under Node, and without it, the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

const KIND_NAMES = {
  "self-employment": siteText("itsa.self-employment", "Self-employment"),
  "uk-property": siteText("itsa.uk-property", "UK property"),
  "foreign-property": siteText("itsa.foreign-property", "Foreign property"),
};

// The kind of business as it reads mid-sentence.
const KIND_PHRASES = {
  "self-employment": siteText("itsa.kind-phrase-self-employment", "self-employment"),
  "uk-property": siteText("itsa.kind-phrase-uk-property", "UK property"),
  "foreign-property": siteText("itsa.kind-phrase-foreign-property", "foreign property"),
};

const FIELD_LABELS = {
  // Annual adjustments
  "includedNonTaxableProfits": siteText("itsa.field-included-non-taxable-profits", "Included non-taxable profits"),
  "basisAdjustment": siteText("itsa.field-basis-period-adjustment", "Basis period adjustment"),
  "accountingAdjustment": siteText("itsa.field-accounting-adjustment", "Accounting adjustment"),
  "outstandingBusinessIncome": siteText("itsa.field-outstanding-business-income", "Outstanding business income"),
  "balancingChargeBpra": siteText(
    "itsa.field-balancing-charge-business-premises-renovation-allowance",
    "Balancing charge (business premises renovation allowance)",
  ),
  "balancingChargeOther": siteText("itsa.field-balancing-charge-other", "Balancing charge (other)"),
  "goodsAndServicesOwnUse": siteText("itsa.field-goods-and-services-for-own-use", "Goods and services for own use"),
  "transitionProfitAmount": siteText("itsa.field-transition-profit-amount", "Transition profit amount"),
  "transitionProfitAccelerationAmount": siteText(
    "itsa.field-transition-profit-acceleration-amount",
    "Transition profit acceleration amount",
  ),
  "balancingCharge": siteText("itsa.field-balancing-charge", "Balancing charge"),
  "privateUseAdjustment": siteText("itsa.field-private-use-adjustment", "Private use adjustment"),
  "businessPremisesRenovationAllowanceBalancingCharges": siteText(
    "itsa.field-business-premises-renovation-allowance-balancing-charges",
    "Business premises renovation allowance balancing charges",
  ),
  "nonResidentLandlord": siteText("itsa.field-non-resident-landlord", "Non-resident landlord"),
  "rentARoom: jointlyLet": siteText("itsa.field-rent-a-room-jointly-let", "Rent a room: jointly let"),
  // Annual allowances
  "tradingIncomeAllowance": siteText("itsa.field-trading-income-allowance", "Trading income allowance"),
  "propertyIncomeAllowance": siteText("itsa.field-property-income-allowance", "Property income allowance"),
  "annualInvestmentAllowance": siteText("itsa.field-annual-investment-allowance", "Annual investment allowance"),
  "capitalAllowanceMainPool": siteText("itsa.field-capital-allowance-main-pool", "Capital allowance, main pool"),
  "capitalAllowanceSpecialRatePool": siteText("itsa.field-capital-allowance-special-rate-pool", "Capital allowance, special rate pool"),
  "businessPremisesRenovationAllowance": siteText(
    "itsa.field-business-premises-renovation-allowance",
    "Business premises renovation allowance",
  ),
  "enhancedCapitalAllowance": siteText("itsa.field-enhanced-capital-allowance", "Enhanced capital allowance"),
  "allowanceOnSales": siteText("itsa.field-allowance-on-sales", "Allowance on sales"),
  "capitalAllowanceSingleAssetPool": siteText("itsa.field-capital-allowance-single-asset-pool", "Capital allowance, single asset pool"),
  "zeroEmissionsCarAllowance": siteText("itsa.field-zero-emissions-car-allowance", "Zero emissions car allowance"),
  "otherCapitalAllowance": siteText("itsa.field-other-capital-allowance", "Other capital allowance"),
  "costOfReplacingDomesticItems": siteText("itsa.field-cost-of-replacing-domestic-items", "Cost of replacing domestic items"),
  "zeroEmissionsGoodsVehicleAllowance": siteText(
    "itsa.field-zero-emissions-goods-vehicle-allowance",
    "Zero emissions goods vehicle allowance",
  ),
  "electricChargePointAllowance": siteText("itsa.field-electric-charge-point-allowance", "Electric charge point allowance"),
  "periodOfGraceAdjustment": siteText("itsa.field-period-of-grace-adjustment", "Period of grace adjustment"),
  "structuredBuildingAllowance": siteText("itsa.field-structures-and-buildings-allowance", "Structures and Buildings Allowance"),
  "enhancedStructuredBuildingAllowance": siteText(
    "itsa.field-freeport-structures-and-buildings-allowance",
    "Freeport Structures and Buildings Allowance",
  ),
  "firstYear: qualifyingDate": siteText("itsa.field-date-the-building-first-qualified", "Date the building first qualified"),
  "firstYear: qualifyingAmountExpenditure": siteText("itsa.field-qualifying-expenditure", "Qualifying expenditure"),
  // Non-financial details
  "class4NicsExemptionReason": siteText(
    "itsa.field-class-4-national-insurance-exemption-reason",
    "Class 4 National Insurance exemption reason",
  ),
  // Period income
  "turnover": siteText("itsa.field-turnover", "Turnover"),
  "periodAmount": siteText("itsa.field-rental-income", "Rental income"),
  "otherIncome": siteText("itsa.field-other-property-income", "Other property income"),
  // Foreign property period income
  "rentIncome: rentAmount": siteText("itsa.field-rental-income", "Rental income"),
  "rentAmount": siteText("itsa.field-rental-income", "Rental income"),
  "otherPropertyIncome": siteText("itsa.field-other-property-income", "Other property income"),
  "premiumsOfLeaseGrant": siteText("itsa.field-premiums-for-the-grant-of-a", "Premiums for the grant of a lease"),
  "foreignTaxPaidOrDeducted": siteText("itsa.field-foreign-tax-taken-off-or-paid", "Foreign tax taken off or paid"),
  "specialWithholdingTaxOrUkTaxPaid": siteText("itsa.field-uk-tax-taken-off", "UK tax taken off"),
  "foreignTaxCreditRelief": siteText("itsa.field-claim-foreign-tax-credit-relief", "Claim foreign tax credit relief"),
  "broughtFwdResidentialFinancialCost": siteText(
    "itsa.field-unused-residential-finance-costs-brought-forward",
    "Unused residential finance costs brought forward",
  ),
  // Period expenses
  "consolidatedExpenses": siteText("itsa.field-total-expenses", "Total expenses"),
  "costOfGoods": siteText("itsa.field-cost-of-goods", "Cost of goods"),
  "paymentsToSubcontractors": siteText("itsa.field-payments-to-subcontractors", "Payments to subcontractors"),
  "wagesAndStaffCosts": siteText("itsa.field-wages-salaries-and-other-staff-costs", "Wages, salaries and other staff costs"),
  "carVanTravelExpenses": siteText("itsa.field-car-van-and-travel-expenses", "Car, van and travel expenses"),
  "premisesRunningCosts": siteText("itsa.field-rent-rates-power-and-insurance-costs", "Rent, rates, power and insurance costs"),
  "maintenanceCosts": siteText("itsa.field-repairs-and-renewals-of-property-and", "Repairs and renewals of property and equipment"),
  "adminCosts": siteText("itsa.field-phone-fax-stationery-and-other-office", "Phone, fax, stationery and other office costs"),
  "businessEntertainmentCosts": siteText("itsa.field-business-entertainment-costs", "Business entertainment costs"),
  "advertisingCosts": siteText("itsa.field-advertising-costs", "Advertising costs"),
  "interestOnBankOtherLoans": siteText("itsa.field-interest-on-bank-and-other-loans", "Interest on bank and other loans"),
  "financeCharges": siteText("itsa.field-bank-credit-card-and-other-financial", "Bank, credit card and other financial charges"),
  "irrecoverableDebts": siteText("itsa.field-irrecoverable-debts-written-off", "Irrecoverable debts written off"),
  "professionalFees": siteText(
    "itsa.field-accountancy-legal-and-other-professional-fees",
    "Accountancy, legal and other professional fees",
  ),
  "depreciation": siteText("itsa.field-depreciation-and-loss-profit-on-sales", "Depreciation and loss/profit on sales of assets"),
  "otherExpenses": siteText("itsa.field-other-expenses", "Other expenses"),
  "repairsAndMaintenance": siteText("itsa.field-repairs-and-maintenance", "Repairs and maintenance"),
  "financialCosts": siteText("itsa.field-financial-costs", "Financial costs"),
  "costOfServices": siteText("itsa.field-cost-of-services", "Cost of services"),
  "residentialFinancialCost": siteText("itsa.field-residential-financial-costs", "Residential financial costs"),
  "residentialFinancialCostsCarriedForward": siteText(
    "itsa.field-residential-financial-costs-carried-forward",
    "Residential financial costs carried forward",
  ),
  "travelCosts": siteText("itsa.field-travel-costs", "Travel costs"),
  // Losses and claims
  "broughtForwardLosses": siteText("itsa.field-losses-brought-forward", "Losses brought forward"),
  "carryForward: currentYearLosses": siteText("itsa.field-this-year-s-loss-carried-forward", "This year's loss carried forward"),
  "carryForward: previousYearsLosses": siteText("itsa.field-earlier-years-losses-carried-forward", "Earlier years' losses carried forward"),
  "carrySideways: currentYearGeneralIncome": siteText("itsa.field-set-against-this-year-s-other", "Set against this year's other income"),
  "carryBack: previousYearGeneralIncome": siteText(
    "itsa.field-carried-back-against-the-previous-year",
    "Carried back against the previous year's income",
  ),
  "carryBack: earlyYearLosses": siteText("itsa.field-early-year-losses-carried-back", "Early year losses carried back"),
  "carryBack: terminalLosses": siteText("itsa.field-terminal-losses-carried-back", "Terminal losses carried back"),
  "preferenceOrder: applyFirst": siteText("itsa.field-applies-first", "Applies first"),
  // Tax liability adjustments
  "carryBackLossesDecrease: incomeTax": siteText("itsa.field-income-tax-decreased", "Income tax decreased"),
  "carryBackLossesDecrease: class4": siteText("itsa.field-class-4-national-insurance-decreased", "Class 4 National Insurance decreased"),
  "carryBackLossesDecrease: capitalGainsTax": siteText("itsa.field-capital-gains-tax-decreased", "Capital gains tax decreased"),
};

// The building a Structures and Buildings Allowance claim names: text, not a figure.
const BUILDING_TEXT_KEYS = ["name", "number", "postcode"];

const CLAIM_ORDER_LABELS = {
  "carry-sideways": siteText("itsa.field-carry-sideways-first", "Carry sideways first"),
  "carry-back": siteText("itsa.field-carry-back-first", "Carry back first"),
};

const EXEMPTION_REASON_LABELS = {
  "non-resident": siteText("itsa.field-non-resident", "Non-resident"),
  "trustee": siteText("itsa.field-trustee", "Trustee"),
  "diver": siteText("itsa.field-diver", "Diver"),
  "over-state-pension-age": siteText("itsa.field-over-state-pension-age", "Over State Pension age"),
};

const ANNUAL_SECTIONS = [
  {
    key: "adjustments",
    heading: siteText("itsa.adjustments", "Adjustments"),
    explanation: siteText(
      "itsa.record-explain-adjustments",
      "These are the adjustments to the year's profit that you sent. A figure you left at 0 was not sent, so it does not appear.",
    ),
    none: siteText("itsa.record-no-adjustments", "You sent no adjustments for this year."),
  },
  {
    key: "allowances",
    heading: siteText("itsa.allowances", "Allowances"),
    explanation: siteText(
      "itsa.record-explain-allowances-claimed",
      "These are the allowances you claimed for the year. HMRC accepts the trading or property income allowance, or the itemised allowances, but not both.",
    ),
    none: siteText("itsa.record-no-allowances-sent", "You sent no allowances for this year."),
  },
  {
    key: "nonFinancials",
    heading: siteText("itsa.other-details", "Other details"),
    explanation: siteText(
      "itsa.record-explain-other-details",
      "These details do not change the amounts. HMRC uses them to apply the right rules to the year.",
    ),
    none: siteText("itsa.record-no-other-details", "You sent no other details for this year."),
  },
];

function kindPhrase(kind) {
  return KIND_PHRASES[kind] || siteText("itsa.kind-phrase-business", "business");
}

function taxYearTitle(year) {
  return year ? siteText("itsa.record-tax-year", "Tax year {year}", { year }) : siteText("itsa.tax-year", "Tax year");
}

function savedLine(saved) {
  return saved
    ? siteText("itsa.record-saved-on", "Saved with HMRC on {date}", { date: saved })
    : siteText("itsa.record-saved", "Saved with HMRC");
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
      return value.flatMap((item, index) =>
        collectEntries(item, [...path, key, siteText("itsa.record-claim-n", "Claim {n}", { n: index + 1 })]),
      );
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
  if (typeof value === "boolean") return textCell(value ? siteText("widget.yes", "Yes") : siteText("widget.no", "No"));
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
  if (formattedNino)
    lines.push(siteText("itsa.record-nino", "National Insurance number {nino}", { nino: escapeRecordText(formattedNino) }));
  const id = nonEmptyText(businessId);
  if (id) lines.push(siteText("itsa.record-business-id", "Business ID {id}", { id: escapeRecordText(id) }));
  const hmrcCorrelationId = nonEmptyText(correlationId);
  if (hmrcCorrelationId) {
    lines.push(siteText("itsa.record-correlation-id", "HMRC correlation ID {id}", { id: escapeRecordText(hmrcCorrelationId) }));
  }
  return lines;
}

// One adjustments table and one allowances table for each entry of a foreign property annual
// submission: the EEA furnished holiday lettings (2024-25 and before) and each country or property.
function foreignAnnualSections(entries, columnHeading, recordHead) {
  if (entries.length === 0) {
    return [
      {
        heading: siteText("itsa.record-adjustments-and-allowances", "Adjustments and allowances"),
        explanation: siteText("itsa.record-explain-adjustments-and-allowances", "These are the adjustments and allowances you sent."),
        recordHtml: `${recordHead}<p class="no-data">${siteText("itsa.record-no-adjustments-or-allowances", "You sent no adjustments or allowances for this year.")}</p>`,
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
        heading: siteText("itsa.record-entry-adjustments", "{name}: adjustments", { name }),
        explanation:
          index === 0
            ? siteText(
                "itsa.record-explain-foreign-adjustments",
                "These are the adjustments to the year's profit that you sent, one table for each country or property. A figure you left at 0 was not sent, so it does not appear.",
              )
            : "",
        recordHtml:
          (index === 0 ? recordHead : "") +
          table(
            entry.adjustments,
            `annual-${entry.id}-adjustments`,
            siteText("itsa.record-no-adjustments-for", "You sent no adjustments for {name}.", { name }),
          ),
      },
      {
        heading: siteText("itsa.record-entry-allowances", "{name}: allowances", { name }),
        explanation:
          index === 0
            ? siteText(
                "itsa.record-explain-foreign-allowances",
                "These are the allowances you claimed for the year. HMRC accepts the property income allowance or the itemised allowances, but not both.",
              )
            : "",
        recordHtml: table(
          entry.allowances,
          `annual-${entry.id}-allowances`,
          siteText("itsa.record-no-allowances-for", "You sent no allowances for {name}.", { name }),
        ),
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
  const kindName = KIND_NAMES[kind] || siteText("itsa.business", "Business");
  const groups = isRecordObject(sent) ? sent : {};
  const columnHeading = year || siteText("widget.field-amount", "Amount");

  const recordHead = recordHeading({
    nameHtml: escapeRecordText(siteText("itsa.record-annual-name", "{kind} annual submission", { kind: kindName })),
    referenceHtml: referenceLines({ nino, businessId, correlationId }),
    title: taxYearTitle(year),
    subtitleHtml: escapeRecordText(savedLine(saved)),
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
              : `<p class="no-data">${escapeRecordText(section.none)}</p>`;
          return {
            heading: section.heading,
            explanation: section.explanation,
            recordHtml: (index === 0 ? recordHead : "") + body,
          };
        });

  return customerCopyHtml({
    title: year
      ? siteText("itsa.record-annual-copy-year", "Your copy of the {kind} annual submission for {year}", { kind: kindPhrase(kind), year })
      : siteText("itsa.record-annual-copy", "Your copy of the {kind} annual submission", { kind: kindPhrase(kind) }),
    reference: { label: siteText("itsa.business-id", "Business ID"), value: nonEmptyText(businessId) || ABSENT },
    status: { kind: "accepted", text: siteText("itsa.accepted-by-hmrc", "Accepted by HMRC") },
    date: saved || siteText("itsa.record-not-recorded", "Not recorded"),
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
    return {
      income: period.ukProperty.income,
      expenses: period.ukProperty.expenses,
      propertyType: siteText("itsa.uk-property", "UK property"),
    };
  }
  if (isRecordObject(period.ukFhlProperty)) {
    return {
      income: period.ukFhlProperty.income,
      expenses: period.ukFhlProperty.expenses,
      propertyType: siteText("itsa.furnished-holiday-letting", "Furnished holiday letting"),
    };
  }
  if (isRecordObject(period.ukNonFhlProperty)) {
    return {
      income: period.ukNonFhlProperty.income,
      expenses: period.ukNonFhlProperty.expenses,
      propertyType: siteText("itsa.uk-property", "UK property"),
    };
  }
  return { income: period.periodIncome, expenses: period.periodExpenses, propertyType: null };
}

const KNOWN_INCOME_KEYS = {
  "self-employment": ["turnover", "other"],
  "uk-property": ["periodAmount", "otherIncome"],
};

const INCOME_LABEL_OVERRIDES = {
  "self-employment": { other: siteText("itsa.field-other-income", "Other income") },
  "uk-property": {},
};

const PROPERTY_EXPENSE_LABELS = {
  premisesRunningCosts: siteText("itsa.field-rent-rates-insurance-and-ground-rent", "Rent, rates, insurance and ground rent"),
  financialCosts: siteText("itsa.field-loan-interest-and-other-financial-costs", "Loan interest and other financial costs"),
  professionalFees: siteText("itsa.field-legal-management-and-other-professional-fees", "Legal, management and other professional fees"),
  costOfServices: siteText("itsa.field-costs-of-services-provided-including-wages", "Costs of services provided, including wages"),
  other: siteText("itsa.field-other-property-expenses", "Other property expenses"),
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
    entries.push({ id: "fhl", name: siteText("itsa.fhl-eea", "Furnished holiday lettings in the EEA"), ...period.foreignFhlEea });
  }
  const list = [period.foreignNonFhlProperty, period.foreignProperty].find(Array.isArray) || [];
  list.forEach((entry, index) => {
    if (!isRecordObject(entry)) return;
    let name = siteText("itsa.record-entry-n", "Entry {n}", { n: index + 1 });
    if (nonEmptyText(entry.countryCode)) name = globalThis.countryCodes?.countryName(entry.countryCode) ?? entry.countryCode;
    else if (nonEmptyText(entry.propertyId)) name = siteText("itsa.record-property-id", "Property {id}", { id: entry.propertyId });
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
        heading: siteText("itsa.income", "Income"),
        explanation: siteText("itsa.record-explain-income-and-expenses", "This is the income and expenses HMRC holds for the period."),
        recordHtml: `${firstSectionPrefix}<p class="no-data">${siteText("itsa.record-no-figures", "HMRC holds no figures for this period.")}</p>`,
      },
    ];
  }
  return entries.flatMap((entry, index) => {
    const incomeEntries = collectEntries(entry.income);
    const expenseEntries = collectEntries(entry.expenses);
    return [
      {
        heading: siteText("itsa.record-entry-income", "{name}: income", { name: entry.name }),
        explanation:
          index === 0
            ? siteText(
                "itsa.record-explain-foreign-income",
                "This is the income HMRC holds for the period, one table for each country or property. A cumulative year shows the running total from the start of the tax year.",
              )
            : "",
        recordHtml:
          (index === 0 ? firstSectionPrefix : "") +
          (incomeEntries.length > 0
            ? periodTable(columnHeading, incomeEntries, `period-${entry.id}-income`, {})
            : `<p class="no-data">${siteText("itsa.record-no-income-for", "HMRC holds no income for {name}.", { name: escapeRecordText(entry.name) })}</p>`),
      },
      {
        heading: siteText("itsa.record-entry-expenses", "{name}: expenses", { name: entry.name }),
        explanation:
          index === 0
            ? siteText(
                "itsa.record-explain-foreign-expenses",
                "HMRC holds either one total or the itemised costs for each country or property.",
              )
            : "",
        recordHtml:
          expenseEntries.length > 0
            ? periodTable(columnHeading, expenseEntries, `period-${entry.id}-expenses`, PROPERTY_EXPENSE_LABELS)
            : `<p class="no-data">${siteText("itsa.record-no-expenses-for", "HMRC holds no expenses for {name}.", { name: escapeRecordText(entry.name) })}</p>`,
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
export function periodCopyHtml({ kind, period, nino, businessId, taxYear, periodId, idLabel, retrievedAt, links = [] }) {
  const kindName = KIND_NAMES[kind] || siteText("itsa.business", "Business");
  const year = nonEmptyText(taxYear);
  const retrieved = formatTimestamp(retrievedAt);
  const { from, to } = periodDates(period);
  const { income, expenses, propertyType } = periodGroups(period);
  let periodLine = null;
  if (from && to) periodLine = siteText("widget.date-range", "{start} to {end}", { start: from, end: to });
  else if (to) periodLine = siteText("itsa.record-year-to", "Year to {date}", { date: to });
  const reference = nonEmptyText(periodId) || siteText("itsa.record-year-to-date", "Year to date");
  const referenceLabel = nonEmptyText(periodId)
    ? idLabel || siteText("itsa.period-id", "Period ID")
    : siteText("itsa.record-reporting", "Reporting");

  const referenceHtml = referenceLines({ nino, businessId });
  referenceHtml.push(`${referenceLabel} ${escapeRecordText(reference)}`);

  const recordHead = recordHeading({
    nameHtml: escapeRecordText(siteText("itsa.record-quarterly-name", "{kind} quarterly update", { kind: kindName })),
    referenceHtml,
    title: taxYearTitle(year),
    subtitleHtml: escapeRecordText(
      [periodLine, propertyType].filter(Boolean).join(". ") || siteText("itsa.record-period-held", "Period summary held by HMRC"),
    ),
  });

  const columnHeading = periodLine || year || siteText("widget.field-amount", "Amount");
  const heldBy = { kind: "held", text: siteText("itsa.record-held-by-hmrc", "Held by HMRC") };
  const retrievedLine = retrieved
    ? siteText("itsa.record-retrieved", "Retrieved {date}", { date: retrieved })
    : siteText("itsa.record-not-recorded", "Not recorded");
  const title = periodLine
    ? siteText("itsa.record-update-copy-period", "Your copy of the {kind} update for {period}", {
        kind: kindPhrase(kind),
        period: periodLine,
      })
    : siteText("itsa.record-update-copy", "Your copy of the {kind} update", { kind: kindPhrase(kind) });

  if (kind === "foreign-property") {
    return customerCopyHtml({
      title,
      reference: { label: referenceLabel, value: reference },
      status: heldBy,
      date: retrievedLine,
      sections: foreignPeriodSections(period, columnHeading, recordHead),
      links,
    });
  }

  const expenseEntries = collectEntries(expenses);

  return customerCopyHtml({
    title,
    reference: { label: referenceLabel, value: reference },
    status: heldBy,
    date: retrievedLine,
    sections: [
      {
        heading: siteText("itsa.income", "Income"),
        explanation: siteText(
          "itsa.record-explain-income",
          "This is the income HMRC holds for the period. A dash means HMRC holds no figure. A cumulative year shows the running total from the start of the tax year.",
        ),
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
        heading: siteText("itsa.expenses", "Expenses"),
        explanation: siteText(
          "itsa.record-explain-expenses",
          "These are the expenses HMRC holds for the period. HMRC holds either one total or the itemised costs.",
        ),
        recordHtml:
          expenseEntries.length > 0
            ? periodTable(columnHeading, expenseEntries, "period-expenses", EXPENSE_LABEL_OVERRIDES[kind] || {})
            : `<p class="no-data">${siteText("itsa.record-no-expenses", "HMRC holds no expenses for this period.")}</p>`,
      },
    ],
    links,
  });
}

const LOSSES_SECTIONS = [
  {
    heading: siteText("itsa.losses", "Losses"),
    explanation: siteText(
      "itsa.record-explain-losses",
      "These are the losses you told HMRC about for the year. A figure you left at 0 was not sent, so it does not appear.",
    ),
    none: siteText("itsa.record-no-losses", "You sent no losses for this year."),
    prefix: "losses",
  },
  {
    heading: siteText("itsa.claims", "Claims"),
    explanation: siteText(
      "itsa.record-explain-claims",
      "These are the claims you made for the year. A loss can carry forward, be set against this year's other income, or be carried back to an earlier year.",
    ),
    none: siteText("itsa.record-no-claims", "You sent no claims for this year."),
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
  const kindName = KIND_NAMES[kind] || siteText("itsa.business", "Business");
  const groups = isRecordObject(sent) ? sent : {};
  const columnHeading = year || siteText("widget.field-amount", "Amount");

  const recordHead = recordHeading({
    nameHtml: escapeRecordText(siteText("itsa.record-losses-name", "{kind} losses and claims", { kind: kindName })),
    referenceHtml: referenceLines({ nino, businessId, correlationId }),
    title: taxYearTitle(year),
    subtitleHtml: escapeRecordText(savedLine(saved)),
  });

  const sections = LOSSES_SECTIONS.map((section, index) => {
    const group = section.prefix === "losses" ? groups.losses : groups.claims;
    const entries = collectEntries(group);
    const body =
      entries.length > 0
        ? entriesTable(columnHeading, entries, `losses-${section.prefix}`)
        : `<p class="no-data">${escapeRecordText(section.none)}</p>`;
    return {
      heading: section.heading,
      explanation: section.explanation,
      recordHtml: (index === 0 ? recordHead : "") + body,
    };
  });

  return customerCopyHtml({
    title: year
      ? siteText("itsa.record-losses-copy-year", "Your copy of the {kind} losses and claims for {year}", { kind: kindPhrase(kind), year })
      : siteText("itsa.record-losses-copy", "Your copy of the {kind} losses and claims", { kind: kindPhrase(kind) }),
    reference: { label: siteText("itsa.business-id", "Business ID"), value: nonEmptyText(businessId) || ABSENT },
    status: { kind: "accepted", text: siteText("itsa.accepted-by-hmrc", "Accepted by HMRC") },
    date: saved || siteText("itsa.record-not-recorded", "Not recorded"),
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
  const columnHeading = year || siteText("widget.field-amount", "Amount");
  const entries = collectEntries({ carryBackLossesDecrease }).filter((entry) => entry.value !== undefined);

  const recordHead = recordHeading({
    nameHtml: escapeRecordText(siteText("itsa.tax-liability-adjustments", "Tax liability adjustments")),
    referenceHtml: referenceLines({ nino, correlationId }),
    title: taxYearTitle(year),
    subtitleHtml: escapeRecordText(savedLine(saved)),
  });

  const body =
    entries.length > 0
      ? entriesTable(columnHeading, entries, "adjustments")
      : `<p class="no-data">${siteText("itsa.record-no-carry-back", "You sent no carry-back decrease for this year.")}</p>`;

  return customerCopyHtml({
    title: year
      ? siteText("itsa.record-adjustments-copy-year", "Your copy of the tax liability adjustments for {year}", { year })
      : siteText("itsa.record-adjustments-copy", "Your copy of the tax liability adjustments"),
    reference: { label: siteText("itsa.tax-year", "Tax year"), value: year || ABSENT },
    status: { kind: "accepted", text: siteText("itsa.accepted-by-hmrc", "Accepted by HMRC") },
    date: saved || siteText("itsa.record-not-recorded", "Not recorded"),
    sections: [
      {
        heading: siteText("itsa.record-carry-back-decrease", "Carry-back decrease"),
        explanation: siteText(
          "itsa.record-explain-carry-back",
          "These are the amounts by which your carry-back claim decreases the tax due for this earlier year. A figure you left at 0 was not sent, so it does not appear.",
        ),
        recordHtml: recordHead + body,
      },
    ],
    links,
  });
}
