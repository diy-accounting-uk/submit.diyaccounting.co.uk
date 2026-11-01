// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/supportTriageAssemble.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assembleAnswer } from "../../../scripts/support-triage-assemble.mjs";

const body = (kind, extra = "") =>
  `## Ticket kind\n\n${kind}\n\n## Matched article\n\nsubmitted-wrong-figures\n\n## Resolution\n\nanswer\n\n${extra}## Drafted reply\n\nA person will look into it.\n`;

describe("support triage assemble", () => {
  test("a change request loses its matched article and the kind section", () => {
    const out = assembleAnswer(body("change-request"));
    expect(out).toContain("## Matched article\n\nnone");
    expect(out).not.toContain("submitted-wrong-figures");
    expect(out).not.toContain("Ticket kind");
  });

  test("another kind keeps the matched article", () => {
    expect(assembleAnswer(body("other"))).toContain("submitted-wrong-figures");
  });

  test("a complaint's opening sentence goes first in the reply", () => {
    const out = assembleAnswer(body("complaint", "## Opening sentence\n\nSorry that happened.\n\n"));
    expect(out).toContain("## Drafted reply\n\nSorry that happened. A person will look into it.");
    expect(out).not.toContain("## Opening sentence");
  });

  test("a complaint without an apology or thanks throws", () => {
    expect(() => assembleAnswer(body("complaint", "## Opening sentence\n\nIt may be your browser.\n\n"))).toThrow(/sorry or thank/);
    expect(() => assembleAnswer(body("complaint"))).toThrow(/sorry or thank/);
  });

  test("a missing or unknown kind throws", () => {
    expect(() => assembleAnswer("## Matched article\n\nnone\n\n## Drafted reply\n\nx\n")).toThrow(/Ticket kind/);
    expect(() => assembleAnswer(body("question"))).toThrow(/Ticket kind/);
  });

  test("the prompt defines every kind the code accepts", () => {
    const prompt = readFileSync(new URL("../../../prompts/support-triage.md", import.meta.url), "utf8");
    for (const kind of ["change-request", "complaint", "other"]) expect(prompt).toContain(`\`${kind}\``);
  });
});
