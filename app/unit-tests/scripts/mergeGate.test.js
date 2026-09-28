// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/mergeGate.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

import {
  OWNER_LOGIN,
  MIN_OPEN_TO_MERGE_MS,
  MIN_BODY_LENGTH,
  MAX_FILES_CHANGED,
  MAX_CHANGED_LINES,
  MAX_MERGES_PER_ROLLING_DAY,
  extractClosingIssueNumbers,
  checkAuthorship,
  checkLinkedIssueAuthorship,
  checkShapeRules,
  isMarkdownOnly,
  evaluateMergeGate,
  formatReport,
  parseArgs,
  gatherInputs,
  main,
} from "../../../scripts/merge-gate.mjs";

const NOW = new Date("2026-09-28T12:00:00.000Z");
const VALID_BODY = "Closes #401. Adds the merge-gate script and its unit tests, proven with npm run test:unit.";

function commit({ sha = "abc12345", authorLogin = OWNER_LOGIN, committerLogin = OWNER_LOGIN, email = "antony@polycode.co.uk" } = {}) {
  return {
    sha,
    author: authorLogin ? { login: authorLogin } : null,
    committer: committerLogin ? { login: committerLogin } : null,
    commit: { author: { email }, committer: { email } },
  };
}

function ownHead() {
  return { repo: { fork: false, full_name: "diy-accounting-uk/submit.diyaccounting.co.uk" } };
}

describe("extractClosingIssueNumbers", () => {
  test("reads every closing keyword form", () => {
    expect(extractClosingIssueNumbers("Closes #12. This also fixes #14 and Resolved: #16")).toEqual([12, 14, 16]);
  });

  test("de-duplicates repeated references", () => {
    expect(extractClosingIssueNumbers("Closes #12, and closes #12 again")).toEqual([12]);
  });

  test("returns an empty list when no keyword is present", () => {
    expect(extractClosingIssueNumbers("See #12 for background")).toEqual([]);
  });

  test("returns an empty list for a missing body", () => {
    expect(extractClosingIssueNumbers(undefined)).toEqual([]);
  });
});

describe("checkAuthorship", () => {
  test("passes when every commit resolves to the owner and the head is not a fork", () => {
    const result = checkAuthorship({ commits: [commit(), commit({ sha: "def67890" })], prHead: ownHead() });
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test("fails when a commit's author resolves to someone else", () => {
    const result = checkAuthorship({ commits: [commit({ authorLogin: "someone-else" })], prHead: ownHead() });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/author resolves to someone-else/);
  });

  test("fails when a commit's committer resolves to someone else", () => {
    const result = checkAuthorship({ commits: [commit({ committerLogin: "someone-else" })], prHead: ownHead() });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/committer resolves to someone-else/);
  });

  test("fails when a commit's author cannot be resolved to any GitHub account", () => {
    const result = checkAuthorship({ commits: [commit({ authorLogin: null })], prHead: ownHead() });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/no GitHub account/);
  });

  test("fails when the PR head sits in a fork", () => {
    const result = checkAuthorship({
      commits: [commit()],
      prHead: { repo: { fork: true, full_name: "someone-else/submit.diyaccounting.co.uk" } },
    });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/fork/);
  });

  test("fails closed when the PR head repository is unresolvable", () => {
    const result = checkAuthorship({ commits: [commit()], prHead: { repo: null } });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/fork or unresolvable/);
  });
});

describe("checkLinkedIssueAuthorship", () => {
  test("passes when a closed issue was raised by the owner", () => {
    const result = checkLinkedIssueAuthorship({ body: "Closes #401", issuesByNumber: { 401: { user: { login: OWNER_LOGIN } } } });
    expect(result.passed).toBe(true);
    expect(result.closingNumbers).toEqual([401]);
  });

  test("passes when the body closes nothing", () => {
    const result = checkLinkedIssueAuthorship({ body: "No linked issue here", issuesByNumber: {} });
    expect(result.passed).toBe(true);
    expect(result.closingNumbers).toEqual([]);
  });

  test("fails when a closed issue was raised by another GitHub user (P4)", () => {
    const result = checkLinkedIssueAuthorship({ body: "Closes #20", issuesByNumber: { 20: { user: { login: "JDMs4" } } } });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/JDMs4.*P4/);
  });

  test("fails closed when a closed issue could not be read", () => {
    const result = checkLinkedIssueAuthorship({ body: "Closes #99", issuesByNumber: {} });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/could not be read/);
  });
});

