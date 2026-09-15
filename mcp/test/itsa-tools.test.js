// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { createSession, openBook } from "../lib/book-tools.js";
import {
  annualFieldSlotsForTaxYear,
  deriveItsaAnnualSubmission,
  deriveItsaQuarterlyUpdate,
  quarterlyFieldSlots,
  writePath,
} from "../lib/itsa-tools.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const SE_VAT = join(FIXTURES, "brickwork-pro-se-vat");
const LTD = join(FIXTURES, "precision-code-ltd-full");

function readPath(target, path) {
  return path.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), target);
}

describe("the field slots", () => {
  test("the quarterly slots carry both fields of a shared box and the consolidated election", () => {
    const slots = quarterlyFieldSlots();
    expect(slots).toContain("periodIncome.turnover");
    expect(slots).toContain("periodExpenses.advertisingCosts");
    expect(slots).toContain("periodExpenses.businessEntertainmentCosts");
    expect(slots).toContain("periodExpenses.consolidatedExpenses");
    expect(slots).toContain("periodDisallowableExpenses.costOfGoodsDisallowable");
    expect(new Set(slots).size).toBe(slots.length);
  });

  test("the annual slots follow the mapping's api.years by tax year", () => {
    const y2324 = annualFieldSlotsForTaxYear("2023-24");
    const y2425 = annualFieldSlotsForTaxYear("2024-25");
    const y2526 = annualFieldSlotsForTaxYear("2025-26");
    const y2627 = annualFieldSlotsForTaxYear("2026-27");

    expect(y2324).not.toContain("adjustments.transitionProfitAmount");
    expect(y2425).toContain("adjustments.transitionProfitAmount");

    expect(y2425).toContain("allowances.zeroEmissionsGoodsVehicleAllowance");
    expect(y2425).toContain("allowances.electricChargePointAllowance");
    expect(y2526).not.toContain("allowances.zeroEmissionsGoodsVehicleAllowance");
    expect(y2526).not.toContain("allowances.electricChargePointAllowance");

    expect(y2526).toContain("adjustments.overlapReliefUsed");
    expect(y2627).not.toContain("adjustments.overlapReliefUsed");

    expect(y2627).not.toContain("adjustments.adjustmentToProfitsForClass4");
    expect(y2627).not.toContain("allowances.firstYearAllowanceOnPlantAndMachinery");
    expect(y2627).toContain("allowances.annualInvestmentAllowance");
  });

  test("an unknown tax year is refused", () => {
    expect(() => annualFieldSlotsForTaxYear("2019-20")).toThrow(/no api.years entry/);
  });
});

describe("derive_itsa_quarterly_update", () => {
  let session;

  beforeEach(async () => {
    session = createSession();
    await openBook(session, { path: SE_VAT });
  });

  test("a cumulative year answers the running total through the period named", async () => {
    const answer = await deriveItsaQuarterlyUpdate(session, { periodEndDate: "2025-10-05" });
    expect(answer.taxYear).toBe("2025-26");
    expect(answer.shape).toBe("cumulative-period-summary");
    expect(answer.quarterlyPeriodType).toBe("standard");
    expect(answer.periods).toHaveLength(1);
    const [period] = answer.periods;
    expect(period.periodDates).toEqual({ periodStartDate: "2025-04-06", periodEndDate: "2025-10-05" });
    expect(period.covers).toEqual(["2025-04-06 to 2025-07-05", "2025-07-06 to 2025-10-05"]);
    expect(period.periodIncome.turnover).toBe(28050 + 27900);
    expect(period.periodExpenses.paymentsToSubcontractors).toBe(9000 + 7500);
    expect(period.periodDisallowableExpenses.depreciationDisallowable).toBe(600);
  });

  test("with no period named every period is answered and the last covers the whole year", async () => {
    const answer = await deriveItsaQuarterlyUpdate(session);
    expect(answer.periods).toHaveLength(4);
    const last = answer.periods[3];
    expect(last.covers).toHaveLength(4);
    expect(last.periodDates.periodStartDate).toBe("2025-04-06");
    expect(last.periodDates.periodEndDate).toBe("2026-04-05");
    const turnoverOfEach = [28050, 27900, 27750, 28800];
    expect(last.periodIncome.turnover).toBe(turnoverOfEach.reduce((a, b) => a + b, 0));
  });

  test("a slot the template cannot source is omitted, never sent as zero", async () => {
    const answer = await deriveItsaQuarterlyUpdate(session, { periodEndDate: "2025-07-05" });
    const [period] = answer.periods;
    expect(period.omitted).toContain("periodDisallowableExpenses.costOfGoodsDisallowable");
    expect(period.omitted).toContain("periodExpenses.consolidatedExpenses");
    expect(period.omitted).toContain("periodExpenses.businessEntertainmentCosts");
    for (const slot of period.omitted) {
      expect(readPath(period, slot)).toBeUndefined();
    }
    for (const slot of answer.fieldSlots) {
      if (!period.omitted.includes(slot)) expect(typeof readPath(period, slot)).toBe("number");
    }
    expect(period.omitted.length + answer.fieldSlots.filter((slot) => readPath(period, slot) !== undefined).length).toBe(
      answer.fieldSlots.length,
    );
  });

  test("a dated year answers the period's own figures", async () => {
    const answer = await deriveItsaQuarterlyUpdate(session, { taxYear: "2024-25", periodEndDate: "2025-04-05" });
    expect(answer.taxYear).toBe("2024-25");
    expect(answer.shape).toBe("period-summary");
    const [period] = answer.periods;
    expect(period.covers).toEqual(["2025-01-06 to 2025-04-05"]);
    expect(period.periodDates).toEqual({ periodStartDate: "2025-01-06", periodEndDate: "2025-04-05" });
    expect(typeof period.periodIncome.turnover).toBe("number");
  });

  test("a period end the year does not have is refused, naming the four it has", async () => {
    await expect(deriveItsaQuarterlyUpdate(session, { periodEndDate: "2025-09-30" })).rejects.toThrow(
      /2025-07-05, 2025-10-05, 2026-01-05, 2026-04-05/,
    );
  });

  test("a calendar election moves the period ends", async () => {
    const answer = await deriveItsaQuarterlyUpdate(session, { quarterlyPeriodType: "calendar", periodEndDate: "2025-09-30" });
    expect(answer.periods[0].periodDates.periodEndDate).toBe("2025-09-30");
  });

  test("a malformed tax year is refused", async () => {
    await expect(deriveItsaQuarterlyUpdate(session, { taxYear: "2025/26" })).rejects.toThrow(/must look like 2025-26/);
    await expect(deriveItsaQuarterlyUpdate(session, { taxYear: "2025-27" })).rejects.toThrow(/consecutive/);
  });

  test("a company book is refused", async () => {
    const ltd = createSession();
    await openBook(ltd, { path: LTD });
    await expect(deriveItsaQuarterlyUpdate(ltd)).rejects.toThrow(/"ltd" book/);
  });

  test("no loaded book is refused", async () => {
    await expect(deriveItsaQuarterlyUpdate(createSession())).rejects.toThrow(/open_book first/);
  });
});

