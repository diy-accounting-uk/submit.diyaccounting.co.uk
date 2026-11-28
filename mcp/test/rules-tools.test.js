// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// rules-tools.test.js -- look_up_rule's rules data agrees with the tax-sources files and the rate and
// calendar builders, its search finds a rule by its words or id, and a derivation answers the links of
// the rules it used wherever look_up_rule is offered beside it.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createSession, openBook } from "../lib/book-tools.js";
import { HOSTED_OVERRIDES, hostedToolNames } from "../lib/hosted-tools.js";
import { handleMcpRequest } from "../lib/http.js";
import { findRules, lookUpRule, ruleSources } from "../lib/rules-tools.js";
import { buildRulesData, renderRulesData } from "../../scripts/build-rules-data.mjs";
import { loadSources } from "../../scripts/tax-sources.mjs";
import { RATES_FACT_IDS } from "../../scripts/rates-fact-ids.mjs";
import { allFactIds } from "../../scripts/build-mtd-calendar.mjs";
import { SOURCED_RULE_FACTS } from "../../scripts/rules-facts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "fixtures");
const RULES_DATA = JSON.parse(readFileSync(join(HERE, "..", "lib", "rules-data.json"), "utf8"));

describe("the rules data", () => {
  it("is the committed render of the tax-sources files and the two builders' facts", async () => {
    expect(readFileSync(join(HERE, "..", "lib", "rules-data.json"), "utf8")).toBe(await renderRulesData());
  });

  it("holds every rates page and calendar fact, each with a value and a gov.uk source of its own", () => {
    const sources = loadSources();
    expect(RULES_DATA.rules.map((rule) => rule.id).sort()).toEqual(
      [...RATES_FACT_IDS, ...allFactIds(), ...SOURCED_RULE_FACTS.map((fact) => fact.id)].sort(),
    );
    for (const rule of RULES_DATA.rules) {
      expect(rule.value, rule.id).not.toBeUndefined();
      expect(rule.display, rule.id).toBeTruthy();
      expect(rule.sources.length, rule.id).toBeGreaterThan(0);
      for (const source of rule.sources) {
        const file = sources.find((candidate) => candidate.url === source.url && candidate.quote === source.quote);
        expect(file?.facts, rule.id).toContain(rule.id);
        expect(source.url, rule.id).toMatch(/^https:\/\/www\.(legislation\.)?gov\.uk\//);
        expect(source.retrieved, rule.id).toBe(file.retrieved);
      }
    }
  });

  it("answers every fact that a tax-sources file lists", () => {
    const answered = new Set(RULES_DATA.rules.map((rule) => rule.id));
    const cited = [...new Set(loadSources().flatMap((source) => source.facts))];
    expect(cited.filter((fact) => !answered.has(fact))).toEqual([]);
  });

  it("refuses to build when a source lists a fact that has no value", () => {
    const sources = loadSources().map((source, index) =>
      index === 0 ? { ...source, facts: [...source.facts, "vat-unknown-fact"] } : source,
    );
    expect(() => buildRulesData(sources)).toThrow("No value for the facts vat-unknown-fact");
  });

  it("refuses to build a fact that no source lists", () => {
    const sources = loadSources().map((source) => ({ ...source, facts: source.facts.filter((fact) => fact !== "ct600-12-months") }));
    expect(() => buildRulesData(sources)).toThrow("No source lists the fact ct600-12-months");
  });
});

describe("look_up_rule", () => {
  it("finds a rate by its words, in every year the rates data holds", () => {
    expect(findRules("annual investment allowance").map((rule) => rule.id)).toEqual([
      "capital-allowances-aia-limit-2025-26",
      "capital-allowances-aia-limit-2026-27",
      "capital-allowances-company-aia-limit-fy2025",
      "capital-allowances-company-aia-limit-fy2026",
    ]);
  });

  it("finds a deadline by its words and answers its words, quote, link and date read", () => {
    const { matches, guidance } = lookUpRule({}, { query: "accounts due 9 months" });
    expect(matches.map((match) => match.id)).toEqual(["ch-accounts-9-months"]);
    expect(matches[0].display).toContain("9 months after the end of the company's financial year");
    expect(matches[0].sources[0]).toEqual(
      expect.objectContaining({
        url: "https://www.gov.uk/prepare-file-annual-accounts-for-limited-company",
        quote: expect.stringContaining("9 months"),
        retrieved: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
    expect(guidance).toContain("send the person to HMRC or Companies House");
  });

  it("answers the section 455 rate of a loan made from 6 April 2026, with its gov.uk source", () => {
    const [match] = lookUpRule({}, { query: "ct-s455-rate-2026-04" }).matches;
    expect(match).toEqual(expect.objectContaining({ id: "ct-s455-rate-2026-04", value: 0.3575, display: "35.75%" }));
    expect(match.sources[0]).toEqual(
      expect.objectContaining({
        url: "https://www.gov.uk/hmrc-internal-manuals/company-taxation-manual/ctm61505",
        quote: expect.stringContaining("from 6 April 2026 35.75 per cent"),
      }),
    );
  });

  it("answers one rule for its fact id, with the figure the rates page shows", () => {
    const [match] = lookUpRule({}, { query: "corporation-tax-main-rate-fy2026" }).matches;
    expect(match).toEqual(
      expect.objectContaining({ id: "corporation-tax-main-rate-fy2026", value: 0.25, display: "25%", period: "financial year 2026" }),
    );
  });

  it("answers no match, and says not to give a figure from memory, for a rule it does not hold", () => {
    const answer = lookUpRule({}, { query: "inheritance tax nil rate band" });
    expect(answer.matches).toEqual([]);
    expect(answer.guidance).toContain("do not give a figure from memory");
  });

  it("refuses an empty query", () => {
    expect(() => lookUpRule({}, { query: " " })).toThrow("query is required");
  });
});

async function callTool(toolNames, name, args = {}) {
  const session = createSession();
  await openBook(session, { path: join(FIXTURES, "precision-code-ltd-full") });
  const answer = await handleMcpRequest(
    new Request("https://submit.diyaccounting.co.uk/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }),
    { session, toolNames, overrides: HOSTED_OVERRIDES },
  ).then((response) => response.json());
  expect(answer.result.isError, JSON.stringify(answer.result)).toBeFalsy();
  return answer.result.structuredContent ?? JSON.parse(answer.result.content[0].text);
}

describe("a derivation's rule sources", () => {
  it("answers the Corporation Tax rates and deadlines of the period with their gov.uk links where look_up_rule is offered", async () => {
    const answer = await callTool(hostedToolNames("ci"), "derive_company_tax_return");
    const ids = answer.ruleSources.map((source) => source.id);
    expect(ids).toEqual(expect.arrayContaining(["ct600-12-months", "ct-payment-9-months-1-day"]));
    expect(ids.some((id) => id.startsWith("corporation-tax-marginal-relief-fraction-fy"))).toBe(true);
    for (const source of answer.ruleSources) {
      expect(source).toEqual(ruleSources([source.id])[0]);
      expect(source.url).toMatch(/^https:\/\/www\.(legislation\.)?gov\.uk\//);
    }
  });

  it("answers the accounts deadline beside the micro-entity accounts where look_up_rule is offered", async () => {
    const answer = await callTool(hostedToolNames("ci"), "derive_micro_entity_accounts");
    expect(answer.ruleSources.map((source) => source.id)).toEqual(["ch-accounts-9-months"]);
  });

  it("answers prod's derivations with their rule sources, since prod offers look_up_rule", async () => {
    expect(hostedToolNames("prod")).toContain("look_up_rule");
    const answer = await callTool(hostedToolNames("prod"), "derive_company_tax_return");
    expect(answer.ruleSources.length).toBeGreaterThan(0);
  });
});
