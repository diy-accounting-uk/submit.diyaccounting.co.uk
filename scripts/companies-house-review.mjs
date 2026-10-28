#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * Review the four accounts cases filed on the Companies House test service as the XML Gateway
 * team reviews them. The companies-house-review skill runs this script and then judges the
 * screenshots by eye.
 *
 * For each accounts case in scripts/fixtures/companies-house-test-service-cases.json it:
 *   - builds the iXBRL document the same way scripts/companies-house-test-service-run.js does;
 *   - picks the example of the same accounts type from a Companies House Accounts Data Product
 *     daily zip;
 *   - renders both in headless Chromium, saves a full-page screenshot and the visible text;
 *   - posts our document to the Companies House test validator (unless --skip-validator);
 *   - checks the criteria and writes findings.md and walkthrough.md;
 *   - writes <case>/source/ (our case input and, from a filing run, the submit request and
 *     response and the last poll response) and <case>/reference/ (the example, labelled a
 *     different company for layout only);
 *   - writes <case>/reconciliation.md (every input field against its tagged value and visible
 *     text, every total recomputed) and index.html, which shows judge.json when one is there.
 *
 * Usage:
 *   node scripts/companies-house-review.mjs --adp-zip <Accounts_Bulk_Data-YYYY-MM-DD.zip>
 *     [--date YYYY-MM-DD] [--out-dir <dir>] [--skip-validator] [--example <case>=<file>]...
 *     [--run <case>=<run id>]... [--runs-dir <dir>]
 *
 * --render-only --out-dir <folder> writes only index.html and walkthrough.md from the files already in
 * the folder and its judge.json: no build, no validator, no gh. Use it after the judge writes judge.json.
 *
 * --out-dir defaults to target/companies-house-review/<date>/. --example replaces the example
 * the script would pick from the zip for one case. --run names the companies-house-test-service
 * run that filed the case; its evidence log gives the submission number, the submit exchange and
 * the last poll. The run's artifact is downloaded with gh, or read from <runs-dir>/<run id>/ when
 * that folder exists.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { buildAccountsIxbrl, extractAndValidateAccountsParameters } from "../app/functions/companies-house/companiesHouseAccountsPost.js";
import { ixbrlStructureProblems } from "../app/lib/ixbrlStructure.js";
import { readReviewFolder } from "./lib/companiesHouseReviewFolder.js";
import { reconcile, reconciliationMarkdown } from "./lib/companiesHouseReviewReconcile.js";
import { isoToday, notCarriedFromInput, sameBalanceSheetDateCriterion, substanceCriteria } from "./lib/companiesHouseReviewCriteria.js";
import {
  FIXTURE_PATH as FIXTURE_RELATIVE_PATH,
  fixtureLineOf,
  gatewayState,
  renderIndex,
  walkthroughMarkdown,
} from "./lib/companiesHouseReviewPage.js";

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = join(REPOSITORY_ROOT, "scripts", "fixtures", "companies-house-test-service-cases.json");
const REPOSITORY_SLUG = "diy-accounting-uk/submit.diyaccounting.co.uk";
const IX_NS = "http://www.xbrl.org/2013/inlineXBRL";

// Text a header leaks when it is not hidden: taxonomy prefixes, URIs, ISO dates, unit names.
// The same pattern as web/browser-tests/accountsDocumentRendering.browser.test.js.
const HEADER_TEXT =
  /xbrli|xbrldi|iso4217|xbrl\.org|companieshouse\.gov\.uk|\b(core|bus|direp|ct-comp):|https?:\/\/|\d{4}-\d{2}-\d{2}|\bpure\b|(?<!by )\bshares\b(?! of)/;

// What each accounts type should declare. Sources are in the companies-house-review skill.
const KINDS = {
  "micro": {
    title: "Micro-entity accounts (FRS 105)",
    members: { AccountsTypeDimension: "FilletedAccounts", AccountingStandardsDimension: "Micro-entities" },
    dormant: false,
    statements: ["section477", "membersNoAudit", "directorsResponsibilities", "microProvisions", "section444-5"],
  },
  "dormant": {
    title: "Dormant micro-entity accounts (FRS 105)",
    members: {
      AccountsTypeDimension: "FilletedAccounts",
      AccountingStandardsDimension: "Micro-entities",
      EntityTradingStatusDimension: "EntityHasNeverTraded",
    },
    dormant: true,
    statements: ["section480", "membersNoAudit", "directorsResponsibilities", "microProvisions", "section444-5"],
  },
  "small-full": {
    title: "Small company full accounts (FRS 102 section 1A)",
    members: {
      AccountsTypeDimension: "FullAccounts",
      AccountingStandardsDimension: "SmallEntities",
      ApplicableLegislationDimension: "SmallCompaniesRegimeForAccounts",
    },
    dormant: false,
    statements: ["section477", "membersNoAudit", "directorsResponsibilities", "smallCompaniesRegime"],
  },
  "small-filleted": {
    title: "Small company filleted accounts (FRS 102 section 1A)",
    members: {
      AccountsTypeDimension: "FilletedAccounts",
      AccountingStandardsDimension: "SmallEntities",
      ApplicableLegislationDimension: "SmallCompaniesRegimeForAccounts",
    },
    dormant: false,
    statements: ["section477", "membersNoAudit", "directorsResponsibilities", "smallCompaniesRegime", "section444-5", "section444-5A"],
  },
};

