// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/self-employment-expenses.js
// The expense fields of a self-employment period summary. HMRC takes either the itemised
// expenses or one consolidatedExpenses figure, never both. The fields come from HMRC's Self
// Employment Business (MTD) 5.0 period summary schema (reference/hmrc-mtd-self-employment-business-api-5.0.yaml).

(function () {
  "use strict";

  const CONSOLIDATED_FIELD = "consolidatedExpenses";

  // costOfGoods and otherExpenses are always sent, as the form has always sent them.
  const ALWAYS_SENT = ["costOfGoods", "otherExpenses"];

  const ITEMISED_FIELDS = [
    { id: "costOfGoods", label: "Cost of goods" },
    { id: "paymentsToSubcontractors", label: "Payments to subcontractors" },
    { id: "wagesAndStaffCosts", label: "Wages, salaries and other staff costs" },
    { id: "carVanTravelExpenses", label: "Car, van and travel expenses" },
    { id: "premisesRunningCosts", label: "Rent, rates, power and insurance costs" },
    { id: "maintenanceCosts", label: "Repairs and renewals of property and equipment" },
    { id: "adminCosts", label: "Phone, fax, stationery and other office costs" },
    { id: "businessEntertainmentCosts", label: "Business entertainment costs" },
    { id: "advertisingCosts", label: "Advertising costs" },
    { id: "interestOnBankOtherLoans", label: "Interest on bank and other loans" },
    { id: "financeCharges", label: "Bank, credit card and other financial charges" },
    { id: "irrecoverableDebts", label: "Irrecoverable debts written off" },
    { id: "professionalFees", label: "Accountancy, legal and other professional fees" },
    { id: "depreciation", label: "Depreciation and loss/profit on sales of assets" },
    { id: "otherExpenses", label: "Other expenses" },
  ];

  const ITEMISED_IDS = ITEMISED_FIELDS.map((field) => field.id);
  const EXPENSE_IDS = [...ITEMISED_IDS, CONSOLIDATED_FIELD];

  function isFilled(text) {
    return String(text ?? "").trim() !== "";
  }

  // read(id) gives what the customer typed. parse(text) gives a number or null.
  // Returns { periodExpenses } or { problem }.
  function buildPeriodExpenses(read, parse) {
    const consolidatedText = read(CONSOLIDATED_FIELD);
    const itemisedFilled = ITEMISED_IDS.filter((id) => isFilled(read(id)) && parse(read(id)) !== 0);
    if (isFilled(consolidatedText)) {
      if (itemisedFilled.length > 0) {
        return { problem: "Enter either the total expenses or the itemised expenses, not both. Clear one of them." };
      }
      return { periodExpenses: { [CONSOLIDATED_FIELD]: parse(consolidatedText) ?? 0 } };
    }
    const periodExpenses = {};
    ITEMISED_IDS.forEach((id) => {
      if (ALWAYS_SENT.includes(id) || isFilled(read(id))) periodExpenses[id] = parse(read(id)) ?? 0;
    });
    return { periodExpenses };
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
    const prefixed = document.createElement("div");
    prefixed.className = "input-prefix";
    const prefix = document.createElement("span");
    prefix.className = "prefix";
    prefix.textContent = "£";
    const input = document.createElement("input");
    input.type = "text";
    input.id = field.id;
    input.name = field.id;
    input.value = field.defaultValue ?? "";
    input.setAttribute("aria-describedby", hintLine.id);
    input.setAttribute("inputmode", "decimal");
    input.setAttribute("data-money", "pounds-and-pence");
    prefixed.append(prefix, input);
    group.append(label, hintLine, prefixed);
    return group;
  }

  // Fills the container with the total-expenses field and every itemised expense field.
  function mountFields(container) {
    const exampleHint = "For example, £600 or £193.54";
    const total = { id: CONSOLIDATED_FIELD, label: "Total expenses (instead of itemising)" };
    const totalGroup = moneyGroup(total, "Leave blank if you itemise the expenses below. Cannot be used with the itemised expenses.");
    container.replaceChildren(
      totalGroup,
      ...ITEMISED_FIELDS.map((field) => moneyGroup({ ...field, defaultValue: ALWAYS_SENT.includes(field.id) ? "0" : "" }, exampleHint)),
    );
  }

  window.selfEmploymentExpenses = { CONSOLIDATED_FIELD, ITEMISED_FIELDS, EXPENSE_IDS, buildPeriodExpenses, mountFields };
})();
