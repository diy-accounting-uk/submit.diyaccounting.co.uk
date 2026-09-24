// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// paypal-statement-lines.test.js -- paypalLinesFromStatementText and
// paypalLinesFromStatementPdf over a hand-written statement shaped like
// poppler's pdftotext -layout output for one PayPal "Transaction History"
// PDF: a purchase whose description wraps across the date line, a hold and
// its reversal, a pending authorisation, a donation receipt, and a
// withdrawal to the linked bank account. Amounts are rounded, every id is
// invented, and the one donor name is fictional.
//
// chooseReleaseRows, parsePaypalActivitySummary and settlesElsewhere get
// their own scenarios, built with statementText/activitySummaryText rather
// than the file fixture, because each one turns on the exact combination of
// a Releases figure and a candidate row's amount that a hand-written pair
// makes easy to see.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { validateLines } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";

import {
  chooseReleaseRows,
  parsePaypalActivitySummary,
  parsePaypalStatementRecords,
  paypalLinesFromStatementPdf,
  paypalLinesFromStatementText,
  reconcilePaypalMonth,
  settlesElsewhere,
} from "../lib/finance/paypal-statement-lines.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "finance");
const STATEMENT = readFileSync(join(FIXTURES, "paypal-statement.txt"), "utf8");

const SALES_ACCOUNT = "4000";
const PURCHASES_ACCOUNT = "5301";
const FEE_ACCOUNT = "7901";
const ACCOUNTS = { salesAccountMainID: SALES_ACCOUNT, purchasesAccountMainID: PURCHASES_ACCOUNT, feeAccountMainID: FEE_ACCOUNT };

function formatAmount(value) {
  return (value < 0 ? "-" : "") + Math.abs(value).toFixed(2);
}

// One row of a statement, in the same shape parsePaypalStatementRecords
// reads: a description line, the date/status/currency/gross/fee/net row,
// then the id line.
function statementRow({ date, description, status, currency = "GBP", gross, fee = 0, id }) {
  const net = gross + fee;
  return [
    `             ${description}`,
    `${date}                                                     ${status}   ${currency}   ${formatAmount(gross)}   ${formatAmount(fee)}   ${formatAmount(net)}`,
    `             ID: ${id}`,
    "",
  ].join("\n");
}

function statementText(rows) {
  return [
    "Transaction History",
    "",
    "Date         Description                                       Status      Currency   Gross     Fee       Net",
    "",
    ...rows.map(statementRow),
  ].join("\n");
}

// One statement.PDF's "Activity Summary" table: a currency header line
// followed by a row per label, in the same shape parsePaypalActivitySummary
// reads. `rows` is an array of [label, valuesByCurrencyOrder].
function activitySummaryText(currencies, rows) {
  return [
    "Activity Summary (01/06/2026 - 30/06/2026)",
    `                              ${currencies.join("                      ")}`,
    ...rows.map(
      ([label, values]) =>
        `${label}                                                                      ${values.map(formatAmount).join("                    ")}`,
    ),
  ].join("\n");
}

describe("parsePaypalStatementRecords", () => {
  it("reassembles a description that wraps across the date line", () => {
    const records = parsePaypalStatementRecords(STATEMENT);
    const googleCloud = records.find((record) => record.id === "TESTID0001AAAAAAAA");
    expect(googleCloud.description).toBe("Pre-approved Payment Bill User Payment: Google Cloud EMEA Limited");
  });

  it("parses every record's date, status, currency and figures", () => {
    const records = parsePaypalStatementRecords(STATEMENT);
    expect(records).toHaveLength(6);
    const donation = records.find((record) => record.id === "TESTID0005EEEEEEEE");
    expect(donation).toMatchObject({ date: "2026-06-04", status: "Completed", currency: "GBP", gross: 10.0, fee: -0.59, net: 9.41 });
  });
});

describe("parsePaypalActivitySummary", () => {
  it("reads a row's amount per currency, keyed by the header's own order", () => {
    const text = activitySummaryText(
      ["GBP", "USD"],
      [
        ["Releases", [82.77, 0]],
        ["Withheld", [-98.43, 0]],
        ["Other", [15.66, 0]],
      ],
    );

    const summary = parsePaypalActivitySummary(text);

    expect(summary.releases).toEqual({ GBP: 82.77, USD: 0 });
    expect(summary.withheld).toEqual({ GBP: -98.43, USD: 0 });
    expect(summary.other).toEqual({ GBP: 15.66, USD: 0 });
  });

  it("returns an empty summary when no currency header is found", () => {
    expect(parsePaypalActivitySummary("nothing recognisable here")).toEqual({});
  });
});

