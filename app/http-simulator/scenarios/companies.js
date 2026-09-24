// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/companies.js
// Fixture companies for the Companies House simulator. 00000001 is the company number Companies
// House's own filing API guide uses in its scope examples
// (developer-specs.company-information.service.gov.uk, "Manipulate Company Data (API Filing)"),
// and it is not on the live register. Dates sit far in the future so a fixture never expires
// into a failing assertion. 06846849 reuses DIY Accounting Limited's own company number so the
// confirmation statement journey's public register lookup (this file) and its XML Gateway
// fixture (confirmation-statement.js's FIXTURE_COMPANY) answer for the same company number.

const companies = {
  "00000001": {
    company_name: "SIMULATOR EXAMPLE COMPANY LIMITED",
    company_number: "00000001",
    company_status: "active",
    type: "ltd",
    date_of_creation: "2009-04-16",
    jurisdiction: "england-wales",
    registered_office_address: {
      address_line_1: "1 Example Street",
      locality: "Cardiff",
      postal_code: "CF14 3UZ",
      country: "Wales",
    },
    sic_codes: ["62012", "69201"],
    accounts: {
      next_accounts: {
        due_on: "2099-01-31",
        period_end_on: "2099-04-30",
      },
    },
    confirmation_statement: {
      next_due: "2099-04-30",
      next_made_up_to: "2099-04-16",
    },
  },
  "SC000000": {
    company_name: "SIMULATOR TEST COMPANY (SCOTLAND) LIMITED",
    company_number: "SC000000",
    company_status: "active",
    type: "ltd",
    date_of_creation: "2015-06-01",
    jurisdiction: "scotland",
    registered_office_address: {
      address_line_1: "1 Simulator Street",
      locality: "Edinburgh",
      postal_code: "EH1 1AA",
      country: "United Kingdom",
    },
    sic_codes: ["62020"],
    accounts: {
      next_accounts: {
        due_on: "2099-06-30",
        period_end_on: "2099-09-30",
      },
    },
    confirmation_statement: {
      next_due: "2099-09-30",
      next_made_up_to: "2099-09-16",
    },
  },
  "00000002": {
    company_name: "SIMULATOR DISSOLVED COMPANY LIMITED",
    company_number: "00000002",
    company_status: "dissolved",
    type: "ltd",
    date_of_creation: "1990-01-01",
    jurisdiction: "england-wales",
    registered_office_address: {
      address_line_1: "2 Simulator Street",
      locality: "London",
      postal_code: "EC1A 1AA",
      country: "United Kingdom",
    },
    sic_codes: ["62090"],
    accounts: {
      next_accounts: {
        due_on: "2099-01-31",
        period_end_on: "2099-04-30",
      },
    },
    confirmation_statement: {
      next_due: "2099-04-30",
      next_made_up_to: "2099-04-16",
    },
  },
  "06846849": {
    company_name: "EXAMPLE CONFIRMATION STATEMENT LIMITED",
    company_number: "06846849",
    company_status: "active",
    type: "ltd",
    date_of_creation: "2009-01-01",
    jurisdiction: "england-wales",
    registered_office_address: {
      address_line_1: "1 Example Street",
      locality: "London",
      postal_code: "AB1 2CD",
      country: "England",
    },
    sic_codes: ["69201", "69202"],
    accounts: {
      next_accounts: {
        due_on: "2099-01-31",
        period_end_on: "2099-04-30",
      },
    },
    confirmation_statement: {
      next_due: "2026-10-05",
      next_made_up_to: "2025-09-21",
    },
  },
};

const RATE_LIMITED_COMPANY_NUMBER = "42942942";

const officersByCompanyNumber = {
  "00000001": {
    active_count: 2,
    resigned_count: 0,
    items: [
      {
        name: "EXAMPLE, Alice",
        officer_role: "director",
        appointed_on: "2015-01-01",
        date_of_birth: { month: 1, year: 1970 },
        nationality: "British",
        country_of_residence: "England",
        identity_verification_details: {
          appointment_verification_end_on: "9999-12-31",
          appointment_verification_start_on: "2025-11-18",
          verification_statement_due_on: null,
        },
      },
      {
        name: "SAMPLE, Bob",
        officer_role: "director",
        appointed_on: "2015-01-01",
        date_of_birth: { month: 2, year: 1975 },
        nationality: "British",
        country_of_residence: "England",
        identity_verification_details: null,
      },
    ],
  },
  "06846849": {
    active_count: 2,
    resigned_count: 0,
    items: [
      {
        name: "EXAMPLE, Alice",
        officer_role: "director",
        appointed_on: "2015-01-01",
        date_of_birth: { month: 1, year: 1970 },
        nationality: "British",
        country_of_residence: "England",
        identity_verification_details: null,
      },
      {
        name: "SAMPLE, Bob",
        officer_role: "director",
        appointed_on: "2015-01-01",
        date_of_birth: { month: 2, year: 1975 },
        nationality: "British",
        country_of_residence: "England",
        identity_verification_details: null,
      },
    ],
  },
};

