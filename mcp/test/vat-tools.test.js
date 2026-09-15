// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// vat-tools.test.js -- derive_vat_return over the two example company
// books: every quarter the tool answers equals the engine's own VATQtr form
// for that period end, box by box, the attributed lines add up to the boxes,
// and the refusals name what is wrong.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { loadTaxDataForBook } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";

import { createSession, openBook } from "../lib/book-tools.js";
import { deriveVatReturn, interfaceRows, isoFromSerial } from "../lib/vat-tools.js";
import { TOOLS } from "../lib/server.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");

const EXAMPLES = [
  { name: "BrickWork Pro Ltd", dir: "brickwork-pro-ltd-vat", vrn: "376543219", straddling: 0 },
  { name: "Precision Code Ltd", dir: "precision-code-ltd-full", vrn: "123456789", straddling: 10 },
];

const pence = (value) => Math.round(value * 100) / 100;

async function engineResults(session) {
  return calculatedResultsFor(session.book, session.lines, await loadTaxDataForBook(session.book));
}

// The four quarters the package's VATQtr1 to VATQtr4 forms are filled for,
// and the fifth that reaches past the year end into the straddling rows.
function quarterForms(results) {
  const forms = [];
  for (let q = 1; q <= 5; q++) {
    const form = results[`Vatreturns.xlsx!VATQtr${q}`];
    forms.push({ q, periodEnd: isoFromSerial(form.G5), dueDate: isoFromSerial(form.G7), form });
  }
  return forms;
}

