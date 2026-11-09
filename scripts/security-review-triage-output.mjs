#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/security-review-triage-output.mjs
//
// Merges the per-area results of a security-review triage run (one Nova runner result file per
// area id, each from a fresh context) into one report, then splits it into two files. The private
// report is the agent's whole answer, for the operator alone. The public summary is built here
// from the answer's machine-readable summary block and a fixed vocabulary: counts by severity,
// the names of the areas checked, and a pass or "held privately" line. No text the model wrote
// reaches the public summary, so a finding's file, line or exploit path cannot leak onto the
// public issue through it.
//
// Prints `close=true|false` and `above-low=<n>` on stdout for the workflow's step outputs.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SEVERITIES = ["Critical", "High", "Medium", "Low"];

// The checklist in prompts/security-review.md, one id per area. The triage prompt lists the
// same ids, and a unit test holds the two to each other.
export const AREAS = {
  A01: "A01 Broken access control",
  A02: "A02 Cryptographic failures",
  A03: "A03 Injection",
  A04: "A04 Insecure design",
  A05: "A05 Security misconfiguration",
  A06: "A06 Vulnerable components",
  A07: "A07 Authentication failures",
  A08: "A08 Data integrity failures",
  A09: "A09 Logging and monitoring failures",
  A10: "A10 Server-side request forgery",
  HMRC: "HMRC integration",
  TOKENS: "Frontend token storage",
  DYNAMODB: "DynamoDB security",
};

const SUMMARY_BLOCK = /```security-summary\s*\n([\s\S]*?)\n```/g;

/**
 * Returns the last `security-summary` fenced block in text, parsed and checked against the
 * severity and area vocabularies. Throws on a missing block, bad JSON or any value outside the
 * vocabularies, without quoting the offending text.
 */
export function parseSummary(text) {
  const blocks = [...text.matchAll(SUMMARY_BLOCK)];
  if (blocks.length === 0) throw new Error("the answer has no security-summary block");
  let summary;
  try {
    summary = JSON.parse(blocks[blocks.length - 1][1]);
  } catch {
    throw new Error("the security-summary block is not valid JSON");
  }
  if (!summary || !Array.isArray(summary.areasChecked) || !Array.isArray(summary.findings)) {
    throw new Error("the security-summary block needs areasChecked and findings arrays");
  }
  for (const area of summary.areasChecked) {
    if (!(area in AREAS)) throw new Error("areasChecked holds an id outside the area list");
  }
  summary.findings.forEach((finding, index) => {
    if (!finding || !SEVERITIES.includes(finding.severity)) {
      throw new Error(`finding ${index + 1} has a severity outside ${SEVERITIES.join(", ")}`);
    }
    if (!(finding.area in AREAS)) throw new Error(`finding ${index + 1} has an area outside the area list`);
  });
  return { areasChecked: [...new Set(summary.areasChecked)], findings: summary.findings };
}

export function countBySeverity(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const { severity } of findings) counts[severity] += 1;
  return counts;
}

const REACH_LINE = /^reach: (checked|not reached)$/m;
const SEVERITIES_LINE = /^severities: (.*)$/m;
const FINDINGS_HEADING = "## Findings\n\n";

/**
 * Reads one area's rendered answer (prompts/security-review-answer.json): the reach line, the
 * severities line and the findings text. Returns null when the area was not reached or its answer
 * does not fit, so nothing is claimed about that area.
 */
export function parseAreaAnswer(text) {
  const reach = text.match(REACH_LINE);
  const severities = text.match(SEVERITIES_LINE);
  const headingAt = text.indexOf(FINDINGS_HEADING);
  if (!reach || !severities || headingAt < 0 || reach[1] !== "checked") return null;
  const listed = severities[1].trim() === "none" ? [] : severities[1].split(",").map((entry) => entry.trim());
  if (!listed.every((severity) => SEVERITIES.includes(severity))) return null;
  return { severities: listed, findings: text.slice(headingAt + FINDINGS_HEADING.length).trim() };
}

/**
 * Merges the per-area Nova results into one result of the single-answer shape whose text carries the
 * report and the security-summary block, so triageOutput judges it as it judged one answer.
 * `areaResults` maps an area id to its parsed result, or to null/undefined when none was written.
 * An area whose run stopped, failed or answered out of vocabulary is left out of areasChecked.
 */
export function mergeAreaResults(areaResults) {
  const checked = [];
  const findings = [];
  const sections = [];
  const areaLines = [];
  let turns = 0;
  let firstStop = null;
  for (const id of Object.keys(AREAS)) {
    const entry = areaResults[id] ? resultEntry(areaResults[id]) : null;
    turns += Number.isInteger(entry?.num_turns) ? entry.num_turns : 0;
    const usable = entry && entry.is_error !== true && entry.subtype === "success" && typeof entry.result === "string";
    const answer = usable ? parseAreaAnswer(entry.result) : null;
    if (!answer) {
      firstStop ??= entry?.subtype && entry.subtype !== "success" ? entry.subtype : "no_answer";
      areaLines.push(`- ${id}: not reached`);
      continue;
    }
    checked.push(id);
    areaLines.push(`- ${id}: checked, ${answer.severities.length} finding${answer.severities.length === 1 ? "" : "s"}`);
    for (const severity of answer.severities) findings.push({ id: `F${findings.length + 1}`, severity, area: id });
    if (answer.severities.length > 0) sections.push(`### ${AREAS[id]}\n\n${answer.findings}`);
  }
  if (checked.length === 0) {
    return { type: "result", subtype: firstStop ?? "no_answer", is_error: false, num_turns: turns, result: "" };
  }
  const text = [
    "## Findings",
    "",
    sections.length > 0 ? sections.join("\n\n") : "No findings.",
    "",
    "## Areas",
    "",
    areaLines.join("\n"),
    "",
    "## Summary data",
    "",
    "```security-summary",
    JSON.stringify({ areasChecked: checked, findings }),
    "```",
  ].join("\n");
  return { type: "result", subtype: "success", is_error: false, num_turns: turns, result: text };
}

