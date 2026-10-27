// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAccountsIxbrl, extractAndValidateAccountsParameters } from "../../functions/companies-house/companiesHouseAccountsPost.js";
import { parseFigure, longDate, reconcile, reconciliationMarkdown } from "../../../scripts/lib/companiesHouseReviewReconcile.js";
import {
  categoryCriterion,
  companyInformationCriterion,
  hiddenNarrativeCriterion,
  neverTradedCriterion,
  periodCriterion,
  placeholderCriterion,
  sameBalanceSheetDateCriterion,
  substanceCriteria,
} from "../../../scripts/lib/companiesHouseReviewCriteria.js";
import { parseFindings, readReviewFolder } from "../../../scripts/lib/companiesHouseReviewFolder.js";
import {
  companySource,
  dataHref,
  fixtureLineOf,
  gatewayState,
  renderIndex,
  walkthroughMarkdown,
  walkthroughSection,
} from "../../../scripts/lib/companiesHouseReviewPage.js";

const FIXTURE = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../scripts/fixtures/companies-house-test-service-cases.json"), "utf8"),
);
const TODAY = "2026-10-27";
const KIND_OF = {
  "micro-entity-accounts": "micro",
  "micro-entity-accounts-dormant": "dormant",
  "small-company-accounts-full": "small-full",
  "small-company-accounts-filleted": "small-filleted",
};

const text = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&#163;", "£")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

// The facts and visible text of a built document, read from the markup: what the browser pass of
// the review script reports, without a browser.
function oursFrom(xhtml) {
  const hiddenRanges = [...xhtml.matchAll(/<ix:hidden>[\s\S]*?<\/ix:hidden>/g)].map((m) => [m.index, m.index + m[0].length]);
  const facts = [...xhtml.matchAll(/<ix:(nonFraction|nonNumeric)\b([^>]*)>([\s\S]*?)<\/ix:\1>/g)].map((m) => {
    const hidden = hiddenRanges.some(([from, to]) => m.index >= from && m.index < to);
    return {
      concept: m[2].match(/name="[^:"]*:([^"]+)"/)[1],
      context: m[2].match(/contextRef="([^"]+)"/)[1],
      text: text(m[3]),
      hidden,
      visible: !hidden,
    };
  });
  const body = xhtml.replace(/<ix:header>[\s\S]*?<\/ix:header>/, "").replace(/<head>[\s\S]*?<\/head>/, "");
  return { facts, visibleText: text(body) };
}

const cases = FIXTURE.filter((testCase) => testCase.type === "accounts").map((testCase) => {
  const { name, type, govTestScenario, expectedOutcome, fictional, ...requestBody } = testCase;
  const errors = [];
  const accounts = extractAndValidateAccountsParameters({ body: JSON.stringify(requestBody) }, errors);
  expect(errors).toEqual([]);
  const ours = oursFrom(buildAccountsIxbrl(accounts));
  return { name, kind: KIND_OF[name], input: testCase, ours, directory: `${Object.keys(KIND_OF).indexOf(name) + 1}-${KIND_OF[name]}` };
});
const caseNamed = (name) => cases.find((candidate) => candidate.name === name);
const withText = (ours, change) => ({ ...ours, visibleText: change(ours.visibleText) });