// The phrase rules from the Companies House accounts TIS, "FRS unaudited accounts statements to
// the Balance sheet". Every inner array is an OR; the outer array is an AND. Case-insensitive.
const STATEMENTS = {
  section477: {
    label: "Section 477 audit exemption statement",
    concept: "StatementThatCompanyEntitledToExemptionFromAuditUnderSection477CompaniesAct2006RelatingToSmallCompanies",
    phrases: [["exempt", "exemption"], ["section 477 of the companies act 2006"]],
  },
  section480: {
    label: "Section 480 dormant audit exemption statement",
    concept: "StatementThatCompanyEntitledToExemptionFromAuditUnderSection480CompaniesAct2006RelatingToDormantCompanies",
    phrases: [["exempt", "exemption"], ["section 480 of the companies act 2006"]],
  },
  membersNoAudit: {
    label: "Members have not required an audit (section 476)",
    concept: "StatementThatMembersHaveNotRequiredCompanyToObtainAnAudit",
    phrases: [["members have not required the company to obtain an audit", "member has not required the company to obtain an audit"]],
  },
  directorsResponsibilities: {
    label: "Directors acknowledge their responsibilities",
    concept: "StatementThatDirectorsAcknowledgeTheirResponsibilitiesUnderCompaniesAct",
    phrases: [["directors acknowledge", "director acknowledges"], ["responsibilities"], ["companies act 2006", "the act"]],
  },
  microProvisions: {
    label: "Prepared in accordance with the micro-entity provisions",
    concept: "StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime",
    phrases: [["prepared"], ["in accordance with"], ["provisions"], ["micro"]],
  },
  smallCompaniesRegime: {
    label: "Prepared in accordance with the small companies regime",
    concept: "StatementThatAccountsHaveBeenPreparedInAccordanceWithProvisionsSmallCompaniesRegime",
    phrases: [["prepared"], ["in accordance with"], ["provisions"], ["small companies"]],
  },
};

// Facts an example carries that ours leaves out on purpose, by reason. The reasons are the judgements
// in the triage record's section "Example facts not carried, and why"; a missing fact named here is
// reported as judged, and any other missing fact is a fail.
const NOT_CARRIED_REASONS = {
  "amended filing": [
    "DateApprovalRevisionReport",
    "StatementRespectsInWhichPreviouslyFiledReportDidNotComplyWithCompaniesAct2006",
    "StatementSignificantAmendmentsToPreviouslyFiledReport",
    "StatementThatRevisedReportReplacesPreviouslyFiledReportForPeriod",
    "StatementThatThisReportHasBeenPreparedAsDatePreviouslyFiledReport",
    "StatementThatThisReportNowStatutoryAccountsForPeriod",
  ],
  "profit and loss lines by nature or investment income the filer has no figure for": [
    "DepreciationAmortisationExpense",
    "DividendIncome",
    "GainLossOnInvestmentsFairValueThroughProfitOrLoss",
    "InterestPayableSimilarChargesFinanceCosts",
    "OtherOperatingExpensesByNature",
    "OtherOperatingIncome",
    "RawMaterialsConsumablesUsed",
    "StaffCostsEmployeeBenefitsExpense",
  ],
  "our profit and loss layout tags ProfitLossOnOrdinaryActivitiesBeforeTax, the Format 1 concept": ["ProfitLossBeforeTax"],
  "balance sheet detail the filer has no figure for": [
    "Investments",
    "NominalValueAllottedShareCapital",
    "OtherInventories",
    "OtherDebtors",
    "Prepayments",
    "TradeDebtorsTradeReceivables",
    "AmountsOwedToRelatedParties",
  ],
  "the example company's own accounting policy or going concern statement": [
    "CashCashEquivalentsPolicy",
    "DescriptionDepreciationMethodForPropertyPlantEquipment",
    "InventoriesPolicy",
    "PropertyPlantEquipmentPolicy",
    "ShareCapitalPolicy",
    "TradePayablesPolicy",
    "TradeReceivablesPolicy",
    "EntityHasClaimedExemptionFromReportingDisclosureRelatedPartyTransactionsForWholly-ownedEntitiesTruefalse",
  ],
  "an accountants' report, which a company that prepares its own accounts does not have": [
    "NameEntityAccountants",
    "StatementOnScopeAccountantsReport",
  ],
  "an auditor's statement; the accounts are unaudited and audit exempt": ["DirectorsReportConsistentWithAccountsTruefalse"],
  "directors' report date, and a filleted set has no directors' report": ["DateSigningDirectorsReport"],
};
const NOT_CARRIED = new Map(
  Object.entries(NOT_CARRIED_REASONS).flatMap(([reason, concepts]) => concepts.map((concept) => [concept, reason])),
);

