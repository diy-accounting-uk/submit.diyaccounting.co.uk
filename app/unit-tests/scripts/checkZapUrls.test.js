// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/checkZapUrls.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { missingSeedPaths } from "../../../scripts/check-zap-urls.js";

const seedPaths = JSON.parse(readFileSync("scripts/zap/seed-urls.json", "utf8")).paths;

describe("check-zap-urls", () => {
  test("seed list holds the Corporation Tax page and the three routes", () => {
    expect(seedPaths).toEqual(
      expect.arrayContaining([
        "/companies-house/fileCompanyTaxReturn.html",
        "/api/v1/hmrc/ct/return",
        "/api/v1/hmrc/ct/return/preview",
        expect.stringMatching(/^\/api\/v1\/hmrc\/ct\/return\/[^/]+$/),
      ]),
    );
  });

  test("reports nothing when every seed path was scanned", () => {
    const scanned = ["https://x.example", ...seedPaths.map((p) => `https://x.example${p}`)];
    expect(missingSeedPaths(scanned, seedPaths)).toEqual([]);
  });

  test("reports each seed path that was not scanned", () => {
    const scanned = ["https://x.example/", "https://x.example/companies-house/fileCompanyTaxReturn.html"];
    expect(missingSeedPaths(scanned, seedPaths)).toEqual(seedPaths.slice(1));
  });

  test("an empty scan misses every seed path", () => {
    expect(missingSeedPaths([], seedPaths)).toEqual(seedPaths);
  });
});
