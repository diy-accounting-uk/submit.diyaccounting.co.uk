// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// hosted-register-book.js -- new_book_from_register on the hosted connector: a limited company's
// next DIYA-GL book from what Companies House holds, read through DIY Accounting Submit's own
// register reads, built by the published diya-gl tool's own handler, and saved to the person's
// account as a new book. The company profile, the current officers and the last filed iXBRL accounts
// come from the public register read; the statement of capital and the shareholdings come from the
// confirmation statement data read, which takes the company authentication code, so only when the
// person gives a codesEntryId from request_companies_house_codes.

import { z } from "zod";

import { readBookSource } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js";
import { TOOLS as DIYA_GL_TOOLS } from "@diy-accounting-uk/diya-gl/dist/app/lib/mcp/diya-gl-tools.js";
import { PRODUCTS } from "@diy-accounting-uk/diya-gl/dist/app/lib/products.js";

import { callSubmitApi, getConfirmationStatementData } from "./submit-tools.js";
import { saveNewBook } from "./hosted-write-tools.js";
import { ADDS_OUTSIDE } from "./tool-annotations.js";

const pick = (object, names) =>
  Object.fromEntries(names.filter((name) => object?.[name] !== undefined && object[name] !== null).map((name) => [name, object[name]]));

/**
 * The builder's input from the register reads: the profile and officer fields it takes, the
 * statement of capital and the holders' names only, never a date of birth, a nationality or an
 * address of a person.
 * @param {{profile: Object, officers?: Object[]}} register - the public register read's answer
 * @param {Object|null} filingData - the confirmation statement data read's answer
 */
export function registerInput(register, filingData) {
  const input = {
    profile: {
      ...pick(register.profile, [
        "companyNumber",
        "companyName",
        "dateOfCreation",
        "accountsNextPeriodStart",
        "accountsNextPeriodEnd",
        "accountsLastPeriodEnd",
      ]),
      registeredOffice: pick(register.profile?.registeredOffice, [
        "addressLine1",
        "addressLine2",
        "addressLine3",
        "cityOrTown",
        "postalCode",
      ]),
    },
    officers: (register.officers ?? []).map((officer) => pick(officer, ["name", "officerRole", "appointedOn", "resignedOn"])),
  };
  const statement = filingData?.statementOfCapital;
  if (statement) {
    input.capital = {
      ...pick(statement, ["shareCurrency", "totalAggregateNominalValue"]),
      shares: (statement.shares ?? []).map((share) => pick(share, ["shareClass", "numShares", "aggregateNominalValue"])),
    };
    input.shareholdings = (filingData.shareholdings ?? []).map((holding) => ({
      ...pick(holding, ["shareClass", "numberHeld"]),
      shareholders: (holding.shareholders ?? []).map((holder) => pick(holder, ["forename", "surname", "amalgamatedName"])),
    }));
    if (filingData.madeUpDate) input.capitalDate = filingData.madeUpDate;
  }
  return input;
}

// The last filed accounts as the builder takes them, or the reason they could not be read.
async function lastAccountsOf(filedAccounts) {
  if (filedAccounts?.status !== "ixbrl" || !filedAccounts.ixbrl) return { lastAccounts: null, unread: filedAccounts?.status ?? "none" };
  try {
    const read = await readBookSource(new TextEncoder().encode(filedAccounts.ixbrl), "accounts.xhtml", { products: PRODUCTS });
    return { lastAccounts: read.accounts ?? null, unread: read.accounts ? null : "unreadable" };
  } catch (error) {
    return { lastAccounts: null, unread: error.message };
  }
}

async function newBookFromRegister(session, { companyNumber, periodEnd, codesEntryId, madeUpDate, clientId } = {}) {
  if (!companyNumber) throw new Error("new_book_from_register requires companyNumber");
  const number = String(companyNumber).trim().toUpperCase();
  const register = await callSubmitApi(session, `/api/v1/public/company-register?number=${encodeURIComponent(number)}`);
  const filingData = codesEntryId
    ? await getConfirmationStatementData(session, {
        companyNumber: number,
        codesEntryId,
        madeUpDate: madeUpDate ?? new Date().toISOString().slice(0, 10),
      })
    : null;
  const { lastAccounts, unread } = await lastAccountsOf(register.filedAccounts);
  const input = { ...registerInput(register, filingData), ...(lastAccounts ? { lastAccounts } : {}), ...(periodEnd ? { periodEnd } : {}) };
  const built = await DIYA_GL_TOOLS.new_book_from_register.handler({ book: null, lines: null }, input);
  const summary = await saveNewBook(session, built.book, built.lines, { clientId, change: { tool: "new_book_from_register" } });
  return {
    ...summary,
    fromFiledAccounts: Boolean(lastAccounts),
    ...(lastAccounts ? {} : { filedAccountsNotRead: unread }),
    withCapital: Boolean(input.capital),
    differences: built.differences,
  };
}

export const HOSTED_REGISTER_BOOK_OVERRIDES = {
  new_book_from_register: {
    title: "Start a company's DIYA-GL book from Companies House",
    annotations: ADDS_OUTSIDE,
    description:
      "Starts the DIYA-GL book of a limited company's next accounting period from the Companies House register: the " +
      "company, its registered office, its current directors and secretaries, and the roll forward of its last filed " +
      "accounts when the register holds them as iXBRL, so the opening balance sheet equals the filed closing one. With " +
      "a codesEntryId it also writes in the statement of capital and the shareholders. Saves it in the person's DIY " +
      "Accounting Submit account as a new book, which becomes the open one. It changes no other DIYA-GL book and files nothing.",
    inputSchema: {
      companyNumber: z.string().describe("The company's registration number"),
      periodEnd: z.string().optional().describe("The year end chosen, YYYY-MM-DD, on or after the register's next period end"),
      codesEntryId: z
        .string()
        .optional()
        .describe(
          "An entry request_companies_house_codes answered (kind confirmation-statement-data), to add the capital and the shareholders",
        ),
      madeUpDate: z.string().optional().describe("The date the shareholdings are read as at, YYYY-MM-DD; today by default"),
      clientId: z.string().optional().describe("A practice client's id, to keep the DIYA-GL book in that client's set"),
    },
    handler: newBookFromRegister,
  },
};
