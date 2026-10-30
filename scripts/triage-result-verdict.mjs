#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/triage-result-verdict.mjs
//
// Decides whether the result of a headless Claude Code triage run is a complete answer. A result
// is complete only when its subtype is "success", it is not an error, and its final text is not
// a mid-step narration (text that ends with a colon, or whose last line starts with "Let me ...").
// Anything else is a stop: the caller posts stopLine(...) instead of the model's text.
//
// usage: triage-result-verdict.mjs <result.json>
// Writes `verdict=<complete|max_turns|incomplete|none>` and `reason=<text>` lines to stdout.

import { readFileSync } from "node:fs";

const NARRATION_START = /^(?:now,?\s+)?(?:let me|let's|i'll|i will|i need to|i should|first,? i)\b(?!\s+know\b)/i;

export function lastResultEntry(parsed) {
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return [...entries].reverse().find((entry) => entry && typeof entry === "object" && entry.type === "result") ?? null;
}

export function endsMidStep(text) {
  const trimmed = String(text ?? "").trim();
  if (trimmed.length === 0) return false;
  if (trimmed.endsWith(":")) return true;
  const lastLine = trimmed.split("\n").at(-1).trim();
  return NARRATION_START.test(lastLine);
}

/**
 * @returns {{verdict: "complete"|"max_turns"|"incomplete"|"none", reason: string}}
 *   max_turns: the turn budget ran out. incomplete: any other stop, including a success whose
 *   text is narration. none: no result entry at all.
 */
export function triageVerdict(parsed) {
  const entry = lastResultEntry(parsed);
  if (!entry) return { verdict: "none", reason: "the run produced no result entry" };
  if (entry.subtype === "error_max_turns") {
    return { verdict: "max_turns", reason: `the ${entry.num_turns}-turn budget ran out` };
  }
  if (entry.subtype !== "success" || entry.is_error === true) {
    return {
      verdict: "incomplete",
      reason: `the run ended with ${entry.subtype ?? "an error"} after ${entry.num_turns ?? "an unknown number of"} turns`,
    };
  }
  const text = typeof entry.result === "string" ? entry.result : "";
  if (text.trim().length === 0) {
    return { verdict: "incomplete", reason: "the run returned an empty result" };
  }
  if (endsMidStep(text)) {
    return { verdict: "incomplete", reason: `the final message stopped mid-step after ${entry.num_turns} turns` };
  }
  return { verdict: "complete", reason: "" };
}

export function stopLine(reason, runUrl) {
  const link = runUrl ? ` Run: ${runUrl}` : "";
  return `_Triage stopped before an answer: ${reason}.${link}_`;
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: triage-result-verdict.mjs <result.json>");
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    parsed = null;
  }
  const { verdict, reason } = triageVerdict(parsed);
  process.stdout.write(`verdict=${verdict}\nreason=${reason}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
