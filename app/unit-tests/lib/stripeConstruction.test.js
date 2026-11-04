// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/stripeConstruction.test.js
//
// Every Stripe client is built in app/lib/stripeClient.js, which gives it the recording HTTP
// client. A client built anywhere else under app/ would send calls that leave no record.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = process.cwd();
const CONSTRUCTION = /\bnew\s+Stripe\s*\(/;

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === "unit-tests" || entry === "system-tests") continue;
      files.push(...sourceFiles(path));
    } else if (path.endsWith(".js")) {
      files.push(path);
    }
  }
  return files;
}

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("Stripe client construction", () => {
  const constructing = sourceFiles(join(REPO_ROOT, "app"))
    .filter((path) => CONSTRUCTION.test(withoutComments(readFileSync(path, "utf8"))))
    .map((path) => relative(REPO_ROOT, path));

  it("happens only in app/lib/stripeClient.js", () => {
    expect(constructing).toEqual(["app/lib/stripeClient.js"]);
  });

  it("passes the recording HTTP client", () => {
    const code = readFileSync(join(REPO_ROOT, "app/lib/stripeClient.js"), "utf8");
    expect(code).toMatch(/httpClient:\s*new StripeRecordingHttpClient\(/);
  });
});
