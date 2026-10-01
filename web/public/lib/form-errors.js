// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/form-errors.js
// Form validation errors in the GOV.UK pattern: a summary at the top of the form headed
// "There is a problem" with one link per error, an inline message beside each field,
// aria-invalid on each field, and focus moved to the summary. API results stay in showStatus.

(function () {
  "use strict";

  const SUMMARY_ID = "form-error-summary";
  const ERROR_CLASS = "error-message";

  const REQUIRED_MESSAGES = {
    nino: "Enter your National Insurance number",
    businessId: "Enter the business ID",
    taxYear: "Enter the tax year",
    periodId: "Enter the period ID",
    submissionId: "Enter the submission ID",
    calculationId: "Enter the calculation ID",
    calculationType: "Select the calculation type",
    periodStartDate: "Enter the period start date",
    periodEndDate: "Enter the period end date",
    fromDate: "Enter the period start date",
    toDate: "Enter the period end date",
    accountingPeriodStartDate: "Enter the accounting period start date",
    accountingPeriodEndDate: "Enter the accounting period end date",
  };

  function labelOf(input) {
    return input.labels?.[0]?.textContent?.trim() || input.id;
  }

  function requiredMessage(input) {
    return REQUIRED_MESSAGES[input.id] || `Enter ${labelOf(input)}`;
  }

  function errorIdOf(input) {
    return `${input.id}-error`;
  }

  function summaryOf(root = document) {
    return root.querySelector(`#${SUMMARY_ID}`);
  }

  function clearFieldError(input) {
    document.getElementById(errorIdOf(input))?.remove();
    input.removeAttribute("aria-invalid");
    input.classList.remove("input--error");
    input.closest(".form-group")?.classList.remove("form-group--error");
    const remaining = (input.getAttribute("aria-describedby") || "")
      .split(" ")
      .filter((id) => id && id !== errorIdOf(input))
      .join(" ");
    if (remaining) input.setAttribute("aria-describedby", remaining);
    else input.removeAttribute("aria-describedby");
  }

  function clearFormErrors(root = document) {
    summaryOf(root)?.remove();
    root.querySelectorAll(`.${ERROR_CLASS}[id$="-error"]`).forEach((message) => {
      const input = document.getElementById(message.id.slice(0, -"-error".length));
      if (input) clearFieldError(input);
      else message.remove();
    });
  }

  function showFieldError(input, message) {
    clearFieldError(input);
    const text = document.createElement("p");
    text.id = errorIdOf(input);
    text.className = ERROR_CLASS;
    const hidden = document.createElement("span");
    hidden.className = "visually-hidden";
    hidden.textContent = "Error: ";
    text.append(hidden, message);
    const anchor = input.closest(".input-prefix") || input;
    anchor.parentNode.insertBefore(text, anchor);
    const describedBy = (input.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
    input.setAttribute("aria-describedby", [...describedBy, text.id].join(" "));
    input.setAttribute("aria-invalid", "true");
    input.classList.add("input--error");
    input.closest(".form-group")?.classList.add("form-group--error");
  }

  function summaryHost(firstInput) {
    return firstInput.closest("form") || firstInput.closest(".form-container") || firstInput.parentNode;
  }

  // errors: [{ input, message }]. Shows the summary and inline messages and focuses the summary.
  function showFormErrors(errors) {
    clearFormErrors();
    if (errors.length === 0) return;
    errors.forEach(({ input, message }) => showFieldError(input, message));

    const summary = document.createElement("div");
    summary.id = SUMMARY_ID;
    summary.className = "error-summary";
    summary.setAttribute("role", "alert");
    summary.setAttribute("tabindex", "-1");
    const heading = document.createElement("h2");
    heading.className = "error-summary__title";
    heading.textContent = "There is a problem";
    const list = document.createElement("ul");
    list.className = "error-summary__list";
    errors.forEach(({ input, message }) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#${input.id}`;
      link.textContent = message;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        input.focus();
      });
      item.append(link);
      list.append(item);
    });
    summary.append(heading, list);
    summaryHost(errors[0].input).prepend(summary);
    summary.focus();
  }

  // Shows an error for each listed field that is blank. Returns true when every field has a value.
  function requireFields(ids) {
    const errors = ids
      .map((id) => document.getElementById(id))
      .filter((input) => input && String(input.value ?? "").trim() === "")
      .map((input) => ({ input, message: requiredMessage(input) }));
    showFormErrors(errors);
    return errors.length === 0;
  }

  function moneyMessage(input) {
    if (window.readMoneyInput(input) !== null) return `The amount cannot be negative. Check ${labelOf(input)}.`;
    const example =
      input.dataset.money === "whole-pounds" ? "a whole number of pounds, like £600 or £1,200" : "pounds and pence, like £600 or £193.54";
    return `Enter an amount in ${example}. Check ${labelOf(input)}.`;
  }

  // Runs the money parser, which marks aria-invalid on bad pounds boxes, and turns what it marked
  // into the summary and inline messages. Returns true when something was wrong.
  function reportMoneyProblems(root = document) {
    const problem = window.moneyInputProblem(root);
    if (!problem) {
      clearFormErrors(root);
      return false;
    }
    const errors = Array.from(root.querySelectorAll('input[data-money][aria-invalid="true"]')).map((input) => ({
      input,
      message: moneyMessage(input),
    }));
    showFormErrors(errors);
    return true;
  }

  document.addEventListener("input", (event) => {
    const input = event.target;
    if (input?.id && document.getElementById(errorIdOf(input))) clearFieldError(input);
  });

  window.formErrors = { showFormErrors, clearFormErrors, requireFields, reportMoneyProblems };
})();
