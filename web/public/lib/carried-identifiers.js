// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/carried-identifiers.js
// Identifiers the user has already given (VAT number, National Insurance number, business ID,
// tax year, VAT period dates) are remembered for the browser session and filled into the same
// field on the next page, so nothing is typed twice. A field that already holds a value is
// never overwritten.

(function () {
  "use strict";

  const IDENTIFIERS = {
    vrn: { storageKey: "carriedVrn", pattern: /^\d{9}$/ },
    nino: { storageKey: "carriedNino", pattern: /^[A-Z]{2}\d{6}[A-D]$/ },
    businessId: { storageKey: "carriedBusinessId", pattern: /^[A-Za-z0-9]{1,40}$/ },
    taxYear: { storageKey: "carriedTaxYear", pattern: /^\d{4}-\d{2}$/ },
    periodStart: { storageKey: "carriedPeriodStart", pattern: /^\d{4}-\d{2}-\d{2}$/ },
    periodEnd: { storageKey: "carriedPeriodEnd", pattern: /^\d{4}-\d{2}-\d{2}$/ },
  };

  const TAX_YEAR_START_MONTH_INDEX = 3; // April
  const TAX_YEAR_START_DAY = 6;

  function definition(name) {
    const found = IDENTIFIERS[name];
    if (!found) throw new Error(`Unknown carried identifier: ${name}`);
    return found;
  }

  function normalise(name, value) {
    const text = String(value ?? "")
      .replace(/\s+/g, "")
      .trim();
    return name === "nino" ? text.toUpperCase() : text;
  }

  function remember(name, value) {
    const { storageKey, pattern } = definition(name);
    const text = normalise(name, value);
    if (!pattern.test(text)) return false;
    try {
      sessionStorage.setItem(storageKey, text);
      return true;
    } catch {
      return false;
    }
  }

  function recall(name) {
    const { storageKey } = definition(name);
    try {
      return sessionStorage.getItem(storageKey) || "";
    } catch {
      return "";
    }
  }

  function forget(name) {
    const { storageKey } = definition(name);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // storage unavailable: nothing was carried
    }
  }

  function clearAll() {
    for (const name of Object.keys(IDENTIFIERS)) forget(name);
  }

  // Fills an empty field (input or select) with the remembered value. A select is only filled
  // when it has a matching option. Returns true when the field was filled.
  function prefill(name, field) {
    if (!field || field.value) return false;
    const remembered = recall(name);
    if (!remembered) return false;
    if (field.tagName === "SELECT" && !Array.from(field.options).some((option) => option.value === remembered)) return false;
    field.value = remembered;
    return true;
  }

  // Prefills the field now, then remembers its value whenever it changes and when its form
  // is submitted (which covers values set from the address bar).
  function bind(name, field) {
    if (!field) return;
    prefill(name, field);
    const rememberFieldValue = () => remember(name, field.value);
    field.addEventListener("input", rememberFieldValue);
    field.addEventListener("change", rememberFieldValue);
    if (field.form) field.form.addEventListener("submit", rememberFieldValue);
  }

  // The tax year in force on a date, as YYYY-YY. The year starts on 6 April.
  function currentTaxYear(today = new Date()) {
    const startYear =
      today.getMonth() > TAX_YEAR_START_MONTH_INDEX ||
      (today.getMonth() === TAX_YEAR_START_MONTH_INDEX && today.getDate() >= TAX_YEAR_START_DAY)
        ? today.getFullYear()
        : today.getFullYear() - 1;
    return formatTaxYear(startYear);
  }

  function formatTaxYear(startYear) {
    return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
  }

  // The current tax year and the ones before it, newest first, as YYYY-YY.
  function taxYearOptions(today = new Date(), count = 6) {
    const currentStartYear = Number(currentTaxYear(today).slice(0, 4));
    return Array.from({ length: count }, (_, index) => formatTaxYear(currentStartYear - index));
  }

  const api = { IDENTIFIERS, remember, recall, forget, clearAll, prefill, bind, currentTaxYear, taxYearOptions };
  globalThis.CarriedIdentifiers = api;
})();
