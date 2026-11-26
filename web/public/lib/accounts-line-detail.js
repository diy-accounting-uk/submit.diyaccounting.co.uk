// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/accounts-line-detail.js
// The micro-entity and small company accounts pages' lines with what the CT600's accounts section
// shows for the same lines: the statutory label led by its format item, the note with its link to
// the Regulations, and the "In DIY Accounting's spreadsheets" disclosure. A line the CT600 also has
// takes its register entry from ct600-fields.js; the lines only these pages have are defined here
// from the formats of Schedule 1 to the Small Companies Regulations. A row shows the note and the
// disclosure once, on this year's figure.

import { BALANCE_SHEET_FIELDS, MICRO_BALANCE_SHEET_FIELDS, PROFIT_AND_LOSS_FIELDS, REGULATIONS_URL } from "./ct600-fields.js";
import { labelWithReference, noteOf, sourceDisclosure } from "./field-detail.js";

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

const byId = (fields) => Object.fromEntries(fields.map((field) => [field.id, field]));

function line(id, label, hint, reference) {
  return { id, label, hint, reference, termSource: REGULATIONS_URL };
}

export const MICRO_PAGE_LINES = {
  ...byId(MICRO_BALANCE_SHEET_FIELDS),
  calledUpShareCapitalNotPaid: line(
    "calledUpShareCapitalNotPaid",
    siteText("accounts-line.called-up-share-capital-not-paid", "Called up share capital not paid"),
    siteText(
      "accounts-line.called-up-share-capital-not-paid-hint",
      "Share capital the company has called up and the members have not yet paid.",
    ),
    "μBS1 A",
  ),
  prepaymentsAccruedIncome: line(
    "prepaymentsAccruedIncome",
    siteText("accounts-line.prepayments-accrued-income", "Prepayments and accrued income"),
    siteText(
      "accounts-line.prepayments-accrued-income-hint",
      "Costs paid in this period for a later one, and income earned in this period and not yet invoiced.",
    ),
    "μBS1 D",
  ),
  provisionsForLiabilities: line(
    "provisionsForLiabilities",
    siteText("accounts-line.provisions-for-liabilities", "Provisions for liabilities"),
    siteText(
      "accounts-line.provisions-for-liabilities-hint",
      "Amounts set aside for a liability whose amount or date is not yet certain, such as deferred tax.",
    ),
    "μBS1 I",
  ),
  accrualsDeferredIncome: line(
    "accrualsDeferredIncome",
    siteText("accounts-line.accruals-deferred-income", "Accruals and deferred income"),
    siteText(
      "accounts-line.accruals-deferred-income-hint",
      "Costs of this period not yet invoiced, and income received in this period for a later one.",
    ),
    "μBS1 J",
  ),
  capitalAndReserves: line(
    "capitalAndReserves",
    siteText("accounts-line.capital-and-reserves", "Capital and reserves"),
    siteText(
      "accounts-line.capital-and-reserves-hint",
      "Called up share capital plus the profit and loss account. It equals the net assets.",
    ),
    "μBS1 K",
  ),
};

const smallProfitAndLoss = byId(PROFIT_AND_LOSS_FIELDS);

