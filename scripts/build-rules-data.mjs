// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Builds mcp/lib/rules-data.json, the rules and rates the MCP server's look_up_rule answers: each
// rates page fact with the figure the rates page shows, and each MTD calendar fact with its words,
// both with the gov.uk sources that list the fact. build-rates-page.mjs and build-mtd-calendar.mjs
// run it, so the JSON and the two pages are built from the same inputs.
// Usage: node scripts/build-rules-data.mjs
// Every fact needs at least one source file listing its id; the build throws otherwise.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { loadSources, sourcePublisher } from "./tax-sources.mjs";
import { RATE_TABLES, TAX_YEARS, displayText, readEngineTable, rowValue } from "./build-rates-page.mjs";
import { FINANCIAL_YEAR_COLUMNS } from "./rates-fact-ids.mjs";
import { DATED_FACTS, QUARTERLY_FACT, FINAL_DECLARATION_FACT, COMPANY_YEARLY_FACTS, UNDATED_FACTS } from "./build-mtd-calendar.mjs";
import { SOURCED_RULE_FACTS } from "./rules-facts.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const RULES_DATA_PATH = join(ROOT, "mcp", "lib", "rules-data.json");

function rateRules() {
  return RATE_TABLES.flatMap((table) => {
    const columns = table.period === "financial-year" ? FINANCIAL_YEAR_COLUMNS : TAX_YEARS;
    return columns.flatMap((column) => {
      const tables = readEngineTable(column);
      return table.rows.map((row) => ({
        id: `${row.fact}-${column}`,
        kind: "rate",
        title: `${table.caption}: ${row.label}`,
        period: table.period === "financial-year" ? `financial year ${column.slice(2)}` : `tax year ${column}`,
        value: rowValue(row, column, tables),
        display: displayText(row, column, tables),
      }));
    });
  });
}

function calendarRules() {
  const facts = [...DATED_FACTS, QUARTERLY_FACT, FINAL_DECLARATION_FACT, ...COMPANY_YEARLY_FACTS, ...UNDATED_FACTS];
  return facts.map((fact) => ({
    id: fact.id,
    kind: "rule",
    title: fact.title,
    ...(fact.date ? { date: fact.date } : {}),
    value: [fact.text, fact.optional].filter(Boolean).join(" "),
    display: [fact.text, ...(fact.rows ?? []).map(([period, due]) => `${period}: ${due}.`), fact.optional].filter(Boolean).join(" "),
  }));
}

// The facts a source cites that neither builder shows, from the table beside the builders.
function sourcedRules() {
  return SOURCED_RULE_FACTS.map(({ id, kind = "rule", title, period, value, display }) => ({
    id,
    kind,
    title,
    ...(period ? { period } : {}),
    value,
    display: display ?? value,
  }));
}

/**
 * Every rule and rate with its sources. Throws for a fact that no source lists, and for a fact a
 * source lists that has no value.
 * @param {Array<object>} sources - loadSources()'s answer
 * @returns {{rules: Array<object>}}
 */
export function buildRulesData(sources = loadSources()) {
  const rules = [...rateRules(), ...calendarRules(), ...sourcedRules()].map((rule) => {
    const cited = sources.filter((source) => (source.facts ?? []).includes(rule.id));
    if (cited.length === 0) throw new Error(`No source lists the fact ${rule.id}`);
    return {
      ...rule,
      sources: cited.map((source) => ({
        title: source.title,
        publisher: sourcePublisher(source.url),
        url: source.url,
        retrieved: source.retrieved,
        quote: source.quote,
      })),
    };
  });
  const withValue = new Set(rules.map((rule) => rule.id));
  const unvalued = [...new Set(sources.flatMap((source) => source.facts ?? []))].filter((fact) => !withValue.has(fact)).sort();
  if (unvalued.length > 0) throw new Error(`No value for the facts ${unvalued.join(", ")}`);
  return { rules };
}

export async function renderRulesData(sources = loadSources()) {
  const config = (await prettier.resolveConfig(RULES_DATA_PATH)) ?? {};
  return prettier.format(JSON.stringify(buildRulesData(sources)), { ...config, filepath: RULES_DATA_PATH });
}

export async function writeRulesData(sources = loadSources()) {
  writeFileSync(RULES_DATA_PATH, await renderRulesData(sources));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRulesData();
  console.log(`wrote ${RULES_DATA_PATH}`);
}
