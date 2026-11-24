// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { decodeBookFragment } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-link.js";
import { parse as parseToml } from "smol-toml";
import { buildMicroEntityAccounts } from "@app/services/microEntityAccountsIxbrl.js";
import { microInputFromTestServiceCase } from "@app/test-helpers/accountsDocumentCases.js";
import { companyBooks, registerCapital, registerOfficers, registerProfile } from "../public/lib/company-books.js";
import { diyaGlBookAddress } from "../public/lib/diya-gl-link.js";

const bundleUrl = pathToFileURL(path.join(process.cwd(), "web/public/lib/books-bundle.js")).href;
const MICRO_INPUT = microInputFromTestServiceCase(
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/companies-house-test-service-cases.json"), "utf8")).find(
    (testCase) => testCase.name === "micro-entity-accounts",
  ),
);

// The day after an ISO date, and the day a year after that less one: the next accounting period.
function nextPeriodAfter(end) {
  const start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  const nextEnd = new Date(start);
  nextEnd.setUTCFullYear(nextEnd.getUTCFullYear() + 1);
  nextEnd.setUTCDate(nextEnd.getUTCDate() - 1);
  return { start: start.toISOString().slice(0, 10), end: nextEnd.toISOString().slice(0, 10) };
}

function profileOf(input) {
  const next = nextPeriodAfter(input.periodEnd);
  return {
    companyNumber: input.companyNumber,
    companyName: input.companyName,
    dateOfCreation: "2015-03-02",
    registeredOffice: { addressLine1: "4 Quay Street", cityOrTown: "Whitby", postalCode: "YO21 1PJ", country: "England" },
    accountsLastPeriodEnd: input.periodEnd,
    accountsNextPeriodStart: next.start,
    accountsNextPeriodEnd: next.end,
    confirmationStatementNextMadeUpTo: "2026-05-01",
    sicCodes: ["62012"],
  };
}

describe("company-books", () => {
  test("the builder's inputs hold the register's names, office, roles, dates and holdings, and no birth date, nationality or address", () => {
    const profile = registerProfile({
      companyNumber: "00000008",
      companyName: "HARBOUR LIGHT LIMITED",
      registeredOffice: { addressLine1: "4 Quay Street", cityOrTown: "Whitby", postalCode: "YO21 1PJ", country: "England" },
      sicCodes: ["62012"],
    });
    expect(profile).toEqual({
      companyNumber: "00000008",
      companyName: "HARBOUR LIGHT LIMITED",
      registeredOffice: { addressLine1: "4 Quay Street", cityOrTown: "Whitby", postalCode: "YO21 1PJ" },
    });
    expect(
      registerOfficers([
        {
          name: "BRAMWELL, Eleanor",
          officerRole: "director",
          appointedOn: "2015-03-02",
          dateOfBirth: { month: 4, year: 1980 },
          nationality: "British",
          address: { addressLine1: "1 Home Road" },
        },
      ]),
    ).toEqual([{ name: "BRAMWELL, Eleanor", officerRole: "director", appointedOn: "2015-03-02" }]);
    const capital = registerCapital({
      madeUpDate: "2026-05-01",
      statementOfCapital: {
        shareCurrency: "GBP",
        totalAggregateNominalValue: "100",
        shares: [{ shareClass: "ORDINARY", numShares: "100", aggregateNominalValue: "100", prescribedParticulars: "One vote" }],
      },
      shareholdings: [
        {
          shareClass: "ORDINARY",
          numberHeld: "100",
          shareholders: [{ forename: "Eleanor", surname: "Bramwell", address: { addressLine1: "1 Home Road" }, dateOfBirth: "1980-04-12" }],
        },
      ],
      officers: [{ dateOfBirth: "1980-04-12" }],
    });
    expect(capital).toEqual({
      capital: {
        shareCurrency: "GBP",
        totalAggregateNominalValue: "100",
        shares: [{ shareClass: "ORDINARY", numShares: "100", aggregateNominalValue: "100" }],
      },
      shareholdings: [{ shareClass: "ORDINARY", numberHeld: "100", shareholders: [{ forename: "Eleanor", surname: "Bramwell" }] }],
      capitalDate: "2026-05-01",
    });
    expect(JSON.stringify(capital)).not.toMatch(/Home Road|1980/);
    expect(registerCapital({})).toEqual({});
  });

  test("accounts built here, filed and read back give a next year whose package opens on the filed balance sheet", async () => {
    const bundle = await import(bundleUrl);
    const filedDocument = buildMicroEntityAccounts(MICRO_INPUT);
    const profile = profileOf(MICRO_INPUT);

    const books = await companyBooks(bundle, {
      profile,
      officers: [{ name: "BRAMWELL, Eleanor", officerRole: "director" }],
      filedDocument,
    });

    expect(books.unread).toBeNull();
    expect(books.filed).not.toBeNull();
    expect([books.next.start, books.next.end]).toEqual([profile.accountsNextPeriodStart, profile.accountsNextPeriodEnd]);
    const address = await diyaGlBookAddress("https://ci.diya-gl.co.uk/", books.next.texts, { download: "package" });
    const { toml, lines } = decodeBookFragment(address.split("#book=")[1]);
    const book = parseToml(toml);
    expect(book.entityInformation.organizationIdentifier).toBe(MICRO_INPUT.companyName);
    const parsedLines = lines
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const { balanceSheet } = await bundle.microEntityAccountsFromBook(book, parsedLines);
    const filed = bundle.mapIxbrlAccounts(filedDocument, { regime: "any" }).balanceSheet.currentYear;
    for (const [line, figure] of Object.entries(balanceSheet.priorYear)) expect([line, figure]).toEqual([line, filed[line]]);
  });

  test("a company with no readable last accounts gets a next year with no opening balances", async () => {
    const bundle = await import(bundleUrl);
    const profile = profileOf(MICRO_INPUT);

    const books = await companyBooks(bundle, { profile, filedDocument: "<html><body>Scanned accounts</body></html>" });

    expect(books.filed).toBeNull();
    expect(books.unread).toEqual(expect.any(String));
    expect(books.next.texts.lines.trim()).toBe("");
    expect(books.next.differences.map((difference) => difference.code)).toContain("no-figures");
  });

  test("the shareholders and capital the code gives reach the book's members", async () => {
    const bundle = await import(bundleUrl);
    const profile = profileOf(MICRO_INPUT);
    const shares = String(MICRO_INPUT.balanceSheet.current.calledUpShareCapital);
    const filingData = {
      madeUpDate: "2026-05-01",
      statementOfCapital: {
        shareCurrency: "GBP",
        totalAggregateNominalValue: shares,
        shares: [{ shareClass: "ORDINARY", numShares: shares, aggregateNominalValue: shares }],
      },
      shareholdings: [{ shareClass: "ORDINARY", numberHeld: shares, shareholders: [{ forename: "Eleanor", surname: "Bramwell" }] }],
    };

    const books = await companyBooks(bundle, { profile, filedDocument: buildMicroEntityAccounts(MICRO_INPUT), filingData });

    const book = parseToml(books.next.texts.toml);
    expect(JSON.stringify(book.members)).toContain("Bramwell");
    expect(books.next.differences.map((difference) => difference.code)).not.toContain("no-members");
  });
});
