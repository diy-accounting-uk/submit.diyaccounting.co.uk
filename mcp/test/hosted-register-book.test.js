// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSession } from "../lib/book-tools.js";
import { HOSTED_OVERRIDES, HOSTED_TOOL_NAMES, hostedToolNames, REVIEWER_GROUP } from "../lib/hosted-tools.js";
import { HOSTED_REGISTER_BOOK_OVERRIDES, registerInput } from "../lib/hosted-register-book.js";
import { fakeBookStore } from "./helpers/fake-book-store.js";

const FILED_ACCOUNTS = resolve(dirname(fileURLToPath(import.meta.url)), "../../app/unit-tests/fixtures/filed-accounts");
const EXPECTED = JSON.parse(readFileSync(join(FILED_ACCOUNTS, "expected.json"), "utf8"));
const BASE = "https://ci.submit.diyaccounting.co.uk";
const tool = HOSTED_REGISTER_BOOK_OVERRIDES.new_book_from_register;

// The public register read's answer for a company whose last filed accounts are a recorded iXBRL
// document, in the shape companiesHousePublicRegisterGet.js answers.
function registerAnswer({ companyNumber, companyName, lastEnd, nextEnd, document }) {
  return {
    profile: {
      companyNumber,
      companyName,
      dateOfCreation: "2019-03-14",
      registeredOffice: { addressLine1: "1 Castle Street", cityOrTown: "Cardiff", postalCode: "CF10 1BS", country: "Wales" },
      accountsLastPeriodEnd: lastEnd,
      accountsNextPeriodEnd: nextEnd,
      accountsLastType: "micro-entity",
    },
    officers: [
      { name: "PRYS, Owen", officerRole: "director", appointedOn: "2019-03-14" },
      { name: "HUGHES, Carys", officerRole: "secretary", appointedOn: "2020-01-02" },
    ],
    filedAccounts: document
      ? {
          status: "ixbrl",
          madeUpDate: lastEnd,
          accountsType: "micro-entity",
          filedOn: "2026-03-24",
          ixbrl: readFileSync(join(FILED_ACCOUNTS, document), "utf8"),
        }
      : { status: "none" },
  };
}

// The confirmation statement data read's answer: the statement of capital and the holdings, with a
// holder's address, which the book must never take.
const FILING_DATA = {
  madeUpDate: "2026-06-01",
  statementOfCapital: {
    shareCurrency: "GBP",
    totalAggregateNominalValue: "100",
    shares: [{ shareClass: "ORDINARY", numShares: "100", aggregateNominalValue: "100" }],
  },
  shareholdings: [
    { shareClass: "ORDINARY", numberHeld: "60", shareholders: [{ forename: "Owen", surname: "Prys", address: "7 Hidden Lane" }] },
    { shareClass: "ORDINARY", numberHeld: "40", shareholders: [{ forename: "Carys", surname: "Hughes" }] },
  ],
};

function withRegister(store, answers) {
  return vi.fn(async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === "/api/v1/public/company-register") {
      answers.registerReads.push(searchParams.get("number"));
      return { ok: true, status: 200, json: async () => answers.register };
    }
    if (/\/filing-data$/.test(pathname)) {
      answers.filingDataReads.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => FILING_DATA };
    }
    return store.fetch(url, init);
  });
}

function session() {
  return createSession({ credentials: { accessToken: async () => "bearer", idToken: async () => null } });
}

