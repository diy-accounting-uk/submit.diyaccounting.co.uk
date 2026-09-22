#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/redact-triage-output.mjs
//
// Reads the Claude Code JSON output from a headless alarm-triage run, pulls out the final
// assistant text, and strips shapes that look like customer-identifying data before the
// workflow posts it as a GitHub issue comment. Writes the redacted Markdown to stdout and
// one line per redaction (the pattern label only, never the matched value) to
// /tmp/redactions.txt, so the workflow can report how much was cut without logging what was
// cut. This is a deterministic first pass; the Bedrock guardrail that runs after it catches
// shapes these regexes miss, such as a person's name in prose.

import { readFileSync, writeFileSync } from "node:fs";

// Order matters: eori and hash64 run before vrn so a longer identifier is redacted whole
// rather than leaving a residual 9-digit fragment unmatched by a later pass.
export const DENY_PATTERNS = [
  { label: "ipv4", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  // {3,7} repeats (4-8 hex groups) rather than {2,7}: a plain HH:MM:SS clock time has only two
  // colons (three groups), and a full, uncompressed IPv6 address never has fewer than three.
  { label: "ipv6", re: /\b(?:[0-9a-fA-F]{1,4}:){3,7}[0-9a-fA-F]{1,4}\b/g },
  { label: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { label: "eori", re: /\b(?:GB|XI)\d{12}(?:\d{3})?\b/g },
  { label: "hash64", re: /\b[0-9a-f]{64}\b/gi },
  { label: "vrn", re: /\b(?:GB)?\d{9}\b/g },
  { label: "utr", re: /\b\d{10}\b/g },
  { label: "nino", re: /\b[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]\b/gi },
  { label: "paye", re: /\b\d{3}\/[A-Z0-9]{1,10}\b/g },
  { label: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { label: "aws-access-key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { label: "bearer", re: /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi },
];

/**
 * Applies every deny pattern to text, left to right, replacing each match with
 * `[redacted:<label>]`. Returns the redacted text plus one label per redaction, in the order
 * the redactions were made.
 */
export function redact(text) {
  let redacted = text;
  const redactions = [];
  for (const { label, re } of DENY_PATTERNS) {
    redacted = redacted.replace(re, () => {
      redactions.push(label);
      return `[redacted:${label}]`;
    });
  }
  return { redacted, redactions };
}

/**
 * Extracts the final assistant text from a parsed Claude Code `--output-format json` result.
 * Accepts either the single result object that mode normally prints (a top-level string
 * `result` field) or an array of transcript messages, and in both cases returns the text from
 * the last entry that carries assistant text, never an earlier turn's.
 */
export function extractFinalAssistantText(parsed) {
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (!entry || typeof entry !== "object") continue;
    if (entry.is_error === true) {
      throw new Error(`the triage run failed, so nothing is posted: ${entry.result || "no detail"}`);
    }
    if (typeof entry.result === "string" && entry.result.length > 0) {
      return finalMessageOnly(entry.result);
    }
    if (entry.type === "assistant" && entry.message && Array.isArray(entry.message.content)) {
      const text = entry.message.content
        .filter((block) => block && block.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("\n");
      if (text.length > 0) return finalMessageOnly(text);
    }
  }
  throw new Error("no assistant text found in the input JSON");
}

/**
 * A run that talks through an earlier plan before settling on its answer (a compaction can
 * make the agent recap what it already found) can leave that talk in the same result string,
 * ahead of the actual answer. When a Markdown thematic break separates them, keeps only the text
 * after the last break. When there is no break and prose precedes the first `## ` heading, cuts
 * to that heading. Text with neither passes through unchanged, as does one whose break is
 * trailing (nothing usable follows it) or whose first non-blank line is the heading.
 */
function finalMessageOnly(text) {
  const segments = text.split(/\n+-{3,}\n+/);
  const lastSegment = segments[segments.length - 1].trim();
  if (segments.length > 1 && lastSegment.length > 0) {
    return lastSegment;
  }
  const firstHeading = text.search(/^## /m);
  const prosePrecedesHeading = firstHeading > 0 && text.slice(0, firstHeading).trim().length > 0;
  return prosePrecedesHeading ? text.slice(firstHeading) : text;
}

/**
 * One line noting that a run exhausted `--max-turns` before it could finish, so a reader of the
 * posted comment knows the answer above it (if any) may be incomplete. Returns null for any other
 * subtype, including a run still in progress or one that never reached a result entry.
 */
export function maxTurnsNote(parsed) {
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const lastResult = [...entries].reverse().find((entry) => entry && typeof entry === "object" && entry.type === "result");
  if (!lastResult || lastResult.subtype !== "error_max_turns") return null;
  return `_Triage stopped: the ${lastResult.num_turns}-turn budget ran out before it finished._`;
}

/**
 * Describes a Claude Code run that stopped before producing any assistant text — most often by
 * exhausting `--max-turns`. Returns null when `parsed` is not that shape, so callers fall back to
 * `extractFinalAssistantText`'s own error for a genuine `is_error` failure or malformed input.
 */
export function describeStoppedRun(parsed) {
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const lastResult = [...entries].reverse().find((entry) => entry && typeof entry === "object" && entry.type === "result");
  if (!lastResult || lastResult.subtype === "success" || lastResult.is_error === true) return null;
  return maxTurnsNote(parsed) ?? `triage stopped: ${lastResult.subtype} after ${lastResult.num_turns} turns`;
}

function main() {
  const args = process.argv.slice(2);
  const isMarkdown = args.includes("--markdown");
  const inputPath = args.find((arg) => !arg.startsWith("--"));
  if (!inputPath) {
    console.error("usage: redact-triage-output.mjs [--markdown] <path-to-input>");
    process.exit(1);
  }

  const raw = readFileSync(inputPath, "utf8");

  // A plain Markdown file (a PR body, say) carries no Claude Code JSON envelope to unwrap and
  // no turn structure to judge, so it skips both parsing and extractFinalAssistantText and goes
  // to redact() as-is.
  let text;
  let parsed;
  if (isMarkdown) {
    text = raw;
  } else {
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error(`could not parse ${inputPath} as JSON: ${err.message}`);
      process.exit(1);
    }

    try {
      text = extractFinalAssistantText(parsed);
    } catch (err) {
      const stoppedSummary = describeStoppedRun(parsed);
      if (stoppedSummary) {
        writeFileSync("/tmp/redactions.txt", "");
        process.stdout.write(`${stoppedSummary}\n`);
        return;
      }
      console.error(err.message);
      process.exit(1);
    }
  }

  const { redacted, redactions } = redact(text);
  writeFileSync("/tmp/redactions.txt", redactions.length > 0 ? `${redactions.join("\n")}\n` : "");
  // A run can exhaust --max-turns after it already wrote a partial `.result`, so
  // extractFinalAssistantText returns text here without ever reaching describeStoppedRun's
  // fallback above. Append the same note in that case so the comment still says the answer may
  // be incomplete, instead of reading like a finished one. Markdown input has no such envelope.
  const note = isMarkdown ? null : maxTurnsNote(parsed);
  const final = note ? `${redacted}\n\n${note}` : redacted;
  process.stdout.write(final.endsWith("\n") ? final : `${final}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
