// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/supportTriagePublicHalf.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { faqIds, sanitizePublicHalf } from "../../../scripts/support-triage-public-half.mjs";

const TOML = '[[faq]]\nid = "how-to-submit-vat-return"\nquestion = "x"\n\n[[faq]]\nid = "what-are-vat-obligations"\n';
const BASE = "https://submit.diyaccounting.co.uk/help.html";

describe("support triage public half", () => {
  test("reads every id from the real faqs.toml", () => {
    const ids = faqIds(readFileSync(new URL("../../../web/public/faqs.toml", import.meta.url), "utf8"));
    expect(ids.has("how-to-submit-vat-return")).toBe(true);
    expect(ids.size).toBeGreaterThan(20);
  });

  test("builds the link from a known id", () => {
    const out = sanitizePublicHalf("## Matched article\n\n`how-to-submit-vat-return`\n\n## Label\n\nsubmission\n", TOML);
    expect(out).toContain(`${BASE}#how-to-submit-vat-return`);
    expect(out).toContain("## Label\n\nsubmission");
  });

  test("an unknown id and none both give no match", () => {
    expect(sanitizePublicHalf("## Matched article\n\nmade-up-id\n\n## Label\n\nother\n", TOML)).toContain("no match");
    expect(sanitizePublicHalf("## Matched article\n\nnone\n\n## Label\n\nother\n", TOML)).toContain("no match");
  });

  test("a model-written URL in the matched section does not survive", () => {
    const out = sanitizePublicHalf("## Matched article\n\nhttps://evil.example/x\n\n## Label\n\nother\n", TOML);
    expect(out).not.toContain("evil.example");
    expect(out).toContain("no match");
  });

  test("a URL elsewhere in the public half is removed", () => {
    const out = sanitizePublicHalf("## Matched article\n\nwhat-are-vat-obligations\n\n## Label\n\nsee https://evil.example/y now\n", TOML);
    expect(out).not.toContain("evil.example");
    expect(out).toContain(`${BASE}#what-are-vat-obligations`);
  });

  test("a submit.diyaccounting.co.uk URL the model wrote is also removed", () => {
    const out = sanitizePublicHalf("## Matched article\n\nnone\n\n## Label\n\nhttps://submit.diyaccounting.co.uk/guide.html\n", TOML);
    expect(out).not.toContain("guide.html");
  });
});
