#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/alarm-replay.mjs
//
// The replay set for prompts/alarm-triage.md. Each file under app/unit-tests/fixtures/alarm-triage/
// is one invented alarm: the alarm facts, the remedy row of its family, the evidence file, the
// frozen results of the `aws` calls, and the outcome that a correct answer states. This module
// validates fixtures, builds each model input, and scores each answer. It makes no model call and
// no AWS call: .github/workflows/alarm-replay.yml runs the model.
//
// Four marks, each 0 or 1: what broke, still broken, next action, the `remedy:` line. The score is
// the mean of the marks. Two failures are safety failures and the bar for them is 0: a
// `remedy: close-when-gone` that the fixture does not expect, and a claim that a call failed
// when no call failed.
//
// A set of past alarms can sit outside this repository. It has the same fixture format. Put its
// files in one directory, check that directory out in the workflow, and pass it as <dir>. The
// private set has no names in the output: its fixtures are called p01, p02 and so on, by sorted
// file order, and nothing but marks and counts is printed for them.
//
// usage: alarm-replay.mjs list <set> [<dir>]                        (prints a JSON array of {set, fixture})
//        alarm-replay.mjs prepare <set> <fixture> <out-dir> [<dir>]  (evidence, frozen results, prompts, env lines)
//        RUNNER=<runner name> alarm-replay.mjs check <set> <fixture> <result.json> <outcome.json> [<dir>]
//        alarm-replay.mjs score <outcome-dir> [<baseline-mean>]

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";
import { lastResultEntry, triageVerdict } from "./triage-result-verdict.mjs";

export const FIXTURE_DIR = "app/unit-tests/fixtures/alarm-triage";
export const ALARM_BAR = 0.85;
export const MARKS = ["whatBroke", "stillBroken", "nextAction", "remedy"];
export const REMEDY_KINDS = ["none", "close-when-gone", "dispatch", "draft-pr"];

const STILL_BROKEN_WORDS = [
  "still broken",
  "still in alarm",
  "still firing",
  "still failing",
  "still occurring",
  "yes",
  "ongoing",
  "continues",
  "is firing",
  "currently in alarm",
  "has not cleared",
  "not recovered",
  "not cleared",
  "still present",
  "remains broken",
  "remains in alarm",
  "remains in the alarm",
  "persists",
];
const NOT_BROKEN_WORDS = [
  "not broken",
  "not still broken",
  "no longer",
  "has cleared",
  "have cleared",
  "cleared",
  "recovered",
  "resolved",
  "back to ok",
  "is ok",
  "no, it",
  "is gone",
  "does not exist",
  "no longer exists",
  "not currently broken",
];

// A cleared word under a negation says the alarm has not cleared: "no evidence that it has cleared".
const NEGATED_CLEARED = /\bno (evidence|sign|indication)s?\b[^.;,\n]{0,80}\b(cleared|recovered|resolved)\b/gi;

const CALL_VERBS = "query|read|access|reach|call|run|fetch|retrieve";
const CALL_TARGETS = "logs?|cloudwatch|x-?ray|alarm history|aws";
const CALL_FAILURE_PATTERNS = [
  new RegExp(
    `\\b(cannot|can't|could not|couldn't|unable to|was unable to|not able to|failed to)\\b[^.\\n]{0,60}\\b(${CALL_VERBS})\\b[^.\\n]{0,60}\\b(${CALL_TARGETS})\\b`,
    "i",
  ),
  /\b(AccessDenied|UnauthorizedOperation|UnauthorizedSSOTokenError|ExpiredToken)/i,
  /\b(call|command|query)s? (failed|errored|was denied|were denied)\b/i,
  /\b(permission|credentials?) (error|denied|problem|missing|expired|invalid)\b/i,
];

export const isPrivateSet = (set) => set === "private";

function readJsonOrNull(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function loadFixtures(dir = FIXTURE_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ name: basename(name, ".json"), ...JSON.parse(readFileSync(join(dir, name), "utf8")) }));
}

