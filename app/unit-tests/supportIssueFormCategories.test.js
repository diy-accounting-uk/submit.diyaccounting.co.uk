// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// supportIssueFormCategories.test.js -- web/public/help.html's #support-category dropdown is
// filled in by hand, separately from supportTicketPost.js's own category validation, so a
// category added to one without the other would silently stop matching the form the Lambda
// accepts. This test reads the dropdown's option values and checks they equal the Lambda's own
// category list exactly, in the same order.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPPORT_TICKET_CATEGORIES } from "@app/functions/support/supportTicketPost.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const PAGE_PATH = "web/public/help.html";

// Reads the `<option value="...">` entries inside the select whose id matches, skipping the
// empty placeholder. Text-based rather than a DOM parser, matching this repository's convention
// for structured-enough files.
function selectOptionValues(pageText, selectId) {
  const start = pageText.indexOf(`<select id="${selectId}"`);
  if (start === -1) throw new Error(`no select with id ${selectId} in ${PAGE_PATH}`);
  const end = pageText.indexOf("</select>", start);
  const block = pageText.slice(start, end);
  return [...block.matchAll(/<option value="([^"]*)"/g)].map((match) => match[1]).filter((value) => value !== "");
}

describe("support form categories", () => {
  it("lists the same five categories as SUPPORT_TICKET_CATEGORIES, in the same order", () => {
    const pageText = readFileSync(resolve(ROOT, PAGE_PATH), "utf8");
    const options = selectOptionValues(pageText, "support-category");

    expect(options).toEqual(SUPPORT_TICKET_CATEGORIES);
  });
});
