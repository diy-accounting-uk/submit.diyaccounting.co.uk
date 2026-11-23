// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-labels.js
// Plain wording for the values the Companies House API returns, in the chrome's language: dates,
// company status, company type and jurisdiction. The SIC code text stays as Companies House
// publishes it, in English.

(function () {
  "use strict";

  // page-chrome.js gives the text in the chosen language; without it the English stands.
  function siteText(id, english, values) {
    if (window.siteText) return window.siteText(id, english, values);
    return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
  }

  // Chromium's Intl has no Welsh, so a Welsh date is written from the month names here.
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

  function welshChrome() {
    return Boolean(window.siteLanguage && window.siteLanguage.chrome() === "cy");
  }

  // A function, so each label is read in the chrome's language when it is asked for.
  const companyStatuses = () => ({
    "active": siteText("ch.status.active", "Active"),
    "dissolved": siteText("ch.status.dissolved", "Dissolved"),
    "liquidation": siteText("ch.status.liquidation", "In liquidation"),
    "receivership": siteText("ch.status.receivership", "In receivership"),
    "administration": siteText("ch.status.administration", "In administration"),
    "voluntary-arrangement": siteText("ch.status.voluntary-arrangement", "Voluntary arrangement"),
    "converted-closed": siteText("ch.status.converted-closed", "Converted or closed"),
    "insolvency-proceedings": siteText("ch.status.insolvency-proceedings", "Insolvency proceedings"),
    "registered": siteText("ch.status.registered", "Registered"),
    "removed": siteText("ch.status.removed", "Removed"),
    "closed": siteText("ch.status.closed", "Closed"),
    "open": siteText("ch.status.open", "Open"),
  });

  // A function, so each label is read in the chrome's language when it is asked for.
  const companyTypes = () => ({
    "ltd": siteText("ch.type.ltd", "Private limited company"),
    "plc": siteText("ch.type.plc", "Public limited company"),
    "llp": siteText("ch.type.llp", "Limited liability partnership"),
    "limited-partnership": siteText("ch.type.limited-partnership", "Limited partnership"),
    "private-limited-guarant-nsc": siteText("ch.type.private-limited-guarant-nsc", "Private company limited by guarantee"),
    "private-limited-guarant-nsc-limited-exemption": siteText(
      "ch.type.private-limited-guarant-nsc-limited-exemption",
      "Private company limited by guarantee (name exemption)",
    ),
    "private-unlimited": siteText("ch.type.private-unlimited", "Private unlimited company"),
    "private-unlimited-nsc": siteText("ch.type.private-unlimited-nsc", "Private unlimited company"),
    "old-public-company": siteText("ch.type.old-public-company", "Old public company"),
    "royal-charter": siteText("ch.type.royal-charter", "Royal charter company"),
    "industrial-and-provident-society": siteText("ch.type.industrial-and-provident-society", "Industrial and provident society"),
    "registered-society-non-jurisdictional": siteText("ch.type.registered-society-non-jurisdictional", "Registered society"),
    "scottish-partnership": siteText("ch.type.scottish-partnership", "Scottish partnership"),
    "oversea-company": siteText("ch.type.oversea-company", "Overseas company"),
    "uk-establishment": siteText("ch.type.uk-establishment", "UK establishment of an overseas company"),
    "european-public-limited-liability-company-se": siteText(
      "ch.type.european-public-limited-liability-company-se",
      "European public limited-liability company (SE)",
    ),
    "charitable-incorporated-organisation": siteText(
      "ch.type.charitable-incorporated-organisation",
      "Charitable incorporated organisation",
    ),
    "scottish-charitable-incorporated-organisation": siteText(
      "ch.type.scottish-charitable-incorporated-organisation",
      "Scottish charitable incorporated organisation",
    ),
    "protected-cell-company": siteText("ch.type.protected-cell-company", "Protected cell company"),
    "investment-company-with-variable-capital": siteText(
      "ch.type.investment-company-with-variable-capital",
      "Investment company with variable capital",
    ),
    "unregistered-company": siteText("ch.type.unregistered-company", "Unregistered company"),
    "other": siteText("ch.type.other", "Other"),
  });

  // A function, so each label is read in the chrome's language when it is asked for.
  const jurisdictions = () => ({
    "england-wales": siteText("ch.jurisdiction.england-wales", "England and Wales"),
    "wales": siteText("ch.jurisdiction.wales", "Wales"),
    "scotland": siteText("ch.jurisdiction.scotland", "Scotland"),
    "northern-ireland": siteText("ch.jurisdiction.northern-ireland", "Northern Ireland"),
    "united-kingdom": siteText("ch.jurisdiction.united-kingdom", "United Kingdom"),
    "european-union": siteText("ch.jurisdiction.european-union", "European Union"),
    "noneu": siteText("ch.jurisdiction.noneu", "Outside the European Union"),
  });

  const SIC_TEXT = {
    "01110": "Growing of cereals, leguminous crops and oil seeds",
    "10710": "Manufacture of bread; manufacture of fresh pastry goods and cakes",
    "10890": "Manufacture of other food products not elsewhere classified",
    "16230": "Manufacture of other builders' carpentry and joinery",
    "18129": "Printing not elsewhere classified",
    "28290": "Manufacture of other general-purpose machinery not elsewhere classified",
    "41100": "Development of building projects",
    "41202": "Construction of domestic buildings",
    "43210": "Electrical installation",
    "43220": "Plumbing, heat and air-conditioning installation",
    "43320": "Joinery installation",
    "43390": "Other building completion and finishing",
    "43999": "Other specialised construction activities not elsewhere classified",
    "45200": "Maintenance and repair of motor vehicles",
    "46900": "Non-specialised wholesale trade",
    "47110": "Retail sale in non-specialised stores with food, beverages or tobacco predominating",
    "47190": "Other retail sale in non-specialised stores",
    "47910": "Retail sale via mail order houses or via Internet",
    "47990": "Other retail sale not in stores, stalls or markets",
    "49410": "Freight transport by road",
    "55100": "Hotels and similar accommodation",
    "56101": "Licensed restaurants",
    "56302": "Public houses and bars",
    "58290": "Other software publishing",
    "62011": "Ready-made interactive leisure and entertainment software development",
    "62012": "Business and domestic software development",
    "62020": "Information technology consultancy activities",
    "62090": "Other information technology service activities",
    "63110": "Data processing, hosting and related activities",
    "64209": "Activities of other holding companies not elsewhere classified",
    "64999": "Financial intermediation not elsewhere classified",
    "66190": "Activities auxiliary to financial intermediation not elsewhere classified",
    "68100": "Buying and selling of own real estate",
    "68209": "Other letting and operating of own or leased real estate",
    "68320": "Management of real estate on a fee or contract basis",
    "69102": "Solicitors",
    "69201": "Accounting and auditing activities",
    "69202": "Bookkeeping activities",
    "69203": "Tax consultancy",
    "70100": "Activities of head offices",
    "70210": "Public relations and communications activities",
    "70229": "Management consultancy activities other than financial management",
    "71111": "Architectural activities",
    "71122": "Engineering related scientific and technical consulting activities",
    "73110": "Advertising agencies",
    "74100": "Specialised design activities",
    "74201": "Portrait photographic activities",
    "74909": "Other professional, scientific and technical activities not elsewhere classified",
    "78200": "Temporary employment agency activities",
    "82990": "Other business support service activities not elsewhere classified",
    "85590": "Other education not elsewhere classified",
    "86230": "Dental practice activities",
    "86900": "Other human health activities",
    "90030": "Artistic creation",
    "93110": "Operation of sports facilities",
    "96020": "Hairdressing and other beauty treatment",
    "96090": "Other service activities not elsewhere classified",
    "98000": "Residents property management",
    "99999": "Dormant company",
  };

  function titleCaseSlug(slug) {
    const words = String(slug).replace(/-/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function labelFrom(map, value) {
    if (value === undefined || value === null || value === "") return "";
    return map[value] || titleCaseSlug(value);
  }

  function formatCompanyDate(isoDate) {
    if (isoDate === undefined || isoDate === null || isoDate === "") return "";
    const date = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return String(isoDate);
    if (welshChrome()) return `${date.getUTCDate()} ${WELSH_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }

  // A month and year, such as a director's month of birth as the register shows it: "March 1970".
  function formatMonthYear(month, year) {
    if (!month || !year) return "";
    if (welshChrome()) return `${WELSH_MONTHS[Number(month) - 1]} ${year}`;
    return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  function formatSicCode(code) {
    const text = SIC_TEXT[code];
    return text ? `${code} - ${text}` : String(code);
  }

  function formatSicCodes(codes) {
    return (codes || []).map(formatSicCode).join("; ");
  }

  // Today's date where Companies House keeps its register, as YYYY-MM-DD: a form's date of an event
  // that has happened is not after it.
  function todayInTheUnitedKingdom() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(),
    );
  }

  window.companiesHouseLabels = {
    formatCompanyDate,
    todayInTheUnitedKingdom,
    formatMonthYear,
    companyStatusLabel: (value) => labelFrom(companyStatuses(), value),
    companyTypeLabel: (value) => labelFrom(companyTypes(), value),
    jurisdictionLabel: (value) => labelFrom(jurisdictions(), value),
    formatSicCode,
    formatSicCodes,
  };
})();
