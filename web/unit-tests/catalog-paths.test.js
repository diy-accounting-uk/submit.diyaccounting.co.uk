// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/unit-tests/catalog-paths.test.js

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";

describe("catalogue paths", () => {
  it("all HTML paths in the catalogue must exist under web/public/", () => {
    const tomlPath = path.join(process.cwd(), "web/public/submit.catalogue.toml");
    const tomlText = fs.readFileSync(tomlPath, "utf-8");
    const catalog = TOML.parse(tomlText);

    const missingPaths = [];

    if (Array.isArray(catalog.activities)) {
      for (const activity of catalog.activities) {
        if (Array.isArray(activity.paths)) {
          for (const pathEntry of activity.paths) {
            // Only check paths that end with .html (skip API regex patterns)
            if (pathEntry.endsWith(".html")) {
              const fullPath = path.join(process.cwd(), "web/public", pathEntry);
              if (!fs.existsSync(fullPath)) {
                missingPaths.push(pathEntry);
              }
            }
          }
        }
      }
    }

    expect(missingPaths).toEqual([], `Missing catalogue paths under web/public/: ${missingPaths.join(", ")}`);
  });
});