describe("reconcile", () => {
  it("reads figures as the page prints them", () => {
    expect(parseFigure("1,234")).toBe(1234);
    expect(parseFigure("(5)")).toBe(-5);
    expect(parseFigure("-")).toBe(0);
    expect(parseFigure("")).toBeNull();
    expect(parseFigure("words")).toBeNull();
    expect(longDate("2026-03-31")).toBe("31 March 2026");
  });

  it.each(cases.map((c) => [c.name, c]))("finds no mismatch between input and output for %s", (_name, c) => {
    const result = reconcile(c.input, c.ours);
    expect(result.rows.length).toBeGreaterThan(15);
    expect(result.totals.length).toBeGreaterThanOrEqual(10);
    expect(result.rows.filter((row) => row.result !== "match")).toEqual([]);
    expect(result.totals.filter((total) => total.result !== "match")).toEqual([]);
    expect(result.mismatches).toBe(0);
  });

  it("checks each registered office part against its tag", () => {
    const c = caseNamed("micro-entity-accounts-dormant");
    const result = reconcile(c.input, c.ours);
    const fields = result.rows.filter((row) => row.field.startsWith("registeredOffice.")).map((row) => row.field);
    expect(fields).toEqual([
      "registeredOffice.addressLine1",
      "registeredOffice.cityOrTown",
      "registeredOffice.countyRegion",
      "registeredOffice.postalCode",
    ]);
    const facts = c.ours.facts.filter((fact) => fact.concept !== "PostalCodeZip");
    expect(reconcile(c.input, { ...c.ours, facts }).mismatches).toBe(1);
  });

  it("reconciles accruals, the current tax note, the current income tax policy and the dividend policy, and flags each when untagged", () => {
    const base = caseNamed("small-company-accounts-filleted").input;
    const { name, type, govTestScenario, expectedOutcome, fictional, ...requestBody } = base;
    const sheet = base.smallCompany.balanceSheet;
    const withAccruals = (year) => ({ ...year, accruals: 100, otherCreditors: year.otherCreditors - 100 });
    const smallCompany = {
      ...base.smallCompany,
      balanceSheet: { currentYear: withAccruals(sheet.currentYear), priorYear: withAccruals(sheet.priorYear) },
    };
    const input = { ...base, smallCompany };
    const errors = [];
    const accounts = extractAndValidateAccountsParameters({ body: JSON.stringify({ ...requestBody, smallCompany }) }, errors);
    expect(errors).toEqual([]);
    const ours = oursFrom(buildAccountsIxbrl(accounts));
    const result = reconcile(input, ours);
    expect(result.mismatches).toBe(0);
    const fields = result.rows.map((row) => row.field);
    for (const field of [
      "balanceSheet.currentYear.accruals",
      "balanceSheet.priorYear.accruals",
      "smallCompany.currentTax.currentYear",
      "smallCompany.currentTax.priorYear",
      "smallCompany.currentIncomeTaxPolicy",
      "smallCompany.dividendPolicy",
    ]) {
      expect(fields).toContain(field);
    }
    for (const concept of ["AccruedLiabilities", "CurrentTaxForPeriod", "CurrentIncomeTaxPolicy", "DividendPolicy"]) {
      const without = ours.facts.filter((fact) => fact.concept !== concept);
      expect(reconcile(input, { ...ours, facts: without }).mismatches).toBeGreaterThan(0);
    }
  });

  it("reconciles a case with an overdraft and a taxation line, recomputing the creditors total with them", () => {
    const base = caseNamed("small-company-accounts-full").input;
    const { name, type, govTestScenario, expectedOutcome, fictional, ...requestBody } = base;
    const currentYear = {
      ...base.smallCompany.balanceSheet.currentYear,
      cashAtBank: base.smallCompany.balanceSheet.currentYear.cashAtBank + 100,
      bankLoansOverdrafts: 100,
      taxationSocialSecurity: 50,
      otherCreditors: base.smallCompany.balanceSheet.currentYear.otherCreditors - 50,
    };
    const input = { ...base, smallCompany: { ...base.smallCompany, balanceSheet: { ...base.smallCompany.balanceSheet, currentYear } } };
    const errors = [];
    const accounts = extractAndValidateAccountsParameters(
      { body: JSON.stringify({ ...requestBody, smallCompany: input.smallCompany }) },
      errors,
    );
    expect(errors).toEqual([]);
    const ours = oursFrom(buildAccountsIxbrl(accounts));
    const result = reconcile(input, ours);
    expect(result.mismatches).toBe(0);
    const fields = result.rows.map((row) => row.field);
    expect(fields).toContain("balanceSheet.currentYear.bankLoansOverdrafts");
    expect(fields).toContain("balanceSheet.currentYear.taxationSocialSecurity");
    expect(fields).not.toContain("balanceSheet.currentYear.bankLoansAfterOneYear");
    expect(fields).not.toContain("balanceSheet.priorYear.bankLoansOverdrafts");
    const withoutBank = ours.facts.filter((fact) => fact.concept !== "BankBorrowingsOverdrafts");
    expect(reconcile(input, { ...ours, facts: withoutBank }).mismatches).toBeGreaterThan(0);
  });

  it("checks the accountants' report, the policies and the controlling party fact", () => {
    const dormant = reconcile(caseNamed("micro-entity-accounts-dormant").input, caseNamed("micro-entity-accounts-dormant").ours);
    expect(dormant.rows.map((row) => row.field)).toEqual(
      expect.arrayContaining(["accountantsReport.accountantsName", "accountantsReport.statement"]),
    );
    const small = caseNamed("small-company-accounts-full");
    const fields = reconcile(small.input, small.ours).rows.map((row) => row.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        "smallCompany.goingConcernStatement",
        "smallCompany.revenueRecognitionPolicy",
        "smallCompany.tangibleFixedAssetsPolicy",
        "smallCompany.impairmentPolicy",
        "smallCompany.financialInstrumentsPolicy",
        "smallCompany.controllingParty.ultimate",
      ]),
    );
  });

  it("counts a changed tagged figure as a mismatch", () => {
    const c = caseNamed("micro-entity-accounts");
    const facts = c.ours.facts.map((fact) =>
      fact.concept === "CurrentAssets" && fact.context === "e2026" ? { ...fact, text: "1" } : fact,
    );
    const result = reconcile(c.input, { ...c.ours, facts });
    expect(result.mismatches).toBeGreaterThan(0);
  });

  it("writes the reconciliation as markdown with the counts", () => {
    const c = caseNamed("micro-entity-accounts");
    const markdown = reconciliationMarkdown("1-micro", c.input, reconcile(c.input, c.ours), "scripts/fixtures/x.json", 3);
    expect(markdown).toContain("# 1-micro: our input against our output");
    expect(markdown).toContain("| Net assets 2026 |");
    expect(markdown).toMatch(/\d+ input fields and \d+ totals checked; 0 mismatches\./);
  });
});