describe("checkShapeRules", () => {
  const baseline = {
    createdAt: new Date(NOW.getTime() - MIN_OPEN_TO_MERGE_MS - 1000).toISOString(),
    now: NOW,
    body: VALID_BODY,
    filesChanged: 3,
    additions: 10,
    deletions: 5,
    commitAuthorEmails: ["antony@polycode.co.uk", "antony@polycode.co.uk"],
    recentMergeTimestamps: [],
    atMerge: true,
  };

  test("passes a PR that clears every rule", () => {
    const result = checkShapeRules(baseline);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test("fails when the PR opened less than the minimum delay ago and atMerge is true", () => {
    const result = checkShapeRules({ ...baseline, createdAt: new Date(NOW.getTime() - 17_000).toISOString() });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/17s since the PR opened/);
  });

  test("does not fail the delay when atMerge is false, however recently the PR opened", () => {
    const result = checkShapeRules({ ...baseline, atMerge: false, createdAt: new Date(NOW.getTime() - 17_000).toISOString() });
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test("carries the delay as an info note when atMerge is false", () => {
    const result = checkShapeRules({ ...baseline, atMerge: false, createdAt: new Date(NOW.getTime() - 17_000).toISOString() });
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatch(/17s since the PR opened so far/);
    expect(result.notes[0]).toMatch(/merge-time rule, checked by \/auto-merge/);
  });

  test("defaults atMerge to false when omitted", () => {
    const { atMerge: _unused, ...withoutAtMerge } = baseline;
    const result = checkShapeRules({ ...withoutAtMerge, createdAt: new Date(NOW.getTime() - 17_000).toISOString() });
    expect(result.passed).toBe(true);
    expect(result.notes).toHaveLength(1);
  });

  test("fails when the body is empty", () => {
    const result = checkShapeRules({ ...baseline, body: "" });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes("0 characters"))).toBe(true);
  });

  test(`fails when the body is shorter than ${MIN_BODY_LENGTH} characters`, () => {
    const result = checkShapeRules({ ...baseline, body: "fix" });
    expect(result.passed).toBe(false);
  });

  test(`fails when the diff has more than ${MAX_FILES_CHANGED} files`, () => {
    const result = checkShapeRules({ ...baseline, filesChanged: MAX_FILES_CHANGED + 1 });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/ceiling/);
  });

  test(`fails when the diff has more than ${MAX_CHANGED_LINES} changed lines`, () => {
    const result = checkShapeRules({ ...baseline, additions: MAX_CHANGED_LINES, deletions: 1 });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/ceiling/);
  });

  test("fails when commits carry two different author emails", () => {
    const result = checkShapeRules({ ...baseline, commitAuthorEmails: ["antony@polycode.co.uk", "antonyccartwright@gmail.com"] });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/2 different author emails/);
  });

  test("fails when no commit author email could be resolved", () => {
    const result = checkShapeRules({ ...baseline, commitAuthorEmails: [] });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/no commit carried a resolvable author email/);
  });

  test(`fails when ${MAX_MERGES_PER_ROLLING_DAY} PRs already merged in the last 24 hours`, () => {
    const recentMergeTimestamps = Array.from({ length: MAX_MERGES_PER_ROLLING_DAY }, (_, i) =>
      new Date(NOW.getTime() - i * 60_000).toISOString(),
    );
    const result = checkShapeRules({ ...baseline, recentMergeTimestamps });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/cap of/);
  });

  test("ignores a merge timestamp older than 24 hours", () => {
    const recentMergeTimestamps = [new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString()];
    const result = checkShapeRules({ ...baseline, recentMergeTimestamps });
    expect(result.passed).toBe(true);
  });
});

describe("isMarkdownOnly", () => {
  test("true for a PR touching only .md files", () => {
    expect(isMarkdownOnly(["NEXT.md", "PLAN_REPOSITORY_AUTOMATION.md"])).toBe(true);
  });

  test("false when any file is not Markdown", () => {
    expect(isMarkdownOnly(["NEXT.md", "scripts/merge-gate.mjs"])).toBe(false);
  });

  test("false for an empty change set", () => {
    expect(isMarkdownOnly([])).toBe(false);
  });

  test("is case-insensitive on the extension", () => {
    expect(isMarkdownOnly(["README.MD"])).toBe(true);
  });
});

