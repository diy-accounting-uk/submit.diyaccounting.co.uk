// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyScriptsTable, groupScripts, renderScriptsTable } from "../../scripts/scripts-table.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const { scripts } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

describe("README.md script table", () => {
  it("is what package.json generates", () => {
    expect(applyScriptsTable(readme, scripts) === readme, "run `npm run scripts:table`").toBe(true);
  });

  it("lists every script once under its group", () => {
    const listed = groupScripts(scripts).reduce((sum, [, members]) => sum + members.length, 0);
    expect(listed).toBe(Object.keys(scripts).length);
  });

  it("opens with the script count", () => {
    expect(renderScriptsTable({ "a": "x", "b:c": "y" }).startsWith("2 scripts in package.json.")).toBe(true);
  });

  it("refuses a README with no markers", () => {
    expect(() => applyScriptsTable("no markers", scripts)).toThrow(/needs/);
  });
});
