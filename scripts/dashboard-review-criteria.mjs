// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/dashboard-review-criteria.mjs
//
// Reads the review criteria out of .claude/skills/dashboard-review/SKILL.md at run time, so the
// skill is the only place they are written. The skill marks two regions: the criteria (the two
// lists, the tag table and the numbered checks) and the map from snapshot sections to panels.
// A missing marker throws, because a review that runs on part of its criteria is worse than none.

const CRITERIA_START = "<!-- review-criteria:start -->";
const CRITERIA_END = "<!-- review-criteria:end -->";
const MAP_START = "<!-- review-map:start -->";
const MAP_END = "<!-- review-map:end -->";

const LIST_BY_HEADING = new Map([
  ["dashboard improvements", "improvement"],
  ["changes the observations call for", "observation"],
]);

/** Who runs each numbered check of the skill, by its title: deterministic code or the model. */
export const CHECK_OWNERS = Object.freeze({
  "Freshness": "code",
  "Agreement": "code",
  "Not measured": "code",
  "Money": "code",
  "Funnel": "code",
  "Alarms": "code",
  "AWS links": "code",
  "Hidden panels": "code",
  "Console images": "model",
});

function between(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from < 0) throw new Error(`the skill has no ${start} marker`);
  if (to < 0) throw new Error(`the skill has no ${end} marker`);
  if (to < from) throw new Error(`${end} comes before ${start}`);
  return text.slice(from + start.length, to).trim();
}

function tableRows(text) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((cells) => !cells.every((cell) => /^-+$/.test(cell)));
}

function parseTags(criteriaText) {
  const rows = tableRows(criteriaText).filter((cells) => cells.length >= 4 && LIST_BY_HEADING.has(cells[2].toLowerCase()));
  if (rows.length === 0) throw new Error("the skill's tag table has no rows");
  return rows.map((cells) => ({ tag: cells[0], list: LIST_BY_HEADING.get(cells[2].toLowerCase()) }));
}

function parseTabs(parenthetical) {
  const first = parenthetical.split(",")[0].trim();
  if (/^(every|each)\b/.test(first)) return ["all"];
  return parenthetical.split(",").map((tab) => tab.trim());
}

function parseChecks(criteriaText) {
  const checks = [];
  for (const line of criteriaText.split("\n")) {
    const match = /^(\d+)\. \*\*([^*]+)\*\* \(([^)]*)\)/.exec(line);
    if (match) checks.push({ number: Number(match[1]), title: match[2].trim(), tabs: parseTabs(match[3]) });
  }
  if (checks.length === 0) throw new Error("the skill has no numbered checks");
  return checks;
}

function backticked(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function parseSectionMap(mapText) {
  const rows = tableRows(mapText).filter((cells) => cells.length >= 3);
  const [header, ...body] = rows;
  if (!header || !/^snapshot section$/i.test(header[0])) throw new Error("the skill's map table has no header row");
  return body.map((cells) => ({
    section: backticked(cells[0]).join(", ") || cells[0],
    tabs: cells[1].split(",").map((tab) => tab.trim()),
    panels: backticked(cells[2]),
  }));
}

/**
 * @param {string} skillText the text of SKILL.md
 * @returns {{
 *   criteriaText: string,
 *   tags: { tag: string, list: "improvement" | "observation" }[],
 *   checks: { number: number, title: string, tabs: string[] }[],
 *   sectionMap: { section: string, tabs: string[], panels: string[] }[]
 * }}
 */
export function readCriteria(skillText) {
  const criteriaText = between(skillText, CRITERIA_START, CRITERIA_END);
  const mapText = between(skillText, MAP_START, MAP_END);
  return {
    criteriaText,
    tags: parseTags(criteriaText),
    checks: parseChecks(criteriaText),
    sectionMap: parseSectionMap(mapText),
  };
}