describe("substance criteria", () => {
  it.each(cases.map((c) => [c.name, c]))("passes every check for %s", (_name, c) => {
    const rows = substanceCriteria({ kind: c.kind, input: c.input, ours: c.ours, today: TODAY });
    expect(rows.filter((row) => row.result !== "pass").map((row) => `${row.criterion}: ${row.evidence}`)).toEqual([]);
    expect(rows.length).toBe(c.kind === "dormant" ? 6 : 5);
  });

  it("fails a public company", () => {
    const c = caseNamed("micro-entity-accounts");
    const byName = categoryCriterion({ ...c.input, companyName: "DIY ACCOUNTING PLC" }, c.ours);
    expect(byName.result).toBe("fail");
    const byText = categoryCriterion(
      c.input,
      withText(c.ours, (t) => t.replace("private company", "public company")),
    );
    expect(byText.result).toBe("fail");
  });

  it("is unsure when the accounts do not say private", () => {
    const c = caseNamed("micro-entity-accounts");
    expect(
      categoryCriterion(
        c.input,
        withText(c.ours, (t) => t.replace("private company", "company")),
      ).result,
    ).toBe("unknown");
  });

  it("fails when the s396(A1) statement is not visible", () => {
    const c = caseNamed("small-company-accounts-full");
    const result = companyInformationCriterion(
      c.input,
      withText(c.ours, (t) => t.replace(/registered in England and Wales/i, "")),
    );
    expect(result.result).toBe("fail");
    expect(result.evidence).toContain("part of the UK");
    expect(
      companyInformationCriterion(
        c.input,
        withText(c.ours, (t) => t.replace(/registered office/gi, "office")),
      ).result,
    ).toBe("fail");
  });

  it("fails a period that has not ended or an approval date in the future", () => {
    const c = caseNamed("micro-entity-accounts");
    expect(periodCriterion(c.input, "2026-03-31").result).toBe("fail");
    expect(periodCriterion(c.input, "2026-09-14").result).toBe("fail");
    expect(periodCriterion(c.input, "2026-09-15").result).toBe("pass");
    const early = { ...c.input, director: { ...c.input.director, dateApproved: "2026-01-01" } };
    expect(periodCriterion(early, TODAY).result).toBe("fail");
  });

  it("fails a statement that only the hidden header carries", () => {
    const c = caseNamed("micro-entity-accounts");
    const hiddenOnly = {
      concept: "StatementThatSomethingIsSo",
      context: "y2026",
      text: "The company is entitled to a thing nobody reads",
      hidden: true,
      visible: false,
    };
    const result = hiddenNarrativeCriterion({ ...c.ours, facts: [...c.ours.facts, hiddenOnly] });
    expect(result.result).toBe("fail");
    expect(result.evidence).toContain("StatementThatSomethingIsSo");
    expect(hiddenNarrativeCriterion(c.ours).result).toBe("pass");
  });

  it("requires the never-traded sentence on the dormant accounts", () => {
    const c = caseNamed("micro-entity-accounts-dormant");
    expect(neverTradedCriterion(c.ours).result).toBe("pass");
    expect(neverTradedCriterion(withText(c.ours, (t) => t.replace(/has not traded/gi, "was quiet"))).result).toBe("fail");
  });

  it("fails placeholder text in names, officers and addresses", () => {
    const c = caseNamed("micro-entity-accounts");
    expect(placeholderCriterion({ ...c.input, companyName: "TEST COMPANY LIMITED" }, c.ours).result).toBe("fail");
    expect(placeholderCriterion({ ...c.input, director: { ...c.input.director, name: "Fictional Director" } }, c.ours).result).toBe("fail");
    expect(
      placeholderCriterion({ ...c.input, registeredOffice: { addressLine1: "Example Street", postalCode: "00000000" } }, c.ours).result,
    ).toBe("fail");
    expect(placeholderCriterion({ ...c.input, companyNumber: "00000000" }, c.ours).result).toBe("fail");
    expect(placeholderCriterion(c.input, c.ours).result).toBe("pass");
  });

  it("fails when one company's cases file different balance sheet dates", () => {
    const [first, second] = ["small-company-accounts-full", "small-company-accounts-filleted"].map(caseNamed);
    const reviews = [first, second];
    expect(sameBalanceSheetDateCriterion(reviews, first).result).toBe("pass");
    const moved = {
      ...second,
      ours: {
        ...second.ours,
        facts: second.ours.facts.map((fact) => (fact.concept === "BalanceSheetDate" ? { ...fact, text: "30 April 2026" } : fact)),
      },
    };
    const result = sameBalanceSheetDateCriterion([first, moved], first);
    expect(result.result).toBe("fail");
    expect(result.evidence).toContain("30 April 2026");
  });

  it("passes a company that has one case only", () => {
    const dormant = caseNamed("micro-entity-accounts-dormant");
    expect(sameBalanceSheetDateCriterion(cases, dormant).result).toBe("pass");
    expect(sameBalanceSheetDateCriterion(cases, dormant).evidence).toContain("only case");
  });
});

