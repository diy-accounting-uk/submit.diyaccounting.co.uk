// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/foreign-property-fields.js
// The income and expense fields of one foreign property entry (one country, or one property),
// shared by the quarterly update and the amend page. The names are HMRC's Property Business
// (MTD) 6.0 names; the labels follow the SA106 boxes. HMRC takes either the itemised expenses or
// one consolidatedExpenses figure in an entry, never both. Every id carries the entry's prefix,
// so several entries sit on one page. Needs self-employment-expenses.js (the money field
// renderer) and money-input.js.

(function () {
  "use strict";

  const EXAMPLE_HINT = "For example, £600 or £193.54. Amounts are in pounds sterling; convert at the rate of the day or an average rate.";

  // id is the input id suffix; key is the HMRC name; group is the HMRC object that holds it.
  const INCOME_FIELDS = [
    { id: "rentAmount", key: "rentAmount", group: "rentIncome", label: "Rental income", min: 0 },
    { id: "otherPropertyIncome", key: "otherPropertyIncome", label: "Other property income", min: 0 },
  ];

  const MORE_INCOME_FIELDS = [
    { id: "premiumsOfLeaseGrant", key: "premiumsOfLeaseGrant", label: "Premiums for the grant of a lease", min: 0 },
    { id: "foreignTaxPaidOrDeducted", key: "foreignTaxPaidOrDeducted", label: "Foreign tax taken off or paid", min: 0 },
    { id: "specialWithholdingTaxOrUkTaxPaid", key: "specialWithholdingTaxOrUkTaxPaid", label: "UK tax taken off", min: 0 },
  ];

  const TAX_CREDIT_RELIEF_FIELD = { id: "foreignTaxCreditRelief", key: "foreignTaxCreditRelief", label: "Claim foreign tax credit relief" };

  const ITEMISED_EXPENSE_FIELDS = [
    { id: "premisesRunningCosts", key: "premisesRunningCosts", label: "Rent, rates, insurance and ground rents" },
    { id: "repairsAndMaintenance", key: "repairsAndMaintenance", label: "Repairs and maintenance" },
    { id: "financialCosts", key: "financialCosts", label: "Loan interest and other financial costs" },
    { id: "professionalFees", key: "professionalFees", label: "Legal, management and other professional fees" },
    { id: "costOfServices", key: "costOfServices", label: "Costs of services provided, including wages" },
    { id: "travelCosts", key: "travelCosts", label: "Travel costs" },
    { id: "other", key: "other", label: "Other property expenses" },
    { id: "residentialFinancialCost", key: "residentialFinancialCost", label: "Residential property finance costs" },
    {
      id: "broughtFwdResidentialFinancialCost",
      key: "broughtFwdResidentialFinancialCost",
      label: "Unused residential finance costs brought forward",
    },
  ];

  const CONSOLIDATED_FIELD = { id: "consolidatedExpenses", key: "consolidatedExpenses", label: "Total expenses" };

  const MONEY_FIELDS = [...INCOME_FIELDS, ...MORE_INCOME_FIELDS, ...ITEMISED_EXPENSE_FIELDS, CONSOLIDATED_FIELD];
  const ITEMISED_IDS = ITEMISED_EXPENSE_FIELDS.map((field) => field.id);

  const fieldId = (prefix, id) => `${prefix}-${id}`;
  const byId = (prefix, id) => document.getElementById(fieldId(prefix, id));
  const basisName = (prefix) => `${prefix}-expenseBasis`;

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  function group(prefix, field, hint) {
    return window.selfEmploymentExpenses.moneyGroup({ ...field, id: fieldId(prefix, field.id) }, hint);
  }

  function section(prefix, id, title, children, open) {
    const details = el("details", { className: "field-group", id: fieldId(prefix, id) }, [
      el("summary", { textContent: title }),
      ...children,
    ]);
    details.open = open;
    return details;
  }

  function choice(prefix, value, text, checked) {
    const id = fieldId(prefix, value === "total" ? "expenseBasisTotal" : "expenseBasisItemised");
    const input = el("input", { type: "radio", id, name: basisName(prefix), value, checked });
    return el("div", { className: "choice" }, [input, el("label", { htmlFor: id, textContent: text })]);
  }

  // Replaces the container's content with the income and expense fields of one entry.
  function mountEntry(container, prefix) {
    const taxCredit = el("div", { className: "choice" }, [
      el("input", { type: "checkbox", id: fieldId(prefix, TAX_CREDIT_RELIEF_FIELD.id), name: fieldId(prefix, TAX_CREDIT_RELIEF_FIELD.id) }),
      el("label", { htmlFor: fieldId(prefix, TAX_CREDIT_RELIEF_FIELD.id), textContent: TAX_CREDIT_RELIEF_FIELD.label }),
    ]);
    const basis = el("fieldset", { className: "form-group", id: fieldId(prefix, "expenseBasisGroup") }, [
      el("legend", { textContent: "How do you report expenses?" }),
      choice(prefix, "itemised", "Itemise the expenses", true),
      choice(prefix, "total", "One total for all expenses", false),
    ]);
    const itemised = el("div", { id: fieldId(prefix, "itemisedExpensesBlock") }, [
      ...ITEMISED_EXPENSE_FIELDS.slice(0, 2).map((field) => group(prefix, field, EXAMPLE_HINT)),
      section(
        prefix,
        "moreExpenses",
        "More itemised expenses",
        ITEMISED_EXPENSE_FIELDS.slice(2).map((field) => group(prefix, field, EXAMPLE_HINT)),
        false,
      ),
    ]);
    const total = el("div", { id: fieldId(prefix, "totalExpensesBlock"), hidden: true }, [
      group(prefix, CONSOLIDATED_FIELD, `${EXAMPLE_HINT} Replaces every itemised expense.`),
    ]);
    container.replaceChildren(
      ...INCOME_FIELDS.map((field) => group(prefix, field, EXAMPLE_HINT)),
      section(
        prefix,
        "moreIncome",
        "More property income",
        [...MORE_INCOME_FIELDS.map((field) => group(prefix, field, EXAMPLE_HINT)), taxCredit],
        false,
      ),
      basis,
      itemised,
      total,
    );
    basis.addEventListener("change", () => setExpenseBasis(prefix, byId(prefix, "expenseBasisTotal").checked ? "total" : "itemised"));
    setExpenseBasis(prefix, "itemised");
  }

  // The itemised fields are disabled while the total is chosen, and the total field is disabled
  // while the itemised expenses are chosen, so a disabled field is neither read nor checked.
  function setExpenseBasis(prefix, basis) {
    const total = basis === "total";
    byId(prefix, "expenseBasisItemised").checked = !total;
    byId(prefix, "expenseBasisTotal").checked = total;
    byId(prefix, "itemisedExpensesBlock").hidden = total;
    byId(prefix, "totalExpensesBlock").hidden = !total;
    ITEMISED_IDS.forEach((id) => {
      byId(prefix, id).disabled = total;
    });
    byId(prefix, CONSOLIDATED_FIELD.id).disabled = !total;
  }

  function expenseBasis(prefix) {
    return byId(prefix, "expenseBasisTotal")?.checked ? "total" : "itemised";
  }

  function isFilled(text) {
    return String(text ?? "").trim() !== "";
  }

  function put(target, field, value) {
    if (field.group) {
      target[field.group] = { ...target[field.group], [field.key]: value };
    } else {
      target[field.key] = value;
    }
  }

  // Reads one entry's figures. Returns { income, expenses }. With dated set (2024-25 and before)
  // rentAmount and foreignTaxCreditRelief always go out, because HMRC requires them in that
  // model. Otherwise only a filled field goes out, and foreignTaxCreditRelief goes out when it is
  // ticked or when the loaded figures held it.
  function readEntry(prefix, { dated = false } = {}) {
    const read = (field) => {
      const text = byId(prefix, field.id).value;
      if (isFilled(text)) return window.parseMoneyInput(text) ?? 0;
      return dated && field.id === "rentAmount" ? 0 : null;
    };
    const income = {};
    [...INCOME_FIELDS, ...MORE_INCOME_FIELDS].forEach((field) => {
      const value = read(field);
      if (value !== null) put(income, field, value);
    });
    const relief = byId(prefix, TAX_CREDIT_RELIEF_FIELD.id);
    if (dated || relief.checked || relief.dataset.loaded === "true") income.foreignTaxCreditRelief = relief.checked;
    const expenses = {};
    (expenseBasis(prefix) === "total" ? [CONSOLIDATED_FIELD] : ITEMISED_EXPENSE_FIELDS).forEach((field) => {
      const value = read(field);
      if (value !== null) put(expenses, field, value);
    });
    return { income, expenses };
  }

  // Opens each section that holds a figure, so a figure set by a load is not hidden.
  function revealFilledSections(prefix) {
    ["moreIncome", "moreExpenses"].forEach((id) => {
      const details = byId(prefix, id);
      const filled = Array.from(details.querySelectorAll("input[type=text]")).some(
        (input) => isFilled(input.value) && input.value.trim() !== "0",
      );
      if (filled || (id === "moreIncome" && byId(prefix, TAX_CREDIT_RELIEF_FIELD.id).checked)) details.open = true;
    });
  }

  // Sets one entry's fields from a loaded entry ({ income, expenses }, as HMRC returns it).
  function applyEntry(prefix, entry) {
    const income = entry?.income || {};
    const expenses = entry?.expenses || {};
    const sourceOf = (field, values) => (field.group ? values[field.group]?.[field.key] : values[field.key]);
    [
      [INCOME_FIELDS, income],
      [MORE_INCOME_FIELDS, income],
      [ITEMISED_EXPENSE_FIELDS, expenses],
      [[CONSOLIDATED_FIELD], expenses],
    ].forEach(([fields, values]) => {
      fields.forEach((field) => {
        const value = sourceOf(field, values);
        byId(prefix, field.id).value = value === undefined ? "" : value;
      });
    });
    const relief = byId(prefix, TAX_CREDIT_RELIEF_FIELD.id);
    relief.checked = income.foreignTaxCreditRelief === true;
    relief.dataset.loaded = income.foreignTaxCreditRelief === undefined ? "false" : "true";
    setExpenseBasis(prefix, expenses.consolidatedExpenses !== undefined ? "total" : "itemised");
    revealFilledSections(prefix);
  }

  window.foreignPropertyFields = {
    MONEY_FIELDS,
    CONSOLIDATED_FIELD,
    ITEMISED_EXPENSE_FIELDS,
    fieldId,
    mountEntry,
    setExpenseBasis,
    readEntry,
    applyEntry,
  };
})();
