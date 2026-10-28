// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/uk-property-period-fields.js
// The income and expense fields of a UK property period summary, shared by the quarterly update
// and the amend page. The names are HMRC's Property Business (MTD) 6.0 names. HMRC takes either
// the itemised expenses or one consolidatedExpenses figure, never both. Needs
// self-employment-expenses.js (the money field renderer) and money-input.js.

(function () {
  "use strict";

  const EXAMPLE_HINT = "For example, £600 or £193.54";

  // id is the input id; key is the HMRC name; rentARoom marks a field HMRC nests under rentARoom.
  const INCOME_FIELDS = [
    { id: "periodAmount", key: "periodAmount", label: "Rental income", min: 0 },
    { id: "otherIncome", key: "otherIncome", label: "Other property income", min: 0 },
  ];

  const MORE_INCOME_FIELDS = [
    { id: "premiumsOfLeaseGrant", key: "premiumsOfLeaseGrant", label: "Premiums for the grant of a lease", min: 0 },
    { id: "reversePremiums", key: "reversePremiums", label: "Reverse premiums", min: 0 },
    { id: "taxDeducted", key: "taxDeducted", label: "Tax deducted from your income", min: 0 },
    { id: "rentARoomRentsReceived", key: "rentsReceived", rentARoom: true, label: "Rent a room: rents received", min: 0 },
  ];

  const ITEMISED_EXPENSE_FIELDS = [
    { id: "repairsAndMaintenance", key: "repairsAndMaintenance", label: "Repairs and maintenance" },
    { id: "otherExpenses", key: "other", label: "Other property expenses" },
    { id: "premisesRunningCosts", key: "premisesRunningCosts", label: "Rent, rates, insurance and ground rents" },
    { id: "financialCosts", key: "financialCosts", label: "Loan interest and other financial costs" },
    { id: "professionalFees", key: "professionalFees", label: "Legal, management and other professional fees" },
    { id: "costOfServices", key: "costOfServices", label: "Costs of services provided, including wages" },
    { id: "travelCosts", key: "travelCosts", label: "Travel costs" },
    { id: "residentialFinancialCost", key: "residentialFinancialCost", label: "Residential property finance costs" },
    { id: "rentARoomAmountClaimed", key: "amountClaimed", rentARoom: true, label: "Rent a room: amount claimed" },
  ];

  const CONSOLIDATED_FIELD = { id: "consolidatedExpenses", key: "consolidatedExpenses", label: "Total expenses" };
  const CARRIED_FORWARD_FIELD = {
    id: "residentialFinancialCostsCarriedForward",
    key: "residentialFinancialCostsCarriedForward",
    label: "Residential finance costs carried forward",
  };

  const ALWAYS_SENT_IDS = ["periodAmount", "otherIncome", "repairsAndMaintenance", "otherExpenses"];
  const ITEMISED_IDS = ITEMISED_EXPENSE_FIELDS.map((field) => field.id);
  const MONEY_FIELDS = [...INCOME_FIELDS, ...MORE_INCOME_FIELDS, ...ITEMISED_EXPENSE_FIELDS, CONSOLIDATED_FIELD, CARRIED_FORWARD_FIELD];
  const MONEY_IDS = MONEY_FIELDS.map((field) => field.id);
  const BASIS_ITEMISED = "expenseBasisItemised";
  const BASIS_TOTAL = "expenseBasisTotal";

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  function group(field, hint, required) {
    return window.selfEmploymentExpenses.moneyGroup({ ...field, required: required && field.id === "periodAmount" }, hint);
  }

  function section(id, title, children, open) {
    const details = el("details", { className: "field-group", id }, [el("summary", { textContent: title }), ...children]);
    details.open = open;
    return details;
  }

  function choice(id, value, text, checked) {
    const input = el("input", { type: "radio", id, name: "expenseBasis", value, checked });
    return el("div", { className: "choice" }, [input, el("label", { htmlFor: id, textContent: text })]);
  }

  // Replaces the containers' content with the income fields and the expense fields.
  function mount({ incomeContainer, expenseContainer, periodAmountRequired }) {
    incomeContainer.replaceChildren(
      ...INCOME_FIELDS.map((field) => group(field, EXAMPLE_HINT, periodAmountRequired)),
      section(
        "moreIncome",
        "More property income",
        MORE_INCOME_FIELDS.map((field) => group(field, EXAMPLE_HINT)),
        false,
      ),
    );
    const basis = el("fieldset", { className: "form-group", id: "expenseBasisGroup" }, [
      el("legend", { textContent: "How do you report expenses?" }),
      choice(BASIS_ITEMISED, "itemised", "Itemise the expenses", true),
      choice(BASIS_TOTAL, "total", "One total for all expenses", false),
    ]);
    const itemised = el("div", { id: "itemisedExpensesBlock" }, [
      ...ITEMISED_EXPENSE_FIELDS.slice(0, 2).map((field) => group(field, EXAMPLE_HINT)),
      section(
        "moreExpenses",
        "More itemised expenses",
        ITEMISED_EXPENSE_FIELDS.slice(2).map((field) => group(field, EXAMPLE_HINT)),
        false,
      ),
    ]);
    const total = el("div", { id: "totalExpensesBlock", hidden: true }, [
      group(CONSOLIDATED_FIELD, `${EXAMPLE_HINT}. Replaces every itemised expense.`),
    ]);
    expenseContainer.replaceChildren(
      basis,
      itemised,
      total,
      group(CARRIED_FORWARD_FIELD, `${EXAMPLE_HINT}. Residential finance costs not yet relieved, carried to the next year.`),
    );
    basis.addEventListener("change", () => setExpenseBasis(document.getElementById(BASIS_TOTAL).checked ? "total" : "itemised"));
    setExpenseBasis("itemised");
    expenseContainer.closest("form")?.addEventListener("reset", () => setTimeout(() => setExpenseBasis("itemised"), 0));
  }

  // The itemised fields are disabled while the total is chosen, so they are neither read nor
  // checked, and the total field is disabled while the itemised expenses are chosen.
  function setExpenseBasis(basis) {
    const total = basis === "total";
    document.getElementById(BASIS_ITEMISED).checked = !total;
    document.getElementById(BASIS_TOTAL).checked = total;
    document.getElementById("itemisedExpensesBlock").hidden = total;
    document.getElementById("totalExpensesBlock").hidden = !total;
    ITEMISED_IDS.forEach((id) => {
      document.getElementById(id).disabled = total;
    });
    document.getElementById(CONSOLIDATED_FIELD.id).disabled = !total;
  }

  function expenseBasis() {
    return document.getElementById(BASIS_TOTAL)?.checked ? "total" : "itemised";
  }

  function isFilled(text) {
    return String(text ?? "").trim() !== "";
  }

  // Opens each section that holds a figure, so a figure set by a load or an import is not hidden.
  function revealFilledSections() {
    ["moreIncome", "moreExpenses"].forEach((id) => {
      const details = document.getElementById(id);
      if (Array.from(details.querySelectorAll("input")).some((input) => isFilled(input.value) && input.value.trim() !== "0")) {
        details.open = true;
      }
    });
  }

  function put(target, field, value) {
    if (field.rentARoom) {
      target.rentARoom = { ...target.rentARoom, [field.key]: value };
    } else {
      target[field.key] = value;
    }
  }

  // Reads the figures from the page. Returns { income, expenses }. With sendZeros, the four
  // fields the quarterly update has always sent go out as 0 when blank; without it (amend)
  // only a filled field goes out.
  function readFigures({ sendZeros }) {
    const read = (field) => {
      const text = document.getElementById(field.id).value;
      if (isFilled(text)) return window.parseMoneyInput(text) ?? 0;
      return sendZeros && ALWAYS_SENT_IDS.includes(field.id) ? 0 : null;
    };
    const income = {};
    [...INCOME_FIELDS, ...MORE_INCOME_FIELDS].forEach((field) => {
      const value = read(field);
      if (value !== null) put(income, field, value);
    });
    const expenses = {};
    const expenseFields = expenseBasis() === "total" ? [CONSOLIDATED_FIELD] : ITEMISED_EXPENSE_FIELDS;
    [...expenseFields, CARRIED_FORWARD_FIELD].forEach((field) => {
      const value = read(field);
      if (value !== null) put(expenses, field, value);
    });
    return { income, expenses };
  }

  // Sets the page from a loaded ukProperty (or ukFhlProperty, ukNonFhlProperty) object.
  function applyLoaded(property) {
    const values = { income: property?.income || {}, expenses: property?.expenses || {} };
    const source = (field, group) => (field.rentARoom ? values[group].rentARoom?.[field.key] : values[group][field.key]);
    [
      [INCOME_FIELDS, "income"],
      [MORE_INCOME_FIELDS, "income"],
      [ITEMISED_EXPENSE_FIELDS, "expenses"],
      [[CONSOLIDATED_FIELD, CARRIED_FORWARD_FIELD], "expenses"],
    ].forEach(([fields, groupName]) => {
      fields.forEach((field) => {
        const value = source(field, groupName);
        if (value !== undefined) document.getElementById(field.id).value = value;
      });
    });
    setExpenseBasis(values.expenses.consolidatedExpenses !== undefined ? "total" : "itemised");
    revealFilledSections();
  }

  window.ukPropertyPeriodFields = {
    MONEY_FIELDS,
    MONEY_IDS,
    CONSOLIDATED_FIELD,
    mount,
    setExpenseBasis,
    readFigures,
    applyLoaded,
    revealFilledSections,
  };
})();
