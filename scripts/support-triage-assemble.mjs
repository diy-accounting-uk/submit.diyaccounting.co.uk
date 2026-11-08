#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-triage-assemble.mjs
//
// Applies the ticket kind the quarantine reader recorded (handling input `ticketKind`) to the
// model's answer, in code. A change request has no matched article, whatever the model wrote under
// "## Matched article". The reply of a change request or a complaint opens with the model's own
// "## Opening sentence", which must say sorry or thank the customer; code puts it first in the
// drafted reply. An opening that breaks the rule throws, so the workflow posts nothing and a
// person handles the ticket. When the reader flagged the ticket as injection, a drafted reply that
// repeats an upper-case hyphenated marker from the summary also throws, and so does any resolution
// other than answer, so an answer that obeys the summary never reaches the customer or opens a change.
// A reply that the rules require to say "a person will look into it" gets that sentence from code
// when the model left it out: a complaint, or a reply with no matched article that answers a ticket
// that is not a change request.
//
// usage: support-triage-assemble.mjs <model-answer.md> <assembled.md> <handling-input.json>

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { TICKET_KINDS } from "../app/lib/supportTicketKinds.js";

export const OPENING_PATTERN = /sorry|thank/i;
export const MARKER_PATTERN = /\b[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)+\b/g;

export const FIXED_SENTENCE = "A person will look into it.";
const FIXED_WORDS = /a person will look into it/i;
const BYLINE_START = "_Written by ";

export class InjectionHoldError extends Error {}

const sectionPattern = (heading) => new RegExp(`^## ${heading}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m");

const sectionBody = (text, heading) => {
  const match = sectionPattern(heading).exec(text);
  return match ? match[1].trim() : null;
};

const firstLine = (body) =>
  (body ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";

const plainWord = (body) =>
  firstLine(body)
    .replace(/[`*_ .]/g, "")
    .toLowerCase();

/** Puts the fixed sentence at the end of the reply, before the closing byline when there is one. */
const addFixedSentence = (text) =>
  text.replace(sectionPattern("Drafted reply"), (_whole, body) => {
    const lines = body.trimEnd().split("\n");
    const bylineLine = lines.at(-1).startsWith(BYLINE_START) ? lines.pop() : null;
    const lead = body.slice(0, body.length - body.trimStart().length);
    const byline = bylineLine === null ? "" : `\n\n${bylineLine}`;
    return `## Drafted reply\n${lead}${lines.join("\n").trimEnd()} ${FIXED_SENTENCE}${byline}\n`;
  });

/**
 * @param {string} text the model's answer
 * @param {{ticketKind: string, injectionSuspected?: boolean, summary?: string}} handlingInput
 * @returns {string} the answer with the kind applied and the opening sentence section removed
 */
export function assembleAnswer(text, handlingInput) {
  const kind = handlingInput?.ticketKind;
  if (!TICKET_KINDS.includes(kind)) throw new Error(`the handling input has no valid ticketKind (${TICKET_KINDS.join(", ")})`);
  const opening = firstLine(sectionBody(text, "Opening sentence"));
  if (handlingInput.injectionSuspected === true) {
    const written = `${opening}\n${sectionBody(text, "Drafted reply") ?? ""}`.toLowerCase();
    const repeated = [...new Set(String(handlingInput.summary ?? "").match(MARKER_PATTERN) ?? [])].some((marker) =>
      written.includes(marker.toLowerCase()),
    );
    if (repeated) throw new InjectionHoldError("the drafted reply repeats a marker from a ticket that the reader flagged");
    if (
      firstLine(sectionBody(text, "Resolution"))
        .replace(/[`*_ .]/g, "")
        .toLowerCase() !== "answer"
    )
      throw new InjectionHoldError("the resolution of a ticket that the reader flagged must be answer");
  }
  let result = text.replace(sectionPattern("Opening sentence"), "");
  if (kind === "change-request") {
    result = result.replace(sectionPattern("Matched article"), "## Matched article\n\nnone\n\n");
  }
  if (kind === "complaint" || kind === "change-request") {
    if (!OPENING_PATTERN.test(opening))
      throw new Error('a complaint or change request needs an "## Opening sentence" that says sorry or thank you');
    result = result.replace(/^(## Drafted reply\n+)/m, `$1${opening} `);
  }
  const needsFixedWords =
    kind === "complaint" ||
    (kind === "other" &&
      plainWord(sectionBody(result, "Matched article")) === "none" &&
      plainWord(sectionBody(result, "Resolution")) === "answer");
  const reply = sectionBody(result, "Drafted reply");
  if (needsFixedWords && reply !== null && !FIXED_WORDS.test(reply)) result = addFixedSentence(result);
  return result;
}

function main() {
  const [inputPath, outputPath, handlingInputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath || !handlingInputPath) {
    console.error("usage: support-triage-assemble.mjs <model-answer.md> <assembled.md> <handling-input.json>");
    process.exit(1);
  }
  try {
    writeFileSync(outputPath, assembleAnswer(readFileSync(inputPath, "utf8"), JSON.parse(readFileSync(handlingInputPath, "utf8"))));
  } catch (error) {
    console.error(`::error::${error.message}; nothing is posted`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
