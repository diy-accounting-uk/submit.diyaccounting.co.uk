// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEVELS,
  MAX_PURPOSE_WORDS,
  applySecretsTable,
  compareNames,
  loadItems,
  renderSecretsTable,
  scanReferences,
} from "../../scripts/build-secrets-table.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const items = loadItems(ROOT);
const references = scanReferences(ROOT);

describe("README.md secrets and variables section", () => {
  it("is what the workflows and the name file generate", () => {
    expect(applySecretsTable(readme, items, references) === readme, "run `npm run secrets:table`").toBe(true);
  });

  it("lists every name that a workflow or action reads", () => {
    expect(compareNames(references, items).unlisted, "add the name to scripts/secrets-and-variables.toml").toEqual([]);
  });

  it("lists no name that nothing reads", () => {
    expect(compareNames(references, items).unreferenced, "remove the name from scripts/secrets-and-variables.toml").toEqual([]);
  });

  it("refuses to render when a referenced name has no entry", () => {
    const withExtra = new Map(references).set("NEW_SECRET_NAME", { kind: "secret", readers: ["x.yml"] });
    expect(() => renderSecretsTable(items, withExtra)).toThrow(/NEW_SECRET_NAME/);
  });

  it("refuses to render when an entry has no reference", () => {
    const withExtra = [...items, { name: "UNUSED_NAME", kind: "secret", level: "repository", purpose: "Unused." }];
    expect(() => renderSecretsTable(withExtra, references)).toThrow(/UNUSED_NAME/);
  });

  it("refuses a README with no markers", () => {
    expect(() => applySecretsTable("no markers", items, references)).toThrow(/needs/);
  });
});

describe("scripts/secrets-and-variables.toml", () => {
  it("gives each name once, with a known kind, a known level and a short purpose", () => {
    const seen = new Set();
    for (const item of items) {
      expect(seen.has(item.name), item.name).toBe(false);
      seen.add(item.name);
      expect(["secret", "variable"], item.name).toContain(item.kind);
      expect(LEVELS, item.name).toContain(item.level);
      expect(item.purpose.trim().split(/\s+/).length, item.name).toBeLessThanOrEqual(MAX_PURPOSE_WORDS);
    }
  });

  it("matches the kind that the workflows use", () => {
    for (const item of items) expect(references.get(item.name)?.kind, item.name).toBe(item.kind);
  });

  it("holds no value, date, account id or ARN", () => {
    const text = JSON.stringify(items);
    expect(text).not.toMatch(/\barn:aws/);
    expect(text).not.toMatch(/\b\d{12}\b/);
    expect(text).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
  });
});
