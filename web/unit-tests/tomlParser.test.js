// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseWithTheServerParser } from "@iarna/toml";

const PUBLIC_DIR = join(process.cwd(), "web", "public");

beforeAll(() => {
  new Function("window", readFileSync(join(PUBLIC_DIR, "lib", "toml-parser.js"), "utf8"))(globalThis.window || (globalThis.window = {}));
});

describe("web/public/lib/toml-parser.js", () => {
  it("reads an array on one line", () => {
    expect(window.TOML.parse('paths = ["a.html", "^/api/b.*"]\n').paths).toEqual(["a.html", "^/api/b.*"]);
  });

  it("reads an array across lines, with a trailing comma and a comment inside", () => {
    const parsed = window.TOML.parse(
      ["[[activities]]", 'id = "x"', "paths = [", '  "a.html",', "  # the route", '  "^/api/b.*",', "]", 'after = "kept"', ""].join("\n"),
    );
    expect(parsed.activities).toEqual([{ id: "x", paths: ["a.html", "^/api/b.*"], after: "kept" }]);
  });

  it("keeps a comma, a bracket and a hash inside a string of an array", () => {
    expect(window.TOML.parse('paths = ["^/api/v1/a,b.*", "c # d", "[e]"]').paths).toEqual(["^/api/v1/a,b.*", "c # d", "[e]"]);
  });

  it("reads an empty array, numbers and an array inside an array", () => {
    expect(window.TOML.parse("none = []\nnumbers = [1, 2]\nnested = [[1, 2], [3]]")).toEqual({
      none: [],
      numbers: [1, 2],
      nested: [[1, 2], [3]],
    });
  });

  it("reads every activity of the site's catalogue as the server's parser does", () => {
    const source = readFileSync(join(PUBLIC_DIR, "submit.catalogue.toml"), "utf8");
    const browser = window.TOML.parse(source).activities;
    const server = parseWithTheServerParser(source).activities;
    expect(browser.map((activity) => activity.id)).toEqual(server.map((activity) => activity.id));
    expect(browser.map((activity) => activity.paths)).toEqual(server.map((activity) => activity.paths));
  });
});