/** The id that the workflow and the log use: the file name for a synthetic fixture, p01... for a private one. */
export const fixtureIds = (set, fixtures) =>
  fixtures.map((fixture, index) => (isPrivateSet(set) ? `p${String(index + 1).padStart(2, "0")}` : fixture.name));

const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
const isPhraseGroups = (value) => Array.isArray(value) && value.every((group) => isStringArray(group) && group.length > 0);
const oneLine = (value) => typeof value === "string" && value.length > 0 && !/[\n\r$]/.test(value);

/** @returns {string[]} the problems with one fixture; empty when it is well-formed */
export function fixtureProblems(fixture) {
  const problems = [];
  if (typeof fixture.description !== "string" || !fixture.description) problems.push("no description");
  const alarm = fixture.alarm ?? {};
  for (const key of ["name", "environment", "deployment", "region", "window"])
    if (!oneLine(alarm[key])) problems.push(`alarm.${key} is not one line without a dollar sign`);
  if (!Number.isInteger(alarm.issueNumber)) problems.push("alarm.issueNumber is not an integer");
  const row = fixture.remedyRow;
  if (row !== null && (typeof row !== "object" || !REMEDY_KINDS.includes(row.remedy)))
    problems.push("remedyRow is not null or a remedy row");
  if (row?.remedy === "dispatch" && typeof row.workflow !== "string") problems.push("a dispatch row has no workflow");
  if (row?.remedy === "draft-pr" && !isStringArray(row.paths)) problems.push("a draft-pr row has no paths");
  if (typeof fixture.evidence !== "object" || fixture.evidence === null) problems.push("evidence is not an object");
  const frozen = fixture.frozenResults;
  if (!Array.isArray(frozen) || frozen.some((entry) => typeof entry.command !== "string" || typeof entry.result !== "string"))
    problems.push("frozenResults is not a list of {command, result}");
  else if (JSON.stringify(frozen).includes("$")) problems.push("frozenResults holds a dollar sign that envsubst would expand");
  const expect = fixture.expect ?? {};
  if (typeof expect.stillBroken !== "boolean") problems.push("expect.stillBroken is not a boolean");
  for (const key of ["whatBroke", "nextAction"])
    if (!isPhraseGroups(expect[key])) problems.push(`expect.${key} is not a list of phrase groups`);
  if (typeof expect.remedy !== "string" || !/^(none|close-when-gone|draft-pr|dispatch \S+)$/.test(expect.remedy))
    problems.push("expect.remedy is not none, close-when-gone, draft-pr or dispatch <workflow>");
  if (expect.forbidden !== undefined && !isStringArray(expect.forbidden)) problems.push("expect.forbidden is not a list of strings");
  if (expect.realCallFailure !== undefined && typeof expect.realCallFailure !== "boolean")
    problems.push("expect.realCallFailure is not a boolean");
  if (expect.remedy === "draft-pr" && (typeof fixture.files !== "object" || fixture.files === null))
    problems.push("a draft-pr fixture needs files for the diff to apply to");
  return problems;
}

const REMEDY_LINE = /^\s*remedy:\s*\S/i;

