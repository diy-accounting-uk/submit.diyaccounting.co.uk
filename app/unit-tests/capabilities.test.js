// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateReport } from "../../scripts/capabilities-generate.mjs";
import { parseEntries } from "../../scripts/capabilities-index.mjs";
import { REPORT_FILE, SKELETON_PATH, discoverHeaders, trackedFiles } from "../../scripts/lib/capabilityHeaders.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const tracked = readFileSync(join(ROOT, REPORT_FILE), "utf8");
const headers = discoverHeaders(ROOT);
const areas = parseEntries(tracked);
const entries = areas.flatMap((a) => a.groups.flatMap((g) => g.entries));
const trackedPaths = new Set(trackedFiles(ROOT));

describe("REPORT_CAPABILITIES.md", () => {
  it("is what the capability headers generate", () => {
    const generated = generateReport(readFileSync(join(ROOT, SKELETON_PATH), "utf8"), headers);
    expect(generated === tracked, "run `npm run capabilities:generate`").toBe(true);
  });

  it("gives every capability a unique id carrying its area's prefix, and gives every header a place in the report", () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of areas) {
      for (const g of a.groups) {
        for (const e of g.entries) expect(e.id.startsWith(`${a.prefix}-`), e.id).toBe(true);
      }
    }
    expect(headers.map((h) => h.id).sort()).toEqual([...ids].sort());
    expect(ids).toContain("OPS-14a");
    expect(tracked).toContain("[OPS-14a](#ops-14a-");
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

  it("names only tracked files in the Entry field of every entry of this repository", () => {
    const missing = [];
    for (const e of entries.filter((entry) => !entry.id.startsWith("SS-"))) {
      const line = e.lines.find((l) => l.startsWith("- **Entry:** ")) ?? "";
      for (const [, token] of line.matchAll(/`([^`]+)`/g)) {
        const path = token.split(":")[0];
        if (!path.startsWith("../") && !trackedPaths.has(path)) missing.push(`${e.id}: ${path}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
