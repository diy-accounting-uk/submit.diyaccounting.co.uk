// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/putReceiptImporters.test.js

import { describe, test, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const appRoot = join(import.meta.dirname, "..");

const ALLOWED_IMPORTERS = [
  "app/services/filedReceipt.js",
  "app/functions/hmrc/hmrcVatAssistReportPost.js",
  "app/functions/hmrc/hmrcItsaAssistReportPost.js",
  "app/lib/hmrcAssistReceipt.js",
];

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return ["node_modules", "unit-tests", "system-tests"].includes(entry.name) ? [] : sourceFiles(path);
    }
    return entry.name.endsWith(".js") ? [path] : [];
  });
}

describe("putReceipt importers", () => {
  test("only the filed receipt service and the listed report writers import putReceipt", () => {
    const importPattern = /import\s*\{[^}]*\bputReceipt\b[^}]*\}\s*from/;
    const importers = sourceFiles(appRoot)
      .filter((file) => importPattern.test(readFileSync(file, "utf8")))
      .map((file) => relative(join(appRoot, ".."), file))
      .filter((file) => file !== "app/data/dynamoDbReceiptRepository.js")
      .sort();
    expect(importers).toEqual([...ALLOWED_IMPORTERS].sort());
  });
});
