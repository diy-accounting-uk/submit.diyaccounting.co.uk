// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/foreign-property-period-form.js
// The figures part of the foreign property quarterly update and amend pages: the entry list
// (one fieldset for each country up to 2025-26, one for each property from 2026-27), and up to
// 2024-25 the "furnished holiday lettings in the EEA" section above it. The page owns the
// criteria, the HMRC calls and the sign-in; this module owns the figures.
// Needs country-codes.js, itsaSubmissionModel.js, money-input.js, self-employment-expenses.js,
// foreign-property-fields.js and foreign-property-entries.js.

(function () {
  "use strict";

  const FHL_PREFIX = "fhl";
  const EXAMPLE_HINT = "For example, £600 or £193.54. Amounts are in pounds sterling; convert at the rate of the day or an average rate.";
  const FHL_RENT_FIELD = { id: "rentAmount", label: "Rental income", min: 0 };
  const FHL_EXPENSE_FIELDS = [
    { id: "premisesRunningCosts", label: "Rent, rates, insurance and ground rents" },
    { id: "repairsAndMaintenance", label: "Repairs and maintenance" },
    { id: "financialCosts", label: "Loan interest and other financial costs" },
    { id: "professionalFees", label: "Legal, management and other professional fees" },
    { id: "costOfServices", label: "Costs of services provided, including wages" },
    { id: "travelCosts", label: "Travel costs" },
    { id: "other", label: "Other property expenses" },
  ];
  const FHL_TOTAL_FIELD = { id: "consolidatedExpenses", label: "Total expenses" };

  const fhlId = (id) => `${FHL_PREFIX}-${id}`;
  const fhlInput = (id) => document.getElementById(fhlId(id));

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  function moneyGroup(field) {
    return window.selfEmploymentExpenses.moneyGroup({ ...field, id: fhlId(field.id) }, EXAMPLE_HINT);
  }

  function fhlChoice(value, text, checked) {
    const id = fhlId(value === "total" ? "expenseBasisTotal" : "expenseBasisItemised");
    return el("div", { className: "choice" }, [
      el("input", { type: "radio", id, name: fhlId("expenseBasis"), value, checked }),
      el("label", { htmlFor: id, textContent: text }),
    ]);
  }

  function setFhlBasis(basis) {
    const total = basis === "total";
    fhlInput("expenseBasisItemised").checked = !total;
    fhlInput("expenseBasisTotal").checked = total;
    document.getElementById(fhlId("itemisedExpensesBlock")).hidden = total;
    document.getElementById(fhlId("totalExpensesBlock")).hidden = !total;
    FHL_EXPENSE_FIELDS.forEach((field) => {
      fhlInput(field.id).disabled = total;
    });
    fhlInput(FHL_TOTAL_FIELD.id).disabled = !total;
  }

  function mountFhl(container) {
    const basis = el("fieldset", { className: "form-group", id: fhlId("expenseBasisGroup") }, [
      el("legend", { textContent: "How do you report expenses?" }),
      fhlChoice("itemised", "Itemise the expenses", true),
      fhlChoice("total", "One total for all expenses", false),
    ]);
    const itemised = el(
      "div",
      { id: fhlId("itemisedExpensesBlock") },
      FHL_EXPENSE_FIELDS.map((field) => moneyGroup(field)),
    );
    const total = el("div", { id: fhlId("totalExpensesBlock"), hidden: true }, [moneyGroup(FHL_TOTAL_FIELD)]);
    container.replaceChildren(
      el("fieldset", { className: "form-group foreign-property-entry", id: "fhlEea" }, [
        el("legend", { textContent: "Furnished holiday lettings in the European Economic Area" }),
        el("p", {
          className: "hint",
          textContent:
            "Furnished holiday lettings ended on 5 April 2025. Fill this in only for a period before then, with every such letting in the EEA added together.",
        }),
        moneyGroup(FHL_RENT_FIELD),
        basis,
        itemised,
        total,
      ]),
    );
    basis.addEventListener("change", () => setFhlBasis(fhlInput("expenseBasisTotal").checked ? "total" : "itemised"));
    setFhlBasis("itemised");
  }

  function isFilled(text) {
    return String(text ?? "").trim() !== "";
  }

  // The FHL section as { income, expenses }, or null when it holds no figure.
  function readFhl() {
    const parse = (id) => window.parseMoneyInput(fhlInput(id).value) ?? 0;
    const income = isFilled(fhlInput(FHL_RENT_FIELD.id).value) ? { rentAmount: parse(FHL_RENT_FIELD.id) } : {};
    const fields = fhlInput("expenseBasisTotal").checked ? [FHL_TOTAL_FIELD] : FHL_EXPENSE_FIELDS;
    const expenses = {};
    fields.forEach((field) => {
      if (isFilled(fhlInput(field.id).value)) expenses[field.id] = parse(field.id);
    });
    if (Object.keys(income).length === 0 && Object.keys(expenses).length === 0) return null;
    return { income, expenses };
  }

  function applyFhl(section) {
    const income = section?.income || {};
    const expenses = section?.expenses || {};
    const set = (id, value) => {
      fhlInput(id).value = value === undefined ? "" : value;
    };
    set(FHL_RENT_FIELD.id, income.rentAmount);
    [...FHL_EXPENSE_FIELDS, FHL_TOTAL_FIELD].forEach((field) => set(field.id, expenses[field.id]));
    setFhlBasis(expenses.consolidatedExpenses !== undefined ? "total" : "itemised");
  }

  function hasFigures(entry) {
    return Object.keys(entry.income).length > 0 || Object.keys(entry.expenses).length > 0;
  }

  // Wires the figures part of a page into the two containers. fhlContainer may be null.
  function create({ fhlContainer, entriesContainer, idPrefix = "fp" }) {
    let mode = null;
    let widget = null;

    function mountWidget(nextMode) {
      mode = nextMode;
      widget = window.foreignPropertyEntries.create(entriesContainer, {
        idPrefix,
        mode,
        renderBody: (body, prefix) => window.foreignPropertyFields.mountEntry(body, prefix),
      });
    }

    // Chooses the entry list and the FHL section for the tax year. A change of kind of entry
    // starts the list again, because a country entry has no property to keep.
    function setTaxYear(taxYear) {
      const model = window.itsaSubmissionModel;
      if (!model.isValidTaxYear(taxYear)) return;
      const nextMode = model.resolveForeignPropertyEntryKey(taxYear) === "propertyId" ? "property" : "country";
      if (nextMode !== mode) mountWidget(nextMode);
      const dated = model.resolveItsaSubmissionModel(taxYear) === "dated";
      if (fhlContainer) {
        if (dated && !document.getElementById("fhlEea")) mountFhl(fhlContainer);
        if (!dated) fhlContainer.replaceChildren();
      }
    }

    function applyEntries(entries) {
      const unknown = [];
      if (mode === "country") {
        widget.clear();
        entries.forEach((entry) => {
          const prefix = widget.addCountry({ countryCode: entry.countryCode });
          window.foreignPropertyFields.applyEntry(prefix, entry);
        });
      } else {
        const held = new Map(widget.entries().map((item) => [item.key, item.prefix]));
        entries.forEach((entry) => {
          if (held.has(entry.propertyId)) window.foreignPropertyFields.applyEntry(held.get(entry.propertyId), entry);
          else unknown.push(entry.propertyId);
        });
      }
      return unknown;
    }

    // Loads HMRC's summary: { foreignFhlEea?, foreignNonFhlProperty?[] } (dated) or { foreignProperty[] }.
    // Returns the property ids HMRC holds figures for that are not in the list.
    function apply(summary) {
      if (fhlContainer && document.getElementById("fhlEea")) applyFhl(summary?.foreignFhlEea);
      return applyEntries(summary?.foreignNonFhlProperty || summary?.foreignProperty || []);
    }

    // Reads the figures: { problems, foreignFhlEea, entries } where each entry carries its key
    // (countryCode or propertyId), income and expenses.
    function read(taxYear) {
      const dated = window.itsaSubmissionModel.resolveItsaSubmissionModel(taxYear) === "dated";
      const keyName = mode === "country" ? "countryCode" : "propertyId";
      const problems = widget.validate();
      const entries = [];
      widget.entries().forEach(({ prefix, key }) => {
        if (!key) return;
        const entry = window.foreignPropertyFields.readEntry(prefix, { dated });
        if (dated || hasFigures(entry)) entries.push({ [keyName]: key, income: entry.income, expenses: entry.expenses });
      });
      const foreignFhlEea = dated && fhlContainer && document.getElementById("fhlEea") ? readFhl() : null;
      if (problems.length === 0 && entries.length === 0 && !foreignFhlEea) {
        const target = mode === "country" ? document.getElementById(`${idPrefix}-add`) : entriesContainer.querySelector("input, select");
        problems.push({
          input: target || entriesContainer,
          message:
            mode === "country"
              ? "Add a country and enter its figures"
              : "Load your properties from HMRC and enter the figures for at least one of them",
        });
      }
      return { problems, foreignFhlEea, entries };
    }

    // Starts again with no entries and no FHL section; setTaxYear then mounts them for the tax year.
    function reset() {
      mode = null;
      widget = null;
      fhlContainer?.replaceChildren();
      entriesContainer.replaceChildren();
    }

    return {
      reset,
      setTaxYear,
      apply,
      read,
      mode: () => mode,
      widget: () => widget,
      setProperties: (properties) => widget.setProperties(properties),
      hasEntries: () => widget.entries().length > 0,
    };
  }

  window.foreignPropertyPeriodForm = { create };
})();
