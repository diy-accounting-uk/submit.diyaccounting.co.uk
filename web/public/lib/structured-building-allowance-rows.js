// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/structured-building-allowance-rows.js
// A repeatable list of Structures and Buildings Allowance claims, shared by the self-employment
// and UK property annual submissions. Each claim has HMRC's shape: an amount, the first-year
// qualifying date and expenditure, and the building (name, number, postcode). HMRC does not take
// a claim together with the trading income allowance or the property income allowance, so the
// page keeps the list inside the itemised allowances and disables it with them. Needs
// self-employment-expenses.js (the money field renderer) and money-input.js.

(function () {
  "use strict";

  const EXAMPLE_HINT = "For example, £600 or £193.54";

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  function textGroup(id, label, type, hint) {
    const hintLine = el("p", { id: `${id}-hint`, className: "hint", textContent: hint });
    const input = el("input", { type, id, name: id });
    input.setAttribute("aria-describedby", hintLine.id);
    if (type === "text") input.setAttribute("autocomplete", "off");
    return el("div", { className: "form-group" }, [el("label", { htmlFor: id, textContent: label }), hintLine, input]);
  }

  function blank(text) {
    return String(text ?? "").trim() === "";
  }

  // The problems of one claim. inputOf(name) gives the claim's input for a field name.
  function claimProblems(claim, inputOf) {
    const filled = (name) => !blank(inputOf(name).value);
    const problems = [];
    const add = (name, message) => problems.push({ input: inputOf(name), message: `${claim}: ${message}` });
    if (!filled("amount")) add("amount", "enter the allowance claimed");
    if (filled("qualifyingDate") && !filled("qualifyingAmountExpenditure"))
      add("qualifyingAmountExpenditure", "enter the qualifying expenditure");
    if (filled("qualifyingAmountExpenditure") && !filled("qualifyingDate"))
      add("qualifyingDate", "enter the date the building first qualified");
    if (!filled("postcode")) add("postcode", "enter the building postcode");
    return problems;
  }

  // Creates the list inside container and returns its controller.
  function create(container, { idPrefix, title, intro }) {
    let nextRow = 1;
    let disabled = false;
    const rows = el("div", { className: "sba-rows" });
    const addButton = el("button", { type: "button", id: `${idPrefix}-add`, className: "secondary-button", textContent: "Add a claim" });
    container.replaceChildren(
      el("fieldset", { className: "form-group sba-claims", id: `${idPrefix}-claims` }, [
        el("legend", { textContent: title }),
        el("p", { className: "hint", textContent: intro }),
        rows,
        addButton,
      ]),
    );

    const idOf = (row, name) => `${idPrefix}-${row}-${name}`;
    const claimRows = () => Array.from(rows.children);

    function renumber() {
      claimRows().forEach((row, index) => {
        row.querySelector("legend").textContent = `Claim ${index + 1}`;
      });
    }

    function applyDisabled() {
      container.querySelectorAll("input, button").forEach((control) => {
        control.disabled = disabled;
      });
    }

    function addRow(claim = {}) {
      const row = nextRow++;
      const money = (name, label) =>
        window.selfEmploymentExpenses.moneyGroup({ id: idOf(row, name), label, min: 0, defaultValue: "" }, EXAMPLE_HINT);
      const remove = el("button", { type: "button", className: "secondary-button", textContent: "Remove claim" });
      const fieldset = el("fieldset", { className: "sba-claim" }, [
        el("legend"),
        money("amount", "Allowance claimed"),
        textGroup(
          idOf(row, "qualifyingDate"),
          "Date the building first qualified",
          "date",
          "The first day it was used for a qualifying purpose.",
        ),
        money("qualifyingAmountExpenditure", "Qualifying expenditure"),
        textGroup(idOf(row, "buildingName"), "Building name", "text", "A name or a number identifies the building."),
        textGroup(idOf(row, "buildingNumber"), "Building number", "text", "Leave blank if the building has a name."),
        textGroup(idOf(row, "postcode"), "Building postcode", "text", "For example, SW1A 2AA."),
        remove,
      ]);
      fieldset.dataset.row = String(row);
      remove.addEventListener("click", () => {
        fieldset.remove();
        renumber();
      });
      rows.append(fieldset);
      const set = (name, value) => {
        if (value !== undefined && value !== null) document.getElementById(idOf(row, name)).value = value;
      };
      set("amount", claim.amount);
      set("qualifyingDate", claim.firstYear?.qualifyingDate);
      set("qualifyingAmountExpenditure", claim.firstYear?.qualifyingAmountExpenditure);
      set("buildingName", claim.building?.name);
      set("buildingNumber", claim.building?.number);
      set("postcode", claim.building?.postcode);
      renumber();
      applyDisabled();
      return row;
    }

    function value(row, name) {
      return document.getElementById(idOf(row, name)).value;
    }

    // One error per claim problem: { input, message }.
    function validate() {
      const problems = [];
      for (const [index, fieldset] of claimRows().entries()) {
        const inputOf = (name) => document.getElementById(idOf(fieldset.dataset.row, name));
        problems.push(...claimProblems(`Claim ${index + 1}`, inputOf));
      }
      return problems;
    }

    // The claims in HMRC's shape. Blank optional parts are left out.
    function read() {
      return claimRows().map((fieldset) => {
        const row = fieldset.dataset.row;
        const claim = { amount: window.parseMoneyInput(value(row, "amount")) ?? 0 };
        if (!blank(value(row, "qualifyingDate"))) {
          claim.firstYear = {
            qualifyingDate: value(row, "qualifyingDate"),
            qualifyingAmountExpenditure: window.parseMoneyInput(value(row, "qualifyingAmountExpenditure")) ?? 0,
          };
        }
        const building = {};
        if (!blank(value(row, "buildingName"))) building.name = value(row, "buildingName").trim();
        if (!blank(value(row, "buildingNumber"))) building.number = value(row, "buildingNumber").trim();
        building.postcode = value(row, "postcode").trim();
        claim.building = building;
        return claim;
      });
    }

    function set(claims) {
      rows.replaceChildren();
      (Array.isArray(claims) ? claims : []).forEach((claim) => addRow(claim));
    }

    function setDisabled(flag) {
      disabled = flag;
      applyDisabled();
    }

    addButton.addEventListener("click", () => {
      const row = addRow();
      document.getElementById(idOf(row, "amount")).focus();
    });

    return { read, set, validate, setDisabled, count: () => claimRows().length };
  }

  window.structuredBuildingAllowanceRows = { create };
})();