describe("chooseReleaseRows", () => {
  const HOLD_RELEASE = {
    date: "2026-06-02",
    description: "Reversal of General Account Hold: PayPal",
    status: "Completed",
    gross: 82.0,
    id: "REL0001",
  };
  const HOLD_RELEASE_2 = {
    date: "2026-06-10",
    description: "Reversal of General Account Hold: PayPal",
    status: "Completed",
    gross: 0.77,
    id: "REL0002",
  };
  const AMBIGUOUS_OTHER = { date: "2026-06-02", description: "Other: AWS EMEA", status: "Completed", gross: 15.66, id: "REL0003" };

  it("counts an 'Other:' row matching a hold by amount only when the Releases total needs it", () => {
    // The unambiguous releases alone (82.00 + 0.77) already reach the
    // Releases total: the Other: row is a separate real movement that
    // happens to share a hold's amount, not that hold's release.
    const releasesTotal = 82.77;
    const result = chooseReleaseRows([HOLD_RELEASE, HOLD_RELEASE_2, AMBIGUOUS_OTHER], releasesTotal);

    expect(result.matched).toBe(true);
    expect(result.releaseIds).toEqual(new Set(["REL0001", "REL0002"]));
    expect(result.releaseIds.has("REL0003")).toBe(false);
  });

  it("adds the 'Other:' row needed to close the gap when the unambiguous releases fall short", () => {
    // Releases this time also counts the 15.66 the Other: row carries.
    const releasesTotal = 98.43;
    const result = chooseReleaseRows([HOLD_RELEASE, HOLD_RELEASE_2, AMBIGUOUS_OTHER], releasesTotal);

    expect(result.matched).toBe(true);
    expect(result.releaseIds).toEqual(new Set(["REL0001", "REL0002", "REL0003"]));
  });

  it("reports no match when no combination closes the gap exactly", () => {
    const result = chooseReleaseRows([HOLD_RELEASE, AMBIGUOUS_OTHER], 50.0);

    expect(result.matched).toBe(false);
    expect(result.releaseIds).toEqual(new Set(["REL0001"])); // the unambiguous release still counts
  });
});

describe("settlesElsewhere", () => {
  const PENDING_DEPOSIT = { date: "2026-06-02", description: "Bank deposit to PayPal account", status: "Pending", id: "DEP0001" };

  it("is true when the same id settles as Completed in a later month's records", () => {
    const nextMonthRecords = [{ date: "2026-07-01", description: "Bank deposit to PayPal account", status: "Completed", id: "DEP0001" }];
    expect(settlesElsewhere(PENDING_DEPOSIT, nextMonthRecords)).toBe(true);
  });

  it("is false when no later record carries the same id as Completed", () => {
    const nextMonthRecords = [{ date: "2026-07-01", description: "Donation Payment: A N Other", status: "Completed", id: "DEP0002" }];
    expect(settlesElsewhere(PENDING_DEPOSIT, nextMonthRecords)).toBe(false);
  });
});

