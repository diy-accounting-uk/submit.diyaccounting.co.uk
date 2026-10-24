// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/ct600-fields.test.js

import { describe, test, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadDiyaGlData } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js";
import { calculatedResultsFor } from "@diy-accounting-uk/diya-gl/dist/app/bin/export.js";
import { loadTaxDataForBook } from "@diy-accounting-uk/diya-gl/dist/app/lib/product-workbook.js";
import { deriveCt600FromFigures, validateCt600Figures, ct600FiguresFromResults } from "@app/services/ct600Figures.js";
import { ltdTaxDataForPeriodEnd } from "@app/services/ct600Xml.js";
import { extractAndValidateCtReturnParameters, buildCtReturnDocuments } from "@app/services/hmrcCtReturnRequest.js";
import { deriveSmallCompanyAccounts } from "@app/services/smallCompanyAccounts.js";
import {
  CT600_BOX_ROWS,
  CT600_FORM_FIELDS,
  STATEMENT_FIELDS,
  accountsFromValues,
  ct600RequestFromValues,
  figuresFromValues,
  financialYearOf,
  formEntriesFromBook,
  formProblems,
  parsePounds,
  requestFigures,
  targetOfModelProblem,
} from "../public/lib/ct600-fields.js";

const builderSource = readFileSync(join(process.cwd(), "app/services/ct600Xml.js"), "utf8");
const BOOK_DIRECTORY = join(process.cwd(), "fixtures", "diya-gl", "precision-code-ltd");
const COMPANY = { companyName: "Precision Code Ltd", companyNumber: "12345678" };

