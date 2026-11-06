#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-triage-check.mjs
//
// Support for the second Nova call, which judges the drafted reply. The check call never sees the
// ticket summary: `prepare` copies only `ticketKind` and `injectionSuspected` from the handling
// input, and writes the model's draft beside them. `verdict` reads the check call's result and
// stops the run when the check does not pass. A result that is missing, failed, cut short or
// unclear holds the draft. Only a `pass` in the verdict section lets the run go on.
//
// usage: support-triage-check.mjs prepare <handling-input.json> <triage-result.json> <check-input.json> <draft.md>
//        support-triage-check.mjs verdict <check-result.json>
//
// The `verdict` command prints no text from the result: the reason is model text about a ticket,
// and the log is public.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { lastResultEntry } from "./triage-result-verdict.mjs";

const sectionPattern = (heading) => new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m");

const sectionBody = (text, heading) => {
  const match = sectionPattern(heading).exec(text);
  return match ? match[1].trim() : "";
};

/** The text of a run result, or an empty string when the run holds none. */
export function resultText(parsed) {
  const entry = lastResultEntry(parsed);
  return entry?.subtype === "success" && entry.is_error !== true && typeof entry.result === "string" ? entry.result : "";
}

/**
 * @param {object} handlingInput the handling input of the ticket
 * @returns {{ticketKind: string, injectionSuspected: boolean}} the only two fields the check call may read
 */
export function checkInput(handlingInput) {
  return { ticketKind: handlingInput.ticketKind, injectionSuspected: handlingInput.injectionSuspected === true };
}

/**
 * Reads the result of the check call.
 * @returns {{verdict: "pass"|"hold", reason: string}} hold for anything but a clear pass
 */
export function checkVerdict(parsed) {
  const text = resultText(parsed);
  if (text.length === 0) return { verdict: "hold", reason: "the check call gave no usable result" };
  const word = sectionBody(text, "Verdict")
    .split("\n")[0]
    .replace(/[`*_ .]/g, "")
    .toLowerCase();
  const reason = sectionBody(text, "Reason");
  if (word === "pass") return { verdict: "pass", reason };
  return { verdict: "hold", reason: word === "hold" ? reason : "the verdict is not pass or hold" };
}

export function readJsonOrNull(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "prepare" && args.length === 4) {
    const [handlingPath, resultPath, inputPath, draftPath] = args;
    writeFileSync(inputPath, JSON.stringify(checkInput(JSON.parse(readFileSync(handlingPath, "utf8")))));
    writeFileSync(draftPath, `${resultText(readJsonOrNull(resultPath))}\n`);
  } else if (command === "verdict" && args.length === 1) {
    const { verdict } = checkVerdict(readJsonOrNull(args[0]));
    console.log(`check verdict: ${verdict}`);
    if (verdict !== "pass") {
      console.error("::error::the check held the draft; nothing is posted");
      process.exit(1);
    }
  } else {
    console.error("usage: support-triage-check.mjs prepare <handling> <result> <check-input> <draft> | verdict <check-result>");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
