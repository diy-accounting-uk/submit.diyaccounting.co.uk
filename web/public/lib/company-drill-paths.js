// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The addresses of the company lookup's drill-down. Each view of a company has a path that reopens
// it: /companies-house/company/<company number> for the profile, then /officers, /psc,
// /filing-history, /accounts, /accounts/<period end>, /accounts/<period end>/<filing id> and
// /confirmation-statement/<made-up date>, and the same under /cy/ for the Welsh page.

(function () {
  "use strict";

  const BASE = "/companies-house/company/";
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const FILING_ID = /^[A-Za-z0-9_-]{1,64}$/;
  const COMPANY_NUMBER = /^[A-Z0-9]{8}$/;
  const SINGLE_VIEWS = ["officers", "psc", "filing-history"];

  // The company number as the register writes it: upper case, a number of digits padded to eight.
  function normaliseCompanyNumber(value) {
    let normalised = String(value || "")
      .trim()
      .toUpperCase();
    if (/^\d+$/.test(normalised)) normalised = normalised.padStart(8, "0");
    return normalised;
  }

  function decodeSegment(segment) {
    try {
      return decodeURIComponent(segment);
    } catch {
      return null;
    }
  }

  /**
   * The view a drill-down path names, or null when the path is not a drill-down path. A path under
   * a company that names no view this page has answers view "unknown".
   * @param {string} pathname
   * @returns {null|{welsh: boolean, companyNumber: string, view: string, periodEnd?: string, filingId?: string, madeUpDate?: string}}
   */
  function parseDrillPath(pathname) {
    const match = String(pathname).match(/^(\/cy)?\/companies-house\/company\/([^/]+)((?:\/[^/]*)*)$/);
    if (!match) return null;
    const welsh = match[1] === "/cy";
    const companyNumber = normaliseCompanyNumber(decodeSegment(match[2]));
    const rest = match[3].split("/").filter(Boolean).map(decodeSegment);
    const unknown = { welsh, companyNumber, view: "unknown" };
    if (!COMPANY_NUMBER.test(companyNumber) || rest.includes(null)) return unknown;
    const [view, first, second] = rest;
    if (rest.length === 0) return { welsh, companyNumber, view: "overview" };
    if (SINGLE_VIEWS.includes(view) && rest.length === 1) return { welsh, companyNumber, view };
    if (view === "accounts" && rest.length === 1) return { welsh, companyNumber, view: "accounts" };
    if (view === "accounts" && rest.length === 2 && DATE.test(first))
      return { welsh, companyNumber, view: "accounts-period", periodEnd: first };
    if (view === "accounts" && rest.length === 3 && DATE.test(first) && FILING_ID.test(second)) {
      return { welsh, companyNumber, view: "accounts-set", periodEnd: first, filingId: second };
    }
    if (view === "confirmation-statement" && rest.length === 2 && DATE.test(first)) {
      return { welsh, companyNumber, view: "confirmation-statement", madeUpDate: first };
    }
    return unknown;
  }

  /**
   * The path of a view of a company.
   * @param {{welsh?: boolean, companyNumber: string, view: string, periodEnd?: string, filingId?: string, madeUpDate?: string}} state
   * @returns {string}
   */
  function drillPath(state) {
    const prefix = (state.welsh ? "/cy" : "") + BASE + encodeURIComponent(normaliseCompanyNumber(state.companyNumber));
    switch (state.view) {
      case "officers":
      case "psc":
      case "filing-history":
      case "accounts":
        return `${prefix}/${state.view}`;
      case "accounts-period":
        return `${prefix}/accounts/${state.periodEnd}`;
      case "accounts-set":
        return `${prefix}/accounts/${state.periodEnd}/${encodeURIComponent(state.filingId)}`;
      case "confirmation-statement":
        return `${prefix}/confirmation-statement/${state.madeUpDate}`;
      default:
        return prefix;
    }
  }

  window.companyDrillPaths = { parseDrillPath, drillPath, normaliseCompanyNumber };
})();