describe("evaluateMergeGate", () => {
  const passingInputs = {
    commits: [commit()],
    prHead: ownHead(),
    body: VALID_BODY,
    issuesByNumber: { 401: { user: { login: OWNER_LOGIN } } },
    createdAt: new Date(NOW.getTime() - MIN_OPEN_TO_MERGE_MS - 1000).toISOString(),
    now: NOW,
    filesChanged: 2,
    additions: 10,
    deletions: 2,
    commitAuthorEmails: ["antony@polycode.co.uk"],
    recentMergeTimestamps: [],
    changedPaths: ["NEXT.md"],
  };

  test("a clean Markdown-only PR passes and is enforced", () => {
    const result = evaluateMergeGate(passingInputs);
    expect(result.passed).toBe(true);
    expect(result.enforced).toBe(true);
    expect(result.blocked).toBe(false);
  });

  test("a clean code PR passes and is not enforced", () => {
    const result = evaluateMergeGate({ ...passingInputs, changedPaths: ["scripts/merge-gate.mjs"] });
    expect(result.enforced).toBe(false);
    expect(result.blocked).toBe(false);
  });

  test("a failing Markdown-only PR is blocked", () => {
    const result = evaluateMergeGate({ ...passingInputs, commits: [commit({ authorLogin: "someone-else" })] });
    expect(result.passed).toBe(false);
    expect(result.enforced).toBe(true);
    expect(result.blocked).toBe(true);
  });

  test("a failing code PR is reported but not blocked", () => {
    const result = evaluateMergeGate({
      ...passingInputs,
      changedPaths: ["scripts/merge-gate.mjs"],
      commits: [commit({ authorLogin: "someone-else" })],
    });
    expect(result.passed).toBe(false);
    expect(result.enforced).toBe(false);
    expect(result.blocked).toBe(false);
  });

  test("a freshly opened Markdown-only PR is not blocked by the delay without --at-merge", () => {
    const result = evaluateMergeGate({ ...passingInputs, createdAt: new Date(NOW.getTime() - 17_000).toISOString() });
    expect(result.passed).toBe(true);
    expect(result.blocked).toBe(false);
  });

  test("a freshly opened Markdown-only PR is blocked by the delay with --at-merge", () => {
    const result = evaluateMergeGate({ ...passingInputs, createdAt: new Date(NOW.getTime() - 17_000).toISOString(), atMerge: true });
    expect(result.passed).toBe(false);
    expect(result.blocked).toBe(true);
  });
});

describe("formatReport", () => {
  test("names the enforced scope and every threshold", () => {
    const result = evaluateMergeGate({
      commits: [commit()],
      prHead: ownHead(),
      body: VALID_BODY,
      issuesByNumber: { 401: { user: { login: OWNER_LOGIN } } },
      createdAt: new Date(NOW.getTime() - MIN_OPEN_TO_MERGE_MS - 1000).toISOString(),
      now: NOW,
      filesChanged: 1,
      additions: 1,
      deletions: 0,
      commitAuthorEmails: ["antony@polycode.co.uk"],
      recentMergeTimestamps: [],
      changedPaths: ["NEXT.md"],
    });
    const report = formatReport(result);
    expect(report).toMatch(/Markdown-only PR/);
    expect(report).toMatch(/P2 full authorship: pass/);
    expect(report).toMatch(/P4 linked-issue authorship: pass/);
    expect(report).toMatch(/P10 shape rules: pass/);
    expect(report).toMatch(new RegExp(`${MAX_MERGES_PER_ROLLING_DAY} merges per rolling 24 hours`));
  });

  test("prints the open-to-merge delay as an info line when not at merge time", () => {
    const result = evaluateMergeGate({
      commits: [commit()],
      prHead: ownHead(),
      body: VALID_BODY,
      issuesByNumber: { 401: { user: { login: OWNER_LOGIN } } },
      createdAt: new Date(NOW.getTime() - 17_000).toISOString(),
      now: NOW,
      filesChanged: 1,
      additions: 1,
      deletions: 0,
      commitAuthorEmails: ["antony@polycode.co.uk"],
      recentMergeTimestamps: [],
      changedPaths: ["NEXT.md"],
    });
    const report = formatReport(result);
    expect(report).toMatch(/P10 shape rules: pass/);
    expect(report).toMatch(/info: 17s since the PR opened so far/);
  });
});

