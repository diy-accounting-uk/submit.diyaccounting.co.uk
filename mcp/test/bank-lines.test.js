// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// bank-lines.test.js -- the NatWest current account CSV parser over a
// hand-written statement covering every type it must handle (BAC, DPC,
// D/D, POS, CHG), both directions of DPC, and a running balance that
// checks out line by line.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { bankLinesFromCsv, closingBalance } from "../lib/finance/bank-lines.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "finance");
const STATEMENT = readFileSync(join(FIXTURES, "bank-statement.csv"), "utf8");

describe("bankLinesFromCsv", () => {
  it("emits one validated line per statement transaction", () => {
    const lines = bankLinesFromCsv(STATEMENT, { accountMainID: "1200" });
    expect(lines).toHaveLength(7);
    for (const line of lines) {
      expect(line.sourceJournalID).toBe("bank");
      expect(line.documentType).toBe("bank-statement");
      expect(line.accountMainID).toBe("1200");
      expect(line["diya-gl:bankAccountID"]).toBe("1200");
      expect(line.amount).toBeGreaterThan(0);
      expect(["D", "C"]).toContain(line.debitCreditCode);
    }
  });

  it("carries the statement's own posting dates and amounts, oldest to newest", () => {
    const lines = bankLinesFromCsv(STATEMENT, { accountMainID: "1200" });
    const byDate = [...lines].sort((a, b) => a.postingDate.localeCompare(b.postingDate));
    expect(byDate.map((line) => [line.postingDate, line.amount])).toEqual([
      ["2026-03-01", 955.0],
      ["2026-03-05", 300.0],
      ["2026-03-10", 150.0],
      ["2026-03-15", 50.0],
      ["2026-03-20", 100.0],
      ["2026-03-28", 50.0],
      ["2026-03-31", 5.0],
    ]);
  });

  it("codes a bank charge as B regardless of direction", () => {
    const lines = bankLinesFromCsv(STATEMENT, { accountMainID: "1200" });
    const charge = lines.find((line) => line.postingDate === "2026-03-31");
    expect(charge["diya-gl:bankCode"]).toBe("B");
  });

  it("codes money in as a receipt and money out as a payment for a type seen on both sides", () => {
    const lines = bankLinesFromCsv(STATEMENT, { accountMainID: "1200" });
    const refund = lines.find((line) => line.postingDate === "2026-03-15");
    const hosting = lines.find((line) => line.postingDate === "2026-03-10");
    expect(refund["diya-gl:bankCode"]).toBe("DR");
    expect(refund.debitCreditCode).toBe("D");
    expect(hosting["diya-gl:bankCode"]).toBe("CR");
    expect(hosting.debitCreditCode).toBe("C");
  });

  it("sets debitCreditCode C for a bank charge, which is always money out", () => {
    const lines = bankLinesFromCsv(STATEMENT, { accountMainID: "1200" });
    const charge = lines.find((line) => line.postingDate === "2026-03-31");
    expect(charge.debitCreditCode).toBe("C");
  });

  it("codes the savings account's interest as money in", () => {
    const savings = [
      "Date,Type,Description,Value,Balance,Account Name,Account Number",
      '30 Jan 2026,INT,"30JAN GRS 00000000",0.19,246.64,SAVINGS ACCOUNT,000000-00000000',
    ].join("\n");
    const [line] = bankLinesFromCsv(savings, { accountMainID: "1210" });
    expect(line["diya-gl:bankCode"]).toBe("DR");
    expect(line.debitCreditCode).toBe("D");
    expect(line.amount).toBeCloseTo(0.19, 2);
  });

  it("rejects a type it does not recognise", () => {
    const withUnknownType = STATEMENT.replace("CHG", "XYZ");
    expect(() => bankLinesFromCsv(withUnknownType, { accountMainID: "1200" })).toThrow(/Unrecognised statement type/);
  });

  it("rejects a file without the NatWest header", () => {
    expect(() => bankLinesFromCsv("not,a,statement\n", { accountMainID: "1200" })).toThrow(/Not a NatWest bank statement CSV/);
  });

  it("requires an accountMainID", () => {
    expect(() => bankLinesFromCsv(STATEMENT, {})).toThrow(/accountMainID is required/);
  });
});

describe("closingBalance", () => {
  it("returns the balance carried by the most recent transaction", () => {
    expect(closingBalance(STATEMENT)).toBe(1000.0);
  });

  it("matches the last running balance computed from the emitted lines", () => {
    const lines = bankLinesFromCsv(STATEMENT, { accountMainID: "1200" });
    const byDate = [...lines].sort((a, b) => a.postingDate.localeCompare(b.postingDate));
    let running = 0;
    for (const line of byDate) {
      const signed = line["diya-gl:bankCode"] === "B" || line["diya-gl:bankCode"] === "CR" ? -line.amount : line.amount;
      running += signed;
    }
    expect(running).toBeCloseTo(closingBalance(STATEMENT), 2);
  });
});