// Section 444(5): the balance sheet of a small company that does not deliver its profit and loss
// account or directors' report says the accounts were delivered under the small companies regime.
// Section 444(5A): it also discloses that the profit and loss account is not delivered. Section
// 444(5C) lifts 444(5A) for accounts prepared under the micro-entity provisions.
const SECTION_444_5 = /delivered in accordance with the provisions applicable to companies subject to the small companies regime/i;
const SECTION_444_5A =
  /444\s*\(5A\)|profit and loss account (has|have) not been delivered|not to deliver (a copy of )?the (company's )?profit and loss account/i;
const APPROVAL_LINE = /approved by the (board|directors)/i;

// Patterns that pick the example for each accounts type from an Accounts Data Product zip.
const EXAMPLE_RULES = {
  "micro": [/AccountingStandardsDimension[^>]*>\s*[\w-]*:?Micro-entities/, /AccountsTypeDimension[^>]*>\s*[\w-]*:?FilletedAccounts/],
  "dormant": [/AccountingStandardsDimension[^>]*>\s*[\w-]*:?Micro-entities/, /EntityDormantTruefalse[^>]*>\s*true/],
  "small-full": [
    /AccountingStandardsDimension[^>]*>\s*[\w-]*:?SmallEntities/,
    /AccountsTypeDimension[^>]*>\s*[\w-]*:?FullAccounts/,
    /:ProfitLoss"/,
  ],
  "small-filleted": [
    /AccountingStandardsDimension[^>]*>\s*[\w-]*:?SmallEntities/,
    /AccountsTypeDimension[^>]*>\s*[\w-]*:?FilletedAccounts/,
    /444\s*\(5A\)/,
    /:TotalInventories"/,
  ],
};
const EXAMPLE_COMMON = [/(2025|2026)-01-01/, /NameProductionSoftware/];
const EXAMPLE_EXCLUDE_ALL = [/LimitedLiabilityPartnershipLLP/];
const EXAMPLE_EXCLUDE = { micro: [/EntityDormantTruefalse[^>]*>\s*true/] };
// LLP, Scottish LLP and Northern Irish LLP company numbers.
const LLP_ENTRY = /_(OC|SO|NC)\d+_/;

function parseArgs(argv) {
  const args = { examples: {}, runs: {}, skipValidator: false, date: new Date().toISOString().slice(0, 10) };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--skip-validator") args.skipValidator = true;
    else if (flag === "--render-only") args.renderOnly = true;
    else if (flag === "--adp-zip") args.adpZip = argv[(index += 1)];
    else if (flag === "--date") args.date = argv[(index += 1)];
    else if (flag === "--out-dir") args.outDir = argv[(index += 1)];
    else if (flag === "--runs-dir") args.runsDir = argv[(index += 1)];
    else if (flag === "--run") {
      const [caseName, runId] = argv[(index += 1)].split("=");
      args.runs[caseName] = runId;
    } else if (flag === "--example") {
      const [caseName, file] = argv[(index += 1)].split("=");
      args.examples[caseName] = file;
    } else throw new Error(`Unknown argument ${flag}`);
  }
  args.outDir ??= join(REPOSITORY_ROOT, "target", "companies-house-review", args.date);
  return args;
}

function kindOf(testCase) {
  if (testCase.smallCompany) return testCase.smallCompany.filleted ? "small-filleted" : "small-full";
  return testCase.dormant ? "dormant" : "micro";
}

// A zip reader for the Accounts Data Product: central directory, then stored or deflated entries.
function readZipEntries(zipPath) {
  const buffer = readFileSync(zipPath);
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error(`${zipPath} has no zip end record`);
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  const read = (entry) => {
    const start = entry.localOffset + 30 + buffer.readUInt16LE(entry.localOffset + 26) + buffer.readUInt16LE(entry.localOffset + 28);
    const data = buffer.subarray(start, start + entry.compressedSize);
    return (entry.method === 8 ? inflateRawSync(data) : data).toString("utf8");
  };
  return { entries, read };
}

function pickExamples(zipPath, kinds) {
  const { entries, read } = readZipEntries(zipPath);
  const best = {};
  // The newest taxonomy first, then the shortest document.
  const rank = (text) => (text.includes("2026-01-01") ? 0 : 1) * 1e9 + text.length;
  for (const entry of entries.filter((candidate) => /\.x?html$/.test(candidate.name) && !LLP_ENTRY.test(candidate.name))) {
    const text = read(entry);
    if (!EXAMPLE_COMMON.every((pattern) => pattern.test(text)) || EXAMPLE_EXCLUDE_ALL.some((pattern) => pattern.test(text))) continue;
    for (const kind of kinds) {
      const matches = EXAMPLE_RULES[kind].every((pattern) => pattern.test(text));
      const excluded = (EXAMPLE_EXCLUDE[kind] ?? []).some((pattern) => pattern.test(text));
      if (matches && !excluded && (!best[kind] || rank(text) < rank(best[kind].text))) best[kind] = { name: entry.name, text };
    }
  }
  return best;
}