describe("paypalLinesFromStatementText", () => {
  it("posts a completed bill payment's gross to purchases", () => {
    const { lines } = paypalLinesFromStatementText(STATEMENT, ACCOUNTS);
    const googleCloud = lines.find((line) => line.documentReference === "TESTID0001AAAAAAAA");
    expect(googleCloud).toMatchObject({
      sourceJournalID: "purchases",
      documentType: "invoice",
      postingDate: "2026-06-01",
      accountMainID: PURCHASES_ACCOUNT,
      amount: 24.0,
      amountCurrency: "GBP",
      detailComment: "Pre-approved Payment Bill User Payment: Google Cloud EMEA Limited",
    });
  });

  it("posts a completed receipt's gross to sales and its fee to purchases, never netted", () => {
    const { lines } = paypalLinesFromStatementText(STATEMENT, ACCOUNTS);
    const gross = lines.find((line) => line.documentReference === "TESTID0005EEEEEEEE" && line.sourceJournalID === "sales");
    const fee = lines.find((line) => line.entryNumber === "PAYPAL-TESTID0005EEEEEEEE-FEE");
    expect(gross).toMatchObject({ sourceJournalID: "sales", documentType: "receipt", accountMainID: SALES_ACCOUNT, amount: 10.0 });
    expect(fee).toMatchObject({ sourceJournalID: "purchases", accountMainID: FEE_ACCOUNT, amount: 0.59 });
  });

  it("excludes a hold and its reversal", () => {
    const { lines } = paypalLinesFromStatementText(STATEMENT, ACCOUNTS);
    expect(lines.some((line) => line.documentReference === "TESTID0002BBBBBBBB")).toBe(false);
    expect(lines.some((line) => line.documentReference === "TESTID0003CCCCCCCC")).toBe(false);
  });

  it("excludes a pending authorisation", () => {
    const { lines } = paypalLinesFromStatementText(STATEMENT, ACCOUNTS);
    expect(lines.some((line) => line.documentReference === "TESTID0004DDDDDDDD")).toBe(false);
  });

  it("excludes a withdrawal to the linked bank account", () => {
    const { lines } = paypalLinesFromStatementText(STATEMENT, ACCOUNTS);
    expect(lines.some((line) => line.documentReference === "TESTID0006FFFFFFFF")).toBe(false);
  });

  it("emits exactly the lines a completed bill payment, a completed receipt and its fee carry", () => {
    const { lines } = paypalLinesFromStatementText(STATEMENT, ACCOUNTS);
    expect(lines).toHaveLength(3);
  });

  it("emits lines that validate against the diya-gl lines schema", () => {
    const { lines } = paypalLinesFromStatementText(STATEMENT, ACCOUNTS);
    const book = { accounts: { sales: { [SALES_ACCOUNT]: {} }, purchases: { [PURCHASES_ACCOUNT]: {}, [FEE_ACCOUNT]: {} } } };
    const result = validateLines(lines, book);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("requires salesAccountMainID", () => {
    expect(() =>
      paypalLinesFromStatementText(STATEMENT, { purchasesAccountMainID: PURCHASES_ACCOUNT, feeAccountMainID: FEE_ACCOUNT }),
    ).toThrow(/salesAccountMainID is required/);
  });

  it("requires purchasesAccountMainID", () => {
    expect(() => paypalLinesFromStatementText(STATEMENT, { salesAccountMainID: SALES_ACCOUNT, feeAccountMainID: FEE_ACCOUNT })).toThrow(
      /purchasesAccountMainID is required/,
    );
  });

  it("requires feeAccountMainID", () => {
    expect(() =>
      paypalLinesFromStatementText(STATEMENT, { salesAccountMainID: SALES_ACCOUNT, purchasesAccountMainID: PURCHASES_ACCOUNT }),
    ).toThrow(/feeAccountMainID is required/);
  });

  it("posts an 'Other:' row matching a hold's amount as real income when no statementText is given", () => {
    const text = statementText([
      { date: "02/06/2026", description: "General Hold", status: "Completed", gross: -20.0, id: "OTH0001" },
      { date: "02/06/2026", description: "Other: AWS EMEA", status: "Completed", gross: 20.0, id: "OTH0002" },
    ]);
    const { lines } = paypalLinesFromStatementText(text, ACCOUNTS);
    expect(lines.some((line) => line.documentReference === "OTH0002")).toBe(true);
  });

  it("excludes that same 'Other:' row only when the month's own Releases figure needs it", () => {
    const text = statementText([
      { date: "02/06/2026", description: "General Hold", status: "Completed", gross: -20.0, id: "OTH0003" },
      { date: "02/06/2026", description: "Other: AWS EMEA", status: "Completed", gross: 20.0, id: "OTH0004" },
    ]);
    const activity = activitySummaryText(["GBP"], [["Releases", [20.0]]]);

    const { lines } = paypalLinesFromStatementText(text, { ...ACCOUNTS, statementText: activity });
    expect(lines.some((line) => line.documentReference === "OTH0004")).toBe(false);
  });

  it("leaves that 'Other:' row posting as real when the Releases figure does not need it", () => {
    // The Releases total is 0.00: PayPal's own summary says nothing
    // released this month, so the 15.66 "Other:" row -- despite matching
    // the hold's amount -- is a real, separate movement.
    const text = statementText([
      { date: "02/06/2026", description: "General Hold", status: "Completed", gross: -15.66, id: "OTH0005" },
      { date: "02/06/2026", description: "Other: AWS EMEA", status: "Completed", gross: 15.66, id: "OTH0006" },
    ]);
    const activity = activitySummaryText(["GBP"], [["Releases", [0.0]]]);

    const { lines } = paypalLinesFromStatementText(text, { ...ACCOUNTS, statementText: activity });
    expect(lines.some((line) => line.documentReference === "OTH0006")).toBe(true);
  });
});

describe("paypalLinesFromStatementText with labels", () => {
  const LABELS = {
    rule: [
      { pattern: "WIDGET DONATION", sourceJournalID: "sales", accountMainID: "4002", taxCode: "OS" },
      { pattern: "WIDGET SUPPLIES", sourceJournalID: "purchases", accountMainID: "5302", taxCode: "OS" },
    ],
  };

  it("sets a matched receipt's account, sourceJournalID and taxCode from the rule, in place of salesAccountMainID", () => {
    const text = statementText([
      { date: "02/06/2026", description: "Donation Payment: Widget Donation Drive", status: "Completed", gross: 25.0, id: "LBL0001" },
    ]);

    const { lines } = paypalLinesFromStatementText(text, { ...ACCOUNTS, labels: LABELS });

    const line = lines.find((entry) => entry.documentReference === "LBL0001");
    expect(line).toMatchObject({ sourceJournalID: "sales", accountMainID: "4002", taxCode: "OS" });
  });

  it("sets a matched bill's account, sourceJournalID and taxCode from the rule, in place of purchasesAccountMainID", () => {
    const text = statementText([
      { date: "02/06/2026", description: "Payment: Widget Supplies Co", status: "Completed", gross: -12.5, id: "LBL0002" },
    ]);

    const { lines } = paypalLinesFromStatementText(text, { ...ACCOUNTS, labels: LABELS });

    const line = lines.find((entry) => entry.documentReference === "LBL0002");
    expect(line).toMatchObject({ sourceJournalID: "purchases", accountMainID: "5302", taxCode: "OS" });
  });

  it("leaves an unmatched record posting to the default sales account, and lists it in unlabelled", () => {
    const text = statementText([
      { date: "02/06/2026", description: "Donation Payment: A N Other", status: "Completed", gross: 8.0, id: "LBL0003" },
    ]);

    const { lines, unlabelled } = paypalLinesFromStatementText(text, { ...ACCOUNTS, labels: LABELS });

    const line = lines.find((entry) => entry.documentReference === "LBL0003");
    expect(line).toMatchObject({ sourceJournalID: "sales", accountMainID: SALES_ACCOUNT });
    expect(unlabelled).toHaveLength(1);
    expect(unlabelled[0].id).toBe("LBL0003");
  });

  it("never redirects the fee line, whatever the gross line's own rule", () => {
    const text = statementText([
      {
        date: "02/06/2026",
        description: "Donation Payment: Widget Donation Drive",
        status: "Completed",
        gross: 25.0,
        fee: -1.2,
        id: "LBL0004",
      },
    ]);

    const { lines } = paypalLinesFromStatementText(text, { ...ACCOUNTS, labels: LABELS });

    const fee = lines.find((entry) => entry.entryNumber === "PAYPAL-LBL0004-FEE");
    expect(fee).toMatchObject({ sourceJournalID: "purchases", accountMainID: FEE_ACCOUNT });
  });

  it("behaves exactly as today when no labels are given", () => {
    const text = statementText([
      { date: "02/06/2026", description: "Donation Payment: Widget Donation Drive", status: "Completed", gross: 25.0, id: "LBL0005" },
    ]);

    const { lines, unlabelled } = paypalLinesFromStatementText(text, ACCOUNTS);

    const line = lines.find((entry) => entry.documentReference === "LBL0005");
    expect(line).toMatchObject({ sourceJournalID: "sales", accountMainID: SALES_ACCOUNT });
    expect(line.taxCode).toBeUndefined();
    expect(unlabelled).toEqual([]);
  });
});

describe("reconcilePaypalMonth", () => {
  // The fixture's own Activity Summary: a Releases figure matching its
  // one Reversal row exactly (12.34, no "Other:" row in this fixture to
  // choose between), a Withheld figure for the still-open Pending
  // authorisation (-50.00), and a Start/End Available balance whose
  // movement (-102.25) is exactly what those figures plus the fixture's
  // posted and transfer rows sum to.
  const STATEMENT_ACTIVITY_SUMMARY = activitySummaryText(
    ["GBP"],
    [
      ["Start Available Balance", [200.0]],
      ["Releases", [12.34]],
      ["Withheld", [-50.0]],
      ["End Available Balance", [97.75]],
    ],
  );

  it("reconciles the fixture statement to zero", () => {
    const result = reconcilePaypalMonth({ transactionsText: STATEMENT, statementText: STATEMENT_ACTIVITY_SUMMARY });

    expect(result).toEqual({
      posted: -14.59, // -24.00 (Google Cloud) + 9.41 (donation net of its fee)
      transfers: -50.0, // the General Withdrawal
      releases: 12.34,
      withheld: -50.0,
      total: -102.25,
      statementMovement: -102.25,
      residual: 0,
      reconciled: true,
      pendingTransfersConfirmed: true, // nothing Pending to confirm in this fixture
    });
  });

  it("counts a still-Pending bank deposit in its own month's transfers, confirmed or not", () => {
    const text = statementText([
      { date: "02/06/2026", description: "Bank deposit to PayPal account", status: "Pending", gross: 20.0, id: "DEP0010" },
    ]);
    const summary = activitySummaryText(
      ["GBP"],
      [
        ["Start Available Balance", [100.0]],
        ["End Available Balance", [120.0]],
      ],
    );

    const withoutNextMonth = reconcilePaypalMonth({ transactionsText: text, statementText: summary });
    expect(withoutNextMonth.transfers).toBe(20.0);
    expect(withoutNextMonth.pendingTransfersConfirmed).toBe(false);
    expect(withoutNextMonth.reconciled).toBe(true);

    const nextMonthText = statementText([
      { date: "01/07/2026", description: "Bank deposit to PayPal account", status: "Completed", gross: 20.0, id: "DEP0010" },
    ]);
    const withNextMonth = reconcilePaypalMonth({ transactionsText: text, statementText: summary, nextMonthText });
    expect(withNextMonth.transfers).toBe(20.0); // the amount counted is unchanged either way
    expect(withNextMonth.pendingTransfersConfirmed).toBe(true);
  });

  it("requires transactionsText", () => {
    expect(() => reconcilePaypalMonth({ statementText: STATEMENT_ACTIVITY_SUMMARY })).toThrow(/transactionsText is required/);
  });

  it("requires statementText", () => {
    expect(() => reconcilePaypalMonth({ transactionsText: STATEMENT })).toThrow(/statementText is required/);
  });
});

describe("paypalLinesFromStatementPdf", () => {
  it("renders the PDF with pdftotext and parses the result", async () => {
    const runPdftotext = vi.fn().mockResolvedValue(STATEMENT);
    const { lines } = await paypalLinesFromStatementPdf("2026-06 PayPal - transactions.PDF", ACCOUNTS, { runPdftotext });

    expect(runPdftotext).toHaveBeenCalledWith("2026-06 PayPal - transactions.PDF");
    expect(lines).toHaveLength(3);
  });

  it("also reads statementPdfPath, when given, to resolve which 'Other:' rows are releases", async () => {
    const transactionsText = statementText([
      { date: "02/06/2026", description: "General Hold", status: "Completed", gross: -20.0, id: "PDF0001" },
      { date: "02/06/2026", description: "Other: AWS EMEA", status: "Completed", gross: 20.0, id: "PDF0002" },
    ]);
    const activity = activitySummaryText(["GBP"], [["Releases", [20.0]]]);
    const runPdftotext = vi.fn().mockImplementation(async (path) => (path === "statement.pdf" ? activity : transactionsText));

    const { lines } = await paypalLinesFromStatementPdf(
      "transactions.pdf",
      { ...ACCOUNTS, statementPdfPath: "statement.pdf" },
      { runPdftotext },
    );

    expect(runPdftotext).toHaveBeenCalledWith("statement.pdf");
    expect(lines.some((line) => line.documentReference === "PDF0002")).toBe(false);
  });
});
