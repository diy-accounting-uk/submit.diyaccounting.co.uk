// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const publicDir = path.join(process.cwd(), "web/public");
const homeHtml = fs.readFileSync(path.join(publicDir, "index.html"), "utf-8");

function staticImportGraph(entryRelativePath) {
  const seen = new Set();
  const visit = (absolutePath) => {
    if (seen.has(absolutePath)) return;
    seen.add(absolutePath);
    const source = fs.readFileSync(absolutePath, "utf-8");
    const specifiers = [
      ...[...source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gms)].map((m) => m[1]),
      ...[...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1]),
    ];
    for (const specifier of specifiers) {
      if (specifier.startsWith(".")) visit(path.resolve(path.dirname(absolutePath), specifier));
    }
  };
  visit(path.join(publicDir, entryRelativePath));
  return [...seen].map((absolutePath) => path.relative(publicDir, absolutePath)).sort();
}

function linkHrefs(rel) {
  return [...homeHtml.matchAll(new RegExp(`<link rel="${rel}" href="\\./([^"]+)"`, "g"))].map((m) => m[1]);
}

describe("home page preloads", () => {
  it("modulepreloads exactly the static import graph of submit.js", () => {
    expect(linkHrefs("modulepreload").sort()).toEqual(staticImportGraph("submit.js"));
  });

  it("preloads only fonts that tokens.css declares and that exist", () => {
    const tokensCss = fs.readFileSync(path.join(publicDir, "css/tokens.css"), "utf-8");
    const fonts = linkHrefs("preload").filter((href) => href.endsWith(".woff2"));
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) {
      expect(tokensCss).toContain(`url("../${font}")`);
      expect(fs.existsSync(path.join(publicDir, font))).toBe(true);
    }
  });

  it("marks every font preload as crossorigin so the browser reuses it", () => {
    for (const tag of homeHtml.match(/<link rel="preload"[^>]*as="font"[^>]*>/g) || []) {
      expect(tag).toContain("crossorigin");
    }
  });
});
