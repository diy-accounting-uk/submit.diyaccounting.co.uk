// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/self-employment-expenses.js
// The expense fields of a self-employment period summary. HMRC takes either the itemised
// expenses or one consolidatedExpenses figure, never both; the disallowable breakdown goes with
// the itemised expenses and has no total of its own. The fields come from HMRC's Self
// Employment Business (MTD) 5.0 period summary schema (reference/hmrc-mtd-self-employment-business-api-5.0.yaml).

(function () {
  "use strict";

  // page-chrome.js gives the text in the chosen language; without it the English stands.
  function siteText(id, english, values) {
    if (window.siteText) return window.siteText(id, english, values);
    return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
  }

  const CONSOLIDATED_FIELD = "consolidatedExpenses";

  // costOfGoods and otherExpenses are always sent, as the form has always sent them.
  const ALWAYS_SENT = ["costOfGoods", "otherExpenses"];

  const ITEMISED_FIELDS = [
    { id: "costOfGoods", label: siteText("itsa.field-cost-of-goods", "Cost of goods") },
    { id: "paymentsToSubcontractors", label: siteText("itsa.field-payments-to-subcontractors", "Payments to subcontractors") },
    {
      id: "wagesAndStaffCosts",
      label: siteText("itsa.field-wages-salaries-and-other-staff-costs", "Wages, salaries and other staff costs"),
    },
    { id: "carVanTravelExpenses", label: siteText("itsa.field-car-van-and-travel-expenses", "Car, van and travel expenses") },
    {
      id: "premisesRunningCosts",
      label: siteText("itsa.field-rent-rates-power-and-insurance-costs", "Rent, rates, power and insurance costs"),
    },
    {
      id: "maintenanceCosts",
      label: siteText("itsa.field-repairs-and-renewals-of-property-and", "Repairs and renewals of property and equipment"),
    },
    {
      id: "adminCosts",
      label: siteText("itsa.field-phone-fax-stationery-and-other-office", "Phone, fax, stationery and other office costs"),
    },
    { id: "businessEntertainmentCosts", label: siteText("itsa.field-business-entertainment-costs", "Business entertainment costs") },
    { id: "advertisingCosts", label: siteText("itsa.field-advertising-costs", "Advertising costs") },
    { id: "interestOnBankOtherLoans", label: siteText("itsa.field-interest-on-bank-and-other-loans", "Interest on bank and other loans") },
    {
      id: "financeCharges",
      label: siteText("itsa.field-bank-credit-card-and-other-financial", "Bank, credit card and other financial charges"),
    },
    { id: "irrecoverableDebts", label: siteText("itsa.field-irrecoverable-debts-written-off", "Irrecoverable debts written off") },
    {
      id: "professionalFees",
      label: siteText("itsa.field-accountancy-legal-and-other-professional-fees", "Accountancy, legal and other professional fees"),
    },
    {
      id: "depreciation",
      label: siteText("itsa.field-depreciation-and-loss-profit-on-sales", "Depreciation and loss/profit on sales of assets"),
    },
    { id: "otherExpenses", label: siteText("itsa.field-other-expenses", "Other expenses") },
  ];

  const ITEMISED_IDS = ITEMISED_FIELDS.map((field) => field.id);
  const EXPENSE_IDS = [...ITEMISED_IDS, CONSOLIDATED_FIELD];

  // Each itemised expense has a disallowable counterpart named by adding "Disallowable".
  const DISALLOWABLE_FIELDS = ITEMISED_FIELDS.map((field) => ({
    id: `${field.id}Disallowable`,
    itemisedId: field.id,
    label: siteText("itsa.se-disallowable-part", "{label}: part that cannot be claimed", { label: field.label }),
  }));
  const DISALLOWABLE_IDS = DISALLOWABLE_FIELDS.map((field) => field.id);

  function isFilled(text) {
    return String(text ?? "").trim() !== "";
  }

  // read(id) gives what the customer typed. parse(text) gives a number or null.
  // Returns { periodExpenses, periodDisallowableExpenses } or { problem }.
  function buildPeriodExpenses(read, parse) {
    const consolidatedText = read(CONSOLIDATED_FIELD);
    const isNonZero = (id) => isFilled(read(id)) && parse(read(id)) !== 0;
    const itemisedFilled = ITEMISED_IDS.filter(isNonZero);
    const disallowableFilled = DISALLOWABLE_IDS.filter(isNonZero);
    if (isFilled(consolidatedText)) {
      if (itemisedFilled.length > 0) {
        return {
          problem: siteText(
            "itsa.se-total-or-itemised",
            "Enter either the total expenses or the itemised expenses, not both. Clear one of them.",
          ),
        };
      }
      if (disallowableFilled.length > 0) {
        return {
          problem: siteText(
            "itsa.se-disallowable-with-itemised",
            "The disallowable expenses go with the itemised expenses, not with the total expenses. Clear them or itemise the expenses.",
          ),
        };
      }
      return { periodExpenses: { [CONSOLIDATED_FIELD]: parse(consolidatedText) ?? 0 }, periodDisallowableExpenses: {} };
    }
    const periodExpenses = {};
    ITEMISED_IDS.forEach((id) => {
      if (ALWAYS_SENT.includes(id) || isFilled(read(id))) periodExpenses[id] = parse(read(id)) ?? 0;
    });
    const periodDisallowableExpenses = {};
    DISALLOWABLE_IDS.filter((id) => isFilled(read(id))).forEach((id) => {
      periodDisallowableExpenses[id] = parse(read(id)) ?? 0;
    });
    return { periodExpenses, periodDisallowableExpenses };
  }

  function moneyInput(field, hintId) {
    const prefixed = document.createElement("div");
    prefixed.className = "input-prefix input-prefix--amount";
    const prefix = document.createElement("span");
    prefix.className = "prefix";
    prefix.setAttribute("aria-hidden", "true");
    prefix.textContent = "£";
    const input = document.createElement("input");
    input.type = "text";
    input.id = field.id;
    input.name = field.id;
    input.value = field.defaultValue ?? "";
    input.setAttribute("aria-describedby", hintId);
    input.setAttribute("inputmode", "decimal");
    input.setAttribute("data-money", "pounds-and-pence");
    if (field.min !== undefined) input.setAttribute("data-money-min", String(field.min));
    if (field.required) input.required = true;
    prefixed.append(prefix, input);
    return prefixed;
  }

  function moneyGroup(field, hint) {
    const group = document.createElement("div");
    group.className = "form-group";
    const label = document.createElement("label");
    label.setAttribute("for", field.id);
    label.textContent = field.label;
    const hintLine = document.createElement("p");
    hintLine.id = `${field.id}-money-hint`;
    hintLine.className = "hint";
    hintLine.textContent = hint;
    group.append(label, hintLine, moneyInput(field, hintLine.id));
    return group;
  }

  // A collapsible section holding one ledger row per field, with one hint for the whole section.
  function fieldSection({ id, title, intro, fields, open }) {
    const section = document.createElement("details");
    section.className = "field-group";
    section.id = id;
    if (open) section.open = true;
    const summary = document.createElement("summary");
    summary.textContent = title;
    const hintLine = document.createElement("p");
    hintLine.id = `${id}-hint`;
    hintLine.className = "hint";
    hintLine.textContent = intro;
    const table = document.createElement("table");
    table.className = "ledger ledger--one-year";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const nameHead = document.createElement("th");
    nameHead.scope = "col";
    nameHead.textContent = siteText("itsa.se-expense", "Expense");
    const amountHead = document.createElement("th");
    amountHead.scope = "col";
    amountHead.className = "ledger__figure";
    amountHead.textContent = siteText("itsa.amount-pounds", "Amount (£)");
    headRow.append(nameHead, amountHead);
    head.append(headRow);
    const body = document.createElement("tbody");
    fields.forEach((field) => {
      const row = document.createElement("tr");
      const header = document.createElement("th");
      header.scope = "row";
      const label = document.createElement("label");
      label.setAttribute("for", field.id);
      label.textContent = field.label;
      header.append(label);
      const cell = document.createElement("td");
      cell.className = "ledger__figure";
      cell.append(moneyInput(field, hintLine.id));
      row.append(header, cell);
      body.append(row);
    });
    table.append(head, body);
    section.append(summary, hintLine, table);
    return section;
  }

  // Opens each section that holds a figure, so a figure set by a load or an import is not hidden.
  function revealFilledSections() {
    document.querySelectorAll("details.field-group").forEach((section) => {
      if (Array.from(section.querySelectorAll("input")).some((input) => isFilled(input.value) && input.value.trim() !== "0")) {
        section.open = true;
      }
    });
  }

  // Fills the container with the total-expenses field, a section of itemised expenses and a
  // section of disallowable expenses.
  function mountFields(container) {
    const total = { id: CONSOLIDATED_FIELD, label: siteText("itsa.se-total-expenses-instead", "Total expenses (instead of itemising)") };
    const totalGroup = moneyGroup(
      total,
      siteText("itsa.se-total-expenses-hint", "Leave blank if you itemise the expenses below. Cannot be used with the itemised expenses."),
    );
    const exampleHint = siteText("itsa.money-example-hint", "For example, £600 or £193.54. Amounts are in pounds and pence.");
    container.replaceChildren(
      totalGroup,
      fieldSection({
        id: "itemisedExpenses",
        title: siteText("itsa.se-itemised-expenses", "Itemised expenses"),
        intro: `${exampleHint} ${siteText("itsa.se-itemised-hint", "Cost of goods and other expenses are sent even when they are 0.")}`,
        fields: ITEMISED_FIELDS.map((field) => ({ ...field, defaultValue: ALWAYS_SENT.includes(field.id) ? "0" : "" })),
        open: true,
      }),
      fieldSection({
        id: "disallowableExpenses",
        title: siteText("itsa.se-disallowable-expenses", "Disallowable expenses"),
        intro: `${exampleHint} ${siteText(
          "itsa.se-disallowable-hint",
          "The part of each itemised expense that cannot be claimed for tax. Leave blank if none. Cannot be used with the total expenses.",
        )}`,
        fields: DISALLOWABLE_FIELDS,
        open: false,
      }),
    );
  }

  window.selfEmploymentExpenses = {
    CONSOLIDATED_FIELD,
    ITEMISED_FIELDS,
    EXPENSE_IDS,
    DISALLOWABLE_FIELDS,
    DISALLOWABLE_IDS,
    buildPeriodExpenses,
    mountFields,
    moneyGroup,
    revealFilledSections,
  };
})();
