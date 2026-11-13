// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Builds the scope checker form in the element with the id itsaChecker and shows the answer.
// The full page and the framed copy for other sites both load this module.

import { FIRST_UPDATE_PERIOD, RECORD_FIELDS, START_RULES, assessScope, formatDate, formatPounds, parseIncome } from "./scope-rules.js";

function incomeField(id, labelText) {
  const group = document.createElement("div");
  group.className = "form-group";
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "decimal";
  input.id = id;
  input.name = id;
  input.autocomplete = "off";
  input.placeholder = "0";
  group.append(label, input);
  return group;
}

function buildForm() {
  const form = document.createElement("form");
  form.id = "itsaCheckerForm";
  for (const rule of START_RULES) {
    const key = rule.taxYear.replaceAll(" ", "-");
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = `Tax year ${rule.taxYear}`;
    fieldset.append(
      legend,
      incomeField(`itsaSelfEmployment-${key}`, "Self-employment income in pounds, before expenses"),
      incomeField(`itsaProperty-${key}`, "Property income in pounds, before expenses"),
    );
    form.append(fieldset);
  }
  const button = document.createElement("button");
  button.type = "submit";
  button.className = "btn";
  button.textContent = "Check";
  form.append(button);
  return form;
}

function paragraph(text) {
  const element = document.createElement("p");
  element.textContent = text;
  return element;
}

function readIncomes(form) {
  const incomes = {};
  for (const rule of START_RULES) {
    const key = rule.taxYear.replaceAll(" ", "-");
    const selfEmployment = parseIncome(form.elements[`itsaSelfEmployment-${key}`].value);
    const property = parseIncome(form.elements[`itsaProperty-${key}`].value);
    if (selfEmployment === null || property === null) return null;
    incomes[rule.taxYear] = { selfEmployment, property };
  }
  return incomes;
}

function showResult(form, container, today) {
  container.replaceChildren();
  const incomes = readIncomes(form);
  if (incomes === null) {
    container.append(paragraph("Type each income as a number of pounds, for example 32000. Leave a box empty for no income."));
    return;
  }
  const outcome = assessScope(incomes, today);
  const heading = document.createElement("h3");
  if (!outcome.inScope) {
    heading.textContent = "Not in scope on these figures";
    container.append(
      heading,
      paragraph(
        "Your qualifying income is not over the threshold of any of the three start dates. " +
          "HMRC may still write to you, and you may sign up early.",
      ),
    );
  } else {
    heading.textContent = `In scope from ${formatDate(outcome.startDate)}`;
    const total = outcome.totals.find((entry) => entry.rule === outcome.rule).total;
    container.append(
      heading,
      paragraph(
        `Your qualifying income of ${formatPounds(total)} in the ${outcome.rule.taxYear} tax year is over ` +
          `${formatPounds(outcome.rule.threshold)}.`,
      ),
      paragraph(
        `Your first quarterly update covers ${FIRST_UPDATE_PERIOD} ${outcome.startDate.slice(0, 4)}. ` +
          `It is due by ${formatDate(outcome.firstUpdateDeadline)}${outcome.deadlinePassed ? ", which has passed" : ""}.`,
      ),
    );
    const list = document.createElement("ul");
    for (const field of RECORD_FIELDS) {
      const item = document.createElement("li");
      item.textContent = `Record the ${field}.`;
      list.append(item);
    }
    container.append(paragraph("Create a digital record in your software for each item of income and expense. Keep these:"), list);
  }
}

export function mountChecker(root, today) {
  const form = buildForm();
  const result = document.createElement("div");
  result.setAttribute("role", "status");
  result.setAttribute("aria-live", "polite");
  result.id = "itsaCheckerResult";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    showResult(form, result, today);
  });
  root.replaceChildren(form, result);
  root.hidden = false;
}

const root = document.getElementById("itsaChecker");
if (root) mountChecker(root, new Date().toISOString().slice(0, 10));