// Everything the review needs from one rendered document.
async function inspect(page, file, screenshotPath) {
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.goto(`file://${file}`, { waitUntil: "load" });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return page.evaluate((ixNs) => {
    const contexts = {};
    for (const context of document.getElementsByTagNameNS("http://www.xbrl.org/2003/instance", "context")) {
      contexts[context.getAttribute("id")] = Array.from(
        context.getElementsByTagNameNS("http://xbrl.org/2006/xbrldi", "explicitMember"),
      ).map((member) => [member.getAttribute("dimension").split(":").pop(), member.textContent.trim().split(":").pop()]);
    }
    const hiddenRoot = (node) => {
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (parent.localName === "hidden" && parent.namespaceURI === ixNs) return true;
      }
      return false;
    };
    const facts = ["nonFraction", "nonNumeric"].flatMap((localName) =>
      Array.from(document.getElementsByTagNameNS(ixNs, localName)).map((fact) => ({
        concept: fact.getAttribute("name").split(":").pop(),
        context: fact.getAttribute("contextRef"),
        members: contexts[fact.getAttribute("contextRef")] ?? [],
        text: fact.textContent.replace(/\s+/g, " ").trim().slice(0, 400),
        hidden: hiddenRoot(fact),
        visible: typeof fact.checkVisibility === "function" ? fact.checkVisibility() : true,
      })),
    );
    const pages = Array.from(document.querySelectorAll("div.page"));
    const balanceSheetPage = pages.find((candidate) => candidate.querySelector("h2")?.textContent.startsWith("Balance sheet"));
    const balanceSheetRows = balanceSheetPage
      ? Array.from(balanceSheetPage.querySelectorAll("tbody tr")).map((row) => ({
          label: row.querySelector("td.label")?.textContent.trim() ?? "",
          figures: Array.from(row.querySelectorAll("td.figure")).map((cell) => cell.textContent.trim()),
        }))
      : null;
    const last = pages[pages.length - 1];
    const after = [];
    for (let node = last?.nextSibling; node; node = node.nextSibling) {
      if (node.nodeType === 1 && node.checkVisibility()) after.push(node.nodeName);
      if (node.nodeType === 3 && node.textContent.trim()) after.push(node.textContent.trim());
    }
    return {
      parseError: document.getElementsByTagName("parsererror").length > 0,
      visibleText: document.body?.innerText ?? "",
      facts,
      balanceSheetRows,
      lastPageTitle: last?.querySelector("h2")?.textContent.trim() ?? null,
      afterLastPage: after,
    };
  }, IX_NS);
}

function membersOf(facts, dimension) {
  return [...new Set(facts.flatMap((fact) => fact.members.filter(([name]) => name === dimension).map(([, member]) => member)))];
}

function factText(facts, concept) {
  return facts.find((fact) => fact.concept === concept)?.text ?? "";
}

function statementResult(key, document) {
  if (key === "section444-5") {
    const sentence = document.visibleText.split(/(?<=\.)\s+/).find((candidate) => SECTION_444_5.test(candidate));
    return {
      label: "Section 444(5): delivered under the small companies regime",
      result: sentence ? "pass" : "fail",
      evidence: sentence
        ? `"${sentence.trim().slice(0, 160)}"`
        : "no sentence says the accounts were delivered under the small companies regime",
    };
  }
  if (key === "section444-5A") {
    const tagged = factText(
      document.facts,
      "StatementThatDirectorsHaveElectedNotToDeliverProfitLossAccountUnderSection4445ACompaniesAct2006",
    );
    const sentence = document.visibleText.split(/(?<=\.)\s+/).find((candidate) => SECTION_444_5A.test(candidate));
    return {
      label: "Section 444(5A): the profit and loss account is not delivered",
      result: sentence ? "pass" : "fail",
      evidence: sentence
        ? `"${sentence.trim().slice(0, 160)}"${tagged ? " (tagged)" : " (untagged)"}`
        : "no sentence names section 444(5A)",
    };
  }
  const rule = STATEMENTS[key];
  const text = factText(document.facts, rule.concept);
  const lower = text.toLowerCase();
  const missing = rule.phrases.filter((options) => !options.some((phrase) => lower.includes(phrase)));
  if (!text) return { label: rule.label, result: "fail", evidence: `no ${rule.concept} fact` };
  return {
    label: rule.label,
    result: missing.length === 0 ? "pass" : "fail",
    evidence:
      missing.length === 0 ? `"${text.slice(0, 160)}"` : `missing the phrase ${missing.map((options) => options.join(" or ")).join("; ")}`,
  };
}

function runValidator(file) {
  const run = spawnSync("node", [join(REPOSITORY_ROOT, "scripts", "validate-accounts-ixbrl.js"), file], {
    encoding: "utf8",
    timeout: 16 * 60 * 1000,
  });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const verdict = output.match(/RESULT: (valid|not valid|could not determine[^\n]*)/)?.[1] ?? "no result";
  return { output, verdict };
}

