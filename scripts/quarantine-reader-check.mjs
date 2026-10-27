#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/quarantine-reader-check.mjs
//
// Turns the quarantine reader's answer into the comment a person reads. The answer is untrusted
// text from a model that read untrusted text. This script accepts it only as exactly one JSON
// object that fits the schema in app/lib/quarantineReaderSchema.js. The comment is built from
// the validated values, never from the model's text, and a rejection comment lists schema
// issue paths and codes only, so no word of the model's answer survives a rejection.
//
// usage: quarantine-reader-check.mjs --kind support|alarm --out <path> [--faqs <faqs.toml>]
// env:   ANSWER_B64 (base64 of the answer), GUARDRAIL_ACTION, MODEL_ID, RUN_NUMBER, RUN_URL
// Writes `outcome=accepted|rejected` to $GITHUB_OUTPUT. Prints no answer text.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { alarmReaderSchema, supportReaderSchema } from "../app/lib/quarantineReaderSchema.js";
import { fenceText } from "../app/functions/support/supportTicketPost.js";
import { faqIds } from "./support-triage-public-half.mjs";

export const READER_MARKER = "<!-- quarantine-reader:v1 -->";
const HELP_URL = "https://submit.diyaccounting.co.uk/help.html";

function safePathSegment(segment) {
  return /^[A-Za-z0-9_]+$/.test(String(segment)) ? String(segment) : "?";
}

/** Parses the answer as one JSON object and validates it. Returns the value or issue paths and codes. */
export function parseReaderAnswer(text, schema) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? "").trim());
  } catch {
    return { ok: false, issues: [{ path: "answer", code: "not_one_json_object" }] };
  }
  const result = schema.safeParse(parsed);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.length ? issue.path.map(safePathSegment).join(".") : "answer",
      code: safePathSegment(issue.code),
    })),
  };
}

/**
 * Reads the validated object back out of an accepted reader comment. Only a comment that carries
 * the marker and one json fence is read; the caller checks the comment's author first and runs
 * the result through the schema again.
 */
export function extractReaderJson(commentBody) {
  const body = String(commentBody ?? "");
  if (!body.includes(READER_MARKER)) return null;
  const match = /^(`{3,})json\n([^\n]*)\n\1$/m.exec(body);
  if (!match) return null;
  try {
    return JSON.parse(match[2]);
  } catch {
    return null;
  }
}

function yesNo(flag) {
  return flag ? "yes" : "no";
}

function byline({ modelId, runNumber, runUrl, kind }) {
  return `_Written by ${modelId} in [${kind}-reader #${runNumber}](${runUrl}). Remove \`maintainer-review\` to approve, or close the issue to reject._`;
}

function jsonBlock(value) {
  return fenceText(JSON.stringify(value)).replace(/^(`+)/, "$1json");
}

export function renderAcceptedComment({ kind, value, piiPresent, modelId, runNumber, runUrl }) {
  const checked = { ...value, piiPresent: Boolean(value.piiPresent || piiPresent) };
  const head =
    kind === "support"
      ? `category \`${checked.category}\`, FAQ ${checked.faqId ? `[${checked.faqId}](${HELP_URL}#${checked.faqId})` : "none"}`
      : `still broken: ${checked.stillBroken}, remedy family ${checked.remedyFamily ? `\`${checked.remedyFamily}\`` : "none"}`;
  return [
    READER_MARKER,
    `**Quarantine reader**: ${head}, injection suspected: ${yesNo(checked.injectionSuspected)}, PII present: ${yesNo(checked.piiPresent)}`,
    "",
    jsonBlock(checked),
    "",
    byline({ modelId, runNumber, runUrl, kind }),
    "",
  ].join("\n");
}

export function renderRejectedComment({ kind, issues, modelId, runNumber, runUrl }) {
  const lines = issues.map((issue) => `- \`${issue.path}\`: \`${issue.code}\``);
  return [
    READER_MARKER,
    "**Quarantine reader**: the answer was rejected. Read the ticket itself.",
    "",
    ...lines,
    "",
    `_Written by ${modelId} in [${kind}-reader #${runNumber}](${runUrl}). Close the issue to reject, or handle it by hand._`,
    "",
  ].join("\n");
}

/**
 * @returns {{outcome: "accepted"|"rejected", comment: string}}
 */
export function checkReaderAnswer({ kind, answerText, guardrailAction, ids, families, modelId, runNumber, runUrl }) {
  const schema = kind === "support" ? supportReaderSchema(ids) : alarmReaderSchema(families);
  const parsed = parseReaderAnswer(answerText, schema);
  const common = { kind, modelId, runNumber, runUrl };
  if (!parsed.ok) return { outcome: "rejected", comment: renderRejectedComment({ ...common, issues: parsed.issues }) };
  return {
    outcome: "accepted",
    comment: renderAcceptedComment({ ...common, value: parsed.value, piiPresent: guardrailAction === "GUARDRAIL_INTERVENED" }),
  };
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function main() {
  const argv = process.argv.slice(2);
  const kind = argValue(argv, "--kind");
  const out = argValue(argv, "--out");
  if (!["support", "alarm"].includes(kind) || !out) {
    console.error("usage: quarantine-reader-check.mjs --kind support|alarm --out <path> [--faqs <faqs.toml>]");
    process.exit(1);
  }
  const faqsPath = argValue(argv, "--faqs");
  const ids = faqsPath ? faqIds(readFileSync(faqsPath, "utf8")) : new Set();
  const families = new Set(JSON.parse(readFileSync("app/data/alarm-remedies.json", "utf8")).map((row) => row.family));
  const { outcome, comment } = checkReaderAnswer({
    kind,
    answerText: Buffer.from(process.env.ANSWER_B64 ?? "", "base64").toString("utf8"),
    guardrailAction: process.env.GUARDRAIL_ACTION,
    ids,
    families,
    modelId: process.env.MODEL_ID,
    runNumber: process.env.RUN_NUMBER,
    runUrl: process.env.RUN_URL,
  });
  writeFileSync(out, comment);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `outcome=${outcome}\n`);
  console.log(`reader answer ${outcome}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