/** Reads `<ID>.json` for each area id from a directory; a missing or unreadable file is null. */
export function readAreaResults(directory) {
  const results = {};
  for (const id of Object.keys(AREAS)) {
    const path = join(directory, `${id}.json`);
    try {
      results[id] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
    } catch {
      results[id] = null;
    }
  }
  return results;
}

/**
 * The public comment, from counts and area ids alone. `stopped` names why a run ended before it
 * finished (a result subtype), in which case nothing is claimed about findings.
 */
export function buildPublicSummary({ summary, stopped, commitSha, targetBranch, reportLocation }) {
  const lines = ["## Security review triage", ""];
  const reviewed = `Reviewed \`${targetBranch}\` at \`${commitSha.slice(0, 12)}\` against the checklist in \`prompts/security-review.md\`, read-only.`;
  if (stopped) {
    lines.push(
      reviewed,
      "",
      `The triage stopped before it finished (\`${stopped}\`), so it reports no counts and leaves this issue open.`,
      `Whatever it wrote is held privately: ${reportLocation}.`,
    );
    return `${lines.join("\n")}\n`;
  }
  const counts = countBySeverity(summary.findings);
  const aboveLow = counts.Critical + counts.High + counts.Medium;
  lines.push(reviewed, "", "| Severity | Findings |", "| --- | --- |");
  for (const severity of SEVERITIES) lines.push(`| ${severity} | ${counts[severity]} |`);
  lines.push("", `Areas checked: ${summary.areasChecked.map((id) => AREAS[id]).join("; ") || "none"}.`);
  const notReached = Object.keys(AREAS).filter((id) => !summary.areasChecked.includes(id));
  if (notReached.length > 0) lines.push(`Not reached this run: ${notReached.map((id) => AREAS[id]).join("; ")}.`);
  lines.push("");
  if (summary.findings.length > 0) {
    lines.push(`Findings held privately: ${reportLocation}.`, "");
  }
  if (aboveLow === 0) {
    lines.push("Pass: nothing above Low. This issue closes so next Monday's review opens.");
  } else {
    lines.push(
      `${aboveLow} finding${aboveLow === 1 ? "" : "s"} above Low. This issue stays open until each has a board row and its fix merges.`,
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * The last `result` entry of an agent output: the single object, or the last result in a
 * transcript array.
 */
export function resultEntry(parsed) {
  return Array.isArray(parsed) ? [...parsed].reverse().find((entry) => entry && entry.type === "result") : parsed;
}

/**
 * Judges a parsed result and returns the two documents and the close verdict.
 * The issue closes only on a finished run with nothing above Low.
 */
export function triageOutput(parsed, { commitSha, targetBranch, reportLocation }) {
  const result = resultEntry(parsed);
  if (!result || typeof result !== "object") throw new Error("no result entry in the triage output");
  if (result.is_error === true) throw new Error("the triage run failed, so nothing is published");
  const text = typeof result.result === "string" ? result.result : "";
  if (result.subtype !== "success" || text.length === 0) {
    const stopped = result.subtype && result.subtype !== "success" ? result.subtype : "no answer";
    return {
      privateReport: text || `The triage stopped (${stopped}) before writing a report.\n`,
      publicSummary: buildPublicSummary({ stopped, commitSha, targetBranch, reportLocation }),
      close: false,
      aboveLow: null,
    };
  }
  const summary = parseSummary(text);
  const counts = countBySeverity(summary.findings);
  const aboveLow = counts.Critical + counts.High + counts.Medium;
  return {
    privateReport: text,
    publicSummary: buildPublicSummary({ summary, commitSha, targetBranch, reportLocation }),
    close: aboveLow === 0,
    aboveLow,
  };
}

function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(`--${name}`);
    if (index < 0 || index + 1 >= args.length) throw new Error(`missing --${name}`);
    return args[index + 1];
  };
  const areasDirectory = option("areas-dir");
  const publicPath = option("public");
  const privatePath = option("private");
  const context = {
    commitSha: option("commit"),
    targetBranch: option("branch"),
    reportLocation: option("report-location"),
  };

  const parsed = mergeAreaResults(readAreaResults(areasDirectory));
  const result = resultEntry(parsed);
  // The private report is written before the summary is judged, so a malformed summary block
  // still leaves the operator the agent's full answer to read.
  if (result && typeof result.result === "string") writeFileSync(privatePath, result.result);
  const output = triageOutput(parsed, context);
  writeFileSync(privatePath, output.privateReport);
  writeFileSync(publicPath, output.publicSummary);
  process.stdout.write(`close=${output.close}\nabove-low=${output.aboveLow ?? ""}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
