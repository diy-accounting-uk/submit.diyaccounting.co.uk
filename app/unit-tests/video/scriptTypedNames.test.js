// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import fs from "node:fs";
import path from "node:path";
import { describe, test, expect } from "vitest";

const videosDir = path.resolve("videos");
const scripts = fs
  .readdirSync(videosDir)
  .filter((name) => name.endsWith(".json") && name !== "publish.json")
  .map((name) => ({ name, script: JSON.parse(fs.readFileSync(path.join(videosDir, name), "utf8")) }))
  .filter(({ script }) => Array.isArray(script.scenes));

describe("text a scene script types", () => {
  test("never names a person by a role such as Director", () => {
    const found = [];
    for (const { name, script } of scripts) {
      for (const scene of script.scenes) {
        for (const step of scene.steps) {
          if (typeof step.text === "string" && step.action !== "caption" && /\b(Director|Secretary|Officer)$/.test(step.text.trim())) {
            found.push(`${name} ${scene.id}: ${step.text}`);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });
});