// Every box the envelope builder reads, as b[<box>], is a box the return can fill.
function boxesTheBuilderEmits() {
  const envelope = builderSource.slice(builderSource.indexOf("export function buildCt600IrEnvelope"));
  return [...new Set([...envelope.matchAll(/\bb\[(\d+)\]/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);
}

function derive(figures) {
  return deriveCt600FromFigures(figures, ltdTaxDataForPeriodEnd(figures.periodEnd));
}

let bookEntries;
let bookFigures;

beforeAll(async () => {
  const { book, lines } = loadDiyaGlData(BOOK_DIRECTORY);
  const accounts = await deriveSmallCompanyAccounts({ book, lines });
  const results = calculatedResultsFor(book, lines, await loadTaxDataForBook(book));
  bookFigures = ct600FiguresFromResults(results, accounts);
  const tradeName = book.entityInformation?.organizationDescription || accounts.companyName;
  bookEntries = formEntriesFromBook(bookFigures, { ...accounts, tradeName });
});

describe("the box rows", () => {
  const emitted = boxesTheBuilderEmits();

  test("the builder emits a plausible set of boxes", () => {
    expect(emitted.length).toBeGreaterThan(30);
  });

  test.each(emitted)("box %i has a row with a label and a guide anchor", (box) => {
    const row = CT600_BOX_ROWS.find((candidate) => candidate.box === box);
    expect(row.label.length).toBeGreaterThan(3);
    expect(row.anchor).toMatch(/^[a-z0-9-]+$/);
    expect(["typed", "worked"]).toContain(row.kind);
  });

  test("no row names a box the builder does not emit, and each box has one row", () => {
    const boxes = CT600_BOX_ROWS.map((row) => row.box);
    expect([...boxes].sort((a, b) => a - b)).toEqual(emitted);
    expect(new Set(boxes).size).toBe(boxes.length);
  });

  test("every box the model emits for a straddling, a marginal relief and a small-profits period has a row", () => {
    const base = {
      ...COMPANY,
      utr: "8596148860",
      companyType: 0,
      declarantName: "Carol Smith",
      declarantStatus: "Director",
      associatedCompanies: 1,
      nonTradingLoanRelationshipCredits: 100,
      lossesBroughtForward: 50,
      frankedInvestmentIncome: 20,
      annualInvestmentAllowance: 100,
      mainPoolAllowances: 100,
      mainPoolBalancingCharges: 30,
      incomeTaxDeducted: 5,
      taxAlreadyPaid: 10,
    };
    const pl = (profitBeforeTax) => ({
      current: { turnover: 500000, costOfSales: 0, administrativeExpenses: 0, interestReceivable: 0, profitBeforeTax },
    });
    const periods = [
      { periodStart: "2025-04-01", periodEnd: "2026-03-31", profitAndLoss: pl(100000) },
      { periodStart: "2025-07-01", periodEnd: "2026-06-30", profitAndLoss: pl(200000) },
      { periodStart: "2025-04-01", periodEnd: "2026-03-31", profitAndLoss: pl(30000) },
    ];
    const known = new Set(CT600_BOX_ROWS.map((row) => row.box));
    for (const period of periods) {
      const { boxes } = derive({ ...base, ...period });
      for (const box of Object.keys(boxes)) expect(known.has(Number(box)), `box ${box}`).toBe(true);
    }
  });

  test("a typed row names a form field that feeds it, and a worked row carries its rule", () => {
    const figureKeys = new Set(CT600_FORM_FIELDS.flatMap((field) => field.figureKeys ?? [field.figure]));
    for (const row of CT600_BOX_ROWS) {
      if (row.kind === "typed") expect(figureKeys.has(row.field), `box ${row.box}`).toBe(true);
      else expect(row.rule?.length, `box ${row.box}`).toBeGreaterThan(5);
    }
  });

  test("a form field with a box labels itself with that box's number", () => {
    for (const field of CT600_FORM_FIELDS.filter(
      (candidate) => candidate.box && candidate.type !== "dates" && candidate.type !== "choice",
    )) {
      expect(field.label).toContain(`Box ${field.box}`);
    }
  });
});

describe("parsePounds", () => {
  test.each([
    ["£1,200.50", false, 1200.5],
    ["1200.5", false, 1200.5],
    [" 1,200 ", true, 1200],
    ["-£500", true, -500],
    ["£-500", true, -500],
    ["0", true, 0],
  ])("reads %s", (input, whole, expected) => {
    expect(parsePounds(input, whole)).toBe(expected);
  });

  test.each([["abc"], ["1,20"], ["--5"], ["-£-5"], ["1.234"], ["1.2.3"], [""], ["£"]])("refuses %s", (input) => {
    expect(parsePounds(input)).toBeNull();
  });

  test("refuses pence where whole pounds are asked", () => {
    expect(parsePounds("12.50", true)).toBeNull();
  });
});

describe("the precision-code-ltd book filling the form", () => {
  function valuesFromEntries(entries) {
    const values = Object.fromEntries(entries);
    values.utr = "8596148860";
    values.companyType = "no";
    values.loanOverdrawn = "no";
    values.declarantStatus = "Director";
    values.declarationAccepted = true;
    for (const { id } of STATEMENT_FIELDS) values[id] = true;
    return values;
  }

  test("fills the period, every typed amount, the accounts, the trade name and the signer", () => {
    const filled = new Map(bookEntries);
    for (const id of [
      "periodStart",
      "periodEnd",
      "tradeName",
      "currentTurnover",
      "currentCostOfSales",
      "currentFixedAssets",
      "currentCalledUpShareCapital",
      "principalActivity",
      "accountingPolicies",
      "directors",
      "averageEmployees",
      "directorName",
      "directorDateApproved",
      "declarantName",
      "depreciation",
      "annualInvestmentAllowance",
      "associatedCompanies",
    ]) {
      expect(String(filled.get(id) ?? ""), id).not.toBe("");
    }
    expect(filled.get("periodStart")).toBe("2025-04-01");
    expect(filled.get("includeFixedAssetNote")).toBe(true);
  });

  test("the filled form passes every check and works the same boxes the book does", () => {
    const values = valuesFromEntries(bookEntries);
    expect(formProblems(values)).toEqual([]);
    const figures = figuresFromValues(values, COMPANY, bookFigures.workingSheet);
    expect(validateCt600Figures(figures, { today: "2026-10-24", taxDataByYear: ltdTaxDataForPeriodEnd(figures.periodEnd) })).toEqual([]);
    const fromForm = derive(figures);
    const fromBook = derive({
      ...bookFigures,
      ...COMPANY,
      utr: "8596148860",
      companyType: 0,
      declarantName: values.declarantName,
      declarantStatus: "Director",
    });
    expect(fromForm.boxes).toEqual(fromBook.boxes);
    expect(fromForm.computationLines).toEqual(fromBook.computationLines);
  });

  test("the request carries the figures without the facts the request names elsewhere", () => {
    const figures = figuresFromValues(valuesFromEntries(bookEntries), COMPANY, bookFigures.workingSheet);
    const sent = requestFigures(figures);
    expect(Object.keys(sent)).toEqual(expect.arrayContaining(["periodStart", "periodEnd", "annualInvestmentAllowance", "workingSheet"]));
    for (const named of ["utr", "companyName", "declarantName", "profitAndLoss"]) expect(sent).not.toHaveProperty(named);
  });

  test("the request the form builds passes the server's checks and works the same boxes as the book", () => {
    const values = valuesFromEntries(bookEntries);
    const body = { ...ct600RequestFromValues(values, COMPANY, bookFigures.workingSheet), gatewayUserId: "user", gatewayPassword: "pass" };
    const errors = [];
    const request = extractAndValidateCtReturnParameters({ body: JSON.stringify(body) }, errors);
    expect(errors).toEqual([]);
    const documents = buildCtReturnDocuments(request);
    const fromBook = derive({
      ...bookFigures,
      ...COMPANY,
      utr: "8596148860",
      companyType: 0,
      declarantName: values.declarantName,
      declarantStatus: "Director",
    });
    expect(documents.boxes).toEqual(fromBook.boxes);
  });

  test("the accounts read from the form keep the period, the directors and the note", () => {
    const accounts = accountsFromValues(valuesFromEntries(bookEntries));
    expect(accounts.smallCompany.directors.length).toBeGreaterThan(0);
    expect(accounts.smallCompany.fixedAssetNote).toBeDefined();
    expect(accounts.smallCompany.filleted).toBe(false);
  });
});

describe("the form's own checks", () => {
  function complete() {
    const values = Object.fromEntries(bookEntries);
    Object.assign(values, {
      utr: "8596148860",
      companyType: "no",
      loanOverdrawn: "no",
      declarantStatus: "Director",
      declarationAccepted: true,
    });
    for (const { id } of STATEMENT_FIELDS) values[id] = true;
    return values;
  }

  test("names an overdrawn director's loan account as a refusal at the question", () => {
    expect(formProblems({ ...complete(), loanOverdrawn: "yes" })).toContainEqual(
      expect.objectContaining({ target: "loanOverdrawn", refusal: true }),
    );
  });

  test("names a balance sheet that does not balance beside the reserve", () => {
    const problems = formProblems({ ...complete(), currentCashAtBank: "1" });
    expect(problems.find((problem) => problem.target === "currentProfitAndLossAccount")?.message).toMatch(/does not balance/);
  });

  test("names a fixed asset note that disagrees with the fixed assets and the depreciation added back", () => {
    const problems = formProblems({ ...complete(), currentFixedAssets: "1", depreciation: "7" });
    expect(problems.map((problem) => problem.target)).toEqual(expect.arrayContaining(["includeFixedAssetNote", "depreciation"]));
  });

  test("asks for the statements and the declaration", () => {
    const targets = formProblems({ ...complete(), statementSmallCompaniesRegime: false, declarationAccepted: false }).map(
      (problem) => problem.target,
    );
    expect(targets).toEqual(expect.arrayContaining(["statementSmallCompaniesRegime", "declarationAccepted"]));
  });

  test("refuses text where an amount belongs", () => {
    expect(formProblems({ ...complete(), amortisation: "lots" })).toContainEqual(expect.objectContaining({ target: "amortisation" }));
  });

  test("the model's problems show beside the field they name, or at the worked tax", () => {
    const known = new Set(["utr", "associatedCompanies", "period"]);
    expect(targetOfModelProblem("utr", known)).toBe("utr");
    expect(targetOfModelProblem("period", known)).toBe("period");
    expect(targetOfModelProblem("profitAndLoss", known)).toBe("workedTax");
    expect(targetOfModelProblem("corporationTax", known)).toBe("workedTax");
  });

  test("a model problem for a bad UTR, associated companies and a long period comes back through the form's values", () => {
    const values = { ...complete(), utr: "123", associatedCompanies: "-1", periodEnd: "2026-04-01" };
    const problems = validateCt600Figures(figuresFromValues(values, COMPANY));
    expect(problems.map((problem) => problem.field)).toEqual(expect.arrayContaining(["utr", "associatedCompanies", "period"]));
  });

  test("a financial year starts on 1 April", () => {
    expect(financialYearOf("2026-03-31")).toBe(2025);
    expect(financialYearOf("2026-04-01")).toBe(2026);
  });
});
