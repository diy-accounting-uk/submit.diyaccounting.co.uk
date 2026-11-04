// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/hmrcSendPathBypass.test.js
//
// Every request to HMRC leaves through sendToHmrc in app/services/hmrcApi.js. This test fails
// when another source file both names an HMRC host or base URI and calls a fetch function.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = process.cwd();
const SCANNED_DIRECTORIES = ["app/functions", "app/services", "app/lib"];

const FETCH_CALL = /\b(fetch|fetchWithTimeout|fetchRetryingNetworkErrors|fetchJsonWithTimeout|fetchTextWithTimeout)\s*\(/g;
const HMRC_REFERENCE =
  /HMRC_BASE_URI|HMRC_SANDBOX_BASE_URI|HMRC_AGENT_AUTHORISATION_BASE_URI|hmrc\.gov\.uk|getHmrcBaseUrl|getAgentAuthorisationBaseUrl/;

// The only files allowed a fetch call beside an HMRC reference, each with the exact number of
// calls and the reason. A change to a file's count fails the test until the entry is reviewed.
const ALLOWED_FETCH_CALLS = [
  {
    file: "app/services/hmrcApi.js",
    fetchCalls: 3,
    reason:
      "sendToHmrc is the send path (1 call); validateFraudPreventionHeaders and getFraudPreventionHeadersFeedback (2 calls) read HMRC's sandbox-only test endpoints, which exist to receive the headers under test",
  },
  {
    file: "app/services/hmrcTransactionEngine.js",
    fetchCalls: 1,
    reason:
      "the Corporation Tax transaction engine and its test hosts are not the HMRC API host; the request is signed XML, not an API call",
  },
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

describe("HMRC send path", () => {
  const found = [];
  for (const directory of SCANNED_DIRECTORIES) {
    for (const path of sourceFiles(join(REPO_ROOT, directory))) {
      const code = withoutComments(readFileSync(path, "utf8"));
      const fetchCalls = (code.match(FETCH_CALL) || []).length;
      if (fetchCalls > 0 && HMRC_REFERENCE.test(code)) {
        found.push({ file: relative(REPO_ROOT, path), fetchCalls });
      }
    }
  }

  it("scans source files", () => {
    expect(sourceFiles(join(REPO_ROOT, "app/services")).length).toBeGreaterThan(5);
  });

  it("has no file that calls fetch beside an HMRC reference outside the allow-list", () => {
    const allowedFiles = ALLOWED_FETCH_CALLS.map((entry) => entry.file);
    const bypasses = found.filter((entry) => !allowedFiles.includes(entry.file));
    expect(bypasses).toEqual([]);
  });

  it("keeps each allowed file to its named number of fetch calls", () => {
    for (const allowed of ALLOWED_FETCH_CALLS) {
      const actual = found.find((entry) => entry.file === allowed.file);
      expect(actual?.fetchCalls, `${allowed.file}: ${allowed.reason}`).toBe(allowed.fetchCalls);
    }
  });

  it("gives every allow-list entry a reason", () => {
    for (const allowed of ALLOWED_FETCH_CALLS) {
      expect(allowed.reason.length).toBeGreaterThan(20);
    }
  });
});
