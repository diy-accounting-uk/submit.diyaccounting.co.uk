// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-labels.js
// Plain-English wording for the values the Companies House API returns:
// en-GB dates, company status, company type, jurisdiction and SIC code text.

(function () {
  "use strict";

  const COMPANY_STATUS = {
    "active": "Active",
    "dissolved": "Dissolved",
    "liquidation": "In liquidation",
    "receivership": "In receivership",
    "administration": "In administration",
    "voluntary-arrangement": "Voluntary arrangement",
    "converted-closed": "Converted or closed",
    "insolvency-proceedings": "Insolvency proceedings",
    "registered": "Registered",
    "removed": "Removed",
    "closed": "Closed",
    "open": "Open",
  };

  const COMPANY_TYPE = {
    "ltd": "Private limited company",
    "plc": "Public limited company",
    "llp": "Limited liability partnership",
    "limited-partnership": "Limited partnership",
    "private-limited-guarant-nsc": "Private company limited by guarantee",
    "private-limited-guarant-nsc-limited-exemption": "Private company limited by guarantee (name exemption)",
    "private-unlimited": "Private unlimited company",
    "private-unlimited-nsc": "Private unlimited company",
    "old-public-company": "Old public company",
    "royal-charter": "Royal charter company",
    "industrial-and-provident-society": "Industrial and provident society",
    "registered-society-non-jurisdictional": "Registered society",
    "scottish-partnership": "Scottish partnership",
    "oversea-company": "Overseas company",
    "uk-establishment": "UK establishment of an overseas company",
    "european-public-limited-liability-company-se": "European public limited-liability company (SE)",
    "charitable-incorporated-organisation": "Charitable incorporated organisation",
    "scottish-charitable-incorporated-organisation": "Scottish charitable incorporated organisation",
    "protected-cell-company": "Protected cell company",
    "investment-company-with-variable-capital": "Investment company with variable capital",
    "unregistered-company": "Unregistered company",
    "other": "Other",
  };

  const JURISDICTION = {
    "england-wales": "England and Wales",
    "wales": "Wales",
    "scotland": "Scotland",
    "northern-ireland": "Northern Ireland",
    "united-kingdom": "United Kingdom",
    "european-union": "European Union",
    "noneu": "Outside the European Union",
  };

  const SIC_TEXT = {
    "01110": "Growing of cereals, leguminous crops and oil seeds",
    "41100": "Development of building projects",
    "41202": "Construction of domestic buildings",
    "43210": "Electrical installation",
    "43220": "Plumbing, heat and air-conditioning installation",
    "43390": "Other building completion and finishing",
    "43999": "Other specialised construction activities not elsewhere classified",
    "45200": "Maintenance and repair of motor vehicles",
    "46900": "Non-specialised wholesale trade",
    "47110": "Retail sale in non-specialised stores with food, beverages or tobacco predominating",
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
    "74909": "Other professional, scientific and technical activities not elsewhere classified",
    "78200": "Temporary employment agency activities",
    "82990": "Other business support service activities not elsewhere classified",
    "85590": "Other education not elsewhere classified",
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
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }

  function formatSicCode(code) {
    const text = SIC_TEXT[code];
    return text ? `${code} - ${text}` : String(code);
  }

  function formatSicCodes(codes) {
    return (codes || []).map(formatSicCode).join("; ");
  }

  window.companiesHouseLabels = {
    formatCompanyDate,
    companyStatusLabel: (value) => labelFrom(COMPANY_STATUS, value),
    companyTypeLabel: (value) => labelFrom(COMPANY_TYPE, value),
    jurisdictionLabel: (value) => labelFrom(JURISDICTION, value),
    formatSicCode,
    formatSicCodes,
  };
})();
