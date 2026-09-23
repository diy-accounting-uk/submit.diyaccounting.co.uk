// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { REPORT_PATH, parseEntries, render } from "../../scripts/capabilities-index.mjs";

const markdown = readFileSync(REPORT_PATH, "utf8");
const areas = parseEntries(markdown);
const entries = areas.flatMap((a) => a.groups.flatMap((g) => g.entries));

describe("REPORT_CAPABILITIES.md", () => {
  it("has its generated contents in step with its entries", () => {
    expect(render(markdown) === markdown, "run `npm run capabilities:index`").toBe(true);
  });

  it("gives every capability a unique id carrying its area's prefix", () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of areas) {
      for (const g of a.groups) {
        for (const e of g.entries) expect(e.id.startsWith(`${a.prefix}-`), e.id).toBe(true);
      }
    }
  });

  it("gives every capability the fields a lookup needs", () => {
    for (const e of entries) {
      const text = e.lines.join("\n");
      expect(e.useWhen, `${e.id} Use when`).not.toBe("");
      expect(text, `${e.id} Does`).toContain("- **Does:** ");
      expect(text, `${e.id} Run`).toContain("- **Run:** ");
      expect(text, `${e.id} Files`).toContain("- **Files:** ");
      expect(e.keywords.length, `${e.id} Keywords`).toBeGreaterThan(0);
    }
  });
});
