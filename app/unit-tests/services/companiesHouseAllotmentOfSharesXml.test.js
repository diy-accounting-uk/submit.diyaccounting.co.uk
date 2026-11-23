// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { buildAllotmentOfSharesBody } from "@app/services/companiesHouseAllotmentOfSharesXml.js";
import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";

const SCHEMA = "ReturnofAllotmentShares-v3-0.xsd";
const ORDINARY_RIGHTS =
  "Each share has one vote, and ranks equally for dividends and on a return of capital. The shares are not redeemable.";

// 100 ordinary shares of £1 before; 50 more allotted for cash at £2.50 each, fully paid.
const CASH = {
  startDate: "2026-11-02",
  statementOfCapital: [
    {
      currency: "GBP",
      totalAmountUnpaid: "0",
      shares: [{ shareClass: "Ordinary", prescribedParticulars: ORDINARY_RIGHTS, numShares: "150", aggregateNominalValue: "150" }],
    },
  ],
  allotments: [
    { shareClass: "Ordinary", numShares: "50", amountPaidPerShare: "2.5", amountUnpaidPerShare: "0", currency: "GBP", nominalValue: "1" },
  ],
};

describe("companiesHouseAllotmentOfSharesXml", () => {
  test("an allotment for cash is valid against ReturnofAllotmentShares-v3-0.xsd and states no consideration", async () => {
    const xml = buildAllotmentOfSharesBody(CASH);
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<StartPeriodSharesAllotted>2026-11-02</StartPeriodSharesAllotted><StatementOfCapital>");
    expect(xml).toContain(
      "<Capital><TotalAmountUnpaid>0</TotalAmountUnpaid><TotalNumberOfIssuedShares>150</TotalNumberOfIssuedShares>" +
        "<ShareCurrency>GBP</ShareCurrency><TotalAggregateNominalValue>150</TotalAggregateNominalValue>",
    );
    expect(xml).toContain(
      "<Allotment><ShareClass>Ordinary</ShareClass><NumShares>50</NumShares><AmountPaidDuePerShare>2.5</AmountPaidDuePerShare>" +
        "<AmountUnpaidPerShare>0</AmountUnpaidPerShare><ShareCurrency>GBP</ShareCurrency><ShareValue>1</ShareValue></Allotment>",
    );
    expect(xml).not.toContain("Consideration");
    expect(xml).not.toContain("EndPeriodSharesAllotted");
  });

  test("an allotment for non-cash consideration states the consideration and is valid", async () => {
    const xml = buildAllotmentOfSharesBody({
      ...CASH,
      allotments: [{ ...CASH.allotments[0], consideration: "The transfer to the company of a delivery van, valued at 125 pounds." }],
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<ShareValue>1</ShareValue><Consideration>The transfer to the company of a delivery van, valued at 125 pounds.</Consideration></Allotment>",
    );
  });

  test("a new class of shares is valid, with its own class in the statement of capital and the totals of both classes", async () => {
    const xml = buildAllotmentOfSharesBody({
      startDate: "2026-11-02",
      statementOfCapital: [
        {
          currency: "GBP",
          totalAmountUnpaid: "2.5",
          shares: [
            { shareClass: "Ordinary", prescribedParticulars: ORDINARY_RIGHTS, numShares: "100", aggregateNominalValue: "100" },
            {
              shareClass: "A Preference",
              prescribedParticulars: "No vote. A fixed dividend of 5 pence a share each year, paid before any ordinary dividend.",
              numShares: "25",
              aggregateNominalValue: "2.5",
            },
          ],
        },
      ],
      allotments: [
        {
          shareClass: "A Preference",
          numShares: "25",
          amountPaidPerShare: "0",
          amountUnpaidPerShare: "0.1",
          currency: "GBP",
          nominalValue: "0.1",
        },
      ],
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<TotalAmountUnpaid>2.5</TotalAmountUnpaid><TotalNumberOfIssuedShares>125</TotalNumberOfIssuedShares>" +
        "<ShareCurrency>GBP</ShareCurrency><TotalAggregateNominalValue>102.5</TotalAggregateNominalValue>",
    );
    expect(xml).toContain("<Shares><ShareClass>A Preference</ShareClass><PrescribedParticulars>No vote.");
  });

  test("allotments over a period, in two classes and two currencies, are valid", async () => {
    const xml = buildAllotmentOfSharesBody({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      statementOfCapital: [
        CASH.statementOfCapital[0],
        {
          currency: "EUR",
          totalAmountUnpaid: "0",
          shares: [{ shareClass: "Euro Ordinary", prescribedParticulars: ORDINARY_RIGHTS, numShares: "10", aggregateNominalValue: "10" }],
        },
      ],
      allotments: [
        CASH.allotments[0],
        {
          shareClass: "Euro Ordinary",
          numShares: "10",
          amountPaidPerShare: "1",
          amountUnpaidPerShare: "0",
          currency: "EUR",
          nominalValue: "1",
        },
      ],
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<StartPeriodSharesAllotted>2026-10-01</StartPeriodSharesAllotted><EndPeriodSharesAllotted>2026-10-31</EndPeriodSharesAllotted>",
    );
    expect(xml.match(/<Capital>/g)).toHaveLength(2);
    expect(xml.match(/<Allotment>/g)).toHaveLength(2);
  });

  test("fractions of a share and of a penny keep every decimal place and stay valid", async () => {
    const xml = buildAllotmentOfSharesBody({
      startDate: "2026-11-02",
      statementOfCapital: [
        {
          currency: "GBP",
          totalAmountUnpaid: "0.000001",
          shares: [{ shareClass: "Ordinary", prescribedParticulars: ORDINARY_RIGHTS, numShares: "100.5", aggregateNominalValue: "0.1005" }],
        },
      ],
      allotments: [
        {
          shareClass: "Ordinary",
          numShares: "0.5",
          amountPaidPerShare: "0.001",
          amountUnpaidPerShare: "0",
          currency: "GBP",
          nominalValue: "0.001",
        },
      ],
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<TotalNumberOfIssuedShares>100.5</TotalNumberOfIssuedShares>");
    expect(xml).toContain("<TotalAggregateNominalValue>0.1005</TotalAggregateNominalValue>");
  });

  test("markup characters in a class, the particulars and the consideration are escaped and stay valid", async () => {
    const xml = buildAllotmentOfSharesBody({
      startDate: "2026-11-02",
      statementOfCapital: [
        {
          currency: "GBP",
          totalAmountUnpaid: "0",
          shares: [
            {
              shareClass: "A & B <Ordinary>",
              prescribedParticulars: "Votes: 1 & only 1 <per share>",
              numShares: "10",
              aggregateNominalValue: "10",
            },
          ],
        },
      ],
      allotments: [{ ...CASH.allotments[0], shareClass: "A & B <Ordinary>", numShares: "10", consideration: "Plant & machinery" }],
    });
    expect(xml).toContain("<ShareClass>A &amp; B &lt;Ordinary&gt;</ShareClass>");
    expect(xml).toContain("<Consideration>Plant &amp; machinery</Consideration>");
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("refuses a return with no date, no statement of capital, no allotment, an empty class list or a number that is not one", () => {
    expect(() => buildAllotmentOfSharesBody({ ...CASH, startDate: "02/11/2026" })).toThrow("startDate must be YYYY-MM-DD");
    expect(() => buildAllotmentOfSharesBody({ ...CASH, endDate: "soon" })).toThrow("endDate must be YYYY-MM-DD");
    expect(() => buildAllotmentOfSharesBody({ ...CASH, statementOfCapital: [] })).toThrow("needs the statement of capital");
    expect(() => buildAllotmentOfSharesBody({ ...CASH, allotments: [] })).toThrow("at least one allotment");
    expect(() =>
      buildAllotmentOfSharesBody({ ...CASH, statementOfCapital: [{ currency: "GBP", totalAmountUnpaid: "0", shares: [] }] }),
    ).toThrow("at least one class of shares");
    expect(() => buildAllotmentOfSharesBody({ ...CASH, allotments: [{ ...CASH.allotments[0], numShares: "fifty" }] })).toThrow(
      "numShares must be a number",
    );
    expect(() => buildAllotmentOfSharesBody({ ...CASH, allotments: [{ ...CASH.allotments[0], nominalValue: "1.0000001" }] })).toThrow(
      "nominalValue must be a number",
    );
  });

  test("the schema check refuses a return whose allotment comes before the statement of capital", async () => {
    const xml = buildAllotmentOfSharesBody(CASH);
    const statement = /<StatementOfCapital>.*<\/StatementOfCapital>/.exec(xml)[0];
    const moved = xml.replace(statement, "").replace("</ReturnofAllotmentShares>", `${statement}</ReturnofAllotmentShares>`);
    expect(await gatewayFormSchemaErrors(moved, SCHEMA)).not.toEqual([]);
  });
});