function judge(kind, ours, example, validator, structureProblems, { input, today }) {
  const spec = KINDS[kind];
  const rows = [];
  const add = (criterion, result, evidence, file) => rows.push({ criterion, result, evidence, file });

  const leak = ours.visibleText.match(HEADER_TEXT);
  add(
    "Nothing of the iXBRL header is visible",
    leak ? "fail" : "pass",
    leak ? `visible text shows "${leak[0]}"` : "no header text in the visible page",
    "visible-text.txt",
  );

  const rows2 = ours.balanceSheetRows;
  if (!rows2) add("A readable balance sheet with labels and both years", "unknown", "no balance sheet page found", "rendered.png");
  else {
    // A line with figures and no label is a subtotal under its group heading.
    const lines = rows2.filter((row) => row.label && row.figures.some(Boolean));
    const oneYear = lines.filter((row) => row.figures.length < 2 || !row.figures.every(Boolean));
    const failed = oneYear.length > 0 || lines.length === 0;
    add(
      "A readable balance sheet with labels and both years",
      failed ? "fail" : "pass",
      failed
        ? `${oneYear.length} of ${lines.length} labelled lines without a figure for both years (${oneYear
            .slice(0, 3)
            .map((row) => `"${row.label}" ${JSON.stringify(row.figures)}`)
            .join(", ")})`
        : `${lines.length} labelled lines, each with two years`,
      "rendered.png",
    );
  }

  const nothingAfter = ours.lastPageTitle === "Notes to the financial statements" && ours.afterLastPage.length === 0;
  add(
    "Nothing after the last note",
    nothingAfter ? "pass" : "fail",
    `last page "${ours.lastPageTitle}"; after it: ${ours.afterLastPage.length ? JSON.stringify(ours.afterLastPage).slice(0, 160) : "nothing"}`,
    "rendered.png",
  );

  if (!example) add("Every fact the example carries is in ours", "unknown", "no example found for this type", "fact-comparison.md");
  else {
    const ourConcepts = new Set(ours.facts.map((fact) => fact.concept));
    const absent = [...new Set(example.facts.map((fact) => fact.concept))].filter((concept) => !ourConcepts.has(concept));
    const missing = absent.filter((concept) => !notCarriedReason(concept, input));
    const judged = absent.filter((concept) => notCarriedReason(concept, input));
    const listed = (concepts) => `${concepts.slice(0, 8).join(", ")}${concepts.length > 8 ? ", ..." : ""}`;
    add(
      "Every fact the example carries is in ours",
      missing.length > 0 ? "fail" : judged.length > 0 ? "judged" : "pass",
      missing.length > 0
        ? `${missing.length} missing: ${listed(missing)}`
        : judged.length > 0
          ? `${judged.length} not carried by judgement: ${listed(judged)}`
          : "all present",
      "fact-comparison.md",
    );
  }

  const software = factText(ours.facts, "NameProductionSoftware");
  const version = factText(ours.facts, "VersionProductionSoftware");
  add(
    "Production software name and version",
    software && version ? "pass" : "fail",
    `NameProductionSoftware "${software}", VersionProductionSoftware "${version}"`,
    "facts.json",
  );

  for (const [dimension, expected] of Object.entries(spec.members)) {
    const found = membersOf(ours.facts, dimension);
    const inExample = example ? membersOf(example.facts, dimension) : [];
    add(
      `${dimension} is ${expected}`,
      found.length === 1 && found[0] === expected ? "pass" : "fail",
      `ours ${found.join(", ") || "none"}; example ${inExample.join(", ") || "none"}`,
      "facts.json",
    );
  }
  const dormantText = factText(ours.facts, "EntityDormantTruefalse").toLowerCase();
  const dormantOk = dormantText === String(spec.dormant) || (spec.dormant ? /^true$/ : /^false$/).test(dormantText);
  add(`EntityDormantTruefalse is ${spec.dormant}`, dormantOk ? "pass" : "fail", `ours "${dormantText}"`, "facts.json");

  add(
    "Companies House test validator passes",
    validator.verdict === "valid" ? "pass" : validator.verdict === "skipped" ? "unknown" : "fail",
    `RESULT: ${validator.verdict}`,
    "validator.txt",
  );
  add(
    "iXBRL structure (app/lib/ixbrlStructure.js)",
    structureProblems.length === 0 ? "pass" : "fail",
    structureProblems.length === 0 ? "no problems" : structureProblems.slice(0, 3).join("; "),
    "filed.xhtml",
  );

  for (const key of spec.statements) {
    const { label, result, evidence } = statementResult(key, ours);
    add(label, result, evidence, "visible-text.txt");
  }

  // The signing director is DirectorSigningFinancialStatements on the context of that director's
  // EntityOfficersDimension member, with the name as NameEntityOfficer on the same member.
  const dateFact = ours.facts.find((fact) => fact.concept === "DateAuthorisationFinancialStatementsForIssue" && fact.visible);
  const signing = ours.facts.find((fact) => fact.concept === "DirectorSigningFinancialStatements");
  const officer = signing?.members.find(([dimension]) => dimension === "EntityOfficersDimension")?.[1];
  const nameFact = officer
    ? ours.facts.find(
        (fact) => fact.concept === "NameEntityOfficer" && fact.visible && fact.members.some(([, member]) => member === officer),
      )
    : null;
  const approvalSentence = ours.visibleText.split(/\n/).find((line) => APPROVAL_LINE.test(line));
  add(
    "Directors' approval line, with date and signing director",
    dateFact && nameFact && approvalSentence ? "pass" : "fail",
    `${approvalSentence ? `"${approvalSentence.trim().slice(0, 100)}"` : "no approval sentence"}; date ${dateFact ? `"${dateFact.text}"` : "not visible"}; DirectorSigningFinancialStatements ${
      signing ? (officer ? `on ${officer}` : "without an EntityOfficersDimension member") : "absent"
    }; signing name ${nameFact ? `"${nameFact.text}"` : "not linked"}`,
    "facts.json",
  );

  for (const found of substanceCriteria({ kind, input, ours, today })) rows.push(found);

  add(
    "Look: the screenshot reads as printed accounts, beside the example",
    "pending",
    "the reviewer opens rendered.png and reference/example.png",
    "rendered.png",
  );
  return rows;
}

