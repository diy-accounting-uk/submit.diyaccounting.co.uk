// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/secretScan.test.js

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyClasses,
  assertReportPath,
  dropIgnored,
  parseIgnoreFile,
  renderReport,
  shapeGitleaks,
  shapeTrufflehogLine,
} from "../../../scripts/lib/secret-scan-report.mjs";
import { main } from "../../../scripts/secret-scan.mjs";

// Built at run time so that no scanner reads a key-shaped literal in this file.
const fakeKey = ["ghp", "_", "x7Kq9Zm2Lp4Rt8Vw1Yb3", "Nc5Hd6Jf0Sg2Xa4Q9z"].join("");
const valueFields = ["Secret", "Match", "Raw", "RawV2", "Redacted"];

function toolsInstalled() {
  try {
    execFileSync("gitleaks", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("secret-scan report shaping", () => {
  const gitleaksRecord = {
    RuleID: "github-pat",
    File: "src/config.js",
    StartLine: 12,
    Commit: "abcdef0123456789",
    Entropy: 4.123456,
    Fingerprint: "abcdef0123456789:src/config.js:github-pat:12",
    Secret: fakeKey,
    Match: `token = ${fakeKey}`,
    Author: "Someone",
  };

  test("a gitleaks record keeps place fields and drops every value field", () => {
    const [finding] = shapeGitleaks([gitleaksRecord], { repository: "r", source: "history" });
    expect(finding).toMatchObject({
      rule: "github-pat",
      path: "src/config.js",
      line: 12,
      entropy: 4.12,
      repository: "r",
      detector: "gitleaks",
    });
    for (const field of valueFields) expect(finding).not.toHaveProperty(field);
    expect(JSON.stringify(finding)).not.toContain(fakeKey);
  });

  test("a trufflehog line keeps place fields and drops Raw, RawV2 and Redacted", () => {
    const line = JSON.stringify({
      DetectorName: "Github",
      Raw: fakeKey,
      RawV2: fakeKey,
      Redacted: "ghp_x7Kq",
      SourceMetadata: { Data: { Git: { commit: "c0ffee", file: "a/b.js", line: 3 } } },
    });
    const finding = shapeTrufflehogLine(line, { repository: "r" });
    expect(finding).toMatchObject({ rule: "Github", commit: "c0ffee", path: "a/b.js", line: 3 });
    expect(JSON.stringify(finding)).not.toContain(fakeKey);
    expect(JSON.stringify(finding)).not.toContain("ghp_x7Kq");
  });

  test("a line that is not a finding shapes to null", () => {
    expect(shapeTrufflehogLine("not json", { repository: "r" })).toBeNull();
    expect(shapeTrufflehogLine("{}", { repository: "r" })).toBeNull();
  });

  test("ignore entries drop findings by fingerprint and skip comments", () => {
    const ignored = parseIgnoreFile("# note\n\nfp-1\n");
    const kept = dropIgnored([{ fingerprint: "fp-1" }, { fingerprint: "fp-2" }], ignored);
    expect(kept).toEqual([{ fingerprint: "fp-2" }]);
  });

  test("the report lists counts, classes and proposed ignores without a value", () => {
    const [shaped] = shapeGitleaks([gitleaksRecord], { repository: "r", source: "history" });
    const [classified] = applyClasses([{ ...shaped, ref: "main" }], {
      [shaped.fingerprint]: { class: "test fixture", note: "sits under a tests folder" },
    });
    const text = renderReport({
      date: "2000-01-01",
      findings: [classified],
      coverage: [{ repository: "r", refs: 2, worktrees: 1, uncommittedFiles: 0, history: "all", trufflehog: "skipped" }],
      proposedIgnores: new Map([["r", [classified.fingerprint]]]),
    });
    expect(text).toContain("| test fixture | 1 |");
    expect(text).toContain("src/config.js:12");
    expect(text).toContain(classified.fingerprint);
    expect(text).not.toContain(fakeKey);
  });

  test("the report path must sit inside the private security folder", () => {
    expect(() => assertReportPath("/tmp/report.md")).toThrow();
    expect(() => assertReportPath("/w/private.diyaccounting.co.uk/security/../x.md")).toThrow();
    expect(assertReportPath("/w/private.diyaccounting.co.uk/security/SCAN.md")).toContain("security");
  });
});

describe.skipIf(!toolsInstalled())("secret-scan against a fixture repository", () => {
  let workspace;

  beforeAll(() => {
    workspace = mkdtempSync(join(tmpdir(), "secret-scan-fixture-"));
    const repo = join(workspace, "fixture-repo");
    mkdirSync(repo);
    mkdirSync(join(workspace, "private.diyaccounting.co.uk", "security"), { recursive: true });
    const git = (...args) => execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
    git("init", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    writeFileSync(join(repo, "settings.js"), `export const token = "${fakeKey}";\n`);
    git("add", ".");
    git("commit", "-m", "add settings");
    writeFileSync(join(repo, "settings.js"), "export const token = process.env.TOKEN;\n");
    git("commit", "-am", "remove key");
    writeFileSync(join(repo, "untracked.js"), `export const other = "${fakeKey}";\n`);
  });

  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  test("history and uncommitted findings reach the report with no value", async () => {
    const report = join(workspace, "private.diyaccounting.co.uk", "security", "SCAN.md");
    const scratch = join(workspace, "scratch");
    await main(["--workspace", workspace, "--report", report, "--repos", "fixture-repo", "--skip-trufflehog", "--scratch", scratch]);
    const text = readFileSync(report, "utf8");
    const json = readFileSync(join(scratch, "findings.json"), "utf8");
    expect(existsSync(report)).toBe(true);
    expect(text).toContain("settings.js:1");
    expect(text).toContain("untracked.js:1");
    expect(text).toContain("main");
    expect(text).not.toContain(fakeKey);
    expect(json).not.toContain(fakeKey);
  }, 60000);

  test("a report path outside the private folder is refused", async () => {
    await expect(main(["--workspace", workspace, "--report", join(workspace, "out.md"), "--repos", "fixture-repo"])).rejects.toThrow();
  });
});
