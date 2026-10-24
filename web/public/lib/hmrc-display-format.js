// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/hmrc-display-format.js
// Display formatting for values HMRC returns on the VAT read pages and the receipts page. A value
// that is missing or unreadable shows a dash, never "undefined", "NaN" or "Invalid Date".
// Needs money-format.js loaded first for formatGbp and formatGbpWhole.

(function () {
  "use strict";

  const ABSENT = "—";
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
  const SHORT_DATE = { day: "numeric", month: "short", year: "numeric" };

  function toDate(value) {
    if (value === undefined || value === null || value === "") return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // A date-only string is a calendar day, so it is read and shown in UTC; a browser west of
  // London would otherwise show the day before.
  function dayOptions(value, options) {
    return typeof value === "string" && DATE_ONLY.test(value) ? { ...options, timeZone: "UTC" } : options;
  }

  function formatDate(value) {
    const date = toDate(value);
    if (!date) return ABSENT;
    return date.toLocaleDateString("en-GB", dayOptions(value, SHORT_DATE));
  }

  function formatDateRange(start, end) {
    const from = toDate(start);
    const to = toDate(end);
    if (!from || !to) return ABSENT;
    return `${formatDate(start)} to ${formatDate(end)}`;
  }

  // "30 September 2026 at 11:15", in the browser's time zone.
  function formatDateTime(value) {
    const date = toDate(value);
    if (!date) return ABSENT;
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function toAmount(value) {
    if (value === undefined || value === null || value === "" || typeof value === "boolean") return null;
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatAmount(value) {
    const amount = toAmount(value);
    return amount === null ? ABSENT : window.formatGbp(amount);
  }

  function formatWholeAmount(value) {
    const amount = toAmount(value);
    return amount === null ? ABSENT : window.formatGbpWhole(amount);
  }

  function formatText(value) {
    if (value === undefined || value === null) return ABSENT;
    const text = String(value).trim();
    return text === "" ? ABSENT : text;
  }

  function sentenceCase(value) {
    const text = formatText(value);
    return text === ABSENT ? text : text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Wraps a table so that a table wider than its card scrolls inside itself, not the page.
  function scrollable(table) {
    const wrapper = document.createElement("div");
    wrapper.className = "table-scroll";
    wrapper.setAttribute("style", "overflow-x: auto; max-width: 100%");
    wrapper.appendChild(table);
    return wrapper;
  }

  window.HmrcDisplayFormat = {
    ABSENT,
    formatDate,
    formatDateRange,
    formatDateTime,
    formatAmount,
    formatWholeAmount,
    formatText,
    sentenceCase,
    scrollable,
  };
})();