export const SMALL_PAGE_LINES = {
  ...smallProfitAndLoss,
  ...byId(BALANCE_SHEET_FIELDS),
  interestReceivable: { ...smallProfitAndLoss.interestReceivable, referenceInFormat2: "PL2 12" },
  tax: { ...smallProfitAndLoss.tax, referenceInFormat2: "PL2 15" },
  changeInStocks: line(
    "changeInStocks",
    siteText("accounts-line.change-in-stocks", "Change in stocks of finished goods and in work in progress"),
    siteText(
      "accounts-line.change-in-stocks-hint",
      "Closing stocks of finished goods and work in progress less opening stocks. A fall is a minus figure.",
    ),
    "PL2 2",
  ),
  ownWorkCapitalised: line(
    "ownWorkCapitalised",
    siteText("accounts-line.own-work-capitalised", "Own work capitalised"),
    siteText("accounts-line.own-work-capitalised-hint", "The cost of work the company did on its own fixed assets, added to their cost."),
    "PL2 3",
  ),
  otherOperatingIncome: line(
    "otherOperatingIncome",
    siteText("accounts-line.other-operating-income", "Other operating income"),
    siteText(
      "accounts-line.other-operating-income-hint",
      "Income from the company's operations other than its sales, such as rent received or grants.",
    ),
    "PL2 4",
  ),
  rawMaterialsConsumables: line(
    "rawMaterialsConsumables",
    siteText("accounts-line.raw-materials-consumables", "Raw materials and consumables"),
    siteText("accounts-line.raw-materials-consumables-hint", "The cost of materials and consumables used in the period."),
    "PL2 5(a)",
  ),
  otherExternalCharges: line(
    "otherExternalCharges",
    siteText("accounts-line.other-external-charges", "Other external charges"),
    siteText(
      "accounts-line.other-external-charges-hint",
      "Other costs bought in from outside the company, such as subcontractors and rent.",
    ),
    "PL2 5(b)",
  ),
  staffCosts: line(
    "staffCosts",
    siteText("accounts-line.staff-costs", "Staff costs"),
    siteText("accounts-line.staff-costs-hint", "Wages and salaries, employer's National Insurance and pension contributions."),
    "PL2 6",
  ),
  depreciation: line(
    "depreciation",
    siteText("accounts-line.depreciation", "Depreciation and other amounts written off tangible and intangible fixed assets"),
    siteText("accounts-line.depreciation-hint", "The depreciation and amortisation charged on the company's fixed assets in the period."),
    "PL2 7(a)",
  ),
  otherOperatingExpenses: line(
    "otherOperatingExpenses",
    siteText("accounts-line.other-operating-expenses", "Other operating expenses"),
    siteText("accounts-line.other-operating-expenses-hint", "Every other cost of running the company in the period."),
    "PL2 8",
  ),
  interestPayable: line(
    "interestPayable",
    siteText("accounts-line.interest-payable", "Interest payable and similar expenses"),
    siteText("accounts-line.interest-payable-hint", "Interest the company paid on loans and overdrafts."),
    "PL2 14",
  ),
  tradeDebtors: line(
    "tradeDebtors",
    siteText("accounts-line.trade-debtors", "Of which, trade debtors"),
    siteText("accounts-line.trade-debtors-hint", "The part of debtors that customers owe for sales."),
    "BS1 C.II.1",
  ),
  otherDebtors: line(
    "otherDebtors",
    siteText("accounts-line.other-debtors", "Of which, other debtors"),
    siteText("accounts-line.other-debtors-hint", "Any other amount owed to the company."),
    "BS1 C.II.3",
  ),
  prepayments: line(
    "prepayments",
    siteText("accounts-line.prepayments", "Of which, prepayments and accrued income"),
    siteText(
      "accounts-line.prepayments-hint",
      "Costs paid in this period for a later one, and income earned and not yet invoiced, shown within debtors.",
    ),
    "BS1 D",
  ),
  accruals: line(
    "accruals",
    siteText("accounts-line.accruals", "Accruals (due within one year)"),
    siteText("accounts-line.accruals-hint", "Costs of this period not yet invoiced, shown within the creditors due within 12 months."),
    "BS1 E.4",
  ),
  amountsOwedToDirectors: line(
    "amountsOwedToDirectors",
    siteText("accounts-line.amounts-owed-to-directors", "Of which, amounts owed to directors"),
    siteText("accounts-line.amounts-owed-to-directors-hint", "The part of those amounts the company owes its directors."),
    "BS1 H.4",
  ),
  amountsOwedToGroupUndertakings: line(
    "amountsOwedToGroupUndertakings",
    siteText("accounts-line.amounts-owed-to-group-undertakings", "Of which, amounts owed to group undertakings"),
    siteText(
      "accounts-line.amounts-owed-to-group-undertakings-hint",
      "The part of those amounts the company owes to companies in its group.",
    ),
    "BS1 H.3",
  ),
  provisionsForLiabilities: line(
    "provisionsForLiabilities",
    siteText("accounts-line.provisions-for-liabilities", "Provisions for liabilities"),
    siteText(
      "accounts-line.provisions-for-liabilities-hint",
      "Amounts set aside for a liability whose amount or date is not yet certain, such as deferred tax.",
    ),
    "BS1 I",
  ),
};

const FIGURE_ID = /^(current|prior)([A-Z]\w*)$/;

/** The line a ledger row holds, by its figure's id, with the reference of the profit and loss format chosen. */
export function lineOfRow(row, lines, format) {
  const input = row.querySelector("input[id]");
  const match = FIGURE_ID.exec(input?.id ?? "");
  if (!match) return null;
  const id = match[2].charAt(0).toLowerCase() + match[2].slice(1);
  const found = lines[id];
  if (!found) throw new Error(`No register entry for the accounts line ${id}`);
  const year = match[1];
  return { year, line: format === "2" && found.referenceInFormat2 ? { ...found, reference: found.referenceInFormat2 } : found };
}

/**
 * Give each ledger row of the page its referenced label and, on this year's figure, its note and
 * disclosure. A row's heading keeps the plain label in data-line-label for the prior-year fill to name.
 */
export function renderAccountsLines(doc, lines, format) {
  const optional = siteText("ch.prior.optional-qualifier", "(optional)");
  for (const heading of doc.querySelectorAll("table.ledger tbody th[scope='row']")) {
    const found = lineOfRow(heading.closest("tr"), lines, format);
    if (!found) continue;
    const { year, line: entry } = found;
    const wasOptional = heading.dataset.optional === "true" || heading.textContent.trim().endsWith(optional);
    heading.dataset.optional = String(wasOptional);
    heading.dataset.lineLabel = entry.label;
    const label = labelWithReference(entry);
    const id = `line${entry.id.charAt(0).toUpperCase()}${entry.id.slice(1)}${year === "prior" ? "Prior" : ""}`;
    const children = [doc.createElement("span")];
    children[0].className = "line-label";
    children[0].textContent = wasOptional ? `${label} ${optional}` : label;
    if (year === "current") children.push(noteOf(entry, id), sourceDisclosure(entry, { id }));
    const open = heading.querySelector("details[open]");
    heading.replaceChildren(...children);
    if (open) heading.querySelector("details").open = true;
  }
}

function chosenFormat(doc) {
  return doc.querySelector('input[name="profitAndLossFormat"]:checked')?.value ?? "1";
}

if (typeof document !== "undefined") {
  const small = Boolean(document.getElementById("profitAndLossFormat1"));
  const lines = small ? SMALL_PAGE_LINES : MICRO_PAGE_LINES;
  renderAccountsLines(document, lines, chosenFormat(document));
  for (const radio of document.querySelectorAll('input[name="profitAndLossFormat"]')) {
    radio.addEventListener("change", () => renderAccountsLines(document, lines, chosenFormat(document)));
  }
}
