// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/supportTriageAssemble.test.js

import { describe, test, expect } from "vitest";
import { assembleAnswer } from "../../../scripts/support-triage-assemble.mjs";

const body = (extra = "") =>
  `## Matched article\n\nsubmitted-wrong-figures\n\n## Resolution\n\nanswer\n\n${extra}## Drafted reply\n\nA person will look into it.\n`;

describe("support triage assemble", () => {
  test("a change request loses its matched article", () => {
    const out = assembleAnswer(body("## Opening sentence\n\nThank you.\n\n"), "change-request");
    expect(out).toContain("## Matched article\n\nnone");
    expect(out).not.toContain("submitted-wrong-figures");
  });

  test("another kind keeps the matched article and drops the opening section", () => {
    const out = assembleAnswer(body("## Opening sentence\n\nnone\n\n"), "other");
    expect(out).toContain("submitted-wrong-figures");
    expect(out).not.toContain("Opening sentence");
  });

  test("a complaint's opening sentence goes first in the reply", () => {
    const out = assembleAnswer(body("## Opening sentence\n\nSorry that happened.\n\n"), "complaint");
    expect(out).toContain("## Drafted reply\n\nSorry that happened. A person will look into it.");
    expect(out).not.toContain("## Opening sentence");
  });

  test("a complaint without an apology or thanks throws", () => {
    expect(() => assembleAnswer(body("## Opening sentence\n\nIt may be your browser.\n\n"), "complaint")).toThrow(/sorry or thank/);
    expect(() => assembleAnswer(body(), "complaint")).toThrow(/sorry or thank/);
  });

  test("a change request's opening sentence goes first and must thank or apologise", () => {
    const out = assembleAnswer(body("## Opening sentence\n\nThank you for the suggestion.\n\n"), "change-request");
    expect(out).toContain("## Drafted reply\n\nThank you for the suggestion. A person");
    expect(() => assembleAnswer(body("## Opening sentence\n\nWe do not edit text.\n\n"), "change-request")).toThrow(/sorry or thank/);
  });

  test("an unknown kind throws", () => {
    expect(() => assembleAnswer(body(), "question")).toThrow(/ticketKind/);
    expect(() => assembleAnswer(body(), undefined)).toThrow(/ticketKind/);
  });
});
