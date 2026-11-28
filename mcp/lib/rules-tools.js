// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// rules-tools.js -- look_up_rule answers HMRC and Companies House rules and rates with the gov.uk
// words, link and date they were read, from rules-data.json (scripts/build-rules-data.mjs builds it
// from the rates page's and the MTD calendar's facts). The derivation tools add the links of the
// rules and rates they used through withRuleSources.

import { readFileSync } from "node:fs";

const RULES = JSON.parse(readFileSync(new URL("./rules-data.json", import.meta.url), "utf8")).rules;
const RULES_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));

export const RULE_GUIDANCE =
  "Give the rule as its source states it, with the quote and the link. This is the rule, not advice on " +
  "anyone's own case: for that, send the person to HMRC or Companies House.";

const NO_MATCH_GUIDANCE =
  "No rule or rate this connector holds matches the words. Say so, and send the person to gov.uk, HMRC or " +
  "Companies House; do not give a figure from memory.";

const MOST_MATCHES = 8;
const IGNORED_WORDS = new Set(["a", "an", "and", "are", "for", "how", "is", "it", "of", "on", "the", "to", "what", "when", "which"]);
// Words that most rules hold, which rank a match but never make one.
const COMMON_WORDS = new Set(["tax", "rate", "rule"]);

const wordsOf = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9£%.]+/g, " ")
    .split(" ")
    .map((word) => word.replace(/\.$/, ""))
    .filter((word) => word && !IGNORED_WORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));

const SEARCH_WORDS = new Map(
  RULES.map((rule) => [
    rule.id,
    new Set(wordsOf([rule.id.replace(/-/g, " "), rule.title, rule.period ?? "", ...rule.sources.map((source) => source.title)].join(" "))),
  ]),
);

const answerOf = ({ id, title, period, date, value, display, sources }) => ({
  id,
  title,
  ...(period ? { period } : {}),
  ...(date ? { date } : {}),
  value,
  display,
  sources,
});

/**
 * The rules and rates whose fact id is the query, or whose id, title, period and source titles hold
 * most of its words other than the common ones, best first.
 * @param {string} query
 * @returns {Array<object>}
 */
export function findRules(query) {
  const exact = RULES_BY_ID.get(query.trim().toLowerCase());
  if (exact) return [exact];
  const words = [...new Set(wordsOf(query))];
  const telling = words.filter((word) => !COMMON_WORDS.has(word));
  if (telling.length === 0) return [];
  const needed = Math.ceil(telling.length * 0.6);
  return RULES.map((rule, order) => {
    const held = SEARCH_WORDS.get(rule.id);
    return { rule, order, telling: telling.filter((word) => held.has(word)).length, all: words.filter((word) => held.has(word)).length };
  })
    .filter(({ telling: count }) => count >= needed)
    .sort((a, b) => b.telling - a.telling || b.all - a.all || a.order - b.order)
    .slice(0, MOST_MATCHES)
    .map(({ rule }) => rule);
}

/**
 * The look_up_rule tool.
 * @param {Object} _session
 * @param {{query: string}} params
 */
export function lookUpRule(_session, { query } = {}) {
  if (!query || !query.trim()) throw new Error("query is required: a fact id or the words of a rule or rate");
  const matches = findRules(query).map(answerOf);
  return { query, matches, guidance: matches.length ? RULE_GUIDANCE : NO_MATCH_GUIDANCE };
}

/**
 * The source link of each named rule or rate: its title, the figure or words, and the first gov.uk page
 * that states it. Throws for an id the rules data does not hold.
 * @param {string[]} factIds
 * @returns {Array<{id: string, title: string, display: string, source: string, url: string, retrieved: string}>}
 */
export function ruleSources(factIds) {
  return [...new Set(factIds)].map((id) => {
    const rule = RULES_BY_ID.get(id);
    if (!rule) throw new Error(`No rule ${id} in the rules data`);
    const [first] = rule.sources;
    return { id, title: rule.title, display: rule.display, source: first.title, url: first.url, retrieved: first.retrieved };
  });
}

/** True when the rules data holds the fact. */
export const hasRule = (id) => RULES_BY_ID.has(id);

// The tax year (6 April to 5 April) a date falls in, as the rates page names it: "2026-27".
function taxYearOf(isoDate) {
  const year = Number(isoDate.slice(0, 4));
  const start = isoDate.slice(5) >= "04-06" ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

// The financial years (1 April to 31 March) a period touches, as the rates page names them: "fy2025".
function financialYearsOf(periodStart, periodEnd) {
  const yearOf = (isoDate) => Number(isoDate.slice(0, 4)) - (isoDate.slice(5) < "04-01" ? 1 : 0);
  const years = [];
  for (let year = yearOf(periodStart ?? periodEnd); year <= yearOf(periodEnd); year++) years.push(`fy${year}`);
  return years;
}

function periodOf(answer) {
  const period = answer.period ?? answer.accountingPeriod ?? answer;
  return { start: period.periodStart ?? period.start, end: period.periodEnd ?? period.end };
}

const held = (ids) => ids.filter(hasRule);

// The rules and rates each derivation's figures rest on, for the period its answer covers. A rate
// for a year the rates data does not hold yet is left out.
export const RULE_FACTS_BY_TOOL = {
  derive_vat_return: (answer) => {
    const { end } = periodOf(answer);
    const year = end ? taxYearOf(end) : null;
    return [...(year ? held([`vat-standard-rate-${year}`, `vat-reduced-rate-${year}`]) : []), "vat-mtd-all-registered-2022-04"];
  },
  derive_micro_entity_accounts: () => ["ch-accounts-9-months"],
  derive_small_company_accounts: () => ["ch-accounts-9-months"],
  derive_company_tax_return: (answer) => {
    const { start, end } = periodOf(answer);
    const years = end ? financialYearsOf(start, end) : [];
    const rates = [
      "corporation-tax-main-rate",
      "corporation-tax-small-profits-rate",
      "corporation-tax-lower-limit",
      "corporation-tax-upper-limit",
      "corporation-tax-marginal-relief-fraction",
      "capital-allowances-company-aia-limit",
      "capital-allowances-company-main-rate",
    ];
    return [...held(years.flatMap((year) => rates.map((rate) => `${rate}-${year}`))), "ct600-12-months", "ct-payment-9-months-1-day"];
  },
};

/**
 * A derivation handler whose answer also carries ruleSources, the link of each rule or rate it used.
 * @param {string} toolName - a key of RULE_FACTS_BY_TOOL
 * @param {Function} handler
 * @returns {Function}
 */
export function withRuleSources(toolName, handler) {
  const factsFor = RULE_FACTS_BY_TOOL[toolName];
  return async (session, params) => {
    const answer = await handler(session, params);
    return { ...answer, ruleSources: ruleSources(factsFor(answer)) };
  };
}
