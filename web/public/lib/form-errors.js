// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/form-errors.js
// Form validation errors in the GOV.UK pattern: a summary at the top of the form headed
// "There is a problem" with one link per error, an inline message beside each field,
// aria-invalid on each field, and focus moved to the summary. API results stay in showStatus.

(function () {
  "use strict";

  // page-chrome.js gives the text in the chosen language; without it the English stands.
  function siteText(id, english, values) {
    if (window.siteText) return window.siteText(id, english, values);
    return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
  }

  const SUMMARY_ID = "form-error-summary";
  const ERROR_CLASS = "error-message";

  const REQUIRED_MESSAGES = {
    nino: siteText("widget.required-nino", "Enter your National Insurance number"),
    vrn: siteText("widget.required-vrn", "Enter your VAT registration number"),
    vatNumber: siteText("widget.required-vrn", "Enter your VAT registration number"),
    businessId: siteText("widget.required-business-id", "Enter the business ID"),
    taxYear: siteText("widget.required-tax-year", "Enter the tax year"),
    periodId: siteText("widget.required-period-id", "Enter the period ID"),
    submissionId: siteText("widget.required-submission-id", "Enter the submission ID"),
    calculationId: siteText("widget.required-calculation-id", "Enter the calculation ID"),
    calculationType: siteText("widget.required-calculation-type", "Select the calculation type"),
    periodStart: siteText("widget.required-period-start", "Enter the period start date"),
    periodEnd: siteText("widget.required-period-end", "Enter the period end date"),
    averageEmployees: siteText("widget.required-average-employees", "Enter the average number of employees"),
    directorName: siteText("widget.required-director-name", "Enter the name of the director approving the balance sheet"),
    directorDateApproved: siteText("widget.required-director-date-approved", "Enter the date the balance sheet was approved"),
    reviewDate: siteText("widget.required-review-date", "Enter the confirmation statement date"),
    periodStartDate: siteText("widget.required-period-start", "Enter the period start date"),
    periodEndDate: siteText("widget.required-period-end", "Enter the period end date"),
    fromDate: siteText("widget.required-period-start", "Enter the period start date"),
    toDate: siteText("widget.required-period-end", "Enter the period end date"),
    accountingPeriodStartDate: siteText("widget.required-accounting-period-start", "Enter the accounting period start date"),
    accountingPeriodEndDate: siteText("widget.required-accounting-period-end", "Enter the accounting period end date"),
    companyNumber: siteText("widget.required-company-number", "Enter the company number"),
    companyQuery: siteText("widget.required-company-query", "Enter a company name or number"),
    companyAuthCode: siteText("widget.required-company-auth-code", "Enter the company authentication code"),
    registeredEmailAddress: siteText("widget.required-registered-email", "Enter the new registered email address"),
  };

  function labelOf(input) {
    return input.labels?.[0]?.textContent?.trim() || input.id;
  }

  function requiredMessage(input) {
    return (
      input.dataset.requiredMessage ||
      REQUIRED_MESSAGES[input.id] ||
      siteText("widget.required-field", "Enter {label}", { label: labelOf(input) })
    );
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
    hidden.textContent = siteText("widget.error-prefix", "Error: ");
    text.append(hidden, message);
    const folded = input.closest("details");
    if (folded) folded.open = true;
    const anchor = input.closest(".input-prefix") || input.closest(".choice") || input;
    const ledgerRowHeader = input.closest(".ledger tbody tr")?.querySelector("th");
    if (ledgerRowHeader) ledgerRowHeader.append(text);
    else anchor.parentNode.insertBefore(text, anchor);
    const describedBy = (input.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
    input.setAttribute("aria-describedby", [...describedBy, text.id].join(" "));
    input.setAttribute("aria-invalid", "true");
    input.classList.add("input--error");
    input.closest(".form-group")?.classList.add("form-group--error");
  }

  function summaryHost(firstInput) {
    return firstInput.closest("form") || firstInput.closest(".send-step, .form-container, .results-container") || firstInput.parentNode;
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
    heading.textContent = siteText("widget.error-summary", "There is a problem");
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
      // A corrected field takes its line out of the summary, and the summary goes with its last line.
      const clearOnChange = () => {
        clearFieldError(input);
        item.remove();
        if (!list.children.length) summary.remove();
      };
      input.addEventListener("input", clearOnChange, { once: true });
      input.addEventListener("change", clearOnChange, { once: true });
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

  // Checks a VAT registration number field (blank, then 9 numbers) and any other required fields in page order.
  function requireVatNumberAnd(vrnId, otherIds = []) {
    const errors = [vrnId, ...otherIds]
      .map((id) => document.getElementById(id))
      .filter((input) => input && String(input.value ?? "").trim() === "")
      .map((input) => ({ input, message: requiredMessage(input) }));
    const vrn = document.getElementById(vrnId);
    if (vrn && vrn.value.trim() !== "" && !/^\d{9}$/.test(vrn.value.trim())) {
      errors.unshift({ input: vrn, message: siteText("widget.vrn-nine-numbers", "The VAT registration number must be 9 numbers") });
    }
    showFormErrors(errors);
    return errors.length === 0;
  }

  // Shows an error for each required text, number, date or select field that is visible, enabled and blank.
  function requireFormFields(form) {
    const ids = Array.from(form.querySelectorAll("input[required], select[required], textarea[required]"))
      .filter((input) => input.id && !input.disabled && input.type !== "checkbox" && input.type !== "radio" && input.offsetParent !== null)
      .map((input) => input.id);
    return requireFields(ids);
  }

  // Shows an error for each unchecked box. messages maps a checkbox id to its message.
  function requireChecked(messages) {
    const errors = Object.entries(messages)
      .map(([id, message]) => ({ input: document.getElementById(id), message }))
      .filter(({ input }) => input && !input.checked);
    showFormErrors(errors);
    return errors.length === 0;
  }

  function moneyMessage(input) {
    const label = labelOf(input);
    if (window.readMoneyInput(input) !== null)
      return siteText("widget.money-negative", "The amount cannot be negative. Check {label}.", { label });
    if (input.dataset.money === "whole-pounds") {
      return siteText("widget.money-whole-pounds", "Enter an amount in a whole number of pounds, like £600 or £1,200. Check {label}.", {
        label,
      });
    }
    return siteText("widget.money-pounds-pence", "Enter an amount in pounds and pence, like £600 or £193.54. Check {label}.", { label });
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

  window.formErrors = {
    showFormErrors,
    clearFormErrors,
    requireFields,
    requireVatNumberAnd,
    requireFormFields,
    requireChecked,
    reportMoneyProblems,
  };
})();
