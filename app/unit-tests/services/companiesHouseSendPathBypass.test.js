// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseSendPathBypass.test.js
//
// Every request to Companies House leaves through companiesHouseSend.js. This test fails when
// another source file both names a Companies House setting or host and calls a fetch function,
// or when the number of sends through the module changes. companiesHouseSend.js names no
// Companies House setting, because its callers pass the URL.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = process.cwd();
const SCANNED_DIRECTORIES = ["app/functions", "app/services", "app/lib"];

const FETCH_CALL = /\b(fetch|fetchWithTimeout|fetchRetryingNetworkErrors|fetchJsonWithTimeout|fetchTextWithTimeout)\s*\(/g;
const COMPANIES_HOUSE_REFERENCE = /COMPANIES_HOUSE_|companieshouse\.gov\.uk|company-information\.service/;

const SEND_FUNCTION = /\b(sendJsonToCompaniesHouse|sendXmlToCompaniesHouse)\s*\(/g;

// Each file that sends to Companies House, with the exact number of sends.
const COMPANIES_HOUSE_SENDS = [
  { file: "app/services/companiesHouseApi.js", sends: 1 },
  { file: "app/services/companiesHouseFilingApi.js", sends: 1 },
  { file: "app/services/companiesHouseXmlGateway.js", sends: 1 },
  { file: "app/functions/companies-house/companiesHouseTokenPost.js", sends: 1 },
  { file: "app/lib/trustedEvents/companiesHouseProfile.js", sends: 1 },
];

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === "unit-tests" || entry === "system-tests") continue;
      files.push(...sourceFiles(path));
    } else if (path.endsWith(".js") && !path.endsWith(".test.js")) {
      files.push(path);
    }
  }
  return files;
}

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("Companies House send path", () => {
  const found = [];
  for (const directory of SCANNED_DIRECTORIES) {
    for (const path of sourceFiles(join(REPO_ROOT, directory))) {
      const code = withoutComments(readFileSync(path, "utf8"));
      const fetchCalls = (code.match(FETCH_CALL) || []).length;
      if (fetchCalls > 0 && COMPANIES_HOUSE_REFERENCE.test(code)) {
        found.push({ file: relative(REPO_ROOT, path), fetchCalls });
      }
    }
  }

  it("scans source files", () => {
    expect(sourceFiles(join(REPO_ROOT, "app/services")).length).toBeGreaterThan(5);
  });

  it("has no file that calls fetch beside a Companies House reference", () => {
    expect(found).toEqual([]);
  });

  it("keeps each Companies House send on the send module", () => {
    for (const { file, sends } of COMPANIES_HOUSE_SENDS) {
      const code = withoutComments(readFileSync(join(REPO_ROOT, file), "utf8"));
      expect((code.match(SEND_FUNCTION) || []).length, file).toBe(sends);
    }
  });

  it("sends from the module through recordedFetch", () => {
    const code = withoutComments(readFileSync(join(REPO_ROOT, "app/services/companiesHouseSend.js"), "utf8"));
    expect((code.match(/\brecordedFetch\s*\(/g) || []).length).toBe(1);
  });
});