describe("derive_vat_return", () => {
  for (const example of EXAMPLES) {
    describe(example.name, () => {
      let session;
      let results;
      beforeAll(async () => {
        session = createSession();
        await openBook(session, { path: join(FIXTURES, example.dir) });
        results = await engineResults(session);
      });

      it("answers the five quarters the package's return forms are filled for, box by box", async () => {
        for (const { periodEnd, dueDate, form } of quarterForms(results)) {
          const answer = await deriveVatReturn(session, { periodEnd });
          expect(answer.periodEnd).toBe(periodEnd);
          expect(answer.dueDate).toBe(dueDate);
          expect(answer.boxes.box1).toBe(pence(form.G9));
          expect(answer.boxes.box2).toBe(0);
          expect(answer.boxes.box3).toBe(pence(form.G13));
          expect(answer.boxes.box4).toBe(pence(form.G15));
          expect(Math.abs(answer.boxes.box5 - form.G17)).toBeLessThan(0.011);
          expect(answer.boxes.box6).toBe(Math.round(form.G21));
          expect(answer.boxes.box7).toBe(Math.round(form.G23));
          expect(answer.boxes.box8).toBe(0);
          expect(answer.boxes.box9).toBe(0);
        }
      });

      it("answers every in-year month end, equal to the interface row's quarter columns", async () => {
        const rows = interfaceRows(results).filter((r) => r.quarter);
        expect(rows).toHaveLength(15);
        for (const row of rows) {
          const answer = await deriveVatReturn(session, { periodEnd: row.periodEnd });
          expect(answer.boxes.box1).toBe(pence(row.quarter.salesVat));
          expect(answer.boxes.box4).toBe(pence(row.quarter.purchasesVat));
          expect(answer.boxes.box6).toBe(Math.round(row.quarter.salesNet));
          expect(answer.boxes.box7).toBe(Math.round(row.quarter.purchasesNet));
          expect(answer.months).toHaveLength(3);
          expect(answer.months[2].periodEnd).toBe(row.periodEnd);
        }
      });

      it("attributes lines whose contributions add up to the boxes, and box 5 to HMRC's own check", async () => {
        const answer = await deriveVatReturn(session, { periodEnd: "2025-09-30", periodStart: "2025-07-01", periodKey: "25A2" });
        expect(answer.periodKey).toBe("25A2");
        expect(answer.periodStart).toBe("2025-07-01");
        expect(answer.vatRegistrationNumber).toBe(example.vrn);
        expect(answer.scheme).toBe("standard");
        const total = (entries) => pence(entries.reduce((sum, entry) => sum + entry.contributes, 0));
        expect(Math.abs(total(answer.lines.box1) - answer.boxes.box1)).toBeLessThan(0.02);
        expect(Math.abs(total(answer.lines.box4) - answer.boxes.box4)).toBeLessThan(0.02);
        expect(Math.abs(total(answer.lines.box6) - answer.boxes.box6)).toBeLessThan(0.51);
        expect(Math.abs(total(answer.lines.box7) - answer.boxes.box7)).toBeLessThan(0.51);
        expect(answer.lines.box1.length).toBeGreaterThan(0);
        expect(answer.lines.box4.length).toBeGreaterThan(0);
        expect(answer.hmrc.netVatDue).toBe(pence(answer.hmrc.totalVatDue - answer.hmrc.vatReclaimedCurrPeriod));
        expect(answer.hmrc.totalVatDue).toBe(pence(answer.hmrc.vatDueSales + answer.hmrc.vatDueAcquisitions));
        for (const entry of [...answer.lines.box1, ...answer.lines.box6]) {
          expect(entry.date >= "2025-07-01" && entry.date <= "2025-09-30").toBe(true);
        }
      });

      it("takes the straddling lines by their own period end", async () => {
        const straddling = session.lines.filter((l) => l["diya-gl:vatPeriodEnd"] !== undefined);
        expect(straddling).toHaveLength(example.straddling);
        // The quarter ending three months after the year end reads rows 18 to
        // 20, which only the straddling lines feed.
        const answer = await deriveVatReturn(session, { periodEnd: "2026-06-30" });
        const afterYear = straddling.filter((l) => l.sourceJournalID === "sales" && l["diya-gl:vatPeriodEnd"] > "2026-03-31");
        expect(answer.lines.box1.map((l) => l.entryNumber).sort()).toEqual(afterYear.map((l) => l.entryNumber).sort());
      });

      it("refuses a period end the book does not carry, and a start that does not open the quarter", async () => {
        await expect(deriveVatReturn(session, { periodEnd: "2025-09-15" })).rejects.toThrow(/carries no VAT period ending 2025-09-15/);
        await expect(deriveVatReturn(session, { periodEnd: "2025-09-30", periodStart: "2025-08-01" })).rejects.toThrow(
          /the quarter ending 2025-09-30 starts 2025-07-01/,
        );
        await expect(deriveVatReturn(session, { periodEnd: "2025-03-31" })).rejects.toThrow(
          /earliest quarter this book answers ends 2025-04-30/,
        );
        await expect(deriveVatReturn(session, {})).rejects.toThrow(/requires periodEnd/);
      });
    });
  }

  it("refuses before a book is open", async () => {
    await expect(deriveVatReturn(createSession(), { periodEnd: "2025-06-30" })).rejects.toThrow(/Call open_book first/);
  });

  it("refuses a book that is not VAT registered instead of answering nil boxes", async () => {
    const session = createSession();
    await openBook(session, { path: join(FIXTURES, "brickwork-pro-ltd-vat") });
    session.book = { ...session.book, entityInformation: { ...session.book.entityInformation, "diya-gl:vatRegistered": false } };
    await expect(deriveVatReturn(session, { periodEnd: "2025-06-30" })).rejects.toThrow(/not declare the company VAT registered/);
  });

  it("refuses a book whose lines do not reconcile with its VAT interface", async () => {
    const session = createSession();
    await openBook(session, { path: join(FIXTURES, "brickwork-pro-ltd-vat") });
    // A sales line moved a year back lands on the same month tab in the
    // engine (tabs are named by month, not year) but outside the quarter's
    // months here, so the attribution and the interface disagree.
    const sale = session.lines.find((l) => l.sourceJournalID === "sales" && l.postingDate.startsWith("2025-08"));
    session.lines = session.lines.map((l) => (l === sale ? { ...l, postingDate: "2024-08-15" } : l));
    await expect(deriveVatReturn(session, { periodEnd: "2025-09-30" })).rejects.toThrow(/do not reconcile|cannot be derived/);
  });

  it("is registered on the server with the period fields", () => {
    expect(TOOLS.derive_vat_return.handler).toBe(deriveVatReturn);
    expect(Object.keys(TOOLS.derive_vat_return.inputSchema).sort()).toEqual(["periodEnd", "periodKey", "periodStart"]);
  });
});