// Why an example fact is not carried: a standing judgement, or a part of the company the input does not have.
function notCarriedReason(concept, input) {
  return NOT_CARRIED.get(concept) ?? notCarriedFromInput(concept, input);
}

function factComparison(ours, example, exampleSource, input) {
  const ourConcepts = new Set(ours.facts.map((fact) => fact.concept));
  const exampleConcepts = example ? [...new Set(example.facts.map((fact) => fact.concept))].sort() : [];
  const lines = [
    `# Facts: ours against the example`,
    "",
    `Example: ${exampleSource}`,
    "",
    "| Concept | Example value | Ours |",
    "|---|---|---|",
  ];
  for (const concept of exampleConcepts) {
    const value = example.facts
      .find((fact) => fact.concept === concept)
      .text.replaceAll("|", "/")
      .slice(0, 60);
    const state = ourConcepts.has(concept)
      ? "present"
      : notCarriedReason(concept, input)
        ? `judged: ${notCarriedReason(concept, input)}`
        : "**missing**";
    lines.push(`| ${concept} | ${value} | ${state} |`);
  }
  const extra = [...ourConcepts].filter((concept) => !exampleConcepts.includes(concept)).sort();
  lines.push("", "## In ours, not in the example", "", ...extra.map((concept) => `- ${concept}`), "");
  return lines.join("\n");
}

function submissionOf(testCase) {
  const note = testCase.expectedOutcome?.note ?? "";
  return {
    number: note.match(/Filed as (\w+)/)?.[1] ?? "unknown",
    status: testCase.expectedOutcome?.status ?? "unknown",
    note,
  };
}