const pscsByCompanyNumber = {
  "00000001": {
    active_count: 2,
    ceased_count: 0,
    items: [
      {
        name: "Alice Example",
        kind: "individual-person-with-significant-control",
        natures_of_control: ["ownership-of-shares-50-to-75-percent", "voting-rights-50-to-75-percent"],
        notified_on: "2016-04-06",
        ceased_on: null,
        date_of_birth: { month: 1, year: 1970 },
        nationality: "British",
        identity_verification_details: {
          appointment_verification_end_on: "9999-12-31",
          appointment_verification_start_on: "2025-11-18",
          verification_statement_due_on: null,
        },
      },
      {
        name: "Bob Sample",
        kind: "individual-person-with-significant-control",
        natures_of_control: ["ownership-of-shares-25-to-50-percent", "voting-rights-25-to-50-percent"],
        notified_on: "2016-04-06",
        ceased_on: null,
        date_of_birth: { month: 2, year: 1975 },
        nationality: "British",
        identity_verification_details: null,
      },
    ],
  },
  "06846849": {
    active_count: 2,
    ceased_count: 0,
    items: [
      {
        name: "Alice Example",
        kind: "individual-person-with-significant-control",
        natures_of_control: ["ownership-of-shares-50-to-75-percent", "voting-rights-50-to-75-percent"],
        notified_on: "2016-04-06",
        ceased_on: null,
        date_of_birth: { month: 1, year: 1970 },
        nationality: "British",
        identity_verification_details: null,
      },
      {
        name: "Bob Sample",
        kind: "individual-person-with-significant-control",
        natures_of_control: ["ownership-of-shares-25-to-50-percent", "voting-rights-25-to-50-percent"],
        notified_on: "2016-04-06",
        ceased_on: null,
        date_of_birth: { month: 2, year: 1975 },
        nationality: "British",
        identity_verification_details: null,
      },
    ],
  },
};

/**
 * Get a company's officers fixture. Returns null for an unknown company number so the caller can
 * respond 404.
 * @param {string} companyNumber
 * @returns {object|null}
 */
export function getOfficers(companyNumber) {
  return officersByCompanyNumber[companyNumber] || null;
}

/**
 * Get a company's persons with significant control fixture. Returns null for an unknown company
 * number so the caller can respond 404.
 * @param {string} companyNumber
 * @returns {object|null}
 */
export function getPscs(companyNumber) {
  return pscsByCompanyNumber[companyNumber] || null;
}

/**
 * Get a company profile fixture. Returns null for an unknown company number so the
 * caller can respond 404, or { status: 429 } for the reserved rate-limit number.
 * @param {string} companyNumber
 * @returns {object|{status:number}|null}
 */
export function getCompany(companyNumber) {
  if (companyNumber === RATE_LIMITED_COMPANY_NUMBER) {
    return { status: 429 };
  }
  return companies[companyNumber] || null;
}

/**
 * Search the fixture companies by name or number, case-insensitive.
 * @param {string} query
 * @param {number} itemsPerPage
 * @param {number} startIndex
 * @returns {{status:number}|{total_results:number,items_per_page:number,start_index:number,items:object[]}}
 */
export function searchCompanies(query, itemsPerPage, startIndex) {
  if (query && query.trim().toUpperCase() === RATE_LIMITED_COMPANY_NUMBER) {
    return { status: 429 };
  }

  const needle = (query || "").trim().toLowerCase();
  const matches = Object.values(companies).filter(
    (company) => company.company_name.toLowerCase().includes(needle) || company.company_number.toLowerCase().includes(needle),
  );

  const page = matches.slice(startIndex, startIndex + itemsPerPage);

  return {
    total_results: matches.length,
    items_per_page: itemsPerPage,
    start_index: startIndex,
    items: page.map((company) => ({
      company_number: company.company_number,
      title: company.company_name,
      company_status: company.company_status,
      company_type: company.type,
      date_of_creation: company.date_of_creation,
      address_snippet: `${company.registered_office_address.address_line_1}, ${company.registered_office_address.locality}, ${company.registered_office_address.postal_code}`,
    })),
  };
}
