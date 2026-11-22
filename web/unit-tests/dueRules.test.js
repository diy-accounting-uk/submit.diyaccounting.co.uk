// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { loadSources } from "../../scripts/tax-sources.mjs";
import * as dueRules from "../../web/public/lib/due/due-rules.js";
import {
  DUE_RULE_FACT_IDS,
  accountingPeriods,
  ct600Rows,
  ctPaymentRows,
  vatReturnDue,
  vatPaymentDue,
  expectedNextVatPeriod,
  itsaStandardRows,
  saPaymentRows,
  changeDue,
} from "../../web/public/lib/due/due-rules.js";

const dues = (rows) => rows.map((row) => row.due);

describe("due rules", () => {
  test("a 12-month period of account is one accounting period with one return and one payment", () => {
    const period = { periodStart: "2025-04-01", periodEnd: "2026-03-31" };
    expect(accountingPeriods(period)).toEqual([period]);
    expect(ct600Rows(period)).toEqual([
      { kind: "ct600", type: "taxes", ...period, due: "2027-03-31", rule: "ct600-12-months", source: "computed" },
    ]);
    expect(ctPaymentRows(period)).toEqual([
      { kind: "ct-payment", type: "taxes", ...period, due: "2027-01-01", rule: "ct-payment-9-months-1-day", source: "computed" },
    ]);
  });

  test("an 18-month period of account splits into two accounting periods, both returns due 12 months after it ends", () => {
    const period = { periodStart: "2025-01-01", periodEnd: "2026-06-30" };
    expect(accountingPeriods(period)).toEqual([
      { periodStart: "2025-01-01", periodEnd: "2025-12-31" },
      { periodStart: "2026-01-01", periodEnd: "2026-06-30" },
    ]);
    expect(dues(ct600Rows(period))).toEqual(["2027-06-30", "2027-06-30"]);
    expect(dues(ctPaymentRows(period))).toEqual(["2026-10-01", "2027-04-01"]);
  });

  test("a period of account over 24 months has no accounting period longer than 12 months", () => {
    const period = { periodStart: "2025-01-01", periodEnd: "2027-06-30" };
    expect(accountingPeriods(period)).toEqual([
      { periodStart: "2025-01-01", periodEnd: "2025-12-31" },
      { periodStart: "2026-01-01", periodEnd: "2026-12-31" },
      { periodStart: "2027-01-01", periodEnd: "2027-06-30" },
    ]);
    expect(accountingPeriods({ periodStart: "2025-03-01", periodEnd: "2027-02-28" })).toHaveLength(2);
    expect(dues(ct600Rows(period))).toEqual(["2028-06-30", "2028-06-30", "2028-06-30"]);
    expect(dues(ctPaymentRows(period))).toEqual(["2026-10-01", "2027-10-01", "2028-04-01"]);
  });

  test("a period of exactly 12 months to the day before its start date stays one period", () => {
    expect(accountingPeriods({ periodStart: "2025-03-15", periodEnd: "2026-03-14" })).toHaveLength(1);
    expect(accountingPeriods({ periodStart: "2025-03-15", periodEnd: "2026-03-15" })).toHaveLength(2);
  });

  test("months counted from a month end land on the month end: 31 May plus 9 months and 1 day is 1 March", () => {
    expect(dues(ctPaymentRows({ periodStart: "2025-06-01", periodEnd: "2026-05-31" }))).toEqual(["2027-03-01"]);
    expect(dues(ctPaymentRows({ periodStart: "2025-07-01", periodEnd: "2026-06-30" }))).toEqual(["2027-04-01"]);
    expect(vatReturnDue("2026-04-30").due).toBe("2026-06-07");
    expect(vatReturnDue("2026-03-31").due).toBe("2026-05-07");
  });

  test("leap years: February's last day counts as a month end both ways", () => {
    expect(dues(ctPaymentRows({ periodStart: "2026-06-01", periodEnd: "2027-05-31" }))).toEqual(["2028-03-01"]);
    expect(dues(ctPaymentRows({ periodStart: "2027-03-01", periodEnd: "2028-02-29" }))).toEqual(["2028-12-01"]);
    expect(dues(ct600Rows({ periodStart: "2027-03-01", periodEnd: "2028-02-29" }))).toEqual(["2029-02-28"]);
    expect(vatReturnDue("2027-02-28").due).toBe("2027-04-07");
    expect(vatReturnDue("2028-01-31").due).toBe("2028-03-07");
  });

  test("a period that starts on February's last day runs 12 months to the day before its anniversary", () => {
    expect(accountingPeriods({ periodStart: "2028-02-29", periodEnd: "2029-02-28" })).toHaveLength(1);
    expect(accountingPeriods({ periodStart: "2027-02-28", periodEnd: "2028-02-27" })).toHaveLength(1);
    expect(accountingPeriods({ periodStart: "2027-02-28", periodEnd: "2028-02-28" })).toEqual([
      { periodStart: "2027-02-28", periodEnd: "2028-02-27" },
      { periodStart: "2028-02-28", periodEnd: "2028-02-28" },
    ]);
    expect(accountingPeriods({ periodStart: "2027-03-01", periodEnd: "2028-02-29" })).toHaveLength(1);
  });

  test("the expected next VAT period after one that ends in late February keeps its day of the month", () => {
    expect(expectedNextVatPeriod({ start: "2027-11-29", end: "2028-02-28" })).toMatchObject({
      periodStart: "2028-02-29",
      periodEnd: "2028-05-28",
    });
    expect(expectedNextVatPeriod({ start: "2026-11-28", end: "2027-02-27" })).toMatchObject({
      periodStart: "2027-02-28",
      periodEnd: "2027-05-27",
    });
    expect(expectedNextVatPeriod({ start: "2027-12-01", end: "2028-02-29" })).toMatchObject({
      periodStart: "2028-03-01",
      periodEnd: "2028-05-31",
    });
  });

  test("a period that ends on the 28th, 29th, 30th or 31st, in a leap year and out of one", () => {
    const due = (periodEnd) => [
      vatReturnDue(periodEnd).due,
      ctPaymentRows({ periodStart: periodEnd, periodEnd })[0].due,
      ct600Rows({ periodStart: periodEnd, periodEnd })[0].due,
    ];
    expect(due("2027-02-28")).toEqual(["2027-04-07", "2027-12-01", "2028-02-29"]);
    expect(due("2028-02-28")).toEqual(["2028-04-04", "2028-11-29", "2029-02-28"]);
    expect(due("2028-02-29")).toEqual(["2028-04-07", "2028-12-01", "2029-02-28"]);
    expect(due("2027-01-29")).toEqual(["2027-03-07", "2027-10-30", "2028-01-29"]);
    expect(due("2028-01-29")).toEqual(["2028-03-07", "2028-10-30", "2029-01-29"]);
    expect(due("2027-01-30")).toEqual(["2027-03-07", "2027-10-31", "2028-01-30"]);
    expect(due("2027-05-30")).toEqual(["2027-07-07", "2028-03-01", "2028-05-30"]);
    expect(due("2027-11-30")).toEqual(["2028-01-07", "2028-09-01", "2028-11-30"]);
    expect(due("2027-01-31")).toEqual(["2027-03-07", "2027-11-01", "2028-01-31"]);
    expect(due("2028-01-31")).toEqual(["2028-03-07", "2028-11-01", "2029-01-31"]);
    expect(due("2027-08-31")).toEqual(["2027-10-07", "2028-06-01", "2028-08-31"]);
  });

  test("a VAT payment is due on its return's deadline", () => {
    expect(vatPaymentDue("2026-03-31")).toEqual({
      kind: "vat-payment",
      type: "taxes",
      periodEnd: "2026-03-31",
      due: "2026-05-07",
      rule: "vat-payment-same-deadline",
      source: "computed",
    });
  });

  test("the expected next VAT period has the same length and is marked expected", () => {
    expect(expectedNextVatPeriod({ start: "2026-01-01", end: "2026-03-31" })).toMatchObject({
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30",
      due: "2026-08-07",
      rule: "vat-return-due-date",
      expected: true,
    });
    expect(expectedNextVatPeriod({ start: "2026-02-01", end: "2026-04-30" })).toMatchObject({
      periodStart: "2026-05-01",
      periodEnd: "2026-07-31",
    });
    expect(expectedNextVatPeriod({ start: "2026-01-01", end: "2026-12-31" })).toMatchObject({ periodEnd: "2027-12-31", due: "2028-02-07" });
  });

  test("the standard Income Tax rows are four cumulative quarters and the final declaration", () => {
    const rows = itsaStandardRows("2026-27");
    expect(rows.map((row) => [row.periodEnd, row.due])).toEqual([
      ["2026-07-05", "2026-08-07"],
      ["2026-10-05", "2026-11-07"],
      ["2027-01-05", "2027-02-07"],
      ["2027-04-05", "2027-05-07"],
      [undefined, "2028-01-31"],
    ]);
    expect(rows.slice(0, 4).every((row) => row.periodStart === "2026-04-06" && row.rule === "itsa-quarterly-update-deadlines")).toBe(true);
    expect(rows[4].rule).toBe("itsa-final-declaration-deadline");
  });

  test("the Self Assessment payments are two payments on account and the balancing payment", () => {
    expect(saPaymentRows("2026-27").map((row) => [row.kind, row.due, row.rule])).toEqual([
      ["sa-payment-on-account", "2027-01-31", "sa-payments-on-account"],
      ["sa-payment-on-account", "2027-07-31", "sa-payments-on-account"],
      ["sa-balancing-payment", "2028-01-31", "sa-balancing-payment"],
    ]);
  });

  test("a director or PSC change is due 14 days after it happens, under its own rule", () => {
    expect(changeDue("2026-12-25", "officer")).toMatchObject({
      kind: "officer-change",
      type: "people",
      due: "2027-01-08",
      rule: "ch-officer-changes-14-days",
    });
    expect(changeDue("2028-02-20", "psc")).toMatchObject({ kind: "psc-change", due: "2028-03-05", rule: "ch-psc-changes-14-days" });
  });

  test("a date that is not a real YYYY-MM-DD day, a reversed period or a malformed tax year is refused", () => {
    expect(() => vatReturnDue("2026-02-30")).toThrow(/YYYY-MM-DD/);
    expect(() => ct600Rows({ periodStart: "2026-04-01", periodEnd: "2026-03-31" })).toThrow(/before periodStart/);
    expect(() => saPaymentRows("2026-28")).toThrow(/2026-27/);
    expect(() => changeDue("2026-01-01", "secretary")).toThrow(/officer/);
  });

  test("no rule ties identity verification to a confirmation statement", () => {
    expect(Object.keys(dueRules).filter((name) => /identity/i.test(name))).toEqual([]);
    expect(Object.values(DUE_RULE_FACT_IDS).filter((id) => id.includes("identity"))).toEqual([]);
  });

  test("each rule's fact id has a source file", () => {
    const listed = new Set(loadSources().flatMap((source) => source.facts));
    expect(Object.values(DUE_RULE_FACT_IDS).filter((id) => !listed.has(id))).toEqual([]);
  });
});
