// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// supportIssueFormCategories.test.js -- .github/ISSUE_TEMPLATE/support.yml's category dropdown
// is filled in by hand, separately from supportTicketPost.js's own category validation, so a
// category added to one without the other would silently stop matching the form the Lambda
// accepts. This test parses the issue form's dropdown options and checks they equal the Lambda's
// own category list exactly, in the same order.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORT_TICKET_CATEGORIES } from "@app/functions/support/supportTicketPost.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const FORM_PATH = ".github/ISSUE_TEMPLATE/support.yml";

// Reads the flow-of-lines `options:` block under the field whose `id:` matches, one `- value`
// entry per line. Line-based rather than a YAML parser, matching this repository's convention
// for structured-enough files (see scripts/check-workflow-permissions.mjs).
function dropdownOptions(formText, fieldId) {
  const lines = formText.split("\n");
  const idLine = lines.findIndex((line) => line.trim() === `id: ${fieldId}`);
  if (idLine === -1) throw new Error(`no field with id: ${fieldId} in ${FORM_PATH}`);

  const optionsLine = lines.findIndex((line, index) => index > idLine && line.trim() === "options:");
  if (optionsLine === -1) throw new Error(`no options: block under id: ${fieldId} in ${FORM_PATH}`);

  const optionIndent = lines[optionsLine].length - lines[optionsLine].trimStart().length;
  const options = [];
  for (let i = optionsLine + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - line.trimStart().length;
    if (trimmed === "" || indent <= optionIndent) break;
    if (!trimmed.startsWith("- ")) break;
    options.push(trimmed.slice(2).trim());
  }
  return options;
}

describe("support issue form categories", () => {
  it("lists the same five categories as SUPPORT_TICKET_CATEGORIES, in the same order", () => {
    const formText = readFileSync(resolve(ROOT, FORM_PATH), "utf8");
    const options = dropdownOptions(formText, "category");

    expect(options).toEqual(SUPPORT_TICKET_CATEGORIES);
  });
});
