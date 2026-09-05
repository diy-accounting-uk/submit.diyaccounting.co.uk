// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/companies.js
// Fixture companies for the Companies House simulator. Dates for the two invented
// companies sit far in the future so a fixture never expires into a failing assertion.

const companies = {
  "06846849": {
    company_name: "DIY ACCOUNTING LIMITED",
    company_number: "06846849",
    company_status: "active",
    type: "ltd",
    date_of_creation: "2009-04-16",
    jurisdiction: "england-wales",
    registered_office_address: {
      address_line_1: "The Old Rectory",
      locality: "Pulham Market",
      postal_code: "IP21 4XW",
      country: "United Kingdom",
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
  "00000001": {
    company_name: "SIMULATOR DISSOLVED COMPANY LIMITED",
    company_number: "00000001",
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
};

const RATE_LIMITED_COMPANY_NUMBER = "42942942";

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