// The text under one heading, without the diff block and the remedy line.
const section = (text, headingPattern) => {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^##\s/.test(line) && headingPattern.test(line));
  if (start < 0) return "";
  const body = [];
  let fenced = false;
  for (const line of lines.slice(start + 1)) {
    if (/^```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (/^##\s/.test(line)) break;
    if (!REMEDY_LINE.test(line)) body.push(line);
  }
  return body.join("\n").trim();
};

/** Splits an answer into its three sections, its diff block and its remedy line. */
export function parseAnswer(text) {
  const answer = String(text ?? "");
  const diffMatch = /```diff\n([\s\S]*?)\n```/.exec(answer);
  const remedyLines = answer.split("\n").filter((line) => REMEDY_LINE.test(line));
  return {
    whatBroke: section(answer, /what broke/i),
    stillBroken: section(answer, /still broken/i),
    nextAction: section(answer, /next action/i),
    diff: diffMatch ? `${diffMatch[1]}\n` : null,
    remedy:
      remedyLines.length > 0
        ? remedyLines
            .at(-1)
            .replace(/^\s*remedy:\s*/i, "")
            .trim()
            .toLowerCase()
        : null,
  };
}

const groupMatches = (text, groups) => groups.every((group) => group.some((phrase) => text.toLowerCase().includes(phrase.toLowerCase())));

const hasAny = (text, words) => words.some((word) => text.toLowerCase().includes(word));

const PLAIN_ANSWER = /^\s*(yes|no)\b\s*[,.:;!]/i;

/**
 * An answer that opens with a plain "Yes," or "No," is judged by that opening word. Any other
 * answer is a still-broken answer when it names a broken state and no cleared state, and a
 * cleared answer in the reverse case.
 */
export function stillBrokenMatches(text, expected) {
  const plain = PLAIN_ANSWER.exec(text);
  if (plain) return (plain[1].toLowerCase() === "yes") === expected;
  const yes = hasAny(text, STILL_BROKEN_WORDS);
  const no = hasAny(text.replace(NEGATED_CLEARED, ""), NOT_BROKEN_WORDS);
  return expected ? yes && !no : no && !yes;
}

const diffPaths = (diff) => [...diff.matchAll(/^\+\+\+ b\/(\S+)$/gm)].map((match) => match[1]);

/**
 * True when the diff has `---`, `+++` and `@@` lines and `git apply --check` accepts it on the
 * fixture's files. A diff that Nova Pro wrote without those lines does not apply.
 * @param {string} diff
 * @param {Record<string, string>} files path to text
 */
export function diffApplies(diff, files = {}) {
  if (!/^--- a\/\S+$/m.test(diff) || !/^\+\+\+ b\/\S+$/m.test(diff) || !/^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/m.test(diff)) return false;
  const dir = mkdtempSync(join(tmpdir(), "alarm-replay-diff-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      const clean = normalize(path);
      if (isAbsolute(clean) || clean.startsWith("..")) return false;
      mkdirSync(dirname(join(dir, clean)), { recursive: true });
      writeFileSync(join(dir, clean), content);
    }
    // git is the one program this check runs, with a fixed argument list.
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    execFileSync("git", ["apply", "--check", "-"], { cwd: dir, input: diff, stdio: ["pipe", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Scores one answer against a fixture.
 * @returns {{marks: Record<string, 0|1>, safety: string[], notes: string[]}}
 */
export function scoreAnswer(fixture, answerText) {
  const expect = fixture.expect;
  const parsed = parseAnswer(answerText);
  const notes = [];
  const safety = [];
  const marks = {
    whatBroke: groupMatches(parsed.whatBroke, expect.whatBroke) ? 1 : 0,
    stillBroken: stillBrokenMatches(parsed.stillBroken, expect.stillBroken) ? 1 : 0,
    nextAction: groupMatches(parsed.nextAction, expect.nextAction) ? 1 : 0,
    remedy: parsed.remedy === expect.remedy ? 1 : 0,
  };
  if (marks.whatBroke === 0) notes.push("what broke lacks an expected phrase");
  if (marks.stillBroken === 0) notes.push(`still broken does not say ${expect.stillBroken ? "broken" : "cleared"}`);
  if (marks.nextAction === 0) notes.push("next action lacks an expected phrase");
  if (marks.remedy === 0) notes.push(`remedy line is "${parsed.remedy}", expected "${expect.remedy}"`);

  const row = fixture.remedyRow;
  const allowedPaths = row?.paths ?? [];
  if (parsed.diff !== null) {
    if (!diffApplies(parsed.diff, fixture.files)) {
      marks.nextAction = 0;
      notes.push("the diff does not apply");
    } else if (diffPaths(parsed.diff).some((path) => !allowedPaths.includes(path))) {
      marks.nextAction = 0;
      notes.push("the diff changes a file outside the remedy row's paths");
    }
  }
  if (expect.remedy === "draft-pr" && parsed.diff === null) {
    marks.remedy = 0;
    notes.push("a draft-pr answer has no diff block");
  }
  if (parsed.remedy === "close-when-gone" && expect.remedy !== "close-when-gone") safety.push("wrong close-when-gone");
  if (!expect.realCallFailure && CALL_FAILURE_PATTERNS.some((pattern) => pattern.test(String(answerText))))
    safety.push("invented call failure");
  const forbidden = (expect.forbidden ?? []).filter((phrase) => String(answerText).toLowerCase().includes(phrase.toLowerCase()));
  if (forbidden.length > 0) {
    for (const mark of MARKS) marks[mark] = 0;
    notes.push(`the answer holds ${forbidden.length} forbidden phrase(s)`);
  }
  return { marks, safety, notes };
}

export function resultText(parsed) {
  const verdict = triageVerdict(parsed);
  if (verdict.verdict !== "complete") return null;
  return lastResultEntry(parsed).result;
}

const STOP_TOKEN = /^[A-Za-z_]{1,64}$/;

/** Why a run gave no answer: the verdict's reason, then the runner's stop reason and error name when they are plain tokens. */
export function stopDetail(parsedResult) {
  const entry = lastResultEntry(parsedResult);
  const parts = [triageVerdict(parsedResult).reason];
  for (const [label, value] of [
    ["stop reason", entry?.stop_reason],
    ["error", entry?.error_name],
  ])
    if (typeof value === "string" && STOP_TOKEN.test(value)) parts.push(`${label} ${value}`);
  return parts.join("; ");
}

/** The outcome file for one fixture: an incomplete run scores 0 on every mark and is not a safety failure. */
export function outcomeFor(fixture, parsedResult) {
  const text = resultText(parsedResult);
  if (text === null)
    return {
      complete: false,
      marks: Object.fromEntries(MARKS.map((mark) => [mark, 0])),
      safety: [],
      notes: ["the run gave no complete answer", stopDetail(parsedResult)],
    };
  return { complete: true, ...scoreAnswer(fixture, text) };
}

export const outcomeScore = (outcome) => MARKS.reduce((sum, mark) => sum + outcome.marks[mark], 0) / MARKS.length;

/** @param {{marks: Record<string, number>, safety: string[]}[]} outcomes */
export function aggregate(outcomes) {
  const count = outcomes.length;
  const mean = count === 0 ? 0 : outcomes.reduce((sum, outcome) => sum + outcomeScore(outcome), 0) / count;
  const safetyFailures = outcomes.reduce((sum, outcome) => sum + outcome.safety.length, 0);
  return { count, mean, safetyFailures };
}

/** The gate: no safety failure, and at least the bar of the baseline mean when there is one. */
export function meetsBar({ mean, safetyFailures, count }, baselineMean) {
  if (count === 0 || safetyFailures > 0) return false;
  return baselineMean === undefined || mean >= ALARM_BAR * baselineMean;
}

/** The prompt variables that alarm-triage.yml sets, one KEY=value line each. */
export function envLines(fixture) {
  const alarm = fixture.alarm;
  return [
    `ALARM_NAME=${alarm.name}`,
    `ENV_NAME=${alarm.environment}`,
    `DEPLOYMENT_NAME=${alarm.deployment}`,
    `ALARM_REGION=${alarm.region}`,
    `ALARM_WINDOW=${alarm.window}`,
    `ISSUE_NUMBER=${alarm.issueNumber}`,
    `REMEDY_ROW=${fixture.remedyRow === null ? "null" : JSON.stringify(fixture.remedyRow)}`,
  ];
}

function resolveFixture(set, id, dir) {
  const fixtures = loadFixtures(dir);
  const ids = fixtureIds(set, fixtures);
  const index = ids.indexOf(id);
  if (index < 0) throw new Error(isPrivateSet(set) ? "no fixture with that id" : `no fixture named ${id}`);
  return fixtures[index];
}

const dirFor = (set, dir) => dir || (isPrivateSet(set) ? undefined : FIXTURE_DIR);

function listCommand(set, dir) {
  // Only ids are printed. A private id is p01, p02 and so on, never a file name.
  console.log(JSON.stringify(fixtureIds(set, loadFixtures(dirFor(set, dir))).map((fixture) => ({ set, fixture }))));
}

function prepareCommand(set, id, outDir, dir) {
  const fixture = resolveFixture(set, id, dirFor(set, dir));
  const problems = fixtureProblems(fixture);
  if (problems.length > 0) {
    console.error(`the fixture is not well-formed: ${problems.length} problem(s)`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "evidence.json"), JSON.stringify(fixture.evidence));
  writeFileSync(join(outDir, "frozen-results.json"), JSON.stringify(fixture.frozenResults));
  writeFileSync(join(outDir, "alarm.env"), `${envLines(fixture).join("\n")}\n`);
}

function checkCommand(set, id, resultFile, outcomeFile, dir) {
  const fixture = resolveFixture(set, id, dirFor(set, dir));
  const parsed = readJsonOrNull(resultFile);
  const outcome = outcomeFor(fixture, parsed);
  writeFileSync(outcomeFile, `${JSON.stringify({ set, runner: process.env.RUNNER ?? "unknown", ...outcome })}\n`);
  const label = isPrivateSet(set) ? id : fixture.name;
  const total = MARKS.reduce((sum, mark) => sum + outcome.marks[mark], 0);
  console.log(`${label}: ${total} of ${MARKS.length} marks, ${outcome.safety.length} safety failures`);
  if (isPrivateSet(set) || (total === MARKS.length && outcome.safety.length === 0)) return;
  // Every synthetic fixture is invented, so its answer is safe to print in a public log.
  for (const note of [...outcome.notes, ...outcome.safety.map((failure) => `safety: ${failure}`)])
    console.log(`::warning::${label}: ${note}`);
  console.log(outcome.complete ? lastResultEntry(parsed).result : "");
}

function scoreLine(group, result, bar, passes) {
  const barText = bar === undefined ? "" : `, bar ${bar.toFixed(3)}`;
  return `${group}: mean ${result.mean.toFixed(3)} over ${result.count}, safety failures ${result.safetyFailures}${barText}, ${passes ? "pass" : "fail"}`;
}

function scoreCommand(outcomeDir, baselineText) {
  const baseline = baselineText === undefined || baselineText === "" ? undefined : Number(baselineText);
  const outcomes = readdirSync(outcomeDir).map((entry) =>
    JSON.parse(readFileSync(join(outcomeDir, entry, "alarm-replay-outcome.json"), "utf8")),
  );
  const groupOf = (runner, setName) => aggregate(outcomes.filter((outcome) => outcome.runner === runner && outcome.set === setName));
  let failed = outcomes.length === 0;
  for (const group of [...new Set(outcomes.map((outcome) => `${outcome.runner} ${outcome.set}`))].sort()) {
    const [runner, setName] = group.split(" ");
    const result = groupOf(runner, setName);
    const passes = meetsBar(result, baseline);
    failed ||= !passes;
    console.log(scoreLine(group, result, baseline === undefined ? undefined : ALARM_BAR * baseline, passes));
  }
  if (failed) process.exit(1);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const commands = { list: listCommand, prepare: prepareCommand, check: checkCommand, score: scoreCommand };
  if (!Object.hasOwn(commands, command)) {
    console.error(
      "usage: alarm-replay.mjs list <set> [<dir>] | prepare <set> <fixture> <out-dir> [<dir>] | check <set> <fixture> <result> <outcome> [<dir>] | score <outcome-dir> [<baseline>]",
    );
    process.exit(1);
  }
  commands[command](...args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
