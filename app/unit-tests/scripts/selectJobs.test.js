// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/selectJobs.test.js

import { describe, test, expect } from "vitest";
import {
  parseAnswer,
  isEligibleRef,
  decideForContext,
  buildPrompt,
  SKIPPABLE_JOB_IDS,
  SKIPPABLE_JOBS,
} from "../../../scripts/ci/select-jobs.mjs";

const success = (result) => JSON.stringify({ subtype: "success", is_error: false, result });

describe("parseAnswer", () => {
  test("returns a recognised skip decision", () => {
    const raw = success(
      JSON.stringify({
        decisions: [
          { job: "mvn-test", skip: true, reason: "no Java file changed" },
          { job: "npm-test", skip: false, reason: "app code changed" },
        ],
      }),
    );
    const answer = parseAnswer(raw, SKIPPABLE_JOB_IDS);
    expect(answer.ok).toBe(true);
    expect(answer.skip).toEqual(["mvn-test"]);
    expect(answer.decisions).toEqual([
      { job: "mvn-test", skip: true, reason: "no Java file changed" },
      { job: "npm-test", skip: false, reason: "app code changed" },
    ]);
  });

  test("a malformed (non-JSON) answer runs everything", () => {
    const answer = parseAnswer("not json at all", SKIPPABLE_JOB_IDS);
    expect(answer.ok).toBe(false);
    expect(answer.skip).toEqual([]);
    expect(answer.error).toBeTruthy();
  });

  test("a well-formed envelope whose result is not JSON runs everything", () => {
    const raw = success("here is my answer: skip mvn-test");
    const answer = parseAnswer(raw, SKIPPABLE_JOB_IDS);
    expect(answer.ok).toBe(false);
    expect(answer.skip).toEqual([]);
  });

  test("a result with no decisions array runs everything", () => {
    const raw = success(JSON.stringify({ notes: "no decisions here" }));
    const answer = parseAnswer(raw, SKIPPABLE_JOB_IDS);
    expect(answer.ok).toBe(false);
    expect(answer.skip).toEqual([]);
  });

  test("a failed claude run runs everything", () => {
    const raw = JSON.stringify({ subtype: "error_max_turns", is_error: true, result: "" });
    const answer = parseAnswer(raw, SKIPPABLE_JOB_IDS);
    expect(answer.ok).toBe(false);
    expect(answer.skip).toEqual([]);
  });

  test("an unknown job name is ignored, not acted on", () => {
    const raw = success(
      JSON.stringify({
        decisions: [
          { job: "mvn-test", skip: true, reason: "no Java file changed" },
          { job: "some-job-that-does-not-exist", skip: true, reason: "fabricated" },
        ],
      }),
    );
    const answer = parseAnswer(raw, SKIPPABLE_JOB_IDS);
    expect(answer.ok).toBe(true);
    expect(answer.skip).toEqual(["mvn-test"]);
    expect(answer.decisions.map((d) => d.job)).toEqual(["mvn-test"]);
  });

  test("an entry missing a job field is ignored", () => {
    const raw = success(JSON.stringify({ decisions: [{ skip: true, reason: "no job field" }] }));
    const answer = parseAnswer(raw, SKIPPABLE_JOB_IDS);
    expect(answer.ok).toBe(true);
    expect(answer.skip).toEqual([]);
  });

  test("a result wrapped in a markdown code fence with language tag parses", () => {
    const decisions = { decisions: [{ job: "npm-test", skip: true, reason: "no JS changed" }] };
    const fenced = `\`\`\`json\n${JSON.stringify(decisions)}\n\`\`\``;
    const raw = success(fenced);
    const answer = parseAnswer(raw, SKIPPABLE_JOB_IDS);
    expect(answer.ok).toBe(true);
    expect(answer.skip).toEqual(["npm-test"]);
  });

  test("a result wrapped in a markdown code fence without language tag parses", () => {
    const decisions = { decisions: [{ job: "npm-test", skip: true, reason: "no JS changed" }] };
    const fenced = `\`\`\`\n${JSON.stringify(decisions)}\n\`\`\``;
    const raw = success(fenced);
    const answer = parseAnswer(raw, SKIPPABLE_JOB_IDS);
    expect(answer.ok).toBe(true);
    expect(answer.skip).toEqual(["npm-test"]);
  });

  test("an unfenced result still parses", () => {
    const decisions = { decisions: [{ job: "mvn-test", skip: false, reason: "Java changed" }] };
    const raw = success(JSON.stringify(decisions));
    const answer = parseAnswer(raw, SKIPPABLE_JOB_IDS);
    expect(answer.ok).toBe(true);
    expect(answer.skip).toEqual([]);
  });
});

describe("isEligibleRef", () => {
  test("main is never eligible", () => {
    expect(isEligibleRef("refs/heads/main")).toBe(false);
  });

  test("every other ref is eligible", () => {
    expect(isEligibleRef("refs/heads/claude/ltd-select-jobs")).toBe(true);
    expect(isEligibleRef("refs/heads/gh_pages")).toBe(true);
  });
});

describe("decideForContext", () => {
  test("main always runs everything, even when a claude answer says to skip something", () => {
    const raw = success(JSON.stringify({ decisions: [{ job: "mvn-test", skip: true, reason: "looks safe" }] }));
    const answer = decideForContext({ context: { ref: "refs/heads/main" }, claudeOutputRaw: raw });
    expect(answer.ok).toBe(true);
    expect(answer.skip).toEqual([]);
    expect(answer.reason).toBe("main: full run");
  });

  test("main runs everything even with no claude output at all", () => {
    const answer = decideForContext({ context: { ref: "refs/heads/main" }, claudeOutputRaw: "" });
    expect(answer.ok).toBe(true);
    expect(answer.skip).toEqual([]);
    expect(answer.reason).toBe("main: full run");
  });

  test("a non-main ref with no claude output (budget, kill switch, or a failed step) runs everything", () => {
    const answer = decideForContext({ context: { ref: "refs/heads/claude/ltd-select-jobs" }, claudeOutputRaw: "" });
    expect(answer.ok).toBe(false);
    expect(answer.skip).toEqual([]);
    expect(answer.error).toBeTruthy();
  });

  test("a non-main ref with a valid answer applies the skip decisions", () => {
    const raw = success(JSON.stringify({ decisions: [{ job: "mvn-test", skip: true, reason: "no Java file changed" }] }));
    const answer = decideForContext({ context: { ref: "refs/heads/claude/ltd-select-jobs" }, claudeOutputRaw: raw });
    expect(answer.ok).toBe(true);
    expect(answer.skip).toEqual(["mvn-test"]);
  });
});

describe("buildPrompt", () => {
  test("lists every skippable job and the changed files", () => {
    const prompt = buildPrompt({
      context: { eventName: "push", ref: "refs/heads/claude/ltd-x" },
      diff: "diff --git a/app/foo.js b/app/foo.js",
      changedFiles: ["app/foo.js"],
    });
    expect(prompt).toContain("app/foo.js");
    expect(prompt).toContain("mvn-test");
    for (const job of SKIPPABLE_JOBS) {
      expect(prompt).toContain(job.id);
    }
  });

  test("says so when there is no diff, rather than implying nothing changed", () => {
    const prompt = buildPrompt({ context: {}, diff: "", changedFiles: [] });
    expect(prompt).toContain("no diff available");
  });
});
