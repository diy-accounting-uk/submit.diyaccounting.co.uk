// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/hmrcSendPathBypass.test.js
//
// Every request to HMRC leaves through sendToHmrc in app/services/hmrcApi.js or another named
// recordedFetch call. This test fails when another source file both names an HMRC host or base
// URI and calls a fetch function, or when the number of recorded sends changes.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = process.cwd();
const SCANNED_DIRECTORIES = ["app/functions", "app/services", "app/lib"];

const FETCH_CALL = /\b(fetch|fetchWithTimeout|fetchRetryingNetworkErrors|fetchJsonWithTimeout|fetchTextWithTimeout)\s*\(/g;
const HMRC_REFERENCE =
  /HMRC_BASE_URI|HMRC_SANDBOX_BASE_URI|HMRC_AGENT_AUTHORISATION_BASE_URI|hmrc\.gov\.uk|getHmrcBaseUrl|getAgentAuthorisationBaseUrl/;

// The only file allowed a fetch call beside an HMRC reference, with the exact number of calls and
// the reason. A change to the count fails the test until the entry is reviewed.
const ALLOWED_FETCH_CALLS = [
  {
    file: "app/services/hmrcTransactionEngine.js",
    fetchCalls: 1,
    reason: "the send that recordedFetch wraps, which applies the Transaction Engine timeout and keeps its timeout error",
  },
];

const RECORDED_SEND = /\brecordedFetch\s*\(/g;

// Each file that sends to HMRC through recordedFetch, with the exact number of sends.
// httpResponseHelper.js names no HMRC host, so the fetch check above does not see it.
const RECORDED_HMRC_SENDS = [
  { file: "app/services/hmrcApi.js", sends: 3 },
  { file: "app/services/hmrcTransactionEngine.js", sends: 1 },
  { file: "app/lib/httpResponseHelper.js", sends: 1 },
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

  it("keeps each HMRC send on recordedFetch", () => {
    for (const { file, sends } of RECORDED_HMRC_SENDS) {
      const code = withoutComments(readFileSync(join(REPO_ROOT, file), "utf8"));
      expect((code.match(RECORDED_SEND) || []).length, file).toBe(sends);
    }
  });

  it("gives every allow-list entry a reason", () => {
    for (const allowed of ALLOWED_FETCH_CALLS) {
      expect(allowed.reason.length).toBeGreaterThan(20);
    }
  });
});
