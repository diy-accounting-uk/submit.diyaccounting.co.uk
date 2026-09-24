// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/contentScan.test.js
//
// Every fake secret this file needs (an AWS key shape, a bearer token shape) is built by
// concatenation at runtime rather than written as one contiguous literal, so this file's own
// source lines never carry a string content-scan.mjs's own secret patterns would match. A
// fake personal-data value (a NINO, a VRN) is written directly: this file lives under
// app/unit-tests/, which the scanner exempts from personal data, by design, for exactly this
// reason.

import { describe, test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { addedLines, scanEntries, scanDiff, parseAllowList } from "../../../scripts/content-scan.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../../../scripts/content-scan.mjs", import.meta.url));
const fakeAwsAccessKeyId = "AKIA" + "0".repeat(16);
const fakeBearerToken = "Bearer " + "a1b2c3d4e5f6g7h8i9j0";

function diffAdding(file, line) {
  return [
    `diff --git a/${file} b/${file}`,
    "index 1111111..2222222 100644",
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1,1 +1,1 @@",
    `+${line}`,
  ].join("\n");
}

function diffRemoving(file, line) {
  return [
    `diff --git a/${file} b/${file}`,
    "index 1111111..2222222 100644",
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1,1 +1,0 @@",
    `-${line}`,
  ].join("\n");
}

