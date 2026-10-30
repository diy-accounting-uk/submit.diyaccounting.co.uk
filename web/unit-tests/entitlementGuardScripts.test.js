// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const PUBLIC_DIR = join(process.cwd(), "web/public");

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "tests" ? [] : htmlFiles(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });
}

// The entitlement widget parses the TOML catalogue with window.TOML when its DOMContentLoaded
// handler runs; a parser that arrives later through the nav leaves the guard without a catalogue.
describe("pages that load the entitlement widget", () => {
  const pages = htmlFiles(PUBLIC_DIR).filter((file) => readFileSync(file, "utf8").includes("widgets/entitlement-status.js"));

  it("finds the pages to check", () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it.each(pages.map((file) => [relative(PUBLIC_DIR, file), file]))("%s loads the TOML parser before the widget", (_name, file) => {
    const html = readFileSync(file, "utf8");
    const parserAt = html.search(/<script src="(\.\.?\/)*lib\/toml-parser\.js"><\/script>/);
    const widgetAt = html.search(/<script src="(\.\.?\/)*widgets\/entitlement-status\.js"><\/script>/);
    expect(parserAt).toBeGreaterThan(-1);
    expect(parserAt).toBeLessThan(widgetAt);
  });
});
