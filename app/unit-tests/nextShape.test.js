// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// nextShape.test.js -- NEXT.md carries five required headings in order, each
// occurring exactly once: In flight, Machine-only, Machine-ask,
// Human-driven, Blocked. Every open row sits under one of those five. The
// Discipline heading (which terminates the board rows) must come after Blocked.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

describe("NEXT.md shape", () => {
  it("contains the five required headings in order, each exactly once", () => {
    const raw = readFileSync(resolve(ROOT, "NEXT.md"), "utf8");
    const lines = raw.split(/\r?\n/);

    const requiredHeadings = ["## In flight", "## Machine-only", "## Machine-ask", "## Human-driven", "## Blocked"];

    const headingIndices = requiredHeadings.map((heading) => lines.indexOf(heading));

    // Each heading must appear exactly once
    for (const [i, heading] of requiredHeadings.entries()) {
      const count = lines.filter((line) => line === heading).length;
      expect(count).toBe(1, `${heading} should appear exactly once, but appears ${count} times`);
    }

    // Headings must appear in order
    for (let i = 0; i < headingIndices.length - 1; i++) {
      expect(headingIndices[i] < headingIndices[i + 1]).toBe(true, `${requiredHeadings[i]} should come before ${requiredHeadings[i + 1]}`);
    }
  });

  it("has Blocked heading before Discipline heading", () => {
    const raw = readFileSync(resolve(ROOT, "NEXT.md"), "utf8");
    const lines = raw.split(/\r?\n/);

    const blockedIndex = lines.indexOf("## Blocked");
    const disciplineIndex = lines.indexOf("## Discipline");

    expect(blockedIndex).not.toBe(-1, "## Blocked heading not found");
    expect(disciplineIndex).not.toBe(-1, "## Discipline heading not found");
    expect(blockedIndex < disciplineIndex).toBe(true, "## Blocked should come before ## Discipline");
  });

  it("all open rows sit under one of the five required headings", () => {
    const raw = readFileSync(resolve(ROOT, "NEXT.md"), "utf8");
    const lines = raw.split(/\r?\n/);

    const requiredHeadings = ["## In flight", "## Machine-only", "## Machine-ask", "## Human-driven", "## Blocked"];

    // Find indices of the required headings and the Discipline heading
    const headingIndices = {
      "## In flight": lines.indexOf("## In flight"),
      "## Machine-only": lines.indexOf("## Machine-only"),
      "## Machine-ask": lines.indexOf("## Machine-ask"),
      "## Human-driven": lines.indexOf("## Human-driven"),
      "## Blocked": lines.indexOf("## Blocked"),
      "## Discipline": lines.indexOf("## Discipline"),
    };

    const boardStartIndex = headingIndices["## In flight"];
    const boardEndIndex = headingIndices["## Discipline"];

    expect(boardStartIndex).not.toBe(-1, "## In flight not found");
    expect(boardEndIndex).not.toBe(-1, "## Discipline not found");

    const offenders = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.match(/^- \[ \] \*\*/)) continue; // Skip non-open-row lines

      // This is an open row. It must be between "## In flight" and "## Discipline"
      if (i <= boardStartIndex || i >= boardEndIndex) {
        offenders.push(`Line ${i + 1}: open row "${line.substring(0, 50)}..." sits outside the board sections`);
      } else {
        // It must sit after one of the required headings and before the next section
        let foundSection = false;
        for (let h = 0; h < requiredHeadings.length; h++) {
          const headingIndex = headingIndices[requiredHeadings[h]];
          const nextHeadingIndex = h + 1 < requiredHeadings.length ? headingIndices[requiredHeadings[h + 1]] : boardEndIndex;
          if (i > headingIndex && i < nextHeadingIndex) {
            foundSection = true;
            break;
          }
        }
        if (!foundSection) {
          offenders.push(`Line ${i + 1}: open row "${line.substring(0, 50)}..." is not under one of the five required headings`);
        }
      }
    }

    expect(offenders).toEqual([], offenders.join("\n"));
  });
});
