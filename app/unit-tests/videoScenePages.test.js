// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/videoScenePages.test.js
//
// Every scene script declares the web/public/ pages its scenes visit, so a workflow can decide
// which recordings a page change might have broken without running any of them. This checks the
// declaration stays honest: non-empty, pointing at real files under web/public/.
//
// It does not check that a page also appears as a literal URL somewhere in the script's own
// scenes: navigation mostly happens through a click on a {role, name} or CSS target, which
// carries no page path at all, so a script's own text cannot confirm which page a click lands
// on. That mapping was worked out by hand from the site's shared chrome and its activity
// catalogue, not by reading the script alone.

import fs from "node:fs";
import path from "node:path";
import { describe, test, expect } from "vitest";

const videosDir = path.resolve(process.cwd(), "videos");
const repoRoot = process.cwd();

const scriptNames = fs
  .readdirSync(videosDir)
  .filter((file) => file.endsWith(".json") && !file.endsWith(".schema.json") && file !== "publish.json")
  .map((file) => file.replace(/\.json$/, ""));

function readSceneScript(name) {
  return JSON.parse(fs.readFileSync(path.join(videosDir, `${name}.json`), "utf8"));
}

describe("every scene script's declared pages", () => {
  test.each(scriptNames)("%s declares a non-empty pages array", (name) => {
    const script = readSceneScript(name);
    expect(Array.isArray(script.pages)).toBe(true);
    expect(script.pages.length).toBeGreaterThan(0);
  });

  test.each(scriptNames)("%s's pages all start with web/public/", (name) => {
    for (const page of readSceneScript(name).pages) {
      expect(page.startsWith("web/public/")).toBe(true);
    }
  });

  test.each(scriptNames)("%s's pages all exist in the repo", (name) => {
    for (const page of readSceneScript(name).pages) {
      expect(fs.existsSync(path.join(repoRoot, page))).toBe(true);
    }
  });
});
