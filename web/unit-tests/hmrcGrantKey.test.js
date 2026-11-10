// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const publicDir = path.join(process.cwd(), "web/public");
const testsDir = path.join(publicDir, "tests");
const retiredKey = ["hmrc", "Access", "Token"].join("");

function listFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (full === testsDir) continue;
    if (entry.isDirectory()) files.push(...listFiles(full));
    else files.push(full);
  }
  return files;
}

describe("web/public holds the HMRC grant under hmrcGrantId only", () => {
  test("no file under web/public (outside web/public/tests) names the retired key", () => {
    const hits = listFiles(publicDir)
      .filter((file) => {
        try {
          return fs.readFileSync(file, "utf-8").includes(retiredKey);
        } catch {
          return false;
        }
      })
      .map((file) => path.relative(process.cwd(), file));
    expect(hits).toEqual([]);
  });
});
