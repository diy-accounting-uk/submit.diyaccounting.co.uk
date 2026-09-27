// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/actions/waitForCiDeploys.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

// wait-for-ci-deploys.mjs reads these from process.env once, at import time.
process.env.GH_TOKEN = "test-token";
process.env.GITHUB_REPOSITORY = "diy-accounting-uk/submit.diyaccounting.co.uk";
process.env.CURRENT_RUN_ID = "1";

const { blockedOnlyByDestroyCiCallerJobs, olderUnfinishedRuns } =
  await import("../../../.github/actions/wait-for-ci-deploys/wait-for-ci-deploys.mjs");

function run(overrides) {
  return {
    id: 1,
    name: "deploy.yml",
    head_branch: "claude/example",
    status: "in_progress",
    created_at: "2026-09-27T06:53:00Z",
    ...overrides,
  };
}

describe("blockedOnlyByDestroyCiCallerJobs", () => {
  test("is false with no jobs", () => {
    expect(blockedOnlyByDestroyCiCallerJobs([])).toBe(false);
  });

  test("is false when a real job is still unfinished alongside the sweep call", () => {
    expect(
      blockedOnlyByDestroyCiCallerJobs([
        { name: "mvn-package", status: "in_progress" },
        { name: "sweep ci for a stale set", status: "queued" },
      ]),
    ).toBe(false);
  });

  test("is true when the only unfinished job is the destroy-ci caller", () => {
    expect(
      blockedOnlyByDestroyCiCallerJobs([
        { name: "mvn-package", status: "completed" },
        { name: "sweep ci for a stale set", status: "queued" },
      ]),
    ).toBe(true);
  });

  test("ignores an unrelated job name even when it is the only unfinished one", () => {
    expect(blockedOnlyByDestroyCiCallerJobs([{ name: "some-other-job", status: "queued" }])).toBe(false);
  });

  test("is false once every job has completed", () => {
    expect(
      blockedOnlyByDestroyCiCallerJobs([
        { name: "mvn-package", status: "completed" },
        { name: "sweep ci for a stale set", status: "completed" },
      ]),
    ).toBe(false);
  });
});

describe("olderUnfinishedRuns", () => {
  const currentCreatedAt = "2026-09-27T06:56:00Z";
  const currentId = "999";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // The deadlock this guards against: a destroy-ci.yml run holding the `destroy-ci`
  // concurrency group waits here for an older deploy.yml run whose only remaining job is a
  // queued call into destroy-ci.yml - which cannot start until that same group frees.
  test("excludes an older run whose only unfinished job is the destroy-ci sweep call", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [
          { name: "mvn-package", status: "completed" },
          { name: "sweep ci for a stale set", status: "queued" },
        ],
      }),
    });

    const runs = [run({ id: 1 })];
    const result = await olderUnfinishedRuns(runs, currentCreatedAt, currentId);
    expect(result).toEqual([]);
  });

  test("still waits for an older run doing real work", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [{ name: "mvn-package", status: "in_progress" }],
      }),
    });

    const runs = [run({ id: 2 })];
    const result = await olderUnfinishedRuns(runs, currentCreatedAt, currentId);
    expect(result).toEqual(["deploy.yml#2 (claude/example, created 2026-09-27T06:53:00Z)"]);
  });

  test("excludes main, self and newer runs without fetching their jobs", async () => {
    global.fetch = vi.fn();
    const runs = [
      run({ id: currentId, head_branch: "main" }),
      run({ id: currentId }),
      run({ id: 3, created_at: "2026-09-27T07:00:00Z" }),
      run({ id: 4, status: "completed" }),
    ];
    const result = await olderUnfinishedRuns(runs, currentCreatedAt, currentId);
    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
