// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/publishCssBundle.test.js

import { describe, test, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleImports, publishCssBundle, rebaseUrls } from "../../../scripts/publish-css-bundle.mjs";

describe("rebaseUrls", () => {
  test("rewrites a relative reference to resolve from the importing stylesheet", () => {
    expect(rebaseUrls('src: url("../fonts/a.woff2") format("woff2");', "css")).toBe('src: url("fonts/a.woff2") format("woff2");');
  });

  test("rewrites unquoted and single-quoted references", () => {
    expect(rebaseUrls("a: url(../x.png); b: url( '../y.png' )", "css")).toBe('a: url("x.png"); b: url("y.png")');
  });

  test("leaves data, absolute, remote and fragment references as they are", () => {
    const text =
      "a: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E\"); b: url(/x.png); c: url(https://e.com/x.png); d: url(#id)";
    expect(rebaseUrls(text, "css")).toBe(text);
  });
});

describe("bundleImports", () => {
  test("replaces each @import with the imported text in order", () => {
    const files = { "css/a.css": ".a { color: red; }", "css/b.css": '.b { background: url("../i/b.png"); }' };
    const out = bundleImports('/* head */\n@import url("css/a.css");\n@import url("css/b.css");\n.tail {}\n', (path) => files[path]);
    expect(out).not.toContain("@import");
    expect(out.indexOf(".a {")).toBeLessThan(out.indexOf(".b {"));
    expect(out).toContain('url("i/b.png")');
    expect(out.endsWith(".tail {}\n")).toBe(true);
  });
});

describe("publishCssBundle", () => {
  test("bundles the real stylesheet with every import inlined and every font reference resolvable", () => {
    const webRoot = mkdtempSync(join(tmpdir(), "css-bundle-"));
    try {
      cpSync("web/public/submit.css", join(webRoot, "submit.css"));
      cpSync("web/public/css", join(webRoot, "css"), { recursive: true });
      mkdirSync(join(webRoot, "fonts"));
      const source = readFileSync("web/public/submit.css", "utf8");
      const importCount = (source.match(/^@import/gm) || []).length;
      publishCssBundle(webRoot);
      const bundle = readFileSync(join(webRoot, "submit.css"), "utf8");
      expect(importCount).toBeGreaterThan(30);
      expect(bundle).not.toMatch(/@import/);
      expect((bundle.match(/^\/\* css\/[a-z0-9-]+\.css \*\/$/gm) || []).length).toBe(importCount);
      expect(bundle).toContain('url("fonts/atkinson-hyperlegible-latin-400-normal.woff2")');
      expect(bundle).not.toContain("../fonts/");
    } finally {
      rmSync(webRoot, { recursive: true, force: true });
    }
  });
});