describe("derive_itsa_annual_submission", () => {
  let session;
  const tmp = mkdtempSync(join(tmpdir(), "itsa-annual-"));

  beforeEach(async () => {
    session = createSession();
    await openBook(session, { path: SE_VAT });
  });

  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  test("answers the year's allowances and adjustments from the book", async () => {
    const answer = await deriveItsaAnnualSubmission(session);
    expect(answer.taxYear).toBe("2025-26");
    expect(answer.allowances.annualInvestmentAllowance).toBe(12000);
    expect(answer.fieldSlots).toEqual(annualFieldSlotsForTaxYear("2025-26"));
    expect(answer.omitted).toContain("adjustments.overlapReliefUsed");
    expect(answer.omitted).toContain("allowances.tradingIncomeAllowance");
    for (const slot of answer.omitted) expect(readPath(answer, slot)).toBeUndefined();
    expect(Array.isArray(answer.warnings)).toBe(true);
  });

  test("a field HMRC's schema no longer accepts for the year is dropped even when the book states it", async () => {
    session.book.tax = { selfEmployment: { allowances: { zeroEmissionsGoodsVehicleAllowance: 500, zeroEmissionsCarAllowance: 250 } } };
    const answer = await deriveItsaAnnualSubmission(session);
    expect(answer.allowances.zeroEmissionsCarAllowance).toBe(250);
    expect(answer.allowances.zeroEmissionsGoodsVehicleAllowance).toBeUndefined();
    expect(answer.fieldSlots).not.toContain("allowances.zeroEmissionsGoodsVehicleAllowance");
    expect(answer.omitted).not.toContain("allowances.zeroEmissionsGoodsVehicleAllowance");
  });

  test("the same book in 2024-25 still files the zero-emission goods vehicle allowance", async () => {
    session.book.tax = { selfEmployment: { allowances: { zeroEmissionsGoodsVehicleAllowance: 500 } } };
    const answer = await deriveItsaAnnualSubmission(session, { taxYear: "2024-25" });
    expect(answer.taxYear).toBe("2024-25");
    expect(answer.allowances.zeroEmissionsGoodsVehicleAllowance).toBe(500);
  });

  test("with a path the answer is written as the JSON the annual submission page imports", async () => {
    const path = join(tmp, "nested", "annual.json");
    const answer = await deriveItsaAnnualSubmission(session, { path });
    expect(answer.path).toBe(path);
    const written = JSON.parse(readFileSync(path, "utf8"));
    expect(written.taxYear).toBe("2025-26");
    expect(written.allowances.annualInvestmentAllowance).toBe(12000);
    expect(written.path).toBeUndefined();
  });

  test("a company book is refused", async () => {
    const ltd = createSession();
    await openBook(ltd, { path: LTD });
    await expect(deriveItsaAnnualSubmission(ltd)).rejects.toThrow(/"ltd" book/);
  });
});

describe("writePath", () => {
  test("creates the objects between a dotted path and sets the leaf", () => {
    const target = {};
    writePath(target, "adjustments.basisAdjustment", 12.5);
    expect(target).toEqual({ adjustments: { basisAdjustment: 12.5 } });
  });

  test("refuses a part that would reach the prototype chain", () => {
    const target = {};
    for (const path of ["__proto__.polluted", "adjustments.constructor.prototype.x", "prototype.x"]) {
      expect(() => writePath(target, path, 1)).toThrow(/is not a field/);
    }
    expect({}.polluted).toBeUndefined();
    expect(target).toEqual({});
  });
});