function findingsMarkdown(date, reviews) {
  const lines = [
    `# Companies House review, ${date}`,
    "",
    "Each table judges one filed case as the XML Gateway team would. `judged` rows are recorded judgements in the triage record. `pending` rows wait for the reviewer's look at the screenshots.",
    "",
  ];
  for (const review of reviews) {
    lines.push(
      `## ${review.directory}: ${KINDS[review.kind].title}`,
      "",
      `Fixture case \`${review.caseName}\`. Submission ${review.submission.number}, outcome ${review.submission.status}. Example: ${review.exampleSource}.`,
      "",
      "| Criterion | Result | Evidence | File |",
      "|---|---|---|---|",
    );
    for (const row of review.rows) {
      lines.push(
        `| ${row.criterion} | ${row.result} | ${row.evidence.replaceAll("|", "/").replaceAll("\n", " ")} | ${review.directory}/${row.file} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

// The evidence log of a companies-house-test-service run: the first exchange is the submit, the
// last poll-N is the last poll.
function findEvidenceLog(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isFile() && entry.name === "evidence-log.json") return path;
    if (entry.isDirectory()) {
      const found = findEvidenceLog(path);
      if (found) return found;
    }
  }
  return null;
}

function readFilingRun(runId, caseName, runsDir) {
  const local = runsDir ? join(runsDir, runId) : null;
  const downloaded = local && existsSync(local) ? null : mkdtempSync(join(tmpdir(), `ch-run-${runId}-`));
  try {
    if (downloaded) {
      const run = spawnSync("gh", ["run", "download", runId, "--repo", REPOSITORY_SLUG, "-D", downloaded], { encoding: "utf8" });
      if (run.status !== 0) throw new Error(`gh run download ${runId} failed: ${run.stderr}`);
    }
    const logPath = findEvidenceLog(downloaded ?? local);
    if (!logPath) throw new Error(`run ${runId} has no evidence-log.json`);
    const entries = JSON.parse(readFileSync(logPath, "utf8"));
    const entry = entries.find((candidate) => candidate.case === caseName);
    if (!entry) throw new Error(`run ${runId} holds no case ${caseName} (${entries.map((candidate) => candidate.case).join(", ")})`);
    const submit = entry.exchanges.find((exchange) => exchange.label === "submit");
    const polls = entry.exchanges.filter((exchange) => /^poll-\d+$/.test(exchange.label));
    if (!submit) throw new Error(`run ${runId} has no submit exchange for ${caseName}`);
    return {
      runId,
      submissionNumber: entry.submissionNumber,
      observedStatus: entry.observedStatus,
      submitRequest: submit.requestXml ?? "",
      submitResponse: submit.responseXml ?? "",
      lastPoll: polls.length ? (polls[polls.length - 1].responseXml ?? "") : "",
    };
  } finally {
    if (downloaded) rmSync(downloaded, { recursive: true, force: true });
  }
}

function exampleSourceText(rawName, origin) {
  return [
    "A different company's accepted filing, used for layout only. None of its figures are ours.",
    `Raw example: reference/${rawName} (${origin.description})`,
    ...origin.lines,
    "",
  ].join("\n");
}

// Writes index.html and walkthrough.md from the files already in the folder and judge.json. It builds
// no document, posts nothing to the validator and calls no gh.
function renderOnly(args) {
  const reviews = readReviewFolder(args.outDir, readFileSync(FIXTURE_PATH, "utf8"));
  const judgePath = join(args.outDir, "judge.json");
  const judgeJson = existsSync(judgePath) ? JSON.parse(readFileSync(judgePath, "utf8")) : {};
  writeFileSync(join(args.outDir, "walkthrough.md"), walkthroughMarkdown(args.date, reviews, judgeJson));
  writeFileSync(join(args.outDir, "index.html"), renderIndex(args.date, reviews, judgeJson));
  console.log(`Rendered ${reviews.length} cases: ${relative(REPOSITORY_ROOT, args.outDir)}/index.html`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.renderOnly) return renderOnly(args);
  mkdirSync(args.outDir, { recursive: true });
  const cases = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")).filter((testCase) => testCase.type === "accounts");
  const fixtureText = readFileSync(FIXTURE_PATH, "utf8");
  for (const caseName of Object.keys(args.runs)) {
    if (!cases.some((testCase) => testCase.name === caseName)) throw new Error(`--run names ${caseName}, which is not an accounts case`);
  }
  const kinds = cases.map(kindOf);

  const needZip = kinds.filter((kind, index) => !args.examples[cases[index].name]);
  if (needZip.length && !args.adpZip) throw new Error("--adp-zip is required unless --example names a file for every case");
  console.log(needZip.length ? `Picking examples from ${args.adpZip} ...` : "Using the named examples.");
  const picked = needZip.length ? pickExamples(args.adpZip, needZip) : {};

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const reviews = [];
  try {
    for (const [index, testCase] of cases.entries()) {
      const kind = kinds[index];
      const directory = `${index + 1}-${kind}`;
      const caseDir = join(args.outDir, directory);
      const sourceDir = join(caseDir, "source");
      const referenceDir = join(caseDir, "reference");
      mkdirSync(sourceDir, { recursive: true });
      mkdirSync(referenceDir, { recursive: true });
      console.log(`=== ${directory} (${testCase.name}) ===`);

      const { name, type, govTestScenario, expectedOutcome, fictional, ...requestBody } = testCase;
      const errors = [];
      const accounts = extractAndValidateAccountsParameters({ body: JSON.stringify(requestBody) }, errors);
      if (errors.length) throw new Error(`Case ${name} is not a valid accounts request: ${errors.join("; ")}`);
      const filedPath = join(caseDir, "filed.xhtml");
      const xhtml = buildAccountsIxbrl(accounts);
      writeFileSync(filedPath, xhtml);

      writeFileSync(join(sourceDir, "case-input.json"), JSON.stringify(testCase, null, 2));
      let filing = null;
      if (args.runs[name]) {
        filing = readFilingRun(args.runs[name], name, args.runsDir);
        writeFileSync(join(sourceDir, "submit-request.xml"), filing.submitRequest);
        writeFileSync(join(sourceDir, "submit-response.xml"), filing.submitResponse);
        writeFileSync(join(sourceDir, "last-poll-response.xml"), filing.lastPoll);
        const sent = filing.submitRequest.match(/<Data>([^<]{200,})<\/Data>/)?.[1];
        if (sent && Buffer.from(sent, "base64").toString("utf8") !== xhtml) {
          console.log("  the document in the submit request differs from filed.xhtml; a builder changed after the filing");
        }
      }

      const submission = submissionOf(testCase);
      if (filing) {
        submission.number = filing.submissionNumber;
        submission.status = filing.observedStatus;
      }
      writeFileSync(
        join(caseDir, "submission.txt"),
        `Submission number: ${submission.number}${filing ? ` (run ${filing.runId}; last poll ${filing.observedStatus})` : ""}\nExpected outcome: ${testCase.expectedOutcome?.status ?? "unknown"}\nNote: ${submission.note}\n`,
      );

      let exampleSource = "none";
      let exampleRaw = null;
      let exampleOrigin = null;
      if (args.examples[name]) {
        exampleRaw = basename(args.examples[name]);
        copyFileSync(args.examples[name], join(referenceDir, exampleRaw));
        exampleSource = args.examples[name];
        exampleOrigin = { description: "a file chosen with --example", lines: [`File: ${args.examples[name]}`] };
      } else if (picked[kind]) {
        exampleRaw = picked[kind].name;
        writeFileSync(join(referenceDir, exampleRaw), picked[kind].text);
        exampleSource = `${basename(args.adpZip)} entry ${exampleRaw}`;
        const company = exampleRaw.split("_")[2];
        exampleOrigin = {
          description: "unmodified entry from the zip",
          lines: [
            `Zip: ${basename(args.adpZip)} at target/companies-house-review/adp/, from https://download.companieshouse.gov.uk/${basename(args.adpZip)}`,
            `Company: ${company}, https://find-and-update.company-information.service.gov.uk/company/${company}`,
          ],
        };
      }
      if (exampleRaw) writeFileSync(join(referenceDir, "example-source.txt"), exampleSourceText(exampleRaw, exampleOrigin));

      const ours = await inspect(page, filedPath, join(caseDir, "rendered.png"));
      writeFileSync(join(caseDir, "visible-text.txt"), ours.visibleText);
      writeFileSync(join(caseDir, "facts.json"), JSON.stringify(ours.facts, null, 2));
      let example = null;
      if (exampleRaw) {
        // The browser reads a file as XML only when its name ends in .xhtml, and the fact lookup needs the XML namespaces.
        const scratchDir = mkdtempSync(join(tmpdir(), "ch-example-"));
        const scratchPath = join(scratchDir, "example.xhtml");
        copyFileSync(join(referenceDir, exampleRaw), scratchPath);
        try {
          example = await inspect(page, scratchPath, join(referenceDir, "example.png"));
        } finally {
          rmSync(scratchDir, { recursive: true, force: true });
        }
        if (example.parseError) console.log("  the example is not well-formed XHTML; its screenshot shows the parse error");
      }
      writeFileSync(join(caseDir, "fact-comparison.md"), factComparison(ours, example, exampleSource, testCase));

      const validator = args.skipValidator ? { output: "skipped\n", verdict: "skipped" } : runValidator(filedPath);
      writeFileSync(join(caseDir, "validator.txt"), validator.output);
      console.log(`  validator: ${validator.verdict}`);

      const rows = judge(kind, ours, example, validator, ixbrlStructureProblems(xhtml), { input: testCase, today: isoToday() });
      const reconciliation = reconcile(testCase, ours);
      writeFileSync(
        join(caseDir, "reconciliation.md"),
        reconciliationMarkdown(directory, testCase, reconciliation, FIXTURE_RELATIVE_PATH, fixtureLineOf(fixtureText, name)),
      );
      reviews.push({
        directory,
        kind,
        caseName: name,
        title: KINDS[kind].title,
        input: testCase,
        fixtureLine: fixtureLineOf(fixtureText, name),
        submission,
        submissionNumber: submission.number,
        exampleSource,
        exampleRaw: exampleRaw ?? "none",
        exampleCompany: exampleRaw?.split("_")[2] ?? "unknown",
        rows,
        ours,
        reconciliation,
        validator,
        visibleText: ours.visibleText,
        gateway: filing ? gatewayState(filing.submitResponse, filing.lastPoll) : gatewayState(null, null),
      });
    }
  } finally {
    await browser.close();
  }

  // The checks across cases, before the reviewer's Look row.
  for (const review of reviews) {
    const lookAt = review.rows.findIndex((found) => found.criterion.startsWith("Look"));
    review.rows.splice(lookAt < 0 ? review.rows.length : lookAt, 0, sameBalanceSheetDateCriterion(reviews, review));
  }

  writeFileSync(join(args.outDir, "findings.md"), findingsMarkdown(args.date, reviews));
  const judgePath = join(args.outDir, "judge.json");
  const judgeJson = existsSync(judgePath) ? JSON.parse(readFileSync(judgePath, "utf8")) : {};
  writeFileSync(join(args.outDir, "walkthrough.md"), walkthroughMarkdown(args.date, reviews, judgeJson));
  writeFileSync(join(args.outDir, "index.html"), renderIndex(args.date, reviews, judgeJson));
  for (const review of reviews) {
    const counts = review.rows.reduce((tally, row) => ({ ...tally, [row.result]: (tally[row.result] ?? 0) + 1 }), {});
    console.log(`VERDICT ${review.directory}: ${JSON.stringify(counts)}`);
  }
  console.log(`Evidence: ${relative(REPOSITORY_ROOT, args.outDir)}/index.html`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
