// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The rules of the company deadlines lookup: the lookup request, the days left, the filing to
// offer for a company and the words for each error. The page script shows what these return.

export const LOOKUP_PATH = "/api/v1/public/company-deadlines";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MILLISECONDS_PER_DAY = 86400000;

// A company in one of these states has nothing left to file.
const STATUSES_WITH_NO_FILING = ["dissolved", "converted-closed"];

const ACCOUNTS_PAGES = {
  micro: { label: "File micro-entity accounts", href: "micro-entity-accounts.html" },
  small: { label: "File small company accounts", href: "small-company-accounts.html" },
  dormant: { label: "File dormant company accounts", href: "dormant-company-accounts.html" },
};
const ACCOUNTS_PAGE_FOR_TYPE = {
  "micro-entity": ACCOUNTS_PAGES.micro,
  "small": ACCOUNTS_PAGES.small,
  "total-exemption-small": ACCOUNTS_PAGES.small,
  "dormant": ACCOUNTS_PAGES.dormant,
};
export const CONFIRMATION_STATEMENT_PAGE = { label: "File a confirmation statement", href: "confirmation-statement.html" };

export class LookupError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "LookupError";
    this.status = status;
  }
}

export function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** Whole days from today to the due date; negative when the date has passed. Both are YYYY-MM-DD. */
export function daysLeft(dueIso, todayIso) {
  return Math.round((Date.parse(`${dueIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / MILLISECONDS_PER_DAY);
}

export function daysLeftWords(days) {
  if (days < 0) {
    const late = -days;
    return `overdue by ${late} ${late === 1 ? "day" : "days"}`;
  }
  if (days === 0) return "due today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/** The line for one date: the date, then the days left or overdue. A missing date says so. */
export function deadlineLine(dueIso, todayIso) {
  if (!dueIso) return "No date is held for this company";
  return `${formatDate(dueIso)} (${daysLeftWords(daysLeft(dueIso, todayIso))})`;
}

/** A company number is 8 characters with at least one digit, or fewer digits that Companies House pads with zeros. */
export function isCompanyNumber(query) {
  return /^(?=.*\d)[A-Za-z0-9]{8}$/.test(query) || /^\d{1,8}$/.test(query);
}

export function lookupUrl(query) {
  const trimmed = query.trim();
  const parameter = isCompanyNumber(trimmed) ? "number" : "q";
  return `${LOOKUP_PATH}?${parameter}=${encodeURIComponent(trimmed)}`;
}

/** The accounts pages that fit the type of the last accounts; all three when the type does not say. */
export function accountsPagesFor(lastAccountsType) {
  const page = ACCOUNTS_PAGE_FOR_TYPE[lastAccountsType];
  return page ? [page] : Object.values(ACCOUNTS_PAGES);
}

/** The filing actions for a company. A dissolved or converted company has none. */
export function filingActions(company) {
  if (STATUSES_WITH_NO_FILING.includes(company.companyStatus)) return { accounts: [], confirmationStatement: null };
  return { accounts: accountsPagesFor(company.lastAccountsType), confirmationStatement: CONFIRMATION_STATEMENT_PAGE };
}

export function statusWords(status) {
  return status ? status.replace(/-/g, " ") : "not stated";
}

export function errorMessage(status) {
  if (status === 400) return "Type a company number of 8 characters, or at least 2 characters of a name.";
  if (status === 404) return "Companies House has no company with that number.";
  if (status === 429) return "Companies House is busy. Try again in a few minutes.";
  return "Companies House did not answer. Try again in a few minutes.";
}

/** Reads the lookup. Resolves to the JSON body; rejects with a LookupError that carries the status. */
export async function fetchLookup(query, fetchImplementation = fetch) {
  let response;
  try {
    response = await fetchImplementation(lookupUrl(query), { headers: { Accept: "application/json" } });
  } catch {
    throw new LookupError(0, errorMessage(0));
  }
  if (!response.ok) throw new LookupError(response.status, errorMessage(response.status));
  try {
    return await response.json();
  } catch {
    throw new LookupError(502, errorMessage(502));
  }
}
