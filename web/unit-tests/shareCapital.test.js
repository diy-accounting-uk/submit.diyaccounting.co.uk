// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/shareCapital.test.js

import { describe, test, expect } from "vitest";
import { toMillionths, fromMillionths, multiplyDecimals, sumDecimals, capitalAfterAllotments } from "../public/lib/share-capital.js";

describe("share capital arithmetic", () => {
  test("reads decimals of up to six places exactly and writes them back without trailing zeros", () => {
    expect(toMillionths("1")).toBe(1_000_000n);
    expect(toMillionths(" 0.000001 ")).toBe(1n);
    expect(toMillionths(2.5)).toBe(2_500_000n);
    expect(fromMillionths(toMillionths("100.500000"))).toBe("100.5");
    expect(fromMillionths(0n)).toBe("0");
    expect(fromMillionths(toMillionths("99999999999999999999.999999"))).toBe("99999999999999999999.999999");
  });

  test.each(["", "abc", "-1", "1.", ".5", "1.0000001", "1e3", "1,000", null, undefined])("does not read %j as a number", (value) => {
    expect(toMillionths(value)).toBeNull();
  });

  test("adds without the rounding of binary fractions", () => {
    expect(sumDecimals(["0.1", "0.2"])).toBe("0.3");
    expect(sumDecimals(["100", "2.5", "0.000001"])).toBe("102.500001");
    expect(sumDecimals([])).toBe("0");
  });

  test("multiplies exactly, and answers null for a product with more than six decimal places", () => {
    expect(multiplyDecimals("25", "0.1")).toBe("2.5");
    expect(multiplyDecimals("3", "0.000001")).toBe("0.000003");
    expect(multiplyDecimals("0.5", "0.000001")).toBeNull();
    expect(multiplyDecimals("x", "1")).toBeNull();
  });
});

describe("the capital after allotments", () => {
  const BEFORE = {
    totalAmountUnpaid: "0",
    shares: [{ shareClass: "Ordinary", prescribedParticulars: "One vote a share.", numShares: "100", aggregateNominalValue: "100" }],
  };

  test("an allotment of a class the company has adds its shares and nominal value to that class", () => {
    const after = capitalAfterAllotments(BEFORE, [
      { shareClass: "ordinary ", numShares: "50", nominalValue: "1", amountUnpaidPerShare: "0" },
    ]);
    expect(after).toEqual({
      totalAmountUnpaid: "0",
      totalNumberOfIssuedShares: "150",
      totalAggregateNominalValue: "150",
      shares: [
        {
          shareClass: "Ordinary",
          prescribedParticulars: "One vote a share.",
          numShares: "150",
          aggregateNominalValue: "150",
          added: false,
        },
      ],
    });
  });

  test("an allotment of a new class starts it with no particulars, and what is unpaid on its shares joins the total", () => {
    const after = capitalAfterAllotments(BEFORE, [
      { shareClass: "A Preference", numShares: "25", nominalValue: "0.1", amountUnpaidPerShare: "0.1" },
    ]);
    expect(after.totalAmountUnpaid).toBe("2.5");
    expect(after.totalNumberOfIssuedShares).toBe("125");
    expect(after.totalAggregateNominalValue).toBe("102.5");
    expect(after.shares[1]).toEqual({
      shareClass: "A Preference",
      prescribedParticulars: "",
      numShares: "25",
      aggregateNominalValue: "2.5",
      added: true,
    });
  });

  test("two allotments of one new class make one class", () => {
    const after = capitalAfterAllotments({ totalAmountUnpaid: "0", shares: [] }, [
      { shareClass: "B", numShares: "10", nominalValue: "1", amountUnpaidPerShare: "0" },
      { shareClass: "B", numShares: "5", nominalValue: "1", amountUnpaidPerShare: "0" },
    ]);
    expect(after.shares).toHaveLength(1);
    expect(after.shares[0]).toMatchObject({ shareClass: "B", numShares: "15", aggregateNominalValue: "15", added: true });
  });

  test("an allotment that is not complete yet changes nothing, and the register's capital is not changed in place", () => {
    const after = capitalAfterAllotments(BEFORE, [
      { shareClass: "", numShares: "5", nominalValue: "1", amountUnpaidPerShare: "0" },
      { shareClass: "Ordinary", numShares: "", nominalValue: "1", amountUnpaidPerShare: "0" },
      { shareClass: "Ordinary", numShares: "5", nominalValue: "0", amountUnpaidPerShare: "0" },
      { shareClass: "Ordinary", numShares: "0", nominalValue: "1", amountUnpaidPerShare: "0" },
    ]);
    expect(after.totalNumberOfIssuedShares).toBe("100");
    expect(BEFORE.shares[0].numShares).toBe("100");
  });
});
