#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-triage-assemble.mjs
//
// Applies the ticket kind the model states to the rest of its answer, in code. A change request
// has no matched article, whatever the model wrote under "## Matched article". A complaint's
// reply opens with the model's own "## Opening sentence", which must say sorry or thank the
// customer; code puts it first in the drafted reply. A kind or an opening that breaks these rules
// throws, so the workflow posts nothing and a person handles the ticket.
//
// usage: support-triage-assemble.mjs <model-answer.md> <assembled.md>

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const TICKET_KINDS = ["change-request", "complaint", "other"];
export const OPENING_PATTERN = /sorry|thank/i;

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

/** @returns {string} the answer with the kind applied and the kind and opening sections removed */
export function assembleAnswer(text) {
  const kind = firstLine(sectionBody(text, "Ticket kind"))
    .replace(/[`*_ .]/g, "")
    .toLowerCase();
  if (!TICKET_KINDS.includes(kind)) throw new Error(`the triage answer has no valid "## Ticket kind" (${TICKET_KINDS.join(", ")})`);
  const opening = firstLine(sectionBody(text, "Opening sentence"));
  let result = text.replace(sectionPattern("Ticket kind"), "").replace(sectionPattern("Opening sentence"), "");
  if (kind === "change-request") {
    result = result.replace(sectionPattern("Matched article"), "## Matched article\n\nnone\n\n");
  }
  if (kind === "complaint") {
    if (!OPENING_PATTERN.test(opening)) throw new Error('a complaint needs an "## Opening sentence" that says sorry or thank you');
    result = result.replace(/^(## Drafted reply\n+)/m, `$1${opening} `);
  }
  return result;
}

function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    console.error("usage: support-triage-assemble.mjs <model-answer.md> <assembled.md>");
    process.exit(1);
  }
  try {
    writeFileSync(outputPath, assembleAnswer(readFileSync(inputPath, "utf8")));
  } catch (error) {
    console.error(`::error::${error.message}; nothing is posted`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