describe("parseArgs", () => {
  test("reads --repo and --pr-number, defaulting atMerge to false", () => {
    expect(parseArgs(["--repo", "diy-accounting-uk/submit.diyaccounting.co.uk", "--pr-number", "402"])).toEqual({
      repo: "diy-accounting-uk/submit.diyaccounting.co.uk",
      prNumber: "402",
      atMerge: false,
    });
  });

  test("reads --at-merge as a flag with no value", () => {
    const opts = parseArgs(["--repo", "o/r", "--pr-number", "402", "--at-merge"]);
    expect(opts.atMerge).toBe(true);
  });

  test("rejects an unknown flag", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/);
  });
});

describe("gatherInputs", () => {
  test("assembles every field evaluateMergeGate needs, and fails an issue read closed", async () => {
    const fetchJson = vi.fn((path) => {
      if (path === "repos/o/r/pulls/402") {
        return {
          number: 402,
          body: "Closes #401 and closes #999",
          head: { repo: { fork: false, full_name: "o/r" } },
          created_at: "2026-09-28T11:00:00.000Z",
          changed_files: 2,
          additions: 10,
          deletions: 3,
        };
      }
      if (path === "repos/o/r/issues/401") {
        return { user: { login: OWNER_LOGIN } };
      }
      if (path === "repos/o/r/issues/999") {
        throw new Error("not found");
      }
      if (path.startsWith("repos/o/r/pulls?state=closed")) {
        return [
          { number: 300, merged_at: "2026-09-28T10:00:00.000Z" },
          { number: 402, merged_at: null },
        ];
      }
      throw new Error(`unexpected fetchJson path: ${path}`);
    });
    const fetchPaginated = vi.fn((path) => {
      if (path === "repos/o/r/pulls/402/commits") {
        return [commit()];
      }
      if (path === "repos/o/r/pulls/402/files") {
        return [{ filename: "NEXT.md" }];
      }
      throw new Error(`unexpected fetchPaginated path: ${path}`);
    });

    const inputs = await gatherInputs({ repo: "o/r", prNumber: 402 }, { fetchJson, fetchPaginated });

    expect(inputs.changedPaths).toEqual(["NEXT.md"]);
    expect(inputs.issuesByNumber[401].user.login).toBe(OWNER_LOGIN);
    expect(inputs.issuesByNumber[999]).toBeUndefined();
    expect(inputs.recentMergeTimestamps).toEqual(["2026-09-28T10:00:00.000Z"]);
    expect(inputs.commitAuthorEmails).toEqual(["antony@polycode.co.uk"]);
  });
});

describe("main", () => {
  test("reports missing arguments as blocked", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await main([]);
    expect(result.blocked).toBe(true);
    logSpy.mockRestore();
  });

  test("gathers inputs and returns the evaluated result", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const gather = vi.fn(async () => ({
      commits: [commit()],
      prHead: ownHead(),
      body: VALID_BODY,
      issuesByNumber: { 401: { user: { login: OWNER_LOGIN } } },
      createdAt: new Date(NOW.getTime() - MIN_OPEN_TO_MERGE_MS - 1000).toISOString(),
      now: NOW,
      filesChanged: 1,
      additions: 1,
      deletions: 0,
      commitAuthorEmails: ["antony@polycode.co.uk"],
      recentMergeTimestamps: [],
      changedPaths: ["NEXT.md"],
    }));
    const result = await main(["--repo", "o/r", "--pr-number", "402"], { gather });
    expect(gather).toHaveBeenCalledWith({ repo: "o/r", prNumber: "402" });
    expect(result.passed).toBe(true);
    logSpy.mockRestore();
  });

  test("passes --at-merge through to the delay check", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const gather = vi.fn(async () => ({
      commits: [commit()],
      prHead: ownHead(),
      body: VALID_BODY,
      issuesByNumber: { 401: { user: { login: OWNER_LOGIN } } },
      createdAt: new Date(NOW.getTime() - 17_000).toISOString(),
      now: NOW,
      filesChanged: 1,
      additions: 1,
      deletions: 0,
      commitAuthorEmails: ["antony@polycode.co.uk"],
      recentMergeTimestamps: [],
      changedPaths: ["NEXT.md"],
    }));

    const withoutFlag = await main(["--repo", "o/r", "--pr-number", "402"], { gather });
    expect(withoutFlag.passed).toBe(true);

    const withFlag = await main(["--repo", "o/r", "--pr-number", "402", "--at-merge"], { gather });
    expect(withFlag.passed).toBe(false);
    expect(withFlag.blocked).toBe(true);

    logSpy.mockRestore();
  });
});
