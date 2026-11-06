#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-triage-settle.mjs
//
// Judges the first triage answer and makes at most one repair. The answer is accepted when the
// assembler takes it and the second Nova call (prompts/support-triage-check.md) passes it. When
// either rejects it, one more Nova call gets the original request, the rejected answer as data and
// the rejection text as a note from code, and the new answer goes through the same assembler and
// check. A second rejection stops the run: the caller posts nothing and a person handles the
// ticket. The repair call gets the same `file` blocks as the first call. The reason of a check
// hold has at most 25 words and shares no run of eight words with the draft, so it holds no draft
// text. The script prints fixed lines only: no answer text and no reason.
//
// usage: support-triage-settle.mjs [--keep-going] <handling-input.json> <triage-result.json> <check-result.json> <repair-note.txt>
//
// Reads MODEL_ID and ISSUE_NUMBER from the environment. On return, <triage-result.json> holds the
// final answer and <check-result.json> the check of it. <repair-note.txt> says whether a repair ran.
// The exit code is 1 when the run must stop. --keep-going exits 0 then, so the replay judges
// the final answer.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assembleAnswer } from "./support-triage-assemble.mjs";
import { checkInput, checkVerdict, readJsonOrNull, resultText } from "./support-triage-check.mjs";

export const TRIAGE_PROMPT = "prompts/support-triage.md";
export const REPAIR_PROMPT = "prompts/support-triage-repair.md";
export const CHECK_PROMPT = "prompts/support-triage-check.md";
export const ANSWER_SCHEMA = "prompts/support-triage-answer.json";
export const CHECK_SCHEMA = "prompts/support-triage-check-answer.json";
// eslint-disable-next-line sonarjs/publicly-writable-directories
export const REJECTED_ANSWER_FILE = "/tmp/support-rejected-answer.md";
export const REMINDER_FILE = "prompts/support-triage-reminder.md";
export const TRIAGE_DATA_FILES = [
  // eslint-disable-next-line sonarjs/publicly-writable-directories
  "/tmp/support-handling-input.json",
  "web/public/faqs.toml",
  "web/public/help.html",
  "web/public/guide.html",
];

const REASON_MAX_WORDS = 25;
const SHARED_RUN_WORDS = 8;

const words = (text) =>
  String(text ?? "")
    .split(/\s+/)
    .filter((word) => word.length > 0);

const runs = (list, size) =>
  Array.from({ length: Math.max(list.length - size + 1, 0) }, (_, start) => list.slice(start, start + size).join(" "));

/** The reason of a check hold, cut to a safe size; empty when it copies the draft. */
export function safeReason(reason, draft) {
  const list = words(reason.replace(/[<>]/g, " ")).slice(0, REASON_MAX_WORDS);
  const draftRuns = new Set(runs(words(draft.toLowerCase()), SHARED_RUN_WORDS));
  return runs(words(list.join(" ").toLowerCase()), SHARED_RUN_WORDS).some((run) => draftRuns.has(run)) ? "" : list.join(" ");
}

