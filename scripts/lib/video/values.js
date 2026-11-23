// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/values.js
//
// Placeholder substitution for a scene script's typed text and filled values. A logged-in script
// cannot hard-code the VAT registration number or National Insurance number it types (the run
// mints a fresh HMRC sandbox test user) and must not hard-code a date range that quietly ages out
// of the API's 366-day window. All of these come from `{{...}}` placeholders resolved here.
//
// `{{hmrcVatNumber}}` and `{{hmrcNino}}` are ordinary named values, not clock placeholders: the
// caller looks them up on the minted test user (journey.js's resolveHmrcTestUser) and passes them
// in as `values`. A script whose hmrcServices never asked for "mtd-income-tax" gets no `hmrcNino`
// value at all, so a stray `{{hmrcNino}}` in its text fails the run the same way any other
// placeholder with no value does — never silently typed as an empty string.
//
// `{{register:<companyNumber>:<field>}}` types a value of a company of the simulator's register
// (app/http-simulator/fixtures/register.js) on the run's day, so a scene types the dates the simulator
// serves and they do not age: REGISTER_FIELDS names each field. `{{register:<n>:<field>:-3}}` moves a
// date field by that many months. An unknown company or field fails the run.
//
// Pure: the clock is a parameter.

import { registerCompany, addMonths } from "../../../app/http-simulator/fixtures/register.js";

function isoDate(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftMonths(date, months) {
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  // Clamp to the target month's last day so "monthsAgo:1" from the 31st lands on a real date.
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return shifted;
}

function shiftDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

const CLOCK_PLACEHOLDERS = {
  today: (_count, now) => isoDate(now),
  daysAgo: (count, now) => isoDate(shiftDays(now, -count)),
  monthsAgo: (count, now) => isoDate(shiftMonths(now, -count)),
  yearsAgo: (count, now) => isoDate(shiftMonths(now, -12 * count)),
};

const PLACEHOLDER = /\{\{([A-Za-z][A-Za-z0-9]*)(?::(\d+))?\}\}/g;

/** The fields `{{register:<companyNumber>:<field>}}` types, each read from the company on the run's day. */
export const REGISTER_FIELDS = {
  name: (company) => company.name,
  director: (company) => (company.officers[0] ? `${company.officers[0].forename} ${company.officers[0].surname}` : undefined),
  periodStart: (company) => company.accounts.next.start,
  periodEnd: (company) => company.accounts.next.end,
  accountsDue: (company) => company.accounts.next.due,
  lastPeriodStart: (company) => company.accounts.last.start,
  lastPeriodEnd: (company) => company.accounts.last.end,
  confirmationStatementMadeUpTo: (company) => company.confirmationStatementDates.madeUpTo,
  confirmationStatementDue: (company) => company.confirmationStatementDates.due,
};

const REGISTER_PLACEHOLDER = /\{\{register:([A-Z0-9]+):([A-Za-z]+)(?::([+-]\d+))?\}\}/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function registerValue(whole, companyNumber, field, monthsOffset, now) {
  const company = registerCompany(companyNumber, now);
  if (!company) throw new Error(`scene script placeholder "${whole}" names a company the register does not hold`);
  const read = REGISTER_FIELDS[field];
  if (!read)
    throw new Error(
      `scene script placeholder "${whole}" names no register field; the fields are ${Object.keys(REGISTER_FIELDS).join(", ")}`,
    );
  const value = read(company);
  if (value === undefined) throw new Error(`scene script placeholder "${whole}" has no value for this company`);
  if (monthsOffset === undefined) return value;
  if (!ISO_DATE.test(value)) throw new Error(`scene script placeholder "${whole}" moves a field that is not a date`);
  return addMonths(value, Number(monthsOffset));
}

// Replaces every {{name}} and {{name:count}} in `text`. An unknown placeholder, or one whose
// value the run never resolved, is a hard failure: a script that silently types "{{vrn}}" into
// HMRC is worse than one that refuses to record.
export function substituteValues(text, values, now = new Date()) {
  const withRegister = String(text).replace(REGISTER_PLACEHOLDER, (whole, companyNumber, field, monthsOffset) =>
    registerValue(whole, companyNumber, field, monthsOffset, now),
  );
  return withRegister.replace(PLACEHOLDER, (whole, name, count) => {
    const clock = CLOCK_PLACEHOLDERS[name];
    if (clock) return clock(count === undefined ? 0 : Number(count), now);
    const value = values[name];
    if (value === undefined || value === null || value === "") {
      throw new Error(`scene script placeholder "${whole}" has no value for this run`);
    }
    return String(value);
  });
}
