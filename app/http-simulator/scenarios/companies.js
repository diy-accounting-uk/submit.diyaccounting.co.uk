// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/companies.js
// The Companies House simulator's public register: each company of fixtures/register.js as the
// public data API gives it, with its officers and persons with significant control. The numbers are
// ones Companies House does not issue; the dates are computed from the day the simulator starts.
// 00000004 is the confirmation statement journey's company, so its public register lookup (this
// file) and its XML Gateway company data (confirmation-statement.js) answer for the same company.
// 00000007 is the company of the Precision Code Ltd book (mcp/test/fixtures/precision-code-ltd-full/
// book.toml), with the book's address as its registered office, so the MCP harness files that
// book's accounts for it.

import { accountsDueNineMonthsAfter } from "../../../web/public/lib/accounting-reference-period.js";
import { registerCompanies, addressLine1 } from "../fixtures/register.js";

const REGISTER = registerCompanies();

function profileOf(company) {
  return {
    company_name: company.name,
    company_number: company.number,
    company_status: company.status,
    type: "ltd",
    date_of_creation: company.incorporatedOn,
    jurisdiction: company.jurisdiction,
    registered_office_address: {
      address_line_1: addressLine1(company.address),
      locality: company.address.locality,
      postal_code: company.address.postalCode,
      country: company.address.country,
    },
    sic_codes: company.sicCodes,
    accounts: {
      accounting_reference_date: company.accounts.accountingReferenceDate,
      next_accounts: {
        due_on: company.accounts.next.due,
        period_start_on: company.accounts.next.start,
        period_end_on: company.accounts.next.end,
      },
      ...(company.accounts.last
        ? {
            last_accounts: {
              made_up_to: company.accounts.last.end,
              period_start_on: company.accounts.last.start,
              period_end_on: company.accounts.last.end,
              type: company.accounts.last.type,
            },
          }
        : {}),
    },
    confirmation_statement: {
      next_due: company.confirmationStatementDates.due,
      next_made_up_to: company.confirmationStatementDates.madeUpTo,
    },
  };
}

const companies = Object.fromEntries(REGISTER.map((company) => [company.number, profileOf(company)]));

const RATE_LIMITED_COMPANY_NUMBER = "42942942";

// Each company's name and accounts as the fixtures give them, to put back between test runs.
const fixtureNames = Object.fromEntries(Object.entries(companies).map(([number, company]) => [number, company.company_name]));
const fixtureAccounts = structuredClone(
  Object.fromEntries(Object.entries(companies).map(([number, company]) => [number, company.accounts])),
);

/** Put every company's name and accounting period back to its fixture. */
export function resetCompanyFixtures() {
  for (const [number, company] of Object.entries(companies)) {
    company.company_name = fixtureNames[number];
    company.accounts = structuredClone(fixtureAccounts[number]);
  }
}

/** Every company's number and present name. */
export function companyNames() {
  return Object.values(companies).map((company) => ({ number: company.company_number, name: company.company_name }));
}

/**
 * Give a company a new name, as an accepted change of name does.
 * @param {string} companyNumber
 * @param {string} name
 */
export function setCompanyName(companyNumber, name) {
  if (companies[companyNumber]) companies[companyNumber].company_name = name;
}

/**
 * Set a company's accounting reference date to the day and month of a new period end, as an
 * accepted change to a period the register does not list yet does.
 * @param {string} companyNumber
 * @param {string} periodEnd - ISO date
 */
export function setAccountingReferenceDate(companyNumber, periodEnd) {
  const accounts = companies[companyNumber]?.accounts;
  if (!accounts) return;
  const [, month, day] = periodEnd.split("-");
  accounts.accounting_reference_date = { day, month };
}

/**
 * Move the end of a company's next accounts period, as an accepted change to that period does: the
 * period's end, the accounting reference date's day and month, and the date the accounts fall due.
 * @param {string} companyNumber
 * @param {string} periodEnd - ISO date
 */
export function setNextAccountingPeriodEnd(companyNumber, periodEnd) {
  const accounts = companies[companyNumber]?.accounts;
  if (!accounts?.next_accounts) return;
  const [, month, day] = periodEnd.split("-");
  accounts.accounting_reference_date = { day, month };
  accounts.next_accounts = { ...accounts.next_accounts, period_end_on: periodEnd, due_on: accountsDueNineMonthsAfter(periodEnd) };
}

const verification = (verified) =>
  verified
    ? {
        appointment_verification_end_on: "9999-12-31",
        appointment_verification_start_on: "2025-11-18",
        verification_statement_due_on: null,
      }
    : null;

function officersOf(company) {
  if (company.officers.length === 0) return null;
  return {
    active_count: company.officersActiveCount ?? company.officers.length,
    resigned_count: 0,
    items: company.officers.map((officer) => ({
      name: `${officer.surname.toUpperCase()}, ${officer.forename}`,
      officer_role: officer.role,
      appointed_on: officer.appointedOn,
      date_of_birth: { month: officer.dateOfBirth.month, year: officer.dateOfBirth.year },
      nationality: officer.nationality,
      country_of_residence: officer.countryOfResidence,
      identity_verification_details: verification(officer.verified),
    })),
  };
}

function pscsOf(company) {
  if (company.pscs.length === 0) return null;
  return {
    active_count: company.pscs.filter((psc) => psc.kind.startsWith("individual")).length,
    ceased_count: 0,
    items: company.pscs.map((psc, index) => {
      const id = `sim-psc-${company.number.toLowerCase()}-${index + 1}`;
      if (psc.kind.startsWith("corporate")) {
        return {
          name: psc.name,
          kind: psc.kind,
          links: { self: `/company/${company.number}/persons-with-significant-control/corporate-entity/${id}` },
          natures_of_control: psc.naturesOfControl,
          notified_on: psc.notifiedOn,
          ceased_on: null,
        };
      }
      return {
        name: `${psc.forename} ${psc.surname}`,
        name_elements: { title: psc.title, forename: psc.forename, surname: psc.surname },
        kind: psc.kind,
        links: { self: `/company/${company.number}/persons-with-significant-control/individual/${id}` },
        natures_of_control: psc.naturesOfControl,
        notified_on: psc.notifiedOn,
        ceased_on: null,
        date_of_birth: { month: psc.dateOfBirth.month, year: psc.dateOfBirth.year },
        nationality: psc.nationality,
        identity_verification_details: verification(psc.verified),
      };
    }),
  };
}

const officersByCompanyNumber = Object.fromEntries(
  REGISTER.map((company) => [company.number, officersOf(company)]).filter(([, officers]) => officers),
);
const pscsByCompanyNumber = Object.fromEntries(REGISTER.map((company) => [company.number, pscsOf(company)]).filter(([, pscs]) => pscs));

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
