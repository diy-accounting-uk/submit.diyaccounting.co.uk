// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/web/trackedTestReportsAuthorizationMasking.test.js

import { describe, test, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";

const MASKED_VALUE = "***MASKED***";

// Walks a parsed JSON value and collects every Authorization/authorization field whose
// value is not exactly the masked placeholder, at any depth, so a captured token committed
// to a tracked test report is caught regardless of where in the payload it sits.
function findUnmaskedAuthorizationFields(value, currentPath = []) {
  if (value === null || typeof value !== "object") {
    return [];
  }
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...currentPath, key];
    if (key.toLowerCase() === "authorization" && child !== MASKED_VALUE) {
      found.push({ path: childPath.join("."), value: child });
    }
    found.push(...findUnmaskedAuthorizationFields(child, childPath));
  }
  return found;
}

function trackedTestReportJsonFiles() {
  const output = execSync("git ls-files ':(glob)web/public/tests/**/*.json'", { encoding: "utf-8" });
  return output.split("\n").filter((line) => line.trim().length > 0);
}

describe("findUnmaskedAuthorizationFields", () => {
  test("reports a Bearer token found at any depth", () => {
    const planted = {
      hmrcApiRequests: [{ httpRequest: { headers: { Authorization: "Bearer abc" } } }],
    };

    const issues = findUnmaskedAuthorizationFields(planted);

    expect(issues).toEqual([
      {
        path: "hmrcApiRequests.0.httpRequest.headers.Authorization",
        value: "Bearer abc",
      },
    ]);
  });

  test("accepts the masked placeholder", () => {
    const masked = { headers: { authorization: MASKED_VALUE } };

    expect(findUnmaskedAuthorizationFields(masked)).toEqual([]);
  });
});

describe("tracked web/public/tests JSON files", () => {
  const files = trackedTestReportJsonFiles();

  test("at least one test report file is tracked", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files)("%s has every Authorization field masked", (relativePath) => {
    const contents = fs.readFileSync(relativePath, "utf-8");
    const parsed = JSON.parse(contents);

    const issues = findUnmaskedAuthorizationFields(parsed);

    expect(issues, `${relativePath} has unmasked Authorization field(s): ${JSON.stringify(issues)}`).toEqual([]);
  });
});
