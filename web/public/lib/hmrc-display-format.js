// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/hmrc-display-format.js
// Display formatting for values HMRC returns on the VAT read pages and the receipts page. A value
// that is missing or unreadable shows a dash, never "undefined", "NaN" or "Invalid Date".
// Needs money-format.js loaded first for formatGbp and formatGbpWhole.

(function () {
  "use strict";

  // page-chrome.js gives the text in the chosen language; without it the English stands.
  function siteText(id, english, values) {
    if (window.siteText) return window.siteText(id, english, values);
    return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
  }

  // Dates follow the language of the site's text: cy-GB when it reads in Welsh.
  function locale() {
    return window.siteLanguage?.chrome?.() === "cy" ? "cy-GB" : "en-GB";
  }

  // Chromium's Intl has no Welsh dates and falls back to American English, so a Welsh date is
  // written here, with HMRC's Welsh month names.
  const WELSH_MONTHS = [
    "Ionawr",
    "Chwefror",
    "Mawrth",
    "Ebrill",
    "Mai",
    "Mehefin",
    "Gorffennaf",
    "Awst",
    "Medi",
    "Hydref",
    "Tachwedd",
    "Rhagfyr",
  ];
  const WELSH_SHORT_MONTHS = ["Ion", "Chwef", "Maw", "Ebr", "Mai", "Meh", "Gorff", "Awst", "Medi", "Hyd", "Tach", "Rhag"];

  /**
   * A date as the reader reads it: "5 November 2026" or "5 Tachwedd 2026", with "at 09:30" or "am 09:30".
   * @param {Date} date
   * @param {{month?: "long"|"short", utc?: boolean, time?: boolean}} [options] - utc reads a calendar day
   */
  function dateText(date, { month = "long", utc = false, time = false } = {}) {
    if (locale() !== "cy-GB") {
      const options = { day: "numeric", month, year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) };
      return date.toLocaleDateString("en-GB", utc ? { ...options, timeZone: "UTC" } : options);
    }
    const part = (name) => (utc ? date[`getUTC${name}`]() : date[`get${name}`]());
    const day = `${part("Date")} ${(month === "short" ? WELSH_SHORT_MONTHS : WELSH_MONTHS)[part("Month")]} ${part("FullYear")}`;
    if (!time) return day;
    const clock = `${String(part("Hours")).padStart(2, "0")}:${String(part("Minutes")).padStart(2, "0")}`;
    return `${day} am ${clock}`;
  }

  const ABSENT = "—";
  const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

  function toDate(value) {
    if (value === undefined || value === null || value === "") return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // A date-only string is a calendar day, so it is read and shown in UTC; a browser west of
  // London would otherwise show the day before.
  function formatDate(value) {
    const date = toDate(value);
    if (!date) return ABSENT;
    return dateText(date, { month: "short", utc: typeof value === "string" && DATE_ONLY.test(value) });
  }

  function formatDateRange(start, end) {
    const from = toDate(start);
    const to = toDate(end);
    if (!from || !to) return ABSENT;
    return siteText("widget.date-range", "{start} to {end}", { start: formatDate(start), end: formatDate(end) });
  }

  // "30 September 2026 at 11:15", in the browser's time zone.
  function formatDateTime(value) {
    const date = toDate(value);
    if (!date) return ABSENT;
    return dateText(date, { time: true });
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

  // Names every body cell after its column heading, so a narrow screen can show each row as label and value pairs.
  function labelCells(table) {
    const headCells = [...table.querySelectorAll("thead th")];
    const headings = headCells.map((heading) => heading.textContent);
    if (headings.length === 0) return table;
    table.querySelectorAll("tbody tr").forEach((row) => {
      [...row.children].forEach((cell, index) => {
        if (cell.tagName !== "TD" || !headings[index]) return;
        cell.setAttribute("data-label", headings[index]);
        if (headCells[index].classList.contains("money-column")) cell.classList.add("money-column");
      });
    });
    return table;
  }

  // Wraps a table so that a table wider than its card scrolls inside itself, not the page.
  function scrollable(table) {
    const wrapper = document.createElement("div");
    wrapper.className = "table-scroll";
    wrapper.setAttribute("style", "overflow-x: auto; max-width: 100%");
    wrapper.appendChild(labelCells(table));
    return wrapper;
  }

  window.HmrcDisplayFormat = {
    ABSENT,
    locale,
    dateText,
    formatDate,
    formatDateRange,
    formatDateTime,
    formatAmount,
    formatWholeAmount,
    formatText,
    sentenceCase,
    labelCells,
    scrollable,
  };
})();
