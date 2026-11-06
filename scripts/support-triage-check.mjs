// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-triage-check.mjs
//
// Helpers for the second Nova call, which judges the drafted reply. The check call never sees the
// ticket summary: `checkInput` copies only `ticketKind` and `injectionSuspected` from the handling
// input. `checkVerdict` reads the check call's result. A result that is missing, failed, cut short
// or unclear holds the draft. Only a `pass` in the verdict section lets the run go on.
// scripts/support-triage-settle.mjs makes the call.

import { readFileSync } from "node:fs";
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