describe("new_book_from_register on the hosted connector", () => {
  let store;
  let answers;

  beforeEach(() => {
    process.env.DIYA_SUBMIT_BASE_URL = BASE;
    process.env.DIY_SUBMIT_BASE_URL = BASE;
    store = fakeBookStore();
    answers = { registerReads: [], filingDataReads: [] };
  });

  afterEach(() => {
    delete process.env.DIYA_SUBMIT_BASE_URL;
    delete process.env.DIY_SUBMIT_BASE_URL;
    vi.unstubAllGlobals();
  });

  it("is offered outside prod only, and adds a DIYA-GL book without replacing one", () => {
    expect(HOSTED_TOOL_NAMES).toContain("new_book_from_register");
    expect(hostedToolNames("prod")).not.toContain("new_book_from_register");
    expect(hostedToolNames("ci", [REVIEWER_GROUP])).not.toContain("new_book_from_register");
    expect(HOSTED_OVERRIDES.new_book_from_register).toBe(tool);
    expect(tool.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, openWorldHint: true });
  });

  it("opens a micro-entity's next DIYA-GL book on the balance sheet its last filed accounts closed on", async () => {
    answers.register = registerAnswer({
      companyNumber: "14948707",
      companyName: "PERSONAL PROTECT INFORMATION LTD",
      lastEnd: "2025-06-30",
      nextEnd: "2026-06-30",
      document: "register-micro-entity-companies-house-both-years.xhtml",
    });
    vi.stubGlobal("fetch", withRegister(store, answers));
    const filed = EXPECTED["register-micro-entity-companies-house-both-years.xhtml"].balanceSheet;
    const opened = session();

    const answer = await tool.handler(opened, { companyNumber: " 14948707 " });

    expect(answers.registerReads).toEqual(["14948707"]);
    expect(answers.filingDataReads).toEqual([]);
    expect(answer).toMatchObject({ version: 1, fromFiledAccounts: true, withCapital: false, period: { end: "2026-06-30" } });
    const opening = opened.book.openingBalances;
    expect(Object.values(opening.bankAccounts).reduce((sum, value) => sum + value, 0) + (opening.tradeDebtors ?? 0)).toBe(
      filed.currentAssets,
    );
    expect(opening.tradeCreditors).toBe(filed.creditorsWithinOneYear);
    expect((opening.shareCapital ?? 0) + opening.retainedEarnings).toBe(filed.capitalAndReserves);
    const put = store.calls.find((call) => call.method === "PUT");
    expect(put.headers).not.toHaveProperty("if-match");
    expect(put.body.change).toEqual({ tool: "new_book_from_register" });
    expect(put.body.title).toBe("PERSONAL PROTECT INFORMATION LTD");
  });

  it("opens a small company's next DIYA-GL book on its filed closing balance sheet, fixed assets included", async () => {
    answers.register = registerAnswer({
      companyNumber: "04095977",
      companyName: "IRIS EXAMPLE LIMITED",
      lastEnd: "2025-10-31",
      nextEnd: "2026-10-31",
      document: "register-small-company-filleted-iris-both-years.xhtml",
    });
    vi.stubGlobal("fetch", withRegister(store, answers));
    const filed = EXPECTED["register-small-company-filleted-iris-both-years.xhtml"].balanceSheet;
    const opened = session();

    await tool.handler(opened, { companyNumber: "04095977" });

    const opening = opened.book.openingBalances;
    const sum = (record) => Object.values(record ?? {}).reduce((total, value) => total + value, 0);
    expect(sum(opening.bankAccounts) + (opening.tradeDebtors ?? 0)).toBe(filed.currentAssets);
    expect(opening.tradeCreditors).toBe(filed.creditorsWithinOneYear);
    expect(sum(opening.fixedAssetCost) - sum(opening.fixedAssetDepreciation)).toBe(filed.netAssets - filed.netCurrentAssets);
    expect(opening.shareCapital + opening.retainedEarnings).toBe(filed.capitalAndReserves);
  });

  it("writes in the company's current officers", async () => {
    answers.register = registerAnswer({
      companyNumber: "14948707",
      companyName: "PERSONAL PROTECT INFORMATION LTD",
      lastEnd: "2025-06-30",
      nextEnd: "2026-06-30",
    });
    vi.stubGlobal("fetch", withRegister(store, answers));
    const opened = session();

    const answer = await tool.handler(opened, { companyNumber: "14948707" });

    expect(answer.fromFiledAccounts).toBe(false);
    expect(answer.filedAccountsNotRead).toBe("none");
    expect(JSON.stringify(opened.book.directors)).toContain("Owen PRYS");
  });

  it("with a codesEntryId, writes in the statement of capital and the shareholders by name only", async () => {
    answers.register = registerAnswer({
      companyNumber: "14948707",
      companyName: "PERSONAL PROTECT INFORMATION LTD",
      lastEnd: "2025-06-30",
      nextEnd: "2026-06-30",
    });
    vi.stubGlobal("fetch", withRegister(store, answers));
    const opened = session();

    const answer = await tool.handler(opened, { companyNumber: "14948707", codesEntryId: "entry-1", madeUpDate: "2026-06-01" });

    expect(answers.filingDataReads).toEqual([{ codesEntryId: "entry-1", madeUpDate: "2026-06-01" }]);
    expect(answer.withCapital).toBe(true);
    const members = JSON.stringify(opened.book);
    expect(members).toContain("Prys");
    expect(members).toContain("Hughes");
    expect(members).not.toContain("Hidden Lane");
  });

  it("takes from the register the fields the builder reads and no person's address", () => {
    const input = registerInput(
      registerAnswer({ companyNumber: "1", companyName: "A", lastEnd: "2025-06-30", nextEnd: "2026-06-30" }),
      FILING_DATA,
    );
    expect(input.profile.registeredOffice).toEqual({ addressLine1: "1 Castle Street", cityOrTown: "Cardiff", postalCode: "CF10 1BS" });
    expect(input.shareholdings[0].shareholders).toEqual([{ forename: "Owen", surname: "Prys" }]);
    expect(input.capitalDate).toBe("2026-06-01");
  });
});