function runCli(diffText, extraArgs = []) {
  const dir = mkdtempSync(join(tmpdir(), "content-scan-"));
  const diffPath = join(dir, "input.diff");
  writeFileSync(diffPath, diffText);
  const result = spawnSync(process.execPath, [SCRIPT_PATH, diffPath, ...extraArgs], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

describe("addedLines", () => {
  test("returns only lines the diff adds, with their new-file line numbers", () => {
    const diff = [
      "diff --git a/NOTES.md b/NOTES.md",
      "index 1111111..2222222 100644",
      "--- a/NOTES.md",
      "+++ b/NOTES.md",
      "@@ -1,2 +1,3 @@",
      " kept context line",
      "-removed line",
      "+added line one",
      "+added line two",
    ].join("\n");
    expect(addedLines(diff)).toEqual([
      { file: "NOTES.md", lineNumber: 2, text: "added line one" },
      { file: "NOTES.md", lineNumber: 3, text: "added line two" },
    ]);
  });

  test("attributes added lines to the file named after the hunk they fall in", () => {
    const diff = [
      "diff --git a/a.md b/a.md",
      "--- a/a.md",
      "+++ b/a.md",
      "@@ -1,0 +1,1 @@",
      "+first file added line",
      "diff --git a/b.md b/b.md",
      "--- a/b.md",
      "+++ b/b.md",
      "@@ -1,0 +1,1 @@",
      "+second file added line",
    ].join("\n");
    expect(addedLines(diff)).toEqual([
      { file: "a.md", lineNumber: 1, text: "first file added line" },
      { file: "b.md", lineNumber: 1, text: "second file added line" },
    ]);
  });
});

describe("secrets: checked everywhere, including test directories", () => {
  test("bearer token prose with no real token passes", () => {
    const hits = scanEntries([{ file: "NOTES.md", lineNumber: 1, text: "a bearer token authorises the call" }], []);
    expect(hits).toEqual([]);
  });

  test("a real bearer token fails", () => {
    const hits = scanEntries([{ file: "NOTES.md", lineNumber: 1, text: `Authorization: ${fakeBearerToken}` }], []);
    expect(hits).toEqual([{ file: "NOTES.md", lineNumber: 1, label: "bearer-token" }]);
  });

  test("a NINO in a test directory passes but an AWS key there fails", () => {
    const ninoHits = scanEntries([{ file: "app/unit-tests/foo.test.js", lineNumber: 1, text: "const nino = 'AB123456C';" }], []);
    expect(ninoHits).toEqual([]);

    const awsHits = scanEntries([{ file: "app/unit-tests/foo.test.js", lineNumber: 1, text: `const key = '${fakeAwsAccessKeyId}';` }], []);
    expect(awsHits).toEqual([{ file: "app/unit-tests/foo.test.js", lineNumber: 1, label: "aws-access-key-id" }]);
  });
});

describe("personal data: checked outside test directories and /fixtures/ paths", () => {
  test("a NINO in an added Markdown line fails", () => {
    const diff = diffAdding("NOTES.md", "Customer NINO: AB123456C");
    const hits = scanDiff(diff, []);
    expect(hits).toEqual([{ file: "NOTES.md", lineNumber: 1, label: "nino" }]);
  });

  test("the same NINO in a removed line passes", () => {
    const diff = diffRemoving("NOTES.md", "Customer NINO: AB123456C");
    const hits = scanDiff(diff, []);
    expect(hits).toEqual([]);
  });

  test("a 9-digit number with no VAT/VRN keyword nearby passes", () => {
    const hits = scanEntries([{ file: "NOTES.md", lineNumber: 1, text: "order id 123456789 was created" }], []);
    expect(hits).toEqual([]);
  });

  test("the same 9-digit number near a VRN keyword fails", () => {
    const hits = scanEntries([{ file: "NOTES.md", lineNumber: 1, text: "| VRN | 123456789 |" }], []);
    expect(hits).toEqual([{ file: "NOTES.md", lineNumber: 1, label: "vrn" }]);
  });

  test("v1.2.3.4 and 192.168.1.1 both pass", () => {
    const hits = scanEntries([{ file: "NOTES.md", lineNumber: 1, text: "upgraded to v1.2.3.4, reachable at 192.168.1.1" }], []);
    expect(hits).toEqual([]);
  });

  test("a real-shaped public IPv4 fails", () => {
    const hits = scanEntries([{ file: "NOTES.md", lineNumber: 1, text: "client connected from 8.8.8.8" }], []);
    expect(hits).toEqual([{ file: "NOTES.md", lineNumber: 1, label: "public-ipv4" }]);
  });

  test("an email at example.com passes", () => {
    const hits = scanEntries([{ file: "NOTES.md", lineNumber: 1, text: "contact someone@example.com for details" }], []);
    expect(hits).toEqual([]);
  });

  test("an email at a real-shaped domain fails", () => {
    const hits = scanEntries([{ file: "NOTES.md", lineNumber: 1, text: "contact a.customer@some-real-firm.co.uk for details" }], []);
    expect(hits).toEqual([{ file: "NOTES.md", lineNumber: 1, label: "email" }]);
  });

  test("an allow-listed address passes", () => {
    const diff = diffAdding("SECURITY.md", "Report issues to admin@diyaccounting.co.uk");
    const hits = scanDiff(diff, ["admin@diyaccounting.co.uk"]);
    expect(hits).toEqual([]);
  });

  test("a regex allow-list entry exempts every matching value", () => {
    const hits = scanEntries([{ file: "NOTES.md", lineNumber: 1, text: "vrn 193054661 and 193054662" }], [/^19305466\d$/]);
    expect(hits).toEqual([]);
  });

  test("an email in the root fixtures directory passes, as it does in a nested /fixtures/ path", () => {
    const text = "<RegisteredEmailAddress>a.customer@some-real-firm.co.uk</RegisteredEmailAddress>";
    const hits = scanEntries(
      [
        { file: "fixtures/companies-house-xmlgw/Example.xml", lineNumber: 1, text },
        { file: "app/test-data/fixtures/Example.xml", lineNumber: 1, text },
      ],
      [],
    );
    expect(hits).toEqual([]);
  });

  test("one line can produce more than one hit", () => {
    const diff = diffAdding("NOTES.md", "contact a.customer@some-real-firm.co.uk nino AB123456C");
    const hits = scanDiff(diff, []);
    expect(hits.map((h) => h.label).sort()).toEqual(["email", "nino"]);
  });
});

describe("parseAllowList", () => {
  test("ignores blank lines and comments", () => {
    expect(parseAllowList("# a comment\n\nsupport@diyaccounting.co.uk\n")).toEqual(["support@diyaccounting.co.uk"]);
  });

  test("wraps a /regex/ line in a case-insensitive RegExp", () => {
    const [entry] = parseAllowList("/^ab\\d+$/");
    expect(entry).toBeInstanceOf(RegExp);
    expect(entry.test("AB123")).toBe(true);
  });
});

describe("content-scan.mjs CLI", () => {
  test("exits 0 and prints nothing when the added lines carry no hit", () => {
    const diff = diffAdding("NOTES.md", "nothing sensitive here");
    const result = runCli(diff);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("exits 1 and prints file:line label on a hit, never the matched value", () => {
    // A NINO not on the project's own default allow-list, unlike the documented-example
    // "AB123456C" the other CLI cases use, so this checks the CLI against a genuine hit.
    const diff = diffAdding("NOTES.md", "Customer NINO: AB123457C");
    const result = runCli(diff);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("NOTES.md:1 nino");
    expect(result.stdout).not.toContain("AB123457C");
  });

  test("an allow-listed value passed via --allow-list exits 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "content-scan-allow-"));
    const allowListPath = join(dir, "allow.txt");
    writeFileSync(allowListPath, "AB123456C\n");
    const diff = diffAdding("NOTES.md", "Customer NINO: AB123456C");
    const result = runCli(diff, ["--allow-list", allowListPath]);
    rmSync(dir, { recursive: true, force: true });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  test("a missing allow-list file behaves as an empty one, not an error", () => {
    const diff = diffAdding("NOTES.md", "nothing sensitive here");
    const result = runCli(diff, ["--allow-list", "/nonexistent/does-not-exist.txt"]);
    expect(result.status).toBe(0);
  });
});