describe("review page", () => {
  const review = (c) => ({
    directory: c.directory,
    title: "A title",
    submissionNumber: "00005D",
    input: c.input,
    fixtureLine: 12,
    rows: [{ criterion: "Nothing of the iXBRL header is visible", result: "pass", evidence: "a | b", file: "visible-text.txt" }],
    reconciliation: reconcile(c.input, c.ours),
    validator: { verdict: "valid", output: "RESULT: valid\n" },
    visibleText: c.ours.visibleText,
    gateway: gatewayState("<Qualifier>response</Qualifier><GatewayTimestamp>t</GatewayTimestamp>", "<StatusCode>PENDING</StatusCode>"),
    exampleRaw: "Prod223_4336_08029938_20260228.html",
    exampleCompany: "08029938",
  });

  it("names a real company by its register entry and a fictional one as made up", () => {
    const real = companySource(caseNamed("micro-entity-accounts").input);
    expect(real.page).toContain("https://find-and-update.company-information.service.gov.uk/company/06846849");
    expect(real.page).toContain("2025 column from its filed 2025 accounts");
    const fictional = companySource(caseNamed("micro-entity-accounts-dormant").input);
    expect(fictional.page).toContain("Fictional private company in our fixture");
    expect(fictional.page).not.toContain("find-and-update");
  });

  it("reads the gateway answer", () => {
    expect(gatewayState("<Qualifier>response</Qualifier>", "<StatusCode>PENDING</StatusCode>")).toMatchObject({
      known: true,
      acknowledged: true,
      statuses: ["PENDING"],
    });
    expect(
      gatewayState("<GovTalkErrors><Error><Text>bad</Text></Error></GovTalkErrors><Qualifier>error</Qualifier>", "").acknowledged,
    ).toBe(false);
    expect(gatewayState(null, null).known).toBe(false);
  });

  it("links a judge data path once, whatever prefix it carries", () => {
    const directories = ["1-micro", "2-dormant"];
    expect(dataHref("2-dormant", "visible-text.txt", directories)).toBe("2-dormant/visible-text.txt");
    expect(dataHref("2-dormant", "2-dormant/visible-text.txt", directories)).toBe("2-dormant/visible-text.txt");
    expect(dataHref("1-micro", "2-dormant/visible-text.txt", directories)).toBe("2-dormant/visible-text.txt");
    expect(dataHref("1-micro", "../private/x.md", directories)).toBe("../private/x.md");
  });

  it("finds the fixture line of a case", () => {
    expect(fixtureLineOf('{\n  "name": "a",\n  "name": "b"\n}', "b")).toBe(3);
    expect(fixtureLineOf("{}", "missing")).toBe("?");
  });

  it("writes one walkthrough section per case with the steps numbered from 0", () => {
    const c = caseNamed("micro-entity-accounts");
    const section = walkthroughSection(review(c), { verdict: "pass", summary: "Fine." });
    expect(section).toContain("## 1-micro: A title, submission 00005D");
    expect(section).toContain("- **Judge:** pass. Fine. Reasoning in `index.html`.");
    expect(section).toContain("0. `1-micro/reconciliation.md`");
    expect(section).toContain("7. `1-micro/filed.xhtml`");
    const all = walkthroughMarkdown("2026-10-27", [review(c)], {});
    expect(all).not.toContain("**Judge:**");
  });

  it("renders the page parts in order, with and without a judge", () => {
    const c = caseNamed("micro-entity-accounts");
    const judge = {
      [c.directory]: {
        verdict: "pass",
        summary: "ok",
        rows: {},
        added: [{ check: "x", why: "y", result: "pass", found: "z", data: `${c.directory}/visible-text.txt` }],
        reasoning: ["Because."],
      },
    };
    const page = renderIndex("2026-10-27", [review(c)], judge);
    const order = [
      "Proven",
      "1. Our input against our output",
      "2. Companies House&#x27;s rules",
      "2b. Checks the judge added",
      "3. What the gateway answered",
      "4. Our layout beside",
      "5. Judge&#x27;s reasoning",
    ];
    const positions = order.map((part) => page.indexOf(part.replace("&#x27;", "'")));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(page).toContain(`href='${c.directory}/visible-text.txt'`);
    expect(page).not.toContain(`${c.directory}/${c.directory}/`);
    const bare = renderIndex("2026-10-27", [review(c)], {});
    expect(bare).not.toContain("2b. Checks the judge added");
    expect(bare).toContain("pending");
  });
});