/** @returns {string|null} the rejection text when the assembler does not take the answer */
export function assemblerRejection(text, handlingInput) {
  if (!/^## Drafted reply$/m.test(text)) return "The answer has no Drafted reply section.";
  try {
    assembleAnswer(text, handlingInput);
    return null;
  } catch (error) {
    return `The assembler rejected the answer: ${error.message}.`;
  }
}

const checkRejection = (check, draft) => {
  const reason = safeReason(check.reason, draft);
  const because = reason ? ` Its reason: ${reason}` : "";
  return `The second check held the draft.${because}`;
};

/**
 * @param {object} options
 * @param {object} options.handlingInput
 * @param {string} options.firstText the text of the first answer
 * @param {(text: string) => {verdict: string, reason: string}} options.runCheck makes the check call
 * @param {(rejection: string, rejectedText: string) => string} options.runRepair makes the repair call; returns the new answer text, or an empty string
 * @param {(line: string) => void} [options.log]
 * @returns {{text: string, repaired: boolean, accepted: boolean}} the final answer text
 */
export function settle({ handlingInput, firstText, runCheck, runRepair, log = console.log }) {
  const judge = (text) => {
    const assembler = assemblerRejection(text, handlingInput);
    if (assembler) return { by: "assembler", rejection: assembler };
    const check = runCheck(text);
    return check.verdict === "pass" ? null : { by: "check", rejection: checkRejection(check, text) };
  };

  const first = judge(firstText);
  if (!first) {
    log("settle: the first answer is accepted");
    return { text: firstText, repaired: false, accepted: true };
  }
  if (firstText.trim().length === 0) {
    log("settle: the first answer is empty; no repair");
    return { text: firstText, repaired: false, accepted: false };
  }
  log(`settle: the ${first.by} rejected the first answer; one repair runs`);
  const repairedText = runRepair(first.rejection, firstText);
  if (repairedText.trim().length === 0) {
    log("settle: the repair gave no answer");
    return { text: firstText, repaired: true, accepted: false };
  }
  const second = judge(repairedText);
  log(second ? `settle: the ${second.by} rejected the repaired answer` : "settle: the repaired answer is accepted");
  return { text: repairedText, repaired: true, accepted: second === null };
}

/** Writes the two files that the check call reads. */
export function writeCheckFiles(handlingInput, text, inputPath, draftPath) {
  writeFileSync(inputPath, JSON.stringify(checkInput(handlingInput)));
  writeFileSync(draftPath, `${text}\n`);
}

/** The prompt of the repair call: the triage prompt, then the repair section with the rejection text. */
export function repairPrompt(triagePrompt, repairSection, rejection, issueNumber) {
  const note = rejection.replace(/[<>]/g, " ").replace(/\s+/g, " ").trim();
  return `${triagePrompt.replaceAll("${ISSUE_NUMBER}", issueNumber).trimEnd()}\n\n${repairSection.replace("{{REJECTION}}", () => note)}`;
}

/** The arguments of a nova-agent call with no read tool. */
export function novaArgs({ promptFile, outputFile, modelId, schema, contextFiles, deadlineSeconds }) {
  return [
    "scripts/nova-agent.mjs",
    "--prompt-file",
    promptFile,
    "--output-file",
    outputFile,
    "--model-id",
    modelId,
    "--tools",
    "",
    "--max-turns",
    "3",
    "--deadline-seconds",
    String(deadlineSeconds),
    "--final-schema",
    schema,
    ...contextFiles.flatMap((file) => ["--context-file", file]),
  ];
}

function runNova(options) {
  try {
    execFileSync(process.execPath, novaArgs(options), { stdio: "inherit" });
  } catch {
    // nova-agent.mjs writes a result file for a failed run, and the caller judges that file.
  }
  return readJsonOrNull(options.outputFile);
}

function main() {
  const args = process.argv.slice(2);
  const keepGoing = args[0] === "--keep-going";
  const [handlingPath, triagePath, checkPath, notePath] = keepGoing ? args.slice(1) : args;
  const { MODEL_ID: modelId, ISSUE_NUMBER: issueNumber } = process.env;
  if (!handlingPath || !triagePath || !checkPath || !notePath || !modelId || !issueNumber) {
    console.error(
      "usage: MODEL_ID=<id> ISSUE_NUMBER=<n> support-triage-settle.mjs [--keep-going] <handling-input> <triage-result> <check-result> <repair-note>",
    );
    process.exit(2);
  }
  const handlingInput = JSON.parse(readFileSync(handlingPath, "utf8"));
  const dir = mkdtempSync(join(tmpdir(), "support-settle-"));
  rmSync(checkPath, { force: true });

  const runCheck = (text) => {
    const input = join(dir, "check-input.json");
    const draft = join(dir, "check-draft.md");
    writeCheckFiles(handlingInput, text, input, draft);
    const parsed = runNova({
      promptFile: CHECK_PROMPT,
      outputFile: checkPath,
      modelId,
      schema: CHECK_SCHEMA,
      contextFiles: [input, draft],
      deadlineSeconds: 120,
    });
    return checkVerdict(parsed);
  };

  const runRepair = (rejection, rejectedText) => {
    const promptFile = join(dir, "repair-prompt.md");
    const outputFile = join(dir, "repair-result.json");
    writeFileSync(REJECTED_ANSWER_FILE, `${rejectedText}\n`);
    writeFileSync(
      promptFile,
      repairPrompt(readFileSync(TRIAGE_PROMPT, "utf8"), readFileSync(REPAIR_PROMPT, "utf8"), rejection, issueNumber),
    );
    const parsed = runNova({
      promptFile,
      outputFile,
      modelId,
      schema: ANSWER_SCHEMA,
      contextFiles: [...TRIAGE_DATA_FILES, REJECTED_ANSWER_FILE, REMINDER_FILE],
      deadlineSeconds: 300,
    });
    const text = resultText(parsed);
    if (text.length > 0) writeFileSync(triagePath, `${JSON.stringify(parsed)}\n`);
    return text;
  };

  const { repaired, accepted } = settle({
    handlingInput,
    firstText: resultText(readJsonOrNull(triagePath)),
    runCheck,
    runRepair,
  });
  writeFileSync(notePath, repaired ? "a repair ran\n" : "no repair ran\n");
  if (!accepted) {
    console.error("::error::the answer is rejected; nothing is posted");
    if (!keepGoing) process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
