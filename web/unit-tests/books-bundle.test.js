// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { pathToFileURL } from "node:url";

const LANDLORD_DIRECTORY = path.join(process.cwd(), "mcp/test/fixtures/landlord-uk-property");
const bundleUrl = pathToFileURL(path.join(process.cwd(), "web/public/lib/books-bundle.js")).href;

describe("books-bundle.js", () => {
  it("exposes the book reader, the register book builder, the book writers and the report builder, the five filing derivations, the CT600 figures and long period model and the two accounts derivations", async () => {
    const bundle = await import(bundleUrl);
    expect(Object.keys(bundle).sort()).toEqual([
      "RegisterBookError",
      "accountingPeriodsOf",
      "annualInvestmentAllowanceMaximum",
      "buildBookFromRegister",
      "buildFileReportDocument",
      "canonicalBookToml",
      "canonicalLinesJsonl",
      "ct600FiguresFromBook",
      "deriveCt600FromFigures",
      "deriveItsaAnnualSubmission",
      "deriveItsaQuarterlyUpdate",
      "deriveLongPeriodReturns",
      "deriveUkPropertyAnnual",
      "deriveUkPropertyPeriod",
      "deriveVatReturn",
      "ltdTaxData",
      "mapIxbrlAccounts",
      "microEntityAccountsFromBook",
      "productModule",
      "readBookSource",
      "readBookSources",
      "section455RateChangeDate",
      "smallCompanyAccountsFromBook",
      "splitLongPeriodFigures",
      "stampBook",
      "validateCt600Figures",
      "writeBookJson",
      "writeDiyaGlZip",
    ]);
    for (const name of Object.keys(bundle)) {
      expect(typeof bundle[name]).toBe("function");
    }
  });

  it("reads a filed micro-entity accounts document as a book, and writes it as a JSON file the reader reads back", async () => {
    const bundle = await import(bundleUrl);
    const document = fs.readFileSync(
      path.join(process.cwd(), "app/unit-tests/fixtures/filed-accounts/builder-micro-entity-both-years.xhtml"),
    );
    const read = await bundle.readBookSource(new Uint8Array(document), "accounts.xhtml");
    expect(read.product).toBe("ltd");
    expect(read.lines.length).toBeGreaterThan(0);
    expect(Array.isArray(read.differences)).toBe(true);

    const json = bundle.writeBookJson(read.book, read.lines);
    const again = await bundle.readBookSource(new TextEncoder().encode(json), "book.json");
    expect(again.kind).toBe("json");
    expect(again.lines).toHaveLength(read.lines.length);
    expect(again.book.entityInformation).toEqual(bundle.stampBook(read.book).entityInformation);
  });

  it("writes a book as the book.toml and lines.jsonl text a book link carries", async () => {
    const bundle = await import(bundleUrl);
    const document = fs.readFileSync(
      path.join(process.cwd(), "app/unit-tests/fixtures/filed-accounts/builder-micro-entity-both-years.xhtml"),
    );
    const { book, lines } = await bundle.readBookSource(new Uint8Array(document), "accounts.xhtml");
    const stamped = bundle.stampBook(book);
    const toml = bundle.canonicalBookToml(stamped);
    const jsonl = bundle.canonicalLinesJsonl(lines, stamped);
    expect(toml).toContain("[entityInformation]");
    expect(jsonl.trim().split("\n")).toHaveLength(lines.length);
  });

  it("rejects bytes that are not a book with the reader's own error", async () => {
    const { readBookSource } = await import(bundleUrl);
    await expect(readBookSource(new Uint8Array([1, 2, 3]), "notes.bin")).rejects.toThrow(/notes\.bin/);
  });

  it("reads a JSON book against the precompiled validators", async () => {
    const { readBookSource } = await import(bundleUrl);
    const document = { format: "diya-gl-json", version: 1, product: "bst", book: {}, lines: [] };
    const error = await readBookSource(new TextEncoder().encode(JSON.stringify(document)), "book.json").catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toMatch(/schemas could not be read|not available in the books bundle/);
  });

  async function landlordSource() {
    const { readBookSource } = await import(bundleUrl);
    const zip = new JSZip();
    zip.file("book.toml", fs.readFileSync(path.join(LANDLORD_DIRECTORY, "book.toml")));
    zip.file("lines.jsonl", fs.readFileSync(path.join(LANDLORD_DIRECTORY, "lines.jsonl")));
    return readBookSource(new Uint8Array(await zip.generateAsync({ type: "nodebuffer" })), "landlord.diya-gl.zip");
  }

  it("derives the UK property period's income and expenses from a landlord book", async () => {
    const { deriveUkPropertyPeriod } = await import(bundleUrl);
    const source = await landlordSource();
    const derived = await deriveUkPropertyPeriod(source.book, source.lines, { periodStartDate: "2025-04-06", periodEndDate: "2025-07-05" });
    expect(derived.income).toEqual({ periodAmount: 2000, premiumsOfLeaseGrant: 500, otherIncome: 75.5 });
    expect(derived.expenses).toEqual({ repairsAndMaintenance: 450.25, professionalFees: 120, other: 15 });
    expect(derived.warnings).toEqual([]);
  });

  it("derives the UK property year's adjustments and allowances from a landlord book", async () => {
    const { deriveUkPropertyAnnual } = await import(bundleUrl);
    const source = await landlordSource();
    const derived = await deriveUkPropertyAnnual(source.book, source.lines, { taxYear: "2025-26" });
    expect(derived.adjustments).toEqual({ balancingCharge: 40, privateUseAdjustment: 120 });
    expect(derived.allowances).toEqual({ annualInvestmentAllowance: 1800, costOfReplacingDomesticItems: 640 });
  });
});