describe("render-only", () => {
  const folder = () => {
    const c = caseNamed("micro-entity-accounts");
    const root = mkdtempSync(join(tmpdir(), "ch-render-"));
    mkdirSync(join(root, "1-micro", "source"), { recursive: true });
    mkdirSync(join(root, "1-micro", "reference"), { recursive: true });
    writeFileSync(join(root, "1-micro", "source", "case-input.json"), JSON.stringify(c.input));
    writeFileSync(join(root, "1-micro", "facts.json"), JSON.stringify(c.ours.facts));
    writeFileSync(join(root, "1-micro", "visible-text.txt"), c.ours.visibleText);
    writeFileSync(join(root, "1-micro", "validator.txt"), "RESULT: valid\n");
    writeFileSync(join(root, "1-micro", "submission.txt"), "Submission number: 00005D (run 1)\n");
    writeFileSync(join(root, "1-micro", "reference", "Prod223_4336_16606594_20260731.html"), "<html/>");
    writeFileSync(
      join(root, "findings.md"),
      [
        "# Companies House review, 2026-10-27",
        "",
        "## 1-micro: Micro-entity accounts (FRS 105)",
        "",
        "Fixture case `micro-entity-accounts`. Submission 00005D, outcome POLL_TIMEOUT.",
        "",
        "| Criterion | Result | Evidence | File |",
        "|---|---|---|---|",
        "| Nothing of the iXBRL header is visible | pass | no header text | 1-micro/visible-text.txt |",
        "| Look: the screenshot reads as printed accounts, beside the example | pass | read by a person | 1-micro/rendered.png |",
        "",
      ].join("\n"),
    );
    return root;
  };

  it("reads the findings rows as written, keeping a Look row a person filled in", () => {
    const [section] = parseFindings(readFileSync(join(folder(), "findings.md"), "utf8"));
    expect(section).toMatchObject({ directory: "1-micro", caseName: "micro-entity-accounts" });
    expect(section.rows.map((row) => [row.result, row.file])).toEqual([
      ["pass", "visible-text.txt"],
      ["pass", "rendered.png"],
    ]);
  });

  it("renders the page from the files in the folder without the criteria it lacks", () => {
    const root = folder();
    const reviews = readReviewFolder(
      root,
      readFileSync(join(import.meta.dirname, "../../../scripts/fixtures/companies-house-test-service-cases.json"), "utf8"),
    );
    expect(reviews[0]).toMatchObject({ submissionNumber: "00005D", exampleCompany: "16606594", validator: { verdict: "valid" } });
    expect(reviews[0].reconciliation.mismatches).toBe(0);
    expect(reviews[0].gateway.known).toBe(false);
    const page = renderIndex("2026-10-27", reviews, { "1-micro": { verdict: "pass", summary: "Fine." } });
    expect(page).toContain("read by a person");
    expect(page).not.toContain("s396(A1)");
    expect(page).toContain("Fine.");
  });
});
